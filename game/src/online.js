// roychec — CYCLE W1 (design/spec-pvp-online.md §10) : matchmaking & handshake PvP en ligne.
// Module isolé qui encapsule toute la couche Realtime Supabase. Réutilise le client
// Supabase de account.js (getSupabaseClient) — une seule instance dans tout le projet.
// 
// ISOLATION : online.js est le SEUL module qui connaît Realtime Broadcast et Presence.
// Le reste du jeu ne voit qu'un objet d'état plat (getOnline()) et une API de fonctions.
// DÉGRADATION GRACIEUSE : si le client Supabase est null (CDN injoignable), toutes les
// fonctions échouent proprement avec un message d'erreur, jamais un crash.

// ---------------------------------------------------------------------------
// État interne (lu par getOnline(), muté uniquement par ce module)
// ---------------------------------------------------------------------------
const online = {
  status: 'idle',        // idle | searching | private_create | private_join | matched | ready | playing | disconnected | error
  supabase: null,
  channel: null,
  matchId: null,
  side: null,            // 0 = créateur / Joueur 1 (Bleu, trait), 1 = rejoignant / Joueur 2 (Corail)
  oppPseudo: null,
  oppTrophies: null,
  band: 100,             // bande de trophées courante pour le matchmaking
  cadence: 300,          // temps initial par joueur (s) — choisi avant recherche/privé, confirmé par le serveur
  variant: 'pvp_standard', // variante (GDD §7.2) — privé : le créateur impose, le rejoignant hérite ; public : TOUJOURS standard
  searchStart: 0,        // timestamp de début de recherche
  privateCode: null,     // code de partie privée (créateur)
  error: null,           // message d'erreur utilisateur (dégradation gracieuse)
  _pollTimer: null,      // timer de polling matchmaking
  _handshakeTimer: null, // timer de timeout handshake (10 s)
  _presenceKey: null,    // clé Presence (pour le leave)
  _readyFired: false,    // anti-double appel du callback ready
  _pollFails: 0,         // échecs RPC consécutifs de pvp_find_match (visibilité serveur KO)
  _oppSeen: false,       // l'adversaire a-t-il été VU présent au moins une fois (anti faux positif Presence)
  _dcTimer: null,        // timer de debounce déconnexion (adversaire absent > 3 s continues)
  // --- CYCLE W2 : synchro des coups (lockstep) ---
  seq: 0,                // n° d'action monotone partagé du match (§5.6) — avancé à l'envoi ET à l'application
  inbox: [],             // actions entrantes en attente d'application, triées par seq (§5.6 file d'application)
  // --- CYCLE W3 : robustesse (déconnexion / reconnexion / resync) ---
  oppGone: false,        // en partie : l'adversaire est-il actuellement absent (fenêtre 30 s ouverte) ?
  _resyncSent: false,    // anti-spam de la demande de resync au (re)subscribe
  _awaitingResync: false,// j'ai demandé un resync → je suis autorisé à APPLIQUER le snapshot reçu
};

// Callbacks externes (posés par main.js).
const callbacks = {};

/** Lit l'état online pour le rendu (réf. vivante, jamais mutée de l'extérieur). */
export function getOnline() { return online; }

/** Enregistre un callback. Événements W1/W2 : 'matched', 'ready', 'disconnected',
 *  'error', 'control'. Événements W3 : 'oppLeft' (adversaire disparu EN PARTIE),
 *  'oppReturned' (revenu en partie), 'resync' (snapshot reçu), 'resyncReq' (l'adversaire
 *  demande mon état), 'rematch' (proposition/acceptation de revanche). */
export function on(event, cb) { callbacks[event] = cb; }

// ---------------------------------------------------------------------------
// API publique
// ---------------------------------------------------------------------------

/** Initialise le module avec le client Supabase partagé (getSupabaseClient). */
export function initOnline(client) {
  if (!client) { online.error = 'Service en ligne indisponible.'; online.status = 'error'; return; }
  online.supabase = client;
  online.status = 'idle';
  online.error = null;
}

/** Nettoie tout (timer, canal, Presence) — appelé au retour menu. */
export function leave() {
  clearPoll();
  clearHandshake();
  clearDcTimer();
  if (online.channel) {
    try { online.channel.unsubscribe(); } catch (_) { /* ignore */ }
    online.channel = null;
  }
  online.status = 'idle';
  online.matchId = null;
  online.side = null;
  online.oppPseudo = null;
  online.oppTrophies = null;
  online.privateCode = null;
  online.band = 100;
  online.cadence = 300;
  online.variant = 'pvp_standard';
  online.error = null;
  online._readyFired = false;
  online._pollFails = 0;
  online._oppSeen = false;
  online.seq = 0;
  online.inbox = [];
  online.oppGone = false;
  online._resyncSent = false;
  online._awaitingResync = false;
}

// ---------------------------------------------------------------------------
// Matchmaking public (file FIFO, bande de trophées élargissante)
// ---------------------------------------------------------------------------

/** Lance la recherche d'un adversaire (file publique). Appelle pvp_find_match toutes les 2 s.
 *  cadence = temps initial par joueur (s) — seuls deux joueurs de MÊME cadence s'apparient.
 *  Phase A.5 v2 — taille du plateau (GDD §7.2 v3.5). Par défaut 'std' (8×8). Pour le l15,
 *  disposer d'un SECOND joueur l15 dans la file ralentit l'appariement (volontaire), mais
 *  c'est conforme au GDD qui interdit de mélanger les tailles en pleine partie cross-client.
 *  Le file publique reste TOUJOURS elo-pondérée : variante forcée 'pvp_standard'. */
export function findMatch(cadence = 300, _variant = 'pvp_standard', taille = 'std') {
  if (!online.supabase) { online.error = 'Pas de connexion au service.'; online.status = 'error'; return; }
  leave(); // nettoie un éventuel canal/timer précédent (remet aussi cadence à 300 et taille à 'std')
  online.cadence = cadence | 0 || 300;
  online.variant = 'pvp_standard'; // file publique = TOUJOURS Standard × Standard (GDD §7.2 v3.1)
  online.taille = taille || 'std'; // Phase A.5 v2 — stocke pour transmission à pollMatchmaking.
  online.status = 'searching';
  online.searchStart = Date.now();
  online.band = 100;
  online._pollFails = 0;
  online.error = null;
  // Premier poll immédiat : sans ça, rien ne se passe pendant les 2 premières secondes
  // (le créateur du match doit s'insérer dans la file au plus vite).
  pollMatchmaking();
}

/** Annule la recherche en cours (retour menu). */
export function cancelWait() {
  clearPoll();
  if (online.supabase && online.status === 'searching') {
    // fire-and-forget : le builder .rpc() de supabase-js v2 est un thenable SANS .catch —
    // appeler .catch() dessus lève une TypeError SYNCHRONE qui tuerait le handler de clic.
    // On l'enveloppe dans Promise.resolve(...) pour avoir un vrai rejet capturable.
    Promise.resolve(online.supabase.rpc('pvp_cancel_wait')).then(() => {}, () => {});
  }
  online.status = 'idle';
}

// ---------------------------------------------------------------------------
// Partie privée (code d'invitation ami)
// ---------------------------------------------------------------------------

/** Crée une partie privée, renvoie le code à 6 caractères. La cadence, la variante
 *  (GDD §7.2 v3.1 — « Jouer avec un ami » uniquement) ET la taille (GDD §7.2 v3.5) choisies
 *  par le créateur sont stockées serveur et transmises au rejoignant par pvp_join_code. */
export async function createPrivate(cadence = 300, variant = 'pvp_standard', taille = 'std') {
  if (!online.supabase) { online.error = 'Pas de connexion au service.'; online.status = 'error'; return null; }
  leave();
  online.cadence = cadence | 0 || 300;
  online.variant = variant || 'pvp_standard';
  online.taille = taille || 'std'; // Phase A.5 v2 — créateur impose la taille, l15 autorisé en privé
  online.status = 'private_create';
  try {
    // Phase A.5 v2 Phase 5.A — conditionnel (cf. code-reviewer RECHECK) : p_taille
    // envoye UNIQUEMENT si l15. Privé+std continue d'utiliser l'ancien RPC 2-args.
    const privParams = { p_cadence: online.cadence, p_variant: online.variant };
    if (online.taille && online.taille !== 'std') privParams.p_taille = online.taille;
    const { data, error } = await online.supabase.rpc('pvp_create_private', privParams);
    // PostgREST sérialise un RETURNS TABLE en TABLEAU de lignes → on prend la 1re.
    const row = Array.isArray(data) ? data[0] : data;
    if (!row || !row.match_id) throw new Error('empty_result');
    online.matchId = row.match_id;
    online.privateCode = row.code;
    online.side = 0;
    if (row.taille) online.taille = row.taille; // Phase A.5 v2 — confirmation taille côté créateur
    // Rejoint immédiatement le canal pour attendre l'adversaire (pas de timeout).
    demarrerHandshake(true);
    return row.code;
  } catch (e) {
    console.warn('[online] createPrivate', e);
    online.error = 'Impossible de créer la partie privée.';
    online.status = 'error';
    return null;
  }
}

/** Rejoint une partie privée par code. */
export async function joinByCode(code) {
  if (!online.supabase) { online.error = 'Pas de connexion au service.'; online.status = 'error'; return false; }
  leave();
  online.status = 'private_join';
  try {
    const { data, error } = await online.supabase.rpc('pvp_join_code', { p_code: code.toUpperCase() });
    if (error) throw error;
    // RETURNS TABLE → tableau de lignes. 0 ligne = code introuvable (traité en catch).
    const row = Array.isArray(data) ? data[0] : data;
    if (!row || !row.match_id) throw new Error('match_not_found');
    // match_id, side=1 (rejoignant), opp_pseudo, opp_trophies
    online.matchId = row.match_id;
    online.side = 1;
    online.oppPseudo = row.opp_pseudo;
    online.oppTrophies = row.opp_trophies;
    // Cadence + variante + taille choisies par le CRÉATEUR (le rejoignant ne choisit pas) —
    // serveur autoritaire (GDD §7.2 v3.1/3.5). Taille suit le même canal depuis Phase A.5 v2.
    if (row.cadence) online.cadence = row.cadence;
    if (row.variant) online.variant = row.variant;
    if (row.taille) online.taille = row.taille;
    // Le match est déjà 'ready' — on passe direct au handshake.
    return demarrerHandshake();
  } catch (e) {
    console.warn('[online] joinByCode', e);
    online.error = e && e.message === 'match_not_found' 
      ? 'Code invalide ou partie expirée.' 
      : 'Impossible de rejoindre la partie.';
    online.status = 'error';
    return false;
  }
}

// ---------------------------------------------------------------------------
// Interne — polling matchmaking (appelé toutes les 2 s)
// ---------------------------------------------------------------------------

function schedulePoll() {
  clearPoll();
  online._pollTimer = setTimeout(() => pollMatchmaking(), 2000);
}

function clearPoll() {
  if (online._pollTimer) { clearTimeout(online._pollTimer); online._pollTimer = null; }
}

async function pollMatchmaking() {
  if (!online.supabase || !['searching', 'private_create'].includes(online.status)) return;

  // Bande élargissante (spec §4.1) : ±100 → ±250 → ±600 → ±∞
  const elapsed = (Date.now() - online.searchStart) / 1000;
  if (elapsed > 20) online.band = 99999;          // ±∞ = n'importe qui
  else if (elapsed > 10) online.band = 600;
  else if (elapsed > 5) online.band = 250;
  else online.band = 100;

  try {
    // Phase A.5 v2 Phase 5.A — `p_taille` envoyé UNIQUEMENT si l15. En std, on
    // retombe sur l'ancien RPC legacy (pas d'arg p_taille) : ça marche que
    // schema-pvp-taille.sql soit deploye sur Supabase OU PAS (defensive rollout).
    // Si schema PAS deploye : std marchait deja, l15 tombait deja (rien ne change pour
    // les matchs std en cours de partie). Si schema deploye : RPC accepte p_taille, on
    // fait la passe. Graceful degradation sans casser la prod.
    const findParams = { p_band: online.band, p_cadence: online.cadence };
    if (online.taille && online.taille !== 'std') findParams.p_taille = online.taille;
    const { data, error } = await online.supabase.rpc('pvp_find_match', findParams);
    if (error) {
      // Erreur RPC renvoyée par le serveur (RPC absent, profile_not_found, permission…).
      // On NE STOPPE PAS le polling (ça peut être transitoire), mais après 3 échecs
      // consécutifs on rend la panne VISIBLE à l'utilisateur (sinon « il ne se passe rien »).
      registerPollFailure(error);
      schedulePoll();
      return;
    }
    // Succès RPC (data reçue) : on réinitialise le compteur d'échecs et on efface le
    // message d'erreur serveur éventuellement affiché.
    resetPollFailure();
    // RETURNS TABLE → PostgREST renvoie un TABLEAU de lignes ; 0 ligne = rien trouvé.
    const row = Array.isArray(data) ? data[0] : data;
    if (!row || !row.match_id) { schedulePoll(); return; }

    online.matchId = row.match_id;

    if (row.status === 'ready') {
      // Match trouvé !
      clearPoll();
      online.side = row.side;
      online.oppPseudo = row.opp_pseudo;
      online.oppTrophies = row.opp_trophies;
      if (row.cadence) online.cadence = row.cadence; // confirmation serveur (mêmes valeurs des 2 côtés)
      if (row.taille) online.taille = row.taille;    // Phase A.5 v2 — taille confirmée par le serveur
      online.status = 'matched';
      if (callbacks.matched) callbacks.matched();
      // Lancer le handshake.
      demarrerHandshake();
    } else if (row.status === 'waiting') {
      // Toujours en attente (créateur qui n'a pas encore été rejoint).
      if (online.side === null) online.side = row.side || 0;
      schedulePoll();
    } else {
      schedulePoll();
    }
  } catch (e) {
    // Exception réseau/inattendue (rare : supabase-js renvoie généralement {error}).
    // Même traitement : visibilité après 3 échecs, sans arrêter le polling.
    registerPollFailure(e);
    schedulePoll(); // continue le polling malgré l'erreur réseau
  }
}

// Compte un échec de poll. Après 3 consécutifs, expose un message utilisateur clair
// dans online.error (synchronisé vers state.matchmaking.error par la loop de main.js)
// SANS interrompre le polling — la recherche continue et se rétablit d'elle-même si
// le serveur répond de nouveau (voir resetPollFailure).
function registerPollFailure(err) {
  online._pollFails++;
  const detail = (err && (err.message || err.code || err.hint)) || 'sans détail';
  console.warn('[online] pvp_find_match échec', online._pollFails, detail);
  if (online._pollFails >= 3) {
    online.error = `Le serveur de jeu ne répond pas (${detail}). Nouvelle tentative…`;
  }
}

// Un poll réussi remet le compteur à zéro et efface le message d'erreur serveur.
function resetPollFailure() {
  if (online._pollFails !== 0) online._pollFails = 0;
  if (online.error) online.error = null;
}

// ---------------------------------------------------------------------------
// Interne — canal Realtime + handshake hello/ready
// ---------------------------------------------------------------------------

function demarrerHandshake(isPrivate = false) {
  if (!online.matchId) return false;
  const channelName = `match:${online.matchId}`;
  online._readyFired = false;
  online._oppSeen = false;
  clearDcTimer();

  try {
    // Clé Presence FIXÉE à mon side (0 ou 1) : sans clé explicite, realtime-js peut
    // regrouper les deux clients sous une même clé (metas fusionnées) → presenceState
    // n'aurait qu'UNE entrée même à deux connectés → faux « déconnecté ». Avec une clé
    // par side, chaque joueur a sa propre entrée et on compte les SIDES réellement présents.
    online.channel = online.supabase.channel(channelName, {
      config: { broadcast: { self: false }, presence: { key: String(online.side) } },
    });

    // Réception des messages Broadcast.
    online.channel.on('broadcast', { event: 'action' }, (payload) => {
      const msg = payload.payload;
      if (msg.kind === 'hello') {
        // L'adversaire dit bonjour — répondre ready (que le timer existe ou non).
        envoyerMessage({ kind: 'hello', side: online.side });
        clearHandshake();
        envoyerMessage({ kind: 'ready', side: online.side });
        if (!online._readyFired) {
          online._readyFired = true;
          online.status = 'ready';
          if (callbacks.ready) callbacks.ready();
        }
      } else if (msg.kind === 'ready') {
        if (!online._readyFired && (online.status === 'ready' || online.status === 'matched' || online.status === 'private_create' || online.status === 'private_join')) {
          clearHandshake();
          online._readyFired = true;
          online.status = 'ready';
          if (callbacks.ready) callbacks.ready();
        }
      } else if (msg.kind === 'move' || msg.kind === 'purchase' || msg.kind === 'power' || msg.kind === 'endchain') {
        // CYCLE W2 : action de jeu ordonnée par seq → file d'application (§5.6).
        // Consommée par main.js dans loop() via takeNextAction() (miroir du coup IA).
        enqueueInbox(msg);
      } else if (msg.kind === 'resign' || msg.kind === 'flag') {
        // Messages de contrôle terminaux (abandon / chute de drapeau) : hors file seq,
        // livrés immédiatement. En partie → callback control ; en matchmaking → ancien
        // comportement (l'adversaire a quitté avant la partie).
        if (online.status === 'playing') {
          if (callbacks.control) callbacks.control(msg);
        } else {
          online.status = 'disconnected';
          online.error = 'L\'adversaire a abandonné.';
          if (callbacks.disconnected) callbacks.disconnected();
        }
      } else if (msg.kind === 'resync_req') {
        // CYCLE W3 (§7.3) : l'adversaire demande mon état complet (reconnexion ou seq
        // manquant). main.js construit un snapshot et le renvoie via sendResync().
        if (online.status === 'playing' && callbacks.resyncReq) callbacks.resyncReq(msg);
      } else if (msg.kind === 'resync') {
        // CYCLE W3 (§7.3) : snapshot complet reçu → main.js reconstruit l'état et reprend.
        // AUTORITÉ DÉTERMINISTE : on n'APPLIQUE un snapshot que si on l'a demandé
        // (_awaitingResync). Le survivant qui émet proactivement n'applique donc jamais
        // en retour → pas d'échange d'états divergents.
        if (online.status === 'playing' && online._awaitingResync && callbacks.resync) {
          online._awaitingResync = false;
          callbacks.resync(msg);
        }
      } else if (msg.kind === 'rematch') {
        // CYCLE W3 (§9.4) : proposition / acceptation de revanche (canal encore ouvert).
        if (callbacks.rematch) callbacks.rematch(msg);
      }
    });

    // Presence : détecte les VRAIES déconnexions sans faux positif.
    //  - On ne compte PAS le nombre brut de clés (fragile), on regarde si le SIDE
    //    adverse est présent dans presenceState (via oppPresent()).
    //  - Les syncs arrivent dans le désordre chez les 2 clients (A se voit seul avant
    //    l'arrivée de B) : on ne déclare une déconnexion QUE si l'adversaire a d'abord
    //    été VU présent (_oppSeen), PUIS reste absent > 3 s continues (debounce annulé
    //    dès qu'un sync le remontre). Vaut aussi en partie ('playing').
    online.channel.on('presence', { event: 'sync' }, () => {
      const st = online.status;
      // --- EN PARTIE (§7.2/§7.3) : on NE bascule PAS online.status → l'horloge et le
      // lockstep continuent. On signale oppLeft/oppReturned ; main.js ouvre la fenêtre
      // de reconnexion 30 s (bannière) puis tranche par abandon si l'adversaire ne
      // revient pas. Le retour déclenche un resync snapshot côté survivant. ---
      if (st === 'playing') {
        if (oppPresent()) {
          online._oppSeen = true;
          clearDcTimer();
          if (online.oppGone) {           // il était parti → il revient
            online.oppGone = false;
            if (callbacks.oppReturned) callbacks.oppReturned();
          }
        } else if (online._oppSeen && !online.oppGone && !online._dcTimer) {
          online._dcTimer = setTimeout(() => {
            online._dcTimer = null;
            if (!oppPresent() && online.status === 'playing') {
              online.oppGone = true;
              if (callbacks.oppLeft) callbacks.oppLeft();
            }
          }, 3000);
        }
        return;
      }
      // --- AVANT LA PARTIE (matched/ready) : une disparition = adversaire fantôme. ---
      if (!['matched', 'ready'].includes(st)) return;
      if (oppPresent()) {
        online._oppSeen = true;
        clearDcTimer();               // adversaire (re)vu → annule un drop en attente
      } else if (online._oppSeen && !online._dcTimer) {
        // Adversaire déjà vu puis disparu → arme le debounce (pas de coupure immédiate).
        online._dcTimer = setTimeout(() => {
          online._dcTimer = null;
          if (!oppPresent() && ['matched', 'ready'].includes(online.status)) {
            online.status = 'disconnected';
            online.error = 'Adversaire déconnecté.';
            if (callbacks.disconnected) callbacks.disconnected();
          }
        }, 3000);
      }
    });

    // Abonnement au canal. Le callback est rappelé à CHAQUE (re)connexion du socket
    // (supabase-js re-subscribe automatiquement le canal après une coupure réseau).
    online.channel.subscribe(async (status) => {
      if (status === 'SUBSCRIBED') {
        // RECONNEXION EN PARTIE (§7.3) : le canal se rouvre alors qu'on jouait déjà.
        // On re-tracke la présence et on demande un resync complet à l'adversaire
        // (on a pu manquer un coup pendant la coupure). Pas de hello/handshake.
        if (online.status === 'playing') {
          await online.channel.track({ side: online.side, ts: Date.now() });
          requestResync();
          return;
        }
        // Canal ouvert : envoyer hello et tracker la présence.
        envoyerMessage({ kind: 'hello', side: online.side });
        await online.channel.track({ side: online.side, ts: Date.now() });

        // Timeout handshake : 10s pour public, pas de timeout pour privé.
        if (!isPrivate) {
          clearHandshake();
          online._handshakeTimer = setTimeout(() => {
            if (online.status === 'matched') {
              online.error = 'L\'adversaire n\'a pas répondu.';
              online.status = 'error';
              if (callbacks.error) callbacks.error();
            }
          }, 10000);
        }
      }
    });

    return true;
  } catch (e) {
    console.warn('[online] demarrerHandshake', e);
    online.error = 'Impossible de se connecter au match.';
    online.status = 'error';
    return false;
  }
}

function envoyerMessage(payload) {
  if (!online.channel) return;
  try {
    online.channel.send({ type: 'broadcast', event: 'action', payload });
  } catch (e) {
    console.warn('[online] send', e);
  }
}

function clearHandshake() {
  if (online._handshakeTimer) { clearTimeout(online._handshakeTimer); online._handshakeTimer = null; }
}

function clearDcTimer() {
  if (online._dcTimer) { clearTimeout(online._dcTimer); online._dcTimer = null; }
}

/** L'adversaire (side opposé au mien) est-il présent dans le Presence state ? On
 *  balaie tous les metas et on cherche mon side opposé — robuste même si un client
 *  s'est mal keyé (on se fie à la valeur `side` trackée, pas à la clé). */
function oppPresent() {
  if (!online.channel || online.side === null) return false;
  const oppSide = online.side === 0 ? 1 : 0;
  let st;
  try { st = online.channel.presenceState(); } catch (_) { return false; }
  for (const key of Object.keys(st || {})) {
    const metas = st[key] || [];
    for (const m of metas) if (m && m.side === oppSide) return true;
  }
  return false;
}

// ---------------------------------------------------------------------------
// CYCLE W2 — synchro des coups en lockstep (design/spec-pvp-online.md §5)
// ---------------------------------------------------------------------------

/** Marque le passage en partie jouable (au 'ready' du handshake). Remet le compteur
 *  d'actions et la file à zéro (le side 0 émettra seq=1 en premier). */
export function startPlaying() {
  online.status = 'playing';
  online.seq = 0;
  online.inbox = [];
}

/** Diffuse une action locale sur le canal (§5.3). Les kinds de jeu reçoivent un `seq`
 *  monotone partagé ; les messages de contrôle (resign/flag) sont hors séquence.
 *  No-op propre si le canal n'est pas ouvert (test local / réseau injoignable). */
export function sendAction(evt) {
  if (!online.channel) return; // dégradation gracieuse (garde-fou n°2)
  if (evt.kind === 'resign' || evt.kind === 'flag') {
    envoyerMessage(evt);
    return;
  }
  const seq = ++online.seq; // mon action avance le compteur partagé
  envoyerMessage({ ...evt, seq });
}

/** File d'application : ajoute une action entrante, dédupliquée par seq, triée. */
function enqueueInbox(msg) {
  if (online.inbox.some((m) => m.seq === msg.seq)) return; // idempotence (§5.6)
  online.inbox.push(msg);
  online.inbox.sort((a, b) => a.seq - b.seq);
}

/** Renvoie la prochaine action à appliquer si elle est dans l'ordre (seq attendu),
 *  sinon null (on attend le seq manquant — gestion fine en W3). Purge les seq périmés. */
export function takeNextAction() {
  while (online.inbox.length && online.inbox[0].seq <= online.seq) online.inbox.shift();
  if (online.inbox.length && online.inbox[0].seq === online.seq + 1) {
    const m = online.inbox.shift();
    online.seq = m.seq; // l'application avance aussi le compteur partagé
    return m;
  }
  return null;
}

/** DEBUG (tests W2 en isolation) : injecte une action entrante dans la file comme si
 *  elle venait du canal. Auto-assigne le prochain seq attendu si absent. */
export function __debugEnqueue(msg) {
  if (msg.seq == null) msg = { ...msg, seq: online.seq + online.inbox.length + 1 };
  enqueueInbox(msg);
}

// ---------------------------------------------------------------------------
// CYCLE W3 — robustesse & trophées (design/spec-pvp-online.md §3.5, §7, §8, §9.4)
// ---------------------------------------------------------------------------

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Rapporte le résultat de la partie au serveur (RPC pvp_report_result, §3.5/§8).
 *  - result : 'win' | 'loss' | 'draw' du point de vue local.
 *  - opponentAbandoned : true si je suis le survivant d'un abandon/déconnexion (§8.3).
 *  Renvoie { applied, delta, total, status, error }. Les trophées ne sont écrits que si
 *  les deux rapports concordent : quand JE rapporte en premier, le serveur répond
 *  'playing' (en attente) → on re-poll jusqu'à finalisation par l'adversaire (~12 s),
 *  puis on relit MON delta figé. Dégradation gracieuse : réseau KO → { error }. */
export async function report(result, opponentAbandoned = false) {
  if (!online.supabase || !online.matchId) {
    return { applied: false, delta: 0, total: null, status: 'offline', error: 'offline' };
  }
  const maxTries = 8; // 8 × 1,5 s ≈ 12 s d'attente d'un rapport concordant
  for (let i = 0; i < maxTries; i++) {
    try {
      const { data, error } = await online.supabase.rpc('pvp_report_result', {
        p_match_id: online.matchId,
        p_result: result,
        p_opponent_abandoned: opponentAbandoned,
      });
      if (error) throw error;
      // RETURNS TABLE → PostgREST renvoie un TABLEAU d'1 ligne.
      const row = Array.isArray(data) ? data[0] : data;
      if (row && row.applied) {
        return { applied: true, delta: row.my_delta, total: row.my_total, status: row.match_status };
      }
      if (row && (row.match_status === 'disputed' || row.match_status === 'voided')) {
        return { applied: false, delta: 0, total: row.my_total, status: row.match_status, error: 'disputed' };
      }
      // 'playing' = mon rapport est enregistré, on attend celui de l'adversaire.
    } catch (e) {
      console.warn('[online] pvp_report_result', e && (e.message || e));
      if (i === maxTries - 1) {
        return { applied: false, delta: 0, total: null, status: 'error', error: 'network' };
      }
    }
    await sleep(1500);
  }
  // Toujours en attente après ~12 s : l'adversaire n'a pas (encore) rapporté.
  return { applied: false, delta: 0, total: null, status: 'pending', error: 'pending' };
}

/** Demande à l'adversaire de renvoyer son état complet (reconnexion / seq manquant, §7.3). */
export function requestResync() {
  if (!online.channel) return;
  online._awaitingResync = true;      // j'attends un snapshot → je pourrai l'appliquer
  if (online._resyncSent) return;     // anti-rafale : une demande à la fois
  online._resyncSent = true;
  setTimeout(() => { online._resyncSent = false; }, 3000);
  envoyerMessage({ kind: 'resync_req', side: online.side });
}

/** Renvoie un snapshot d'état complet à l'adversaire (réponse à un resync_req, §7.3).
 *  snapshot = objet sérialisable construit par main.js (positions, upgrades, cooldowns,
 *  shields, flags, écus, turn, chain, horloges, seq courant). */
export function sendResync(snapshot) {
  envoyerMessage({ kind: 'resync', snapshot, seq: online.seq });
}

/** Force le compteur d'actions partagé après un resync (le survivant fait autorité). */
export function setSeq(n) { online.seq = n | 0; }

/** Vide la file d'actions entrantes (au resync : on repart d'un état de vérité). */
export function clearInbox() { online.inbox = []; }

/** Diffuse une proposition/acceptation de revanche (§9.4). phase = 'offer' | 'accept'. */
export function sendRematch(phase) {
  if (!online.channel) return;
  envoyerMessage({ kind: 'rematch', phase, side: online.side });
}

/** Lance la revanche (§9.4) : crée/rejoint un nouveau match entre les deux mêmes joueurs,
 *  COULEURS INVERSÉES (l'ex-J2 devient J1), via la RPC idempotente pvp_rematch. Les deux
 *  clients l'appellent avec l'ancien matchId ; un seul nouveau match est créé (verrou).
 *  Ferme le canal courant et ouvre le nouveau (handshake hello/ready normal). */
export async function rematch(prevMatchId) {
  if (!online.supabase || !prevMatchId) {
    online.error = 'Revanche indisponible.'; online.status = 'error'; return false;
  }
  leave();                       // ferme le canal de coordination (la revanche est décidée)
  online.status = 'matched';
  try {
    const { data, error } = await online.supabase.rpc('pvp_rematch', { p_prev: prevMatchId });
    if (error) throw error;
    const row = Array.isArray(data) ? data[0] : data;
    if (!row || !row.match_id) throw new Error('rematch_failed');
    online.matchId = row.match_id;
    online.side = row.side;          // ex-J2 → 0, ex-J1 → 1 (couleurs inversées)
    online.oppPseudo = row.opp_pseudo;
    online.oppTrophies = row.opp_trophies;
    if (row.cadence) online.cadence = row.cadence; // la revanche reprend la cadence du match précédent
    if (row.variant) online.variant = row.variant; // … et sa variante (GDD §7.2 v3.1)
    return demarrerHandshake(true);  // pas de timeout : appariement déjà connu
  } catch (e) {
    console.warn('[online] rematch', e && (e.message || e));
    online.error = 'Revanche impossible.';
    online.status = 'error';
    return false;
  }
}

/** true si un seq manque dans la file (trou de séquence) depuis un moment — main.js
 *  déclenche alors un resync (§5.6/§7.3). On considère un trou dès qu'une action de seq
 *  strictement supérieur à seq+1 attend en tête de file. */
export function inboxHasGap() {
  return online.inbox.length > 0 && online.inbox[0].seq > online.seq + 1;
}
