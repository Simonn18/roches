// roychec — CYCLE A v2 (design/spec-online.md §2) : compte joueur via Supabase.
// Auth par MAGIC LINK ou EMAIL + MOT DE PASSE + session persistante + pseudo.
//
// POURQUOI MAGIC LINK ET PAS OTP 6 CHIFFRES : le dashboard Supabase verrouille
// l'édition du template email (affichage du code {{ .Token }}) tant qu'aucun SMTP
// custom n'est configuré ; le template par défaut n'envoie qu'un LIEN. On bascule
// donc sur le magic link pour le v1 (le code OTP redeviendra possible plus tard avec
// un SMTP custom). Flux : signInWithOtp({ email, options.emailRedirectTo }) envoie un
// lien ; l'utilisateur clique, revient sur le jeu avec la session dans l'URL, que
// supabase-js détecte (detectSessionInUrl, défaut true) → événement SIGNED_IN.
//
// EMAIL + MOT DE PASSE (ajouté 2026-07-09) : alternative pour les utilisateurs qui
// préfèrent un mot de passe. signInWithPassword pour la connexion, signUp pour
// l'inscription (envoie un email de confirmation Supabase). Le magic link reste
// disponible via un toggle dans l'overlay.
//
// ISOLATION (garde-fou CLAUDE.md §7.3) : c'est le SEUL module du projet qui connaît
// Supabase. Le reste du jeu ne voit qu'un objet d'état plat (getAccount()) et trois
// fonctions (initAccount / startAuth / logout). supabase-js est chargé en import
// DYNAMIQUE depuis un CDN : aucune requête réseau au chargement du module.
//
// DÉGRADATION GRACIEUSE (garde-fou CLAUDE.md §7.2, spec §7) : si le CDN ou Supabase
// est injoignable, TOUTE erreur retombe silencieusement en mode invité. Le jeu doit
// rester 100 % jouable sans compte et sans réseau.

const SUPABASE_URL = 'https://hsyfbfotbpzfhgxfdgom.supabase.co';
// Clé « publishable » publique : sa présence en clair côté client est l'usage prévu ;
// la sécurité repose sur la RLS Postgres (spec §7), jamais sur le secret de la clé.
const SUPABASE_KEY = 'sb_publishable_3wwsNqBwmetZWsKk6KjKWQ_Rr2G7Qv0';

// État compte lisible par le reste du jeu (plain object, réf. vivante).
//   status : 'guest'      = invité (défaut, jeu 100 % jouable)
//            'pseudo'     = session valide mais pseudo pas encore posé (overlay pseudo ouvert)
//            'connected'  = compte prêt (pseudo affiché au menu)
const account = {
  status: 'guest',
  pseudo: null,
  trophies: 0, // non utilisé au cycle A (persistance des trophées = cycle B)
  email: null,
};

/** Renvoie l'état compte (référence vivante lue par le rendu du menu). */
export function getAccount() { return account; }

// Partage du client Supabase avec online.js (spec-pvp-online §2.3 : une seule
// instance supabase-js dans tout le projet, créée ici, réutilisée par le PvP).
// Renvoie null tant que le CDN n'a pas chargé (import dynamique) ou s'il est
// injoignable — online.js gère ce null en dégradation gracieuse (garde-fou n°2).
export function getSupabaseClient() { return supabase; }

// Barème de trophées par difficulté IA (spec-online §3.1). MIROIR CLIENT du barème
// serveur (schema-cycle-b.sql) : sert au calcul du delta invité (RAM) et au FALLBACK
// d'affichage si le RPC échoue. La source de vérité pour l'ÉCRITURE persistée reste
// le serveur (RPC apply_match_result), le client ne fixe jamais un total arbitraire.
const BAREME = {
  1: { win: 10, lose: -8 },  // Débutant
  2: { win: 18, lose: -5 },  // Intermédiaire
  3: { win: 28, lose: -3 },  // Avancé
};

// Applique le résultat d'une partie PvAI (spec-online §3). Retourne le delta et le
// nouveau total pour l'affichage, sans jamais rejeter (dégradation gracieuse).
//  - connecté  : appel RPC serveur (calcul + écriture côté Postgres). Si le RPC est
//                absent (SQL pas collé) ou réseau KO → fallback compteur RAM + flag error.
//  - invité    : compteur RAM éphémère (remis à 0 au reload), même barème.
export async function applyMatchResult(difficulty, won) {
  const b = BAREME[difficulty] || BAREME[1];
  const delta = won ? b.win : b.lose;
  const avant = account.trophies;
  if (account.status === 'connected' && supabase) {
    try {
      const { data, error } = await supabase.rpc('apply_match_result', {
        p_difficulty: difficulty, p_won: won,
      });
      if (error) throw error;
      account.trophies = typeof data === 'number' ? data : Math.max(0, avant + delta);
      return { delta, total: account.trophies, persisted: true, ephemeral: false, error: false };
    } catch (e) {
      // RPC manquant (function not found) / rate_limited / réseau : on n'échoue pas.
      console.warn('[account] RPC apply_match_result indisponible — total de session (RAM)', e.message || e);
      account.trophies = Math.max(0, avant + delta);
      return { delta, total: account.trophies, persisted: false, ephemeral: false, error: true };
    }
  }
  // Invité : total en RAM, non persisté (spec §2.4).
  account.trophies = Math.max(0, avant + delta);
  return { delta, total: account.trophies, persisted: false, ephemeral: true, error: false };
}

let supabase = null;      // client Supabase, null tant que non chargé / si CDN KO
let pendingEmail = null;  // email en cours de vérification OTP
let resendTimer = null;   // interval du compte à rebours « Renvoyer »
let passwordTab = 'login';// onglet de l'écran mot de passe : 'login' (connexion) | 'signup' (inscription)
let sentFrom = 'magic';   // écran qui a mené à 'sent' : 'magic' (lien) | 'password' (confirmation inscription)

// ---------- Initialisation ----------
// Appelée une fois au démarrage. Câble l'overlay DOM puis tente de charger Supabase
// et de restaurer une session existante (auto-login silencieux, spec §2.3).
export async function initAccount() {
  cacheDom();
  wireDom();
  try {
    // Import dynamique via CDN — première (et unique) dépendance externe (spec §7).
    // VENDOR LOCAL (M2+ soldé 2026-07-12 ~21:00) : supabase-js@2.110.2 importé
    // depuis `game/assets/lib/supabase.min.js?v=24` (~210 KB unique, ESM bundle
    // produit via `npx esbuild --bundle --platform=browser --format=esm --minify`
    // depuis le package npm officiel `@supabase/supabase-js@2.110.2` — sha256
    // `4048c4229b35263f565647960802bff649ae04238f392d4a710f1e0724bed3f8` figé pour
    // audit M2+ ; script reproductible cf. Logs/2026-07-12.md ~21:00). Le `?v=24`
    // sur l'import force le browser à re-fecther le vendor (le path du fichier
    // n'a pas changé, sans le query le browser pourrait servir l'ancienne version
    // cassée depuis le cache HTTP — extension §8.1 §5 du pattern cache-bust aux
    // dynamic imports).
    //
    // BUG HISTORIQUE (URL typo `[email protected]`) FIXÉ à 20:30 : l'URL originelle
    // `https://esm.sh/@supabase/[email protected]?bundle-deps&minify` était syntaxiquement INCORRECT
    // (esm.sh attend `@scope/name@version`). Régression introduite par le commit
    // `2b4d3b4` 17:00 et détectée via DevTools console (`account.js:117 [account]
    // Supabase injoignable (CDN) — mode invité TypeError: Failed to fetch dynamically
    // imported module`).
    //
    // BUG HISTORIQUE (polyfills `__Process$`/`__Buffer$`) FIXÉ à 21:00 : le bundle
    // esm.sh brut contenait 2 imports absolus à `/node/process.mjs` et `/node/buffer.mjs`
    // (polyfills esm.sh) → 404 en local (`http://localhost:8000/node/process.mjs`).
    // Fix : bascule sur esbuild `--platform=browser` qui honore le champ `browser`
    // du package.json de supabase-js et strippe ces imports Node-isms (cf. Logs).
    //
    // Le try/catch reste pour la dégradation gracieuse (serveur KO, offline, fichier
    // vendor corrompu — le jeu reste 100% jouable en invité en cas d'échec).
    const mod = await import('../assets/lib/supabase.min.js?v=24');
    supabase = mod.createClient(SUPABASE_URL, SUPABASE_KEY);
  } catch (e) {
    // CDN injoignable : on reste invité, le jeu tourne normalement.
    console.warn('[account] Supabase injoignable (CDN) — mode invité', e);
    return;
  }
  try {
    // onAuthStateChange couvre trois cas d'un seul point d'entrée :
    //  - INITIAL_SESSION : session restaurée du localStorage (auto-login, spec §2.3) ;
    //  - SIGNED_IN       : retour du magic link (session posée depuis l'URL) ;
    //  - SIGNED_OUT / null : déconnexion ou absence de session → mode invité.
    // Sur registration, l'événement INITIAL_SESSION est émis immédiatement avec la
    // session courante (ou null), donc pas besoin d'un getSession() séparé.
    supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'SIGNED_OUT' || !session) { setGuest(); nettoyerUrl(); return; }
      // SIGNED_IN / INITIAL_SESSION / TOKEN_REFRESHED avec une session valide.
      nettoyerUrl(); // retire le token du magic link de la barre d'adresse
      if (account.status !== 'connected') chargerProfil(session.user);
    });
  } catch (e) {
    console.warn('[account] restauration de session impossible — mode invité', e);
  }
  // Défense : si le hash ne contient que des erreurs (pas d'access_token),
  // detectSessionInUrl peut ne pas émettre d'événement. Un nettoyage inconditionnel
  // évite de garder #error=… dans la barre d'adresse indéfiniment.
  nettoyerUrl();
}

// Retire le fragment/paramètres du magic link (#access_token=…, ?code=…, ?token_hash=…)
// de l'URL après connexion, sans recharger la page (history.replaceState).
// location.hash est truthy pour TOUT hash, y compris les erreurs (#error=access_denied…).
// location.search couvre les query params résiduels (?code=…, ?token_hash=…).
function nettoyerUrl() {
  try {
    if (typeof location === 'undefined' || typeof history === 'undefined') return;
    const searchSale = /[?&](code|token_hash|error|error_description)=/.test(location.search);
    if (location.hash || searchSale) {
      history.replaceState(null, document.title, location.pathname);
    }
  } catch (_) { /* non bloquant */ }
}

// ---------- Actions exposées au jeu ----------

/** Ouvre l'overlay d'authentification (déclenché par le bouton « CONNEXION » du menu). */
export function startAuth() {
  if (account.status === 'connected') return;
  if (account.status === 'pseudo') { ouvrirPseudo(); return; }
  // Toujours (re)partir de l'écran de CHOIX de méthode (spec UX v3).
  montrerChoix();
  ouvrirOverlay();
}

/** Déconnexion (bouton « DÉCONNEXION » du menu). Retombe en mode invité. */
export async function logout() {
  if (supabase) { try { await supabase.auth.signOut(); } catch (_) { /* ignore */ } }
  setGuest();
}

// ---------- Navigation entre écrans (refonte UX v3) ----------

// Écran de CHOIX : point d'entrée. Les 3 méthodes sont des gros boutons distincts.
function montrerChoix() {
  montrerEcran('choice');
  message('', false);
  clearResend();
  if (el.methods && el.methods[0]) el.methods[0].focus();
}

// Dispatch depuis un bouton de méthode (data-method).
function choisirMethode(method) {
  message('', false);
  if (method === 'guest') { fermerOverlay(); return; }   // même effet que l'ancien « Annuler »
  if (method === 'magic') { ouvrirMagic(); return; }
  if (method === 'password') { ouvrirPassword('login'); return; }
}

// Écran LIEN MAGIQUE dédié : champ email + « Recevoir le lien ».
function ouvrirMagic() {
  montrerEcran('magic');
  message('', false);
  el.magicSend.disabled = false;
  el.magicSend.textContent = 'Recevoir le lien';
  if (el.magicEmail) el.magicEmail.focus();
}

// Écran MOT DE PASSE dédié : onglets connexion / inscription.
function ouvrirPassword(tab) {
  montrerEcran('password');
  message('', false);
  changerTab(tab || 'login');
  if (el.pwdEmail) el.pwdEmail.focus();
}

// Bascule d'onglet : adapte champ (autocomplete), indice « 6 car. » et libellé du bouton.
function changerTab(tab) {
  passwordTab = (tab === 'signup') ? 'signup' : 'login';
  const login = passwordTab === 'login';
  el.tabLogin.classList.toggle('is-active', login);
  el.tabSignup.classList.toggle('is-active', !login);
  el.tabLogin.setAttribute('aria-selected', login ? 'true' : 'false');
  el.tabSignup.setAttribute('aria-selected', login ? 'false' : 'true');
  if (el.pwdHint) el.pwdHint.hidden = login;               // indice 6 car. → inscription seulement
  el.pwdPassword.setAttribute('autocomplete', login ? 'current-password' : 'new-password');
  el.pwdSubmit.disabled = false;
  el.pwdSubmit.textContent = login ? 'Se connecter' : 'Créer un compte';
  message('', false);
}
function labelPwd() { return passwordTab === 'signup' ? 'Créer un compte' : 'Se connecter'; }

// Soumission de l'écran mot de passe selon l'onglet actif.
function soumettrePassword() {
  if (passwordTab === 'signup') inscriptionPassword();
  else connexionPassword();
}

// ---------- Flux Supabase ----------

// Envoi du lien magique par email. Le retour de connexion est géré
// par onAuthStateChange (SIGNED_IN), pas par une saisie de code.
async function envoyerCode() {
  const email = (el.magicEmail.value || '').trim();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) { message('Adresse email invalide.', true); return; }
  if (!supabase) { message('Service indisponible, réessaie plus tard.', true); return; }
  el.magicSend.disabled = true; el.magicSend.textContent = 'ENVOI…';
  try {
    const origin = window.location.origin;
    console.log('[account] emailRedirectTo =', origin);
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { shouldCreateUser: true, emailRedirectTo: origin },
    });
    if (error) {
      message(traduireErreurEnvoi(error), true);
      el.magicSend.disabled = false; el.magicSend.textContent = 'Recevoir le lien';
      return;
    }
    pendingEmail = email;
    sentFrom = 'magic';
    mettreAJourEcranSent();
    if (el.emailRappel) el.emailRappel.textContent = email;
    montrerEcran('sent');
    message('Email envoyé ✓', false);
    demarrerResend();
  } catch (e) {
    console.warn('[account] signInWithOtp', e);
    message('Connexion impossible, réessaie.', true);
    el.magicSend.disabled = false; el.magicSend.textContent = 'Recevoir le lien';
  }
}

// Connexion par email + mot de passe (compte existant).
async function connexionPassword() {
  const email = (el.pwdEmail.value || '').trim();
  const pwd = el.pwdPassword.value || '';
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) { message('Adresse email invalide.', true); return; }
  if (!pwd) { message('Entre ton mot de passe.', true); return; }
  if (!supabase) { message('Service indisponible.', true); return; }
  el.pwdSubmit.disabled = true; el.pwdSubmit.textContent = 'CONNEXION…';
  try {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password: pwd });
    if (error) {
      message(traduireErreurPassword(error), true);
      el.pwdSubmit.disabled = false; el.pwdSubmit.textContent = labelPwd();
      return;
    }
    // Connexion réussie : le callback onAuthStateChange (SIGNED_IN) va charger le profil.
    // Pas besoin de faire quoi que ce soit ici — chargerProfil sera appelé automatiquement.
  } catch (e) {
    console.warn('[account] signInWithPassword', e);
    message('Connexion impossible, réessaie.', true);
    el.pwdSubmit.disabled = false; el.pwdSubmit.textContent = labelPwd();
  }
}

// Inscription par email + mot de passe (nouveau compte).
async function inscriptionPassword() {
  const email = (el.pwdEmail.value || '').trim();
  const pwd = el.pwdPassword.value || '';
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) { message('Adresse email invalide.', true); return; }
  if (pwd.length < 6) { message('Le mot de passe doit faire au moins 6 caractères.', true); return; }
  if (!supabase) { message('Service indisponible.', true); return; }
  el.pwdSubmit.disabled = true; el.pwdSubmit.textContent = 'INSCRIPTION…';
  try {
    const origin = window.location.origin;
    const { data, error } = await supabase.auth.signUp({
      email,
      password: pwd,
      options: { emailRedirectTo: origin },
    });
    if (error) {
      message(traduireErreurPassword(error), true);
      el.pwdSubmit.disabled = false; el.pwdSubmit.textContent = labelPwd();
      return;
    }
    // Si l'utilisateur est déjà confirmé ou la confirmation n'est pas requise,
    // une session est créée immédiatement → onAuthStateChange déclenchera chargerProfil.
    // Sinon, on affiche l'écran "email envoyé" (confirmation).
    if (data.session) {
      // Session immédiate : onAuthStateChange va gérer.
    } else if (data.user) {
      // Email de confirmation envoyé.
      pendingEmail = email;
      sentFrom = 'password';
      mettreAJourEcranSent();
      if (el.emailRappel) el.emailRappel.textContent = email;
      montrerEcran('sent');
      message('Email de confirmation envoyé ✓', false);
      demarrerResend();
    }
  } catch (e) {
    console.warn('[account] signUp', e);
    message('Inscription impossible, réessaie.', true);
    el.pwdSubmit.disabled = false; el.pwdSubmit.textContent = labelPwd();
  }
}

// Étape 2 : pose du pseudo (première connexion, spec §2.2).
async function confirmerPseudo() {
  const pseudo = (el.pseudo.value || '').trim();
  // 3-16 caractères : lettres, chiffres, espace, tiret, underscore (flag u).
  if (!/^[\p{L}\p{N} _-]{3,16}$/u.test(pseudo)) {
    message('3 à 16 caractères : lettres, chiffres, espace, - ou _.', true); return;
  }
  if (!supabase) { message('Service indisponible.', true); return; }
  el.pseudoBtn.disabled = true; el.pseudoBtn.textContent = 'ENVOI…';
  try {
    const { data: u } = await supabase.auth.getUser();
    if (!u || !u.user) { message('Session expirée, reconnecte-toi.', true); resetPseudoBtn(); return; }
    // INSERT direct de sa propre ligne (spec §4.4). L'unicité insensible à la casse est
    // garantie par un index DB (schema.sql) — pas de pré-vérification (course possible).
    const { error } = await supabase.from('profiles').insert({ id: u.user.id, pseudo });
    resetPseudoBtn();
    if (error) { message(traduireErreurPseudo(error), true); return; }
    account.status = 'connected';
    account.pseudo = pseudo;
    account.trophies = 0;
    fermerOverlay();
  } catch (e) {
    console.warn('[account] insert profil', e);
    resetPseudoBtn();
    message('Connexion impossible, réessaie.', true);
  }
}

// Charge le profil de l'utilisateur connecté (spec §2.3). Cas limites gérés :
//  - session valide SANS ligne profiles (pseudo jamais posé) → écran pseudo.
//  - table profiles ABSENTE (schema.sql pas encore exécuté) → écran pseudo + message clair
//    à l'INSERT. Le code ne doit jamais bloquer sur l'absence de la table.
async function chargerProfil(user) {
  account.email = user && user.email ? user.email : null;
  try {
    const { data, error } = await supabase
      .from('profiles').select('pseudo, trophies').eq('id', user.id).maybeSingle();
    if (error) {
      // Table manquante ou autre erreur de lecture : on laisse le joueur poser un pseudo,
      // l'INSERT renverra un message explicite si la base n'est pas initialisée.
      console.warn('[account] lecture profil impossible', error.message || error);
      ouvrirPseudo();
      return;
    }
    if (!data) { ouvrirPseudo(); return; } // pas encore de pseudo
    account.status = 'connected';
    account.pseudo = data.pseudo;
    account.trophies = data.trophies || 0;
    fermerOverlay();
  } catch (e) {
    console.warn('[account] chargerProfil', e);
    ouvrirPseudo();
  }
}

function setGuest() {
  account.status = 'guest';
  account.pseudo = null;
  account.trophies = 0;
  account.email = null;
  pendingEmail = null;
  fermerOverlay();
}

// Traductions d'erreurs Supabase en messages joueur (spec §5.1 feedbacks).
function traduireErreurEnvoi(error) {
  const m = (error && error.message ? error.message : '').toLowerCase();
  if (m.includes('rate') || m.includes('limit') || (error && error.status === 429)) {
    return 'Trop de tentatives, patiente un instant avant de réessayer.';
  }
  return 'Envoi impossible pour le moment, réessaie.';
}
function traduireErreurPassword(error) {
  const m = (error && error.message ? error.message : '').toLowerCase();
  if (m.includes('invalid login') || m.includes('invalid credentials')) {
    return 'Email ou mot de passe incorrect.';
  }
  if (m.includes('email not confirmed')) {
    return 'Email non confirmé — vérifie ta boîte mail.';
  }
  if (m.includes('already registered') || m.includes('already exists') || m.includes('unique')) {
    return 'Un compte existe déjà avec cet email. Connecte-toi.';
  }
  if (m.includes('rate') || m.includes('limit') || (error && error.status === 429)) {
    return 'Trop de tentatives, patiente un instant.';
  }
  return 'Connexion impossible, réessaie.';
}
function traduireErreurPseudo(error) {
  if (error && error.code === '23505') return 'Ce pseudo est déjà pris, essaie-en un autre.';
  if (error && error.code === '42P01') return 'Base non initialisée : exécute d\'abord supabase/schema.sql.';
  return (error && error.message) || 'Impossible d\'enregistrer le pseudo.';
}

// ---------- Overlay DOM (spec §5.1 : saisie texte via <input> superposés au canvas) ----------
const el = {};                       // cache des nœuds du DOM
function q(id) { return document.getElementById(id); }

function cacheDom() {
  el.overlay = q('auth-overlay');
  // Écran choix : boutons de méthode.
  el.methods = el.overlay ? Array.from(el.overlay.querySelectorAll('.auth-method')) : [];
  el.backs = el.overlay ? Array.from(el.overlay.querySelectorAll('[data-back]')) : [];
  // Écran magic.
  el.magicEmail = q('auth-magic-email');
  el.magicSend = q('auth-magic-send');
  // Écran password.
  el.pwdEmail = q('auth-pwd-email');
  el.pwdPassword = q('auth-pwd-password');
  el.pwdSubmit = q('auth-pwd-submit');
  el.pwdHint = q('auth-pwd-hint');
  el.tabLogin = q('auth-tab-login');
  el.tabSignup = q('auth-tab-signup');
  // Écran sent.
  el.resend = q('auth-resend');
  el.changeEmail = q('auth-change-email');
  el.emailRappel = q('auth-email-rappel');
  el.sentDesc = q('auth-sent-desc');
  // Écran pseudo.
  el.pseudo = q('auth-pseudo');
  el.pseudoBtn = q('auth-pseudo-btn');
  el.pseudoCount = q('auth-pseudo-count');
  // Communs.
  el.msg = q('auth-msg');
  el.close = q('auth-close');
  el.screens = el.overlay ? Array.from(el.overlay.querySelectorAll('[data-screen]')) : [];
}

function wireDom() {
  if (!el.overlay) return;
  // Écran choix : chaque bouton de méthode.
  for (const b of el.methods) {
    b.addEventListener('click', () => choisirMethode(b.dataset.method));
  }
  // Boutons retour (←) : reviennent à l'écran de choix.
  for (const b of el.backs) b.addEventListener('click', montrerChoix);
  // Écran magic.
  el.magicSend.addEventListener('click', envoyerCode);
  el.magicEmail.addEventListener('keydown', (e) => { if (e.key === 'Enter') envoyerCode(); });
  // Écran password.
  el.pwdSubmit.addEventListener('click', soumettrePassword);
  el.tabLogin.addEventListener('click', () => changerTab('login'));
  el.tabSignup.addEventListener('click', () => changerTab('signup'));
  el.pwdEmail.addEventListener('keydown', (e) => { if (e.key === 'Enter') soumettrePassword(); });
  el.pwdPassword.addEventListener('keydown', (e) => { if (e.key === 'Enter') soumettrePassword(); });
  // Écran sent.
  el.resend.addEventListener('click', renvoyer);
  el.changeEmail.addEventListener('click', changerEmail);
  // Écran pseudo.
  el.pseudoBtn.addEventListener('click', confirmerPseudo);
  el.pseudo.addEventListener('keydown', (e) => { if (e.key === 'Enter') confirmerPseudo(); });
  // Fermer (croix).
  el.close.addEventListener('click', fermerOverlay);
  // Compteur live du pseudo (3-16).
  el.pseudo.addEventListener('input', () => {
    if (el.pseudoCount) el.pseudoCount.textContent = `${el.pseudo.value.trim().length}/16`;
  });
}

function montrerEcran(name) {
  for (const s of el.screens) s.hidden = s.dataset.screen !== name;
}
function ouvrirOverlay() { if (el.overlay) el.overlay.hidden = false; }
function fermerOverlay() { if (el.overlay) el.overlay.hidden = true; clearResend(); }
function resetPseudoBtn() { if (el.pseudoBtn) { el.pseudoBtn.disabled = false; el.pseudoBtn.textContent = 'Confirmer'; } }

function ouvrirPseudo() {
  account.status = 'pseudo';
  montrerEcran('pseudo');
  message('Choisis ton pseudo de joueur.', false);
  resetPseudoBtn();
  ouvrirOverlay();
  if (el.pseudo) el.pseudo.focus();
}

function message(text, isError) {
  if (!el.msg) return;
  el.msg.textContent = text || '';
  el.msg.style.color = isError ? '#B5573F' : '#5E8A52';
}

// Met à jour le texte de l'écran "sent" selon qu'on vient du magic link ou de l'inscription password.
function mettreAJourEcranSent() {
  if (!el.sentDesc) return;
  if (sentFrom === 'password') {
    el.sentDesc.innerHTML = 'Un email de confirmation a été envoyé à <strong id="auth-email-rappel"></strong>.'
      + ' Clique le lien dans ta boîte mail pour activer ton compte.';
    // Re-cache emailRappel car le innerHTML a recréé l'élément.
    el.emailRappel = q('auth-email-rappel');
  } else {
    el.sentDesc.innerHTML = 'On a envoyé un lien de connexion à <strong id="auth-email-rappel"></strong>.'
      + ' Clique le lien dans ta boîte mail : tu reviendras ici connecté.';
    el.emailRappel = q('auth-email-rappel');
  }
}

// « Changer d'email » depuis l'écran 'sent' : revient à l'écran d'origine pour ré-éditer
// l'adresse. Distinct du bouton retour ← (qui remonte au choix de méthode).
function changerEmail() {
  clearResend();
  message('', false);
  if (sentFrom === 'password') {
    // Seule l'INSCRIPTION mène à 'sent' côté password → on rouvre l'onglet inscription.
    ouvrirPassword('signup');
  } else {
    ouvrirMagic();
  }
}

// Renvoi selon le mode : magic link ou confirmation d'inscription.
async function renvoyer() {
  if (sentFrom === 'password') {
    // Renvoi de l'email de confirmation (supabase.auth.resend).
    if (!supabase || !pendingEmail) return;
    try {
      const { error } = await supabase.auth.resend({ type: 'signup', email: pendingEmail });
      if (error) {
        message('Impossible de renvoyer l\'email. Réessaie plus tard.', true);
        return;
      }
      message('Email de confirmation renvoyé ✓', false);
      demarrerResend();
    } catch (e) {
      console.warn('[account] resend signup', e);
      message('Impossible de renvoyer l\'email.', true);
    }
  } else {
    // Magic link : ré-envoi du lien.
    await envoyerCode();
  }
}

// Compte à rebours anti-spam de 30 s sur « Renvoyer » (spec §2.1).
function demarrerResend() {
  clearResend();
  let s = 30;
  if (!el.resend) return;
  el.resend.disabled = true;
  const label = sentFrom === 'password' ? 'Renvoyer la confirmation' : 'Renvoyer le lien';
  el.resend.textContent = `${label} (${s})`;
  resendTimer = setInterval(() => {
    s -= 1;
    if (s <= 0) { clearResend(); el.resend.disabled = false; el.resend.textContent = label; }
    else el.resend.textContent = `${label} (${s})`;
  }, 1000);
}
function clearResend() { if (resendTimer) { clearInterval(resendTimer); resendTimer = null; } }
