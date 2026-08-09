// roychec — point d'entrée : boucle de jeu, entrées souris/clavier, logique de tour.
// MVP (GDD §9) : hot-seat 2 joueurs, économie d'écus, 1 amélioration par type de pièce.
// Cycle 1 IA (design/spec-ia.md) : menu d'accueil, mode PvAI optionnel, hook bot dummy.
import { creerEtat, creerPlateau, inB, caseAt } from './board.js?v=109';
import { coupsLegaux, ciblesRuee, ciblesRayon, ciblesVet, DIRS8 } from './rules.js?v=116';
import { initialiserChasse, recolterChasse } from './hunt.js?v=3';
import { render, pixelVersCase, cellCenter, vueCase } from './render.js?v=204';
import { iaDecideTour } from './ai.js?v=111';
import { initReplay, recordMove, recordPurchase, recordPower, recordHuntAward, finalizeReplay, downloadReplayMD, hasReplays, loadLastReplay, loadReplayByKey, getReplayList } from './replay.js?v=109';
import { updateBook } from './opening.js?v=107';
import { demarrerTutorielHub, demarrerEtapeTutoriel, etapeSuivante, verifierEtape, forcerAvancement,
  rejouerEtape, tutorielPermet } from './tutorial.js?v=109';
import { demarrerApprendre, demarrerPuzzles, demarrerMiniJeu, demarrerPuzzle,
  reinitialiserMiniJeu, reinitialiserPuzzle, verifierMiniJeu, verifierPuzzle,
  marquerMiniJeuReussi, marquerPuzzleReussi, marquerPuzzleReponse, puzzleReponse,
  TOTAL_LEARN_GAMES, TOTAL_PUZZLES,
  apprendreEstDebloque, apprendrePuzzleEstDebloque, learnPermet } from './learn.js?v=22';
import { initAccount, startAuth, logout, ouvrirActivationMfa, getAccount, getSupabaseClient } from './account.js?v=110';
import { initOnline, findMatch, cancelWait, createPrivate, joinByCode, resumeMatch, leave as onlineLeave, getOnline, on as onOnline,
  sendAction, startPlaying, takeNextAction, __debugEnqueue, requestResync, sendResync,
  setSeq as onlineSetSeq, clearInbox as onlineClearInbox,
  sendRematch, rematch as onlineRematch, report as onlineReport, inboxHasGap } from './online.js?v=111';
// Deck editor (recovery 29/07 [23:30]) : API complète de decks.js (couche DONNÉES).
// loadDecks/saveDecks étaient déjà importés ; on ajoute les helpers d'id/active/clone.
import { setSlot, saveDecks, loadDecks, getActiveDeck, setActiveDeck, createDeck, renameDeck, deleteDeck, sanitizeRoot, DECK_LIMIT, upgradesForPiece } from './decks.js?v=107';
import {
  UPGRADES, UPGRADES_PAR_TYPE, VALEUR_PIECE, REVENU_PAR_COUP,
  MAX_UPGRADES_PAR_PIECE, CANVAS_W, CANVAS_H, ACCENT, UI_THEME, UI_THEMES,
} from './constants.js?v=109';
import { variantePourMode, variantIdFromMenu, DEFAULT_VARIANT, ECONOMIES, COMBATS, stagnationTick } from './variants.js?v=108';
// Phase A.5 v2 Phase 3 : import des TAILLES_DE_PLATEAU depuis la maison canonique
// (zero-dep, cf. tailles.js + commit ba30d273). `TAILLES` n'est pas directement utilisé
// ici — on consomme `state.menu.taille` (string id) et on délègue la résolution H/W
// au moteur creerPlateau/getBoardH. Importé logistique pour les debugs console.warn.
import { TAILLES as _TAILLES_LOG, DEFAULT_TAILLE, getBoardH, getBoardW } from './tailles.js?v=108';
import { lireLangue, enregistrerLangue, appliquerTraductions, onLangueChange } from './i18n.js?v=5';
// La langue pilote à la fois le Canvas et les overlays DOM (auth + renommage de deck).
// Un seul listener global évite qu'un modal oublié reste en français après le toggle.

const canvas = document.getElementById('jeu');
canvas.width = CANVAS_W;
canvas.height = CANVAS_H;
const ctx = canvas.getContext('2d');

// Pont unique Canvas → DOM : les overlays HTML consomment les mêmes tokens que
// les écrans Canvas. Modifier UI_THEME dans constants.js suffit donc à recolorer
// l'application sans dupliquer la palette dans index.html.
const THEME_STORAGE_KEY = 'roychec-theme';

function lireThemeSauvegarde() {
  try {
    const saved = localStorage.getItem(THEME_STORAGE_KEY);
    return saved === 'light' || saved === 'dark' ? saved : 'dark';
  } catch (_) {
    return 'dark';
  }
}

let themeMode = lireThemeSauvegarde();
let language = lireLangue();

function appliquerThemeDOM() {
  const root = document.documentElement;
  const vars = {
    '--ui-background': UI_THEME.background,
    '--ui-panel': UI_THEME.panel,
    '--ui-panel-alt': UI_THEME.panelAlt,
    '--ui-card': UI_THEME.card,
    '--ui-field': UI_THEME.field,
    '--ui-text': UI_THEME.text,
    '--ui-muted': UI_THEME.muted,
    '--ui-border': UI_THEME.border,
    '--ui-shadow': UI_THEME.shadow,
    '--ui-primary': UI_THEME.primary,
    '--ui-primary-dark': UI_THEME.primaryDark,
    '--ui-secondary': UI_THEME.secondary,
    '--ui-secondary-light': UI_THEME.secondaryLight,
    '--ui-danger': UI_THEME.danger,
    '--ui-danger-dark': UI_THEME.dangerDark,
    '--ui-danger-text': UI_THEME.dangerText,
    '--ui-wine': UI_THEME.wine,
    '--ui-wine-dark': UI_THEME.wineDark,
    '--ui-amber': UI_THEME.amber,
    '--ui-amber-light': UI_THEME.amberLight,
    '--ui-amber-dark': UI_THEME.amberDark,
    '--ui-button-text': UI_THEME.buttonText,
    '--ui-disabled': UI_THEME.disabled,
    '--ui-disabled-text': UI_THEME.disabledText,
    '--ui-disabled-border': UI_THEME.disabledBorder,
    '--ui-overlay': UI_THEME.overlay,
    '--ui-subtext': UI_THEME.subtext,
  };
  for (const [name, value] of Object.entries(vars)) root.style.setProperty(name, value);
}

function appliquerTheme(mode, { persist = true } = {}) {
  themeMode = mode === 'light' ? 'light' : 'dark';
  Object.assign(UI_THEME, UI_THEMES[themeMode]);
  appliquerThemeDOM();
  if (persist) {
    try { localStorage.setItem(THEME_STORAGE_KEY, themeMode); } catch (_) { /* non bloquant */ }
  }
}

function basculerTheme() {
  appliquerTheme(themeMode === 'dark' ? 'light' : 'dark');
}

appliquerTheme(themeMode, { persist: false });
// Traduction initiale des overlays statiques, puis resynchronisation à chaque changement.
appliquerTraductions(document.body, language);
onLangueChange((nextLanguage) => {
  language = nextLanguage;
  if (state.menu) state.menu.language = nextLanguage;
  appliquerTraductions(document.body, nextLanguage);
});

// PvP en ligne (spec-pvp-online §6) : cadence au choix (1 min / 5 min / 1 h / 1 jour,
// catalogue PVW_CADENCES de constants.js), SANS incrément (décision utilisateur 12/07,
// spec §6.1 v3.1 — un incrément vidait le timer de son sens). 5 min = défaut/fallback.
const PVW_TEMPS_INITIAL = 300;   // secondes par joueur (fallback si cadence absente)
const PVW_RECO_WINDOW = 30;      // fenêtre de reconnexion (s) avant victoire par abandon (§7.2)
const PVW_GAP_RESYNC_MS = 2000;  // trou de seq persistant → demande de resync (§5.6/§7.3)
const PVW_RESUME_STORAGE_KEY = 'roychec-pvp-resume-v1';
const PVW_RESUME_TTL_MS = 48 * 60 * 60 * 1000;

// La reprise est isolée par compte (l'email est déjà exposé par account.js) :
// un autre utilisateur du même navigateur ne voit pas le match précédent.
function cleReprisePvP() {
  const account = getAccount();
  const identity = account.id || String(account.email || 'guest').trim().toLowerCase();
  return `${PVW_RESUME_STORAGE_KEY}:${encodeURIComponent(identity)}`;
}

// La reprise ne conserve que l'identité du match et les métadonnées d'affichage.
// L'autorisation et l'état réel restent toujours vérifiés par Supabase + Realtime.
function lireReprisePvP() {
  try {
    const raw = localStorage.getItem(cleReprisePvP());
    if (!raw) return null;
    const value = JSON.parse(raw);
    if (!value || typeof value.matchId !== 'string' || !value.matchId
        || (value.side !== 0 && value.side !== 1)
        || !Number.isFinite(value.savedAt)
        || Date.now() - value.savedAt > PVW_RESUME_TTL_MS) {
      localStorage.removeItem(cleReprisePvP());
      return null;
    }
    return value;
  } catch (_) {
    return null;
  }
}

function sauverReprisePvP(meta) {
  if (!meta || !meta.matchId || (meta.side !== 0 && meta.side !== 1)) return;
  try {
    localStorage.setItem(cleReprisePvP(), JSON.stringify({
      matchId: meta.matchId,
      side: meta.side,
      oppPseudo: meta.oppPseudo || null,
      oppTrophies: Number.isFinite(meta.oppTrophies) ? meta.oppTrophies : null,
      cadence: meta.cadence | 0 || PVW_TEMPS_INITIAL,
      variant: meta.variant || DEFAULT_VARIANT,
      taille: meta.taille || DEFAULT_TAILLE,
      savedAt: Date.now(),
    }));
  } catch (_) { /* stockage local indisponible : la partie reste jouable */ }
}

function effacerReprisePvP() {
  try { localStorage.removeItem(cleReprisePvP()); } catch (_) { /* non bloquant */ }
}

function reprendrePartiePvP() {
  const saved = lireReprisePvP();
  if (!saved) return;
  const supabase = getSupabaseClient();
  if (!supabase) {
    entrerMatchmaking();
    state.matchmaking.error = 'Service en ligne indisponible. Réessayez dans quelques secondes.';
    return;
  }
  entrerMatchmaking();
  state.matchmaking.mode = 'resume';
  state.matchmaking.error = null;
  initOnline(supabase);
  resumeMatch(saved.matchId, saved.side, saved).then((ok) => {
    if (!ok && state.phase === 'matchmaking') {
      const message = getOnline().error || 'Cette partie ne peut plus être reprise.';
      state.matchmaking.mode = 'lobby';
      state.matchmaking.error = message;
      // Une panne réseau ou une session expirée ne doit pas détruire une reprise
      // potentiellement valide. On la retire uniquement pour un état terminal connu.
      if (/terminée ou annulée/i.test(message)) {
        state.resumeAvailable = false;
        effacerReprisePvP();
      }
    }
  });
}


// Le Plateau bonus partage le même seed dans une partie en ligne : le matchId
// Supabase est commun aux deux clients et évite tout tirage local divergent.
function seedChasseDepuisMatch(matchId) {
  const text = String(matchId || 'roychec-bonus');
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

// État initial : menu d'accueil (SPEC §1.4). Pas de plateau tant que
// l'utilisateur n'a pas choisi un mode (PvP / PvAI + difficulté).
let state = menuState();

// Responsive v1 : le menu mobile reçoit une résolution logique proche de l'écran
// pour conserver des textes et des zones tactiles lisibles. Les écrans de partie
// gardent encore leur canvas logique desktop (leur layout sera adapté dans une
// tranche dédiée, sans risquer de modifier ici la géométrie du plateau).
const MOBILE_BREAKPOINT = 768;
function estAffichageMobile() {
  return typeof window !== 'undefined' && window.innerWidth <= MOBILE_BREAKPOINT;
}

function synchroniserAffichage() {
  const mobile = estAffichageMobile();
  if (!state.ui) state.ui = { buttons: [] };
  state.ui.mobile = mobile;
  // L'accueil garde son layout mobile dédié. Pendant une partie, le plateau
  // devient pleine largeur et le panneau d'améliorations est empilé dessous.
  const gameplayModes = ['pvp', 'pvai', 'pvw', 'hunt', 'tutorial', 'learn', 'spectator'];
  const gameplayMobile = mobile && !!state.board && gameplayModes.includes(state.mode);
  // Le menu principal et le lobby en ligne partagent la même surface mobile :
  // le lobby doit lui aussi recevoir le canvas scrollable et les dimensions téléphone.
  const verticalHub = ['tutorial-hub', 'learn-hub', 'puzzle-hub', 'decks', 'deck-picker'].includes(state.phase);
  state.ui.mobileLayout = mobile && (state.phase === 'menu' || state.phase === 'matchmaking' || verticalHub);
  state.ui.mobileGameplay = gameplayMobile;
  const menuMobile = state.ui.mobileLayout;
  const targetWidth = (menuMobile || gameplayMobile)
    ? Math.max(320, Math.min(MOBILE_BREAKPOINT, Math.floor(window.innerWidth || 390)))
    : CANVAS_W;
  // Le gameplay mobile est compacté pour afficher le plateau et les contrôles
  // principaux dans la même vue ; le défilement reste disponible pour un catalogue
  // exceptionnellement long ou un écran très court.
  const targetHeight = menuMobile
    ? (state.phase === 'matchmaking' ? 720
      : state.phase === 'tutorial-hub' ? 1400
        : state.phase === 'learn-hub'
          // Apprendre reprend tout le catalogue desktop (23 niveaux) : la
          // hauteur suit le nombre réel d'entrées pour que la dernière carte
          // et les boutons de navigation restent accessibles sur téléphone.
          ? 150 + TOTAL_LEARN_GAMES * 84 + 64 + 78 + 38 + 24
          : state.phase === 'puzzle-hub'
            ? 150 + TOTAL_PUZZLES * 108 + 64 + 78 + 38 + 24
            : state.phase === 'decks' ? 1140
              : state.phase === 'deck-picker' ? 1400
                : 1020)
    : gameplayMobile
      ? state.mode === 'tutorial'
        ? 1900
        : state.panelPiece
          // Le catalogue mobile est désormais vertical : on réserve une surface
          // scrollable suffisante pour afficher toutes les cartes et leurs actions.
          ? 1680
          : Math.max(700, Math.min(980, Math.floor(window.innerHeight || 844)))
      : CANVAS_H;
  state.ui.renderWidth = targetWidth;
  state.ui.renderHeight = targetHeight;
  if (canvas.width !== targetWidth || canvas.height !== targetHeight) {
    canvas.width = targetWidth;
    canvas.height = targetHeight;
  }
}

window.addEventListener('resize', synchroniserAffichage, { passive: true });
// Phase A.5 v2 Phase 3 : expose la sélection actuelle au menu pour le tracé
// (state.menu.taille defaut 'std'). Au clic sur un chip TAILLE → actionBouton.

// --- Ponts avec la transformation de VUE (« moi en bas » en PvP en ligne) ---
// La rotation 180° vit uniquement dans vueCase (render.js). Ici on l'applique aux
// deux frontières RENDU/ENTRÉE côté main.js, sans jamais toucher state.board ni le
// réseau (qui restent ABSOLUS). vueCase est une involution : la même formule sert à
// convertir pixel-affiché→case-absolue et case-absolue→pixel-affiché.
// Case ABSOLUE (index de state.board) depuis un pixel écran cliqué.
function caseDepuisPixel(x, y) {
  const cell = pixelVersCase(x, y);
  return cell ? vueCase(state, cell.r, cell.c) : null;
}
// Centre pixel AFFICHÉ d'une case absolue (anim/popups suivent la vue retournée).
function centreVue(r, c) {
  const v = vueCase(state, r, c);
  return cellCenter(v.r, v.c);
}

function menuState() {
  return {
    phase: 'menu',
    mode: null,
    ai: null,
    board: null,
    turn: null,
    winner: null,
    // Champs requis par update() (filter popups/flashes) et par le reste du
    // code : manquants en v1, ils faisaient crasher la boucle de rendu dès la
    // première frame et le menu restait vide (rapport cycle 1 v0).
    selected: null,
    legalMoves: [],
    panelPiece: null,
    ruTargets: [],
    chain: null,
    anim: null,
    popups: [],
    flashes: [],
    _cavEnemyCell: null,
    buzz: 0,
    ecus: [0, 0],
    replay: null,
    _replayTimer: null,
    _replayList: [],
    _dashboardReplay: null,
    _dashboardReplayKey: null,
    _hasReplays: false,
    resumeAvailable: !!lireReprisePvP(),
    menu: { difficulty: null,
             themeMode,
             language,
             // Variantes locales (GDD §7.2 v3) : TROIS axes orthogonaux combinés
             // librement (3 économie × 2 combat × 2 taille = 12). Phase A.5 v2
             // Phase 3 ajoute l'axe TAILLE (std 8×8 / l15 8×15) avec silent
             // fallback std côté engine pour modes hors scope hot-seat (§7.2).
             // Le toggle « showVariant » déplie l'accordéon au menu d'accueil.
             showVariant: false,
             activeMode: 'pvw',
             economie: 'standard',
             combat: 'standard',
             taille: DEFAULT_TAILLE,   // 'std' par défaut (legacy MVP v2 byte-équivalent)
           },
    ui: { buttons: [], hamburgerOpen: false, drawerTab: 'account' },
  };
}

function commencerPartie(mode, difficultyOrOptions) {
  if (mode === 'pvw') {
    // Mode PvP en ligne (spec-pvp-online). difficultyOrOptions = { side, matchId, oppPseudo, oppTrophies, cadence, variant }.
    const opts = difficultyOrOptions || {};
    const tempsInitial = (opts.cadence | 0) || PVW_TEMPS_INITIAL;
    // Variante (GDD §7.2 v3.1) : le public et le privé utilisent la variante
    // sélectionnée au menu ; la file publique reste Standard × Standard.
    // Les DEUX clients reçoivent le même id serveur → économies identiques → hash §5.4 OK.
    // La taille est une clé de file côté serveur : bonus peut donc jouer en public,
    // mais uniquement contre un autre joueur bonus (hors classement).
    // Le serveur filtre la file par taille : aucun client bonus ne rencontre
    // un client std/l15, ce qui garantit le lockstep et le même tirage bonus.
    const tailleOnline = opts.taille || DEFAULT_TAILLE;
    const bonusSeed = tailleOnline === 'bonus' ? seedChasseDepuisMatch(opts.matchId) : undefined;
    state = creerEtat({ mode: 'pvw', difficulty: 1, variantId: opts.variant || DEFAULT_VARIANT, taille: tailleOnline, huntRngSeed: bonusSeed });
    state.activeDeck = getActiveDeck(loadDecks());
    if (state.bonusMode) {
      initialiserChasse(state);
    }
    state.pvw = {
      side: opts.side != null ? opts.side : 0,   // 0 = Bleu = trait, 1 = Corail
      matchId: opts.matchId || null,
      oppPseudo: opts.oppPseudo || 'Adversaire',
      oppTrophies: opts.oppTrophies || 0,
      // --- Horloge (§6) : cadence choisie, sans incrément (v3.1) ---      cadence: tempsInitial,          // temps initial par joueur (s) — sert à « Nouvelle partie » (même cadence)
          variant: state.variant.id,      // variante effective (privé) — affichage HUD/fin de partie
          taille: state.taille,           // Phase A.5 v2 : taille plateau miroir du state.taille (lockstep cross-client)
      clocks: [tempsInitial, tempsInitial], // secondes restantes par camp
      activeClock: 0,                 // horloge qui tourne (side 0 a le trait)
      clockT0: performance.now(),     // instant de départ de l'horloge active
      clockDisplay: [tempsInitial, tempsInitial], // valeurs live pour le rendu
      // --- Lockstep ---
      applyingRemote: false,          // true pendant l'application d'une action réseau (suppression d'émission)
      _pendingHash: null,             // hash local capté au point d'émission (vérif §5.4)
      _lastTurn: 0,                   // suivi de bascule de tour pour l'horloge
      desync: false,                  // hash discordant détecté (§3.4)
      ended: false,                   // partie terminée (fige horloge + file)
      endReason: null,                // 'time' | 'resign' | 'abandon' | null (capture du roi)
      draw: false,                    // départage nul (§6.3)
      // --- CYCLE W3 : robustesse ---
      oppDisconnected: false,         // fenêtre de reconnexion 30 s ouverte (§7.2)
      oppDcT0: 0,                     // instant d'ouverture de la fenêtre (performance.now)
      _gapT0: 0,                      // instant de détection d'un trou de seq (resync si persistant)
      voided: false,                  // match annulé (désync confirmée) — aucun trophée (§3.4)
      rematch: null,                  // { offeredByMe, offeredByOpp, declined } — revanche (§9.4)
    };
    sauverReprisePvP({
      matchId: state.pvw.matchId,
      side: state.pvw.side,
      oppPseudo: state.pvw.oppPseudo,
      oppTrophies: state.pvw.oppTrophies,
      cadence: state.pvw.cadence,
      variant: state.pvw.variant,
      taille: state.pvw.taille,
    });
    initReplay(state);
    if (state.bonusMode) {
      state.replay.huntBonuses = state.huntBonuses.map((cell) => cell ? { ...cell } : null);
      state.replay.huntRngSeed = state.huntRngSeed;
    }
    startPlaying();                   // online.js : passage en partie, remise seq/inbox à 0
    if (opts.resume) requestResync(); // après un rechargement, l'adversaire renvoie l'état vérité
    return;
  }
  // Variantes locales (GDD §7.2) : variantePourMode force le fallback 'pvp_standard'
  // pour TOUT mode hors 'pvp' (= PvAI, spectateur ; le PvP en ligne PRIVÉ passe par la
  // branche pvw ci-dessus avec opts.variant, jamais par ici — v3.1) —
  // journalise un warning si l'utilisateur a sélectionné une variante (qui ne
  // s'appliquera donc pas). La sélection reste conservée en state.menu.
  const variantId = variantePourMode(mode, (difficultyOrOptions && difficultyOrOptions.variantId) || DEFAULT_VARIANT);
  // Phase A.5 v2 Phase 3 : plumb taille du plateau depuis state.menu.taille.
  // [00:10] Élargit le scope : l15 désormais autorisé pour 'pvp' (hot-seat), 'pvai'
  // (Ordinateur) et 'spectator'. Le scope 'pvw' (PvP en ligne) est géré séparément
  // dans la branche pvw ci-dessus (opts.taille du serveur : public = std forcé,
  // private = taille imposée par le créateur via createPrivate).
  // Modes locaux : on prend state.menu.taille directement.
  const tailleInput = state.menu && state.menu.taille;
  const tailleEffective = (mode === 'pvp' || mode === 'pvai' || mode === 'spectator' || mode === 'hunt')
    ? (tailleInput || DEFAULT_TAILLE)
    : DEFAULT_TAILLE;
  // En local, le tirage reste différent à chaque partie. Le seed partagé par
  // matchId est réservé aux parties PvP en ligne bonus.
  const huntSeed = null;
  state = creerEtat({ mode, difficulty: (difficultyOrOptions && difficultyOrOptions.difficulty) || 1, variantId, taille: tailleEffective, huntRngSeed: huntSeed });
  state.activeDeck = getActiveDeck(loadDecks());
  initReplay(state);
  if (state.bonusMode) {
    initialiserChasse(state);
    // Le replay doit pouvoir afficher les deux cases réservées dès son ouverture,
    // avant même la première récolte.
    state.replay.huntBonuses = state.huntBonuses.map((cell) => cell ? { ...cell } : null);
    state.replay.huntRngSeed = state.huntRngSeed;
  }
  if (mode === 'spectator') planifierCoupIA();
}

function retourMenu() {
  state._cavEnemyCell = null;
  // Nettoie le timer replay si on quitte pendant une lecture.
  if (state._replayTimer) { clearTimeout(state._replayTimer); state._replayTimer = null; }
  // Nettoie le matchmaking en cours (canal Realtime, timers, Presence).
  if (state.phase === 'matchmaking' || state.mode === 'pvw') onlineLeave();
  state = menuState();
}

// ---------- Mode Replay (lecture d'une partie enregistrée) ----------

const REPLAY_SPEEDS = [0, 1200, 600, 200]; // index 0 inutilisé, 1=lent, 2=normal, 3=rapide

// Décode une notation algébrique (ex. 'a1', 'o8', 'a10') en indices board.
// boardOrRows permet d'adapter la rangée à la hauteur réelle du plateau.
function fromAlgebraic(s, boardOrRows) {
  if (typeof s !== 'string' || !s.length) return null;
  const rows = (boardOrRows && boardOrRows.rows) || boardOrRows || 8;
  return { r: rows - parseInt(s.slice(1)), c: s.charCodeAt(0) - 97 };
}

function commencerReplay(replayData) {
  const taille = replayData.taille || DEFAULT_TAILLE;
  state = {
    phase: 'replay',
    mode: 'replay',
    board: creerPlateau(taille),
    taille,
    turn: 0,
    ecus: [0, 0],
    winner: null,
    ai: null,
    selected: null,
    legalMoves: [],
    panelPiece: null,
    ruTargets: [],
    chain: null,
    anim: null,
    popups: [],
    flashes: [],
    buzz: 0,
    replay: null,
    replayData,
    // État minimal du mode Chasse nécessaire à la lecture des récompenses
    // enregistrées dans les événements `hunt-award`.
    huntBonuses: replayData.huntBonuses
      ? replayData.huntBonuses.map((cell) => cell ? { ...cell } : null)
      : [null, null],
    huntCollected: [0, 0],
    huntLastAward: null,
    bonusMode: replayData.taille === 'bonus',
    huntRngSeed: replayData.huntRngSeed >>> 0,
    replayIndex: -1,
    replayPlaying: true,
    replaySpeed: 2,
    _replayTimer: null,
    menu: null,
    ui: { buttons: [] },
  };
  avancerReplay();
}

function avancerReplay() {
  if (state.phase !== 'replay' || !state.replayPlaying) return;
  const data = state.replayData;
  state.replayIndex++;
  if (state.replayIndex >= data.events.length) {
    // Fin du replay.
    state.replayPlaying = false;
    return;
  }
  const e = data.events[state.replayIndex];
  executerEvenementReplay(e);
  // Planifier le prochain événement.
  const delay = REPLAY_SPEEDS[state.replaySpeed] || 600;
  clearTimeout(state._replayTimer);
  state._replayTimer = setTimeout(() => avancerReplay(), delay);
}

function avancerTourReplay(owner) {
  state.turn = 1 - owner;
  for (const row of state.board) {
    for (const p of row) {
      if (!p) continue;
      if (p.epineZone && p.epineZone.owner !== state.turn) {
        p.epineZone.turns--;
        if (p.epineZone.turns <= 0) p.epineZone = null;
      }
      if (p.owner !== state.turn) continue;
      for (const key of Object.keys(p.cooldowns)) {
        if (p.cooldowns[key] > 0) p.cooldowns[key]--;
      }
      for (const key of Object.keys(p.debuffs)) {
        if (p.debuffs[key] > 0) p.debuffs[key]--;
        if (p.debuffs[key] <= 0) delete p.debuffs[key];
      }
    }
  }
}

function executerEvenementReplay(e) {
  if (e.type === 'move') {
    const from = fromAlgebraic(e.from, state.board);
    const to = fromAlgebraic(e.to, state.board);
    if (!from || !to) return;
    const piece = state.board[from.r][from.c];
    if (!piece) return;
    // Capture
    if (e.captured) {
      state.board[to.r][to.c] = null;
      state.flashes.push({ r: to.r, c: to.c, t0: performance.now(), color: 'red' });
    }
    // Déplacement
    state.board[from.r][from.c] = null;
    piece.r = to.r; piece.c = to.c;
    piece.aBouge = true;
    if (e.grandSaut) piece.cooldowns['grand-saut'] = UPGRADES['grand-saut'].cooldown;
    if (e.hauteFuite) piece.cooldowns['haute-fuite'] = UPGRADES['haute-fuite'].cooldown;
    state.board[to.r][to.c] = piece;
    // Roque (GDD §5.1.b) : rejoue aussi le déplacement de la tour.
    if (e.castle) {
      const rf = fromAlgebraic(e.castle.rookFrom, state.board), rt = fromAlgebraic(e.castle.rookTo, state.board);
      if (!rf || !rt) return;
      const rook = state.board[rf.r][rf.c];
      if (rook) {
        state.board[rf.r][rf.c] = null;
        rook.r = rt.r; rook.c = rt.c;
        state.board[rt.r][rt.c] = rook;
      }
    }
    // Promotion (GDD §5.1.b) : le pion change de type, améliorations perdues.
    if (e.promo) {
      piece.type = e.promo;
      piece.upgrades = [];
      piece.shield = false;
      piece.cooldowns = {};
      piece._goldT = performance.now();
    }
    state.ecus[e.owner] += e.gain != null ? e.gain : (REVENU_PAR_COUP + (e.bonus || 0));
    // Popup écus — gain total crédité (inclut revenueBase × REVENU_PAR_COUP + bonus × captureMul).
    const credite = e.gain != null ? e.gain : (REVENU_PAR_COUP + (e.bonus || 0));
    const { x, y } = centreVue(to.r, to.c);
    state.popups.push({ text: `+${credite}`, x, y: y - 20, t0: performance.now(), color: UI_THEME.amberLight });
    avancerTourReplay(e.owner);
  } else if (e.type === 'purchase') {
    const pos = fromAlgebraic(e.pos, state.board);
    if (!pos) return;
    const piece = state.board[pos.r][pos.c];
    if (!piece) return;
    piece.upgrades.push(e.upgrade);
    if (['forteresse', 'bouclier', 'monture', 'couronne', 'majeste', 'Zone'].includes(e.upgrade)) piece.shield = true;
    piece._goldT = performance.now();
    state.ecus[e.owner] -= e.cost;
  } else if (e.type === 'hunt-award') {
    // Une récompense de Chasse est une action distincte du déplacement qui l'a
    // déclenchée : on restaure l'amélioration sur la pièce et la nouvelle case
    // bonus pour que la suite du replay reste fidèle.
    const pos = fromAlgebraic(e.pos, state.board);
    const piece = pos && state.board[pos.r] ? state.board[pos.r][pos.c] : null;
    if (!piece || piece.owner !== e.owner) return;
    if (e.upgrade && !piece.upgrades.includes(e.upgrade)) piece.upgrades.push(e.upgrade);
    if (e.upgrade && ['forteresse', 'bouclier', 'monture', 'couronne', 'majeste', 'Zone'].includes(e.upgrade)) {
      piece.shield = true;
    }
    if (!state.huntBonuses) state.huntBonuses = [null, null];
    if (!state.huntCollected) state.huntCollected = [0, 0];
    state.huntCollected[e.owner] = (state.huntCollected[e.owner] || 0) + 1;
    state.huntBonuses[e.owner] = e.nextCell ? { ...e.nextCell } : null;
    state.huntLastAward = {
      owner: e.owner,
      piece,
      upgradeId: e.upgrade || null,
      cell: e.cell ? { ...e.cell } : null,
      nextCase: e.nextCell ? { ...e.nextCell } : null,
    };
    piece._goldT = performance.now();
  } else if (e.type === 'power') {
    // Les anciens replays n'ont pas de position : on conserve leur recherche
    // tolérante. Les nouveaux événements ciblent précisément la pièce source.
    const pos = e.pos ? e.pos : null;
    const source = pos && state.board[pos.r] ? state.board[pos.r][pos.c] : null;
    let found = source && source.owner === e.owner && source.type === e.piece ? source : null;
    if (!found) {
      for (const row of state.board) {
        for (const p of row) {
          if (p && p.type === e.piece && p.owner === e.owner) { found = p; break; }
        }
        if (found) break;
      }
    }
    if (found) {
      if (e.power === 'Épine') {
        found.cooldowns.epine = UPGRADES.epine.cooldown;
        found.epineZone = { r: found.r, c: found.c, owner: found.owner, turns: 3 };
      }
      state.flashes.push({ r: found.r, c: found.c, t0: performance.now(), color: 'cyan' });
    }
    // Tous les pouvoirs actifs consomment le tour dans le moteur actuel.
    avancerTourReplay(e.owner);
  }
}

// ---------- Fin de partie (roi capturé) ----------
// Point d'accroche UNIQUE de la feature trophées (spec-online §5.2/§8) : toutes les
// captures de roi passent par ici. Le moteur d'échecs n'est pas modifié — on ne fait
// que centraliser la transition vers 'gameover' pour y brancher un seul hook.
function finPartie(winner) {
  state.winner = winner;   // 0 | 1 | null (null = nulle au départage, mode pvw §6.3)
  state.phase = 'gameover';
  // PvP en ligne : fige l'horloge et la file d'application (§10).
  if (state.mode === 'pvw' && state.pvw) {
    state.pvw.ended = true;
    state.pvw.draw = (winner === null);
    state.pvw.oppDisconnected = false; // ferme toute fenêtre de reconnexion en cours
    effacerReprisePvP();
  }
  // Tutoriel : pas de replay, pas de trophées.
  if (state.mode !== 'tutorial') {
    finalizeReplay(state);
    // updateBook n'a de sens qu'avec un vainqueur (une nulle pvw passe winner=null).
    if (state.replay && state.replay.events && winner != null) {
      updateBook(state.replay.events, winner, state.replay.taille);
    }
    // PvP en ligne (CYCLE W3, spec §3.5/§8) : SEULE source de trophées du jeu. Chaque
    // client rapporte son résultat ; l'Elo K=32 n'est écrit côté serveur que si les deux
    // rapports concordent. Le PvAI n'écrit RIEN (hookTrophees
    // débranché) — QA-PVW-18.
    if (state.mode === 'pvw' && state.pvw) reporterResultatPvP();
  }
}

// Rapporte le résultat PvP au serveur et alimente l'écran de fin (delta Elo animé).
// state.trophy suit le même contrat que l'ancien bloc PvAI (pending → résolu) pour
// réutiliser dessineBlocTrophee. Le serveur exige désormais deux rapports concordants
// pour attribuer des trophées ; un abandon local peut donc rester non classé.
function reporterResultatPvP() {
  const p = state.pvw;
  const won = state.winner === p.side;
  const result = state.winner === null ? 'draw' : (won ? 'win' : 'loss');
  const prev = getAccount().trophies || 0;
  state.trophy = { pending: true, won, prev, delta: 0, total: prev, t0: performance.now() };
  onlineReport(result).then((res) => {
    // total serveur si appliqué ; sinon on garde prev (aucun trophée écrit) + note.
    const total = (res.applied && res.total != null) ? res.total : prev;
    state.trophy = {
      pending: false, won, prev,
      delta: res.applied ? res.delta : 0,
      total,
      applied: res.applied,
      status: res.status,
      error: !res.applied,          // dessineBlocTrophee affiche « non sauvegardé »
      disputed: res.status === 'disputed',
      t0: performance.now(),
    };
    if (total !== prev) getAccount().trophies = total; // reflète le menu au retour
  });
}

// hookTrophees (PvAI) SUPPRIMÉ (W3, 2026-07-12) — débranché depuis le 09/07 (décision
// trophées = PvP public only), son successeur réel est reporterResultatPvP() ci-dessus
// et la RPC apply_match_result qu'il appelait est révoquée côté Supabase
// (schema-pvp-w3.sql §3). L'écran de victoire PvAI n'affiche aucun bloc trophée
// (state.trophy n'est posé qu'en pvw).

// Directions orthogonales (pour Rempart : blindage des alliés adjacents).
const ORTHO = [[-1, 0], [1, 0], [0, -1], [0, 1]];
// Phases de ciblage d'un pouvoir actif (clic = choix d'une cible).
const PHASES_CIBLAGE = ['ruee-target', 'rayon-target', 'decret-target', 'cavalerie-target', 'cavalerie-push', 'echange-target', 'vet-target'];

// Vrai si la pièce est sous S.H.T. et ne peut utiliser aucune amélioration.
function ameliorationsBloquees(p) {
  return !!(p.debuffs && p.debuffs.sht > 0);
}

// ---------- Sélection ----------
// Coups légaux d'une pièce, filtrés par l'étape du tutoriel : les coups
// verrouillés ne sont même pas affichés — le joueur ne voit que le chemin prévu.
function coupsAutorises(piece) {
  const ms = coupsLegaux(state.board, piece);
  if (state.mode === 'tutorial') {
    return ms.filter((m) => tutorielPermet(state, { type: 'move', piece, move: m }));
  }
  if (state.mode === 'learn') {
    // Apprendre montre tous les déplacements que la pièce pourrait faire.
    // Le clic est filtré séparément par learnPermet() : les points non attendus
    // restent visibles mais verrouillés pour rendre la règle compréhensible.
    return ms;
  }
  return ms;
}

function selectionner(piece) {
  if (state.mode === 'learn' && !learnPermet(state, { type: 'select', piece })) {
    refusApprendre(piece);
    return;
  }
  state.selected = piece;
  state.legalMoves = coupsAutorises(piece);
  state.panelPiece = null;
  if (!PHASES_CIBLAGE.includes(state.phase)) {
    state.phase = state.phase === 'gameover' ? 'gameover' : 'play';
  }
}

function recalculerCoups() {
  if (state.selected) state.legalMoves = coupsAutorises(state.selected);
}

function deselectionner() {
  if (state.chain) return; // enchaînement en cours : la pièce reste sélectionnée
  state.selected = null;
  state.legalMoves = [];
  state.panelPiece = null;
  if (PHASES_CIBLAGE.includes(state.phase)) state.phase = 'play';
  state.ruTargets = [];
}

// ---------- Économie ----------
function gagnerEcus(joueur, baseRevenue, captureBonus, atCell) {
  // Crédite un coup joué : applique le revenu de base (revenueBase 0 ou 1 sur
  // REVENU_PAR_COUP) ET le bonus de capture multiplié par captureMul (GDD §5.2.b +
  // §7.2 v3). Plafonné par v.plafond (Infinity « Illimité » géré nativement par
  // Math.min). Renvoie le montant EFFECTIVEMENT crédité — utilisé par crediterCoup()
  // pour la fidélité du replay sous variantes non-standards (cf. code-review 12/07).
  const v = state.variant;
  const montant = (v.revenueBase > 0 ? baseRevenue : 0) + (captureBonus || 0) * v.captureMul;
  const avant = state.ecus[joueur];
  state.ecus[joueur] = Math.min(v.plafond, avant + montant);
  const gagne = state.ecus[joueur] - avant;
  if (gagne > 0 && atCell) {
    const { x, y } = centreVue(atCell.r, atCell.c);
    state.popups.push({ text: `+${gagne}`, x, y: y - 20, t0: performance.now(), color: UI_THEME.amberLight });
  }
  return gagne;
}

// Crédit complet d'un coup joué = revenu de base + bonus de capture + (éventuelle)
// injection de stagnation. Renvoie le TOTAL crédité, utilisé par recordMove() et
// recordPower() pour la fidélité du replay (cf. code-review 12/07 — ne PAS appeler
// gagnerEcus + stagnationTick séparément puis sommer les deux : ce serait équivalent
// fonctionnellement avec deux variables intermédiaires ; ici on mutualise pour DRY).
// wasCapture = le coup a-t-il effectivement capturé (true) ou pas (false) — Information
// consommée par stagnationTick pour incrémenter / reset / injecter.
function crediterCoup(joueur, baseRevenue, captureBonus, atCell, wasCapture) {
  const base = gagnerEcus(joueur, baseRevenue, captureBonus, atCell);
  const stagn = stagnationTick(state, wasCapture);
  return base + stagn;
}

function addFlash(r, c, color) {
  state.flashes.push({ r, c, t0: performance.now(), color });
}

// Tutoriel : feedback visuel quand l'étape verrouille l'action cliquée.
function refusTutoriel(cell) {
  const { x, y } = centreVue(cell.r, cell.c);
  state.popups.push({ text: '🔒', x, y: y - 10, t0: performance.now(), color: UI_THEME.muted });
}

function refusApprendre(pieceOrCell) {
  const cell = pieceOrCell && pieceOrCell.r != null
    ? pieceOrCell
    : state.learnExpectedPiece;
  if (!cell) return;
  const { x, y } = centreVue(cell.r, cell.c);
  state.popups.push({ text: '🔒 ACTION GUIDÉE', x, y: y - 10, t0: performance.now(), color: UI_THEME.muted });
  state.buzz = performance.now();
}

function autorisePouvoir(kind) {
  const tutorialOk = tutorielPermet(state, { type: 'power', kind });
  const learnOk = state.mode !== 'learn'
    || learnPermet(state, { type: 'power', kind, piece: state.selected });
  if (!tutorialOk || !learnOk) {
    if (state.mode === 'learn') refusApprendre(state.selected);
    return false;
  }
  return true;
}

// ---------- Fin de tour ----------
function planifierReponsePuzzle() {
  if (state.mode !== 'learn' || state.learnKind !== 'puzzle'
      || !state.puzzlePurchased || state.puzzleResponseDone || state.puzzleResponsePending) return;
  const response = puzzleReponse(state);
  if (!response) return;
  const piece = state.board[response.from.r] && state.board[response.from.r][response.from.c];
  const target = state.board[response.to.r]?.[response.to.c] || null;
  const blockedCapture = !!response.shieldedCapture;
  if (!piece || piece.owner !== 1 || (!blockedCapture && target)) return;
  // Même si la ligne est scénarisée, elle doit rester un vrai coup du moteur :
  // une position tactique ne doit jamais être réparée par une mutation arbitraire.
  const legal = blockedCapture
    ? target && target.owner !== piece.owner
      && coupsLegaux(state.board, piece).some((move) => move.r === response.to.r && move.c === response.to.c)
    : coupsLegaux(state.board, piece).some((move) => move.r === response.to.r && move.c === response.to.c);
  if (!legal) {
    state.puzzleResponsePending = false;
    state.puzzleFeedback = 'La réponse adverse ne peut pas être jouée dans cette position. Recommence le puzzle.';
    return;
  }

  state.puzzleResponsePending = true;
  state.phase = 'animating';
  const termineReponse = () => {
    marquerPuzzleReponse(state);
    state.puzzleFeedback = response.text || '';
    state.flashes.push({ r: response.to.r, c: response.to.c, t0: performance.now(), color: response.color || '#B86F6B' });
    state.popups.push({
      text: response.text || 'Réponse adverse',
      x: centreVue(response.to.r, response.to.c).x,
      y: centreVue(response.to.r, response.to.c).y - 24,
      t0: performance.now(),
      color: response.color || '#B86F6B',
    });
    state.phase = 'puzzle-game';
  };
  // Une capture absorbée par Couronne est mise en scène sans modifier la position
  // logique du roi adverse : il approche la reine, puis revient sur sa case.
  if (blockedCapture) {
    target.shield = false;
    state.puzzleShieldUsed = true;
    state.anim = {
      piece,
      from: centreVue(response.from.r, response.from.c),
      to: centreVue(response.to.r, response.to.c),
      t0: performance.now(),
      onDone() {
        state.anim = {
          piece,
          from: centreVue(response.to.r, response.to.c),
          to: centreVue(response.from.r, response.from.c),
          t0: performance.now(),
          onDone: termineReponse,
        };
      },
    };
    return;
  }

  state.board[response.from.r][response.from.c] = null;
  piece.r = response.to.r;
  piece.c = response.to.c;
  piece.aBouge = true;
  state.board[response.to.r][response.to.c] = piece;
  state.anim = {
    piece,
    from: centreVue(response.from.r, response.from.c),
    to: centreVue(response.to.r, response.to.c),
    t0: performance.now(),
    onDone: termineReponse,
  };
}

function finDeTour() {
  // Tutoriel : pas d'adversaire — le tour revient toujours au joueur (les pièces
  // corail sont un décor piloté par les étapes). Sans ce garde, le tour passerait
  // au camp 1 que personne ne contrôle et le tutoriel resterait figé.
  state.turn = (state.mode === 'tutorial' || state.mode === 'learn') ? 0 : 1 - state.turn;
  state.chain = null;
  state.selected = null;
  state.legalMoves = [];
  state.panelPiece = null;
  state.ruTargets = [];
  state._cavEnemyCell = null;
  state.phase = state.mode === 'learn'
    ? (state.learnKind === 'puzzle' ? 'puzzle-game' : 'learn-game')
    : 'play';
  // Début du tour du nouveau joueur actif (GDD §5.4).
  for (const row of state.board) {
    for (const p of row) {
      if (!p) continue;
      // Épine compte les tours du camp adverse, même si le pion source a bougé.
      // Le gel est donc décrémenté séparément de l'entretien de la pièce active.
      if (p.epineZone && p.epineZone.owner !== state.turn) {
        p.epineZone.turns--;
        if (p.epineZone.turns <= 0) p.epineZone = null;
      }
      if (p.owner !== state.turn) continue;
      // Rempart : le blindage temporaire expire au prochain tour du joueur
      // (GDD §6 Tour). Le parcours classique n'a pas de tour adverse réel : on
      // conserve le blindage pour que la démonstration puisse être observée et
      // validée après l'activation.
      if (p.rempartGranted && !(state.mode === 'learn' && state.learnKeepRempart)) {
        p.rempartGranted = false;
        if (p.shield) p.shield = false;
      }
      // Décrément des cooldowns.
      for (const k of Object.keys(p.cooldowns)) {
        if (p.cooldowns[k] > 0) p.cooldowns[k]--;
      }
      // Décrément des debuffs.
      for (const k of Object.keys(p.debuffs)) {
        if (p.debuffs[k] > 0) p.debuffs[k]--;
        if (p.debuffs[k] <= 0) delete p.debuffs[k];
      }
    }
  }
  if (state.mode === 'learn' && state.learnKind === 'puzzle') {
    planifierReponsePuzzle();
  }
  // Hook IA : si c'est maintenant le tour du bot, planifier son coup.
  planifierCoupIA();
}

// Planifie le coup du bot avec un délai humain : 350 ms en PvAI (lisible mais
// réactif), 800 ms en spectateur (temps d'observer). Cycle 1 = coup aléatoire.
// Cycle 2 = 1-ply greedy (niv. 2) / 2-ply α-β (niv. 3).
function planifierCoupIA() {
  if (!state.ai) return;
  if (state.phase !== 'play') return;
  // Spectateur : les deux camps sont IA — on contourne la vérification de player.
  if (state.mode === 'pvai' && state.turn !== state.ai.player) return;
  if (state.ai.thinking) return;
  state.ai.thinking = true;
  // Spectateur : l'IA joue pour le camp dont c'est le tour.
  if (state.mode === 'spectator') state.ai.player = state.turn;
  // Capture le tour prévu AVANT le setTimeout : si l'utilisateur annule la chaîne
  // (Space) ou si un gameover survient entre-temps, le turn aura changé et on
  // abandonnera proprement (anti race condition).
  const intendedTurn = state.turn;
  // Chaîne : délai raccourci (200ms) pour garder le rythme, les coups
  // chaînés font partie du même tour logique.
  const delay = state.chain ? 200 : (state.mode === 'spectator' ? 800 : 350);
  setTimeout(() => {
    // Re-vérifie que c'est toujours le tour de l'IA (spectateur : un gameover,
    // un Spacebar annulant la chaîne ou un retourMenu() a pu survenir entre-temps).
    if (state.phase !== 'play' || state.turn !== intendedTurn) {
      if (state.ai) state.ai.thinking = false;
      // Si le tour a changé mais qu'on est toujours en jeu (ex. Spacebar en
      // spectateur), relancer pour ne pas laisser le jeu figé.
      if (state.phase === 'play') planifierCoupIA();
      return;
    }
    try {
      let tour;
      // Chaîne en cours (Double coup 1er move / Second galop 1er move) : l'IA
      // ne passe pas par iaDecideTour() qui génère TOUS les coups de TOUTES les
      // pièces. On utilise state.selected et state.legalMoves déjà posés par
      // resoudreApresCoup() (filtrés pour Second galop : pas de capture).
      if (state.chain && state.selected && state.legalMoves.length) {
        const mv = state.legalMoves[Math.floor(Math.random() * state.legalMoves.length)];
        tour = { mouvement: { piece: state.selected, move: mv }, achats: [], pouvoir: null };
      } else if (state.chain) {
        // Chaîne sans coup légal (ex. Second galop sans case non-capture) : abandon.
        if (state.ai) state.ai.thinking = false;
        state.chain = null;
        finDeTour();
        return;
      } else {
        tour = iaDecideTour(state);
      }
      if (state.ai) state.ai.thinking = false;
      if (!tour) { finDeTour(); return; }

      // Achats (SPEC §1.3 v2) : phase pré-mouvement, 0 à N cartes exécutées avant le
      // coup (chaque achat est débité du solde par acheter(), qui enregistre aussi le
      // replay via recordPurchase). Les cibles peuvent différer de la pièce déplacée ;
      // seul panelPiece est requis (acheter() n'utilise pas state.selected).
      if (tour.achats && tour.achats.length) {
        for (const a of tour.achats) {
          state.panelPiece = a.target;
          acheter(a.upgradeId);
        }
        state.panelPiece = null;
      }

      // Pouvoir actif choisi par l'IA (ex. Épine) : consomme le tour (GDD §6).
      // Le pouvoir est exécuté au lieu du mouvement — jamais les deux dans le même
      // tour, ce qui préserve le déterminisme du moteur (hash lockstep en ligne).
      if (tour.pouvoir && tour.pouvoir.piece) {
        const powerPiece = state.board[tour.pouvoir.piece.r]
          ? state.board[tour.pouvoir.piece.r][tour.pouvoir.piece.c]
          : null;
        if (powerPiece && powerPiece.owner === state.turn) {
          state.selected = powerPiece;
          if (tour.pouvoir.kind === 'epine') activerEpine();
          else { state.selected = null; finDeTour(); }
          return;
        }
        // Pièce introuvable : on retombe sur le mouvement (le coup reste valide).
      }

      if (tour.mouvement) {
        // Promotion (GDD §5.1.b) : l'IA choisit toujours la Dame, sans panneau.
        if (tour.mouvement.move.promotion) tour.mouvement.move = { ...tour.mouvement.move, promo: 'Q' };
        // Chaîne : state.selected est déjà la pièce chaînée (posé par
        // resoudreApresCoup). Évite de rappeler selectionner() qui recalculerait
        // les coups légaux et écraserait le filtrage Second galop.
        if (!state.chain) selectionner(tour.mouvement.piece);
        jouerCoup(tour.mouvement.piece, tour.mouvement.move);
      } else {
        finDeTour();
      }
    } catch (e) {
      console.warn('[AI]', e);
      if (state.ai) state.ai.thinking = false;
      deselectionner();
    }
  }, delay);
}

// Vrai si le joueur dont c'est le tour est contrôlé par l'IA.
function estTourIA() {
  if (!state.ai) return false;
  if (state.mode === 'spectator') return true;
  return state.turn === state.ai.player;
}

// Lorsque l'IA initie une chaîne (Double coup / Second galop), resoudreApresCoup
// ne passe pas par finDeTour() → planifierCoupIA() doit être appelé manuellement.
// estTourIA() couvre à la fois le PvAI (tour du bot) et le mode spectateur.
function resoudreApresCoup(piece, canChain, wasCapture) {
  // Double coup (dame) : usage unique, rejoue immédiatement, ne consomme pas le tour (GDD §6).
  if (piece.type === 'Q' && piece.upgrades.includes('double-coup') && !piece.doubleCoupUsed) {
    if (state.chain && state.chain.piece === piece && state.chain.type === 'double-coup') {
      // C'était le 2e coup : Double coup consommé.
      piece.doubleCoupUsed = true;
      finDeTour();
      return;
    }
    if (canChain) {
      // 1er coup : la dame rejoue immédiatement.
      state.chain = { piece, type: 'double-coup' };
      state.phase = 'play';
      selectionner(piece);
      if (estTourIA()) planifierCoupIA();
      return;
    }
  }
  // Second galop (cavalier) : après un saut SANS capture, enchaîne un 2e saut (jamais une
  // capture), cooldown 3. Déclinable avec Espace/bouton sans poser le cooldown (GDD §6).
  if (piece.type === 'N' && piece.upgrades.includes('second')) {
    if (state.chain && state.chain.piece === piece && state.chain.type === 'second-galop') {
      // C'était le 2e saut : cooldown posé, le tour est consommé.
      piece.cooldowns.second = UPGRADES['second'].cooldown;
      finDeTour();
      return;
    }
    if (canChain && !wasCapture && (piece.cooldowns.second || 0) === 0) {
      state.chain = { piece, type: 'second-galop' };
      state.phase = 'play';
      selectionner(piece);
      state.legalMoves = state.legalMoves.filter((m) => !m.capture); // 2e saut : jamais de capture
      if (estTourIA()) planifierCoupIA();
      return;
    }
  }
  finDeTour();
}

// ---------- Exécution d'un coup ----------
function jouerCoup(piece, mv) {
  const from = { r: piece.r, c: piece.c };
  const cible = state.board[mv.r][mv.c];

  // Cas blindage : la capture est absorbée, l'attaquant reste sur place (GDD §5.5).
  if (cible && cible.owner !== piece.owner && cible.shield) {
    cible.shield = false;
    addFlash(mv.r, mv.c, 'cyan');
    // Coup joué sans capture effective : bonus = 0 (la capture a été annulée). Le
    // revenu de base est appliqué via state.variant.revenueBase (0 en élim. ×2).
    // Pas de recordMove : l'attaquant reste sur place, or rejouer un event move
    // déplacerait la pièce sur la case du défenseur (executerEvenementReplay).
    crediterCoup(state.turn, REVENU_PAR_COUP, 0, from, false);
    resoudreApresCoup(piece, false, true);
    return;
  }

  // Cas Sacrifice (roi armé) : une pièce meurt à sa place, le roi s'évade (GDD §6 Roi).
  if (cible && cible.owner !== piece.owner && cible.type === 'K' && cible.sacrificeArmed
      && protegerRoiParSacrifice(cible, { r: mv.r, c: mv.c })) {
    // Attaque déjouée : pas de bonus de capture. idem blindage (pas de recordMove).
    crediterCoup(state.turn, REVENU_PAR_COUP, 0, from, false);
    resoudreApresCoup(piece, false, true);
    return;
  }

  let bonus = 0, roiPris = false;
  if (cible && cible.owner !== piece.owner) {
    bonus = VALEUR_PIECE[cible.type];
    if (cible.type === 'K') roiPris = true;
    state.capturesDep[piece.owner] += valeurDepartage(cible); // départage GDD §8.3 (fix W3)
    state.board[mv.r][mv.c] = null;
    addFlash(mv.r, mv.c, 'red');
  }

  // Déplacement logique immédiat, animation purement cosmétique.
  state.board[from.r][from.c] = null;
  piece.r = mv.r; piece.c = mv.c;
  state.board[mv.r][mv.c] = piece;
  piece.aBouge = true; // condition du roque (GDD §5.1.b)
  if (mv.tele) piece.cooldowns.Tele = UPGRADES['Tele'].cooldown; // Téléportation : cooldown 5 (GDD §7)
  if (mv.grandSaut) piece.cooldowns['grand-saut'] = UPGRADES['grand-saut'].cooldown;
  if (mv.hauteFuite) piece.cooldowns['haute-fuite'] = UPGRADES['haute-fuite'].cooldown;

  // Roque (GDD §5.1.b) : la tour accompagne le roi dans le même coup (repositionnée
  // instantanément, assumé v1 — le roi porte l'animation de glissement).
  if (mv.castle) {
    const rook = state.board[mv.castle.rookFrom.r][mv.castle.rookFrom.c];
    if (rook && rook.type === 'R' && rook.owner === piece.owner) {
      state.board[mv.castle.rookFrom.r][mv.castle.rookFrom.c] = null;
      rook.r = mv.castle.rookTo.r; rook.c = mv.castle.rookTo.c;
      state.board[rook.r][rook.c] = rook;
      rook.aBouge = true;
    }
  }

  // Promotion (GDD §5.1.b) : le pion devient mv.promo (Q/R/B/N ; Q par défaut) AVANT
  // le crédit/replay/hash — améliorations, blindage et cooldowns du pion sont PERDUS
  // (les cartes sont liées au type de pièce, un pion promu est une pièce neuve).
  if (mv.promotion && piece.type === 'P') {
    piece.type = ['Q', 'R', 'B', 'N'].includes(mv.promo) ? mv.promo : 'Q';
    piece.upgrades = [];
    piece.shield = false;
    piece.rempartGranted = false;
    piece.cooldowns = {};
    piece._goldT = performance.now(); // flash doré : feedback de promotion (GDD §5.1.b)
  }

  // v.captureMul + injection de stagnation absorbés À L'INTÉRIEUR de crediterCoup
  // (GDD §5.2.b + §7.2 v3) — délégation garantit que `credite` reflète fidèlement
  // l'écart de state.ecus (revenu + bonus + éventuel filet), ce que recordMove()
  // stocke pour la fidélité du replay sous variantes élim.×2.
  const wasCapture = bonus > 0;
  // Consommation des améliorations d'attaque unique (Folie / Feinte) lors d'une capture.
  if (wasCapture) {
    if (piece.type === 'B' && piece.upgrades.includes('reprise')) piece.folieUsed = true;
    if (piece.type === 'Q' && piece.upgrades.includes('feinte')) piece.feinteUsed = true;
  }
  const credite = crediterCoup(state.turn, REVENU_PAR_COUP,
    bonus, { r: mv.r, c: mv.c }, wasCapture);
  // Enregistrement replay : après crédit des écus et stagnation_tick (état à jour).
  // bonus = valeur BRUTE de la pièce capturée (le multiplicateur captureMul est déjà
  // absorbé dans `credite`). recordMove() reporte `credite` pour la fidélité du
  // replay sous variantes non-standards (GDD §7.2 v3).
  recordMove(state, piece, from, { r: mv.r, c: mv.c }, cible ? cible.type : null, bonus, mv, credite);
  // PvP en ligne : diffuse l'action (ou capte le hash si on rejoue l'adversaire).
  pvwEmitMove(piece, from, { r: mv.r, c: mv.c }, cible ? cible.type : null, bonus, mv);

  demarrerAnim(piece, from, { r: mv.r, c: mv.c }, () => {
    if (roiPris) { finPartie(state.turn); return; }
    if (state.bonusMode) {
      const award = recolterChasse(state, piece);
      if (award) {
        addFlash(award.cell.r, award.cell.c, 'gold');
        if (award.upgradeId) {
          const { x, y } = centreVue(piece.r, piece.c);
          state.popups.push({
            text: `✦ ${award.upgrade.nom}`,
            x, y: y - 28, t0: performance.now(), color: UI_THEME.amberLight,
          });
          recordHuntAward(state, piece, award.upgradeId, award.cell, award.nextCase);
        }
      }
    }
    resoudreApresCoup(piece, true, bonus > 0);
  });
}

function demarrerAnim(piece, from, to, onDone) {
  state.phase = 'animating';
  state.selected = null;
  state.legalMoves = [];
  state.anim = {
    piece,
    from: centreVue(from.r, from.c),
    to: centreVue(to.r, to.c),
    t0: performance.now(),
    onDone,
  };
}

// ---------- Pouvoirs actifs ----------
function activerRuee() {
  const kn = state.selected;
  if (!kn || kn.type !== 'N' || !kn.upgrades.includes('ruee')) return;
  if ((kn.cooldowns.ruee || 0) > 0) return;
  const cibles = ciblesRuee(state.board, kn);
  if (!cibles.length) return; // rien à charger
  state.ruTargets = cibles;
  state.phase = 'ruee-target';
}

function executerRuee(cell) {
  const kn = state.selected;
  const cible = state.board[cell.r][cell.c];
  if (!cible) { state.phase = 'play'; state.ruTargets = []; return; }
  kn.cooldowns.ruee = UPGRADES['ruee'].cooldown;

  if (cible.shield) {
    cible.shield = false;
    addFlash(cell.r, cell.c, 'cyan');
    // Capture annulée : pas de bonus. Le revenu de base passe par v.revenueBase.
    const credite = crediterCoup(state.turn, REVENU_PAR_COUP, 0, cell, false);
    recordPower(state, kn, 'Ruée', cell, credite);
    pvwEmitPower(kn, 'Ruée', cell);
    state.ruTargets = [];
    finDeTour();
    return;
  }
  if (cible.type === 'K' && cible.sacrificeArmed && protegerRoiParSacrifice(cible, cell)) {
    // Capture déjouée par Sacrifice du roi : pas de bonus de capture.
    const credite = crediterCoup(state.turn, REVENU_PAR_COUP, 0, cell, false);
    recordPower(state, kn, 'Ruée', cell, credite);
    pvwEmitPower(kn, 'Ruée', cell);
    state.ruTargets = [];
    finDeTour();
    return;
  }
  const roiPris = cible.type === 'K';
  const bonus = VALEUR_PIECE[cible.type];
  state.capturesDep[state.turn] += valeurDepartage(cible); // départage GDD §8.3 (fix W3)
  state.board[cell.r][cell.c] = null; // le cavalier ne bouge pas
  addFlash(cell.r, cell.c, 'red');
  const credite = crediterCoup(state.turn, REVENU_PAR_COUP, bonus, cell, true);
  recordPower(state, kn, 'Ruée', cell, credite);
  pvwEmitPower(kn, 'Ruée', cell);
  state.ruTargets = [];
  if (roiPris) { finPartie(state.turn); return; }
  finDeTour(); // Ruée consomme le tour
}

// Vétéran (pion) : capture le pion ENNEMI directement en face du pion, sans bouger.
// Même modèle que la Ruée (GDD §6) : actif, cooldown 4, consomme le tour.
function activerVet() {
  const pion = state.selected;
  if (!pion || pion.type !== 'P' || !pion.upgrades.includes('vet')) return;
  if ((pion.cooldowns.vet || 0) > 0) return;
  const cibles = ciblesVet(state.board, pion);
  if (!cibles.length) return; // rien à charger
  state.ruTargets = cibles;
  state.phase = 'vet-target';
}

function executerVet(cell) {
  const pion = state.selected;
  const cible = state.board[cell.r][cell.c];
  if (!cible) { state.phase = 'play'; state.ruTargets = []; return; }
  pion.cooldowns.vet = UPGRADES['vet'].cooldown;

  if (cible.shield) {
    cible.shield = false;
    addFlash(cell.r, cell.c, 'cyan');
    // Capture annulée : pas de bonus. Le revenu de base passe par v.revenueBase.
    const credite = crediterCoup(state.turn, REVENU_PAR_COUP, 0, cell, false);
    recordPower(state, pion, 'Vétéran', cell, credite);
    pvwEmitPower(pion, 'Vétéran', cell);
    state.ruTargets = [];
    finDeTour();
    return;
  }
  // Cible toujours un pion (ciblesVet filtre q.type === 'P') → jamais de roi à capturer.
  const bonus = VALEUR_PIECE[cible.type];
  state.capturesDep[state.turn] += valeurDepartage(cible); // départage GDD §8.3
  state.board[cell.r][cell.c] = null; // le pion ne bouge pas
  addFlash(cell.r, cell.c, 'red');
  const credite = crediterCoup(state.turn, REVENU_PAR_COUP, bonus, cell, true);
  recordPower(state, pion, 'Vétéran', cell, credite);
  pvwEmitPower(pion, 'Vétéran', cell);
  state.ruTargets = [];
  finDeTour(); // Vétéran consomme le tour
}

// Épine (pion) : gèle la case où se trouve le pion pendant les deux prochains
// tours adverses. La zone reste attachée au pion même s'il se déplace ensuite.
function activerEpine() {
  const pion = state.selected;
  if (!pion || pion.type !== 'P' || !pion.upgrades.includes('epine')) return;
  if ((pion.cooldowns.epine || 0) > 0 || pion.epineZone) return;
  pion.cooldowns.epine = UPGRADES.epine.cooldown;
  // +1 car finDeTour décrémente immédiatement au passage sur le camp adverse.
  pion.epineZone = { r: pion.r, c: pion.c, owner: pion.owner, turns: 3 };
  pion._goldT = performance.now();
  addFlash(pion.r, pion.c, 'cyan');
  recordPower(state, pion, 'Épine');
  pvwEmitPower(pion, 'Épine', null);
  finDeTour();
}

// Rayon sacré (fou) : capture à distance la 1re pièce adverse sur une diagonale,
// sans bouger. Même modèle que la Ruée du cavalier (GDD §6).
function activerRayon() {
  const fou = state.selected;
  if (!fou || fou.type !== 'B' || !fou.upgrades.includes('Rayon')) return;
  if ((fou.cooldowns.Rayon || 0) > 0) return;
  const cibles = ciblesRayon(state.board, fou);
  if (!cibles.length) return; // rien à viser
  state.ruTargets = cibles;
  state.phase = 'rayon-target';
}

function executerRayon(cell) {
  const fou = state.selected;
  const cible = state.board[cell.r][cell.c];
  if (!cible) { state.phase = 'play'; state.ruTargets = []; return; }
  fou.cooldowns.Rayon = UPGRADES['Rayon'].cooldown;

  if (cible.shield) {
    cible.shield = false;
    addFlash(cell.r, cell.c, 'cyan');
    // Capture annulée : pas de bonus. Revenu de base via v.revenueBase (0 en élim.×2).
    const credite = crediterCoup(state.turn, REVENU_PAR_COUP, 0, cell, false);
    recordPower(state, fou, 'Rayon sacré', cell, credite);
    pvwEmitPower(fou, 'Rayon sacré', cell);
    state.ruTargets = [];
    finDeTour();
    return;
  }
  if (cible.type === 'K' && cible.sacrificeArmed && protegerRoiParSacrifice(cible, cell)) {
    // Capture déjouée par Sacrifice du roi : pas de bonus.
    const credite = crediterCoup(state.turn, REVENU_PAR_COUP, 0, cell, false);
    recordPower(state, fou, 'Rayon sacré', cell, credite);
    pvwEmitPower(fou, 'Rayon sacré', cell);
    state.ruTargets = [];
    finDeTour();
    return;
  }
  const roiPris = cible.type === 'K';
  const bonus = VALEUR_PIECE[cible.type];
  state.capturesDep[state.turn] += valeurDepartage(cible); // départage GDD §8.3 (fix W3)
  state.board[cell.r][cell.c] = null; // le fou ne bouge pas
  addFlash(cell.r, cell.c, 'red');
  const credite = crediterCoup(state.turn, REVENU_PAR_COUP, bonus, cell, true); // capture effective → reset stagnation
  recordPower(state, fou, 'Rayon sacré', cell, credite);
  pvwEmitPower(fou, 'Rayon sacré', cell);
  state.ruTargets = [];
  if (roiPris) { finPartie(state.turn); return; }
  finDeTour(); // Rayon consomme le tour
}

// Rempart (tour) : la tour et ses alliés orthogonalement adjacents sont blindés
// jusqu'au prochain tour du joueur (GDD §6). Actif, cooldown 5, consomme le tour.
function activerRempart() {
  const tour = state.selected;
  if (!tour || tour.type !== 'R' || !tour.upgrades.includes('rempart')) return;
  if ((tour.cooldowns.rempart || 0) > 0) return;
  tour.cooldowns.rempart = UPGRADES['rempart'].cooldown;
  const proteges = [tour];
  for (const [dr, dc] of ORTHO) {
    const q = caseAt(state.board, tour.r + dr, tour.c + dc);
    if (q && q.owner === tour.owner) proteges.push(q);
  }
  for (const q of proteges) {
    // On ne pose un blindage temporaire que si la pièce n'en a pas déjà un (ex. Forteresse),
    // pour ne pas effacer un blindage permanent à l'expiration.
    if (!q.shield) { q.shield = true; q.rempartGranted = true; }
    addFlash(q.r, q.c, 'cyan');
  }
  tour._goldT = performance.now();
  recordPower(state, tour, 'Rempart');
  pvwEmitPower(tour, 'Rempart', null);
  finDeTour(); // Rempart consomme le tour
}

// Sacrifice (roi) : si la reine adverse est à 2 cases ou moins, elle ne peut plus bouger
// pendant les 2 prochains tours (GDD §6). Actif, cooldown 6, consomme le tour.
function activerSacrifice() {
  const roi = state.selected;
  if (!roi || roi.type !== 'K' || !roi.upgrades.includes('sacrifice')) return;
  if ((roi.cooldowns.sacrifice || 0) > 0) return;
  // Cherche la reine adverse la plus proche.
  let cible = null;
  for (const row of state.board) {
    for (const q of row) {
      if (q && q.type === 'Q' && q.owner !== roi.owner) {
        const d = Math.max(Math.abs(q.r - roi.r), Math.abs(q.c - roi.c));
        if (d <= 2 && (!cible || d < cible.d)) cible = { q, d };
      }
    }
  }
  if (!cible) return; // aucune reine adverse dans le rayon
  roi.cooldowns.sacrifice = UPGRADES['sacrifice'].cooldown;
  cible.q.debuffs.root = 3; // 2 tours complets de gel (+1 car finDeTour décrémente immédiatement)
  roi._goldT = performance.now();
  recordPower(state, roi, 'Mariage stratégique', { r: cible.q.r, c: cible.q.c });
  pvwEmitPower(roi, 'Mariage stratégique', { r: cible.q.r, c: cible.q.c });
  finDeTour(); // consomme le tour
}

// S.H.T. (dame) : le roi adverse ne peut utiliser aucune amélioration pendant 2 tours.
function activerSHT() {
  const dame = state.selected;
  if (!dame || dame.type !== 'Q' || !dame.upgrades.includes('sht')) return;
  if (dame.shtUsed) return;
  // Trouve le roi adverse.
  let roi = null;
  for (const row of state.board) {
    for (const q of row) {
      if (q && q.type === 'K' && q.owner !== dame.owner) { roi = q; break; }
    }
    if (roi) break;
  }
  if (!roi) return;
  roi.debuffs.sht = 3; // 2 tours complets sans améliorations (+1 car finDeTour décrémente immédiatement)
  dame.shtUsed = true; // usage unique
  dame._goldT = performance.now();
  recordPower(state, dame, 'S.H.T.');
  pvwEmitPower(dame, 'S.H.T.', null);
  finDeTour(); // consomme le tour
}

// Hypnose (fou) : les pièces ennemies (hors roi/reine) ne peuvent se déplacer dans
// une case adjacente au fou pendant 2 tours.
function activerHypnose() {
  const fou = state.selected;
  if (!fou || fou.type !== 'B' || !fou.upgrades.includes('hypnose')) return;
  if ((fou.cooldowns.hypnose || 0) > 0) return;
  fou.cooldowns.hypnose = UPGRADES['hypnose'].cooldown;
  fou.debuffs.hypnoseAura = 2; // 2 tours complets d'aura autour du fou (sur le lanceur, pas décrémenté au premier finDeTour)
  fou._goldT = performance.now();
  recordPower(state, fou, 'Hypnose');
  pvwEmitPower(fou, 'Hypnose', null);
  finDeTour(); // consomme le tour
}

function dist(a, b) { return Math.max(Math.abs(a.r - b.r), Math.abs(a.c - b.c)); }

// Cherche la pièce à sacrifier : un pion en priorité (valeur la plus basse), sinon la
// pièce de valeur juste supérieure (GDD §6). Départage : la plus proche du roi.
function trouverVictimeSacrifice(roi) {
  let best = null;
  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      const q = state.board[r][c];
      if (!q || q.owner !== roi.owner || q.type === 'K') continue;
      const v = VALEUR_PIECE[q.type];
      const d = dist({ r, c }, roi);
      if (!best || v < best.v || (v === best.v && d < best.d)) best = { r, c, v, d };
    }
  }
  return best;
}

// Applique la protection du Sacrifice. Renvoie true si le roi a survécu.
function protegerRoiParSacrifice(roi, attaquantCell) {
  if (!roi.sacrificeArmed) return false;
  // Case d'évasion : une case adjacente libre. Sans évasion → le roi meurt (GDD).
  const evasions = [];
  for (const [dr, dc] of DIRS8) {
    const r = roi.r + dr, c = roi.c + dc;
    if (inB(state.board, r, c) && state.board[r][c] === null) evasions.push({ r, c });
  }
  if (!evasions.length) return false;
  const victime = trouverVictimeSacrifice(roi);
  if (!victime) return false; // aucune pièce à sacrifier → le roi meurt
  roi.sacrificeArmed = false;
  // La victime meurt « à la place du roi » — matériel détruit par l'attaquant :
  // crédité au départage comme une capture (équivalent de l'ancienne formule
  // 39 − survivants, qui comptait toute disparition).
  state.capturesDep[state.turn] += valeurDepartage(victime);
  state.board[victime.r][victime.c] = null;
  addFlash(victime.r, victime.c, 'red');
  // Le roi s'évade sur la case adjacente libre la plus éloignée de l'attaquant.
  const dest = evasions.reduce((b, e) => (dist(e, attaquantCell) > dist(b, attaquantCell) ? e : b), evasions[0]);
  state.board[roi.r][roi.c] = null;
  roi.r = dest.r; roi.c = dest.c;
  state.board[dest.r][dest.c] = roi;
  addFlash(dest.r, dest.c, 'cyan');
  return true;
}

// Décret (roi) : échange la position du roi avec une pièce alliée adjacente (GDD §6).
// Usage unique, consomme le tour.
function activerDecret() {
  const roi = state.selected;
  if (!roi || roi.type !== 'K' || !roi.upgrades.includes('decret') || roi.decretUsed) return;
  const cibles = ciblesDecret(state.board, roi);
  if (!cibles.length) return;
  state.ruTargets = cibles;
  state.phase = 'decret-target';
}

function ciblesDecret(board, roi) {
  const t = [];
  for (const [dr, dc] of DIRS8) {
    const r = roi.r + dr, c = roi.c + dc;
    const q = caseAt(board, r, c);
    if (q && q.owner === roi.owner && q.type !== 'K') t.push({ r, c });
  }
  return t;
}

function executerDecret(cell) {
  const roi = state.selected;
  const allie = state.board[cell.r][cell.c];
  if (!roi || !allie) { state.phase = 'play'; state.ruTargets = []; return; }
  const rk = roi.r, ck = roi.c, ar = allie.r, ac = allie.c;
  roi.r = ar; roi.c = ac;
  allie.r = rk; allie.c = ck;
  state.board[ar][ac] = roi;
  state.board[rk][ck] = allie;
  roi.aBouge = true;   // l'échange compte comme mouvement : plus de roque (GDD §5.1.b)
  allie.aBouge = true;
  roi.decretUsed = true;
  roi._goldT = performance.now();
  state.ruTargets = [];
  recordPower(state, roi, 'Décret', cell);
  pvwEmitPower(roi, 'Décret', cell);
  finDeTour(); // Décret consomme le tour
}

// Cavalerie (cavalier) : le cavalier choisit un ennemi adjacent (orthogonal ou diagonal)
// et le repousse sur l'une des 2 cases à distance de cavalier situées derrière lui.
// Phase 1 : choix de l'ennemi → Phase 2 : choix de la destination. Consomme le tour.
function ciblesCavalerie(board, p) {
  const t = [];
  for (const [dr, dc] of [[-1, -1], [-1, 0], [-1, 1], [0, -1], [0, 1], [1, -1], [1, 0], [1, 1]]) {
    const r = p.r + dr, c = p.c + dc;
    const q = caseAt(board, r, c);
    if (!q || q.owner === p.owner) continue;
    // Vérifie qu'au moins une destination (distance cavalier) est libre
    const dests = ciblesPousseeCavalerie(board, p, { r, c });
    if (!dests.length) continue;
    t.push({ r, c });
  }
  return t;
}

// Calcule les 2 cases à distance de cavalier derrière un ennemi adjacent.
// Renvoie uniquement les cases dans le plateau et libres.
function ciblesPousseeCavalerie(board, p, enemyCell) {
  const dr = enemyCell.r - p.r, dc = enemyCell.c - p.c;
  const candidates = [];
  if (dr === 0) {
    // Ennemi à gauche/droite → les 2 cases derrière sont (p.r±1, p.c+dc*2)
    candidates.push({ r: p.r + 1, c: p.c + dc * 2 });
    candidates.push({ r: p.r - 1, c: p.c + dc * 2 });
  } else if (dc === 0) {
    // Ennemi au-dessus/en-dessous → les 2 cases derrière sont (p.r+dr*2, p.c±1)
    candidates.push({ r: p.r + dr * 2, c: p.c + 1 });
    candidates.push({ r: p.r + dr * 2, c: p.c - 1 });
  } else {
    // Ennemi en diagonale → les 2 cases derrière sont (dr*2, dc) et (dr, dc*2)
    candidates.push({ r: p.r + dr * 2, c: p.c + dc });
    candidates.push({ r: p.r + dr, c: p.c + dc * 2 });
  }
  return candidates.filter(c => inB(board, c.r, c.c) && board[c.r][c.c] === null);
}

function activerCavalerie() {
  const kn = state.selected;
  if (!kn || kn.type !== 'N' || !kn.upgrades.includes('cavalerie')) return;
  if ((kn.cooldowns.cavalerie || 0) > 0) return;
  const cibles = ciblesCavalerie(state.board, kn);
  if (!cibles.length) return;
  state.ruTargets = cibles;
  state.phase = 'cavalerie-target';
}

// Phase 1 : l'utilisateur a cliqué sur un ennemi adjacent
// → on passe en Phase 2 en montrant les 2 destinations possibles.
function executerCavalerie(cell) {
  const kn = state.selected;
  const cible = state.board[cell.r][cell.c];
  if (!cible) { state.phase = 'play'; state.ruTargets = []; return; }
  const dests = ciblesPousseeCavalerie(state.board, kn, { r: cell.r, c: cell.c });
  if (!dests.length) { state.phase = 'play'; state.ruTargets = []; return; }
  state._cavEnemyCell = { r: cell.r, c: cell.c }; // mémorise l'ennemi pour la phase 2
  state.ruTargets = dests;
  state.phase = 'cavalerie-push';
}

// Phase 2 : l'utilisateur choisit la case de destination
// → l'ennemi est repoussé sur cette case, le tour est consommé.
function executerPousseeCavalerie(cell) {
  const kn = state.selected;
  const enemyPos = state._cavEnemyCell;
  if (!enemyPos) { state.phase = 'play'; state.ruTargets = []; return; }
  const cible = state.board[enemyPos.r][enemyPos.c];
  if (!kn || !cible) { state.phase = 'play'; state.ruTargets = []; return; }
  // Vérifie que la destination est libre (devrait toujours être le cas)
  if (state.board[cell.r][cell.c] !== null) { state.phase = 'play'; state.ruTargets = []; return; }
  kn.cooldowns.cavalerie = UPGRADES['cavalerie'].cooldown;
  state.board[enemyPos.r][enemyPos.c] = null;
  cible.r = cell.r; cible.c = cell.c;
  state.board[cell.r][cell.c] = cible;
  addFlash(cell.r, cell.c, 'cyan');
  state.ruTargets = [];
  state._cavEnemyCell = null;
  recordPower(state, kn, 'Cavalerie', { r: cell.r, c: cell.c });
  pvwEmitPower(kn, 'Cavalerie', { r: cell.r, c: cell.c });
  finDeTour();
}

// Échange (tour) : échange la position de la tour avec un pion allié situé sur une
// ligne, colonne ou diagonale de la tour, sans pièce intermédiaire. Consomme le tour.
function ciblesEchange(board, p) {
  const t = [];
  for (const [dr, dc] of [[-1, -1], [-1, 0], [-1, 1], [0, -1], [0, 1], [1, -1], [1, 0], [1, 1]]) {
    let r = p.r + dr, c = p.c + dc;
    while (inB(board, r, c)) {
      const q = board[r][c];
      if (q) {
        if (q.owner === p.owner && q.type === 'P') t.push({ r, c });
        break;
      }
      r += dr; c += dc;
    }
  }
  return t;
}

function activerEchange() {
  const tour = state.selected;
  if (!tour || tour.type !== 'R' || !tour.upgrades.includes('echange')) return;
  if ((tour.cooldowns.echange || 0) > 0) return;
  const cibles = ciblesEchange(state.board, tour);
  if (!cibles.length) return;
  state.ruTargets = cibles;
  state.phase = 'echange-target';
}

function executerEchange(cell) {
  const tour = state.selected;
  const pion = state.board[cell.r][cell.c];
  if (!tour || !pion || pion.type !== 'P' || pion.owner !== tour.owner) {
    state.phase = 'play'; state.ruTargets = []; return;
  }
  tour.cooldowns.echange = UPGRADES['echange'].cooldown;
  const tr = tour.r, tc = tour.c, pr = pion.r, pc = pion.c;
  tour.r = pr; tour.c = pc;
  pion.r = tr; pion.c = tc;
  state.board[pr][pc] = tour;
  state.board[tr][tc] = pion;
  tour.aBouge = true;
  addFlash(tr, tc, 'cyan');
  addFlash(pr, pc, 'cyan');
  state.ruTargets = [];
  recordPower(state, tour, 'Échange', cell);
  pvwEmitPower(tour, 'Échange', cell);
  finDeTour();
}

// ---------- Achat ----------
function ouvrirPanneau(piece) {
  if (state.mode === 'learn' && !learnPermet(state, { type: 'panel', piece })) {
    refusApprendre(piece);
    return;
  }
  state.selected = piece;
  state.legalMoves = coupsLegaux(state.board, piece);
  state.panelPiece = piece;
  if (state.phase !== 'gameover' && state.phase !== 'animating') state.phase = 'play';
}

// Renvoie les ids d'améliorations du deck actif pour un type de pièce.
// Fallback sur le catalogue complet si aucun deck n'est actif.
function deckUpgrades(type) {
  return upgradesForPiece(state.activeDeck, type, UPGRADES_PAR_TYPE[type]);
}

function acheter(id) {
  const p = state.panelPiece;
  if (!p) { console.warn('[acheter] no panelPiece'); return; }
  if (state.mode === 'learn' && !learnPermet(state, { type: 'buy', id })) {
    refusApprendre(p);
    return;
  }
  if (ameliorationsBloquees(p)) return; // S.H.T. : la pièce ne peut rien acheter
  const u = UPGRADES[id];
  if (!u || u.piece !== p.type) { console.warn('[acheter] unknown/invalid upgrade', id, p.type); return; }
  // Le deck actif est la source de vérité : on ne peut acheter que les upgrades
  // sélectionnées pour ce type de pièce (GDD §5.3.c / demande utilisateur).
  const allowed = deckUpgrades(p.type);
  if (!allowed.includes(id)) {
    console.warn('[acheter] upgrade not in active deck', id, 'type', p.type, 'allowed', allowed, 'activeDeck', state.activeDeck);
    state.buzz = performance.now(); state.buzzId = id;
    return;
  }
  if (p.upgrades.includes(id) || p.upgrades.length >= MAX_UPGRADES_PAR_PIECE
      || state.ecus[state.turn] < u.cout) {
    state.buzz = performance.now(); state.buzzId = id; // refus : tremblement
    return;
  }
  state.ecus[state.turn] -= u.cout;
  p.upgrades.push(id);
  // Cartes « absorbe la 1re capture » : blindage posé dès l'achat (GDD §5.5).
  if (['forteresse', 'bouclier', 'monture', 'couronne', 'majeste', 'Zone'].includes(id)) p.shield = true;
  p._goldT = performance.now();             // flash doré
  recalculerCoups();                         // Marche arrière / Pas de côté ajoutent des coups
  recordPurchase(state, p, id, u.cout);      // replay : après achat réussi
  pvwEmitPurchase(p, id);                     // PvP en ligne : diffusion / capture du hash
}

// ---------- Matchmaking PvP en ligne ----------

// EN LIGNE ouvre d'abord un LOBBY 100 % local : aucun appel réseau tant qu'on y reste
// (pas de findMatch/createPrivate/RPC). Le joueur choisit ensuite recherche publique,
// partie privée ou rejoindre par code — chacun déclenche le réseau à ce moment-là.
function entrerMatchmaking() {
  state.phase = 'matchmaking';
  state.matchmaking = {
    mode: 'lobby',
    oppPseudo: null,
    oppTrophies: null,
    privateCode: null,
    error: null,
    band: 100,
    searchStart: Date.now(),
    // Cadence (spec §6) : choisie sur l'écran 'cadence' AVANT tout réseau. pendingAction
    // mémorise le bouton d'origine ('search' | 'private') pour router après le choix.
    cadence: null,
    pendingAction: null,
  };
  state._pvwStarting = false;
  cablerCallbacksOnline();
  // Pas de initOnline/findMatch ici : le lobby ne touche pas au serveur.
}

// Inscription dans la file publique (findMatch). SEUL point qui inscrit dans la file —
// factorisé pour être partagé par le bouton « Lancer une recherche » du lobby ET le
// bouton « Nouvelle partie » de l'écran de fin. Suppose l'état déjà en phase matchmaking.
function lancerRecherchePublique() {
  if (state.phase !== 'matchmaking') return;
  // [23:45] Guard supabase client : si le SDK n'est pas chargé (CDN offline ou pas
  // initialisé), affiche un message visible au lieu de silently no-op.
  const supabase = getSupabaseClient();
  if (!supabase) {
    console.error('[matchmaking] lancerRecherchePublique: getSupabaseClient() == null (CDN offline ou import KO?)');
    state.matchmaking.error = 'Service en ligne indisponible. Réessayez dans quelques secondes.';
    return;
  }
  state.matchmaking.mode = 'search';
  state.matchmaking.searchStart = Date.now();
  state.matchmaking.error = null;
  initOnline(supabase);
  // Passe la taille du plateau sélectionnée au menu. Chaque taille possède une
  // file publique séparée côté serveur ; bonus est hors classement.
  findMatch(
    state.matchmaking.cadence || PVW_TEMPS_INITIAL,
    variantIdFromMenu(state),
    state.menu && state.menu.taille ? state.menu.taille : DEFAULT_TAILLE
  );
}

// Création d'une partie privée (après le choix de cadence). Extrait de l'ancien case
// 'createPrivateMatch' — le bouton du lobby ouvre désormais l'écran cadence d'abord.
function lancerPartiePrivee() {
  if (state.phase !== 'matchmaking') return;
  // initOnline explicite : le lobby ne l'a pas fait (aucun réseau au lobby).
  initOnline(getSupabaseClient());
  state.matchmaking.mode = 'private_create';
  state.matchmaking.error = null;
  state.matchmaking.privateCode = null;    // Les boutons de variantes ont été retirés du lobby privé : la variante
    // vient déjà du menu principal. La taille reste imposée par le créateur.

  createPrivate(
    state.matchmaking.cadence || PVW_TEMPS_INITIAL,      variantIdFromMenu(state),
      state.menu && state.menu.taille ? state.menu.taille : DEFAULT_TAILLE
  ).then((code) => {
    if (code) state.matchmaking.privateCode = code;
  });
}

// « 🔍 Nouvelle partie » depuis l'écran de fin PvP : enchaîner une nouvelle recherche
// publique sans repasser par le menu ni le lobby. Quitte proprement le match courant
// (désabonnement canal Realtime via onlineLeave, ce qui abandonne aussi toute proposition
// de revanche locale — l'adversaire qui en avait proposé une verra son timeout 20 s
// expirer, acceptable §9.4), repart d'un état propre, puis réutilise EXACTEMENT le même
// chemin que le bouton « Lancer une recherche » du lobby (aucune logique dupliquée).
function nouvellePartieEnLigne() {
  const p = state.pvw;
  // Garde-fou : une revanche en cours de lancement a déjà démarré un nouveau match —
  // ne pas provoquer un second départ concurrent.
  if (p && p.rematch && p.rematch.launching) return;
  const cadence = (p && p.cadence) || PVW_TEMPS_INITIAL; // on rejoue dans la MÊME cadence (pas de re-choix)
  onlineLeave();          // ferme le canal du match terminé + reset interne online.js
  state = menuState();    // efface state.pvw / state.mode='pvw' → repart propre
  entrerMatchmaking();    // phase matchmaking + recâblage des callbacks online
  state.matchmaking.cadence = cadence;
  lancerRecherchePublique();
}

function commencerPartiePvP() {
  if (state._pvwStarting) return; // anti-double appel
  state._pvwStarting = true;
  const ol = getOnline();
  commencerPartie('pvw', {
    side: ol.side,
    matchId: ol.matchId,
    oppPseudo: ol.oppPseudo,
    oppTrophies: ol.oppTrophies,
    cadence: ol.cadence,   // choisie côté file publique / créateur privé, confirmée serveur
    variant: ol.variant,   // privé : imposée par le créateur (v3.1) ; public : 'pvp_standard'
    resume: state.matchmaking && state.matchmaking.mode === 'resume',
    // Phase A.5 v2 Phase 5.A — taille plateau imposée par le serveur (privé : créateur ;
    // public : std confirmé par online.js pollMatchmaking ou joinByCode). Mirror dans
    // state.pvw.taille côté main.js. Sans ça, l15 en PvP en ligne retombait en std 8x8.
    taille: ol.taille,
  });
}

// ---------- PvP en ligne — synchro des coups + horloge (CYCLE W2, spec §5/§6) ----------
// Le réseau remplace le bot : les actions locales sont diffusées aux points où le replay
// enregistre déjà (recordMove/recordPurchase/recordPower), et les actions adverses sont
// rejouées via EXACTEMENT les mêmes fonctions moteur (jouerCoup/acheter/executer*) — miroir
// de planifierCoupIA. Aucune modification de rules.js/board.js.

function toAlg(r, c, board = state.board) {
  const rows = board && board.length ? board.length : 8;
  return String.fromCharCode(97 + c) + (rows - r);
}

// Hash d'état 32 bits (FNV-1a) sur une chaîne canonique (§5.4). N'utilise JAMAIS piece.id
// (le compteur PROCHAIN_ID de board.js diverge entre clients ayant joué un nombre de parties
// différent) : la chaîne en cours est identifiée par position+type, déterministe cross-client.
// Exclut tout le cosmétique (anim/popups/flashes/_goldT/ui).
function hashState(s) {
  let str = '';
  for (let r = 0; r < s.board.length; r++) {
    for (let c = 0; c < s.board[r].length; c++) {
      const p = s.board[r][c];
      if (!p) { str += '.'; continue; }
      const cds = Object.keys(p.cooldowns).filter((k) => p.cooldowns[k] > 0)
        .sort().map((k) => k + p.cooldowns[k]).join(',');
      const up = [...p.upgrades].sort().join(',');
      str += `${p.owner}${p.type}${p.shield ? 1 : 0}${p.sacrificeArmed ? 1 : 0}`
        + `${p.decretUsed ? 1 : 0}${p.doubleCoupUsed ? 1 : 0}${p.rempartGranted ? 1 : 0}`
        + `${p.aBouge ? 1 : 0}` // condition du roque (GDD §5.1.b) — divergence = coups légaux divergents
        + `[${cds}][${up}]`
        + (p.epineZone ? `{${p.epineZone.r},${p.epineZone.c},${p.epineZone.turns}}` : '{}');
    }
  }
  str += `|${s.ecus[0]}|${s.ecus[1]}|${s.turn}|`;
  str += s.chain ? `${s.chain.piece.r}${s.chain.piece.c}${s.chain.type}` : '-';
  if (s.bonusMode) {
    str += `|bonus:${s.taille}|${s.huntRngSeed >>> 0}|${JSON.stringify(s.huntBonuses || [])}`
      + `|${JSON.stringify(s.huntCollected || [0, 0])}`;
  }
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 0x01000193); }
  return (h >>> 0).toString(16);
}

// --- Horloge (§6) : décompte local réconcilié par message (§6.2) ---
function pvwClockRunning() {
  return state.mode === 'pvw' && state.pvw && !state.pvw.ended
    && (state.phase === 'play' || state.phase === 'animating' || state.phase === 'promotion'
        || PHASES_CIBLAGE.includes(state.phase));
}
function pvwLiveClock(side) {
  const p = state.pvw;
  if (!p) return 0;
  if (side === p.activeClock && pvwClockRunning()) {
    return Math.max(0, p.clocks[side] - (performance.now() - p.clockT0) / 1000);
  }
  return Math.max(0, p.clocks[side]);
}
function pvwCommitActive() {
  const p = state.pvw;
  if (!p) return;
  const el = (performance.now() - p.clockT0) / 1000;
  p.clocks[p.activeClock] = Math.max(0, p.clocks[p.activeClock] - el);
  p.clockT0 = performance.now();
}

// --- Émission des actions locales (§5.3) ---
// pvwHook calcule le hash au POINT D'ÉMISSION (juste après record*, avant finDeTour) — le
// même point de cycle de vie côté récepteur, ce qui garantit un hash comparable pour tous les
// kinds. En origine locale on diffuse ; en application distante on stocke le hash pour vérif.
function pvwHook(evt) {
  if (state.mode !== 'pvw' || !state.pvw) return;
  const h = hashState(state);
  if (state.pvw.applyingRemote) { state.pvw._pendingHash = h; return; }
  evt.hash = h;
  evt.clock = { 0: pvwLiveClock(0), 1: pvwLiveClock(1) };
  sendAction(evt);
}
function pvwEmitMove(piece, from, to, capturedType, bonus, mv) {
  if (state.mode !== 'pvw' || !state.pvw) return;
  pvwHook({
    kind: 'move', owner: piece.owner, piece: piece.type,
    from: toAlg(from.r, from.c), to: toAlg(to.r, to.c),
    captured: capturedType || null, bonus: bonus || 0, chain: !!state.chain,
    pasDiag: !!(mv && mv.pasDiag),
    grandSaut: !!(mv && mv.grandSaut),
    hauteFuite: !!(mv && mv.hauteFuite),
    // Promotion (GDD §5.1.b) : au point d'émission piece.type EST déjà le type promu.
    promo: mv && mv.promotion ? piece.type : null,
  });
}
function pvwEmitPurchase(piece, id) {
  if (state.mode !== 'pvw' || !state.pvw) return;
  pvwHook({ kind: 'purchase', owner: piece.owner, upgrade: id, pos: toAlg(piece.r, piece.c) });
}
function pvwEmitPower(piece, powerType, cell) {
  if (state.mode !== 'pvw' || !state.pvw) return;
  pvwHook({
    kind: 'power', owner: piece.owner, piece: piece.type, power: powerType,
    pos: toAlg(piece.r, piece.c), target: cell ? toAlg(cell.r, cell.c) : null,
  });
}
// Déclin d'enchaînement (§5.5) : le récepteur obtient le même state.chain mais ne peut pas
// deviner un déclin — on le lui signale explicitement. Hash capté avant la résolution.
function pvwEmitEndChain() {
  if (state.mode !== 'pvw' || !state.pvw) return;
  const h = hashState(state);
  if (state.pvw.applyingRemote) { state.pvw._pendingHash = h; return; }
  sendAction({ kind: 'endchain', hash: h, clock: { 0: pvwLiveClock(0), 1: pvwLiveClock(1) } });
}

// --- Application des actions adverses (§3.2, miroir de planifierCoupIA) ---
function pvwVerifierHash(msg) {
  const p = state.pvw;
  if (msg.hash && p._pendingHash && msg.hash !== p._pendingHash) {
    console.error('[online] desync — hash discordant', { recu: msg.hash, local: p._pendingHash, seq: msg.seq, kind: msg.kind });
    p.desync = true;
  }
}
function applyRemoteAction(msg) {
  const p = state.pvw;
  if (!p || p.ended) return;
  const opp = 1 - p.side;
  // Réconciliation d'horloge : l'émetteur fait autorité sur SA propre horloge (§6.2).
  if (msg.clock) {
    p.clocks[opp] = msg.clock[opp];
    if (p.activeClock === opp) p.clockT0 = performance.now();
  }
  // Contrôle de tour (§3.2 étape 2).
  if (state.turn !== opp) { console.warn('[online] action hors-tour rejetée', msg); return; }
  // Contrôle d'appartenance (§3.2 étape 1).
  if (msg.owner != null && msg.owner !== opp) { console.warn('[online] owner illégal rejeté', msg); return; }

  p.applyingRemote = true;
  p._pendingHash = null;
  try {
    if (msg.kind === 'move') {
      const from = fromAlgebraic(msg.from, state.board), to = fromAlgebraic(msg.to, state.board);
      if (!from || !to) { console.warn('[online] malformed move coords', msg); p.applyingRemote = false; return; }
      const piece = state.board[from.r][from.c];
      if (!piece || piece.owner !== opp) { console.warn('[online] illegal — pièce introuvable', msg); p.applyingRemote = false; return; }
      // Contrôle de légalité (§3.2 étape 3) via le propre rules.js du récepteur.
      const cands = state.chain ? state.legalMoves : coupsLegaux(state.board, piece);
      let mv = cands.find((m) => m.r === to.r && m.c === to.c);
      if (!mv) { console.warn('[online] illegal — coup non légal rejeté', msg); p.applyingRemote = false; return; }
      // Promotion (GDD §5.1.b) : le choix de l'émetteur voyage dans msg.promo ;
      // revalidé ici (Q/R/B/N), Dame par défaut si absent/invalide.
      if (mv.promotion) mv = { ...mv, promo: ['Q', 'R', 'B', 'N'].includes(msg.promo) ? msg.promo : 'Q' };
      if (!state.chain) selectionner(piece);
      jouerCoup(piece, mv); // le hash est capté dans pvwHook (avant l'anim/finDeTour)
    } else if (msg.kind === 'purchase') {
      const pos = fromAlgebraic(msg.pos, state.board);
      if (!pos) { console.warn('[online] malformed purchase coords', msg); p.applyingRemote = false; return; }
      const piece = state.board[pos.r][pos.c];
      if (!piece || piece.owner !== opp) { console.warn('[online] illegal — achat pièce introuvable', msg); p.applyingRemote = false; return; }
      const before = piece.upgrades.length;
      state.panelPiece = piece;
      acheter(msg.upgrade); // acheter() re-valide solde recalculé + catalogue + plafond
      state.panelPiece = null;
      if (piece.upgrades.length === before) console.warn('[online] achat refusé par le moteur (illégal)', msg);
    } else if (msg.kind === 'power') {
      applyRemotePower(msg, opp);
    } else if (msg.kind === 'endchain') {
      // Hash pris avant résolution (comme l'émetteur), puis on résout.
      p._pendingHash = hashState(state);
      if (state.chain) { state.chain = null; finDeTour(); }
    }
  } catch (e) {
    console.warn('[online] apply error', e);
  }
  p.applyingRemote = false;
  pvwVerifierHash(msg);
}

function applyRemotePower(msg, opp) {
  const target = msg.target ? fromAlgebraic(msg.target, state.board) : null;
  // Décret déplace le roi : on le localise par owner+type (une seule pièce K), pas par pos
  // (qui vaut la position POST-échange chez l'émetteur). target = case de l'allié à échanger.
  if (msg.power === 'Décret') {
    let king = null;
    for (const row of state.board) for (const q of row) if (q && q.owner === opp && q.type === 'K') king = q;
    if (!king) { console.warn('[online] illegal — roi introuvable (Décret)', msg); return; }
    state.selected = king;
    executerDecret(target);
    return;
  }
  const pos = fromAlgebraic(msg.pos, state.board);
  if (!pos) { console.warn('[online] malformed power coords', msg); return; }
  const piece = state.board[pos.r][pos.c];
  if (!piece || piece.owner !== opp) { console.warn('[online] illegal — pièce de pouvoir introuvable', msg); return; }
  state.selected = piece;
  switch (msg.power) {
    case 'Ruée': executerRuee(target); break;
    case 'Rayon sacré': executerRayon(target); break;
    case 'Vétéran': executerVet(target); break;
    case 'Épine': activerEpine(); break;
    case 'Rempart': activerRempart(); break;
    case 'Mariage stratégique': activerSacrifice(); break;
    default: console.warn('[online] pouvoir inconnu', msg.power);
  }
}

// Vidange de la file d'application (appelée dans loop()) : n'applique une action adverse que
// quand ce n'est pas mon tour et que le moteur est au repos (pas d'anim/ciblage en cours).
function pumpPvw() {
  const p = state.pvw;
  if (!p || p.ended) return;
  if (state.turn === p.side) return;   // mon tour : entrées locales actives, aucune application
  if (state.phase !== 'play') return;  // moteur occupé (animation / ciblage) : on attend
  const msg = takeNextAction();
  if (!msg) return;
  applyRemoteAction(msg);
}

// Départage à la valeur (GDD §8 / §6.3) : valeur du matériel capturé par chaque camp,
// ACCUMULÉE à la capture (state.capturesDep, fix W3 — remplace l'ancienne formule
// « 39 − survivants » qui ignorait les bonus [S] des pièces déjà capturées et se
// faussait sur promotion). Déterministe et identique sur les deux clients (chaque
// client applique tous les coups). Renvoie 0, 1, ou null (nulle).
// ⚠ Les 2 clients doivent être ≥ ?v=20 (sinon départages divergents → rapports
// discordants → match 'disputed', aucun trophée — dégradation sûre).
function pvwDepartageWinner() {
  const cap = state.capturesDep;
  if (cap[0] > cap[1]) return 0;
  if (cap[1] > cap[0]) return 1;
  return null;
}
function valeurDepartage(p) {
  // Vétéran n'octroie plus de bonus de valeur : devenu actif (capture en face, GDD §6).
  if (p.type === 'R' && p.upgrades.includes('forteresse')) return 8; // Forteresse (GDD §6)
  return VALEUR_PIECE[p.type];
}

// Chute de drapeau (§6.3) : fige l'horloge, calcule le départage, en informe l'adversaire.
function pvwEndByTime(broadcast) {
  const p = state.pvw;
  if (!p || p.ended) return;
  pvwCommitActive();
  const winner = pvwDepartageWinner();
  p.endReason = 'time';
  if (broadcast) sendAction({ kind: 'flag' });
  finPartie(winner);
}

// ---------- CYCLE W3 — robustesse (reconnexion, resync, abandon, désync) ----------

// Fabrique une pièce complète depuis des données sérialisées (le module board.js
// n'exporte pas creerPiece ; on reconstruit un objet aux MÊMES champs, id synthétique —
// piece.id n'entre jamais dans le hash ni la logique, seulement l'identité locale).
let _resyncId = 100000;
function makePiece(d) {
  return {
    id: _resyncId++, type: d.type, owner: d.owner, r: d.r, c: d.c,
    upgrades: Array.isArray(d.upgrades) ? [...d.upgrades] : [],
    shield: !!d.shield,
    cooldowns: d.cooldowns ? { ...d.cooldowns } : {},
    doubleCoupUsed: !!d.doubleCoupUsed,
    decretUsed: !!d.decretUsed,      sacrificeArmed: !!d.sacrificeArmed,
      rempartGranted: !!d.rempartGranted,
      epineZone: d.epineZone ? { ...d.epineZone } : null,
    };
}

// Snapshot d'état complet et sérialisable (§7.3). Le survivant l'émet au retour de
// l'adversaire ou sur demande (resync_req). Contient tout ce qui rend l'état déterministe
// + les horloges + le seq courant (pour reprendre le lockstep au bon numéro d'action).
function pvwBuildSnapshot() {
  const p = state.pvw;
  const pieces = [];
  for (let r = 0; r < state.board.length; r++) {
    for (let c = 0; c < state.board[r].length; c++) {
      const q = state.board[r][c];
      if (!q) continue;
      pieces.push({
        r, c, owner: q.owner, type: q.type, upgrades: q.upgrades,
        shield: q.shield, cooldowns: q.cooldowns, doubleCoupUsed: q.doubleCoupUsed,
        decretUsed: q.decretUsed, sacrificeArmed: q.sacrificeArmed, rempartGranted: q.rempartGranted,
        epineZone: q.epineZone ? { ...q.epineZone } : null,
      });
    }
  }
  return {
    pieces,
    ecus: [state.ecus[0], state.ecus[1]],
    capturesDep: [state.capturesDep[0], state.capturesDep[1]], // départage §8.3 (fix W3)
    turn: state.turn,      chain: state.chain ? { r: state.chain.piece.r, c: state.chain.piece.c, type: state.chain.type } : null,
      taille: state.taille,
      bonusMode: !!state.bonusMode,
      huntRngSeed: state.huntRngSeed >>> 0,
      huntBonuses: state.huntBonuses ? state.huntBonuses.map((cell) => cell ? { ...cell } : null) : null,
      huntCollected: state.huntCollected ? [...state.huntCollected] : [0, 0],
      clocks: [pvwLiveClock(0), pvwLiveClock(1)],
    activeClock: state.turn,
    seq: getOnline().seq,
    hash: hashState(state),
  };
}

// Reconstruit l'état local depuis un snapshot reçu (§7.3). On repart de la VÉRITÉ du
// survivant (pas d'un rejeu des coups), puis on reprend le lockstep au seq indiqué.
function pvwApplySnapshot(snap) {
  const p = state.pvw;
  if (!p || p.ended || !snap || !Array.isArray(snap.pieces)) return;
  if (snap.taille && snap.taille !== state.taille) {
    console.warn('[online] snapshot taille incompatible, resync rejeté', { local: state.taille, remote: snap.taille });
    return;
  }
  if (!!snap.bonusMode !== !!state.bonusMode) {
    console.warn('[online] snapshot bonus incompatible, resync rejeté');
    return;
  }
  const board = Array.from({ length: state.board.length }, () => Array(state.board[0].length).fill(null));
  for (const d of snap.pieces) {
    if (d.r < 0 || d.r >= board.length || d.c < 0 || d.c >= board[0].length) continue;
    board[d.r][d.c] = makePiece(d);
  }
  state.board = board;
  state.ecus = [snap.ecus[0], snap.ecus[1]];
  // Départage §8.3 : valeurs de vérité du survivant (backward compat : snapshot pré-v20 sans champ).
  if (Array.isArray(snap.capturesDep)) state.capturesDep = [snap.capturesDep[0], snap.capturesDep[1]];
  state.turn = snap.turn;
  if (snap.bonusMode) state.bonusMode = true;
  if (snap.huntRngSeed != null) state.huntRngSeed = snap.huntRngSeed >>> 0;
  if (Array.isArray(snap.huntBonuses)) state.huntBonuses = snap.huntBonuses.map((cell) => cell ? { ...cell } : null);
  if (Array.isArray(snap.huntCollected)) state.huntCollected = [...snap.huntCollected];
  state.selected = null; state.legalMoves = []; state.panelPiece = null; state.ruTargets = [];
  state.anim = null; state.phase = 'play';
  // Chaîne éventuelle en cours chez le survivant.
  if (snap.chain) {
    const piece = board[snap.chain.r] && board[snap.chain.r][snap.chain.c];
    state.chain = piece ? { piece, type: snap.chain.type } : null;
    if (state.chain) {
      selectionner(piece);
      if (snap.chain.type === 'second-galop') state.legalMoves = state.legalMoves.filter((m) => !m.capture);
    }
  } else {
    state.chain = null;
  }
  // Horloges : valeurs de vérité du survivant, l'active repart de maintenant.
  p.clocks = [snap.clocks[0], snap.clocks[1]];
  p.activeClock = snap.turn;
  p.clockT0 = performance.now();
  p._lastTurn = snap.turn;
  p.clockDisplay = [snap.clocks[0], snap.clocks[1]];
  // Lockstep : on adopte le seq du survivant et on vide la file (les vieux messages
  // périmés sont abandonnés ; les suivants arriveront avec un seq > seq courant).
  onlineSetSeq(snap.seq | 0);
  onlineClearInbox();
  // Reprise : plus de désync ni de fenêtre de déconnexion en attente.
  p.desync = false; p.oppDisconnected = false; p._gapT0 = 0;
}

// Victoire par abandon (§7.2/§8.3) : fenêtre 30 s échue sans retour de l'adversaire.
function pvwEndByAbandon() {
  const p = state.pvw;
  if (!p || p.ended) return;
  pvwCommitActive();
  p.endReason = 'abandon';
  finPartie(p.side); // je suis le survivant → je gagne
}

// Annulation propre du match (désync confirmée, §3.4) : aucun trophée, retour possible au menu.
function pvwVoidMatch() {
  const p = state.pvw;
  if (!p || p.ended) return;
  p.voided = true;
  p.ended = true;
  p.endReason = 'void';
  state.winner = null;
  state.phase = 'gameover';
  console.warn('[online] match annulé (désynchronisation non résolue) — aucun trophée attribué');
}

// --- Revanche (§9.4) : proposée par les deux, couleurs inversées, nouveau match privé. ---
function proposerRevanche() {
  const p = state.pvw;
  if (!p || !p.ended) return;
  if (!p.rematch) p.rematch = {};
  if (p.rematch.offeredByMe || p.rematch.launching) return;
  p.rematch.offeredByMe = true;
  p.rematch.t0 = performance.now();
  sendRematch('offer');
  verifierRevanche();
}
function onRematchMsg(msg) {
  const p = state.pvw;
  if (!p || !p.ended) return;
  if (!p.rematch) p.rematch = {};
  if (msg.phase === 'offer') {
    // Proposition entrante : elle reste visible jusqu'à une décision explicite.
    p.rematch.offeredByOpp = true;
    p.rematch.incomingOffer = true;
    p.rematch.declined = false;
    return;
  }
  if (msg.phase === 'accept') {
    p.rematch.offeredByOpp = true;
    p.rematch.incomingOffer = false;
    verifierRevanche();
    return;
  }
  if (msg.phase === 'decline') {
    p.rematch.declined = true;
    p.rematch.incomingOffer = false;
    p.rematch.offeredByOpp = false;
    return;
  }
  if (msg.phase === 'expire') {
    p.rematch.expired = true;
    p.rematch.incomingOffer = false;
    p.rematch.offeredByOpp = false;
  }
}

function accepterRevanche() {
  const p = state.pvw;
  if (!p || !p.ended || !p.rematch || !p.rematch.incomingOffer
      || p.rematch.expired || p.rematch.declined) return;
  p.rematch.incomingOffer = false;
  p.rematch.offeredByMe = true;
  p.rematch.declined = false;
  sendRematch('accept');
  verifierRevanche();
}

function refuserRevanche() {
  const p = state.pvw;
  if (!p || !p.ended || !p.rematch || !p.rematch.incomingOffer) return;
  p.rematch.incomingOffer = false;
  p.rematch.declined = true;
  p.rematch.offeredByOpp = false;
  sendRematch('decline');
}
function verifierRevanche() {
  const p = state.pvw;
  if (!p || !p.rematch || p.rematch.launching || p.rematch.expired || p.rematch.declined) return;
  if (p.rematch.offeredByMe && p.rematch.offeredByOpp) {
    p.rematch.launching = true;
    const prevId = p.matchId || getOnline().matchId;
    // Bascule en écran de mise en relation : le handshake 'ready' du nouveau canal
    // relancera commencerPartiePvP (couleurs inversées via le side renvoyé par la RPC).
    state.phase = 'matchmaking';
    state.matchmaking = {
      mode: 'matched', oppPseudo: p.oppPseudo, oppTrophies: p.oppTrophies,
      error: null, band: 100, searchStart: Date.now(),
    };
    state._pvwStarting = false;
    onlineRematch(prevId).then((ok) => {
      if (!ok && state.phase === 'matchmaking') {
        state.matchmaking.mode = 'lobby';
        state.matchmaking.error = getOnline().error || 'Revanche impossible.';
      }
    });
  }
}

// Boucle W2/W3 : pompe les actions entrantes, gère l'horloge, la chute de drapeau, la
// fenêtre de reconnexion (30 s → abandon), les trous de seq et la désync (→ resync/void).
function pvwTick() {
  const p = state.pvw;
  if (state.mode !== 'pvw' || !p) return;

  // Revanche en attente : timeout 20 s si l'adversaire ne répond pas (§9.4).
  if (p.ended && p.rematch && p.rematch.offeredByMe && !p.rematch.offeredByOpp
      && !p.rematch.launching && !p.rematch.expired) {
    if ((performance.now() - p.rematch.t0) / 1000 > 20) {
      p.rematch.expired = true;
      sendRematch('expire');
    }
  }

  // Désync détectée (hash discordant, §3.4) : tenter un resync ; au-delà de 2 essais, annuler.
  if (p.desync && !p.ended && !p.voided) {
    p.desync = false;
    p.desyncTries = (p.desyncTries || 0) + 1;
    if (p.desyncTries > 2) { pvwVoidMatch(); return; }
    requestResync();
  }

  pumpPvw();
  if (p.ended) return;

  // Trou de séquence persistant (message Broadcast perdu/désordonné, §5.6) : demande de resync.
  if (inboxHasGap()) {
    if (!p._gapT0) p._gapT0 = performance.now();
    else if (performance.now() - p._gapT0 > PVW_GAP_RESYNC_MS) { requestResync(); p._gapT0 = performance.now(); }
  } else {
    p._gapT0 = 0;
  }

  // Bascule de tour (locale OU distante — finDeTour() a déjà tourné state.turn) : commit du
  // temps écoulé côté sortant, l'horloge passe au nouveau joueur actif. AUCUN incrément :
  // décision utilisateur 12/07 (spec §6.1 v3.1) — le +3 s/coup vidait le timer de son sens.
  if (state.turn !== p._lastTurn) {
    pvwCommitActive();
    p.activeClock = state.turn;
    p.clockT0 = performance.now();
    p._lastTurn = state.turn;
  }
  p.clockDisplay = [pvwLiveClock(0), pvwLiveClock(1)];

  // Chute de drapeau (§6.3) — prioritaire sur la fenêtre de reconnexion si l'horloge
  // tombe avant les 30 s.
  for (let s = 0; s < 2; s++) {
    if (pvwLiveClock(s) <= 0) { pvwEndByTime(true); return; }
  }

  // Fenêtre de reconnexion 30 s (§7.2) : l'adversaire est parti → décompte, puis abandon.
  if (p.oppDisconnected && !p.ended) {
    if ((performance.now() - p.oppDcT0) / 1000 >= PVW_RECO_WINDOW) pvwEndByAbandon();
  }
}

// ---------- Entrées ----------

// Les chips ÉCONOMIE/COMBAT sont cliquables au menu local ET sur l'écran cadence
// d'une partie privée en ligne (GDD §7.2 v3.1 — le créateur impose sa variante).
// La sélection vit dans state.menu dans les deux cas (mémoire partagée).
function peutChoisirVariante() {
  if (!state.menu) return false;
  if (state.phase === 'menu') return true;
  return state.phase === 'matchmaking' && state.matchmaking
    && state.matchmaking.mode === 'cadence' && state.matchmaking.pendingAction === 'private';
}

function actionBouton(action) {
  // S.H.T. : aucune amélioration (pouvoirs actifs) ne peut être utilisée par une
  // pièce sous le debuff du roi pendant 2 tours.
  if (['ruee', 'rayon', 'rempart', 'sacrifice', 'decret', 'sht', 'hypnose', 'cavalerie', 'echange', 'vet', 'epine'].includes(action.kind)) {
    if (state.selected && ameliorationsBloquees(state.selected)) return;
  }
  switch (action.kind) {
    case 'ameliorer':
      if (state.selected && !ameliorationsBloquees(state.selected)
          && tutorielPermet(state, { type: 'panel', piece: state.selected })
          && (state.mode !== 'learn' || learnPermet(state, { type: 'panel', piece: state.selected }))) {
        ouvrirPanneau(state.selected);
      } else if (state.mode === 'learn' && state.selected) {
        refusApprendre(state.selected);
      }
      break;
    case 'closePanel': state.panelPiece = null; break;
    // Promotion (GDD §5.1.b) : choix de pièce du panneau modal → le coup part enfin.
    case 'promoChoice': {
      if (state.mode === 'learn') { refusApprendre(state.learnExpectedPiece); break; }
      if (state.phase !== 'promotion' || !state.promo) break;
      const { piece, mv } = state.promo;
      state.promo = null;
      state.phase = 'play';
      jouerCoup(piece, { ...mv, promo: action.t });
      break;
    }
    case 'promoCancel':
      state.promo = null;
      state.phase = 'play';
      deselectionner();
      break;
    case 'buy': {
      // Tutoriel et Apprendre : seule la carte attendue répond (refus = feedback).
      if (!tutorielPermet(state, { type: 'buy', id: action.id })
          || (state.mode === 'learn' && !learnPermet(state, { type: 'buy', id: action.id }))) {
        state.buzz = performance.now(); state.buzzId = action.id;
        break;
      }
      const learnPiece = state.mode === 'learn' ? state.panelPiece : null;
      const upgradesBefore = learnPiece ? learnPiece.upgrades.length : 0;
      acheter(action.id);
      // L'achat doit être réel : l'amélioration n'est utilisable qu'après son
      // débit effectif, aussi bien dans les niveaux classiques que les puzzles.
      if (learnPiece && learnPiece.upgrades.length > upgradesBefore) {
        state.learnPurchased = true;
        if (state.learnKind === 'puzzle') state.puzzlePurchased = true;
        // Le scénario Bouclier est une démonstration sans déplacement : après
        // l'achat, repasse dans la phase contrôlée par verifierMiniJeu() afin que
        // scenarioBouclier puisse lancer l'attaque visuelle du pion adverse.
        if (state.learnKind === 'classic' && state.learnAutoDemo) {
          state.panelPiece = null;
          state.selected = null;
          state.legalMoves = [];
          state.phase = 'learn-game';
        } else if (state.learnKind === 'classic') {
          // Après l'achat, referme le catalogue pour révéler le bouton du
          // pouvoir actif. On conserve la pièce sélectionnée afin que le joueur
          // puisse l'activer immédiatement (notamment pour Épine niveau 19).
          state.panelPiece = null;
          state.selected = learnPiece;
          state.phase = 'play';
          state.legalMoves = coupsAutorises(learnPiece);
        }
      }
      break;
    }
    // Pouvoirs actifs : en tutoriel, seul le pouvoir prévu par l'étape répond.
    case 'ruee': if (autorisePouvoir('ruee')) activerRuee(); break;
    case 'rayon': if (autorisePouvoir('rayon')) activerRayon(); break;
    case 'rempart': if (autorisePouvoir('rempart')) activerRempart(); break;
    case 'sacrifice': if (autorisePouvoir('sacrifice')) activerSacrifice(); break;
    case 'decret': if (autorisePouvoir('decret')) activerDecret(); break;
    case 'sht': if (autorisePouvoir('sht')) activerSHT(); break;
    case 'hypnose': if (autorisePouvoir('hypnose')) activerHypnose(); break;
    case 'cavalerie': if (autorisePouvoir('cavalerie')) activerCavalerie(); break;
    case 'echange': if (autorisePouvoir('echange')) activerEchange(); break;
    case 'vet': if (autorisePouvoir('vet')) activerVet(); break;
    case 'epine': if (autorisePouvoir('epine')) activerEpine(); break;
    // Décliner un enchaînement (Double coup / Second galop) : pas de cooldown posé.
    case 'downloadReplay': downloadReplayMD(state); break;
    // Écran REPLAYS dédié (plein écran, comme le lobby en ligne) — remplace
    // l'ancienne liste dépliante sous le menu d'accueil (demande utilisateur 12/07).
    case 'ouvrirReplays':
      if (state.phase === 'menu') state.phase = 'replays';
      break;
    case 'fermerReplays':
      if (state.phase === 'replays') retourMenu();
      break;
    // --- Deck editor (recovery 29/07 [23:30]) ---
    case 'ouvrirDecks':
      if (state.phase === 'menu') {
        // Mount : charge + sanitize le decksRoot depuis localStorage. sanitizeRoot
        // arme les migrations cumulatives (Décret/Sacrifice inversion, Bouclier/Vétéran
        // inversion, etc.) — un vieux localStorage n'invalide pas le deck.
        state.decksRoot = sanitizeRoot(loadDecks());
        state._deckEditor = null;
        state.phase = 'decks';
      }
      break;
    case 'fermerDecks':
      // Ferme la modal de rename si elle était ouverte (safety cleanup).
      hideRenameModal();
      if (state.phase === 'decks') { state._deckEditor = null; retourMenu(); }
      break;
    case 'switchDeck': {
      // Bascule l'actif (idx < ids.length) OU crée un nouveau deck si l'onglet est vide.
      // Cap DECK_LIMIT=5 dans decks.js — createDeck clone l'actif et retourne {root, newId}.
      // NOTE bug-fix 30/07 : createDeck retourne {root, newId}, pas juste newId — l'ancien
      // code passait l'objet entier à setActiveDeck, qui ne trouvait pas de clé
      // decks[objet] → active restait inchangé → le tab cliqué ne devenait JAMAIS bleu.
      if (state.phase === 'decks' && Number.isInteger(action.value)) {
        const root = state.decksRoot || sanitizeRoot(loadDecks());
        const ids = Object.keys(root.decks);
        const idx = action.value;
        if (idx < ids.length) {
          // Deck existant à cet index → on bascule l'actif (sanitize retourne un NOUVEAU root).
          const next = setActiveDeck(root, ids[idx]);
          saveDecks(next);
          state.decksRoot = next;
        } else if (ids.length < DECK_LIMIT) {
          // Slot vide → on crée un clone et l'active (createDeck rend un NOUVEAU root).
          const created = createDeck(root);
          if (created && created.newId) {
            saveDecks(created.root);
            state.decksRoot = created.root;
          }
        }
      }
      break;
    }
    case 'editSlot':
      if (state.phase === 'decks' && action.type && action.cat) {
        state._deckEditor = { type: action.type, cat: action.cat };
        state.phase = 'deck-picker';
      }
      break;
    case 'pickUpgrade':
      if (state.phase === 'deck-picker' && state._deckEditor) {
        const root = state.decksRoot || sanitizeRoot(loadDecks());
        const { type, cat } = state._deckEditor;
        // action.id peut être null (= vider le slot) — setSlot accepte null.
        // 31/07 (demande user) : on applique l'amélioration SANS quitter le picker
        // (le slot choisi est mis en surbrillance en direct). Seul « ← Retour »
        // (cancelPick) ferme l'écran DECKS/picker.
        const next = setSlot(root, type, cat, action.id);
        saveDecks(next);
        state.decksRoot = next;
      }
      break;
    case 'cancelPick':
      if (state.phase === 'deck-picker') {
        state._deckEditor = null;
        state.phase = 'decks';
      }
      break;
    case 'renameDeck':
      // Ouvre la modal DOM de rename (deck editor). Le nouveau nom est validé côté
      // DOM (Enter / bouton Valider) puis dispatché via confirmerRename() qui appelle
      // renameDeck(root, id, name) → saveDecks(root) → re-render.
      if (state.phase === 'decks' && action.id) {
        const root = state.decksRoot || sanitizeRoot(loadDecks());
        if (root.decks[action.id]) {
          state._renamingDeckId = action.id;
          showRenameModal(root.decks[action.id].name || '');
        }
      }
      break;
    case 'deleteDeck':
      // Confirmation native (browser confirm) puis deleteDeck(root, id) qui protège
      // déjà contre la suppression du dernier deck. saveDecks persiste immédiatement.
      if (state.phase === 'decks' && action.id) {
        const root = state.decksRoot || sanitizeRoot(loadDecks());
        const dName = (root.decks[action.id] && root.decks[action.id].name) || 'Sans nom';
        if (window.confirm(`Supprimer le deck "${dName}" ?\nCette action est irréversible.`)) {
          const next = deleteDeck(root, action.id);
          saveDecks(next);
          state.decksRoot = next;
        }
      }
      break;
    // Mode replay — contrôles
    case 'startReplay': {
      const r = action.key ? loadReplayByKey(action.key) : loadLastReplay();
      if (r) commencerReplay(r);
      break;
    }
    case 'replaySpeed':
      if (state.phase === 'replay' && action.speed >= 1 && action.speed <= 3) {
        state.replaySpeed = action.speed;
        // Relance immédiatement avec le nouveau délai si en cours de lecture.
        if (state.replayPlaying) {
          clearTimeout(state._replayTimer);
          avancerReplay();
        }
      }
      break;
    case 'replayPlayPause':
      if (state.phase === 'replay') {
        state.replayPlaying = !state.replayPlaying;
        if (state.replayPlaying) avancerReplay();
      }
      break;
    case 'replayQuit':
      if (state.phase === 'replay') retourMenu();
      break;
    case 'endChain':
      if (state.chain) {
        // PvP en ligne : ne décliner que sur mon tour, et prévenir l'adversaire (§5.5).
        if (state.mode === 'pvw' && state.pvw && state.turn !== state.pvw.side) break;
        pvwEmitEndChain();
        state.chain = null;
        finDeTour();
      }
      break;
    // SPEC §5.3 : NOUVELLE PARTIE depuis l'écran de victoire = retour au menu
    // d'accueil (pas relance directe).
    case 'restart': retourMenu(); break;
    // Revanche PvP (§9.4) : proposer, accepter ou refuser une revanche.
    case 'rematch': proposerRevanche(); break;
    case 'acceptRematch': accepterRevanche(); break;
    case 'declineRematch': refuserRevanche(); break;
    // Cycle A — compte (spec-online §5.1). L'auth/overlay vit dans account.js ; ici on
    // ne fait qu'ouvrir/fermer. Une panne réseau n'atteint jamais le reste du jeu.
    case 'login': startAuth(); break;
    case 'logout': logout(); break;
    case 'mfa': ouvrirActivationMfa(); break;
    // Menu hamburger (31/07) : bascule l'ouverture du drawer latéral
    // (onglets Compte/Apparence/Langues/À propos). hamburgerT0 anime le glissement d'ouverture.
    case 'toggleHamburger':
      if (state.ui) {
        state.ui.hamburgerOpen = !state.ui.hamburgerOpen;
        if (state.ui.hamburgerOpen) {
          state.ui.hamburgerT0 = performance.now();
          if (!state.ui.drawerTab) state.ui.drawerTab = 'account';
        }
      }
      break;
    case 'selectDrawerTab':
      if (state.ui && ['account', 'appearance', 'language', 'about'].includes(action.tab)) {
        state.ui.drawerTab = action.tab;
      }
      break;
    case 'toggleTheme':
      basculerTheme();
      if (state.menu) state.menu.themeMode = themeMode;
      break;
    case 'setLanguage':
    language = enregistrerLangue(action.code);
    state.language = language;
    if (state.menu) state.menu.language = language;
      if (state.ui) state.ui.hamburgerT0 = performance.now();
      break;
    case 'togglePreview': {
      if (state.phase !== 'menu' || !state.ui || !state.ui.preview) break;
      const taille = ['std', 'l15', 'bonus'].includes(action.taille) ? action.taille : 'std';
      const preview = state.ui.preview[taille];
      if (!preview) break;
      const now = performance.now();
      if (preview.playing) {
        preview.elapsed = Math.max(0, now - (preview.startedAt ?? now));
        preview.startedAt = null;
        preview.playing = false;
      } else {
        if (preview.finished) preview.elapsed = 0;
        preview.finished = false;
        preview.startedAt = now - preview.elapsed;
        preview.playing = true;
      }
      break;
    }
    // Retour au menu (spectateur).
    case 'retourMenu': retourMenu(); break;
    // Mode APPRENDRE : démonstrations + parcours de puzzles tactiques.
    case 'apprendre':
      if (state.phase === 'menu') demarrerApprendre(state);
      break;
    case 'tutorialStart':
      if (state.phase === 'tutorial-hub') demarrerEtapeTutoriel(state, action.index);
      break;
    case 'tutorialHub':
      if (state.mode === 'tutorial' || state.phase === 'tutorial-done') demarrerTutorielHub(state);
      break;
    case 'openPuzzles':
      if (state.mode === 'learn' && state.phase === 'learn-hub') demarrerPuzzles(state);
      break;
    case 'classicHub':
      if (state.mode === 'learn') demarrerApprendre(state);
      break;
    case 'learnStart':
      if (state.phase === 'learn-hub' && apprendreEstDebloque(state, action.index)) {
        demarrerMiniJeu(state, action.index);
      }
      break;
    case 'puzzleStart':
      if (state.phase === 'puzzle-hub' && apprendrePuzzleEstDebloque(state, action.index)) {
        demarrerPuzzle(state, action.index);
      }
      break;
    case 'learnRestart':
      if (state.phase === 'learn-game' || state.phase === 'learn-success') {
        reinitialiserMiniJeu(state);
      }
      break;
    case 'puzzleRestart':
      if (state.phase === 'puzzle-game' || state.phase === 'puzzle-success') {
        reinitialiserPuzzle(state);
      }
      break;
    case 'learnHub':
      if (state.mode === 'learn') {
        if (state.learnKind === 'puzzle') demarrerPuzzles(state);
        else demarrerApprendre(state);
      }
      break;
    case 'puzzleHub':
      if (state.mode === 'learn') demarrerPuzzles(state);
      break;
    case 'learnNext':
      if (state.mode === 'learn' && state.learnIndex != null) {
        const nextIndex = state.learnIndex + 1;
        if (nextIndex < TOTAL_LEARN_GAMES) demarrerMiniJeu(state, nextIndex);
        else demarrerApprendre(state);
      }
      break;
    case 'puzzleNext':
      if (state.mode === 'learn' && state.puzzleIndex != null) {
        const nextIndex = state.puzzleIndex + 1;
        if (nextIndex < TOTAL_PUZZLES) demarrerPuzzle(state, nextIndex);
        else demarrerPuzzles(state);
      }
      break;
    // Tutoriel : le menu ouvre désormais le parcours de niveaux avant la première étape.
    case 'tutoriel':
      if (state.phase === 'menu') demarrerTutorielHub(state);
      break;
    case 'tutorialContinue': forcerAvancement(state); break;
    case 'tutorialRestart': rejouerEtape(state); break;
    case 'abandonner':
      if (state.mode === 'pvw' && state.pvw) {
        // PvP en ligne : abandon = défaite immédiate ; l'adversaire (1-side) gagne (§7.4).
        if (state.pvw.ended) break;
        sendAction({ kind: 'resign' });
        state.pvw.endReason = 'resign';
        finPartie(1 - state.pvw.side);
        break;
      }
      if (state.mode === 'pvai' && state.ai) finPartie(state.ai.player);
      else finPartie(1 - state.turn);
      break;
    // Onglets du dashboard menu : changement de panneau sans lancer de partie.
    case 'selectMode':
      if (state.phase === 'menu' && state.menu && ['pvp', 'pvw', 'pvai'].includes(action.mode)) {
        state.menu.activeMode = action.mode;
      }
      break;
    // Cycle 1 — menu d'accueil.
    case 'pickMode': {
      // PvP en ligne (pvw) : exige un compte connecté (spec § décision D).
      if (action.mode === 'pvw') {
        const acc = getAccount();
        if (acc.status !== 'connected') { startAuth(); return; }
        entrerMatchmaking();
        return;
      }
      // PvAI et Spectateur désactivés tant qu'aucune difficulté n'est choisie.
      if ((action.mode === 'pvai' || action.mode === 'spectator') && (!state.menu || !state.menu.difficulty)) return;
      const diff = state.menu && state.menu.difficulty ? state.menu.difficulty : 1;
      // Variantes locales (GDD §7.2 v3) : on passe variantId à commencerPartie ; le
      // lock scope (PvAI / PvP en ligne refusent) est appliqué côté commencerPartie via
      // variantePourMode() — la sélection utilisateur reste mémorisée en state.menu
      // pour le prochain passage en mode 'pvp'.
      const variantId = variantIdFromMenu(state);
      commencerPartie(action.mode, { difficulty: diff, variantId });
      break;
    }
    case 'pickDifficulty':
      if (state.phase === 'menu' && state.menu) state.menu.difficulty = action.level;
      break;
    // Variantes locales (GDD §7.2 v3) : deux axes orthogonaux combinés librement.
    // Chaque clic met à jour l'état mémoire ; le toggle déplie l'accordéon.
    case 'pickEconomie':
      if (peutChoisirVariante() && ['standard', 'plafond15', 'illimite'].includes(action.value)) {
        state.menu.economie = action.value;
      }
      break;
    case 'pickCombat':
      if (peutChoisirVariante() && ['standard', 'elimX2'].includes(action.value)) {
        state.menu.combat = action.value;
      }
      break;
      // Phase A.5 : la taille de plateau est sélectionnable depuis le menu principal.
    // En ligne, chaque taille utilise une file publique séparée ; bonus est hors classement.
    case 'pickTaille':
      if (peutChoisirVariante() && ['std', 'l15', 'bonus'].includes(action.value)) {
        state.menu.taille = action.value;
      }
      break;
    case 'toggleVariant':
      if (state.phase === 'menu' && state.menu) {
        state.menu.showVariant = !state.menu.showVariant;
      }
      break;
    // (helper hors switch : cf. peutChoisirVariante() — menu local OU écran cadence privé)
    // Matchmaking — boutons
    // Lobby → « Lancer une recherche » : ouvre d'abord l'écran de CADENCE (aucun réseau).
    // L'inscription en file n'a lieu qu'au pickCadence (lancerRecherchePublique).
    case 'resumeMatch':
      if (state.phase === 'menu') reprendrePartiePvP();
      break;
    case 'startSearch':
      // [00:05] Le clic sur « Lancer une recherche » du MENU atterrit sur le LOBBY
      // matchmaking (mode='lobby') o\u00f9 user peut choisir « 🔍 En ligne au hasard »
      // ou « 👥 Avec un ami ». Le clic sur « 🔍 Lancer une recherche » depuis le LOBBY
      // (bouton ligne 1852 de render.js) ouvre directement le cadence picker.
      if (state.phase === 'menu') {
        console.log('[matchmaking] startSearch (menu): atterrissage sur lobby');
        entrerMatchmaking();
        break;
      }
      if (state.phase === 'matchmaking') {
        // [23:45] Guard auth : si l'user n'est pas connect\u00e9, ouvre l'auth overlay
        // et affiche un message d'erreur clair (évite le silent fail qui faisait
        // croire à user que « rien ne marche »).
        if (getAccount().status !== 'connected') {
          console.warn('[matchmaking] startSearch sans auth → ouverture overlay');
          state.matchmaking.error = 'Connectez-vous d\'abord pour jouer en ligne.';
          startAuth();
          break;
        }
        state.matchmaking.mode = 'cadence';
        state.matchmaking.pendingAction = 'search';
        state.matchmaking.error = null;
      }
      break;
    // Écran cadence → choix d'un temps initial, puis route vers l'action d'origine.
    case 'pickCadence':
      if (state.phase === 'matchmaking' && state.matchmaking.mode === 'cadence') {
        state.matchmaking.cadence = action.cadence | 0 || PVW_TEMPS_INITIAL;
        if (state.matchmaking.pendingAction === 'private') lancerPartiePrivee();
        else lancerRecherchePublique();
      }
      break;
    // Écran de fin PvP → enchaîner une nouvelle partie en ligne SANS repasser par le
    // menu/lobby : quitte le match courant puis relance la même recherche publique.
    case 'newSearchOnline':
      nouvellePartieEnLigne();
      break;
    // Retour au menu depuis le lobby (aucun réseau en cours à annuler ; retourMenu
    // appelle onlineLeave par sécurité si un canal traînait).
    case 'quitterLobby':
      retourMenu();
      break;
    // « ✕ Annuler » / « ← Retour » depuis cadence/recherche/privé : ramène AU LOBBY.
    case 'cancelMatchmaking':
      if (state.phase === 'matchmaking') {
        const mm = state.matchmaking;
        if (mm.mode === 'search') cancelWait();       // retire de la file publique
        else if (mm.mode !== 'cadence') onlineLeave(); // privé : ferme le canal handshake (cadence : aucun réseau engagé)
        mm.mode = 'lobby';
        mm.error = null;
        mm.privateCode = null;
        mm.oppPseudo = null;
        mm.oppTrophies = null;
        mm.pendingAction = null;
      }
      break;
    // Lobby → « Jouer avec un ami » : même détour par l'écran de cadence (aucun réseau) ;
    // la création effective (createPrivate) part au pickCadence via lancerPartiePrivee.
    case 'createPrivateMatch':
      if (state.phase === 'matchmaking') {
        state.matchmaking.mode = 'cadence';
        state.matchmaking.pendingAction = 'private';
        state.matchmaking.error = null;
      }
      break;
    case 'showJoinCode':
      if (state.phase === 'matchmaking') {
        initOnline(getSupabaseClient());
        state.matchmaking.mode = 'private_join';
        state.matchmaking.error = null;
      }
      break;
    case 'joinByCode':
      if (state.phase === 'matchmaking') {
        // Si le code est vide, c'est que le bouton vient d'être cliqué :
        // on ouvre un prompt pour saisir le code.
        if (!action.code) {
          const code = prompt('Code d\'invitation (6 caractères) :');
          if (code && code.trim()) {
            actionBouton({ kind: 'joinByCode', code: code.trim() });
          }
          return;
        }
        state.matchmaking.error = null;
        joinByCode(action.code).then((ok) => {
          if (!ok) state.matchmaking.error = getOnline().error;
        });
      }
      break;
    case 'backToSearch':
      if (state.phase === 'matchmaking') {
        onlineLeave();
        state.matchmaking.mode = 'search';
        state.matchmaking.error = null;
        initOnline(getSupabaseClient());
        findMatch(
          state.matchmaking.cadence || PVW_TEMPS_INITIAL,
          variantIdFromMenu(state),
          state.menu && state.menu.taille ? state.menu.taille : DEFAULT_TAILLE
        );
      }
      break;
  }
}
function boutonSous(x, y) {
  if (!state.ui || !state.ui.buttons) return null; // Sécurité
  for (let i = state.ui.buttons.length - 1; i >= 0; i--) {
    const b = state.ui.buttons[i];
    // Le drawer est un voile modal : tant qu'il est ouvert, les contrôles du
    // menu situé derrière ne doivent ni être survolés ni recevoir le clic.
    // Les seuls boutons autorisés sont ceux du panneau et le bouton hamburger.
    if (!interactionAutoriseeParDrawer(b, x, y)) continue;
    if (b.shape === 'circle') {
      const cx = b.x + b.w / 2;
      const cy = b.y + b.h / 2;
      const radius = b.hitRadius ?? Math.min(b.w, b.h) / 2;
      if (Math.hypot(x - cx, y - cy) <= radius) return b;
      continue;
    }
    if (x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h) return b;
  }
  return null;
}

function estBoutonDrawer(button) {
  const kind = button && button.action && button.action.kind;
  return kind === 'login' || kind === 'logout' || kind === 'mfa'
    || kind === 'toggleTheme' || kind === 'setLanguage' || kind === 'selectDrawerTab';
}

function interactionAutoriseeParDrawer(button, x, y) {
  if (!state.ui || !state.ui.hamburgerOpen) return true;
  if (button.action && button.action.kind === 'toggleHamburger') return true;
  // Les contrôles du panneau sont les seuls contrôles autorisés pendant son
  // ouverture. La simple présence d'une ancienne hitbox derrière le panneau
  // ne suffit donc plus à rendre un bouton cliquable.
  if (!estBoutonDrawer(button)) return false;
  const panel = state.ui.hamburgerPanel;
  return !!panel
    && x >= panel.x && x <= panel.x + panel.w
    && y >= panel.y && y <= panel.y + panel.h;
}

function mettreAJourPointeur(e, { clearPress = false } = {}) {
  if (!state.ui) return null;
  const { x, y } = souris(e);
  const ui = state.ui;
  ui.pointer = { x, y, inside: !clearPress };
  const b = clearPress ? null : boutonSous(x, y);
  canvas.style.cursor = b && b.enabled ? 'pointer' : 'default';
  if (clearPress) ui.pressedId = null;
  return b;
}

function libererBoutonPresse() {
  if (state.ui) state.ui.pressedId = null;
}

function souris(e) {
  const rect = canvas.getBoundingClientRect();
  return {
    x: (e.clientX - rect.left) * (canvas.width / rect.width),
    y: (e.clientY - rect.top) * (canvas.height / rect.height),
  };
}

canvas.addEventListener('mousemove', (e) => {
  mettreAJourPointeur(e);
});

canvas.addEventListener('mouseleave', () => {
  if (!state.ui) return;
  state.ui.pointer = { x: -1, y: -1, inside: false };
  state.ui.pressedId = null;
  canvas.style.cursor = 'default';
});

// Pointer Events unifient doigt et stylet avec la souris. Les pointeurs tactiles
// délèguent au chemin mousedown existant afin de conserver un seul hit-test.
let pendingMobileTap = null;
canvas.addEventListener('pointerdown', (e) => {
  if (e.pointerType === 'mouse') return;
  // Dans l’historique mobile, différer l’action jusqu’au relâchement permet
  // d’entamer un scroll sur une ligne sans ouvrir accidentellement le replay.
  if (state.ui && state.ui.mobileLayout) {
    const start = souris(e);
    const button = boutonSous(start.x, start.y);
    const kind = button && button.action && button.action.kind;
    const scrollableMobileTap = [
      'startReplay', 'ouvrirReplays', 'togglePreview',
      'startSearch', 'createPrivateMatch', 'showJoinCode', 'quitterLobby',
      'pickCadence', 'cancelMatchmaking', 'joinByCode',
      'tutorialStart', 'tutorialHub', 'learnStart', 'puzzleStart', 'openPuzzles', 'classicHub',
      'switchDeck', 'editSlot', 'pickUpgrade', 'cancelPick',
    ].includes(kind);
    if (button && scrollableMobileTap) {
      // Marque aussi le mousedown de compatibilité avant de différer l’action.
      // Sinon certains navigateurs l’exécuteraient immédiatement malgré le scroll.
      dernierPointerTactile = performance.now();
      pendingMobileTap = { x: start.x, y: start.y, action: button.action, moved: false };
      try { canvas.setPointerCapture(e.pointerId); } catch (_) { /* non bloquant */ }
      return;
    }
  }
  if (!(state.ui && (state.ui.mobileGameplay || state.ui.mobileLayout))) e.preventDefault();
  dernierPointerTactile = performance.now();
  const synthetic = new MouseEvent('mousedown', {
    bubbles: true, button: 0, clientX: e.clientX, clientY: e.clientY,
  });
  Object.defineProperty(synthetic, '__royTouch', { value: true });
  canvas.dispatchEvent(synthetic);
});
canvas.addEventListener('pointermove', (e) => {
  if (e.pointerType === 'mouse') return;
  if (pendingMobileTap) {
    const point = souris(e);
    if (Math.hypot(point.x - pendingMobileTap.x, point.y - pendingMobileTap.y) > 10) {
      pendingMobileTap.moved = true;
    }
    return;
  }
  if (!(state.ui && (state.ui.mobileGameplay || state.ui.mobileLayout))) e.preventDefault();
  canvas.dispatchEvent(new MouseEvent('mousemove', {
    bubbles: true, clientX: e.clientX, clientY: e.clientY,
  }));
});
canvas.addEventListener('pointerup', (e) => {
  if (e.pointerType === 'mouse') return;
  if (pendingMobileTap) {
    const point = souris(e);
    const button = boutonSous(point.x, point.y);
    const sameAction = button && JSON.stringify(button.action) === JSON.stringify(pendingMobileTap.action);
    const action = pendingMobileTap.moved || !sameAction ? null : pendingMobileTap.action;
    pendingMobileTap = null;
    try { canvas.releasePointerCapture(e.pointerId); } catch (_) { /* non bloquant */ }
    if (action) actionBouton(action);
    libererBoutonPresse();
    return;
  }
  if (!(state.ui && (state.ui.mobileGameplay || state.ui.mobileLayout))) e.preventDefault();
  libererBoutonPresse();
});
canvas.addEventListener('pointercancel', (e) => {
  pendingMobileTap = null;
  try { canvas.releasePointerCapture(e.pointerId); } catch (_) { /* non bloquant */ }
  libererBoutonPresse();
});

window.addEventListener('mouseup', libererBoutonPresse);

let dernierPointerTactile = 0;
canvas.addEventListener('mousedown', (e) => {
  // Les navigateurs peuvent émettre un mousedown de compatibilité après
  // pointerdown. Le pointerdown synthétique a déjà traité l'action : on ignore
  // uniquement ce doublon, sans perturber la souris réelle.
  if (!e.__royTouch && performance.now() - dernierPointerTactile < 500) return;
  if (e.button === 2) return; // géré par contextmenu
  const { x, y } = souris(e);
  if (state.ui) state.ui.pointer = { x, y, inside: true };

  // 1) Boutons d'UI (prioritaires, valides même en animation pour restart).
  const b = boutonSous(x, y);
  if (b) {
    // Drawer hamburger — voile (scrim) : un clic sur un bouton HORS du panneau
    // (élément couvert par le voile) referme le drawer SANS déclencher l'élément.
    if (state.ui && state.ui.hamburgerOpen && b.action && b.action.kind !== 'toggleHamburger') {
      const pnl = state.ui.hamburgerPanel;
      const dansPanneau = pnl && x >= pnl.x && x <= pnl.x + pnl.w && y >= pnl.y && y <= pnl.y + pnl.h;
      if (!dansPanneau) { state.ui.hamburgerOpen = false; return; }
    }
    if (b.enabled) {
      if (state.ui) state.ui.pressedId = b.id;
      actionBouton(b.action);
    }
    // Drawer : un bouton ACTIVÉ dans le panneau (Connexion, Déconnexion, thème)
    // referme après l'action. La ligne désactivée « Français » garde le panneau
    // ouvert — l'action y est de toute façon ignorée (enabled=false).
    if (state.ui && state.ui.hamburgerOpen && b.enabled && b.action
        && !['toggleHamburger', 'selectDrawerTab'].includes(b.action.kind)) {
      state.ui.hamburgerOpen = false;
    }
    return;
  }
  // Clic en dehors de tout bouton : referme le drawer hamburger, SAUF si le clic
  // reste dans le panneau ouvert (zone inerte : en-têtes, espaces entre boutons).
  if (state.ui && state.ui.hamburgerOpen) {
    const pnl = state.ui.hamburgerPanel;
    const dansPanneau = pnl && x >= pnl.x && x <= pnl.x + pnl.w && y >= pnl.y && y <= pnl.y + pnl.h;
    if (!dansPanneau) state.ui.hamburgerOpen = false;
  }

  if (state.phase === 'animating' || state.phase === 'gameover' || state.phase === 'replay'
      || state.phase === 'learn-success' || state.phase === 'puzzle-success'
      || state.phase === 'learn-success-pending' || state.phase === 'puzzle-success-pending') return;
  // Promotion en attente de choix : un clic hors du panneau (les boutons sont déjà
  // passés au hit-test ci-dessus) ANNULE et rend la sélection (GDD §5.1.b).
  if (state.phase === 'promotion') {
    state.promo = null;
    state.phase = 'play';
    deselectionner();
    return;
  }
  // Tutoriel : le verrouillage par étape (tutorielPermet, consulté plus bas)
  // remplace les anciens blocages codés en dur par numéro d'étape.
  // SPEC §1.4 : au menu d'accueil, le plateau n'est pas initialisé (state.board === null).
  // Tout clic hors bouton est ignoré pour éviter un null deref sur state.board[cell.r].
  if (state.phase === 'menu' || state.phase === 'matchmaking' || !state.board) return;
  // PvP en ligne (§5.2) : entrées bloquées hors de mon tour (miroir du gating PvAI).
  if (state.mode === 'pvw' && state.pvw && (state.pvw.ended || state.turn !== state.pvw.side)) return;

  const cell = caseDepuisPixel(x, y);
  if (!cell) { deselectionner(); return; }

  // 2) Ciblage d'un pouvoir actif (Ruée / Rayon sacré / Décret).
  const surCible = state.ruTargets.some((t) => t.r === cell.r && t.c === cell.c);
  if (state.phase === 'ruee-target') {
    const allowed = state.mode !== 'learn' || learnPermet(state, { type: 'target', cell });
    if (surCible && allowed) executerRuee(cell);
    else if (state.mode === 'learn') refusApprendre(cell);
    else { state.phase = 'play'; state.ruTargets = []; }
    return;
  }
  if (state.phase === 'rayon-target') {
    const allowed = state.mode !== 'learn' || learnPermet(state, { type: 'target', cell });
    if (surCible && allowed) executerRayon(cell);
    else if (state.mode === 'learn') refusApprendre(cell);
    else { state.phase = 'play'; state.ruTargets = []; }
    return;
  }
  if (state.phase === 'decret-target') {
    const allowed = state.mode !== 'learn' || learnPermet(state, { type: 'target', cell });
    if (surCible && allowed) executerDecret(cell);
    else if (state.mode === 'learn') refusApprendre(cell);
    else { state.phase = 'play'; state.ruTargets = []; }
    return;
  }
  if (state.phase === 'cavalerie-target') {
    const allowed = state.mode !== 'learn' || learnPermet(state, { type: 'target', cell });
    if (surCible && allowed) executerCavalerie(cell);
    else if (state.mode === 'learn') refusApprendre(cell);
    else { state.phase = 'play'; state.ruTargets = []; }
    return;
  }
  if (state.phase === 'cavalerie-push') {
    const allowed = state.mode !== 'learn' || learnPermet(state, { type: 'target', cell });
    if (surCible && allowed) executerPousseeCavalerie(cell);
    else if (state.mode === 'learn') refusApprendre(cell);
    else { state.phase = 'play'; state.ruTargets = []; }
    return;
  }
  if (state.phase === 'echange-target') {
    const allowed = state.mode !== 'learn' || learnPermet(state, { type: 'target', cell });
    if (surCible && allowed) executerEchange(cell);
    else if (state.mode === 'learn') refusApprendre(cell);
    else { state.phase = 'play'; state.ruTargets = []; }
    return;
  }
  if (state.phase === 'vet-target') {
    const allowed = state.mode !== 'learn' || learnPermet(state, { type: 'target', cell });
    if (surCible && allowed) executerVet(cell);
    else if (state.mode === 'learn') refusApprendre(cell);
    else { state.phase = 'play'; state.ruTargets = []; }
    return;
  }

  const cliquee = state.board[cell.r][cell.c];

  // 3) Une pièce est sélectionnée : jouer un coup, ou changer de sélection.
  if (state.selected) {
    const mv = state.legalMoves.find((m) => m.r === cell.r && m.c === cell.c);
    if (mv) {
      // Ceinture tutoriel : les coups verrouillés sont déjà filtrés de legalMoves.
      if (!tutorielPermet(state, { type: 'move', piece: state.selected, move: mv })
          || (state.mode === 'learn' && !learnPermet(state, { type: 'move', piece: state.selected, move: mv }))) {
        if (state.mode === 'learn') refusApprendre(cell);
        return;
      }
      // Promotion (GDD §5.1.b) : le choix de pièce précède le coup — panneau modal,
      // le coup part avec mv.promo (une seule émission réseau, hash cohérent).
      if (mv.promotion && state.selected.type === 'P') {
        if (state.mode === 'learn') { refusApprendre(cell); return; }
        state.promo = { piece: state.selected, mv };
        state.phase = 'promotion';
        return;
      }
      jouerCoup(state.selected, mv); return;
    }
    if (state.chain) return; // enchaînement en cours : seule la pièce enchaînée agit
    if (cliquee && cliquee.owner === state.turn) {
      if (!tutorielPermet(state, { type: 'select', piece: cliquee })
          || (state.mode === 'learn' && !learnPermet(state, { type: 'select', piece: cliquee }))) {
        if (state.mode === 'learn') refusApprendre(cell); else refusTutoriel(cell);
        return;
      }
      selectionner(cliquee); return;
    }
    deselectionner();
    return;
  }

  // 4) Rien de sélectionné : sélectionner sa propre pièce (l'étape du tutoriel
  // peut restreindre à une pièce précise — les autres affichent un cadenas).
  if (cliquee && cliquee.owner === state.turn) {
    if (!tutorielPermet(state, { type: 'select', piece: cliquee })
        || (state.mode === 'learn' && !learnPermet(state, { type: 'select', piece: cliquee }))) {
      if (state.mode === 'learn') refusApprendre(cell); else refusTutoriel(cell);
      return;
    }
    selectionner(cliquee);
  }
});

canvas.addEventListener('contextmenu', (e) => {
  e.preventDefault();
  if (state.phase === 'animating' || state.phase === 'gameover' || state.phase === 'replay'
      || state.phase === 'promotion') return;
  if (state.phase === 'menu' || state.phase === 'matchmaking' || !state.board) return;
  // PvP en ligne : panneau d'amélioration seulement sur mon tour.
  if (state.mode === 'pvw' && state.pvw && (state.pvw.ended || state.turn !== state.pvw.side)) return;
  const { x, y } = souris(e);
  const cell = caseDepuisPixel(x, y);
  if (cell) {
    const p = state.board[cell.r][cell.c];
    if (p && p.owner === state.turn && !ameliorationsBloquees(p)) {
      // Tutoriel : le panneau ne s'ouvre que sur la pièce prévue par l'étape.
      if (!tutorielPermet(state, { type: 'panel', piece: p })
          || (state.mode === 'learn' && !learnPermet(state, { type: 'panel', piece: p }))) {
        if (state.mode === 'learn') refusApprendre(cell); else refusTutoriel(cell);
        return;
      }
      ouvrirPanneau(p); return;
    }
  }
  deselectionner();
});

window.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    // Menu hamburger : Échap referme le panneau avant toute autre action.
    if (state.ui && state.ui.hamburgerOpen) { state.ui.hamburgerOpen = false; return; }
    if (state.phase === 'replays') { retourMenu(); return; }
    if (PHASES_CIBLAGE.includes(state.phase)) {
      state.phase = 'play'; state.ruTargets = [];
      if (state._cavEnemyCell) state._cavEnemyCell = null;
    }
    else if (state.panelPiece && state.mode !== 'tutorial') state.panelPiece = null;
    else if (state.mode !== 'tutorial') deselectionner();
  } else if (e.key === ' ' && state.chain) {
    // Décliner l'enchaînement en cours (Second galop sans poser le cooldown, Double coup gardé).
    // PvP en ligne : seulement sur mon tour, et signalé à l'adversaire (§5.5).
    if (state.mode === 'pvw' && state.pvw && state.turn !== state.pvw.side) return;
    e.preventDefault();
    pvwEmitEndChain();
    state.chain = null;
    finDeTour();
  }
});

// ---------- Boucle ----------
function update(now) {
  // Fin d'animation.
  if (state.anim && now - state.anim.t0 >= 150) {
    const done = state.anim.onDone;
    state.anim = null;
    if (state.phase === 'animating') state.phase = 'play';
    if (done) done();
  }
  // Purge des feedbacks expirés.
  state.popups = state.popups.filter((p) => now - p.t0 < 600);
  state.flashes = state.flashes.filter((f) => now - f.t0 < 200);

  // Tutoriel : vérifier si l'étape courante est complétée (hors animation).
  if (state.mode === 'tutorial' && !state.anim && verifierEtape(state)) {
    const fini = etapeSuivante(state);
    if (fini) state.phase = 'tutorial-done';
  }

  // APPRENDRE : une réussite termine uniquement le scénario courant. Le joueur
  // peut ensuite recommencer, revenir au hub ou retourner au menu principal.
  if (state.mode === 'learn' && state.phase === 'learn-game'
      && !state.anim && verifierMiniJeu(state)) {
    // La réussite est enregistrée tout de suite, mais le panneau attend 1 s :
    // le joueur peut voir la fin de l'action et le plateau final.
    state.learnProgress = marquerMiniJeuReussi(state);
    state.learnSuccess = true;
    state.learnMessage = 'Situation maîtrisée';
    state.learnSuccessAt = now;
    state.phase = 'learn-success-pending';
  }
  if (state.mode === 'learn' && state.phase === 'learn-success-pending'
      && now - (state.learnSuccessAt || now) >= 500) {
    state.phase = 'learn-success';
  }
  if (state.mode === 'learn' && state.learnKind === 'puzzle'
      && state.phase === 'puzzle-game' && !state.anim && verifierPuzzle(state)) {
    state.puzzleProgress = marquerPuzzleReussi(state);
    state.learnSuccess = true;
    state.learnMessage = 'Puzzle résolu';
    state.learnSuccessAt = now;
    state.phase = 'puzzle-success-pending';
  }
  if (state.mode === 'learn' && state.phase === 'puzzle-success-pending'
      && now - (state.learnSuccessAt || now) >= 500) {
    state.phase = 'puzzle-success';
  }
}

function loop(now) {
  // Synchronise les dimensions avant le tick et le rendu : les hitboxes et la
  // résolution logique du Canvas restent cohérentes pendant toute la frame.
  synchroniserAffichage();
  update(now);
  // Une action peut changer de phase pendant update() (menu → partie ou inverse) :
  // resynchroniser ici évite d'afficher une frame avec le mauvais layout.
  synchroniserAffichage();
  // Injecte l'état compte (réf. vivante) pour le rendu du bandeau menu, sans coupler
  // le rendu à account.js. Toujours défini avant render, y compris après un retourMenu().
  state.account = getAccount();
  // Les états de partie/replay sont recréés indépendamment du menu : recopier
  // la préférence globale garantit que le bandeau garde le bon libellé partout.
  state.themeMode = themeMode;
  state.language = language;
  state._hasReplays = hasReplays(); // pour la liste REPLAYS du menu (render.js)
  if (state.phase === 'menu' || state.phase === 'replays') {
    // L'authentification est asynchrone : le menu peut être créé en invité,
    // puis découvrir la reprise dès que le profil est chargé.
    state.resumeAvailable = !!lireReprisePvP();
    state._replayList = getReplayList();
    // La feuille de partie du dashboard lit le replay complet le plus récent,
    // tandis que l'historique conserve les synthèses pour rester léger.
    const latest = state._replayList[0];
    const nextReplayKey = latest && typeof latest.key === 'string' ? latest.key : null;
    // Ne relit le replay complet que lorsque la partie la plus récente change.
    // La boucle du menu tourne à chaque frame ; éviter 60 lectures localStorage/s.
    if (nextReplayKey !== state._dashboardReplayKey) {
      state._dashboardReplayKey = nextReplayKey;
      state._dashboardReplay = nextReplayKey ? loadReplayByKey(nextReplayKey) : null;
    }
  }

  // Matchmaking : sync l'état online → state.matchmaking pour le rendu.
  // Le lobby est purement local : on ne recopie AUCUN champ réseau (sinon une erreur
  // résiduelle d'une recherche annulée s'afficherait sur le lobby).
  if (state.phase === 'matchmaking' && state.matchmaking.mode !== 'lobby') {
    const ol = getOnline();
    if (ol) {
      state.matchmaking.oppPseudo = ol.oppPseudo;
      state.matchmaking.oppTrophies = ol.oppTrophies;
      state.matchmaking.error = ol.error;
      state.matchmaking.band = ol.band;
      state.matchmaking.variant = ol.variant; // privé : variante imposée/héritée (affichage)
      state.matchmaking.taille = ol.taille;   // taille plateau confirmée (badge CLASSÉ)
      if (ol.privateCode) state.matchmaking.privateCode = ol.privateCode;
    }
  }

  // PvP en ligne (W2) : synchro des coups entrants + horloge + chute de drapeau.
  if (state.mode === 'pvw') pvwTick();

  // Le dashboard reste pleine largeur ; les écrans qui affichent réellement
  // un plateau utilisent une largeur plus compacte sur desktop.
  canvas.classList.toggle('game-screen', !!state.board);
  canvas.classList.toggle('mobile-gameplay', !!(state.ui && state.ui.mobileGameplay));
  canvas.classList.toggle('mobile-menu', !!(state.ui && state.ui.mobileLayout));
  render(ctx, state, now);
  requestAnimationFrame(loop);
}

// Câblage des callbacks online → main.js. Appelé une fois au démarrage, et rappelé
// dans entrerMatchmaking() (idempotent). Placé AVANT requestAnimationFrame pour
// éviter la race : si l'utilisateur clique « En ligne » avant que le CDN charge,
// getSupabaseClient() renvoie null → initOnline(null) → error propre.
function cablerCallbacksOnline() {
  onOnline('matched', () => {
    if (state.phase === 'matchmaking') {
      state.matchmaking.mode = 'matched';
    }
  });
  onOnline('ready', () => {
    if (state.phase === 'matchmaking' && !state._pvwStarting) {
      const ol = getOnline();
      state.matchmaking.oppPseudo = ol.oppPseudo;
      state.matchmaking.oppTrophies = ol.oppTrophies;
      setTimeout(() => {
        if (state.phase === 'matchmaking') commencerPartiePvP();
      }, 1500);
    }
  });
  onOnline('disconnected', () => {
    if (state.phase === 'matchmaking') {
      state.matchmaking.error = getOnline().error || 'Adversaire déconnecté.';
      state.matchmaking.mode = 'search';
    }
  });
  onOnline('error', () => {
    if (state.phase === 'matchmaking') {
      state.matchmaking.error = getOnline().error || 'Erreur de connexion.';
    }
  });
  // CYCLE W2 : messages de contrôle terminaux reçus en partie (abandon / chute de drapeau).
  onOnline('control', (msg) => {
    if (state.mode !== 'pvw' || !state.pvw || state.pvw.ended) return;
    if (msg.kind === 'resign') {
      // L'adversaire a abandonné → je gagne (§7.4). endReason='resign' (rapport normal
      // 'win'/'loss' concordant — PAS l'exception abandon des 30 s).
      state.pvw.endReason = 'resign';
      finPartie(state.pvw.side);
    } else if (msg.kind === 'flag') {
      // L'adversaire a constaté une chute de drapeau → départage local (identique, §6.3).
      pvwEndByTime(false);
    }
  });
  // CYCLE W3 — robustesse (déconnexion / reconnexion / resync, §7).
  // L'adversaire a disparu EN PARTIE : ouvre la fenêtre de reconnexion 30 s (bannière).
  onOnline('oppLeft', () => {
    if (state.mode === 'pvw' && state.pvw && !state.pvw.ended && !state.pvw.oppDisconnected) {
      state.pvw.oppDisconnected = true;
      state.pvw.oppDcT0 = performance.now();
    }
  });
  // L'adversaire est revenu (< 30 s) : ferme la bannière et lui renvoie l'état complet
  // (je suis le survivant = autorité de resync, §7.3). Il l'applique s'il l'attend.
  onOnline('oppReturned', () => {
    if (state.mode === 'pvw' && state.pvw && !state.pvw.ended) {
      state.pvw.oppDisconnected = false;
      sendResync(pvwBuildSnapshot());
    }
  });
  // L'adversaire demande mon état (reconnexion / trou de seq) : je lui envoie un snapshot.
  onOnline('resyncReq', () => {
    if (state.mode === 'pvw' && state.pvw && !state.pvw.ended) sendResync(pvwBuildSnapshot());
  });
  // Je reçois un snapshot que j'ai demandé : je reconstruis mon état et je reprends.
  onOnline('resync', (msg) => {
    if (state.mode === 'pvw' && state.pvw && !state.pvw.ended && msg && msg.snapshot) {
      pvwApplySnapshot(msg.snapshot);
    }
  });
  // Proposition / acceptation de revanche (§9.4).
  onOnline('rematch', (msg) => onRematchMsg(msg));
}

// Cycle A : initialise le compte (chargement Supabase + restauration de session). Non
// bloquant : en cas d'échec, on reste invité et le jeu tourne (garde-fou CLAUDE.md §7.2).
initAccount();
cablerCallbacksOnline(); // posé tôt pour que les callbacks soient prêts

// ---------- Modal DOM de rename deck (deck editor) ----------
// Pattern analogue à l'auth-overlay : DOM en superposition du canvas pour profiter
// du clavier système (focus, IME, copy-paste) plutôt que de dégrader en canvas text.
// La modal est montée UNE fois au boot, les boutons Valider/Annuler/Enter/Esc sont
// câblés sur l'input. state._renamingDeckId mémorise le deck en cours d'édition
// entre show → confirm.
// Timestamp d'ouverture : sert de garde pour le bug « même clic qui ouvre ET ferme ».
// Quand l'utilisateur clique sur le bouton Renommer (canvas mousedown → showRenameModal
// → modal.hidden=false), le modal devient immédiatement la cible mouseup/click (z-index 55
// > canvas, position:fixed inset:0 = full viewport). Le click event se retrouve donc
// avec e.target === modal, ce qui déclenche le handler de fermeture si on ne l'inhibe pas
// pour le premier clic (les navigateurs varient sur la règle exacte : common ancestor
// vs descendant — on est robust avec un timestamp plutôt que de compter sur une règle).
let _modalOpenTime = 0;
(function cablerRenameModal() {
  const modal = document.getElementById('deck-rename-modal');
  const input = document.getElementById('deck-rename-input');
  const validate = document.getElementById('deck-rename-validate');
  const cancel = document.getElementById('deck-rename-cancel');
  if (!modal || !input || !validate || !cancel) return;
  validate.addEventListener('click', (e) => { e.preventDefault(); confirmerRename(); });
  cancel.addEventListener('click', (e) => { e.preventDefault(); hideRenameModal(); });
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); confirmerRename(); }
    if (e.key === 'Escape') { e.preventDefault(); hideRenameModal(); }
  });
  // Click sur le backdrop (zone autour de la card) annule aussi, MAIS on ignore le
  // premier click s'il survient dans les 300 ms après l'ouverture (= même clic qui
  // a déclenché l'ouverture — bug observé : la modal s'ouvrait et se fermait instantanément).
  modal.addEventListener('click', (e) => {
    if (e.target !== modal) return;
    if (performance.now() - _modalOpenTime < 300) return;
    hideRenameModal();
  });
})();

function showRenameModal(initialValue) {
  const modal = document.getElementById('deck-rename-modal');
  const input = document.getElementById('deck-rename-input');
  if (!modal || !input) return;
  input.value = (initialValue || '').slice(0, 24);
  // Belt-and-braces : on pose le timestamp AVANT de retirer l'attribut `hidden`, comme
  // ça le click handler (s'il est appelé par le même clic d'ouverture) voit un delta
  // nul et laisse passer l'ouverture.
  _modalOpenTime = performance.now();
  modal.hidden = false;
  // setTimeout 0 pour passer après le focus du canvas (qui capture les events avant).
  // On RE-bloque le backdrop pendant les 300 premières frames via le timestamp ci-dessus.
  setTimeout(() => { input.focus(); input.select(); }, 0);
}

function hideRenameModal() {
  const modal = document.getElementById('deck-rename-modal');
  if (modal) modal.hidden = true;
  state._renamingDeckId = null;
}

function confirmerRename() {
  const input = document.getElementById('deck-rename-input');
  if (!input) return;
  const newName = (input.value || '').trim();
  if (!newName) return; // chaînes vides rejetées côté UI (no-op silencieux)
  const root = state.decksRoot || sanitizeRoot(loadDecks());
  const id = state._renamingDeckId;
  if (!id || !root.decks[id]) { hideRenameModal(); return; }
  const next = renameDeck(root, id, newName); // trim 24 chars enforced côté decks.js
  saveDecks(next);
  state.decksRoot = next;
  hideRenameModal();
}
requestAnimationFrame(loop);

// Exposé pour le débogage / tests automatisés.
// Ne pas écraser les propriétés posées par replay.js (exposeForDebug).
const existingRoychec = window.__roychec || {};
window.__roychec = { ...existingRoychec, get state() { return state; }, jouerCoup, coupsLegaux,
  retourMenu, finPartie, actionBouton,
  // Harness de test W2 (partie pvw locale sans réseau + injection d'actions entrantes).
  __pvwStartLocal: (side = 0, cadence = 300, variant) => commencerPartie('pvw', { side, matchId: 'debug', oppPseudo: 'Test', oppTrophies: 42, cadence, variant }),
  __pvwInject: (msg) => __debugEnqueue(msg),
  __pvwHash: () => hashState(state),
  __pvwSetClock: (side, sec) => { if (state.pvw) { state.pvw.clocks[side] = sec; state.pvw.clockT0 = performance.now(); } },
  // Harness W3 (tests robustesse en local, sans réseau).
  __pvwSnapshot: () => (state.pvw ? pvwBuildSnapshot() : null),
  __pvwApplySnapshot: (snap) => pvwApplySnapshot(snap),
  __pvwOppLeft: () => { if (state.pvw && !state.pvw.ended) { state.pvw.oppDisconnected = true; state.pvw.oppDcT0 = performance.now(); } },
  __pvwOppReturn: () => { if (state.pvw) state.pvw.oppDisconnected = false; },
  __pvwDesync: () => { if (state.pvw) state.pvw.desync = true; } };
