// roychec — rendu Canvas 2D. Dessine plateau, pièces, feedback, HUD et panneaux.
// Toute l'UI est dessinée sur le canvas ; les boutons cliquables sont enregistrés
// dans state.ui.buttons (hit-testés par main.js).
//
// Direction artistique : plateau de jeu en bois clair / prune, jetons façon
// pièces tournées, chrome (HUD, panneaux) en carton ivoire — pas d'interface
// "app sombre" plaquée par-dessus. Toute la palette vient de constants.js.
import {
  CELL, OX as OX_DESKTOP, OY as OY_DESKTOP, PANEL_X, CANVAS_W as CANVAS_W_DESKTOP, CANVAS_H as CANVAS_H_DESKTOP,
  C_CLAIR, C_FONCE, C_SEL, C_MOVE, C_CAP, C_RUEE,
  LETTRE, VALEUR_PIECE, UPGRADES, UPGRADES_PAR_TYPE, COULEUR_CAT,
  MAX_UPGRADES_PAR_PIECE, MAX_STATS_PAR_JOUEUR, estAmeliorationStat, ACCENT, NOM_JOUEUR,
  DUREE_ANIM, DUREE_FLASH, DUREE_POPUP, DUREE_GOLD, REVENU_PAR_COUP,
  C_BRUME, C_CARTE, C_ENCRE, C_SAUGE, C_IVOIRE_BOIS,
  C_ENCRE_DOUX, C_ENCRE_PALE, C_CARTE_BORD, C_OMBRE,
  C_AMBRE, C_AMBRE_FONCE, C_TERRACOTTA, C_SAUGE_FONCE, C_AMBRE_CLAIR, DECK_ACCENT,
  UI_THEME, REMPLI_PIECE,C_ENCRE_sub,
  PVW_CADENCES, cadenceLabel,
} from './constants.js?v=113';
import { VARIANT_PRESETS, COMBATS, variantLabel, variantIdFromMenu } from './variants.js?v=110';
import { creerPlateau } from './board.js?v=109';
// Phase A.5 v2 Phase 3 : TAILLE DE PLATEAU chips itèrent sur TAILLES (maison canonique
// zero-dep de tailles.js). Pas de cycle : tailles.js n'importe aucun autre module.
import { TAILLES } from './tailles.js?v=108';
import { coupsLegaux, roiEnEchec, ciblesVet } from './rules.js?v=117';
import { STEPS, TOTAL_STEPS, progressionTutoriel, tutorielEtapeDebloquee, tutorielPermet, tutorielHint, tutorielPanneauNormal } from './tutorial.js?v=109';
// Deck editor UI (recovery 29/07 [23:30]) : couche DONNÉES pure — loadDecks/getActiveDeck/
// setSlot sont utilisés par main.js (handlers) et render.js (lecture seule du deck actif
// pour l'affichage). Aucune dépendance inverse.
import { loadDecks, getActiveDeck, setActiveDeck, createDeck, sanitizeRoot, DECK_LIMIT, upgradesForPiece } from './decks.js?v=107';
import { LEARN_GAMES, TOTAL_LEARN_GAMES, PUZZLES, TOTAL_PUZZLES,
  apprendreHint, apprendreEstDebloque, apprendrePuzzleEstDebloque, learnPermet } from './learn.js?v=23';
import { traduire } from './i18n.js?v=10';


// Polices (DA §3) : Archivo Black pour tout le display (titres, HUD, badges,
// chiffres d'écus, boutons — toujours en CAPITALES) ; Nunito Sans pour les
// textes longs (descriptions de cartes). Fallback system-ui si les .woff2
// locales ne sont pas encore chargées — le jeu ne bloque jamais dessus.
const F_DISPLAY = '"Archivo Black", system-ui, sans-serif';
const F_TEXTE = '"Nunito Sans", system-ui, -apple-system, "Segoe UI", sans-serif';

// Géométrie active : desktop par défaut, ou largeur/hauteur logiques du gameplay
// mobile. Les primitives de rendu partagent ces alias pour garder un seul moteur.
let OX = OX_DESKTOP;
let OY = OY_DESKTOP;
let CANVAS_W = CANVAS_W_DESKTOP;
let CANVAS_H = CANVAS_H_DESKTOP;

// Conserve la géométrie des tuiles au même endroit (DA §4).
const TILE_GAP = 4;                     // gouttière Brume entre cases (~4 px à cellSize=70)

// === Phase A.5 v2 Phase 4 — geometry RUNTIME (par frame, en tête de render) ===
// Pour supporter l15 (8×15) sans débordement visuel du canvas, la géométrie n'est
// plus une constante : cellSize / ROWS / COLS / board frame / panel X sont dérivés de
// state.board[0..length] au début de chaque render(). Le moteur engine (Phase 1+2)
// est déjà size-aware via inB(board,r,c) ; ici on finalise la chaîne en rendant le
// rendu size-aware également. Fallbacks std (8×8, cellSize=70) garantissent que le
// premier appel à pixelVersCase / cellCenter AVANT tout render frame (pré-boucle)
// renvoie des coords valides pour le plateau par défaut.
let __TILE_R = Math.round(70 * 0.14); // ~= 10 px à std, ~7 px à l15 (~51 px cellSize)
let __CELL_SIZE = 70;
let __ROWS = 8;
let __COLS = 8;
let __BOARD_W = 560;        // frame width  = COLS * cellSize (std 8×70 = 560)
let __BOARD_H = 560;        // frame height = ROWS * cellSize (std 8×70 = 560)
let __PANEL_X_RUNTIME = 610; // PANEL_X historique d'origine (ré-évalué par compute)
function mobileInstructionsAuDessus(state) {
  return !!(state && state.ui && state.ui.mobileGameplay
    && (state.mode === 'tutorial' || state.mode === 'learn'));
}
// Les écrans de fin utilisent la même largeur logique que le gameplay mobile.
// Cela évite qu'un panneau ou sa rangée de boutons dépasse du Canvas sur téléphone.
function finEcranMobile(state) {
  return !!(state && state.ui && state.ui.mobileGameplay);
}
function largeurPanneauFin(state, largeurDesktop) {
  if (!finEcranMobile(state)) return largeurDesktop;
  // Sur téléphone, garder une marge visible autour de l'encadré et éviter qu'il
  // prenne presque toute la largeur de l'écran.
  return Math.min(320, Math.max(280, CANVAS_W - 40));
}
function mobileInstructionHeight(state) {
  if (!mobileInstructionsAuDessus(state)) return 0;
  // La fiche Apprendre n'affiche plus le solde d'écus dans sa description :
  // elle peut donc être plus compacte sans couper l'objectif.
  if (state.mode === 'learn' && state.learnKind !== 'puzzle') return 174;
  const step = STEPS[state.tutorialStep];
  const detailLength = step && step.detail ? String(step.detail).length : 0;
  // Les longues consignes gagnent quelques pixels, sans laisser la fiche
  // monopoliser l'écran : le texte est aussi borné dans le rendu ci-dessous.
  return Math.max(220, Math.min(250, 205 + Math.ceil(detailLength / 180) * 15));
}
function computeGeometry(state) {
  const mobileGameplay = !!(state && state.ui && state.ui.mobileGameplay);
  const mobileLayout = !!(state && state.ui && state.ui.mobileLayout);
  // Le menu et le matchmaking mobile n'ont pas de plateau, mais leur rendu
  // utilise tout de même les dimensions logiques du canvas téléphone. Sans ce
  // flag, dessineMatchmaking() calculait son centre sur la largeur desktop
  // (980 px) alors que le canvas réel faisait 320–768 px.
  const mobileCanvas = mobileGameplay || mobileLayout;
  __COLS = state && state.board ? state.board[0].length : 8;
  __ROWS = state && state.board ? state.board.length : 8;
  // Le menu et le desktop gardent exactement leur géométrie historique. En
  // gameplay mobile, le plateau réserve seulement une marge tactile de 12 px
  // de chaque côté et prend toute la largeur logique du téléphone.
  CANVAS_W = mobileCanvas
    ? Math.max(320, Number(state.ui.renderWidth) || 390)
    : CANVAS_W_DESKTOP;
  CANVAS_H = mobileCanvas
    ? (mobileGameplay
      ? Math.max(700, Number(state.ui.renderHeight) || 844)
      : Math.max(640, Number(state.ui.renderHeight) || 720))
    : CANVAS_H_DESKTOP;
  // Quand le catalogue mobile est ouvert, on réduit et centre légèrement le
  // plateau pour réserver une vraie zone aux améliorations sans les repousser
  // sous un long défilement. Le plateau reste entièrement visible et cliquable.
  const mobilePanelOpen = mobileGameplay && !!state.panelPiece;
  OX = mobileGameplay
    ? (mobilePanelOpen ? Math.max(44, Math.round(CANVAS_W * 0.14)) : 12)
    : OX_DESKTOP;
  // Sur téléphone, Tutoriel et Apprendre réservent une vraie carte de consignes
  // au-dessus du plateau. Le plateau reste ensuite la zone centrale, puis les
  // actions (dont AMÉLIORER) sont dessinées immédiatement sous son cadre.
  const instructionH = mobileInstructionHeight(state);
  // Hors Tutoriel/Apprendre, le bandeau de tour est retiré pour garder le layout
  // compact historique. Pour ces deux modes, OY intègre la carte supérieure.
  OY = mobileGameplay ? 40 + instructionH : OY_DESKTOP;

  // Pour le desktop, les plateaux larges gardent la réserve du panneau latéral.
  // Pour le téléphone, le plateau est pleine largeur (ou légèrement compacté
  // quand le catalogue est ouvert) ; le panneau reste aligné sur le bord tactile.
  const boardAvailableWidth = mobileGameplay
    ? CANVAS_W - OX * 2
    : CANVAS_W - OX - 280;
  __CELL_SIZE = __COLS > 8 || mobileGameplay
    ? Math.max(10, Math.floor(boardAvailableWidth / __COLS))
    : 70;
  __BOARD_W = __COLS * __CELL_SIZE;
  __BOARD_H = __ROWS * __CELL_SIZE;
  __TILE_R = Math.round(__CELL_SIZE * 0.14);
  __PANEL_X_RUNTIME = mobileGameplay ? 12 : OX + __BOARD_W + 30;
}
// Export pour permettre aux appelants externes (main.js click handlers entre frames)
// de lire la géométrie courante sans la recalculer — source-of-truth unique du module.
export function getCellSize() { return __CELL_SIZE; }
export function getBoardFrame() { return { w: __BOARD_W, h: __BOARD_H, rows: __ROWS, cols: __COLS }; }
export function getPanelXRuntime() { return __PANEL_X_RUNTIME; }

// Chemin d'une tuile de plateau (case rétrécie, coins arrondis).
// Phase A.5 v2 Phase 4 : cellSize + TILE_R dérivées du module-scope runtime
// (rafraîchi en tête de render() via computeGeometry()). Std 8×8 → byte-identique.
function tilePath(ctx, r, c) {
  roundRect(ctx, OX + c * __CELL_SIZE + TILE_GAP / 2, OY + r * __CELL_SIZE + TILE_GAP / 2,
    __CELL_SIZE - TILE_GAP, __CELL_SIZE - TILE_GAP, __TILE_R);
}

// --- Sprites de pièces (assets/pieces, 256×256 RGBA) ---
// Mapping type interne -> nom de fichier ; owner 0 = bleu, owner 1 = corail.
const SPRITE_NOM = { P: 'pion', N: 'cavalier', B: 'fou', R: 'tour', Q: 'dame', K: 'roi' };
const SPRITE_CAMP = ['1', '1-2'];
// Phase A.5 v2 Phase 5.A — SPRITE_H size-aware : la cible desktop std (60 px) est
// préservée à cellSize=70. Sur téléphone, on laisse davantage d'air autour de la pièce
// pour que sa silhouette ne remplisse pas presque toute la case rétrécie.
const SPRITE_H_RATIO = 60 / 70;          // desktop : 60 px à cellSize=70
const MOBILE_SPRITE_H_RATIO = 50 / 70;  // mobile : ~32 px à cellSize=45
function getSpriteHeight(state) {
  const ratio = state && state.ui && state.ui.mobileGameplay
    ? MOBILE_SPRITE_H_RATIO
    : SPRITE_H_RATIO;
  return Math.round(__CELL_SIZE * ratio);
}
// Incrémente ce numéro après avoir changé les images dans assets/pieces/
// pour forcer le navigateur à recharger les sprites au lieu d'utiliser son cache.
const SPRITE_VERSION = 13;
const sprites = {};  // clé `${owner}${type}` -> HTMLImageElement

// Les aperçus du menu réutilisent les vraies positions de départ du moteur,
// mais gardent un tableau initial par taille pour ne pas recréer 32 pièces à
// chaque frame d'animation.
const PREVIEW_BOARD_CACHE = new Map();
const PREVIEW_SEQUENCE_CACHE = new Map();
function previewBoardInitial(taille) {
  if (!PREVIEW_BOARD_CACHE.has(taille)) PREVIEW_BOARD_CACHE.set(taille, creerPlateau(taille));
  return PREVIEW_BOARD_CACHE.get(taille);
}
const PREVIEW_UPGRADE_LOADOUT = {
  // Cartes visibles inspirées des achats de la partie 8×8 importée.
  std: [
    { r: 6, c: 4, ids: ['bouclier'], shield: true },
    { r: 7, c: 0, ids: ['forteresse'], shield: true },
    { r: 0, c: 3, ids: ['couronne'], shield: true },
  ],
  // Cartes visibles inspirées des achats de la partie 15×8 importée.
  l15: [
    { r: 6, c: 8, ids: ['couronne'], shield: true },
    { r: 7, c: 0, ids: ['forteresse'], shield: true },
    { r: 0, c: 12, ids: ['bouclier'], shield: true },
  ],
  // Le troisième Markdown est converti en séquence Bonus visuelle : on garde
  // ses coups mais on ajoute les signaux de Chasse au plateau de présentation.
  bonus: [
    { r: 6, c: 4, ids: ['couronne'], shield: true },
    { r: 7, c: 7, ids: ['forteresse'], shield: true },
    { r: 0, c: 3, ids: ['bouclier'], shield: true },
  ],
};

const PREVIEW_REPLAY_MOVES = {
  // roychec-partie-1786012398207.md — partie 8×8.
  std: [
    ['e2', 'e3'], ['e7', 'e5'], ['d1', 'g4'], ['d8', 'f6'],
    ['g4', 'e6'], ['f6', 'e6'], ['d2', 'd3'], ['f1', 'c4'],
    ['e6', 'c4'], ['c2', 'c3'], ['c4', 'b4'], ['b4', 'c3'],
    ['a2', 'a3'], ['c3', 'e1'],
  ],
  // roychec-partie-1786012507457.md — partie 15×8.
  l15: [
    ['g1', 'j4'], ['g8', 'j5'], ['j4', 'j5'], ['m8', 'l6'],
    ['j5', 'l5'], ['k7', 'k6'], ['l5', 'k6'], ['k8', 'j7'],
    ['k6', 'j7'], ['j7', 'i8'],
  ],
  // roychec-partie-1786012831441.md — chronologie convertie visuellement en Bonus.
  bonus: [
    ['e2', 'e4'], ['e7', 'e5'], ['d1', 'h5'], ['d8', 'g5'],
    ['h5', 'g5'], ['f7', 'f6'], ['g5', 'h5'], ['g7', 'g6'],
    ['h5', 'e5'], ['e5', 'e8'],
  ],
};

const PREVIEW_BONUS_CELLS = [
  { r: 4, c: 2 },
  { r: 3, c: 5 },
];

function previewCaseFromNotation(notation) {
  return {
    r: 8 - Number(notation.slice(1)),
    c: notation.charCodeAt(0) - 97,
  };
}

function clonePreviewBoard(initial) {
  return initial.map((row) => row.map((piece) => piece ? {
    ...piece,
    upgrades: Array.isArray(piece.upgrades) ? [...piece.upgrades] : [],
    debuffs: piece.debuffs ? { ...piece.debuffs } : piece.debuffs,
  } : null));
}

function decoratePreviewBoard(board, taille) {
  for (const loadout of PREVIEW_UPGRADE_LOADOUT[taille] || PREVIEW_UPGRADE_LOADOUT.std) {
    const piece = board[loadout.r]?.[loadout.c];
    if (!piece) continue;
    piece.upgrades = [...new Set([...(piece.upgrades || []), ...loadout.ids])];
    if (loadout.shield) piece.shield = true;
  }
  return board;
}
function applyPreviewMove(board, move) {
  const piece = board[move.from.r]?.[move.from.c];
  if (!piece) return false;
  board[move.to.r][move.to.c] = piece;
  board[move.from.r][move.from.c] = null;
  piece.r = move.to.r;
  piece.c = move.to.c;
  return true;
}
function previewSequence(taille) {
  if (PREVIEW_SEQUENCE_CACHE.has(taille)) return PREVIEW_SEQUENCE_CACHE.get(taille);
  const board = decoratePreviewBoard(clonePreviewBoard(previewBoardInitial(taille)), taille);
  const notationMoves = PREVIEW_REPLAY_MOVES[taille] || PREVIEW_REPLAY_MOVES.std;
  const sequence = [];
  for (const [fromNotation, targetNotation] of notationMoves) {
    const from = previewCaseFromNotation(fromNotation);
    const target = previewCaseFromNotation(targetNotation);
    const piece = board[from.r]?.[from.c];
    // Les Markdown sont la source de vérité de la vidéo : on rejoue la destination
    // enregistrée même si une évolution ultérieure des règles la considérerait
    // différemment. On exige seulement que la pièce de départ existe.
    if (!piece) break;
    const resolved = { from, to: { r: target.r, c: target.c } };
    sequence.push(resolved);
    applyPreviewMove(board, resolved);
  }
  PREVIEW_SEQUENCE_CACHE.set(taille, sequence);
  return sequence;
}

// Préchargement au démarrage. Guardé : en environnement sans DOM (tests
// headless), Image n'existe pas -> on saute et le rendu bascule sur le fallback.
// ${SPRITE_CAMP[owner]}-
function chargerSprites() {
  if (typeof Image === 'undefined') return;
  for (let owner = 0; owner < 2; owner++) {
    for (const t of Object.keys(SPRITE_NOM)) {
      const img = new Image();
      img.src = `assets/pieces/${SPRITE_NOM[t]}-${SPRITE_CAMP[owner]}.png?v=${SPRITE_VERSION}`;
      sprites[owner + t] = img;
    }
  }
}
chargerSprites();

// Icône du jeu (assets/favicon.png) affichée à côté du wordmark dans les menus.
// Guardé comme chargerSprites : en environnement sans DOM (tests headless),
// Image n'existe pas -> on saute et le wordmark retombe sur le glyphe ♞.
const faviconImg = (typeof Image === 'undefined') ? null : new Image();
if (faviconImg) faviconImg.src = 'assets/favicon.png?v=1';
function faviconPrête() {
  return faviconImg && faviconImg.complete && faviconImg.naturalWidth > 0;
}

// Wordmark ROYCHEC avec l'icône du jeu à la place du glyphe ♞.
// align 'left' : x = bord gauche · align 'center' : x = centre horizontal.
function dessineWordmark(ctx, x, y, fontSize, align = 'left') {
  ctx.fillStyle = UI_THEME.text;
  ctx.font = `${fontSize}px ${F_DISPLAY}`;
  const text = 'ROYCHEC';
  if (!faviconPrête()) {
    ctx.textAlign = align;
    ctx.textBaseline = 'alphabetic';
    ctx.fillText('♞ ' + text, x, y);
    return;
  }
  const textW = ctx.measureText(text).width;
  const iconSize = Math.round(fontSize * 0.9);
  const gap = Math.round(fontSize * 0.32);
  const totalW = iconSize + gap + textW;
  const startX = align === 'center' ? x - totalW / 2 : x;
  const iconCenterY = y - Math.round(fontSize * 0.36);
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
  ctx.drawImage(faviconImg, startX, iconCenterY - iconSize / 2, iconSize, iconSize);
  ctx.fillText(text, startX + iconSize + gap, y);
}

// --- Vidéo du feu (pivot v3.2 — 2026-07-11) ---
// Le user a fourni game/assets/pieces/265194.mp4 (mp4 1920×1080 ~10 s ~60 fps H.264+AAC)
// comme STYLE canonique : le feu procédural Canvas du commit 9f48b832 cède sa place à un
// rendu drawImage(videoElement) tinté par catégorie, positionné DERRIÈRE la pièce.
// Référencée via la balise <video id="video-feu"> dans game/index.html (muted/autoplay/loop/
// playsinline côté HTML — Chrome/Safari acceptent l'autoplay muet sans interaction).
// UNE seule instance <video> partagée entre toutes les pièces (16 drawImage(vidéo)/frame).
const videoFeu = (typeof document !== 'undefined' && document.getElementById('video-feu')) || null;

// Lancement FORCÉ de la lecture (v3.3 — 2026-07-11) : l'attribut HTML `autoplay` ne
// suffit pas pour une <video> hors-viewport (1×1 px, left:-9999px) — Chrome la laisse
// en pause (paused=true, currentTime=0) et le canvas dessinait éternellement la frame 0
// (constaté en navigateur réel : readyState=4 mais paused=true). play() muet est
// toujours autorisé par la policy autoplay ; on tente au parsing du module puis on
// re-tente sur canplay / 1re interaction / retour d'onglet.
if (videoFeu) {
  const relancerFeu = () => {
    if (videoFeu.paused) {
      const p = videoFeu.play();
      if (p && typeof p.catch === 'function') p.catch(() => {});
    }
  };
  relancerFeu();
  videoFeu.addEventListener('canplay', relancerFeu);
  document.addEventListener('pointerdown', relancerFeu);
  document.addEventListener('visibilitychange', relancerFeu);
}

// Renvoie le sprite prêt à dessiner (chargé) ou null (fallback jeton).
// Prend le camp VISUEL (déjà passé par campVisuel) — jamais le camp absolu.
function spritePret(owner, type) {
  const img = sprites[owner + type];
  return img && img.complete && img.naturalWidth > 0 ? img : null;
}

// Centre pixel d'une case (Phase A.5 v2 Phase 4 : cellSize runtime).
export function cellCenter(r, c) {
  return { x: OX + c * __CELL_SIZE + __CELL_SIZE / 2, y: OY + r * __CELL_SIZE + __CELL_SIZE / 2 };
}

// Pixel écran -> case du plateau (ou null hors plateau).
// Phase A.5 v2 Phase 4 : BOARD_W/BOARD_H runtime (l15 est rectangulaire 765×408,
// pas un carré 560×560, donc x et y ont chacun leur borne indépendante).
export function pixelVersCase(x, y) {
  if (x < OX || x >= OX + __BOARD_W || y < OY || y >= OY + __BOARD_H) return null;
  return { r: Math.floor((y - OY) / __CELL_SIZE), c: Math.floor((x - OX) / __CELL_SIZE) };
}

// --- Transformation de VUE (« moi en bas », façon Clash Royale) ---
// En PvP en ligne, le joueur côté 1 (Corail) doit voir SES pièces en bas de
// l'écran : l'AFFICHAGE subit une rotation 180° (r→7-r, c→7-c). C'est une
// transformation de RENDU/ENTRÉE PURE — state.board, le moteur, le protocole
// réseau et le hash d'état restent en coordonnées ABSOLUES (le lockstep W2 en
// dépend). Involution : la même formule convertit absolu↔affiché.
// Seul endroit où vit la rotation ; tout dessin/entrée doit passer par ici.
function vueActive(state) {
  return !!(state && state.mode === 'pvw' && state.pvw && state.pvw.side === 1);
}
// (r,c) absolu -> (r,c) tel qu'affiché à l'écran (identité sauf pvw côté 1).
// Phase A.5 v2 Phase 4 : littéral 7 remplacé par state.board.length-1 / [0].length-1
// pour honorer la rotation 180° côté 1 sur tout plateau (8×8 ET futur 8×11 / 12×12).
export function vueCase(state, r, c) {
  if (!vueActive(state)) return { r, c };
  const rows = state && state.board ? state.board.length : 8;
  const cols = state && state.board ? state.board[0].length : 8;
  return { r: rows - 1 - r, c: cols - 1 - c };
}
// Camp AFFICHÉ d'un camp ABSOLU. Complément visuel de vueCase : en PvP en ligne
// côté 1, le joueur doit toujours se voir avec le skin/couleur du camp 0 (« en
// bleu, en bas », façon Clash Royale). On échange donc 0↔1 à l'AFFICHAGE des
// sprites et des couleurs de camp. Involution, identité hors pvw côté 1.
// N'affecte QUE le visuel (sprites, ACCENT, remplissage) — jamais l'état/réseau/hash.
export function campVisuel(state, camp) {
  return vueActive(state) ? 1 - camp : camp;
}
// Variantes « vue » des primitives de placement : prennent une case ABSOLUE et
// dessinent à sa position AFFICHÉE. Toutes les surcouches pilotées par l'état
// (pièces, surbrillances, coups légaux, cibles, flashes) passent par elles.
function tilePathVue(ctx, state, r, c) {
  const v = vueCase(state, r, c);
  tilePath(ctx, v.r, v.c);
}
function cellCenterVue(state, r, c) {
  const v = vueCase(state, r, c);
  return cellCenter(v.r, v.c);
}

function roundRect(ctx, x, y, w, h, r) {
  // Canvas accepte mal les rayons supérieurs aux dimensions du rectangle
  // (notamment les boutons pill du dashboard) : on borne toujours le rayon.
  r = Math.max(0, Math.min(r, w / 2, h / 2));
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

// Assombrit un hex #rrggbb d'un facteur (DA §11.4.a : ombre plate de bouton).
function darken(hex, f = 0.17) {
  if (typeof hex !== 'string' || !/^#[0-9a-f]{6}$/i.test(hex)) return hex;
  const n = parseInt(hex.slice(1), 16);
  const r = Math.round(((n >> 16) & 255) * (1 - f));
  const g = Math.round(((n >> 8) & 255) * (1 - f));
  const b = Math.round((n & 255) * (1 - f));
  return `rgb(${r},${g},${b})`;
}

// Ton d'ombre plate d'un bouton selon sa couleur (DA §11.4.a).
function ombreBouton(color) {
  if (color === UI_THEME.card) return UI_THEME.shadow;
  if (color === UI_THEME.amber) return UI_THEME.amberDark;
  if (color === UI_THEME.primary) return UI_THEME.primaryDark;
  if (color === UI_THEME.danger) return UI_THEME.dangerDark;
  return darken(color, 0.17);
}

// --- Motion UI Canvas (inspiré du starter, sans dépendance) ---
// Les rectangles de hit-test restent fixes. Seule la couche visuelle bouge :
// apparition, soulèvement au survol, enfoncement au clic et retour élastique doux.
const BUTTON_HOVER_MS = 180;
const BUTTON_PRESS_MS = 90;
const BUTTON_APPEAR_MS = 260;

function ensureButtonUI(state) {
  if (!state.ui) state.ui = { buttons: [] };
  if (!state.ui.buttons) state.ui.buttons = [];
  if (!state.ui.motion) state.ui.motion = new Map();
  if (!state.ui.pointer) state.ui.pointer = { x: -1, y: -1, inside: false };
  if (state.ui.pressedId == null) state.ui.pressedId = null;
  // Menu hamburger (31/07) : état persistant d'ouverture du panneau. Défaut sûr
  // pour les états recréés sans ce champ (menuState le pose explicitement).
  if (state.ui.hamburgerOpen == null) state.ui.hamburgerOpen = false;
  if (!['account', 'appearance', 'language', 'about'].includes(state.ui.drawerTab)) {
    state.ui.drawerTab = 'account';
  }
  if (!state.ui.preview) state.ui.preview = {};
  for (const taille of ['std', 'l15', 'bonus']) {
    if (!state.ui.preview[taille]) {
      state.ui.preview[taille] = {
        playing: false,
        finished: false,
        elapsed: 0,
        startedAt: null,
      };
    }
  }
  return state.ui;
}

function actionSignature(action) {
  try { return JSON.stringify(action) || String(action); } catch { return String(action); }
}

function buttonId(x, y, w, h, action, index = 0) {
  return `${actionSignature(action)}@${Math.round(x)},${Math.round(y)},${Math.round(w)},${Math.round(h)}#${index}`;
}

function insideButton(button, x, y) {
  if (button.shape === 'circle') {
    const cx = button.x + button.w / 2;
    const cy = button.y + button.h / 2;
    const radius = button.hitRadius ?? Math.min(button.w, button.h) / 2;
    return Math.hypot(x - cx, y - cy) <= radius;
  }
  return x >= button.x && x <= button.x + button.w
    && y >= button.y && y <= button.y + button.h;
}

function approche(valeur, cible, dt, duree) {
  const k = 1 - Math.exp(-dt / duree);
  return valeur + (cible - valeur) * k;
}

function enregistrerBouton(state, x, y, w, h, action, enabled, styled = false, radius = 10) {
  ensureButtonUI(state);
  const button = {
    x, y, w, h, action, enabled, radius,
    id: buttonId(x, y, w, h, action, state.ui.buttons.length),
    styled,
  };
  state.ui.buttons.push(button);
  return button;
}

function boutonDrawerAutorise(state, button, x, y) {
  const ui = state && state.ui;
  if (!ui || !ui.hamburgerOpen) return true;
  const kind = button && button.action && button.action.kind;
  if (kind === 'toggleHamburger') return true;
  if (!['login', 'logout', 'mfa', 'toggleTheme', 'setLanguage', 'selectDrawerTab'].includes(kind)) return false;
  const panel = ui.hamburgerPanel;
  return !!panel && x >= panel.x && x <= panel.x + panel.w
    && y >= panel.y && y <= panel.y + panel.h;
}

function motionBouton(state, button) {
  const ui = ensureButtonUI(state);
  const now = ui.frameNow || (typeof performance !== 'undefined' ? performance.now() : 0);
  let motion = ui.motion.get(button.id);
  if (!motion) {
    motion = { hover: 0, press: 0, appear: 0, lastNow: now };
    ui.motion.set(button.id, motion);
  }
  const dt = Math.min(64, Math.max(0, now - motion.lastNow));
  motion.lastNow = now;
  const hovered = button.enabled && ui.pointer.inside
    && boutonDrawerAutorise(state, button, ui.pointer.x, ui.pointer.y)
    && insideButton(button, ui.pointer.x, ui.pointer.y);
  const pressed = button.enabled && ui.pressedId === button.id;
  motion.hover = approche(motion.hover, hovered ? 1 : 0, dt, BUTTON_HOVER_MS);
  motion.press = approche(motion.press, pressed ? 1 : 0, dt, BUTTON_PRESS_MS);
  motion.appear = approche(motion.appear, 1, dt, BUTTON_APPEAR_MS);
  return motion;
}

// Même motion que `bouton()`, mais utilisable par le menu V2 qui dessine ses
// propres corps. Les coordonnées du bouton restent fixes pour le hit-test ;
// seul `visualY` est animé pendant le rendu.
function motionMenuBouton(state, x, y, w, h, action, enabled = true, radius = 10, shape = 'rect') {
  // Le menu dessine lui-même le corps et le contour après ce calcul : le marquer
  // comme stylé évite qu'une seconde surcouche générique ne double le liseré.
  const button = enregistrerBouton(state, x, y, w, h, action, enabled, true, radius);
  button.shape = shape;
  if (shape === 'circle') button.hitRadius = radius;
  const motion = motionBouton(state, button);
  // Position stable au repos : seuls le survol et l'appui déplacent le bouton.
  const visualY = y + (1 - motion.appear) * 3 - motion.hover * 5 + motion.press * 2;
  button.visualY = visualY;
  return { button, motion, visualY };
}

function eclaircir(hex, amount = 0.08) {
  if (typeof hex !== 'string' || !/^#[0-9a-f]{6}$/i.test(hex)) return hex;
  const n = parseInt(hex.slice(1), 16);
  const mix = (channel) => Math.round(channel + (255 - channel) * amount);
  const r = mix((n >> 16) & 255).toString(16).padStart(2, '0');
  const g = mix((n >> 8) & 255).toString(16).padStart(2, '0');
  const b = mix(n & 255).toString(16).padStart(2, '0');
  return `#${r}${g}${b}`;
}

// Carte / panneau avec ombre douce et liseré — motif chrome répété partout.
function carte(ctx, x, y, w, h, r, fill, { shadow = true, stroke = UI_THEME.border } = {}) {
  ctx.save();
  if (shadow) {
    ctx.shadowColor = UI_THEME.shadow;
    ctx.shadowBlur = 10;
    ctx.shadowOffsetY = 3;
  }
  ctx.fillStyle = fill;
  roundRect(ctx, x, y, w, h, r);
  ctx.fill();
  ctx.restore();
  if (stroke) {
    ctx.strokeStyle = stroke; ctx.lineWidth = 1;
    roundRect(ctx, x, y, w, h, r); ctx.stroke();
  }
}

function bouton(state, ctx, x, y, w, h, label, action, { enabled = true, sub = '', fontSize = 13, color = UI_THEME.card, textColor = UI_THEME.text, subColor = UI_THEME.subtext, outlineColor = UI_THEME.border, disabledColor = UI_THEME.disabled, disabledTextColor = UI_THEME.disabledText, disabledOutlineColor = UI_THEME.disabledBorder } = {}) {
  label = traduire(label, state && state.language);
  sub = traduire(sub, state && state.language);
  const button = enregistrerBouton(state, x, y, w, h, action, enabled, true);
  const motion = motionBouton(state, button);
  // La direction artistique reste identique sur ordinateur et téléphone.
  // Seules les dimensions des hitboxes sont adaptées au tactile par les appelants.
  const r = 10;
  const lift = motion.hover * 5;
  const press = motion.press * 2;
  const appear = (1 - motion.appear) * 3;
  // Position stable au repos : le bouton ne bouge qu'au survol ou à l'appui.
  const visualY = y + appear - lift + press;
  const visualColor = enabled ? eclaircir(color, motion.hover * 0.08) : disabledColor;
  ctx.save();
  // Ombre plate : elle se resserre quand le bouton est pressé et s'éloigne
  // légèrement au survol pour donner une profondeur lisible sans déplacer le layout.
  if (enabled) {
    ctx.fillStyle = ombreBouton(color);
    roundRect(ctx, x, visualY + 4 - motion.press * 3, w, h, r); ctx.fill();
  }
  ctx.globalAlpha = 0.92 + motion.appear * 0.08;
  ctx.fillStyle = visualColor;
  roundRect(ctx, x, visualY, w, h, r); ctx.fill();
  // Même contour et même présence visuelle que sur ordinateur.
  ctx.lineWidth = 2.5;
  ctx.strokeStyle = enabled ? outlineColor : disabledOutlineColor;
  roundRect(ctx, x, visualY, w, h, r); ctx.stroke();
  // Même police, taille et alignement que sur ordinateur.
  ctx.fillStyle = enabled ? textColor : disabledTextColor;
  ctx.font = `${fontSize}px ${F_DISPLAY}`;
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  const textX = x + w / 2;
  ctx.fillText(label.toUpperCase(), textX, visualY + h / 2 - (sub ? 7 : 0));
  if (sub) {
    // Sous-titre descriptif : même taille que sur ordinateur, Nunito Sans.
    ctx.font = `11px ${F_TEXTE}`; ctx.fillStyle = enabled ? subColor : UI_THEME.disabledText;
    ctx.textAlign = 'center';
    ctx.fillText(sub, textX, visualY + h / 2 + 9);
  }
  ctx.restore();
}

// Les contrôles spécialisés (chips, deck tabs, replay bar) dessinent leur propre
// corps. Cette surcouche leur apporte néanmoins le même langage de survol, de clic
// et d'apparition sans réécrire leurs géométries ni leurs hitboxes.
function dessineEffetsBoutons(ctx, state) {
  const ui = ensureButtonUI(state);
  for (const button of ui.buttons) {
    if (button.styled || !button.enabled) continue;
    const motion = motionBouton(state, button);
    const alpha = Math.max(motion.hover, motion.press, 1 - motion.appear);
    if (alpha < 0.01) continue;
    ctx.save();
    // Les contrôles spécialisés gardent leur propre remplissage et leur propre
    // texte : cette couche ne dessine qu'un liseré, donc aucun recouvrement.
    const visualY = button.visualY ?? button.y;
    if (motion.hover > 0.01) {
      ctx.globalAlpha = motion.hover * 0.8;
      ctx.lineWidth = 1.5; ctx.strokeStyle = UI_THEME.amber;
      roundRect(ctx, button.x, visualY, button.w, button.h, button.radius ?? 8); ctx.stroke();
    }
    if (motion.press > 0.01) {
      ctx.globalAlpha = motion.press * 0.7;
      ctx.lineWidth = 2; ctx.strokeStyle = C_ENCRE;
      roundRect(ctx, button.x, visualY, button.w, button.h, button.radius ?? 8); ctx.stroke();
    }
    // Petit liseré d'entrée : les contrôles custom apparaissent avec le même
    // rythme que les boutons principaux, sans masquer leur texte.
    if (motion.appear < 0.98) {
      ctx.globalAlpha = (1 - motion.appear) * 0.22;
      ctx.lineWidth = 2; ctx.strokeStyle = UI_THEME.amberLight;
      roundRect(ctx, button.x, visualY, button.w, button.h, button.radius ?? 8); ctx.stroke();
    }
    ctx.restore();
  }
}

function finaliserBoutons(ctx, state) {
  const ui = ensureButtonUI(state);
  // Les contrôles spécialisés s'enregistrent encore directement dans
  // state.ui.buttons : l'index de frame les rend uniques même si deux actions
  // partagent la même géométrie.
  const activeIds = new Set();
  ui.buttons.forEach((button, index) => {
    button.id = buttonId(button.x, button.y, button.w, button.h, button.action, index);
    activeIds.add(button.id);
  });
  for (const id of ui.motion.keys()) {
    if (!activeIds.has(id)) ui.motion.delete(id);
  }
  dessineEffetsBoutons(ctx, state);
}

function majUIFrame(state, now) {
  const ui = ensureButtonUI(state);
  ui.frameNow = now;
}



// Dessine une pièce à une position pixel donnée (centre).
// Si le sprite du camp est chargé, on l'affiche (la silhouette porte déjà la
// couleur de camp) ; sinon fallback jeton flat cercle+lettre (DA §7/§9).
// Les indicateurs d'état (anneaux, badges) restent lisibles par-dessus.
function dessinePiece(ctx, state, p, x, y, now, rayon = Math.round(__CELL_SIZE * (26 / 70))) {
  // Phase A.5 v2 Phase 5.A — rayon size-aware : std cellSize=70 → rayon=26 (préserve
  // l'aspect std), l15 cellSize=51 → rayon=19 (vs cellule 47 utile, donc la pièce
  // respire + ne déborde pas). Le default ci-dessus est évalué au call time, donc
  // reflète le __CELL_SIZE courant (pas une valeur figée au module-load).
  // Camp VISUEL : en pvw côté 1, mes pièces (camp absolu 1) s'affichent avec le
  // skin/couleur du camp 0, l'adversaire avec ceux du camp 1. Identité ailleurs.
  const vOwner = campVisuel(state, p.owner);
  const img = spritePret(vOwner, p.type);
  // Rayon d'ancrage des anneaux d'état : englobe le sprite (~30 std) ou le jeton.
  // Phase A.5 v2 Phase 5.A — size-aware via getSpriteHeight() (desktop std 60/2=30 ;
  // mobile 8×8 ~32/2, avec une marge visuelle plus confortable autour de la pièce).
  const rEtat = img ? getSpriteHeight(state) / 2 : rayon;

  // 1. Effet feu (pivot v3.2 — 2026-07-11) D'ABORD : derrière le sprite (le user a
  // demandé explicitement « DERRIÈRE la pièce »). Halo radius 34 px autour de (x, y),
  // vidéo tintée par catégorie cat1/cat2 (v3.2 procédure), ou ambre pulsé si Sacrifice
  // armé (cat A forcée par optionsFeuPour).
  // [v3 11/07 → v3.1 11/07 → v3.2 11/07] : feu procédural quilles (annulé) → feu
  // procédural cat (commit 9f48b832) → feu VIDÉO mp4 tinté (pivot user).
  const feuOpts = optionsFeuPour(p);
  if (feuOpts) {
    // Sur téléphone, la cellule est plus étroite : le halo vidéo reste contenu
    // autour de la pièce au lieu de déborder sur les cases voisines. Le desktop
    // conserve le rayon historique de 40 px.
    const feuRadius = state.ui && state.ui.mobileGameplay
      ? Math.max(14, Math.min(28, __CELL_SIZE * 0.52))
      : 40;
    dessineFeu(ctx, x, y, now, rEtat, feuOpts.col1, feuOpts.col2, feuOpts.pulsed, feuRadius);
  }

  // 2. Sprite de la pièce OU fallback jeton flat — DESSUS le feu (le feu est DERRIÈRE).
  if (img) {
    // Sprite : carré, ratio préservé, centré (léger décalage haut pour laisser
    // un peu d'air avec le halo du feu).
    // Phase A.5 v2 Phase 5.A — hauteur (et largeur) size-aware via getSpriteHeight().
    const ratio = img.naturalWidth / img.naturalHeight;
    const h = getSpriteHeight(state), w = h * ratio;
    ctx.drawImage(img, x - w / 2, y - h / 2 - 1, w, h);
  } else {
    // Fallback jeton flat : aplat pastel par camp, contour Encre commun.
    ctx.beginPath(); ctx.arc(x, y, rayon, 0, Math.PI * 2);
    ctx.fillStyle = REMPLI_PIECE[vOwner]; ctx.fill();
    ctx.lineWidth = 3; ctx.strokeStyle = C_ENCRE; ctx.stroke();
    // Socle d'accent de camp (signal primaire DA §7) — seulement en fallback.
    ctx.save();
    ctx.beginPath(); ctx.arc(x, y, rayon - 2, Math.PI * 0.18, Math.PI * 0.82);
    ctx.lineWidth = 4; ctx.strokeStyle = ACCENT[vOwner]; ctx.stroke();
    ctx.restore();
    // Lettre FR en Encre, commune aux deux camps.
    // Phase A.5 v2 Phase 5.A — font size-aware : std 24 px sur cellSize 70, l15 ≈ 17 px.
    // Ratio 24/70 = 0.343 préserve l'aspect std et shrink sur l15 sans déborde case.
    ctx.fillStyle = C_ENCRE;
    ctx.font = `${Math.round(__CELL_SIZE * (24 / 70))}px ${F_DISPLAY}`;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(LETTRE[p.type], x, y - 2);
  }

  // 3. Marqueur `p.shield = true` : la pièce absorbe la prochaine capture
  // (Forteresse / Bouclier / Monture / Couronne, GDD §6). Ring cyan-sauge 1 px
  // posé HORS silhouette (r + 2) — statique, différencié du feu vidéo (animé 60 fps).
  if (p.shield) {
    ctx.beginPath();
    ctx.arc(x, y, rEtat + 2, 0, Math.PI * 2);
    ctx.strokeStyle = '#4FA79C';
    ctx.lineWidth = 1;
    ctx.stroke();
  }

  // 4. Halo doré éphémère post-achat (GDD §5.3, 300 ms) — par-dessus tout, dernier cri.
  // Flash bref d'or pour signaler « tu viens d'acheter » ; ne reste pas longtemps.
  const gold = p._goldT && now - p._goldT < DUREE_GOLD;
  if (gold) {
    const k = 1 - (now - p._goldT) / DUREE_GOLD;
    ctx.beginPath(); ctx.arc(x, y, rEtat + 6 + k * 6, 0, Math.PI * 2);
    ctx.strokeStyle = `rgba(201,138,62,${0.9 * k})`; ctx.lineWidth = 4; ctx.stroke();
  }
}

// --- Effet feu sur la pièce (GDD §5.3.b, DA §11.7) ---

// Détermine les paramètres de feu pour une pièce donnée : couleur 1 (et 2 si
// 2 améliorations), état pulsed (Sacrifice armé → amplitude ×2 + alpha cycle 400 ms).
// Retourne null si aucun feu à dessiner (0 amélioration ET pas de Sacrifice armé).
function optionsFeuPour(p) {
  if (!p.upgrades.length && !p.sacrificeArmed) return null;
  // Sacrifice armé : le feu prend TOUJOURS la couleur Info Actif cat 'A' (GDD §5.3.b
  // / DA §11.7.f), pulsé, peu importe la catégorie des upgrades. Le feu ambre pulsé
  // EST LE signal « roi sous protection », donc on override cat1 du 1er upgrade
  // s'il y en a un (cf. code-reviewer 11/07 — un Sacrifice armé sur un pion à
  // Pas-de-côté cat D restait bleu, signal perdu).
  if (p.sacrificeArmed) {
    return { col1: COULEUR_CAT.A, col2: null, pulsed: true };
  }
  // Cas standard : 1 ou 2 améliorations, pas de Sacrifice armé.
  const cat1 = UPGRADES[p.upgrades[0]].cat;
  const cat2 = p.upgrades.length > 1 ? UPGRADES[p.upgrades[1]].cat : null;
  return {
    col1: COULEUR_CAT[cat1],
    col2: cat2 ? COULEUR_CAT[cat2] : null,
    pulsed: false,
  };
}

// --- Pipeline flamme v3.3 (2026-07-11) — luminance → alpha ---
// La v3.2 dessinait la vidéo en source-over puis teintait en 'screen' : le fond NOIR
// de la vidéo devenait un DISQUE plein de couleur cat (screen(noir, teinte) = teinte)
// — à l'écran, un aplat pastel sans flamme visible (retour utilisateur 11/07). La v3.3
// convertit la luminance de la frame en ALPHA : seule la silhouette de flamme est
// dessinée, teintée cat, le plateau reste visible autour. La grisaille est faite dans
// la boucle de pixels (plus de ctx.filter → le feature-detect FILTER_SUPPORTED tombe).
const FEU_S = 80;                    // côté de la texture flamme (= 2 × radius 40)
// Décalage vertical du halo flamme (12/07 user request) : négatif = remonté, pour que
// la racine de la flamme coïncide avec la pièce (base du sprite) au lieu du bas du
// cercle. Exposé sur window pour le tuning live en QA (window.__feuOffsetY).
let FEU_OFFSET_Y = -12;
if (typeof window !== 'undefined') {
  Object.defineProperty(window, '__feuOffsetY', {
    get: () => FEU_OFFSET_Y, set: (v) => { FEU_OFFSET_Y = v | 0; },
  });
}
let feuMaskCanvas = null;            // frame vidéo → gris, alpha = luminance × vignette
let feuMaskCtx = null;
let feuMaskTime = -1;                // frame de rendu du dernier masque (1 calcul/frame)
let feuFalloff = null;               // vignette radiale pré-calculée (bords fondus)
const feuTintCache = new Map();      // teinte cat → { canvas, ctx, time } réutilisés

function feuInitMask() {
  feuMaskCanvas = document.createElement('canvas');
  feuMaskCanvas.width = feuMaskCanvas.height = FEU_S;
  feuMaskCtx = feuMaskCanvas.getContext('2d', { willReadFrequently: true });
  // Vignette : pleine opacité jusqu'à 60 % du rayon, smoothstep vers 0 au bord —
  // remplace le clip circulaire net de la v3.2 (la flamme s'évanouit au lieu d'être
  // coupée) et garantit le respect de la gouttière entre tuiles (CELL=70).
  feuFalloff = new Float32Array(FEU_S * FEU_S);
  const c = FEU_S / 2, R = FEU_S / 2;
  for (let py = 0; py < FEU_S; py++) {
    for (let px = 0; px < FEU_S; px++) {
      const d = Math.hypot(px + 0.5 - c, py + 0.5 - c) / R;
      const t = Math.min(1, Math.max(0, (1 - d) / 0.4));
      feuFalloff[py * FEU_S + px] = t * t * (3 - 2 * t);
    }
  }
}

// Cadrage source dans la vidéo (fractions de videoWidth/videoHeight) : 265194.mp4 est
// un feu cartoon sur FOND VERT chroma-key avec DEUX langues de flammes côte à côte
// (bbox mesurées 11/07 : gauche x 660-852, droite x 1056-1272, y ~188-796 sur 1920×1080).
// On cadre la langue DROITE seule, crop plus étroit que haut (440×700) → la flamme
// remplit la texture carrée 80×80 (légèrement élargie, assumé : feu stylisé).
const FEU_SRC = { x: 944 / 1920, y: 140 / 1080, w: 440 / 1920, h: 700 / 1080 };

// Reconstruit le masque de flamme — UNE fois par frame de rendu, partagé entre toutes
// les pièces (16 pièces upgradées = 1 seul getImageData 80×80, ~6 400 px, négligeable).
function feuMajMask(now) {
  if (feuMaskTime === now) return;
  feuMaskTime = now;
  feuMaskCtx.clearRect(0, 0, FEU_S, FEU_S);
  const vw = videoFeu.videoWidth, vh = videoFeu.videoHeight;
  feuMaskCtx.drawImage(videoFeu, FEU_SRC.x * vw, FEU_SRC.y * vh, FEU_SRC.w * vw, FEU_SRC.h * vh,
                       0, 0, FEU_S, FEU_S);
  const img = feuMaskCtx.getImageData(0, 0, FEU_S, FEU_S);
  const d = img.data;
  for (let i = 0, p = 0; i < d.length; i += 4, p++) {
    // CLÉ CHROMA : alpha = max(r, b) — le canal VERT n'apporte JAMAIS d'alpha, donc le
    // fond vert (0,255,0) est transparent, alors que le feu (jaune r=255 / rouge / blanc)
    // reste opaque. (max(r,g,b) transformait le fond vert en disque plein — bug 11/07.)
    const l = Math.max(d[i], d[i + 2]);
    d[i] = d[i + 1] = d[i + 2] = l;               // grisaille (base du tint par cat)
    d[i + 3] = l * feuFalloff[p];                 // fond vert → transparent
  }
  feuMaskCtx.putImageData(img, 0, 0);
}

// Canvas de flamme teintée pour une couleur cat — mémoïsé par frame (les pièces qui
// partagent une cat réutilisent le même canvas ; les canvas persistent entre frames,
// seul leur CONTENU est redessiné → zéro allocation par frame en régime permanent).
function feuTinte(tint) {
  let e = feuTintCache.get(tint);
  if (!e) {
    const c = document.createElement('canvas');
    c.width = c.height = FEU_S;
    e = { canvas: c, ctx: c.getContext('2d'), time: -1 };
    feuTintCache.set(tint, e);
  }
  if (e.time !== feuMaskTime) {
    e.time = feuMaskTime;
    const t = e.ctx;
    t.globalCompositeOperation = 'source-over';
    t.clearRect(0, 0, FEU_S, FEU_S);
    t.drawImage(feuMaskCanvas, 0, 0);
    t.globalCompositeOperation = 'source-in';  // silhouette alpha × teinte cat plate
    t.fillStyle = tint;
    t.fillRect(0, 0, FEU_S, FEU_S);
    t.globalCompositeOperation = 'screen';     // cœur « chaud » : la grisaille re-blanchit le centre
    t.globalAlpha = 0.4;                       // dosé : à 1.0 le blanc noie la teinte cat (QA visuelle 11/07)
    t.drawImage(feuMaskCanvas, 0, 0);
    t.globalAlpha = 1;
    t.globalCompositeOperation = 'source-over';
  }
  return e.canvas;
}

// Dessine le feu DERRIÈRE la pièce — `game/assets/pieces/265194.mp4` (mp4 1920×1080,
// ~10 s, ~60 fps) convertie en silhouette de flamme teintée cat (pipeline v3.3
// ci-dessus). Fallback placeholder procédural (halo radial cat à 0.5 alpha) tant que
// la vidéo n'est pas bufferisée (`videoFeu.readyState < 3`) — aucune frame vide.
function dessineFeu(ctx, x, y, now, r, col1, col2, pulsed, radiusOverride = 40) {
  if (!col1) return;
  // Rayon du halo vidéo — bump de 34 → 40 px (11/07 round 2 user request) : le
  // mouvement des flammes est plus visible à distance quand le halo déborde davantage
  // autour de la silhouette (tuile CELL=70 ; la vignette du masque fond les bords).
  const radius = radiusOverride;
  // Ancrage vertical (12/07 user request) : la RACINE de la flamme doit partir de la
  // pièce elle-même (base du sprite, ~y+30), pas du bas du halo circulaire (~y+40).
  // On remonte donc toute la boîte vidéo — la flamme lèche la pièce et monte derrière.
  y += FEU_OFFSET_Y;
  // Pulse « Sacrifice armé » : modulation d'alpha globale (0.7→1 sur ~400 ms) qui se
  // compose avec l'animation 60 fps de la vidéo sans noyer le mouvement. Le fond de la
  // flamme étant transparent en v3.3, moduler TOUTE la flamme ne fait plus clignoter
  // d'aplat de teinte (l'ancien garde-fou « alpha sur la passe 1 seulement » tombe).
  const alpha = pulsed ? 0.7 + 0.3 * Math.sin(now / 400 + 1.0) : 1;

  // Vidéo pas encore chargée / seeking → placeholder minimal (halo dégradé cat).
  // Évite une frame vide côté joueur au boot / lors des rechargements cache.
  if (!videoFeu || !videoFeu.readyState || videoFeu.readyState < 3 || videoFeu.videoWidth === 0 || (videoFeu.seeking && videoFeu.readyState < 4)) {
    ctx.save();
    ctx.globalAlpha = 0.5 * alpha;
    const grad = ctx.createRadialGradient(x, y, 0, x, y, radius);
    grad.addColorStop(0, col1);
    grad.addColorStop(1, col1 + '00'); // bord transparent (alpha 0)
    ctx.fillStyle = grad;
    ctx.beginPath(); ctx.arc(x, y, radius, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
    return;
  }

  if (!feuMaskCanvas) feuInitMask();
  feuMajMask(now);

  if (!col2) {
    // 1 couleur : flamme uniforme cat derrière la pièce.
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.drawImage(feuTinte(col1), x - radius, y - radius, 2 * radius, 2 * radius);
    ctx.restore();
    return;
  }

  // Bicolore : 2 clips rectangulaires, un par moitié (gauche = cat1, droite = cat2).
  // Plus de lèvre Encre centrale : sur fond transparent elle flotterait sur le plateau
  // là où la flamme est absente — la frontière des deux teintes suffit (DA §11.7.d v3.3).
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.beginPath();
  ctx.rect(x - radius, y - radius, radius, 2 * radius);
  ctx.clip();
  ctx.drawImage(feuTinte(col1), x - radius, y - radius, 2 * radius, 2 * radius);
  ctx.restore();

  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.beginPath();
  ctx.rect(x, y - radius, radius, 2 * radius);
  ctx.clip();
  ctx.drawImage(feuTinte(col2), x - radius, y - radius, 2 * radius, 2 * radius);
  ctx.restore();
}

// Dessine une flèche directionnelle de (x1,y1) à (x2,y2) avec une tête triangulaire.
// Utilisée pour indiquer la direction de poussée de la Cavalerie (Phase 2).
function dessineFleche(ctx, x1, y1, x2, y2, color, scale = 1) {
  const dx = x2 - x1, dy = y2 - y1;
  const angle = Math.atan2(dy, dx);
  const headLen = 10 * scale; // longueur de la pointe de la flèche
  // Tige
  ctx.strokeStyle = color;
  ctx.lineWidth = 3 * scale;
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.lineTo(x2, y2);
  ctx.stroke();
  // Pointe triangulaire
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(x2, y2);
  ctx.lineTo(x2 - headLen * Math.cos(angle - 0.4), y2 - headLen * Math.sin(angle - 0.4));
  ctx.lineTo(x2 - headLen * Math.cos(angle + 0.4), y2 - headLen * Math.sin(angle + 0.4));
  ctx.closePath();
  ctx.fill();
}

function trouveRoi(board, owner) {
  if (!board || !board.length || !board[0]) return null;
  for (let r = 0; r < board.length; r++) {
    for (let c = 0; c < board[r].length; c++) {
      const piece = board[r][c];
      if (piece && piece.type === 'K' && piece.owner === owner) return piece;
    }
  }
  return null;
}

// Alerte visuelle d’échec : informative uniquement, puisque ROYCHEC conserve
// la capture du roi comme condition de victoire. Le rendu passe par vueCase()
// pour rester correct en PvP côté 1 et sur les plateaux 8×8 / 8×15.
function dessineAlertesEchec(ctx, state, now) {
  if (!state || !state.board || state.phase === 'gameover') return;
  const pulse = 0.5 + 0.5 * Math.sin(now / 220);
  for (let owner = 0; owner < 2; owner++) {
    if (!roiEnEchec(state.board, owner)) continue;
    const roi = trouveRoi(state.board, owner);
    if (!roi) continue;
    const view = vueCase(state, roi.r, roi.c);
    const centre = cellCenter(view.r, view.c);

    ctx.save();
    ctx.globalAlpha = 0.16 + pulse * 0.10;
    ctx.fillStyle = UI_THEME.danger;
    tilePath(ctx, view.r, view.c); ctx.fill();
    ctx.globalAlpha = 0.78 + pulse * 0.22;
    ctx.lineWidth = 4 + pulse * 2;
    ctx.strokeStyle = UI_THEME.danger;
    ctx.beginPath();
    ctx.arc(centre.x, centre.y, Math.max(10, __CELL_SIZE / 2 - 7), 0, Math.PI * 2);
    ctx.stroke();

    // Petit marqueur « ! » déporté dans l’angle : visible sans masquer la pièce.
    const markerR = Math.max(8, Math.min(12, __CELL_SIZE * 0.17));
    const markerX = centre.x + __CELL_SIZE * 0.29;
    const markerY = centre.y - __CELL_SIZE * 0.29;
    ctx.globalAlpha = 0.96;
    ctx.fillStyle = UI_THEME.danger;
    ctx.beginPath(); ctx.arc(markerX, markerY, markerR, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = UI_THEME.text;
    ctx.font = `bold ${Math.max(12, Math.round(markerR * 1.5))}px ${F_DISPLAY}`;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText('!', markerX, markerY + 1);
    ctx.restore();
  }
}

function dessineEchiquier(ctx, state, now) {
  // Cadre / socle du plateau (anneau Ivoire Bois) puis fond Brume : les gouttières
  // entre les tuiles laissent apparaître ce fond Brume (DA §4).
  // Phase A.5 v2 Phase 4 : BOARD_W/H dynamic (l15 = 765×408 rectangulaire, pas carré).
  carte(ctx, OX - 8, OY - 8, __BOARD_W + 16, __BOARD_H + 16, 14, C_IVOIRE_BOIS, { shadow: true, stroke: null });
  ctx.fillStyle = C_BRUME; ctx.fillRect(OX, OY, __BOARD_W, __BOARD_H);

  // Cases = tuiles à coins arrondis, contour Encre ~3 px, damier Ivoire / Prune.
  for (let r = 0; r < __ROWS; r++) {
    for (let c = 0; c < __COLS; c++) {
      tilePath(ctx, r, c);
      ctx.fillStyle = (r + c) % 2 === 0 ? C_CLAIR : C_FONCE;
      ctx.fill();
      ctx.lineWidth = 3; ctx.strokeStyle = C_ENCRE; ctx.stroke();
    }
  }
  // Repères a-p / 1-N (dans les marges, sur fond clair) : Encre, Nunito Sans.
  // Phase A.5 v2 Phase 4 : __COLS/__ROWS dynamic (16 lettres pour aller jusqu'à l16 futur).
  // En vue retournée (pvw côté 1) les colonnes/rangées affichées correspondent aux
  // cases absolues miroir : le repère suit la case réellement dessinée à cet endroit.
  const LETTERS = 'abcdefghijklmnop'; // 16 — couvre l15 et au-delà
  ctx.fillStyle = C_ENCRE_DOUX; ctx.font = `700 11px ${F_TEXTE}`;
  ctx.textBaseline = 'alphabetic';
  const flip = vueActive(state);
  for (let c = 0; c < __COLS; c++) {
    const absC = flip ? __COLS - 1 - c : c;
    ctx.textAlign = 'left';
    ctx.fillText(LETTERS[absC], OX + c * __CELL_SIZE + 4, OY + __BOARD_H + 16);
  }
  for (let r = 0; r < __ROWS; r++) {
    const absR = flip ? __ROWS - 1 - r : r;
    ctx.textAlign = 'right';
    ctx.fillText(String(__ROWS - absR), OX - 6, OY + r * __CELL_SIZE + 16);
  }

  // Flashes de case (capture terracotta / bris de blindage sauge / récompense or) — forme tuile.
  for (const f of state.flashes) {
    const k = 1 - (now - f.t0) / DUREE_FLASH;
    if (k <= 0) continue;
    tilePathVue(ctx, state, f.r, f.c);
    ctx.fillStyle = f.color === 'red'
      ? `rgba(181,87,63,${0.55 * k})`
      : f.color === 'gold'
        ? `rgba(227,192,127,${0.68 * k})`
        : `rgba(79,167,156,${0.55 * k})`;
    ctx.fill();
  }

  // Cases bonus de la Chasse : une case par camp, réservée à ses pièces.
  // Le halo et le petit symbole restent sous les pièces et les coups légaux pour
  // conserver la lisibilité du moteur. La couleur reprend celle du camp visuel
  // associé à la pièce concernée, y compris en PvP en ligne.
  if ((state.bonusMode || state.mode === 'hunt' || state.mode === 'replay') && state.huntBonuses) {
    const nowPulse = 0.5 + 0.5 * Math.sin(now / 360);
    state.huntBonuses.forEach((bonus, owner) => {
      if (!bonus) return;
      const vOwner = campVisuel(state, owner);
      const { x, y } = cellCenterVue(state, bonus.r, bonus.c);
      tilePathVue(ctx, state, bonus.r, bonus.c);
      ctx.save();
      // Même palette que les pièces : campVisuel respecte aussi la rotation du
      // PvP en ligne, où le joueur local est toujours affiché en bas.
      ctx.globalAlpha = 0.18 + nowPulse * 0.12;
      ctx.fillStyle = REMPLI_PIECE[vOwner];
      ctx.fill();
      ctx.globalAlpha = 0.78 + nowPulse * 0.18;
      ctx.beginPath(); ctx.arc(x, y, Math.max(10, __CELL_SIZE * 0.22 + nowPulse * 3), 0, Math.PI * 2);
      ctx.lineWidth = 3; ctx.strokeStyle = ACCENT[vOwner]; ctx.stroke();
      ctx.fillStyle = ACCENT[vOwner];
      ctx.font = `700 ${Math.max(12, Math.round(__CELL_SIZE * 0.24))}px ${F_DISPLAY}`;
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('✦', x, y + 1);
      ctx.restore();
    });
  }

  // Cases gelées par Épine : l'emplacement reste lié aux coordonnées enregistrées
  // sur le pion source, même si celui-ci a ensuite bougé.
  for (const row of state.board) {
    for (const p of row) {
      if (!p || !p.epineZone || p.epineZone.turns <= 0) continue;
      tilePathVue(ctx, state, p.epineZone.r, p.epineZone.c);
      ctx.save();
      ctx.fillStyle = 'rgba(91, 192, 235, 0.18)';
      ctx.fill();
      ctx.lineWidth = 3;
      ctx.strokeStyle = 'rgba(91, 192, 235, 0.86)';
      ctx.stroke();
      const ep = cellCenterVue(state, p.epineZone.r, p.epineZone.c);
      ctx.beginPath(); ctx.arc(ep.x, ep.y, Math.max(8, __CELL_SIZE * 0.16), 0, Math.PI * 2);
      ctx.strokeStyle = 'rgba(91, 192, 235, 0.95)'; ctx.lineWidth = 2; ctx.stroke();
      ctx.restore();
    }
  }

  // Case sélectionnée — forme tuile.
  if (state.selected) {
    const s = state.selected;
    tilePathVue(ctx, state, s.r, s.c);
    ctx.fillStyle = C_SEL; ctx.fill();
  }

  // Alerte d’échec après la sélection : l’anneau reste visible même si le roi
  // est aussi la pièce sélectionnée.
  dessineAlertesEchec(ctx, state, now);

  // NB : l'aura de contrôle du fou (interdiction des cases adjacentes pour les
  // pièces faibles) est portée par Hypnose (rules.js zonesInterdites) ; Parade,
  // elle, est une défense passive sans effet de zone, donc aucun rendu ici.

  // Coups potentiels. En mode Apprendre, tous les coups du moteur sont affichés
  // avec exactement les mêmes marqueurs et couleurs que sur un plateau normal.
  // Le verrouillage reste uniquement logique : un clic sur une mauvaise cible est
  // refusé par main.js et affiche le feedback ACTION GUIDÉE.
  const mobileGameplay = !!(state.ui && state.ui.mobileGameplay);
  // Marqueurs proportionnels à la case : les minima mobiles évitent qu'un point
  // reste visuellement énorme sur un petit téléphone, tout en gardant les hitboxes
  // de la case inchangées pour le tactile.
  const moveDotRadius = mobileGameplay ? Math.max(3.5, __CELL_SIZE * 0.10) : 10;
  const teleRadius = mobileGameplay ? Math.max(5, __CELL_SIZE * 0.13) : 13;
  const specialRadius = mobileGameplay ? Math.max(4, __CELL_SIZE * 0.10) : Math.max(10, __CELL_SIZE * 0.18);
  const markerLineWidth = mobileGameplay ? 2 : 3;
  for (const mv of state.legalMoves) {
    const { x, y } = cellCenterVue(state, mv.r, mv.c);
    if (mv.capture) {
      ctx.beginPath(); ctx.arc(x, y, __CELL_SIZE / 2 - (mobileGameplay ? 8 : 4), 0, Math.PI * 2);
      ctx.lineWidth = mobileGameplay ? 2 : 5; ctx.strokeStyle = C_CAP; ctx.stroke();
    } else if (mv.tele) {
      ctx.save();
      ctx.beginPath(); ctx.arc(x, y, teleRadius, 0, Math.PI * 2);
      ctx.setLineDash([4, 3]); ctx.lineWidth = markerLineWidth; ctx.strokeStyle = C_AMBRE; ctx.stroke();
      ctx.restore();
    } else if (mv.pasDiag || mv.grandSaut || mv.hauteFuite) {
      ctx.save();
      ctx.beginPath(); ctx.arc(x, y, specialRadius, 0, Math.PI * 2);
      ctx.setLineDash([5, 3]); ctx.lineWidth = markerLineWidth; ctx.strokeStyle = C_AMBRE; ctx.stroke();
      ctx.restore();
    } else {
      ctx.beginPath(); ctx.arc(x, y, moveDotRadius, 0, Math.PI * 2);
      ctx.fillStyle = C_MOVE; ctx.fill();
    }
  }

  // Cibles en ciblage : Ruée / Rayon / Cavalerie (anneau ambre), Décret (anneau sauge
  // sur allié), Échange (anneau vert clair sur pions alliés), Cavalerie push
  // (anneau cyan vif sur les destinations choisies).
  if (state.phase === 'ruee-target' || state.phase === 'rayon-target'
   || state.phase === 'decret-target' || state.phase === 'cavalerie-target'
   || state.phase === 'echange-target' || state.phase === 'vet-target'
   || state.phase === 'cavalerie-push') {
    const couleur = state.phase === 'decret-target' ? '#7FB069'
      : state.phase === 'echange-target' ? '#7FB069'
      : state.phase === 'cavalerie-push' ? '#5BC0EB' // cyan vif pour les destinations
      : C_RUEE;
    const targetRadius = mobileGameplay ? __CELL_SIZE / 2 - 8 : __CELL_SIZE / 2 - 3;
    const targetLineWidth = mobileGameplay ? 2 : 4;
    for (const t of state.ruTargets) {
      const { x, y } = cellCenterVue(state, t.r, t.c);
      ctx.beginPath(); ctx.arc(x, y, targetRadius, 0, Math.PI * 2);
      ctx.lineWidth = targetLineWidth; ctx.strokeStyle = couleur; ctx.stroke();
    }
  }

  // Flèches directionnelles pour la Cavalerie (Phase 2) : de l'ennemi
  // vers les deux cases de destination. Cyan vif semi-transparent.
  if (state.phase === 'cavalerie-push' && state._cavEnemyCell) {
    const from = cellCenterVue(state, state._cavEnemyCell.r, state._cavEnemyCell.c);
    ctx.globalAlpha = 0.55;
    for (const t of state.ruTargets) {
      const to = cellCenterVue(state, t.r, t.c);
      dessineFleche(ctx, from.x, from.y, to.x, to.y, '#5BC0EB', mobileGameplay ? 0.72 : 1);
    }
    ctx.globalAlpha = 1;
  }
}

function pion_become_reine(ctx,state,now) {
  
}

function dessinePieces(ctx, state, now) {
  const anim = state.anim;
  // Phase A.5 v2 Phase 4 : bounds loop dynamic __ROWS × __COLS (l15+ futur-proof).
  for (let r = 0; r < __ROWS; r++) {
    for (let c = 0; c < __COLS; c++) {
      const p = state.board[r][c];
      if (!p) continue;
      if (anim && anim.piece === p) continue; // dessinée en animation ci-dessous
      const { x, y } = cellCenterVue(state, r, c);
      dessinePiece(ctx, state, p, x, y, now);
    }
  }
  // Pièce en cours d'animation (glissement ~150 ms, GDD §7).
  if (anim) {
    const k = Math.min(1, (now - anim.t0) / DUREE_ANIM);
    const e = k * k * (3 - 2 * k); // easing lisse
    const x = anim.from.x + (anim.to.x - anim.from.x) * e;
    const y = anim.from.y + (anim.to.y - anim.from.y) * e;
    dessinePiece(ctx, state, anim.piece, x, y, now);
  }
}

function dessinePopups(ctx, state, now) {
  for (const pop of state.popups) {
    const age = now - pop.t0;
    const k = age / DUREE_POPUP;
    if (k >= 1) continue;
    // Taille selon le montant (DA §11.3.b) : 26 px pour un gain de capture (>2),
    // 20 px pour un revenu de coup simple (+2). Montant lu depuis le texte « +N ».
    const gain = Math.abs(parseInt(pop.text.replace(/[^0-9-]/g, ''), 10)) || 0;
    const taille = gain > 2 ? 26 : 20;
    // Overshoot d'échelle 1.3×→1.0× sur les premiers 15 % de la durée (~90 ms).
    const sk = Math.min(1, age / (0.15 * DUREE_POPUP));
    const scale = 1.3 - 0.3 * sk;
    const ax = pop.x, ay = pop.y - k * 34;
    ctx.save();
    ctx.globalAlpha = 1 - k;
    ctx.translate(ax, ay);
    ctx.scale(scale, scale);
    ctx.font = `${taille}px ${F_DISPLAY}`;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    // Contour Encre 2 px dessiné avant le remplissage : lisible sur tout fond (DA §11.3.b).
    ctx.lineWidth = 2; ctx.lineJoin = 'round'; ctx.strokeStyle = C_ENCRE;     ctx.strokeText(traduire(pop.text, state.language), 0, 0);
    ctx.fillStyle = pop.color;     ctx.fillText(traduire(pop.text, state.language), 0, 0);
    ctx.restore();
  }
}

// Horloge depuis un nombre de secondes (arrondi haut, jamais négatif).
// Les deux cadences proposées restent affichées au format mm:ss.
function fmtClock(s) {
  s = Math.max(0, Math.ceil(s));
  const m = Math.floor(s / 60);
  const ss = s % 60;
  return `${m}:${ss < 10 ? '0' : ''}${ss}`;
}

// Deux pastilles d'horloge PvP (§9.3) : adversaire en haut, moi en bas. La pastille du joueur
// actif pulse doucement ; sous 30 s elle passe en terracotta. Renvoie le y suivant.
function dessineHorlogesPvw(ctx, state, x, w, y, now) {
  const p = state.pvw;
  const disp = p.clockDisplay || p.clocks;
  const mySide = p.side, opp = 1 - mySide;
  const rows = [
    { side: opp, label: (p.oppPseudo || 'Adversaire') },
    { side: mySide, label: 'Toi' },
  ];
  for (const row of rows) {
    const t = disp[row.side];
    const actif = row.side === state.turn && !p.ended;
    const bas = t <= 30;
    const h = 30;
    // Pulsation douce de la pastille active (cohérent avec l'anneau de ciblage).
    const pulse = actif ? 0.5 + 0.5 * Math.sin(now / 400) : 0;
    carte(ctx, x, y, w, h, 8, actif ? UI_THEME.panelAlt : UI_THEME.card, { shadow: actif });
    if (actif) {
      ctx.save();
      ctx.globalAlpha = 0.35 + 0.35 * pulse;
      ctx.lineWidth = 2.5; ctx.strokeStyle = bas ? C_TERRACOTTA : C_AMBRE;
      roundRect(ctx, x, y, w, h, 8); ctx.stroke();
      ctx.restore();
    }
    // Pastille d'accent du camp (couleur VISUELLE : « Toi » suit mon skin en pvw côté 1).
    ctx.fillStyle = ACCENT[campVisuel(state, row.side)];
    ctx.beginPath(); ctx.arc(x + 16, y + h / 2, 6, 0, Math.PI * 2); ctx.fill();
    // Nom / pseudo (tronqué).
    ctx.fillStyle = UI_THEME.text; ctx.font = `11px ${F_DISPLAY}`;
    ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
    let nom = row.label.toUpperCase();
    if (nom.length > 14) nom = nom.slice(0, 13) + '…';
    ctx.fillText(nom, x + 28, y + h / 2);
    // Horloge mm:ss à droite.
    ctx.fillStyle = bas ? UI_THEME.danger : UI_THEME.text;
    ctx.font = `15px ${F_DISPLAY}`;
    ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
    ctx.fillText('⏱ ' + fmtClock(t), x + w - 10, y + h / 2);
    y += h + 6;
  }
  return y + 6;
}

// --- Résumé compact de la variante active ---
// Une seule ligne de contexte pendant la partie : les règles restent visibles sans
// recréer l'accordéon du menu ni prendre la place des actions de pièce.
function dessineResumeVariante(ctx, state, x, y, w) {
  const variant = state.variant || {};
  const taille = TAILLES[state.taille] || TAILLES.std;
  // Résumé compact : le plafond d'écus est fixe et documenté dans À propos,
  // tandis que ce panneau ne montre que les réglages réellement variables.
  const revenu = variant.revenueBase > 0 ? REVENU_PAR_COUP : 0;
  const combat = `+${revenu} · ×${variant.captureMul || 1}`;
  const items = [
      ['ECUS', combat],
      ['PLATEAU', traduire(taille.label.replace(/\\s/g, ''), state.language)],

  ];
  const gap = 5;
  const cellW = Math.max(1, (w - gap * (items.length - 1)) / items.length);
  const h = 42;

  ctx.save();
  ctx.fillStyle = UI_THEME.muted;
  ctx.font = `9px ${F_DISPLAY}`;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
  ctx.fillText(traduire('RÈGLES DE LA PARTIE', state.language), x, y - 7);
  items.forEach(([label, value], i) => {
    const ix = x + i * (cellW + gap);
    carte(ctx, ix, y, cellW, h, 7, UI_THEME.panel, { shadow: false, stroke: UI_THEME.border });
    ctx.fillStyle = UI_THEME.muted;
    ctx.font = `8px ${F_TEXTE}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';     ctx.fillText(traduire(label, state.language), ix + cellW / 2, y + 8);

    ctx.fillStyle = UI_THEME.text;
    ctx.font = `11px ${F_DISPLAY}`;
    ctx.textBaseline = 'bottom';
    ctx.fillText(value, ix + cellW / 2, y + h - 7);
  });
  ctx.restore();
  return y + h;
}

// --- Panneau latéral (HUD + infos pièce + achats) ---
// Phase A.5 v2 Phase 4 : PANEL_X runtime (__PANEL_X_RUNTIME) recalculé top of render()
// en fonction de __BOARD_W. Std 8x8 → 610 (identique à PANEL_X historique) ; l15 → 815.
function dessinePanneau(ctx, state, now) {
  const x = __PANEL_X_RUNTIME;
  const w = CANVAS_W - __PANEL_X_RUNTIME - 16;

  if (state.mode === 'learn') {
    if (state.learnKind === 'puzzle') dessinePuzzlePanel(ctx, state, now);
    else dessineLearnPanel(ctx, state, now);
    return;
  }

  // Mode tutoriel : instructions à la place du panneau normal, sauf si le
  // panneau d'achat est ouvert ou si l'étape demande le panneau normal
  // (ex. pièce à pouvoir sélectionnée : le joueur doit voir le vrai bouton).
  if (state.mode === 'tutorial' && state.tutorialStep != null && !state.panelPiece
      && !tutorielPanneauNormal(state)) {
    dessineTutorielHUD(ctx, state, x, w, now);
    return;
  }

  // Titre — wordmark Archivo Black en capitales (DA §3). Sur téléphone, le
  // wordmark est retiré pour gagner de la place (même règle que le panneau mobile).
  if (!(state.ui && state.ui.mobileGameplay)) {
    dessineWordmark(ctx, x, OY + 8, 22, 'left');
  }

  // HUD écus des deux joueurs (joueur actif encadré, liseré latéral coloré).
  let y = OY + 34;
  // PvP en ligne (§9.3) : deux horloges mm:ss (adversaire en haut, moi en bas) avant l'HUD.
  if (state.mode === 'pvw' && state.pvw) y = dessineHorlogesPvw(ctx, state, x, w, y, now);
  for (let j = 0; j < 2; j++) {
    const actif = j === state.turn && state.phase !== 'gameover';
    // Couleur VISUELLE du camp (échange 0↔1 en pvw côté 1 : ma ligne « Toi » = skin bleu).
    const vj = campVisuel(state, j);
    carte(ctx, x, y, w, 42, 8, actif ? UI_THEME.panelAlt : UI_THEME.card, { shadow: actif });
    if (actif) {
      ctx.fillStyle = ACCENT[vj];
      roundRect(ctx, x, y, 4, 42, 2); ctx.fill();
    }
    // Point d'accent de camp (inchangé, DA §11.3.a) + nom du joueur.
    ctx.fillStyle = ACCENT[vj]; ctx.beginPath(); ctx.arc(x + 20, y + 21, 9, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = UI_THEME.text; ctx.font = `12px ${F_DISPLAY}`;
    ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
    // En PvP en ligne, on nomme les camps « Toi » / pseudo adverse plutôt que Joueur 1/2.
    let nomJ = NOM_JOUEUR[j];
    if (state.mode === 'pvw' && state.pvw) nomJ = j === state.pvw.side ? 'Toi' : (state.pvw.oppPseudo || 'Adversaire');
    const nomJTraduit = traduire(nomJ, state.language);
    const statutJoueur = actif ? `  ·  ${traduire('à jouer', state.language)}` : '';
    ctx.fillText((nomJTraduit + statutJoueur).toUpperCase(), x + 36, y + 21);

    // Écusson doré du solde (DA §11.3.a) : pilule 60×24, Doré si actif sinon désaturé.
    const eW = 60, eH = 24, eX = x + w - 66, eY = y + 9;
    ctx.fillStyle = ACCENT[vj];
    roundRect(ctx, eX, eY, eW, eH, eH / 2); ctx.fill();
    ctx.lineWidth = 2; ctx.strokeStyle = UI_THEME.border;
    roundRect(ctx, eX, eY, eW, eH, eH / 2); ctx.stroke();
    // Icône pièce de monnaie minimale (disque Ivoire + anneau Encre).
    ctx.beginPath(); ctx.arc(eX + 13, eY + eH / 2, 7, 0, Math.PI * 2);
    ctx.fillStyle = UI_THEME.card; ctx.fill();
    ctx.lineWidth = 1.5; ctx.strokeStyle = UI_THEME.border; ctx.stroke();
    // Solde en chiffres, aligné à droite (8 px de marge).
    ctx.fillStyle = UI_THEME.text; ctx.font = `13px ${F_DISPLAY}`;
    ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
    ctx.fillText(String(state.ecus[j]), eX + eW - 8, eY + eH / 2 + 1);
    y += 50;
  }

  y += 8;

  // Contexte de variante volontairement discret : il reste présent pendant toute
  // la partie, mais ne concurrence ni le tour actif ni les actions de la pièce.
  y = dessineResumeVariante(ctx, state, x, y + 14, w) + 14;

  // Enchaînement en attente (Double coup / Second galop).
  if (state.chain) {
    const msg = traduire(state.chain.type === 'double-coup'
      ? 'Double coup : rejouez la Dame'
      : 'Second galop : rejouez le Cavalier (sans capture)', state.language);
    ctx.fillStyle = UI_THEME.amberDark; ctx.font = `600 14px ${F_TEXTE}`;
    ctx.textAlign = 'left'; ctx.textBaseline = 'top';
    ctx.fillText(msg, x, y);
    y += 22;
    bouton(state, ctx, x, y, w, 30, 'Terminer le tour', { kind: 'endChain' });
    y += 40;
  }

  // Pièce sélectionnée : infos + actions.
  const sel = state.selected;
  if (sel && sel.owner === state.turn && state.phase !== 'gameover') {
    carte(ctx, x, y, w, 26, 7, UI_THEME.card);
    ctx.fillStyle = UI_THEME.text; ctx.font = `600 14px ${F_TEXTE}`;
    ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
    const valeur = valeurAffichee(sel);
    ctx.fillText(`${nomType(sel.type, state.language)} — ${traduire('valeur', state.language)} ${valeur}`, x + 10, y + 13);
    y += 34;

    // S.H.T. : les améliorations d'une pièce sont silencées si le roi adverse
    // (ou cette pièce elle-même) est sous le debuff S.H.T.
    const powersBlocked = sel.debuffs && sel.debuffs.sht > 0;

    // Pouvoir actif : Épine (pion) — gèle les coordonnées de la case actuelle.
    if (sel.type === 'P' && sel.upgrades.includes('epine')) {
      const cd = sel.cooldowns.epine || 0;
      const pret = !powersBlocked && cd === 0 && !sel.epineZone && state.phase === 'play'
        && tutorielPermet(state, { type: 'power', kind: 'epine' });
      bouton(state, ctx, x, y, w, 34, 'Épine', { kind: 'epine' },
        { enabled: pret, color: UI_THEME.amber, textColor: UI_THEME.buttonText,
          sub: sel.epineZone ? `case gelée ${sel.epineZone.turns} tour(s)` : (cd > 0 ? `recharge ${cd}` : 'gèle sa case 2 tours') });
      y += 42;
    }

    // Pouvoir actif : Vétéran (pion) — capture le pion ennemi en face.
    if (sel.type === 'P' && sel.upgrades.includes('vet')) {
      const cd = sel.cooldowns.vet || 0;
      const pret = !powersBlocked && cd === 0 && state.phase === 'play'
        && ciblesVet(state.board, sel).length > 0  // aucun pion en face → bouton grisé
        && tutorielPermet(state, { type: 'power', kind: 'vet' });
      bouton(state, ctx, x, y, w, 34, 'Vétéran', { kind: 'vet' },
        { enabled: pret, color: UI_THEME.amber, textColor: UI_THEME.buttonText, sub: cd > 0 ? `recharge ${cd}` : 'capture le pion en face' });
      y += 42;
    }

    // Pouvoir actif : Ruée (cavalier).
    if (sel.type === 'N' && sel.upgrades.includes('ruee')) {
      const cd = sel.cooldowns.ruee || 0;
      const pret = !powersBlocked && cd === 0 && state.phase === 'play'
        && tutorielPermet(state, { type: 'power', kind: 'ruee' });
      bouton(state, ctx, x, y, w, 34, 'Ruée', { kind: 'ruee' },
        { enabled: pret, color: UI_THEME.amber, textColor: UI_THEME.buttonText, sub: cd > 0 ? `recharge ${cd}` : 'capture à distance' });
      // Tutoriel : surligne le bouton quand l'étape guide vers ce pouvoir.
      const hintTuto = state.mode === 'tutorial' ? tutorielHint(state) : null;
      if (hintTuto && hintTuto.power === 'ruee') pulseRect(ctx, x, y, w, 34, now);
      y += 42;
    }

    // Pouvoir actif : Rempart (tour).
    if (sel.type === 'R' && sel.upgrades.includes('rempart')) {
      const cd = sel.cooldowns.rempart || 0;
      const pret = !powersBlocked && cd === 0 && state.phase === 'play'
        && tutorielPermet(state, { type: 'power', kind: 'rempart' });
      bouton(state, ctx, x, y, w, 34, 'Rempart', { kind: 'rempart' },
        { enabled: pret, color: UI_THEME.amber, textColor: UI_THEME.buttonText, sub: cd > 0 ? `recharge ${cd}` : 'blinde la tour et les alliés' });
      y += 42;
    }

    // Pouvoir actif : Mariage stratégique (roi).
    if (sel.type === 'K' && sel.upgrades.includes('sacrifice')) {
      const cd = sel.cooldowns.sacrifice || 0;
      const pret = !powersBlocked && cd === 0 && !sel.sacrificeArmed && state.phase === 'play'
        && tutorielPermet(state, { type: 'power', kind: 'sacrifice' });
      bouton(state, ctx, x, y, w, 34, 'Mariage strat.', { kind: 'sacrifice' },
        { enabled: pret, color: UI_THEME.amber, textColor: UI_THEME.buttonText,
          sub: sel.sacrificeArmed ? 'armé' : (cd > 0 ? `recharge ${cd}` : 'immobilise la reine adverse') });
      y += 42;
    }

    // Pouvoir actif : Rayon sacré (fou).
    if (sel.type === 'B' && sel.upgrades.includes('Rayon')) {
      const cd = sel.cooldowns.Rayon || 0;
      const pret = !powersBlocked && cd === 0 && state.phase === 'play'
        && tutorielPermet(state, { type: 'power', kind: 'rayon' });
      bouton(state, ctx, x, y, w, 34, 'Rayon sacré', { kind: 'rayon' },
        { enabled: pret, color: UI_THEME.amber, textColor: UI_THEME.buttonText, sub: cd > 0 ? `recharge ${cd}` : 'capture à distance' });
      y += 42;
    }

    // Pouvoir actif : Décret (roi, usage unique).
    if (sel.type === 'K' && sel.upgrades.includes('decret')) {
      const pret = !powersBlocked && !sel.decretUsed && state.phase === 'play'
        && tutorielPermet(state, { type: 'power', kind: 'decret' });
      bouton(state, ctx, x, y, w, 34, 'Décret', { kind: 'decret' },
        { enabled: pret, color: UI_THEME.amber, textColor: UI_THEME.buttonText,
          sub: sel.decretUsed ? 'déjà utilisé' : 'échange avec un allié adjacent' });
      y += 42;
    }

    // Pouvoir actif : Cavalerie (cavalier).
    if (sel.type === 'N' && sel.upgrades.includes('cavalerie')) {
      const cd = sel.cooldowns.cavalerie || 0;
      const pret = !powersBlocked && cd === 0 && state.phase === 'play'
        && tutorielPermet(state, { type: 'power', kind: 'cavalerie' });
      bouton(state, ctx, x, y, w, 34, 'Cavalerie', { kind: 'cavalerie' },
        { enabled: pret, color: UI_THEME.amber, textColor: UI_THEME.buttonText, sub: cd > 0 ? `recharge ${cd}` : 'repousse un ennemi' });
      y += 42;
    }

    // Pouvoir actif : Échange (tour).
    if (sel.type === 'R' && sel.upgrades.includes('echange')) {
      const cd = sel.cooldowns.echange || 0;
      const pret = !powersBlocked && cd === 0 && state.phase === 'play'
        && tutorielPermet(state, { type: 'power', kind: 'echange' });
      bouton(state, ctx, x, y, w, 34, 'Échange', { kind: 'echange' },
        { enabled: pret, color: UI_THEME.amber, textColor: UI_THEME.buttonText, sub: cd > 0 ? `recharge ${cd}` : 'swap avec un pion' });
      y += 42;
    }

    // Pouvoir actif : Hypnose (fou).
    if (sel.type === 'B' && sel.upgrades.includes('hypnose')) {
      const cd = sel.cooldowns.hypnose || 0;
      const pret = !powersBlocked && cd === 0 && state.phase === 'play'
        && tutorielPermet(state, { type: 'power', kind: 'hypnose' });
      bouton(state, ctx, x, y, w, 34, 'Hypnose', { kind: 'hypnose' },
        { enabled: pret, color: UI_THEME.amber, textColor: UI_THEME.buttonText, sub: cd > 0 ? `recharge ${cd}` : 'aura de gel' });
      y += 42;
    }

    // Pouvoir actif : S.H.T. (dame, usage unique).
    if (sel.type === 'Q' && sel.upgrades.includes('sht')) {
      const pret = !powersBlocked && !sel.shtUsed && state.phase === 'play'
        && tutorielPermet(state, { type: 'power', kind: 'sht' });
      bouton(state, ctx, x, y, w, 34, 'S.H.T.', { kind: 'sht' },
        { enabled: pret, color: UI_THEME.amber, textColor: UI_THEME.buttonText,
          sub: sel.shtUsed ? 'déjà utilisé' : 'silence le roi adverse' });
      y += 42;
    }

    // Bouton Améliorer (si des cartes existent pour ce type, plafond non atteint,
    // et pièce pas sous S.H.T.).
    const cartes = UPGRADES_PAR_TYPE[sel.type] || [];
    if (!state.panelPiece && cartes.length && sel.upgrades.length < MAX_UPGRADES_PAR_PIECE) {
      bouton(state, ctx, x, y, w, 32, 'Améliorer  (clic droit)', { kind: 'ameliorer' },
        { enabled: !powersBlocked && tutorielPermet(state, { type: 'panel', piece: sel }) });
      y += 40;
    }
  }

  // Panneau d'achat ouvert.
  if (state.panelPiece && state.phase !== 'gameover') {
    y = dessineCatalogue(ctx, state, x, y, w, now);
  }

  // Vue « Améliorations achetées » : bouton sous le catalogue d'achat (hors
  // modes guidés et replay) ouvrant l'overlay des améliorations des deux camps.
  if (state.mode !== 'tutorial' && state.mode !== 'learn' && state.phase !== 'replay') {
    bouton(state, ctx, x, y, w, 30, traduire('Voir les améliorations', state.language),
      { kind: 'toggleUpgradesView' },
      { color: UI_THEME.card, textColor: UI_THEME.text, fontSize: 11 });
    y += 38;
  }

  // Bouton Retour (spectateur) / Abandonner (PvP, PvAI) — ancré en bas du panneau.
  if (state.phase !== 'gameover' && state.phase !== 'menu' && state.phase !== 'replay') {
    const btnY = CANVAS_H - 48;
    if (state.mode === 'spectator') {
      bouton(state, ctx, __PANEL_X_RUNTIME + w - 140, btnY, 130, 32, '◀  Retour',
        { kind: 'retourMenu' },
        { color: UI_THEME.primary, textColor: UI_THEME.text });
    } else if (state.mode !== 'tutorial'
        && (state.mode === 'pvp' || state.mode === 'pvai' || state.mode === 'pvw' || state.mode === 'hunt')) {
      bouton(state, ctx, __PANEL_X_RUNTIME + w - 140, btnY, 130, 32, 'Abandonner',
        { kind: 'abandonner' },
        { color: UI_THEME.danger, textColor: UI_THEME.text });
    }
  }

  // Aide en bas.
  //ctx.fillStyle = C_ENCRE_PALE; ctx.font = `11px ${F_TEXTE}`;
  //ctx.textAlign = 'left'; ctx.textBaseline = 'bottom';
  //ctx.fillText('Clic gauche : jouer  ·  Clic droit : améliorer  ·  Échap : annuler',
  //  x, CANVAS_H - 12);
}

// Panneau mobile compact : le plateau reste visible au-dessus et les actions
// de la pièce sélectionnée sont regroupées dans une grille tactile. Le catalogue
// passe lui aussi en deux colonnes, sans supprimer aucune amélioration.
function dessineCatalogueMobile(ctx, state, x, y, w, now) {
  const p = state.panelPiece;
  const ids = upgradesForPiece(state.activeDeck, p.type, UPGRADES_PAR_TYPE[p.type]);
  const gap = 8;
  const cardW = w;
  const cardH = 58;
  const headerY = y;
  ctx.fillStyle = UI_THEME.text;
  ctx.font = `12px ${F_DISPLAY}`;
  ctx.textAlign = 'left'; ctx.textBaseline = 'top';
  ctx.fillText(`${traduire('AMÉLIORER', state.language)} · ${nomType(p.type, state.language).toUpperCase()}`, x, headerY);
  bouton(state, ctx, x + w - 44, headerY - 8, 44, 44, '×', { kind: 'closePanel' }, {
    color: UI_THEME.dangerDark, textColor: UI_THEME.text, outlineColor: UI_THEME.danger,
  });
  y += 22;
  dessineLegendeCategories(ctx, state, x, y + 5);
  y += 18;

  const solde = state.ecus[state.turn];
  const trembler = now - state.buzz < 300;
  const hintTuto = state.mode === 'tutorial' ? tutorielHint(state) : null;
  ids.forEach((id, index) => {
    const u = UPGRADES[id];
    const cardX = x;
    const cardY = y + index * (cardH + gap);
    const bientot = !!u.nonImplemente;
    const verrou = state.mode === 'tutorial' && !tutorielPermet(state, { type: 'buy', id });
    const deja = p.upgrades.includes(id);
    const plein = p.upgrades.length >= MAX_UPGRADES_PAR_PIECE;
    const statPlafond = u.cat === 'S'
      && !p.upgrades.some(estAmeliorationStat)
      && ((state.statUpgradesCount || [0, 0])[p.owner] || 0) >= MAX_STATS_PAR_JOUEUR;
    const abordable = solde >= u.cout;
    const learnVerrou = state.mode === 'learn' && !learnPermet(state, { type: 'buy', id });
    const achetable = !bientot && !verrou && !learnVerrou && !deja && !plein && !statPlafond && abordable;
    state.ui.buttons.push({
      x: cardX, y: cardY, w: cardW, h: cardH,
      action: { kind: 'buy', id }, enabled: !learnVerrou, radius: 8,
    });
    const bg = bientot || verrou || statPlafond || !abordable ? UI_THEME.disabled
      : deja ? UI_THEME.panelAlt : UI_THEME.card;
    carte(ctx, cardX, cardY, cardW, cardH, 8, bg, { shadow: achetable || deja, stroke: null });
    ctx.lineWidth = deja ? 2 : 1;
    ctx.strokeStyle = deja ? UI_THEME.primaryDark : UI_THEME.border;
    roundRect(ctx, cardX, cardY, cardW, cardH, 8); ctx.stroke();
    ctx.fillStyle = deja ? UI_THEME.primaryDark : COULEUR_CAT[u.cat];
    roundRect(ctx, cardX, cardY, 6, cardH, 3); ctx.fill();

    ctx.save();
    roundRect(ctx, cardX, cardY, cardW, cardH, 8); ctx.clip();
    ctx.fillStyle = (achetable || deja) && !bientot ? UI_THEME.text : UI_THEME.disabledText;
    const title = traduire(u.nom, state.language).toUpperCase();
    ctx.font = `10px ${F_DISPLAY}`; ctx.textAlign = 'left'; ctx.textBaseline = 'top';
    if (ctx.measureText(title).width > cardW - 38) ctx.font = `9px ${F_DISPLAY}`;
    ctx.fillText(title, cardX + 12, cardY + 7);
    ctx.fillStyle = UI_THEME.muted; ctx.font = `9px ${F_TEXTE}`;
    wrapTextLimite(ctx, traduire(u.desc, state.language), cardX + 12, cardY + 23, cardW - 40, 10, 2);
    ctx.restore();

    const badgeX = cardX + cardW - 17;
    const badgeY = cardY + 14;
    ctx.beginPath(); ctx.arc(badgeX, badgeY, 12, 0, Math.PI * 2);
    ctx.fillStyle = deja ? UI_THEME.primary : (u.cout >= 12 ? UI_THEME.amber : COULEUR_CAT[u.cat]);
    ctx.fill(); ctx.lineWidth = 1.5; ctx.strokeStyle = UI_THEME.border; ctx.stroke();
    ctx.fillStyle = abordable || deja ? UI_THEME.text : UI_THEME.danger;
    ctx.font = `10px ${F_DISPLAY}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(deja ? '✓' : String(u.cout), badgeX, badgeY + 1);
    if (hintTuto && hintTuto.buyId === id) pulseRect(ctx, cardX, cardY, cardW, cardH, now);
    if (trembler && state.buzzId === id) {
      // Le tremblement reste visuel uniquement ; la hitbox conserve sa position.
      ctx.strokeStyle = UI_THEME.danger; ctx.lineWidth = 2;
      roundRect(ctx, cardX + (Math.random() * 4 - 2), cardY, cardW, cardH, 8); ctx.stroke();
    }
  });
  return y + ids.length * (cardH + gap) - gap;
}

function dessineSuiviJoueursMobile(ctx, state, x, y, w, now) {
  // Sur téléphone, le suivi reste lisible en une seule ligne par joueur :
  // pseudo à gauche, temps au centre-droit, écus à droite. Les horloges ne
  // prennent donc plus deux lignes séparées au-dessus des soldes.
  const enLigne = state.mode === 'pvw' && state.pvw;
  const disp = enLigne ? (state.pvw.clockDisplay || state.pvw.clocks) : null;

  const cardH = 42;
  const gap = 8;
  for (let j = 0; j < 2; j++) {
    const actif = j === state.turn && state.phase !== 'gameover';
    const vj = campVisuel(state, j);
    carte(ctx, x, y, w, cardH, 8, actif ? UI_THEME.panelAlt : UI_THEME.card, { shadow: actif });
    if (actif) {
      ctx.fillStyle = ACCENT[vj];
      roundRect(ctx, x, y, 4, cardH, 2); ctx.fill();
    }
    ctx.fillStyle = ACCENT[vj];
    ctx.beginPath(); ctx.arc(x + 20, y + cardH / 2, 9, 0, Math.PI * 2); ctx.fill();

    let nomJ = NOM_JOUEUR[j];
    if (enLigne) {
      nomJ = j === state.pvw.side ? 'Toi' : (state.pvw.oppPseudo || 'Adversaire');
    }
    const statut = actif ? `  ·  ${traduire('à jouer', state.language)}` : '';
    const nomAffiche = (traduire(nomJ, state.language) + statut).toUpperCase();

    const eW = 66, eH = 24;
    const eX = x + w - eW - 8, eY = y + (cardH - eH) / 2;
    const clockRight = eX - 10;
    // Le nom s'adapte à la largeur restante pour ne jamais passer sous le temps
    // ou la pastille d'écus, notamment sur un téléphone étroit.
    ctx.fillStyle = UI_THEME.text; ctx.font = `11px ${F_DISPLAY}`;
    ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
    const maxNameW = Math.max(52, clockRight - (x + 36) - 8);
    let nomRendu = nomAffiche;
    if (ctx.measureText(nomRendu).width > maxNameW) {
      while (nomRendu.length > 1 && ctx.measureText(`${nomRendu.slice(0, -1)}…`).width > maxNameW) {
        nomRendu = nomRendu.slice(0, -1);
      }
      nomRendu = `${nomRendu.slice(0, -1)}…`;
    }
    ctx.fillText(nomRendu, x + 36, y + cardH / 2);

    // En PvP, le temps et les écus partagent la même ligne, avec le temps
    // traité comme une donnée tabulaire et sa couleur d'alerte conservée.
    if (enLigne) {
      const t = disp[j];
      const bas = t <= 30;
      ctx.fillStyle = bas ? UI_THEME.danger : UI_THEME.text;
      ctx.font = `12px ${F_DISPLAY}`;
      ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
      ctx.fillText(`⏱ ${fmtClock(t)}`, clockRight, y + cardH / 2);
    }

    ctx.fillStyle = ACCENT[vj];
    roundRect(ctx, eX, eY, eW, eH, eH / 2); ctx.fill();
    ctx.lineWidth = 2; ctx.strokeStyle = UI_THEME.border;
    roundRect(ctx, eX, eY, eW, eH, eH / 2); ctx.stroke();
    ctx.beginPath(); ctx.arc(eX + 13, eY + eH / 2, 7, 0, Math.PI * 2);
    ctx.fillStyle = UI_THEME.card; ctx.fill();
    ctx.lineWidth = 1.5; ctx.strokeStyle = UI_THEME.border; ctx.stroke();
    ctx.fillStyle = UI_THEME.text; ctx.font = `12px ${F_DISPLAY}`;
    ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
    ctx.fillText(String(state.ecus[j]), eX + eW - 8, eY + eH / 2 + 1);
    y += cardH + gap;
  }
  return y + 2;
}

// Vue « Améliorations achetées » (overlay) : liste les pièces équipées d'au moins
// une amélioration pour chaque camp, avec les cartes achetées affichées une par
// ligne sous le nom de la pièce (pastille de catégorie D/A/S). Ouverte via le
// bouton « Voir les améliorations » du panneau (desktop + mobile), fermée par ✕,
// un clic hors panneau ou Échap.
function dessineVueAmeliorations(ctx, state) {
  const mobile = !!(state.ui && state.ui.mobileGameplay);
  // Voile : signale le modal, le plateau reste lisible dessous (comme Promotion).
  ctx.fillStyle = UI_THEME.overlay;
  ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);

  // Pièces équipées par camp (ordre du plateau = état actuel, lockstep compris).
  const equipees = [[], []];
  if (state.board) {
    for (const row of state.board) {
      for (const p of row) {
        if (p && Array.isArray(p.upgrades) && p.upgrades.length) equipees[p.owner].push(p);
      }
    }
  }

  const headerH = 54;
  const campHeaderH = 34;
  // Chaque pièce affiche son nom puis SES améliorations les unes sous les autres :
  // la hauteur d'une carte dépend donc du nombre de cartes équipées.
  const nomH = mobile ? 18 : 16;   // hauteur de la ligne du nom de pièce
  const ligneH = mobile ? 17 : 16; // hauteur d'une ligne d'amélioration
  const entryPad = 4;              // padding haut/bas de chaque carte
  const entryH = (p) => entryPad * 2 + nomH + p.upgrades.length * ligneH;
  const videH = 28;
  const campPad = 12;
  const colGap = 16;
  const panelPad = 20;
  const campH = (camp) => campHeaderH
    + (equipees[camp].length
      ? equipees[camp].reduce((s, p) => s + entryH(p), 0)
      : videH) + campPad * 2;

  const w = mobile ? CANVAS_W - 20 : Math.min(660, CANVAS_W - 220);
  const colW = mobile ? w - panelPad * 2 : (w - panelPad * 2 - colGap) / 2;
  const contentTop = headerH;
  const contentH = mobile
    ? headerH + campH(0) + campH(1) + 12 + panelPad
    : headerH + Math.max(campH(0), campH(1)) + panelPad;
  // Sur téléphone, le catalogue peut contenir une pièce par ligne pour chaque
  // camp. La fenêtre reste donc à hauteur d'écran et son contenu défile au lieu
  // de sortir du téléphone (swipe vertical ou roulette sur desktop).
  const h = mobile
    ? Math.min(contentH, Math.max(300, Math.min(620, CANVAS_H - 24)))
    : contentH;
  const x0 = Math.max(10, (CANVAS_W - w) / 2);
  // Le panneau mobile commence en haut du canvas : l'utilisateur voit toujours
  // son titre dès l'ouverture, puis fait défiler les améliorations à l'intérieur.
  const y0 = mobile ? 12 : Math.max(12, (CANVAS_H - h) / 2);
  const clipTop = y0 + headerH;
  const clipBottom = y0 + h - panelPad;
  const maxScroll = mobile ? Math.max(0, contentH - h) : 0;
  if (state.ui) {
    state.ui.upgradesScrollMax = maxScroll;
    state.ui.upgradesScroll = Math.max(0, Math.min(maxScroll, Number(state.ui.upgradesScroll) || 0));
    state.ui.upgradesPanel = { x: x0, y: y0, w, h, contentTop: clipTop, contentBottom: clipBottom };
  }

  carte(ctx, x0, y0, w, h, 16, UI_THEME.panel, { shadow: true, stroke: null });
  if (mobile && maxScroll > 0) {
    // Laisser une indication visuelle discrète de la zone défilable.
    ctx.fillStyle = UI_THEME.muted;
    ctx.globalAlpha = 0.3;
    roundRect(ctx, x0 + w - 7, clipTop + 4, 3, Math.max(1, clipBottom - clipTop - 8), 2);
    ctx.fill();
    ctx.globalAlpha = 1;
  }
  ctx.lineWidth = 2; ctx.strokeStyle = UI_THEME.border;
  roundRect(ctx, x0, y0, w, h, 16); ctx.stroke();

  // Titre + fermeture ✕.
  ctx.fillStyle = UI_THEME.text; ctx.font = `18px ${F_DISPLAY}`;
  ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
  ctx.fillText(traduire('AMÉLIORATIONS ACHETÉES', state.language), x0 + panelPad, y0 + 28);
  const cw = 26;
  const cxBtn = x0 + w - panelPad - cw;
  state.ui.buttons.push({ x: cxBtn, y: y0 + 15, w: cw, h: cw,
    action: { kind: 'toggleUpgradesView' }, enabled: true, radius: 7 });
  ctx.fillStyle = UI_THEME.danger;
  roundRect(ctx, cxBtn, y0 + 15, cw, cw, 7); ctx.fill();
  ctx.fillStyle = UI_THEME.text; ctx.font = `15px ${F_DISPLAY}`;
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText('✕', cxBtn + cw / 2, y0 + 28);

  const drawCamp = (camp, cx, top) => {
    const vj = campVisuel(state, camp);
    // En-tête du camp : point d'accent + nom (Toi / pseudo adverse en pvw).
    let nomJ = NOM_JOUEUR[camp];
    if (state.mode === 'pvw' && state.pvw) {
      nomJ = camp === state.pvw.side ? 'Toi' : (state.pvw.oppPseudo || 'Adversaire');
    }
    ctx.fillStyle = ACCENT[vj];
    ctx.beginPath(); ctx.arc(cx + 12, top + 17, 8, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = UI_THEME.text; ctx.font = `700 11px ${F_DISPLAY}`;
    ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
    ctx.fillText(traduire(nomJ, state.language).toUpperCase(), cx + 28, top + 17);

    let ey = top + campHeaderH;
    if (!equipees[camp].length) {
      ctx.fillStyle = UI_THEME.muted; ctx.font = `12px ${F_TEXTE}`;
      ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
      ctx.fillText(traduire('Aucune amélioration achetée', state.language), cx + 10, ey + videH / 2);
      return;
    }
    for (const p of equipees[camp]) {
      const eh = entryH(p);
      carte(ctx, cx, ey, colW, eh - 4, 7, UI_THEME.card, { shadow: false });
      const nom = nomType(p.type, state.language);
      ctx.fillStyle = UI_THEME.text; ctx.font = `700 12px ${F_TEXTE}`;
      ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
      ctx.fillText(nom, cx + 10, ey + entryPad + nomH / 2);
      // Cartes achetées : une ligne PAR amélioration, empilées sous le nom.
      const ups = p.upgrades.map((id) => UPGRADES[id]).filter(Boolean);
      let ly = ey + entryPad + nomH + ligneH / 2;
      ctx.font = `10px ${F_TEXTE}`;
      for (const u of ups) {
        ctx.fillStyle = COULEUR_CAT[u.cat];
        ctx.beginPath(); ctx.arc(cx + 16, ly, 3, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = UI_THEME.muted;
        ctx.fillText(traduire(u.nom, state.language).toUpperCase(), cx + 24, ly);
        ly += ligneH;
      }
      ey += eh;
    }
  };

  if (mobile) {
    const scroll = state.ui?.upgradesScroll || 0;
    ctx.save();
    ctx.beginPath();
    ctx.rect(x0 + 1, clipTop, w - 2, Math.max(0, clipBottom - clipTop));
    ctx.clip();
    drawCamp(0, x0 + panelPad, y0 + contentTop - scroll);
    drawCamp(1, x0 + panelPad, y0 + contentTop + campH(0) + 12 - scroll);
    ctx.restore();

    if (maxScroll > 0) {
      const trackH = Math.max(1, clipBottom - clipTop - 8);
      const visibleContentH = Math.max(1, h - headerH);
      const scrollableContentH = Math.max(visibleContentH, contentH - headerH);
      const thumbH = Math.max(34, trackH * visibleContentH / scrollableContentH);
      const thumbY = clipTop + 4 + (trackH - thumbH) * (scroll / maxScroll);
      ctx.fillStyle = UI_THEME.secondary;
      ctx.globalAlpha = 0.9;
      roundRect(ctx, x0 + w - 7, thumbY, 3, thumbH, 2);
      ctx.fill();
      ctx.globalAlpha = 1;
    }
  } else {
    const top = y0 + contentTop;
    drawCamp(0, x0 + panelPad, top);
    drawCamp(1, x0 + panelPad + colW + colGap, top);
  }
}

function dessinePanneauMobile(ctx, state, now) {
  // Le panneau est centré dans la largeur logique du téléphone, indépendamment
  // de la marge réservée au plateau quand le catalogue est ouvert.
  const w = CANVAS_W - 32;
  const x = (CANVAS_W - w) / 2;
  const instructionsAuDessus = mobileInstructionsAuDessus(state);
  // En Tutoriel mobile, la carte de consignes est déjà au-dessus du plateau :
  // on ne la redessine pas sous le plateau et on commence directement par les
  // actions de la pièce (notamment AMÉLIORER).
  if (state.mode === 'tutorial' && state.tutorialStep != null
      && !state.panelPiece && !tutorielPanneauNormal(state) && !instructionsAuDessus) {
    dessineTutorielHUD(ctx, state, x, w, now);
    return;
  }
  // Le suivi joueur reste disponible hors Tutoriel/Apprendre. Dans ces deux
  // modes guidés, l'espace sous le plateau commence par l'action attendue.
  let y = instructionsAuDessus ? OY : dessineSuiviJoueursMobile(ctx, state, x, OY, w, now);
  const sel = state.selected;
  const selectedUsable = sel && sel.owner === state.turn && state.phase !== 'gameover';
  if (selectedUsable) {
    carte(ctx, x, y, w, 24, 7, UI_THEME.card, { shadow: false });
    ctx.fillStyle = UI_THEME.text; ctx.font = `11px ${F_TEXTE}`;
    ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
    ctx.fillText(`${nomType(sel.type, state.language)} · ${traduire('valeur', state.language)} ${valeurAffichee(sel)}`, x + 10, y + 12);
    y += 34;

    const powersBlocked = sel.debuffs && sel.debuffs.sht > 0;
    const powers = [];
    const addPower = (id, label, action, enabled, sub) => powers.push({ id, label, action, enabled, sub });
    if (sel.type === 'P' && sel.upgrades.includes('epine')) {
      const cd = sel.cooldowns.epine || 0;
      addPower('epine', 'Épine', { kind: 'epine' }, !powersBlocked && cd === 0 && !sel.epineZone && state.phase === 'play' && tutorielPermet(state, { type: 'power', kind: 'epine' }), cd ? `recharge ${cd}` : sel.epineZone ? 'gelée' : 'actif');
    }
    if (sel.type === 'P' && sel.upgrades.includes('vet')) {
      const cd = sel.cooldowns.vet || 0;
      addPower('vet', 'Vétéran', { kind: 'vet' }, !powersBlocked && cd === 0 && state.phase === 'play' && ciblesVet(state.board, sel).length > 0 && tutorielPermet(state, { type: 'power', kind: 'vet' }), cd ? `recharge ${cd}` : 'actif');
    }
    if (sel.type === 'N' && sel.upgrades.includes('ruee')) {
      const cd = sel.cooldowns.ruee || 0;
      addPower('ruee', 'Ruée', { kind: 'ruee' }, !powersBlocked && cd === 0 && state.phase === 'play' && tutorielPermet(state, { type: 'power', kind: 'ruee' }), cd ? `recharge ${cd}` : 'actif');
    }
    if (sel.type === 'N' && sel.upgrades.includes('cavalerie')) {
      const cd = sel.cooldowns.cavalerie || 0;
      addPower('cavalerie', 'Cavalerie', { kind: 'cavalerie' }, !powersBlocked && cd === 0 && state.phase === 'play' && tutorielPermet(state, { type: 'power', kind: 'cavalerie' }), cd ? `recharge ${cd}` : 'actif');
    }
    if (sel.type === 'R' && sel.upgrades.includes('rempart')) {
      const cd = sel.cooldowns.rempart || 0;
      addPower('rempart', 'Rempart', { kind: 'rempart' }, !powersBlocked && cd === 0 && state.phase === 'play' && tutorielPermet(state, { type: 'power', kind: 'rempart' }), cd ? `recharge ${cd}` : 'actif');
    }
    if (sel.type === 'R' && sel.upgrades.includes('echange')) {
      const cd = sel.cooldowns.echange || 0;
      addPower('echange', 'Échange', { kind: 'echange' }, !powersBlocked && cd === 0 && state.phase === 'play' && tutorielPermet(state, { type: 'power', kind: 'echange' }), cd ? `recharge ${cd}` : 'actif');
    }
    if (sel.type === 'B' && sel.upgrades.includes('Rayon')) {
      const cd = sel.cooldowns.Rayon || 0;
      addPower('Rayon', 'Rayon sacré', { kind: 'rayon' }, !powersBlocked && cd === 0 && state.phase === 'play' && tutorielPermet(state, { type: 'power', kind: 'rayon' }), cd ? `recharge ${cd}` : 'actif');
    }
    if (sel.type === 'B' && sel.upgrades.includes('hypnose')) {
      const cd = sel.cooldowns.hypnose || 0;
      addPower('hypnose', 'Hypnose', { kind: 'hypnose' }, !powersBlocked && cd === 0 && state.phase === 'play' && tutorielPermet(state, { type: 'power', kind: 'hypnose' }), cd ? `recharge ${cd}` : 'actif');
    }
    if (sel.type === 'Q' && sel.upgrades.includes('sht')) {
      addPower('sht', 'S.H.T.', { kind: 'sht' }, !powersBlocked && !sel.shtUsed && state.phase === 'play' && tutorielPermet(state, { type: 'power', kind: 'sht' }), sel.shtUsed ? 'utilisé' : 'actif');
    }
    if (sel.type === 'K' && sel.upgrades.includes('sacrifice')) {
      const cd = sel.cooldowns.sacrifice || 0;
      addPower('sacrifice', 'Mariage strat.', { kind: 'sacrifice' }, !powersBlocked && cd === 0 && !sel.sacrificeArmed && state.phase === 'play' && tutorielPermet(state, { type: 'power', kind: 'sacrifice' }), sel.sacrificeArmed ? 'armé' : cd ? `recharge ${cd}` : 'actif');
    }
    if (sel.type === 'K' && sel.upgrades.includes('decret')) {
      addPower('decret', 'Décret', { kind: 'decret' }, !powersBlocked && !sel.decretUsed && state.phase === 'play' && tutorielPermet(state, { type: 'power', kind: 'decret' }), sel.decretUsed ? 'utilisé' : 'actif');
    }
    if (powers.length) {
      // Une seule colonne sur téléphone : chaque pouvoir garde une cible tactile
      // de 44 px et la lecture suit le même axe vertical que le catalogue.
      const powerGap = 8;
      powers.forEach((power, index) => {
        const py = y + index * (44 + powerGap);
        bouton(state, ctx, x, py, w, 44, power.label, power.action, {
          enabled: power.enabled, color: UI_THEME.amber, textColor: UI_THEME.buttonText, sub: power.sub,
        });
      });
      y += powers.length * (44 + powerGap) - powerGap + 4;
    }

    const cartes = UPGRADES_PAR_TYPE[sel.type] || [];
    if (!state.panelPiece && cartes.length && sel.upgrades.length < MAX_UPGRADES_PAR_PIECE) {
      bouton(state, ctx, x, y, w, 44, 'Améliorer', { kind: 'ameliorer' }, {
        enabled: !powersBlocked && tutorielPermet(state, { type: 'panel', piece: sel }),
      });
      y += 50;
    }
  } else {      ctx.fillStyle = UI_THEME.muted; ctx.font = `10px ${F_TEXTE}`;
    ctx.textAlign = 'left'; ctx.textBaseline = 'top';
    ctx.fillText(traduire('Sélectionnez une pièce pour voir ses actions', state.language), x, y + 4);
    y += 26;
  }

  // Les étapes de lecture conservent leurs actions dédiées sous le plateau,
  // même si la fiche d'instructions a été déplacée au-dessus.
  if (instructionsAuDessus && state.mode === 'tutorial') {
    const step = STEPS[state.tutorialStep];
    if (step?.continuer) {
      bouton(state, ctx, x, y, w, 44, 'Continuer', { kind: 'tutorialContinue' }, {
        color: UI_THEME.primary, textColor: UI_THEME.text,
      });
      y += 52;
    }
    bouton(state, ctx, x, y, (w - 8) / 2, 34, '↻ Recommencer', { kind: 'tutorialRestart' }, {
      color: UI_THEME.card, textColor: UI_THEME.text, fontSize: 10,
    });
    bouton(state, ctx, x + (w + 8) / 2, y, (w - 8) / 2, 34, '← Menu', { kind: 'tutorialHub' }, {
      color: UI_THEME.primary, textColor: UI_THEME.text, fontSize: 10,
    });
    y += 42;
  }

  if (state.panelPiece && state.phase !== 'gameover') y = dessineCatalogueMobile(ctx, state, x, y, w, now) + 8;

  // Vue « Améliorations achetées » : bouton sous le catalogue d'achat (hors
  // tutoriel — le replay a son propre HUD et ne passe pas ici).
  if (state.mode !== 'tutorial' && state.phase !== 'replay') {
    bouton(state, ctx, x, y, w, 40, traduire('Voir les améliorations', state.language),
      { kind: 'toggleUpgradesView' },
      { color: UI_THEME.card, textColor: UI_THEME.text, fontSize: 11 });
    y += 48;
  }

  if (state.phase !== 'gameover' && state.phase !== 'menu' && state.phase !== 'replay'
      && state.mode !== 'tutorial') {
    bouton(state, ctx, x + w - 118, y, 118, 44, state.mode === 'spectator' ? '◀ Retour' : 'Abandonner', {
      kind: state.mode === 'spectator' ? 'retourMenu' : 'abandonner',
    }, { color: state.mode === 'spectator' ? UI_THEME.primary : UI_THEME.danger, textColor: UI_THEME.text });
  }
}

function dessineInstructionsMobile(ctx, state, now) {
  if (!mobileInstructionsAuDessus(state)) return;
  const x = 16;
  const w = CANVAS_W - 32;
  const y = 12;
  const h = mobileInstructionHeight(state) - 22;
  carte(ctx, x, y, w, h, 12, UI_THEME.panel, { shadow: true });
  ctx.lineWidth = 2; ctx.strokeStyle = state.mode === 'tutorial' ? UI_THEME.secondary : UI_THEME.primary;
  roundRect(ctx, x, y, w, h, 12); ctx.stroke();

  if (state.mode === 'tutorial') {
    const step = STEPS[state.tutorialStep];
    if (!step) return;
    const badgeW = 116, badgeH = 26;
    ctx.fillStyle = UI_THEME.secondary; roundRect(ctx, x + 10, y + 10, badgeW, badgeH, 7); ctx.fill();
    ctx.fillStyle = UI_THEME.text; ctx.font = `12px ${F_DISPLAY}`;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(`${traduire('ÉTAPE', state.language)} ${state.tutorialStep + 1}/${TOTAL_STEPS}`, x + 10 + badgeW / 2, y + 23);
    const barY = y + 44, barW = w - 20;
    ctx.fillStyle = UI_THEME.border; roundRect(ctx, x + 10, barY, barW, 5, 3); ctx.fill();
    ctx.fillStyle = UI_THEME.secondary; roundRect(ctx, x + 10, barY, barW * ((state.tutorialStep + 1) / TOTAL_STEPS), 5, 3); ctx.fill();
    ctx.fillStyle = UI_THEME.text; ctx.font = `15px ${F_DISPLAY}`; ctx.textAlign = 'left'; ctx.textBaseline = 'top';
    ctx.fillText(traduire(step.title, state.language).toUpperCase(), x + 10, y + 60);
    ctx.fillStyle = UI_THEME.muted; ctx.font = `600 13px ${F_TEXTE}`;
      const lines = Math.min(2, wrapTextLimite(ctx, traduire(step.text, state.language), x + 10, y + 86, w - 20, 18, 2) || 0);
    let cursorY = y + 86 + lines * 18 + 5;
    if (step.detail) {
      ctx.fillStyle = UI_THEME.disabledText; ctx.font = `11px ${F_TEXTE}`;
      const detailLines = Math.min(4, wrapTextLimite(ctx, traduire(step.detail, state.language), x + 10, cursorY, w - 20, 15, 4) || 0);
      cursorY += detailLines * 15 + 5;
    }
    ctx.fillStyle = UI_THEME.text; ctx.font = `12px ${F_DISPLAY}`;
    ctx.fillText(`${state.ecus[0]} ${traduire('ÉCUS', state.language)}`, x + 10, Math.min(y + h - 12, cursorY));
    return;
  }

  const item = state.learnKind === 'puzzle' ? PUZZLES[state.puzzleIndex] : LEARN_GAMES[state.learnIndex];
  if (!item) return;
  ctx.fillStyle = item.color || UI_THEME.primary; ctx.font = `10px ${F_TEXTE}`;
  ctx.textAlign = 'left'; ctx.textBaseline = 'top';
  ctx.fillText(traduire(item.category, state.language).toUpperCase(), x + 10, y + 10);
  ctx.fillStyle = UI_THEME.text; ctx.font = `15px ${F_DISPLAY}`;
  ctx.fillText(traduire(item.title, state.language).toUpperCase(), x + 10, y + 28);
  ctx.fillStyle = UI_THEME.muted; ctx.font = `600 12px ${F_TEXTE}`;
  const textLines = Math.min(3, wrapTextLimite(ctx, traduire(item.text, state.language), x + 10, y + 54, w - 20, 17, 3) || 0);
  const objectiveY = y + 54 + textLines * 17 + 6;
  ctx.fillStyle = UI_THEME.amber; ctx.font = `700 11px ${F_TEXTE}`;
  wrapTextLimite(ctx, traduire(`Objectif : ${item.objective}`, state.language), x + 10, objectiveY, w - 20, 15, 2);
  if (state.learnKind === 'puzzle') {
    ctx.fillStyle = UI_THEME.text; ctx.font = `12px ${F_DISPLAY}`;
    ctx.fillText(`${state.ecus[0]} ${traduire('ÉCUS', state.language)}`, x + 10, y + h - 12);
  }
}

// Actions mobiles sous le plateau. Le bouton d'amélioration est volontairement
// la première action : il reste immédiatement sous le cadre, avant le catalogue.
function dessineLearnActionsMobile(ctx, state, now) {
  const x = 16, w = CANVAS_W - 32;
  let y = OY;
  const item = state.learnKind === 'puzzle' ? PUZZLES[state.puzzleIndex] : LEARN_GAMES[state.learnIndex];
  if (!item) return;
  const purchased = state.learnKind === 'puzzle' ? state.puzzlePurchased : state.learnPurchased;
  const selected = state.selected && state.selected.owner === state.turn && state.phase !== 'gameover';
  if (selected && !purchased) {
    bouton(state, ctx, x, y, w, 44, state.learnKind === 'puzzle' ? 'Acheter la solution' : 'Acheter l’amélioration', { kind: 'ameliorer' }, {
      color: UI_THEME.amber, textColor: UI_THEME.buttonText,
      sub: `${traduire(item.upgrade, state.language)} · ${item.cost} ${traduire('écus', state.language)}`,
    });
    y += 52;
  } else if (selected && purchased && item.power && state.phase === 'play') {
    const actionByPower = { ruee: 'ruee', rayon: 'rayon', vet: 'vet', hypnose: 'hypnose', decret: 'decret', cavalerie: 'cavalerie', echange: 'echange', epine: 'epine', rempart: 'rempart' };
    const kind = actionByPower[item.power];
    if (kind) {
      bouton(state, ctx, x, y, w, 44, item.power.toUpperCase(), { kind }, { color: UI_THEME.amber, textColor: UI_THEME.buttonText, sub: 'activer maintenant' });
      y += 52;
    }
  } else if (!selected) {
    ctx.fillStyle = UI_THEME.muted; ctx.font = `11px ${F_TEXTE}`; ctx.textAlign = 'left'; ctx.textBaseline = 'top';
    ctx.fillText(traduire('Sélectionne la pièce signalée pour continuer.', state.language), x, y + 4);
    y += 28;
  }
  if (state.panelPiece && state.phase !== 'gameover') y = dessineCatalogueMobile(ctx, state, x, y, w, now) + 8;
  const footY = CANVAS_H - 48;
  const footGap = 8, footW = (w - footGap) / 2;
  bouton(state, ctx, x, footY, footW, 34, '↻ Recommencer', { kind: state.learnKind === 'puzzle' ? 'puzzleRestart' : 'learnRestart' }, { color: UI_THEME.card, textColor: UI_THEME.text, fontSize: 10 });
  bouton(state, ctx, x + footW + footGap, footY, footW, 34, state.learnKind === 'puzzle' ? '← Menu puzzles' : ' Menu Défi', { kind: state.learnKind === 'puzzle' ? 'puzzleHub' : 'learnHub' }, { color: UI_THEME.primary, textColor: UI_THEME.text, fontSize: 10 });
}

// En mobile, le panneau conserve toutes ses cartes et actions mais est rendu sous
// le plateau. On décale temporairement son origine verticale afin que les fonctions
// de catalogue existantes enregistrent leurs hitboxes au même endroit que le dessin.
function dessinePanneauGameplay(ctx, state, now) {
  if (!(state.ui && state.ui.mobileGameplay)) {
    dessinePanneau(ctx, state, now);
    return;
  }
  // En replay, le HUD mobile (lecture + contrôles + suivi joueurs) occupe toute
  // la zone sous le plateau : pas de panneau d'actions — il n'a pas de sens en
  // spectateur et recouvrirait les contrôles.
  if (state.phase === 'replay') return;
  const originePlateau = OY;
  OY = originePlateau + __BOARD_H + 16;
  try {
    if (state.mode === 'learn') dessineLearnActionsMobile(ctx, state, now);
    else dessinePanneauMobile(ctx, state, now);
  } finally {
    OY = originePlateau;
  }
}

// Petite légende D / A / S — rend lisible le code couleur utilisé sur chaque carte.
function dessineLegendeCategories(ctx, state, x, y) {
  const items = [['D', 'DÉPLACEMENT'], ['A', 'ACTIF'], ['S', 'STAT']];
  ctx.font = `10px ${F_TEXTE}`; ctx.textBaseline = 'middle';
  let lx = x;
  for (const [cat, label] of items) {
    ctx.beginPath(); ctx.arc(lx + 4, y, 4, 0, Math.PI * 2);
    ctx.fillStyle = COULEUR_CAT[cat]; ctx.fill();
    ctx.fillStyle = UI_THEME.muted; ctx.textAlign = 'left';     const translatedLabel = traduire(label, state.language);
     ctx.fillText(translatedLabel, lx + 11, y);

     lx += ctx.measureText(translatedLabel).width + 26;

  }
}

function dessineCatalogue(ctx, state, x, y, w, now) {
  const p = state.panelPiece;
  ctx.fillStyle = UI_THEME.text; ctx.font = `13px ${F_DISPLAY}`;
  ctx.textAlign = 'left'; ctx.textBaseline = 'top';
  ctx.fillText(`${traduire('AMÉLIORER', state.language)} : ${nomType(p.type, state.language).toUpperCase()}`, x, y);
  bouton(state, ctx, x + w - 26, y - 4, 26, 22, '×', { kind: 'closePanel' }, { color: UI_THEME.dangerDark, textColor: UI_THEME.text, outlineColor: UI_THEME.danger });
  y += 20;
  dessineLegendeCategories(ctx, state, x, y + 6);
  // Marge supplémentaire : laisse respirer la pastille de coût qui déborde du haut
  // de la 1re carte (DA §11.1.c, grammaire « déborde du conteneur »).
  y += 28;

  const solde = state.ecus[state.turn];
  const trembler = now - state.buzz < 300;
  const hintTuto = state.mode === 'tutorial' ? tutorielHint(state) : null;
  for (const id of upgradesForPiece(state.activeDeck, p.type, UPGRADES_PAR_TYPE[p.type])) {
    const u = UPGRADES[id];
    const bientot = !!u.nonImplemente; // garde de compatibilité pour les cartes futures
    // Tutoriel : les cartes hors étape sont verrouillées (grisées + cadenas).
    const verrou = state.mode === 'tutorial' && !tutorielPermet(state, { type: 'buy', id });
    const deja = p.upgrades.includes(id);
    const plein = p.upgrades.length >= MAX_UPGRADES_PAR_PIECE;
    const statPlafond = u.cat === 'S'
      && !p.upgrades.some(estAmeliorationStat)
      && ((state.statUpgradesCount || [0, 0])[p.owner] || 0) >= MAX_STATS_PAR_JOUEUR;
    const abordable = solde >= u.cout;
    const learnVerrou = state.mode === 'learn'
      && !learnPermet(state, { type: 'buy', id });
    const achetable = !bientot && !verrou && !learnVerrou && !deja && !plein && !statPlafond && abordable;
    const learnButtonDisabled = state.mode === 'learn' && !achetable;
    const premium = u.cout >= 12;            // tier « carte chère » (DA §11.1.b) — signal de rareté
    const h = 62;
    const dx = (trembler && state.buzzId === id) ? (Math.random() * 6 - 3) : 0;
    const cx0 = x + dx;

    // Hitbox : toute la carte (w×62). Inchangée par rapport au code corrigé (commit e2fb50be) ;
    // la pastille de coût déborde au-dessus de cette zone mais reste purement décorative
    // (le clic d'achat se fait sur le corps de la carte). Le clic est refusé (buzz) côté acheter().
    state.ui.buttons.push({ x: cx0, y, w, h, action: { kind: 'buy', id }, enabled: !learnButtonDisabled, radius: 8 });

    // Fond de carte selon l'état (priorité : bientôt/verrou > achetée > premium > standard, DA §11.1).
    let bg;
    if (bientot || verrou || statPlafond) bg = UI_THEME.disabled;
    else if (deja) bg = UI_THEME.panelAlt;
    else if (premium) bg = abordable ? UI_THEME.card : UI_THEME.disabled; // grisé chaud
    else bg = abordable ? UI_THEME.card : UI_THEME.disabled;
    carte(ctx, cx0, y, w, h, 8, bg, { shadow: achetable || deja, stroke: null });

    // Contour selon l'état (un seul, dans l'ordre de priorité DA §11.1).
    if (deja) {
      // Achetée : contour Sauge Foncé 2 px (prime sur le cadre doré).
      ctx.lineWidth = 2; ctx.strokeStyle = UI_THEME.primaryDark;
      roundRect(ctx, cx0, y, w, h, 8); ctx.stroke();
    } else if (premium) {
      // Cadre premium doré 3 px + double liseré UI 1 px inset (DA §11.1.b).
      ctx.lineWidth = 3; ctx.strokeStyle = UI_THEME.amber;
      roundRect(ctx, cx0, y, w, h, 8); ctx.stroke();
      ctx.lineWidth = 1; ctx.strokeStyle = UI_THEME.border;
      roundRect(ctx, cx0 + 2, y + 2, w - 4, h - 4, 6); ctx.stroke();
    } else {
      // Standard : liseré discret 1 px.
      ctx.lineWidth = 1; ctx.strokeStyle = UI_THEME.border;
      roundRect(ctx, cx0, y, w, h, 8); ctx.stroke();
    }

    // Liseré de catégorie (bord gauche) épaissi à 8 px (DA §11.1.a). Sauge Foncé si achetée.
    ctx.fillStyle = deja ? UI_THEME.primaryDark : COULEUR_CAT[u.cat];
    roundRect(ctx, cx0, y, 8, h, 4); ctx.fill();

    // Nom + description (décalés à droite du liseré 8 px).
    ctx.fillStyle = (achetable || deja) && !bientot ? UI_THEME.text : UI_THEME.disabledText;
    ctx.font = `12px ${F_DISPLAY}`; ctx.textAlign = 'left'; ctx.textBaseline = 'top';
    ctx.fillText(traduire(u.nom, state.language).toUpperCase(), cx0 + 18, y + 8);
    ctx.fillStyle = UI_THEME.muted; ctx.font = `11px ${F_TEXTE}`;
    wrapText(ctx, traduire(u.desc, state.language), cx0 + 18, y + 28, w - 52, 14);

    // Carte « bientôt » : pas de pastille, juste un libellé neutre (DA §11.1, pas de premium).
    if (bientot) {
      ctx.textAlign = 'right'; ctx.font = `700 13px ${F_TEXTE}`; ctx.fillStyle = UI_THEME.disabledText;
      ctx.fillText(traduire('bientôt', state.language), cx0 + w - 10, y + 8);
    } else if (verrou) {
      // Carte verrouillée par l'étape du tutoriel : cadenas à la place de la pastille.
      ctx.textAlign = 'right'; ctx.font = `700 13px ${F_TEXTE}`; ctx.fillStyle = UI_THEME.disabledText;
      ctx.fillText('🔒', cx0 + w - 10, y + 8);
    } else {
      // Pastille de coût / badge médaille, chevauchant le bord supérieur (DA §11.1.c/d).
      const pcx = cx0 + w - 20, pcy = y + 17, pr = 15;
      let pFill, pTexte, pTexteColor;
      if (deja) {
        pFill = UI_THEME.primary; pTexte = '✓'; pTexteColor = UI_THEME.text; // badge médaille (DA §11.1.d)
      } else {
        pFill = premium ? UI_THEME.amber : COULEUR_CAT[u.cat];             // doré si premium (DA §11.1.c)
        pTexte = String(u.cout);
        pTexteColor = abordable ? UI_THEME.text : UI_THEME.danger;     // Terracotta si solde insuffisant
      }
      ctx.beginPath(); ctx.arc(pcx, pcy, pr, 0, Math.PI * 2);
      ctx.fillStyle = pFill; ctx.fill();
      ctx.lineWidth = 2; ctx.strokeStyle = UI_THEME.border; ctx.stroke();
      // Texte : Archivo Black 13 px, liseré Encre 1 px puis remplissage (lisible sur tout fond).
      ctx.font = `13px ${F_DISPLAY}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.lineWidth = 1; ctx.lineJoin = 'round'; ctx.strokeStyle = UI_THEME.border;
      ctx.strokeText(pTexte, pcx, pcy + 1);
      ctx.fillStyle = pTexteColor; ctx.fillText(pTexte, pcx, pcy + 1);
    }
    // Tutoriel : surbrillance pulsée + flèche sur la carte que l'étape fait acheter.
    if (hintTuto && hintTuto.buyId === id) {
      pulseRect(ctx, cx0, y, w, h, now);
      ctx.save();
      // Flèche pointant vers la carte
      ctx.fillStyle = UI_THEME.amber;
      ctx.beginPath();
      ctx.moveTo(cx0 - 14, y + h / 2);
      ctx.lineTo(cx0 - 3, y + h / 2 - 7);
      ctx.lineTo(cx0 - 3, y + h / 2 + 7);
      ctx.closePath(); ctx.fill();
      // Contour de la flèche
      ctx.lineWidth = 1.5; ctx.strokeStyle = UI_THEME.border;
      ctx.beginPath();
      ctx.moveTo(cx0 - 14, y + h / 2);
      ctx.lineTo(cx0 - 3, y + h / 2 - 7);
      ctx.lineTo(cx0 - 3, y + h / 2 + 7);
      ctx.closePath(); ctx.stroke();
      ctx.restore();
    }
    y += h + 14; // gouttière élargie : laisse la pastille de la carte suivante déborder proprement
  }
  return y;
}

// Dessine une couronne plate procédurale (DA §11.5), centrée en (ccx) avec la base
// posée à socleY. Silhouette classique : socle + 3 pointes + joyaux.
function dessineCouronne(ctx, ccx, socleY) {
  const socleH = 14;
  const bas = socleY + socleH;
  ctx.beginPath();
  ctx.moveTo(ccx - 26, bas);            // bas-gauche du socle
  ctx.lineTo(ccx + 26, bas);            // bas-droit
  ctx.lineTo(ccx + 26, socleY);         // remonte côté droit
  ctx.lineTo(ccx + 17, socleY - 12);    // pointe droite
  ctx.lineTo(ccx + 9, socleY);          // creux droit
  ctx.lineTo(ccx, socleY - 20);         // pointe centrale (plus haute)
  ctx.lineTo(ccx - 9, socleY);          // creux gauche
  ctx.lineTo(ccx - 17, socleY - 12);    // pointe gauche
  ctx.lineTo(ccx - 26, socleY);         // redescend côté gauche
  ctx.closePath();
  ctx.fillStyle = C_AMBRE; ctx.fill();
  ctx.lineWidth = 2; ctx.strokeStyle = C_ENCRE; ctx.lineJoin = 'round'; ctx.stroke();
  // Joyaux (petits disques Doré Clair) au sommet de chaque pointe.
  for (const [jx, jy] of [[ccx - 17, socleY - 12], [ccx, socleY - 20], [ccx + 17, socleY - 12]]) {
    ctx.beginPath(); ctx.arc(jx, jy, 3, 0, Math.PI * 2);
    ctx.fillStyle = C_AMBRE_CLAIR; ctx.fill();
    ctx.lineWidth = 1.5; ctx.strokeStyle = UI_THEME.border; ctx.stroke();
  }
}

// Panneau modal de promotion (GDD §5.1.b) : le pion a atteint la dernière rangée,
// le joueur choisit sa nouvelle pièce AVANT que le coup ne parte (une seule émission
// réseau). Un clic hors du panneau annule (géré côté main.js, mousedown).
function dessinePromotion(ctx, state, now) {
  const promo = state.promo;
  if (!promo) return;

  // Voile sombre : signale le modal, le plateau reste lisible dessous.
  ctx.fillStyle = UI_THEME.overlay;
  ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);

  const TILE = 78, GAP = 12, PAD = 24;
  const types = [
    { t: 'Q', nom: 'Dame' },
    { t: 'R', nom: 'Tour' },
    { t: 'B', nom: 'Fou' },
    { t: 'N', nom: 'Cavalier' },
  ];
  const W = PAD * 2 + types.length * TILE + (types.length - 1) * GAP;
  const H = 118 + TILE;
  const x0 = OX + (__BOARD_W - W) / 2;
  const y0 = OY + (__BOARD_H - H) / 2;

  carte(ctx, x0, y0, W, H, 14, UI_THEME.panel);

  ctx.fillStyle = UI_THEME.text;
  ctx.font = `20px ${F_DISPLAY}`;
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText(traduire('PROMOTION', state.language), x0 + W / 2, y0 + 30);
  ctx.fillStyle = UI_THEME.subtext;
  ctx.font = `600 12px ${F_TEXTE}`;
  ctx.fillText(traduire('Choisissez la nouvelle pièce du pion', state.language), x0 + W / 2, y0 + 52);

  // 4 tuiles de choix : sprite réel de la pièce (au skin/camp VISUEL du joueur).
  types.forEach((choix, i) => {
    const bx = x0 + PAD + i * (TILE + GAP);
    const by = y0 + 70;
    carte(ctx, bx, by, TILE, TILE, 10, UI_THEME.card, { shadow: false });
    state.ui.buttons.push({ x: bx, y: by, w: TILE, h: TILE,
      action: { kind: 'promoChoice', t: choix.t }, enabled: true, radius: 10 });
    dessinePiece(ctx, state, {
      type: choix.t, owner: promo.piece.owner, upgrades: [], shield: false,
      sacrificeArmed: false, cooldowns: {},
    }, bx + TILE / 2, by + TILE / 2 - 6, now);
    ctx.fillStyle = UI_THEME.subtext;
    ctx.font = `700 10px ${F_TEXTE}`;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(traduire(choix.nom, state.language).toUpperCase(), bx + TILE / 2, by + TILE - 9);
  });

  // ✕ annuler (coin haut droit) — rend la sélection sans jouer le coup.
  const cx = x0 + W - 30, cy = y0 + 10, cs = 20;
  state.ui.buttons.push({ x: cx, y: cy, w: cs, h: cs,
    action: { kind: 'promoCancel' }, enabled: true, radius: cs / 2 });
  ctx.fillStyle = UI_THEME.danger;
  ctx.font = `700 15px ${F_TEXTE}`;
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText('✕', cx + cs / 2, cy + cs / 2);
}

function dessineGameOver(ctx, state, now) {
  const cx = OX + __BOARD_W / 2, cy = OY + __BOARD_H / 2;
  // Voile de fond (inchangé, DA §11.5).
  ctx.fillStyle = UI_THEME.overlay;
  ctx.fillRect(OX, OY, __BOARD_W, __BOARD_H);

  // Bloc trophées : depuis W3, EXCLUSIVEMENT en PvP en ligne (le PvAI n'écrit rien —
  // QA-PVW-18). state.trophy est posé par reporterResultatPvP (pending → résolu).
  const tr = state.trophy;
  const pvw = state.mode === 'pvw' && state.pvw;
  // Les trophées sont réservés au PvP public classé Standard × 8×8.
  // Les parties privées, variantes, 8×15 et Bonus restent jouables sans afficher
  // ni calculer de trophées sur l'écran de victoire.
  const rankedPvw = !!(pvw && state.pvw.ranked);
  const voided = !!(rankedPvw && state.pvw.voided);      // match annulé (désync, §3.4)
  const showTrophy = rankedPvw && !voided && tr && !tr.pending;
  const pendingTrophy = rankedPvw && !voided && tr && tr.pending;
  const guestEph = false;                               // PvP = compte requis, jamais éphémère

  // Panneau centré, cadre Doré 3 px (DA §11.5). Hauteur adaptée au contenu.
  const hasReplay = !!state.replay;
  const mobile = finEcranMobile(state);
  const pw = largeurPanneauFin(state, 380);
  // Version mobile plus compacte : la largeur, les espacements et la hauteur de
  // chaque bouton sont réduits, mais les cibles restent suffisamment grandes pour
  // le tactile (40 px de haut minimum).
  let ph = mobile ? 184 : 210;
  if (showTrophy || pendingTrophy || voided) ph += mobile ? 48 : 60;
  /* replay button moved to bottom-right of canvas — no extra panel height needed */
  if (pvw && !voided) ph += mobile ? 48 : 56;            // bouton Revanche
  if (pvw) ph += mobile ? 48 : 56;                       // bouton Nouvelle partie (aussi si voided)
  const px = cx - pw / 2, py = cy - ph / 2;
  carte(ctx, px, py, pw, ph, 14, UI_THEME.panel, { shadow: true, stroke: null });
  ctx.lineWidth = 3; ctx.strokeStyle = C_AMBRE;
  roundRect(ctx, px, py, pw, ph, 14); ctx.stroke();

  // Couronne centrée sur le bord supérieur du panneau (moitié dépasse, DA §11.5).
  dessineCouronne(ctx, cx, py - 17);

  // Nom du vainqueur : taille réduite sur téléphone pour préserver les marges.
  ctx.font = `${mobile ? 26 : 32}px ${F_DISPLAY}`;
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.lineWidth = 1.5; ctx.lineJoin = 'round'; ctx.strokeStyle = C_ENCRE;
  // PvP en ligne : nom du vainqueur = « Toi » / pseudo adverse ; nulle possible (§6.3).
  // (pvw déjà calculé plus haut pour le gating du bloc trophée.)
  let titre, titreColor;
  if (state.winner === null) {
    titre = 'ÉGALITÉ'; titreColor = C_ENCRE;
  } else if (pvw) {
    titre = state.winner === state.pvw.side
      ? `${traduire('TU GAGNES !', state.language)}`
      : `${(state.pvw.oppPseudo || traduire('Adversaire', state.language)).toUpperCase()} ${traduire('GAGNE !', state.language)}`;
    // Couleur VISUELLE : si je gagne, la couleur annoncée est celle de MES pièces à l'écran.
    titreColor = ACCENT[campVisuel(state, state.winner)];
  } else {
    titre = `${traduire(NOM_JOUEUR[state.winner], state.language).toUpperCase()} ${traduire('GAGNE !', state.language)}`;
    titreColor = ACCENT[campVisuel(state, state.winner)];
  }
  const titreY = py + (mobile ? 38 : 48);
  ctx.strokeText(titre, cx, titreY);
  ctx.fillStyle = titreColor;
  ctx.fillText(titre, cx, titreY);

  // Sous-texte selon la cause de fin.
  ctx.fillStyle = UI_THEME.muted; ctx.font = `${mobile ? 12 : 15}px ${F_TEXTE}`;
  let soustexte = 'Roi capturé';
  if (voided) soustexte = 'Partie annulée';
  else if (pvw && state.pvw.endReason === 'time') soustexte = state.winner === null ? 'Égalité au temps (départage)' : 'Victoire au temps (départage)';
  else if (pvw && state.pvw.endReason === 'resign') soustexte = 'Abandon';
  else if (pvw && state.pvw.endReason === 'abandon') soustexte = 'Victoire locale — résultat non classé';
  ctx.fillText(traduire(soustexte, state.language), cx, py + (mobile ? 70 : 84));

  // --- Bloc central : trophée (PvP), calcul en cours, ou annulation ---
  const midY = py + (mobile ? 98 : 116);
  if (voided) {
    ctx.fillStyle = UI_THEME.danger; ctx.font = `14px ${F_TEXTE}`;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(traduire('Désynchronisation détectée — aucun trophée attribué.', state.language), cx, midY);
  } else if (pendingTrophy) {
    ctx.fillStyle = UI_THEME.muted; ctx.font = `14px ${F_TEXTE}`;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    const dots = ['.', '..', '...'][Math.floor(now / 400) % 3];
    ctx.fillText(`${traduire('Calcul des trophées', state.language)}${dots}`, cx, midY);
  } else if (showTrophy) {
    dessineBlocTrophee(ctx, state, cx, midY, guestEph, now);
  }

  // --- Boutons empilés depuis le bas ---
  // Sur téléphone, les dimensions suivent la largeur utile du panneau et gardent
  // une cible tactile confortable. Le desktop conserve exactement ses valeurs.
  const endButtonH = mobile ? 40 : 46;
  const endButtonStep = mobile ? 48 : 54;
  const endButtonMaxW = Math.max(0, pw - 32);
  const endButtonW = (desktopW) => mobile ? Math.min(desktopW, endButtonMaxW) : desktopW;
  const endButtonX = (width) => cx - width / 2;
  const splitButtonGap = mobile ? 8 : 12;
  const splitButtonW = mobile ? Math.floor((endButtonMaxW - splitButtonGap) / 2) : 124;
  const splitButtonX = (side) => cx - (splitButtonW * 2 + splitButtonGap) / 2
    + (side === 1 ? splitButtonW + splitButtonGap : 0);
  let btnY = py + ph - (mobile ? 50 : 58);
  // Bouton principal : retour au menu (tous modes).
  const mainButtonW = endButtonW(200);
  bouton(state, ctx, endButtonX(mainButtonW), btnY, mainButtonW, endButtonH, pvw ? 'Menu' : 'Nouvelle partie',
    { kind: 'restart' }, { color: pvw ? UI_THEME.card : UI_THEME.amber, textColor: pvw ? UI_THEME.text : UI_THEME.buttonText });

  // Bouton « Nouvelle partie » (PvP uniquement) : enchaîner une recherche publique sans
  // repasser par le menu/lobby. Présent aussi si le match est annulé (voided) — même besoin.
  // Désactivé si une revanche est en cours de lancement (évite un double départ).
  if (pvw) {
    btnY -= endButtonStep;
    const rmLaunching = !!(state.pvw.rematch && state.pvw.rematch.launching);
    const wideButtonW = endButtonW(260);
    bouton(state, ctx, endButtonX(wideButtonW), btnY, wideButtonW, endButtonH, '🔍 Nouvelle partie', { kind: 'newSearchOnline' },
      { color: UI_THEME.primary, textColor: UI_THEME.text, sub: 'chercher un autre adversaire', enabled: !rmLaunching });
  }

  // Revanche PvP (partie en ligne) : proposition sortante ou notification
  // entrante avec décision explicite du deuxième joueur.
  if (pvw && !voided) {
    const rm = state.pvw.rematch || {};
    if (rm.incomingOffer) {
      btnY -= endButtonStep;
      ctx.fillStyle = UI_THEME.amber;
      ctx.font = `700 14px ${F_TEXTE}`;
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(`${state.pvw.oppPseudo || traduire('Adversaire', state.language)} ${traduire('propose une revanche', state.language)}`, cx, btnY - 20);
      bouton(state, ctx, splitButtonX(0), btnY, splitButtonW, endButtonH, '✓ Accepter', { kind: 'acceptRematch' },
        { color: UI_THEME.amber, textColor: UI_THEME.buttonText, sub: 'couleurs inversées' });
      bouton(state, ctx, splitButtonX(1), btnY, splitButtonW, endButtonH, '✕ Refuser', { kind: 'declineRematch' },
        { color: UI_THEME.card, textColor: UI_THEME.text, sub: 'rester au menu' });
    } else {
      btnY -= endButtonStep;
      const rematchButtonW = endButtonW(260);
      if (rm.expired || rm.declined) {
        bouton(state, ctx, endButtonX(rematchButtonW), btnY, rematchButtonW, endButtonH, rm.declined ? 'Revanche refusée' : 'Adversaire parti', { kind: 'noop' },
          { enabled: false });
      } else if (rm.launching) {
        bouton(state, ctx, endButtonX(rematchButtonW), btnY, rematchButtonW, endButtonH, 'Revanche en cours…', { kind: 'noop' },
          { enabled: false });
      } else if (rm.offeredByMe) {
        bouton(state, ctx, endButtonX(rematchButtonW), btnY, rematchButtonW, endButtonH, 'En attente de l\'adversaire…', { kind: 'noop' },
          { enabled: false });
      } else {
        bouton(state, ctx, endButtonX(rematchButtonW), btnY, rematchButtonW, endButtonH, '🔁 Revanche', { kind: 'rematch' },
          { color: UI_THEME.amber, textColor: UI_THEME.buttonText, sub: 'couleurs inversées' });
      }
    }
  }

  // Bouton replay : ancré en bas à droite du canvas (indépendant de la taille du plateau).
  if (hasReplay) {
    const replayW = mobile ? Math.min(195, Math.max(0, CANVAS_W - 32)) : 195;
    const replayH = mobile ? 44 : 34;
    const rpx = mobile ? CANVAS_W - replayW - 16 : CANVAS_W - 210;
    const rpy = mobile ? CANVAS_H - replayH - 12 : CANVAS_H - 48;
    bouton(state, ctx, rpx, rpy, replayW, replayH, '📥 Replay (.md)',
      { kind: 'downloadReplay' },
      { color: UI_THEME.card, textColor: UI_THEME.text });
  }
}

// Bannière de reconnexion (§7.2) : l'adversaire a disparu, fenêtre de 30 s avant
// victoire par abandon. Bandeau semi-opaque en haut du plateau + barre décroissante.
function dessineReconnexionPvw(ctx, state, now) {
  const p = state.pvw;
  const restant = Math.max(0, 30 - (now - p.oppDcT0) / 1000);
  const bw = __BOARD_W - 40, bx = OX + 20, by = OY + __BOARD_H / 2 - 34, bh = 68;
  ctx.save();
  ctx.fillStyle = UI_THEME.overlay;
  roundRect(ctx, bx, by, bw, bh, 12); ctx.fill();
  ctx.lineWidth = 2; ctx.strokeStyle = UI_THEME.danger;
  roundRect(ctx, bx, by, bw, bh, 12); ctx.stroke();
  const nom = (p.oppPseudo || 'Adversaire');
  ctx.fillStyle = UI_THEME.text; ctx.font = `15px ${F_DISPLAY}`;
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText(`${nom} ${traduire('déconnecté', state.language)}`.toUpperCase(), bx + bw / 2, by + 20);
  ctx.fillStyle = UI_THEME.muted; ctx.font = `13px ${F_TEXTE}`;
  ctx.fillText(`${traduire('Reprise possible', state.language)} — ${Math.ceil(restant)} s`, bx + bw / 2, by + 40);
  // Barre décroissante.
  const barW = bw - 40, barX = bx + 20, barY = by + bh - 14;
  ctx.fillStyle = UI_THEME.border;
  roundRect(ctx, barX, barY, barW, 5, 2.5); ctx.fill();
  ctx.fillStyle = C_TERRACOTTA;
  roundRect(ctx, barX, barY, barW * (restant / 30), 5, 2.5); ctx.fill();
  ctx.restore();
}

// Bloc trophée de l'écran de fin (spec §3.3) : ligne delta ±N 🏆 animée (~600 ms,
// ambre gain / terracotta perte) + total en dessous (tween 400 ms). baseY = ligne du delta.
// NOTE 2026-07-09 : plus déclenché en PvAI (hookTrophees débranché, state.trophy reste
// undefined). Conservé pour le futur écran de fin PvP en ligne (spec-pvp-online).
function dessineBlocTrophee(ctx, state, cx, baseY, guestEph, now) {
  const tr = state.trophy;
  const age = now - tr.t0;
  const gain = tr.delta >= 0;

  // Résultat NON écrit (PvP : contesté, réseau KO, ou adversaire n'a pas rapporté) :
  // pas de delta animé — message neutre, aucun trophée perdu/gagné (§3.5).
  if (tr.applied === false) {
    ctx.fillStyle = UI_THEME.muted; ctx.font = `14px ${F_TEXTE}`;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    let m = 'Trophées non modifiés';
    if (tr.disputed) m = 'Résultat contesté — trophées non modifiés';
    else if (tr.status === 'pending') m = 'En attente du rapport adverse…';
    else m = 'Hors ligne — trophées non sauvegardés';
    ctx.fillText(m, cx, baseY);
    ctx.fillStyle = UI_THEME.disabledText; ctx.font = `13px ${F_TEXTE}`;
    ctx.fillText(`${traduire('Trophées', state.language)} : ${tr.total != null ? tr.total : tr.prev}`, cx, baseY + 24);
    return;
  }

  // --- Delta : intro rise (+12 px) + fade-in sur 600 ms, puis reste affiché. ---
  const k = Math.min(1, age / 600);
  const ease = k * k * (3 - 2 * k);
  const dy = (1 - ease) * 12;           // part 12 px plus bas, remonte en place
  const alpha = ease;
  const sk = Math.min(1, age / 90);     // léger overshoot d'échelle (~90 ms)
  const scale = 1.25 - 0.25 * sk;
  const txt = `${gain ? '+' : '−'}${Math.abs(tr.delta)} 🏆`;
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.translate(cx, baseY + dy);
  ctx.scale(scale, scale);
  ctx.font = `26px ${F_DISPLAY}`;
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.lineWidth = 2; ctx.lineJoin = 'round'; ctx.strokeStyle = C_ENCRE;
  ctx.strokeText(txt, 0, 0);
  ctx.fillStyle = gain ? C_AMBRE : C_TERRACOTTA;
  ctx.fillText(txt, 0, 0);
  ctx.restore();

  // --- Total : tween de l'ancien vers le nouveau sur 400 ms. ---
  const kt = Math.min(1, age / 400);
  const shown = Math.round(tr.prev + (tr.total - tr.prev) * kt);
  ctx.fillStyle = UI_THEME.muted; ctx.font = `14px ${F_TEXTE}`;
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  const note = tr.error ? '  (hors ligne, non sauvegardé)' : '';
  ctx.fillText(`${traduire('Trophées', state.language)} : ${shown}${note}`, cx, baseY + 30);
}

// --- Helpers d'affichage ---
function nomType(t, lang) {
  const name = { P: 'Pion', N: 'Cavalier', B: 'Fou', R: 'Tour', Q: 'Dame', K: 'Roi' }[t];
  return traduire(name, lang);
}
// Accord singulier/pluriel du mot « écu ».
function ecusLabel(n) {
  return n + (Math.abs(n) <= 1 ? ' écu' : ' écus');
}
function valeurAffichee(p) {
  // Forteresse fait passer la tour à 8 pts (GDD §6).
  if (p.type === 'R' && p.upgrades.includes('forteresse')) return 8;
  return VALEUR_PIECE[p.type];
}
function wrapText(ctx, text, x, y, maxW, lh) {
  const mots = text.split(' ');
  let ligne = '';
  for (const mot of mots) {
    const test = ligne ? ligne + ' ' + mot : mot;
    if (ctx.measureText(test).width > maxW && ligne) { ctx.fillText(ligne, x, y); y += lh; ligne = mot; }
    else ligne = test;
  }
  if (ligne) ctx.fillText(ligne, x, y);
}
// Comme wrapText mais retourne le nombre de lignes dessinées (utile pour calculer y).
function wrapTextLines(ctx, text, x, y, maxW, lh) {
  const mots = text.split(' ');
  let ligne = '', count = 0;
  for (const mot of mots) {
    const test = ligne ? ligne + ' ' + mot : mot;
    if (ctx.measureText(test).width > maxW && ligne) { ctx.fillText(ligne, x, y); y += lh; ligne = mot; count++; }
    else ligne = test;
  }
  if (ligne) { ctx.fillText(ligne, x, y); count++; }
  return count;
}

// Version bornée pour les cartes compactes : évite qu'une description longue
// déborde du cadre lorsque la typographie est agrandie.
function wrapTextLimite(ctx, text, x, y, maxW, lh, maxLines = 2) {
  const mots = String(text || '').split(/\s+/).filter(Boolean);
  const lignes = [];
  let ligne = '';
  for (const mot of mots) {
    const test = ligne ? `${ligne} ${mot}` : mot;
    if (ctx.measureText(test).width > maxW && ligne) {
      lignes.push(ligne);
      ligne = mot;
    } else {
      ligne = test;
    }
  }
  if (ligne) lignes.push(ligne);
  const visibles = lignes.slice(0, maxLines);
  const tronquee = lignes.length > maxLines;
  if (tronquee && visibles.length) {
    let derniere = visibles[visibles.length - 1];
    while (derniere.length > 1 && ctx.measureText(`${derniere}…`).width > maxW) {
      derniere = derniere.slice(0, -1).trimEnd();
    }
    visibles[visibles.length - 1] = `${derniere}…`;
  }
  visibles.forEach((ligneVisible, i) => ctx.fillText(ligneVisible, x, y + i * lh));
  return visibles.length;
}

// Menu hamburger (coin haut droit) : regroupe Compte / Apparence / Langues pour
// libérer le coin droit (demande utilisateur 31/07). Un bouton « 3 traits » ouvre
// un PANNEAU LATÉRAL (drawer) glissant depuis le bord droit, avec voile (scrim).
// Les formulaires (email / code / pseudo) restent gérés en DOM (overlay).
// S'ouvre via { kind: 'toggleHamburger' } ; se ferme au clic sur le scrim ou Échap.
function mobileWrap(ctx, text, x, y, maxWidth, lineHeight, maxLines = 4) {
  const words = String(text || '').split(/\s+/);
  let line = '';
  let lines = 0;
  for (const word of words) {
    const candidate = line ? `${line} ${word}` : word;
    if (ctx.measureText(candidate).width > maxWidth && line) {
      ctx.fillText(line, x, y + lines * lineHeight);
      lines++;
      if (lines >= maxLines) return lines * lineHeight;
      line = word;
    } else {
      line = candidate;
    }
  }
  if (line && lines < maxLines) {
    ctx.fillText(line, x, y + lines * lineHeight);
    lines++;
  }
  return lines * lineHeight;
}

function mobileCard(ctx, x, y, w, h, fill = UI_THEME.panel, radius = 16) {
  ctx.save();
  ctx.shadowColor = UI_THEME.shadow;
  ctx.shadowBlur = 12;
  ctx.shadowOffsetY = 3;
  ctx.fillStyle = fill;
  roundRect(ctx, x, y, w, h, radius); ctx.fill();
  ctx.restore();
  ctx.lineWidth = 1;
  ctx.strokeStyle = UI_THEME.border;
  roundRect(ctx, x, y, w, h, radius); ctx.stroke();
}

function mobileText(ctx, text, x, y, font, color = UI_THEME.text, align = 'left', baseline = 'middle') {
  ctx.fillStyle = color;
  ctx.font = font;
  ctx.textAlign = align;
  ctx.textBaseline = baseline;
  ctx.fillText(traduire(text), x, y);
}

function mobileButton(state, ctx, x, y, w, h, label, action, options = {}) {
  bouton(state, ctx, x, y, w, h, traduire(label), action, options);
}

function dessineBandeauCompteMobile(ctx, state) {
  // Le buffer physique peut être multiplié par le DPR ; le layout reste logique.
  const W = CANVAS_W;
  const H = CANVAS_H;
  const acc = state.account || { status: 'guest' };
  const language = state.language === 'en' ? 'en' : 'fr';
  const opened = !!(state.ui && state.ui.hamburgerOpen);
  const size = 44;
  const right = W - 16;
  const top = 16;
  const hb = enregistrerBouton(state, right - size, top, size, size,
    { kind: 'toggleHamburger' }, true, true, 12);

  if (opened) {
    const px = 12, py = 12, pw = W - 24, ph = H - 24, pad = 16;
    ctx.fillStyle = 'rgba(10, 11, 13, 0.50)';
    ctx.fillRect(0, 0, W, H);
    if (state.ui) state.ui.hamburgerPanel = { x: px, y: py, w: pw, h: ph };
    mobileCard(ctx, px, py, pw, ph, UI_THEME.panel, 18);

    mobileText(ctx, 'MENU', px + pw / 2, py + 27, `16px ${F_DISPLAY}`, UI_THEME.text, 'center');
    ctx.strokeStyle = UI_THEME.border;
    ctx.beginPath(); ctx.moveTo(px + pad, py + 49); ctx.lineTo(px + pw - pad, py + 49); ctx.stroke();

    const tab = state.ui.drawerTab || 'account';
    const tabs = [['account', 'Compte'], ['appearance', 'Apparence'], ['language', 'Langues'], ['about', 'À propos']];
    const tabGap = 6;
    const tabW = (pw - 2 * pad - tabGap) / 2;
    tabs.forEach(([id, label], index) => {
      const tx = px + pad + (index % 2) * (tabW + tabGap);
      const ty = py + 62 + Math.floor(index / 2) * 36;
      const selected = tab === id;
      enregistrerBouton(state, tx, ty, tabW, 30,
        { kind: 'selectDrawerTab', tab: id }, true, true, 9);
      ctx.fillStyle = selected ? UI_THEME.wine : UI_THEME.card;
      roundRect(ctx, tx, ty, tabW, 30, 9); ctx.fill();
      ctx.lineWidth = selected ? 2 : 1;
      ctx.strokeStyle = selected ? UI_THEME.amber : UI_THEME.border;
      roundRect(ctx, tx, ty, tabW, 30, 9); ctx.stroke();
      mobileText(ctx, label.toUpperCase(), tx + tabW / 2, ty + 15, `700 9px ${F_DISPLAY}`,
        selected ? UI_THEME.buttonText : UI_THEME.text, 'center');
    });

    const contentY = py + 150;
    if (tab === 'account') {
      mobileText(ctx, 'Compte', px + pad, contentY, `700 11px ${F_DISPLAY}`, UI_THEME.muted);
      if (acc.status === 'connected') {
        mobileText(ctx, `♟ ${(acc.pseudo || '').toUpperCase()}`, px + pad, contentY + 34, `15px ${F_DISPLAY}`);
        mobileText(ctx, `🏆 ${acc.trophies || 0}`, px + pw - pad, contentY + 34, `14px ${F_DISPLAY}`, UI_THEME.amberDark, 'right');
        const email = String(acc.email || '');
        const [local, domain] = email.split('@');
        const masked = local && domain ? `${local.slice(0, Math.min(2, local.length))}•••@${domain}` : (email || '—');
        mobileText(ctx, `${traduire('Email', language)} : ${masked}`, px + pad, contentY + 62, `10px ${F_TEXTE}`, UI_THEME.muted);
        mobileText(ctx, `${traduire('Statut', language)} : ${traduire('Compte connecté', language)}`,
          px + pad, contentY + 82, `10px ${F_TEXTE}`, UI_THEME.muted);
        mobileButton(state, ctx, px + pad, contentY + 106, (pw - 2 * pad - 8) / 2, 32,
          'Déconnexion', { kind: 'logout' }, { color: UI_THEME.card, textColor: UI_THEME.text });
        mobileButton(state, ctx, px + pad + (pw - 2 * pad + 8) / 2, contentY + 106,
          (pw - 2 * pad - 8) / 2, 32, '2FA', { kind: 'mfa' },
          { color: UI_THEME.primary, textColor: UI_THEME.text });
      } else {
        mobileButton(state, ctx, px + pad, contentY + 28, pw - 2 * pad, 40,
          'Connexion', { kind: 'login' }, { color: UI_THEME.primary, textColor: UI_THEME.text });
        mobileText(ctx, `${traduire('Statut', language)} : ${traduire('Mode invité', language)}`,
          px + pad, contentY + 88, `10px ${F_TEXTE}`, UI_THEME.muted);
      }
    } else if (tab === 'appearance') {
      mobileText(ctx, 'Apparence', px + pad, contentY, `700 11px ${F_DISPLAY}`, UI_THEME.muted);
      ctx.font = `12px ${F_TEXTE}`; ctx.textAlign = 'left'; ctx.textBaseline = 'top';
      ctx.fillStyle = UI_THEME.text;
      ctx.fillText(traduire('Choisis le thème qui te convient.', language), px + pad, contentY + 24);
      const themeLabel = traduire(state.themeMode === 'light' ? '☾ Sombre' : '☀ Clair', language);
      mobileButton(state, ctx, px + pad, contentY + 58, pw - 2 * pad, 38, themeLabel,
        { kind: 'toggleTheme' }, { color: UI_THEME.card, textColor: UI_THEME.text });
    } else if (tab === 'language') {
      mobileText(ctx, 'Langues', px + pad, contentY, `700 11px ${F_DISPLAY}`, UI_THEME.muted);
      ctx.font = `12px ${F_TEXTE}`; ctx.textAlign = 'left'; ctx.textBaseline = 'top';
      ctx.fillStyle = UI_THEME.text;
      ctx.fillText(traduire('Choisis la langue de l’interface.', language), px + pad, contentY + 24);
      [['fr', 'Français'], ['en', 'English']].forEach(([code, label], index) => {
        const yy = contentY + 58 + index * 44;
        enregistrerBouton(state, px + pad, yy, pw - 2 * pad, 36,
          { kind: 'setLanguage', code }, true, true, 10);
        ctx.fillStyle = language === code ? UI_THEME.field : UI_THEME.card;
        roundRect(ctx, px + pad, yy, pw - 2 * pad, 36, 10); ctx.fill();
        ctx.lineWidth = language === code ? 2 : 1;
        ctx.strokeStyle = language === code ? UI_THEME.amberDark : UI_THEME.border;
        roundRect(ctx, px + pad, yy, pw - 2 * pad, 36, 10); ctx.stroke();
        mobileText(ctx, label, px + pad + 12, yy + 18, `13px ${F_TEXTE}`);
        if (language === code) mobileText(ctx, '✓', px + pw - pad - 14, yy + 18, `14px ${F_DISPLAY}`, UI_THEME.amber, 'right');
      });
    } else {
      mobileText(ctx, 'But du jeu', px + pad, contentY, `700 11px ${F_DISPLAY}`, UI_THEME.muted);
      ctx.font = `12px ${F_TEXTE}`; ctx.textAlign = 'left'; ctx.textBaseline = 'top'; ctx.fillStyle = UI_THEME.text;
      let yy = contentY + 26;
      for (const line of [
        'ROYCHEC est un jeu d’échecs augmenté. Capture le roi adverse pour gagner.',
        'Les améliorations ont trois types : D = déplacement, A = actif, S = statistique. Elles donnent de nouvelles options sans remplacer les règles de base.',
        'Les améliorations de type S sont bloqués à 4 achats par joueur (seulement 4 pièces peuvent avoir un bouclier)',
        'Le maximum d’écus est bloqué à 30 par joueur.',
        'Utilise tes écus dans le panneau « Améliorer » pour acheter une carte compatible avec la pièce. Une pièce peut porter au maximum deux améliorations : choisis ta combinaison.',
      ]) yy += mobileWrap(ctx, traduire(line, language), px + pad, yy, pw - 2 * pad, 17, 4) + 9;
    }
  } else if (state.ui) {
    state.ui.hamburgerPanel = null;
  }

  ctx.save();
  ctx.fillStyle = UI_THEME.card;
  roundRect(ctx, right - size, top + 4, size, size, 12); ctx.fill();
  ctx.fillStyle = UI_THEME.card;
  roundRect(ctx, right - size, top, size, size, 12); ctx.fill();
  ctx.lineWidth = 2.5; ctx.strokeStyle = opened ? UI_THEME.amber : UI_THEME.border;
  roundRect(ctx, right - size, top, size, size, 12); ctx.stroke();
  const cx = right - size / 2, cy = top + size / 2;
  ctx.strokeStyle = UI_THEME.text; ctx.lineWidth = 3; ctx.lineCap = 'round';
  ctx.beginPath();
  if (opened) {
    ctx.moveTo(cx - 9, cy - 7); ctx.lineTo(cx + 9, cy + 7);
    ctx.moveTo(cx + 9, cy - 7); ctx.lineTo(cx - 9, cy + 7);
  } else {
    for (const offset of [-6, 0, 6]) { ctx.moveTo(cx - 9, cy + offset); ctx.lineTo(cx + 9, cy + offset); }
  }
  ctx.stroke();
  ctx.restore();
}

function dessineBandeauCompte(ctx, state) {
  if (state.ui && state.ui.mobileLayout) {
    dessineBandeauCompteMobile(ctx, state);
    return;
  }
  const acc = state.account || { status: 'guest' };
  const right = CANVAS_W - 20;
  const top = 16;
  const taille = 44;
  const ouvert = !!(state.ui && state.ui.hamburgerOpen);
  const themeMode = state.themeMode === 'light' ? 'light' : 'dark';
  const themeLabel = traduire(themeMode === 'dark' ? '☀ Clair' : '☾ Sombre', state.language);
  const language = state.language === 'en' ? 'en' : 'fr';

  // Bouton hamburger ENREGISTRÉ en premier : aucun bouton du panneau ne chevauche
  // son rect (coin haut droit), le hit-test reste donc correct. Il est DESSINÉ en
  // dernier (fin de fonction) pour rester visible par-dessus le drawer quand il est
  // ouvert (croix ✕ au lieu des 3 traits).
  const hb = enregistrerBouton(state, right - taille, top, taille, taille,
    { kind: 'toggleHamburger' }, true, true, 12);

  if (ouvert) {
    // --- PANNEAU LATÉRAL (drawer) : voile + glissement depuis le bord droit ---
    const pw = 280, pad = 16;
    const px = CANVAS_W - pw;   // collé au bord droit
    const py = 12;
    const ph = CANVAS_H - 24;   // presque toute la hauteur
    const connected = acc.status === 'connected';

    // Voile (scrim) : assombrit le menu derrière le drawer. Un clic dessus referme
    // le panneau SANS déclencher l'élément couvert (logique dédiée dans main.js).
    ctx.fillStyle = 'rgba(10, 11, 13, 0.45)';
    ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);

    // Glissement d'ouverture depuis la droite (~260 ms, easeOutCubic). hamburgerT0
    // est posé par main.js au toggle d'ouverture (actionBouton 'toggleHamburger').
    // Horloge du système de motion (ui.frameNow) pour rester cohérent avec les autres
    // animations — fallback performance.now() hors frame de rendu.
    const nowUI = (state.ui && state.ui.frameNow) || performance.now();
    const t0 = (state.ui && state.ui.hamburgerT0) || 0;
    const k = Math.min(1, (nowUI - t0) / 260);
    const ease = 1 - Math.pow(1 - k, 3);
    const dx = px + (1 - ease) * pw;   // x courant du panneau (= px une fois posé)

    // Géométrie COURANTE (x animé) pour le hit-test de fermeture au clic (main.js) :
    // pendant le glissement, la zone couverte par le panneau bouge, donc le scrim
    // suit. Une fois le panneau posé, dx == px.
    if (state.ui) state.ui.hamburgerPanel = { x: dx, y: py, w: pw, h: ph };

    // Corps du panneau.
    carte(ctx, dx, py, pw, ph, 16, UI_THEME.panel, { shadow: true, stroke: UI_THEME.border });

    let y = py + 26;
    // En-tête : MENU + sous-titre.
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillStyle = UI_THEME.text; ctx.font = `16px ${F_DISPLAY}`;
    ctx.fillText(traduire('MENU', language), dx + pw / 2, y);
    y += 15;
    ctx.strokeStyle = UI_THEME.border; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(dx + pad, y); ctx.lineTo(dx + pw - pad, y); ctx.stroke();
    y += 12;

    // Navigation interne : un seul panneau du drawer est visible à la fois.
    const drawerTab = state.ui && state.ui.drawerTab ? state.ui.drawerTab : 'account';
    const tabs = [
      ['account', 'Compte'],
      ['appearance', 'Apparence'],
      ['language', 'Langues'],
      ['about', 'À propos'],
    ];
    const tabGap = 6;
    const tabW = (pw - 2 * pad - tabGap) / 2;
    tabs.forEach(([tab, label], index) => {
      const col = index % 2;
      const row = Math.floor(index / 2);
      const tx = dx + pad + col * (tabW + tabGap);
      const ty = y + row * 38;
      const selected = drawerTab === tab;
      enregistrerBouton(state, tx, ty, tabW, 32,
        { kind: 'selectDrawerTab', tab }, true, true, 9);
      ctx.fillStyle = selected ? UI_THEME.wine : UI_THEME.card;
      roundRect(ctx, tx, ty, tabW, 32, 9); ctx.fill();
      ctx.lineWidth = selected ? 2 : 1;
      ctx.strokeStyle = selected ? UI_THEME.amber : UI_THEME.border;
      roundRect(ctx, tx, ty, tabW, 32, 9); ctx.stroke();
      ctx.fillStyle = selected ? UI_THEME.buttonText : UI_THEME.text;
      ctx.font = `700 10px ${F_DISPLAY}`;
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(traduire(label, language).toUpperCase(), tx + tabW / 2, ty + 16);
    });
    y += 84;

    const entete = (label) => {
      ctx.fillStyle = UI_THEME.muted; ctx.font = `700 11px ${F_DISPLAY}`;
      ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
      ctx.fillText(label.toUpperCase(), dx + pad, y + 10);
      y += 20;
    };

    // --- COMPTE ---
    if (drawerTab === 'account') {
      entete(traduire('Compte', language));
      if (connected) {
        // Informations du compte réellement disponibles côté client.
        ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
        ctx.fillStyle = UI_THEME.text; ctx.font = `15px ${F_DISPLAY}`;
        ctx.fillText(('♟ ' + (acc.pseudo || '')).toUpperCase(), dx + pad, y + 12);
        ctx.textAlign = 'right';
        ctx.fillStyle = UI_THEME.amberDark; ctx.font = `14px ${F_DISPLAY}`;
        ctx.fillText('🏆 ' + (acc.trophies || 0), dx + pw - pad, y + 12);
        y += 28;
        ctx.textAlign = 'left'; ctx.fillStyle = UI_THEME.muted; ctx.font = `10px ${F_TEXTE}`;
        const email = String(acc.email || '');
        const [emailLocal, emailDomain] = email.split('@');
        const emailAffiche = emailLocal && emailDomain
          ? `${emailLocal.slice(0, Math.min(2, emailLocal.length))}•••@${emailDomain}`
          : (email.length > 31 ? `${email.slice(0, 28)}…` : email);
        ctx.fillText(`${traduire('Email', language)} : ${emailAffiche || '—'}`, dx + pad, y + 8);
        y += 18;
        ctx.fillText(`${traduire('Statut', language)} : ${traduire('Compte connecté', language)}`, dx + pad, y + 8);
        y += 24;
        const accountButtonGap = 8;
        const accountButtonW = (pw - 2 * pad - accountButtonGap) / 2;
        bouton(state, ctx, dx + pad, y, accountButtonW, 32, 'Déconnexion', { kind: 'logout' },
          { color: UI_THEME.card, textColor: UI_THEME.text });
        bouton(state, ctx, dx + pad + accountButtonW + accountButtonGap, y,
          accountButtonW, 32, 'Activer la 2FA', { kind: 'mfa' },
          { color: UI_THEME.primary, textColor: UI_THEME.text });
        y += 32;
      } else {
        bouton(state, ctx, dx + pad, y, pw - 2 * pad, 40, 'Connexion', { kind: 'login' },
          { color: UI_THEME.primary, textColor: UI_THEME.text, sub: 'sauvegarde ta progression' });
        y += 40;
        // Compteur RAM éphémère (spec §2.4) : seulement si des trophées ont été gagnés
        // durant la session (perdus au reload).
        if (acc.trophies > 0) {
          ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
          ctx.fillStyle = UI_THEME.disabledText; ctx.font = `10px ${F_TEXTE}`;
          ctx.fillText(`🏆 ${acc.trophies} ${traduire('éphémères — connecte-toi pour sauvegarder', language)}`, dx + pad, y + 8);
          y += 18;
        }
        ctx.textAlign = 'left'; ctx.fillStyle = UI_THEME.muted; ctx.font = `10px ${F_TEXTE}`;
        ctx.fillText(`${traduire('Statut', language)} : ${traduire('Mode invité', language)}`, dx + pad, y + 8);
      }
    }

    // --- APPARENCE ---
    if (drawerTab === 'appearance') {
      entete(traduire('Apparence', language));
      ctx.fillStyle = UI_THEME.text; ctx.font = `12px ${F_TEXTE}`;
      ctx.textAlign = 'left'; ctx.textBaseline = 'top';
      ctx.fillText(traduire('Choisis le thème qui te convient.', language), dx + pad, y + 4);
      y += 30;
      bouton(state, ctx, dx + pad, y, pw - 2 * pad, 36, themeLabel, { kind: 'toggleTheme' },
        { color: UI_THEME.card, textColor: UI_THEME.text });
    }

    // --- LANGUES ---
    if (drawerTab === 'language') {
      entete(traduire('Langues', language));
      ctx.fillStyle = UI_THEME.text; ctx.font = `12px ${F_TEXTE}`;
      ctx.textAlign = 'left'; ctx.textBaseline = 'top';
      ctx.fillText(traduire('Choisis la langue de l’interface.', language), dx + pad, y + 4);
      y += 30;
      const langOptions = [
        ['fr', 'Français'],
        ['en', 'English'],
      ];
      for (const [code, label] of langOptions) {
        const selected = language === code;
        enregistrerBouton(state, dx + pad, y, pw - 2 * pad, 36,
          { kind: 'setLanguage', code }, true, true, 10);
        ctx.fillStyle = selected ? UI_THEME.field : UI_THEME.card;
        roundRect(ctx, dx + pad, y, pw - 2 * pad, 36, 10); ctx.fill();
        ctx.lineWidth = selected ? 2 : 1; ctx.strokeStyle = selected ? UI_THEME.amberDark : UI_THEME.border;
        roundRect(ctx, dx + pad, y, pw - 2 * pad, 36, 10); ctx.stroke();
        ctx.fillStyle = UI_THEME.text; ctx.font = `13px ${F_TEXTE}`;
        ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
        ctx.fillText(traduire(label, language), dx + pad + 12, y + 18);
        if (selected) {
          ctx.fillStyle = UI_THEME.amber; ctx.font = `14px ${F_DISPLAY}`;
          ctx.textAlign = 'right'; ctx.fillText('✓', dx + pw - pad - 12, y + 18);
        }
        y += 42;
      }
    }

    // --- À PROPOS ---
    if (drawerTab === 'about') {
      entete(traduire('But du jeu', language));
      ctx.fillStyle = UI_THEME.text; ctx.font = `12px ${F_TEXTE}`;
      ctx.textAlign = 'left'; ctx.textBaseline = 'top';
      const aboutLines = [
        'ROYCHEC est un jeu d’échecs augmenté. Capture le roi adverse pour gagner.',
        'Les améliorations ont trois types : D = déplacement, A = actif, S = statistique. Elles donnent de nouvelles options sans remplacer les règles de base.',
        'Les améliorations de type S sont bloqués à 4 achats par joueur (seulement 4 pièces peuvent avoir un bouclier)',
        'Le maximum d’écus est bloqué à 30 par joueur.',
        'Utilise tes écus dans le panneau « Améliorer » pour acheter une carte compatible avec la pièce. Une pièce peut porter au maximum deux améliorations : choisis ta combinaison.',
      ];
      for (const line of aboutLines) {
        const words = traduire(line, language).split(' ');
        let current = '';
        for (const word of words) {
          const candidate = current ? `${current} ${word}` : word;
          if (ctx.measureText(candidate).width > pw - 2 * pad && current) {
            ctx.fillText(current, dx + pad, y);
            y += 21;
            current = word;
          } else {
            current = candidate;
          }
        }
        if (current) { ctx.fillText(current, dx + pad, y); y += 28; }
      }
      //ctx.fillStyle = UI_THEME.muted; ctx.font = `11px ${F_TEXTE}`;
      //ctx.fillText(traduire('Fermer avec Échap', language), dx + pad, y + 12);
    }
  } else {
    if (state.ui) state.ui.hamburgerPanel = null;
  }

  // --- Bouton hamburger DESSINÉ en dernier : visible par-dessus le drawer ouvert ---
  const motion = motionBouton(state, hb);
  const visualY = top + (1 - motion.appear) * 3 - motion.hover * 4 + motion.press * 2;
  ctx.save();
  ctx.fillStyle = ombreBouton(UI_THEME.card);
  roundRect(ctx, right - taille, visualY + 4 - motion.press * 2, taille, taille, 12); ctx.fill();
  ctx.globalAlpha = 0.92 + motion.appear * 0.08;
  ctx.fillStyle = eclaircir(UI_THEME.card, motion.hover * 0.08);
  roundRect(ctx, right - taille, visualY, taille, taille, 12); ctx.fill();
  ctx.lineWidth = 2.5; ctx.strokeStyle = ouvert ? UI_THEME.amber : UI_THEME.border;
  roundRect(ctx, right - taille, visualY, taille, taille, 12); ctx.stroke();
  // 3 traits horizontaux (ou croix ✕ quand le panneau est ouvert).
  const cx = right - taille / 2;
  const cy = visualY + taille / 2;
  ctx.strokeStyle = UI_THEME.text; ctx.lineWidth = 3; ctx.lineCap = 'round';
  const wBar = 18, gapBar = 6;
  if (ouvert) {
    ctx.beginPath();
    ctx.moveTo(cx - wBar / 2, cy - gapBar); ctx.lineTo(cx + wBar / 2, cy + gapBar);
    ctx.moveTo(cx + wBar / 2, cy - gapBar); ctx.lineTo(cx - wBar / 2, cy + gapBar);
    ctx.stroke();
  } else {
    for (let i = -1; i <= 1; i++) {
      ctx.beginPath();
      ctx.moveTo(cx - wBar / 2, cy + i * gapBar);
      ctx.lineTo(cx + wBar / 2, cy + i * gapBar);
      ctx.stroke();
    }
  }
  ctx.restore();
}

function dessineMenuMobile(ctx, state) {
  // Toujours utiliser les dimensions logiques, jamais le buffer Retina du canvas.
  const W = CANVAS_W, H = CANVAS_H;
  const pad = 16, inner = W - pad * 2;
  const activeMode = state.menu?.activeMode || 'pvw';
  const selectedDiff = state.menu?.difficulty || null;
  const selectedSize = state.menu?.taille || 'std';
  const C = UI_THEME;

  ctx.fillStyle = C.background; ctx.fillRect(0, 0, W, H);
  const glow = ctx.createRadialGradient(20, 0, 0, 20, 260, 340);
  glow.addColorStop(0, `${C.wine}66`); glow.addColorStop(1, `${C.wine}00`);
  ctx.fillStyle = glow; ctx.fillRect(0, 0, W, H);
  // Wordmark : icône du jeu à côté de « ROY / CHEC ».
  const logoSize = 28, logoGap = 7, logoX = 18, logoY = 42;
  ctx.font = `600 28px Georgia, "Times New Roman", serif`;
  ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
  if (faviconPrête()) {
    ctx.drawImage(faviconImg, logoX, logoY - logoSize / 2, logoSize, logoSize);
    const royX = logoX + logoSize + logoGap;
    ctx.fillStyle = C.text; ctx.fillText('ROY', royX, logoY);
    const royW = ctx.measureText('ROY').width;
    ctx.fillStyle = C.amberLight; ctx.fillText('CHEC', royX + royW, logoY);
  } else {
    ctx.fillStyle = C.text; ctx.fillText('♞ ROY', 18, 42);
    ctx.fillStyle = C.amberLight; ctx.fillText('CHEC', 112, 42);
  }

  // Navigation d'apprentissage en premier : Tutoriel / Apprendre au-dessus de Jouer.
  const modeY = 136, modeH = 230;
  mobileCard(ctx, pad, modeY, inner, modeH, C.panel, 18);
  mobileText(ctx, 'JOUER', pad + 16, modeY + 22, `700 12px ${F_DISPLAY}`, C.muted);
  const modes = [['pvw', 'EN LIGNE'], ['pvp', 'LOCAL'], ['pvai', 'ORDINATEUR']];
  const gap = 5, tabW = (inner - 32 - gap * 2) / 3;
  modes.forEach(([id, label], i) => {
    const x = pad + 16 + i * (tabW + gap), y = modeY + 38;
    const selected = activeMode === id;
    enregistrerBouton(state, x, y, tabW, 32, { kind: 'selectMode', mode: id }, true, true, 9);
    ctx.fillStyle = selected ? C.wine : C.field; roundRect(ctx, x, y, tabW, 32, 9); ctx.fill();
    ctx.lineWidth = selected ? 2 : 1; ctx.strokeStyle = selected ? C.amber : C.border;
    roundRect(ctx, x, y, tabW, 32, 9); ctx.stroke();
    mobileText(ctx, label, x + tabW / 2, y + 16, `700 8px ${F_DISPLAY}`,
      selected ? C.buttonText : C.text, 'center');
  });

  const contentX = pad + 16, contentY = modeY + 82, contentW = inner - 32;
  if (activeMode === 'pvp') {
    mobileText(ctx, 'JOUEUR 1        VS        JOUEUR 2', contentX + contentW / 2, contentY + 20,
      `700 12px ${F_DISPLAY}`, C.text, 'center');
    mobileText(ctx, 'Partie locale · chacun son tour', contentX + contentW / 2, contentY + 49,
      `10px ${F_TEXTE}`, C.muted, 'center');
    mobileButton(state, ctx, contentX + 58, contentY + 72, contentW - 116, 38, 'Jouer',
      { kind: 'pickMode', mode: 'pvp' }, { color: C.card, textColor: C.text });
  } else if (activeMode === 'pvw') {
    mobileText(ctx, 'PRÊT À CHERCHER UN ADVERSAIRE', contentX, contentY + 17, `700 10px ${F_DISPLAY}`);
    mobileText(ctx, 'Classement estimé · partie en ligne', contentX, contentY + 40, `10px ${F_TEXTE}`, C.muted);
    mobileButton(state, ctx, contentX + 54, contentY + 65, contentW - 108, 38, 'Lancer une recherche',
      { kind: 'startSearch' }, { color: C.amber, textColor: C.buttonText });
    if (state.resumeAvailable) {
      mobileButton(state, ctx, contentX + 54, contentY + 109, contentW - 108, 36, 'Reprendre la partie',
        { kind: 'resumeMatch' }, { color: C.primary, textColor: C.text });
    }
  } else {
    mobileText(ctx, 'DIFFICULTÉ', contentX, contentY + 12, `700 10px ${F_DISPLAY}`, C.muted);
    const diffGap = 5, diffW = (contentW - diffGap * 2) / 3;
    // Les intitulés longs doivent rester entièrement dans leur case, notamment
    // INTERMÉDIAIRE sur les petits téléphones : la zone tactile reste inchangée.
    ['Débutant', 'Intermédiaire', 'Avancé'].forEach((label, i) => mobileButton(state, ctx,
      contentX + i * (diffW + diffGap), contentY + 27, diffW, 32, label,
      { kind: 'pickDifficulty', level: i + 1 }, { color: selectedDiff === i + 1 ? C.wine : C.card,
        textColor: C.text, fontSize: 8 }));
    mobileButton(state, ctx, contentX + 12, contentY + 70, contentW - 24, 36,
      'Jouer contre l’ordinateur', { kind: 'pickMode', mode: 'pvai' },
      { enabled: !!selectedDiff, color: C.primary, textColor: C.text });
  }

  // La ligne ÉCUS ayant été retirée, la carte ne garde que les deux rangées
  // visibles et le bouton DECKS : on supprime l'espace vide sous ce bouton.
  const variantY = 382, variantH = 148;
  mobileCard(ctx, pad, variantY, inner, variantH, C.panel, 18);
  mobileText(ctx, 'RÉGLAGES DE PARTIE', pad + 16, variantY + 22, `700 11px ${F_DISPLAY}`, C.muted);
  const variantRows = [
    ['ECUS', COMBATS.map((item) => ({ value: item.id, label: item.id === 'standard' ? '+2 / coup' : 'capture ×2' })), 'pickCombat', state.menu?.combat || 'standard'],
    ['PLATEAU', [['std', '8 × 8'], ['l15', '15 × 8'], ['bonus', 'BONUS']].map(([value, label]) => ({ value, label })), 'pickTaille', selectedSize],
  ];
  variantRows.forEach(([label, options, kind, selectedValue], row) => {
    const yy = variantY + 42 + row * 29;
    mobileText(ctx, label, pad + 16, yy + 12, `700 8px ${F_DISPLAY}`, C.muted);
    const startX = pad + 72, chipGap = 4;
    const chipW = (inner - 88 - chipGap * (options.length - 1)) / options.length;
    options.forEach(({ value, label: optionLabel }, i) => {
      const selected = value === selectedValue;
      mobileButton(state, ctx, startX + i * (chipW + chipGap), yy, chipW, 24, optionLabel,
        { kind, value }, { color: selected ? (row === 0 ? C.wine : C.primary) : C.field,
          textColor: selected ? C.text : C.muted });
    });
  });
  // Decks appartient aux réglages de partie : il reste proche des variantes
  // sans encombrer la grille de navigation principale.
  // Même largeur, rayon et traitement que les contrôles de réglages ; la hauteur
  // reste de 44 px pour conserver une cible tactile confortable.
  mobileButton(state, ctx, pad + 72, variantY + 112, inner - 88, 24, 'DECKS  ›',
    { kind: 'ouvrirDecks' }, { color: C.field, textColor: C.text });

  const navY = 82, navW = (inner - 8) / 2;
  mobileButton(state, ctx, pad, navY, navW, 44, 'TUTORIEL', { kind: 'tutoriel' }, { color: C.panelAlt, textColor: C.text });
  mobileButton(state, ctx, pad + navW + 8, navY, navW, 44, 'DEFI', { kind: 'apprendre' }, { color: C.wine, textColor: C.text });
  // L’historique reste accessible dans sa carte dédiée sous l’aperçu.

  // Sur téléphone, l’aperçu et l’historique partagent la même ligne : deux
  // cartes équilibrées restent plus lisibles qu’une longue colonne unique.
  const columnsGap = 12;
  const columnW = (inner - columnsGap) / 2;
  const previewX = pad;
  const historyX = pad + columnW + columnsGap;
  // Cartes carrées sur téléphone : la largeur de chaque colonne devient leur
  // hauteur pour garder une composition nette et équilibrée.
  // Seize pixels de respiration après la bordure des réglages, sans laisser
  // l'ancien espace réservé à la ligne supprimée.
  const previewY = 546;
  const previewH = columnW;
  const historyY = previewY;
  const historyH = previewH;
  mobileCard(ctx, previewX, previewY, columnW, previewH, C.panel, 16);
  mobileText(ctx, 'APERÇU', previewX + 12, previewY + 22, `700 10px ${F_DISPLAY}`, C.text);

  // Même aperçu que sur ordinateur, mais compact : on conserve la vraie position
  // initiale et les dimensions de `creerPlateau()` pour éviter un faux damier 8×8.
  // Le plateau est construit avant la géométrie afin que toute taille future reste
  // automatiquement cadrée (std/bonus = 8×8, l15 = 15×8).
  const previewState = state.ui.preview[selectedSize] || state.ui.preview.std;
  // Tant que l'aperçu n'a pas été lancé (▶ LANCER), le plateau reste neutre :
  // aucune amélioration n'est signalée comme active.
  const previewLaunched = previewState.playing || previewState.finished || previewState.elapsed > 0;
  const previewMoves = previewSequence(selectedSize);
  const previewBoard = decoratePreviewBoard(
    clonePreviewBoard(previewBoardInitial(selectedSize)), selectedSize,
  );
  const previewRows = previewBoard.length || 8;
  const previewCols = previewBoard[0]?.length || 8;
  const previewPad = 10;
  const previewTop = previewY + 38;
  const previewBottom = previewY + previewH - 14;
  // Plateau volontairement plus petit dans sa carte carrée : il respire autour
  // des cases et laisse le titre ainsi que le bouton d'aperçu bien lisibles.
  const previewCell = Math.max(8, Math.min(
    27,
    (columnW - previewPad * 2) / previewCols,
    (previewBottom - previewTop) / previewRows,
  ) * 0.82);
  const previewBoardW = previewCell * previewCols;
  const previewBoardH = previewCell * previewRows;
  const previewBoardX = previewX + (columnW - previewBoardW) / 2;
  const previewBoardY = previewTop + Math.max(0, (previewBottom - previewTop - previewBoardH) / 2);
  const previewNow = state.ui.frameNow || performance.now();
  const previewStepMs = 1250;
  const previewTotalMs = Math.max(previewStepMs, previewMoves.length * previewStepMs);
  if (previewState.playing) {
    if (previewState.startedAt == null) previewState.startedAt = previewNow - previewState.elapsed;
    previewState.elapsed = Math.min(previewTotalMs, Math.max(0, previewNow - previewState.startedAt));
    if (previewState.elapsed >= previewTotalMs) {
      previewState.elapsed = previewTotalMs;
      previewState.playing = false;
      previewState.finished = true;
      previewState.startedAt = null;
    }
  }
  const previewElapsed = Math.min(previewTotalMs, Math.max(0, previewState.elapsed));
  const previewMoveIndex = previewMoves.length
    ? Math.min(previewMoves.length, Math.floor(previewElapsed / previewStepMs)) : 0;
  const previewProgress = previewMoveIndex < previewMoves.length
    ? (previewElapsed % previewStepMs) / previewStepMs : 1;
  for (let i = 0; i < previewMoveIndex; i++) applyPreviewMove(previewBoard, previewMoves[i]);
  const previewCurrent = previewMoves[previewMoveIndex] || null;
  const previewPieceAt = (r, c) => previewBoard[r]?.[c] || null;
  const previewGlyphs = { P: '♟', N: '♞', B: '♝', R: '♜', Q: '♛', K: '♚' };

  // Le bouton couvre la carte du plateau : le geste est utilisable même si le
  // doigt tombe entre deux cases ou sur une pièce.
  enregistrerBouton(state, previewBoardX, previewBoardY, previewBoardW, previewBoardH,
    { kind: 'togglePreview', taille: selectedSize }, true, true, 9);
  ctx.fillStyle = C.amber;
  roundRect(ctx, previewBoardX - 4, previewBoardY - 4, previewBoardW + 8, previewBoardH + 8, 9); ctx.fill();
  for (let r = 0; r < previewRows; r++) {
    for (let c = 0; c < previewCols; c++) {
      ctx.fillStyle = (r + c) % 2 ? '#6B3A52' : '#F1E6D4';
      ctx.fillRect(previewBoardX + c * previewCell, previewBoardY + r * previewCell,
        previewCell + 0.5, previewCell + 0.5);
    }
  }
  if (selectedSize === 'bonus') {
    for (const bonus of PREVIEW_BONUS_CELLS) {
      if (bonus.c >= previewCols) continue;
      const bx = previewBoardX + (bonus.c + 0.5) * previewCell;
      const by = previewBoardY + (bonus.r + 0.5) * previewCell;
      ctx.save();
      ctx.globalAlpha = 0.35;
      ctx.fillStyle = C.amberLight;
      ctx.beginPath(); ctx.arc(bx, by, Math.max(3, previewCell * 0.28), 0, Math.PI * 2); ctx.fill();
      ctx.globalAlpha = 0.95;
      ctx.strokeStyle = C.amber;
      ctx.lineWidth = Math.max(1, previewCell * 0.06);
      ctx.beginPath();
      ctx.moveTo(bx, by - previewCell * 0.2);
      ctx.lineTo(bx + previewCell * 0.2, by);
      ctx.lineTo(bx, by + previewCell * 0.2);
      ctx.lineTo(bx - previewCell * 0.2, by);
      ctx.closePath(); ctx.stroke();
      ctx.restore();
    }
  }
  const drawPreviewPiece = (piece, r, c, x = previewBoardX + (c + 0.5) * previewCell,
    y = previewBoardY + (r + 0.52) * previewCell) => {
    if (!piece) return;
    // L’aperçu téléphone doit parler le même langage visuel que la partie :
    // sprite de camp réel, puis flamme derrière la pièce si une amélioration est
    // équipée. Le glyph Unicode reste uniquement le fallback de chargement.
    const img = spritePret(piece.owner, piece.type);
    const fire = previewLaunched ? optionsFeuPour(piece) : null;
    const previewRadius = Math.max(8, previewCell * 0.72);
    const previewStateRadius = Math.max(5, previewCell * 0.36);
    if (fire) {
      dessineFeu(ctx, x, y, previewNow, previewStateRadius,
        fire.col1, fire.col2, fire.pulsed, previewRadius);
    }
    if (img) {
      const ratio = img.naturalWidth / img.naturalHeight || 1;
      const h = Math.max(8, previewCell * 0.88);
      const w = h * ratio;
      ctx.drawImage(img, x - w / 2, y - h / 2 - Math.max(0.5, previewCell * 0.03), w, h);
    } else {
      ctx.fillStyle = piece.owner === 1 ? C.wineDark : C.text;
      ctx.font = `${Math.max(9, Math.min(19, previewCell * 0.82))}px Georgia, serif`;
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(previewGlyphs[piece.type] || '♟', x, y);
    }
    if (previewLaunched && piece.shield) {
      ctx.strokeStyle = C.primary;
      ctx.lineWidth = Math.max(1, previewCell * 0.06);
      ctx.beginPath(); ctx.arc(x, y, Math.max(4, previewCell * 0.4), 0, Math.PI * 2); ctx.stroke();
    }
  };
  for (let r = 0; r < previewRows; r++) {
    for (let c = 0; c < previewCols; c++) {
      if (previewCurrent && ((r === previewCurrent.from.r && c === previewCurrent.from.c)
        || (r === previewCurrent.to.r && c === previewCurrent.to.c))) continue;
      drawPreviewPiece(previewPieceAt(r, c), r, c);
    }
  }
  if (previewCurrent) {
    const movingPiece = previewPieceAt(previewCurrent.from.r, previewCurrent.from.c);
    if (movingPiece) {
      const eased = previewProgress < 0.5
        ? 2 * previewProgress * previewProgress
        : 1 - Math.pow(-2 * previewProgress + 2, 2) / 2;
      // Une capture reste lisible pendant l'approche : la pièce attaquée est
      // dessinée d'abord, puis la pièce en mouvement passe visuellement dessus.
      const capturedPiece = previewPieceAt(previewCurrent.to.r, previewCurrent.to.c);
      if (capturedPiece && capturedPiece !== movingPiece) {
        drawPreviewPiece(capturedPiece, previewCurrent.to.r, previewCurrent.to.c);
      }
      const movingX = previewBoardX + (previewCurrent.from.c + 0.5
        + (previewCurrent.to.c - previewCurrent.from.c) * eased) * previewCell;
      const movingY = previewBoardY + (previewCurrent.from.r + 0.52
        + (previewCurrent.to.r - previewCurrent.from.r) * eased) * previewCell;
      drawPreviewPiece(movingPiece, previewCurrent.to.r, previewCurrent.to.c, movingX, movingY);
    }
  }
  const previewLabel = previewState.playing ? 'Ⅱ PAUSE'
    : previewState.finished ? '↻ REJOUER' : '▶ LANCER';
  const indicatorW = previewState.playing || previewState.finished ? 82 : 72;
  const indicatorX = previewX + columnW - indicatorW - 8;
  // Bouton aligné verticalement sur le titre « APERÇU » (centré à previewY + 22,
  // hauteur 22 → top à previewY + 11) pour une ligne de titre équilibrée.
  const indicatorY = previewY + 11;
  enregistrerBouton(state, indicatorX, indicatorY, indicatorW, 22,
    { kind: 'togglePreview', taille: selectedSize }, true, true, 999);
  ctx.fillStyle = previewState.playing ? C.primary : previewState.finished ? C.amber : C.wine;
  roundRect(ctx, indicatorX, indicatorY, indicatorW, 22, 999); ctx.fill();
  mobileText(ctx, previewLabel, indicatorX + indicatorW / 2, indicatorY + 11,
    `700 8px ${F_DISPLAY}`, C.text, 'center');

  // Historique mobile : même source que le dashboard desktop, dans la seconde
  // carte de la ligne côte à côte avec l’aperçu.
  mobileCard(ctx, historyX, historyY, columnW, historyH, C.panel, 16);
  mobileText(ctx, traduire('HISTORIQUE', state.language), historyX + 12, historyY + 24,
    `700 10px ${F_DISPLAY}`, C.text);
  const replays = (Array.isArray(state._replayList) ? state._replayList : [])
    .filter((replay) => replay && typeof replay.key === 'string' && replay.key.length > 0);
  const modeLabel = (mode) => mode === 'spectator' ? 'Spectateur'
    : mode === 'pvai' ? 'Ordinateur'
    : mode === 'pvw' ? 'En ligne' : 'Local';
  const winnerIndex = (winner) => winner === 0 || winner === '0' ? 0
    : winner === 1 || winner === '1' ? 1 : null;
  const resultLabel = (winner) => {
    const index = winnerIndex(winner);
    return index === null ? 'Partie' : `${NOM_JOUEUR[index]} gagne`;
  };
  const shortDate = (timestamp) => {
    const date = new Date(Number(timestamp));
    if (!Number.isFinite(date.getTime())) return 'date inconnue';
    return date.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit' });
  };
  if (!replays.length) {
    mobileText(ctx, traduire('Aucune partie enregistrée', state.language), historyX + columnW / 2, historyY + 112,
      `9px ${F_TEXTE}`, C.muted, 'center');
    mobileText(ctx, traduire('Termine une partie pour la retrouver ici.', state.language), historyX + columnW / 2, historyY + 136,
      `7px ${F_TEXTE}`, C.muted, 'center');
  } else {
    // Retour au design précédent : une ligne légère par partie, séparée de la
    // suivante. On réduit l'écart à 4 px, tout en gardant une vraie cible tactile.
    const listTop = historyY + 36;
    const listBottom = historyY + historyH - 48;
    // Ligne visuellement compacte, mais zone tactile confortable et séparée.
    const rowH = 44;
    const rowGap = 8;
    const maxVisible = Math.max(1, Math.floor((listBottom - listTop + rowGap) / (rowH + rowGap)));
    const visibleReplays = replays.slice(0, maxVisible);
    visibleReplays.forEach((replay, index) => {
      const rowY = listTop + index * (rowH + rowGap);
      enregistrerBouton(state, historyX + 8, rowY, columnW - 16, rowH,
        { kind: 'startReplay', key: replay.key }, true, false, 7);
      const mode = traduire(modeLabel(replay.mode), state.language);
      const result = traduire(resultLabel(replay.winner), state.language);
      const actions = `${Number(replay.totalActions) || 0} act.`;
      mobileText(ctx, `${mode} · ${shortDate(replay.startTime)}`, historyX + 12, rowY + 15,
        `8px ${F_TEXTE}`, C.muted);
      mobileText(ctx, result, historyX + 12, rowY + 32,
        `600 8px ${F_TEXTE}`, winnerIndex(replay.winner) === null ? C.muted : C.primary);
      mobileText(ctx, actions, historyX + columnW - 12, rowY + 32,
        `8px ${F_TEXTE}`, C.muted, 'right');
    });
  }
  mobileButton(state, ctx, historyX + 8, historyY + historyH - 48, columnW - 16, 44,
    'Toutes les parties', { kind: 'ouvrirReplays' }, { color: C.card, textColor: C.text, fontSize: 11 });
  dessineBandeauCompte(ctx, state);
}

// Dessine le menu d'accueil (SPEC §1.4 / §5.1). 2 boutons principaux +
// 3 chips de difficulté (Débutant / Intermédiaire / Avancé, palette pastel).
// Bouton B « VS ORDINATEUR » désactivé tant qu'aucune difficulté n'est
// sélectionnée. Hit-test via state.ui.buttons (géré par main.js).
// Dessine le menu d'accueil (SPEC §1.4 / §5.1). v5.10 — pivot esthetique
// « roychec-menu-v2.html » : palette lavande/purple/green/rose + typo ui-rounded
// + radius 22/16/12 (radius-lg/md/sm v2). Sémantique hit-test inchangée
// (state.ui.buttons pushé identiquement) — le DA par défaut Archivo Black reste
// actif partout ailleurs (shop, panneau en jeu, lobby PvP, replay). La palette
// V2 + le helper boutonV2 sont isolés DANS cette fonction.
// Dessine le menu d'accueil (SPEC §1.4 / §5.1). v5.11 — pivot 3-panel layout
// (LOCAL / EN LIGNE / ORDINATEUR) MIRROIR de roychec-menu-v2.html, VARIANTES
// accordion partagé, palette V2 + typo ui-rounded + radius 22/16/12 préservés.
// Hit-test sémantique inchangée (state.ui.buttons.push avec mêmes kind values).
// Menu dashboard — composition alignée sur roychec_interface.html.
// Le plateau et la feuille sont des aperçus décoratifs : les interactions de jeu
// commencent après le CTA de mode, tandis que les actions de navigation restent
// enregistrées dans les mêmes state.ui.buttons que le menu historique.
function dessineMenuDashboard(ctx, state) {
  const F_DB = '"Nunito Sans", system-ui, sans-serif';
  const F_DB_BRAND = 'Georgia, "Times New Roman", serif';
  const C = {
    bg: UI_THEME.background,
    panel: UI_THEME.panel,
    panelHi: UI_THEME.panelAlt,
    card: UI_THEME.card,
    field: UI_THEME.field,
    text: UI_THEME.text,
    muted: UI_THEME.muted,
    gold: UI_THEME.amber,
    goldBright: UI_THEME.amberLight,
    wine: UI_THEME.wine,
    wineDark: UI_THEME.wineDark,
    forest: UI_THEME.primary,
    forestDark: UI_THEME.primaryDark,
    border: UI_THEME.border,
  };
  const R_CARD = 18, R_INNER = 12, R_PILL = 999;
  const cx = CANVAS_W / 2;
  const activeMode = (state.menu && state.menu.activeMode) || 'pvw';
  const varCbt = (state.menu && state.menu.combat) || 'standard';
  const varTail = (state.menu && state.menu.taille) || 'std';
  const tailleLabel = (TAILLES[varTail] || TAILLES.std).label;
  // Le dashboard n'affiche plus une barre « Variantes » séparée : les modes
  // sont regroupés dans une carte directement sous l'aperçu du plateau.
  const mainY = 150;
  const mainH = 418;
  const modeY = mainY + mainH + 16;

  function dbCard(x, y, w, h, fill = C.panel, radius = R_CARD) {
    ctx.save();
    ctx.shadowColor = UI_THEME.shadow;
    ctx.shadowBlur = 14;
    ctx.shadowOffsetY = 4;
    ctx.fillStyle = fill;
    roundRect(ctx, x, y, w, h, radius); ctx.fill();
    ctx.restore();
    ctx.lineWidth = 1; ctx.strokeStyle = C.border;
    roundRect(ctx, x, y, w, h, radius); ctx.stroke();
  }

  function dbText(text, x, y, font, color = C.text, align = 'left', baseline = 'middle') {
    text = traduire(text, state.language);
    ctx.fillStyle = color; ctx.font = font;
    ctx.textAlign = align; ctx.textBaseline = baseline;
    ctx.fillText(text, x, y);
  }

  function dbControl(x, y, w, h, label, action, opts = {}) {
    const enabled = opts.enabled !== false;
    label = traduire(label, state.language);
    if (opts.sub) opts = { ...opts, sub: traduire(opts.sub, state.language) };
    const { visualY } = motionMenuBouton(state, x, y, w, h, action, enabled, opts.radius || R_INNER);
    ctx.fillStyle = enabled ? (opts.fill || C.card) : UI_THEME.disabled;
    roundRect(ctx, x, visualY, w, h, opts.radius || R_INNER); ctx.fill();
    ctx.lineWidth = opts.selected ? 2 : 1;
    ctx.strokeStyle = opts.selected ? (opts.selectedBorder || C.gold) : C.border;
    roundRect(ctx, x, visualY, w, h, opts.radius || R_INNER); ctx.stroke();
    dbText(label, x + w / 2, visualY + h / 2 - (opts.sub ? 7 : 0), opts.font || `600 13px ${F_DB}`,
      enabled ? (opts.textColor || C.text) : C.muted, 'center');
    if (opts.sub) dbText(opts.sub, x + w / 2, visualY + h / 2 + 10, `11px ${F_DB}`,
      enabled ? C.muted : UI_THEME.disabledText, 'center');
  }

  function dbCta(x, y, w, h, label, action, opts = {}) {
    const enabled = opts.enabled !== false;
    label = traduire(label, state.language);
    const { visualY } = motionMenuBouton(state, x, y, w, h, action, enabled, R_PILL);
    if (enabled) {
      ctx.save(); ctx.globalAlpha = 0.45; ctx.fillStyle = opts.shadow || C.forestDark;
      roundRect(ctx, x, visualY + 4, w, h, R_PILL); ctx.fill(); ctx.restore();
    }
    ctx.fillStyle = enabled ? (opts.fill || C.forest) : UI_THEME.disabled;
    roundRect(ctx, x, visualY, w, h, R_PILL); ctx.fill();
    ctx.lineWidth = 1.5; ctx.strokeStyle = enabled ? (opts.stroke || C.forestDark) : C.border;
    roundRect(ctx, x, visualY, w, h, R_PILL); ctx.stroke();
    dbText(label.toUpperCase(), x + w / 2, visualY + h / 2 - (opts.sub ? 8 : 0), `700 13px ${F_DB}`,
      enabled ? C.text : C.muted, 'center');
    if (opts.sub) dbText(opts.sub, x + w / 2, visualY + h / 2 + 10, `11px ${F_DB}`,
      enabled ? C.text : C.muted, 'center');
  }

  function drawPreviewBoard(x, y, w, h, state) {
    const taille = varTail === 'l15' ? 'l15' : varTail === 'bonus' ? 'bonus' : 'std';
    const previewState = state.ui.preview[taille];
    // Tant que l'aperçu n'a pas été lancé (▶ LANCER), le plateau reste neutre :
    // aucune amélioration n'est signalée comme active.
    const previewLaunched = previewState.playing || previewState.finished || previewState.elapsed > 0;
    // Toute la carte est interactive : l'indicateur est volontairement visuel,
    // la hitbox reste fixe pour que le mouvement du bouton ne décale pas le plateau.
    enregistrerBouton(state, x, y, w, h, { kind: 'togglePreview', taille }, true, true, R_INNER);
    dbCard(x, y, w, h, C.card, R_INNER);
    const pad = 9;
    const rows = 8;
    const moves = previewSequence(taille);
    if (!moves.length) return;
    const board = decoratePreviewBoard(clonePreviewBoard(previewBoardInitial(taille)), taille);
    const cols = board[0].length;
    const bw = w - pad * 2, bh = h - pad * 2;
    const cell = Math.min(bw / cols, bh / rows);
    const ox = x + (w - cell * cols) / 2, oy = y + (h - cell * rows) / 2;
    const glyphs = { P: '♟', N: '♞', B: '♝', R: '♜', Q: '♛', K: '♚' };
    const stepMs = 1250;
    const now = state?.ui?.frameNow || (typeof performance !== 'undefined' ? performance.now() : 0);
    const totalMs = moves.length * stepMs;
    if (previewState.playing) {
      if (previewState.startedAt == null) previewState.startedAt = now - previewState.elapsed;
      previewState.elapsed = Math.min(totalMs, Math.max(0, now - previewState.startedAt));
      if (previewState.elapsed >= totalMs) {
        previewState.elapsed = totalMs;
        previewState.playing = false;
        previewState.finished = true;
        previewState.startedAt = null;
      }
    }
    const elapsed = Math.min(totalMs, Math.max(0, previewState.elapsed));
    const moveIndex = Math.min(moves.length, Math.floor(elapsed / stepMs));
    const previewLabel = previewState.playing
      ? 'Ⅱ PAUSE'
      : previewState.finished ? '↻ REJOUER' : '▶ LANCER';
    const indicatorW = previewState.playing || previewState.finished ? 96 : 88;
    const indicatorX = x + w - indicatorW - 10;
    // L'indicateur reste dans l'en-tête libre entre le titre et la carte.
    const indicatorY = y - 36;
    const progress = moveIndex < moves.length ? (elapsed % stepMs) / stepMs : 1;
    const current = moves[moveIndex] || null;
    for (let i = 0; i < moveIndex; i++) applyPreviewMove(board, moves[i]);

    function pieceAt(r, c) { return board[r] && board[r][c]; }

    ctx.save();
    ctx.fillStyle = C.gold;
    roundRect(ctx, ox - 5, oy - 5, cell * cols + 10, cell * rows + 10, 10); ctx.fill();
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        ctx.fillStyle = (r + c) % 2 === 0 ? '#F1E6D4' : '#6B3A52';
        ctx.fillRect(ox + c * cell, oy + r * cell, cell + 0.5, cell + 0.5);
      }
    }
    if (taille === 'bonus') {
      // Cases de Chasse : signal visuel indépendant des coups du replay converti.
      for (const bonus of PREVIEW_BONUS_CELLS) {
        const bx = ox + (bonus.c + 0.5) * cell;
        const by = oy + (bonus.r + 0.5) * cell;
        ctx.save();
        ctx.globalAlpha = 0.34;
        ctx.fillStyle = C.goldBright;
        ctx.beginPath();
        ctx.arc(bx, by, Math.max(5, cell * 0.28), 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = 0.95;
        ctx.strokeStyle = C.gold;
        ctx.lineWidth = Math.max(1, cell * 0.045);
        ctx.beginPath();
        ctx.moveTo(bx, by - cell * 0.22);
        ctx.lineTo(bx + cell * 0.22, by);
        ctx.lineTo(bx, by + cell * 0.22);
        ctx.lineTo(bx - cell * 0.22, by);
        ctx.closePath();
        ctx.stroke();
        ctx.restore();
      }
    }

    function drawPiece(piece, r, c, px = ox + (c + 0.5) * cell, py = oy + (r + 0.52) * cell) {
      if (!piece) return;
      const flameOpts = previewLaunched ? optionsFeuPour(piece) : null;
      if (flameOpts) {
        // Même pipeline que le vrai plateau : flamme derrière la pièce,
        // proportionnée et contenue dans la cellule du mini-plateau.
        ctx.save();
        ctx.beginPath();
        ctx.rect(ox + c * cell, oy + r * cell, cell, cell);
        ctx.clip();
        dessineFeu(ctx, px, py, now, cell * 0.38, flameOpts.col1, flameOpts.col2,
          flameOpts.pulsed, Math.min(40, Math.max(8, cell * 0.42)));
        ctx.restore();
      }
      const upgradeCats = previewLaunched ? [...new Set((piece.upgrades || [])
        .map((id) => UPGRADES[id]?.cat)
        .filter(Boolean))] : [];
      if (upgradeCats.length) {
        ctx.save();
        // Le halo reste visuellement contenu dans la case : il signale la carte
        // sans contaminer les cases voisines, surtout sur le format 15×8.
        ctx.beginPath();
        ctx.rect(ox + c * cell, oy + r * cell, cell, cell);
        ctx.clip();
        ctx.globalAlpha = 0.28;
        const aura = ctx.createRadialGradient(px, py, 0, px, py, Math.max(7, cell * 0.7));
        aura.addColorStop(0, COULEUR_CAT[upgradeCats[0]]);
        aura.addColorStop(1, `${COULEUR_CAT[upgradeCats[0]]}00`);
        ctx.fillStyle = aura;
        ctx.beginPath(); ctx.arc(px, py, Math.max(7, cell * 0.7), 0, Math.PI * 2); ctx.fill();
        ctx.restore();
      }
      const img = spritePret(piece.owner, piece.type);
      if (img) {
        const targetH = Math.max(13, Math.min(42, cell * 0.9));
        const ratio = img.naturalWidth / img.naturalHeight || 1;
        const targetW = targetH * ratio;
        ctx.drawImage(img, px - targetW / 2, py - targetH / 2 - 1, targetW, targetH);
      } else {
        ctx.fillStyle = piece.owner === 1 ? C.wineDark : C.text;
        ctx.font = `${Math.max(12, Math.min(24, Math.round(cell * 0.72)))}px Georgia, serif`;
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText(glyphs[piece.type] || '♟', px, py);
      }
      if (previewLaunched && piece.shield) {
        ctx.beginPath();
        ctx.arc(px, py, Math.max(7, cell * 0.43), 0, Math.PI * 2);
        ctx.strokeStyle = COULEUR_CAT.S;
        ctx.lineWidth = Math.max(1, cell * 0.055);
        ctx.stroke();
      }
    }
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        if (current && ((r === current.from.r && c === current.from.c)
          || (r === current.to.r && c === current.to.c))) continue;
        drawPiece(pieceAt(r, c), r, c);
      }
    }

    const movingPiece = current && pieceAt(current.from.r, current.from.c);
    if (movingPiece) {
      const eased = progress < 0.5
        ? 2 * progress * progress
        : 1 - Math.pow(-2 * progress + 2, 2) / 2;
      const { from, to } = current;
      const capturedPiece = pieceAt(to.r, to.c);
      // Une capture reste lisible pendant l'approche : la pièce attaquée est
      // dessinée d'abord, puis la pièce en mouvement passe visuellement dessus.
      if (capturedPiece && capturedPiece !== movingPiece) drawPiece(capturedPiece, to.r, to.c);
      const px = ox + (from.c + 0.5 + (to.c - from.c) * eased) * cell;
      const py = oy + (from.r + 0.52 + (to.r - from.r) * eased) * cell;
      drawPiece(movingPiece, to.r, to.c, px, py);
    }
    ctx.restore();
    // L'indicateur est hors de la carte interne : il reçoit donc sa propre hitbox,
    // tout en déclenchant exactement la même action que le clic sur le plateau.
    enregistrerBouton(state, indicatorX, indicatorY, indicatorW, 24,
      { kind: 'togglePreview', taille }, true, true, 999);
    // Indicateur dessiné en dernier pour rester lisible au-dessus de la grille.
    ctx.fillStyle = previewState.playing ? C.forest : previewState.finished ? C.gold : C.wine;
    roundRect(ctx, indicatorX, indicatorY, indicatorW, 24, 999); ctx.fill();
    dbText(previewLabel, indicatorX + indicatorW / 2, indicatorY + 12,
      `700 10px ${F_DB}`, C.text, 'center');
  }

  function drawMoves(x, y, w, h) {
    dbCard(x, y, w, h, C.panel, R_CARD);
    const replay = state._dashboardReplay && typeof state._dashboardReplay === 'object'
      ? state._dashboardReplay : null;
    const events = replay && Array.isArray(replay.events)
      ? replay.events.filter((event) => event && typeof event === 'object') : [];
      const modeLabel = replay?.mode === 'pvai' ? traduire('Ordinateur', state.language)
      : replay?.mode === 'pvw' ? traduire('En ligne', state.language)
      : replay?.mode === 'spectator' ? traduire('Spectateur', state.language) : traduire('Local', state.language);
    const winner = replay?.result && (replay.result.winner === 0 || replay.result.winner === 1)
      ? traduire(NOM_JOUEUR[replay.result.winner], state.language) : null;
    const resultLabel = winner ? `${winner} ${traduire('gagne', state.language)}` : traduire('Partie en cours / nulle', state.language);
    const actionLabel = (event) => {
      if (event.type === 'move') return `${nomType(event.piece, state.language)} ${event.from || '?'}→${event.to || '?'}`;
      if (event.type === 'purchase') {
        const upgradeName = UPGRADES[event.upgrade]?.nom || event.upgrade || '';
        return `🛒 ${traduire('achat', state.language)} · ${traduire(upgradeName, state.language)}`;
      }
      if (event.type === 'power') return `⚡ ${traduire('pouvoir', state.language)} · ${traduire(event.power || '', state.language)}`;
      return traduire(event.type || 'action', state.language);
    };
    const compact = (text, max = 18) => text.length > max ? `${text.slice(0, max - 1)}…` : text;

    dbText(traduire('FEUILLE DE PARTIE', state.language), x + 18, y + 25, `700 13px ${F_DB}`, C.text);
    dbText(replay ? `${modeLabel} · ${resultLabel}` : traduire('Aucune partie enregistrée', state.language),
      x + 18, y + 45, `10px ${F_DB}`, replay ? C.muted : C.goldBright);
    ctx.strokeStyle = C.border; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(x + 14, y + 61); ctx.lineTo(x + w - 14, y + 61); ctx.stroke();

    if (!replay || !events.length) {
      dbText(replay ? traduire('Aucune action enregistrée', state.language) : traduire('Termine une partie pour afficher', state.language),
        x + w / 2, y + 175, `11px ${F_DB}`, C.muted, 'center');
      if (!replay) dbText(traduire('sa feuille de partie ici.', state.language), x + w / 2, y + 198,
        `10px ${F_DB}`, C.muted, 'center');
    } else {
      // Le panneau montre les 8 dernières actions, dans l’ordre réel du replay.
      const visible = events.slice(-8);
      const firstIndex = events.length - visible.length;
      for (let i = 0; i < visible.length; i++) {
        const event = visible[i];
        const yy = y + 84 + i * 28;
        const isLatest = i === visible.length - 1;
        if (isLatest) {
          ctx.fillStyle = 'rgba(201,161,90,0.14)';
          roundRect(ctx, x + 9, yy - 13, w - 18, 25, 7); ctx.fill();
        }
        dbText(`${firstIndex + i + 1}.`, x + 18, yy, `11px ${F_DB}`, C.gold);
        dbText(compact(actionLabel(event)), x + 48, yy, `600 11px ${F_DB}`,
          isLatest ? C.goldBright : C.text);
        dbText(`J${event.owner === 1 ? '2' : '1'}`, x + w - 16, yy,
          `10px ${F_DB}`, event.owner === 1 ? C.rose : C.muted, 'right');
      }
    }

    ctx.strokeStyle = C.border;
    ctx.beginPath(); ctx.moveTo(x + 14, y + h - 36); ctx.lineTo(x + w - 14, y + h - 36); ctx.stroke();
    const total = replay?.result?.totalActions ?? events.length;
    const durationMs = Number(replay?.result?.duration);
    const duration = Number.isFinite(durationMs) ? `${Math.floor(durationMs / 60000)}:${String(Math.floor(durationMs / 1000) % 60).padStart(2, '0')}` : '--:--';
    dbText(`${total} ${traduire('actions', state.language)} · ${duration}`, x + 16, y + h - 18, `10px ${F_DB}`, C.muted);
    if (replay && typeof state._dashboardReplayKey === 'string'
        && state._dashboardReplayKey.length > 0) {
      dbControl(x + w - 88, y + h - 32, 72, 24, traduire('REPLAY', state.language),
        { kind: 'startReplay', key: state._dashboardReplayKey },
        { fill: C.gold, font: `700 9px ${F_DB}`, radius: 7 });
    }
  }

  function drawSideMenu(x, y, w, h) {
    dbControl(x, y, w, 48, 'TUTORIEL', { kind: 'tutoriel' }, { fill: C.panelHi, font: `700 13px ${F_DB}` });
    dbControl(x, y + 60, w, 48, 'DEFI', { kind: 'apprendre' }, { fill: C.wine, font: `700 13px ${F_DB}` });

    // La carte Historique remplit la colonne jusqu'à Decks.
    // Decks s'aligne sur le bas des cartes Plateau / Feuille de partie,
    // puis conserve le même espacement de 16 px avant le panneau de jeu.
    const historyY = y + 120;
    const deckH = 48;
    const deckY = mainY + mainH - deckH;
    const historyH = Math.max(174, deckY - historyY - 8);
    dbCard(x, historyY, w, historyH, C.panel, R_CARD);
    dbText(traduire('HISTORIQUE DES PARTIES', state.language), x + 16, historyY + 25, `700 11px ${F_DB}`, C.text);
    // Source réelle : la même liste que l'écran REPLAYS, alimentée par les
    // parties finalisées dans localStorage. Chaque ligne ouvre directement le
    // replay concerné ; aucun nom ou score fictif n'est injecté dans le menu.
    const replays = Array.isArray(state._replayList) ? state._replayList : [];
    // Une entrée corrompue ne doit jamais casser le rendu du menu : seules les
    // synthèses avec une clé localStorage exploitable deviennent cliquables.
    const visibleReplays = replays
      .filter((replay) => replay && typeof replay === 'object'
        && typeof replay.key === 'string' && replay.key.length > 0);
    const modeLabel = (mode) => mode === 'spectator' ? traduire('Spectateur', state.language)
      : mode === 'pvai' ? traduire('Ordinateur', state.language)
      : mode === 'pvw' ? traduire('En ligne', state.language) : traduire('Local', state.language);
    const winnerIndex = (winner) => winner === 0 || winner === '0' ? 0
      : winner === 1 || winner === '1' ? 1 : null;
    const resultLabel = (winner) => {
      const index = winnerIndex(winner);
      return index === null ? traduire('Partie', state.language) : `${traduire(NOM_JOUEUR[index], state.language)} ${traduire('gagne', state.language)}`;
    };
    const shortDate = (timestamp) => {
      const date = new Date(Number(timestamp));
      if (!Number.isFinite(date.getTime())) return 'date inconnue';
      return date.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit' });
    };

    if (!visibleReplays.length) {
      dbText(traduire('Aucune partie enregistrée', state.language), x + w / 2, historyY + 92,
        `11px ${F_DB}`, C.muted, 'center');
      dbText(traduire('Termine une partie pour la retrouver ici.', state.language), x + w / 2, historyY + 114,
        `10px ${F_DB}`, C.muted, 'center');
    } else {
      // Retour à l'ancien rendu : lignes compactes séparées, plutôt qu'une
      // liste remplie en bandes continues. La carte affiche autant de parties
      // que sa hauteur le permet avant le bouton final.
      const listTop = historyY + 40;
      const listBottom = historyY + historyH - 40;
      const rowH = 24;
      const rowGap = 1;
      const maxVisible = Math.max(1, Math.floor((listBottom - listTop + rowGap) / (rowH + rowGap)));
      const rows = visibleReplays.slice(0, maxVisible);
      for (let i = 0; i < rows.length; i++) {
        const replay = rows[i];
        const rowY = listTop + i * (rowH + rowGap);
        state.ui.buttons.push({
          x: x + 10, y: rowY, w: w - 20, h: rowH,
          action: { kind: 'startReplay', key: replay.key }, enabled: true, radius: 7,
        });
        const mode = modeLabel(replay.mode);
        const actions = `${Number(replay.totalActions) || 0} act.`;
        const result = resultLabel(replay.winner);
        const date = shortDate(replay.startTime);
        dbText(`${mode} · ${date}`, x + 16, rowY + 12, `10px ${F_DB}`, C.muted);
        dbText(result, x + w - 52, rowY + 12, `600 10px ${F_DB}`,
          winnerIndex(replay.winner) === null ? C.muted : C.forest, 'right');
        dbText(actions, x + w - 16, rowY + 20, `8px ${F_DB}`, C.muted, 'right');
      }
    }
    dbControl(x + 12, historyY + historyH - 40, w - 24, 30, 'Toutes les parties', { kind: 'ouvrirReplays' }, { fill: C.card, font: `600 10px ${F_DB}`, radius: 8 });
    dbControl(x, deckY, w, deckH, 'DECKS  ›', { kind: 'ouvrirDecks' }, { fill: C.panelHi, font: `700 13px ${F_DB}` });
  }

  function drawModeBar() {
    // Même largeur que la carte Plateau : les modes se lisent comme sa
    // navigation locale, juste sous l'aperçu, au lieu d'une barre globale.
    const x = 24, y = modeY, w = CANVAS_W - 48, h = 304;
    dbCard(x, y, w, h, C.panel, R_CARD);
    const modes = [
      { id: 'pvw', label: traduire('EN LIGNE', state.language) },
      { id: 'pvp', label: traduire('LOCAL', state.language) },
      { id: 'pvai', label: traduire('ORDINATEUR', state.language) },
    ];
    const tabW = (w - 36) / 3;
    modes.forEach((mode, i) => dbControl(x + 12 + i * (tabW + 6), y + 12, tabW, 38, mode.label,
      { kind: 'selectMode', mode: mode.id }, { fill: activeMode === mode.id ? C.wine : C.field, selected: activeMode === mode.id, radius: 10, font: `700 11px ${F_DB}` }));
    const contentX = x + 16, contentY = y + 68, contentW = w - 32;
    dbCard(contentX, contentY, contentW, 142, C.field, R_INNER);
    if (activeMode === 'pvp') {
      dbText('JOUEUR 1', contentX + 170, contentY + 39, `600 18px ${F_DB_BRAND}`, C.text, 'center');
      dbText('VS', contentX + contentW / 2, contentY + 39, `700 11px ${F_DB}`, C.goldBright, 'center');
      dbText('JOUEUR 2', contentX + contentW - 170, contentY + 39, `600 18px ${F_DB_BRAND}`, C.text, 'center');
      dbText('Partie locale · chacun son tour', contentX + contentW / 2, contentY + 72, `11px ${F_DB}`, C.muted, 'center');
      dbCta(contentX + (contentW - 220) / 2, contentY + 93, 220, 36, 'Jouer', { kind: 'pickMode', mode: 'pvp' }, { fill: C.card, stroke: C.border, shadow: C.wineDark });
    } else if (activeMode === 'pvw') {
      dbText('PRÊT À CHERCHER UN ADVERSAIRE', contentX + 30, contentY + 38, `700 13px ${F_DB}`, C.text);
      dbText('Classement estimé · partie en ligne', contentX + 30, contentY + 66, `11px ${F_DB}`, C.muted);
      dbCta(contentX + contentW - 250, contentY + 48, 220, 40, 'Lancer une recherche', { kind: 'startSearch' }, { fill: C.gold, stroke: C.goldBright, shadow: C.wineDark });
      if (state.resumeAvailable) {
        dbCta(contentX + contentW - 250, contentY + 94, 220, 36, 'Reprendre la partie',
          { kind: 'resumeMatch' }, { fill: C.forest, stroke: C.forestDark, shadow: C.wineDark });
      }
      // Badge CLASSÉ / HORS COMPÉTITION (GDD §7.2) : reflète dès le menu la config
      // choisie (variante + taille) — une partie en ligne n'est classée que si
      // Standard × Standard × 8×8, sinon HORS COMPÉTITION (aucun trophée en jeu).
      dessineBadgeClasse(ctx, state, contentX + contentW / 2, contentY + 129,
        variantIdFromMenu(state),
        (state.menu && state.menu.taille) || 'std');
    } else {
      const diff = state.menu && state.menu.difficulty;
      const diffGap = 6;
      const diffW = (contentW - 48 - diffGap * 2) / 3;
      dbText('DIFFICULTÉ', contentX + 24, contentY + 21, `700 10px ${F_DB}`, C.muted);
      ['Débutant', 'Intermédiaire', 'Avancé'].forEach((label, i) => dbControl(contentX + 24 + i * (diffW + diffGap), contentY + 35, diffW, 38, label.toUpperCase(),
        { kind: 'pickDifficulty', level: i + 1 }, { fill: diff === i + 1 ? C.wine : C.card, selected: diff === i + 1, radius: 9, font: `700 10px ${F_DB}` }));
      dbCta(contentX + 24, contentY + 93, 220, 36, 'Spectateur', { kind: 'pickMode', mode: 'spectator' },
        { enabled: !!diff, fill: C.card, stroke: C.border, shadow: C.wineDark });
      dbCta(contentX + contentW - 250, contentY + 93, 220, 36, 'Jouer contre l’ordinateur', { kind: 'pickMode', mode: 'pvai' },
        { enabled: !!diff, fill: C.forest, stroke: C.forestDark });
    }

    // Réglages de partie compacts : ils restent disponibles sans recréer une
    // section « Variantes » séparée de la navigation des modes.
    const optionY = y + 218;
    const optionX = x + 16;
    const optionLabelW = 54;
    const optionGap = 4;
    const combatY = optionY;
    const combatW = (contentW - optionLabelW - optionGap - 8) / 2;
    dbText('ECUS', optionX, combatY + 12, `700 9px ${F_DB}`, C.muted);
    COMBATS.forEach((item, i) => dbControl(
      optionX + optionLabelW + i * (combatW + optionGap), combatY, combatW, 24,
      traduire(item.label, state.language).toUpperCase(), { kind: 'pickCombat', value: item.id },
      { fill: item.id === varCbt ? C.wine : C.field, selected: item.id === varCbt, radius: 7, font: `700 8px ${F_DB}` },
    ));

    const tailleY = combatY + 28;
    const tailleW = (contentW - optionLabelW - optionGap * 2 - 8) / 3;
    dbText('PLATEAU', optionX, tailleY + 12, `700 9px ${F_DB}`, C.muted);
    [['std', '8 × 8'], ['l15', '15 × 8'], ['bonus', 'BONUS']].forEach(([id, label], i) => dbControl(
      optionX + optionLabelW + i * (tailleW + optionGap), tailleY, tailleW, 24,
      label, { kind: 'pickTaille', value: id },
      { fill: id === varTail ? C.gold : C.field, selected: id === varTail, radius: 7,
        font: `700 ${id === 'bonus' ? 7 : 9}px ${F_DB}`, textColor: id === varTail ? C.bg : C.text },
    ));
  }

  // Fond et en-tête.
  ctx.fillStyle = C.bg; ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);
  const glowA = ctx.createRadialGradient(120, -20, 0, 120, 240, 560);
  glowA.addColorStop(0, `${UI_THEME.wine}6B`); glowA.addColorStop(1, `${UI_THEME.wine}00`);
  ctx.fillStyle = glowA; ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);
  const glowB = ctx.createRadialGradient(CANVAS_W, 30, 0, CANVAS_W - 90, 220, 500);
  glowB.addColorStop(0, `${UI_THEME.primaryDark}42`); glowB.addColorStop(1, `${UI_THEME.primaryDark}00`);
  ctx.fillStyle = glowB; ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);
  // Wordmark : icône du jeu à côté de « ROY / CHEC ».
  const logoSize = 34, logoGap = 8, logoX = 32, logoY = 66;
  if (faviconPrête()) {
    ctx.drawImage(faviconImg, logoX, logoY - logoSize / 2, logoSize, logoSize);
    const royX = logoX + logoSize + logoGap;
    ctx.font = `600 36px ${F_DB_BRAND}`;
    ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
    const royW = ctx.measureText('ROY').width;
    dbText('ROY', royX, logoY, `600 36px ${F_DB_BRAND}`);
    dbText('CHEC', royX + royW, logoY, `italic 500 36px ${F_DB_BRAND}`, C.goldBright);
  } else {
    dbText('♞ ROY', 32, 66, `600 36px ${F_DB_BRAND}`);
    dbText('CHEC', 139, 66, `italic 500 36px ${F_DB_BRAND}`, C.goldBright);
  }
  // Zone centrale HTML : plateau / feuille / panneau latéral.
  const boardX = 24, boardW = 430;
  dbCard(boardX, mainY, boardW, mainH, C.panel, R_CARD);
  dbText('PLATEAU', boardX + 20, mainY + 25, `700 13px ${F_DB}`, C.text);    drawPreviewBoard(boardX + 18, mainY + 52, boardW - 36, mainH - 98, state);
  //dbText('●  Trait aux blancs', boardX + 20, mainY + mainH - 24, `11px ${F_DB}`, C.goldBright);
  //dbText(`Partie libre · ${tailleLabel}`, boardX + boardW - 20, mainY + mainH - 24, `10px ${F_DB}`, C.muted, 'right');

  drawMoves(466, mainY, 210, mainH);
  drawSideMenu(692, mainY, 284, mainH);
  drawModeBar();
  dessineBandeauCompte(ctx, state);
}

// --- Écrans de matchmaking PvP en ligne (cycle W1, spec-pvp-online §9.2) ---

// CLASSÉ / HORS COMPÉTITION (GDD §7.2 + spec-pvp-online §3.1) : une partie en ligne
// n'est « classée » QUE si la variante est « Standard × Standard » ET le plateau
// 8×8 ('std'). Toute autre combinaison (variante modifiée ou plateau 8×15) est hors
// compétition — aucun trophée en jeu. La file publique force toujours la variante
// standard ; seule la taille choisie au menu peut l'en sortir. Le privé dépend de la
// variante + taille imposées par le créateur.
function estClassee(variantId, tailleId) {
  return (variantId == null || variantId === 'pvp_standard')
    && (tailleId == null || tailleId === 'std');
}

// Badge pill centré : « 🏆 CLASSÉ — N trophées » (ambre) quand la config est classée,
// « HORS COMPÉTITION » (neutre) sinon. Les trophées affichés sont ceux du joueur
// connecté (state.account).
function dessineBadgeClasse(ctx, state, cx, y, variantId, tailleId) {
  const classe = estClassee(variantId, tailleId);
  const acc = state.account || {};
  const txt = classe
    ? `🏆 ${traduire('CLASSÉ', state.language)} — ${acc.trophies || 0} ${traduire('trophées', state.language)}`
    : traduire('HORS COMPÉTITION', state.language);
  ctx.font = `700 12px ${F_TEXTE}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const bw = ctx.measureText(txt).width + 30;
  const bh = 24;
  ctx.fillStyle = classe ? UI_THEME.amber : UI_THEME.card;
  roundRect(ctx, cx - bw / 2, y - bh / 2, bw, bh, 12); ctx.fill();
  ctx.lineWidth = 1.5;
  ctx.strokeStyle = classe ? UI_THEME.amberDark : UI_THEME.border;
  roundRect(ctx, cx - bw / 2, y - bh / 2, bw, bh, 12); ctx.stroke();
  ctx.fillStyle = classe ? UI_THEME.buttonText : UI_THEME.muted;
  ctx.fillText(txt, cx, y + 1);
}

function dessineMatchmaking(ctx, state) {
  const mm = state.matchmaking || {};
  const mobileLobby = !!(state.ui && state.ui.mobileLayout);
  const cx = CANVAS_W / 2, cy = CANVAS_H / 2;
  const contentW = Math.max(280, CANVAS_W - 32);
  const lobbyW = mobileLobby ? Math.min(340, contentW) : 320;
  const titleY = mobileLobby ? 196 : 180;

  // Fond UI centralisé.
  ctx.fillStyle = UI_THEME.background;
  ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);

  // [23:55] Bannière d'erreur matchmaking — affiche state.matchmaking.error
  // (set par main.js : « Connectez-vous d'abord » ou « Service indisponible »).
  // Position : y=180→228 (SOUS le wordmark baseline y=150 cap-h≈28 → bottom≈155).
  // Fix collision bannière↔wordmark identifiée par code-reviewer RECHECK.
  // Texte multi-lignes via wrapText (cap 3 lignes pour erreurs futures plus longues).
  if (mm.error) {
    const bx = mobileLobby ? 16 : 200;
    const by = mobileLobby ? 112 : 180;
    const bw = mobileLobby ? CANVAS_W - 32 : 600;
    const bh = mobileLobby ? 58 : 48;
    carte(ctx, bx, by, bw, bh, mobileLobby ? 8 : 10, UI_THEME.card, { shadow: true });
    ctx.strokeStyle = UI_THEME.danger;
    ctx.lineWidth = 2.5;
    roundRect(ctx, bx, by, bw, bh, mobileLobby ? 8 : 10); ctx.stroke();ctx.fillStyle = UI_THEME.danger;
     ctx.font = `600 14px ${F_TEXTE}`;
    ctx.textAlign = 'center'; ctx.textBaseline = 'top';
    // ⚠ + message, wrap sur 2-3 lignes si trop long.
    ctx.fillText('⚠', bx + 24, by + 9);
    wrapText(ctx, traduire(mm.error, state.language), bx + 44, by + 10, bw - 60, mobileLobby ? 15 : 16, 2);
  }

  // Wordmark.
  dessineWordmark(ctx, cx, 86, 36, 'center');

  const wB = lobbyW, hB = mobileLobby ? 56 : 52;

  if (mm.mode === 'lobby') {
    // LOBBY EN LIGNE — 100 % local, aucun appel réseau (spec-pvp-online §9.2).
    // Trois choix clairs : recherche publique, partie entre amis, rejoindre par code.
    const acc = state.account || {};
    ctx.fillStyle = UI_THEME.text; ctx.font = `18px ${F_DISPLAY}`;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(traduire('JOUER EN LIGNE', state.language), cx, titleY);

    // Sous-titre : pseudo + trophées du joueur connecté.
    if (acc.status === 'connected') {
      ctx.fillStyle = UI_THEME.muted; ctx.font = `13px ${F_TEXTE}`;
      ctx.fillText(`♟ ${acc.pseudo || ''}  ·  🏆 ${acc.trophies || 0} ${traduire('Trophées', state.language).toLowerCase()}`, cx, titleY + 28);
    }

    // 3 gros boutons distincts.
    bouton(state, ctx, cx - wB / 2, mobileLobby ? 254 : 244, wB, 58, '🔍 Lancer une recherche',
      { kind: 'startSearch' }, { color: UI_THEME.amber, textColor: UI_THEME.buttonText,
        sub: traduire('trouver un adversaire au hasard', state.language) });
    bouton(state, ctx, cx - wB / 2, mobileLobby ? 324 : 314, wB, 58, '👥 Jouer avec un ami',
      { kind: 'createPrivateMatch' }, { color: UI_THEME.primary, textColor: UI_THEME.text,
        sub: traduire('créer une partie privée', state.language) });

    bouton(state, ctx, cx - wB / 2, mobileLobby ? 394 : 384, wB, 58, '🔑 Rejoindre par code',
      { kind: 'showJoinCode' },
      { color: UI_THEME.card, textColor: UI_THEME.text, sub: traduire("entrer un code d'invitation", state.language) });

    // Retour au menu.
    bouton(state, ctx, cx - wB / 2, mobileLobby ? 470 : 460, wB, hB, '← Retour',
      { kind: 'quitterLobby' },
      { color: UI_THEME.card, textColor: UI_THEME.text });

    if (mm.error) {
      ctx.fillStyle = UI_THEME.danger; ctx.font = `13px ${F_TEXTE}`;
      ctx.fillText(traduire(mm.error, state.language), cx, 530);
    }

  } else if (mm.mode === 'cadence') {
    // Écran CADENCE (spec §6) — 100 % local, s'intercale entre le lobby et le réseau.
    // Le titre rappelle l'action d'origine ; deux joueurs ne s'apparient que sur la
    // même cadence (file publique) / le créateur impose la sienne (partie privée).
    ctx.fillStyle = UI_THEME.text; ctx.font = `18px ${F_DISPLAY}`;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';      ctx.fillText(traduire('CADENCE DE JEU', state.language), cx, titleY);

    // Sélecteur compact des deux cadences disponibles (sans incrément).
    const gw = mobileLobby ? Math.min(310, contentW) : 155;
    const gh = 58, gap = 10;
    PVW_CADENCES.forEach((c, i) => {
      const col = mobileLobby ? 0 : i % 2;
      const row = mobileLobby ? i : Math.floor(i / 2);
      const cadenceX = mobileLobby ? cx - gw / 2 : cx - gw - gap / 2 + col * (gw + gap);
      const cadenceY = mobileLobby ? 248 + row * (gh + gap) : 244 + row * (gh + gap + 4);
      bouton(state, ctx,
        cadenceX, cadenceY, gw, gh,
        `${c.emoji} ${traduire(c.label, state.language)}`,
        { kind: 'pickCadence', cadence: c.s },
        { color: c.s === 300 ? UI_THEME.amber : UI_THEME.card, textColor: c.s === 300 ? UI_THEME.buttonText : UI_THEME.text, sub: traduire(c.sub, state.language) });
    });

    // Les variantes et la taille sont choisies dans le menu principal avant
    // d'entrer ici. L'écran de cadence ne modifie aucune option de partie.
    const retourY = mobileLobby ? 400 : 322;

    // Retour au lobby (aucun réseau engagé à ce stade).
    bouton(state, ctx, cx - wB / 2, retourY, wB, hB, '← Retour',
      { kind: 'cancelMatchmaking' },
      { color: UI_THEME.card, textColor: UI_THEME.text, sub: traduire('revenir au lobby', state.language) });

  } else if (mm.mode === 'search') {
    // Écran RECHERCHE (spec §9.2).
    const elapsed = Math.floor((Date.now() - (mm.searchStart || Date.now())) / 1000);
    const band = mm.band || 100;
    const bandLabel = band >= 99999 ? traduire('tous niveaux', state.language) : `±${band}`;

    ctx.fillStyle = UI_THEME.text; ctx.font = `16px ${F_DISPLAY}`;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(traduire('RECHERCHE D\'UN ADVERSAIRE…', state.language), cx, 194);

    // Spinner simple (texte animé).
    const dots = ['.', '..', '...'][Math.floor(Date.now() / 500) % 3];
    ctx.fillStyle = UI_THEME.muted; ctx.font = `28px ${F_TEXTE}`;
    ctx.fillText(dots, cx, 230);

    // Infos (la cadence choisie borne la file : rappel visible pendant l'attente).
    ctx.fillStyle = UI_THEME.muted; ctx.font = `13px ${F_TEXTE}`;
    const searchInfo = `${traduire('Temps écoulé', state.language)} : ${elapsed}s  ·  ${traduire('Niveau', state.language)} : ${traduire(bandLabel, state.language)}  ·  ⏱ ${traduire(cadenceLabel(mm.cadence || 300), state.language)}`;
    if (mobileLobby) {
      wrapText(ctx, searchInfo, 24, 250, CANVAS_W - 48, 16, 3);
    } else {
      ctx.fillText(searchInfo, cx, 270);
    }

    // Badge CLASSÉ / HORS COMPÉTITION : la file bonus est publique mais dédiée,
    // et reste volontairement hors classement.
    dessineBadgeClasse(ctx, state, cx, mobileLobby ? 310 : 296, 'pvp_standard',
      mm.taille || (state.menu && state.menu.taille) || 'std');

    // Bouton Annuler : ramène AU LOBBY (retire de la file publique via cancelWait).
    bouton(state, ctx, cx - wB / 2, mobileLobby ? 348 : 320, wB, hB, '✕ Annuler',
      { kind: 'cancelMatchmaking' },
      { color: UI_THEME.card, textColor: UI_THEME.text, sub: traduire('revenir au lobby', state.language) });

    if (mm.error) {
      ctx.fillStyle = UI_THEME.danger; ctx.font = `13px ${F_TEXTE}`;
      if (mobileLobby) wrapText(ctx, traduire(mm.error, state.language), 24, 420, CANVAS_W - 48, 16, 2);
      else ctx.fillText(traduire(mm.error, state.language), cx, 400);
    }

  } else if (mm.mode === 'private_create') {
    // Écran CRÉATION partie privée.
    ctx.fillStyle = UI_THEME.text; ctx.font = `16px ${F_DISPLAY}`;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(traduire('PARTIE PRIVÉE CRÉÉE', state.language), cx, mobileLobby ? 190 : 194);

    if (mm.privateCode) {
      // Code en gros.
      ctx.fillStyle = UI_THEME.amber; ctx.font = `42px ${F_DISPLAY}`;
      ctx.fillText(mm.privateCode, cx, mobileLobby ? 244 : 250);
      ctx.fillStyle = UI_THEME.muted; ctx.font = `13px ${F_TEXTE}`;
      ctx.fillText(traduire('Partage ce code avec ton adversaire', state.language), cx, mobileLobby ? 278 : 284);
      const varSuffix = mm.variant && mm.variant !== 'pvp_standard'
        ? `  ·  ⚔ ${traduire(variantLabel(mm.variant), state.language)}` : '';
      if (mobileLobby) wrapText(ctx, `${traduire('Cadence', state.language)} : ⏱ ${traduire(cadenceLabel(mm.cadence || 300), state.language)}${varSuffix}  ·  ${traduire('En attente', state.language)}…`, 24, 304, CANVAS_W - 48, 16, 2);
      else ctx.fillText(`${traduire('Cadence', state.language)} : ⏱ ${traduire(cadenceLabel(mm.cadence || 300), state.language)}${varSuffix}  ·  ${traduire('En attente', state.language)}…`, cx, 308);
    } else {
      ctx.fillStyle = UI_THEME.muted; ctx.font = `15px ${F_TEXTE}`;
      ctx.fillText(traduire('Création en cours…', state.language), cx, 240);
    }

    // Badge CLASSÉ / HORS COMPÉTITION : config imposée par le créateur (variante +
    // taille sélectionnées au menu / écran cadence).
    dessineBadgeClasse(ctx, state, cx, mobileLobby ? 350 : 334,
      mm.variant || variantIdFromMenu(state),
      mm.taille || (state.menu && state.menu.taille) || 'std');

    bouton(state, ctx, cx - wB / 2, mobileLobby ? 382 : 354, wB, hB, '✕ Annuler',
      { kind: 'cancelMatchmaking' },
      { color: UI_THEME.card, textColor: UI_THEME.text });

    if (mm.error) {
      ctx.fillStyle = UI_THEME.danger; ctx.font = `13px ${F_TEXTE}`;
      if (mobileLobby) wrapText(ctx, traduire(mm.error, state.language), 24, 460, CANVAS_W - 48, 16, 2);
      else ctx.fillText(traduire(mm.error, state.language), cx, 430);
    }

  } else if (mm.mode === 'private_join') {
    // Écran REJOINDRE partie privée.
    ctx.fillStyle = UI_THEME.text; ctx.font = `16px ${F_DISPLAY}`;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(traduire('REJOINDRE UNE PARTIE', state.language), cx, mobileLobby ? 190 : 194);

    ctx.fillStyle = UI_THEME.muted; ctx.font = `14px ${F_TEXTE}`;
    ctx.fillText(traduire('Entre le code à 6 caractères :', state.language), cx, mobileLobby ? 228 : 230);

    // Bouton qui déclenche un prompt (simplifié — pas de DOM input en v1).
    bouton(state, ctx, cx - (mobileLobby ? Math.min(155, contentW / 2) : 120), mobileLobby ? 266 : 264,
      mobileLobby ? Math.min(310, contentW) : 240, 52, 'Entrer le code',
      { kind: 'joinByCode', code: '' },
      { color: UI_THEME.amber, textColor: UI_THEME.buttonText, sub: traduire('cliquer pour saisir', state.language) });

    // Note : le prompt est déclenché par un listener spécial dans main.js.
    // On override le code vide → au clic, un prompt s'ouvre, puis on rappelle
    // actionBouton avec le code saisi. Géré par le handler mousedown.

    bouton(state, ctx, cx - wB / 2, mobileLobby ? 344 : 330, wB, hB, '← Retour',
      { kind: 'cancelMatchmaking' },
      { color: UI_THEME.card, textColor: UI_THEME.text, sub: traduire('revenir au lobby', state.language) });

    if (mm.error) {
      ctx.fillStyle = UI_THEME.danger; ctx.font = `13px ${F_TEXTE}`;
      if (mobileLobby) wrapText(ctx, traduire(mm.error, state.language), 24, 420, CANVAS_W - 48, 16, 2);
      else ctx.fillText(traduire(mm.error, state.language), cx, 390);
    }

  } else if (mm.mode === 'matched') {
    // Écran MATCH TROUVÉ (spec §9.2).
    ctx.fillStyle = UI_THEME.primary; ctx.font = `22px ${F_DISPLAY}`;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(traduire('✓ ADVERSAIRE TROUVÉ !', state.language), cx, mobileLobby ? 190 : 194);

    // Infos adversaire.
    ctx.fillStyle = UI_THEME.text; ctx.font = `18px ${F_DISPLAY}`;
    ctx.fillText(`♟ ${(mm.oppPseudo || traduire('Adversaire', state.language)).toUpperCase()}`, cx, mobileLobby ? 240 : 244);
    ctx.fillStyle = UI_THEME.amberDark; ctx.font = `15px ${F_DISPLAY}`;
    ctx.fillText(`🏆 ${mm.oppTrophies || 0} ${traduire('Trophées', state.language).toLowerCase()}`, cx, mobileLobby ? 270 : 274);

    // Variante héritée (partie privée non-standard) : le rejoignant découvre ici
    // la variante imposée par le créateur (GDD §7.2 v3.1).
    if (mm.variant && mm.variant !== 'pvp_standard') {
      ctx.fillStyle = UI_THEME.danger; ctx.font = `13px ${F_TEXTE}`;
      ctx.fillText(`⚔ ${traduire('Variante', state.language)} : ${traduire(variantLabel(mm.variant), state.language)}`, cx, mobileLobby ? 300 : 296);
    }

    // Compte à rebours visuel.
    ctx.fillStyle = UI_THEME.muted; ctx.font = `14px ${F_TEXTE}`;
    ctx.fillText(traduire('Connexion en cours…', state.language), cx, mobileLobby ? 330 : 318);

    // Badge CLASSÉ / HORS COMPÉTITION : config confirmée par le serveur (privé :
    // imposée par le créateur ; public : Standard × Standard × 8×8).
    dessineBadgeClasse(ctx, state, cx, mobileLobby ? 360 : 342,
      mm.variant || 'pvp_standard',
      mm.taille || (state.menu && state.menu.taille) || 'std');
  }

  // Bandeau compte (toujours visible).
  dessineBandeauCompte(ctx, state);
}

// Écran REPLAYS dédié (phase 'replays') — plein écran, même modèle que le lobby
// en ligne. Liste jusqu'à 20 parties (tout le stock localStorage) sur 2 colonnes,
// clic = lancement du replay, « ← Retour » (ou Échap) = menu d'accueil.
// Palette locale : même thème hybride que le menu et l'éditeur Decks, sans modifier
// le chrome clair des autres écrans.
// Références dynamiques : le sélecteur clair/sombre modifie UI_THEME à chaud.
const REPLAY_UI = {};
for (const [alias, token] of Object.entries({
  bg: 'background', panel: 'panel', card: 'card', field: 'field',
  ink: 'text', muted: 'muted', border: 'border',
  green: 'primary', greenD: 'primaryDark', blue: 'secondary',
  rose: 'danger', roseD: 'dangerDark', amber: 'amberLight', amberD: 'amberDark',
  cardShadow: 'shadow', darkInk: 'buttonText', roseInk: 'dangerText',
})) Object.defineProperty(REPLAY_UI, alias, { enumerable: true, get: () => UI_THEME[token] });

function dessineReplays(ctx, state) {
  const cx = CANVAS_W / 2;
  // Sur téléphone, l'écran utilise le canvas mobile : liste verticale en une
  // seule colonne. Sur ordinateur, on garde la grille 2 colonnes historique.
  const mobile = !!(state.ui && state.ui.mobile);

  // Fond graphite + panneau flottant : adaptation sombre de la liste Replays.
  ctx.fillStyle = REPLAY_UI.bg;
  ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);
  carte(ctx, 24, 24, CANVAS_W - 48, mobile ? CANVAS_H - 48 : 744, 22, REPLAY_UI.panel,
    { shadow: false, stroke: REPLAY_UI.border });
  ctx.fillStyle = REPLAY_UI.ink; ctx.font = `36px ${F_DISPLAY}`;
  ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic';
  ctx.fillText('REPLAYS', cx, 86);

  ctx.fillStyle = REPLAY_UI.muted; ctx.font = `13px ${F_TEXTE}`;
  ctx.fillText(traduire('Les 20 parties les plus récentes sont conservées', state.language), cx, 148);

  const replays = state._replayList || [];
  if (!replays.length) {
    ctx.fillStyle = REPLAY_UI.muted; ctx.font = `15px ${F_TEXTE}`;
    ctx.fillText(traduire('Aucun replay pour l\'instant — joue une partie !', state.language), cx, 200);
  }

  if (mobile) {
    // Sur téléphone : les replays s'affichent les uns sous les autres, en
    // pleine largeur. La hauteur du canvas suit le nombre de parties, la page
    // défile pour atteindre la fin de la liste.
    // Les cartes de parties restent à l'intérieur de l'encadré REPLAYS
    // (panneau 24 → CANVAS_W-24) : marge de 12 px de chaque côté.
    const padX = 36;
    const rW = CANVAS_W - padX * 2;
    const rH = 46, rGap = 8, parCol = 20;
    const locale = state.language === 'en' ? 'en-GB' : 'fr-FR';
    for (let i = 0; i < replays.length && i < parCol; i++) {
      const rp = replays[i];
      const ry = 222 + i * (rH + rGap);
      const d = new Date(rp.startTime);
      const dateStr = `${d.toLocaleDateString(locale, { day: '2-digit', month: '2-digit' })} ${d.toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' })}`;
      const modeStr = rp.mode === 'spectator' ? traduire('Spect.', state.language)
        : rp.mode === 'pvai' ? traduire('PvAI', state.language)
        : rp.mode === 'pvw' ? traduire('En ligne', state.language) : traduire('PvP', state.language);
      const diffStr = rp.difficulty ? ` ${traduire('niv.', state.language)}${rp.difficulty}` : '';
      const winnerStr = rp.winner !== null ? `  ·  🏆 ${traduire(NOM_JOUEUR[rp.winner], state.language)}` : '';
      const label = `${modeStr}${diffStr}  ·  ${rp.totalActions} ${traduire('act.', state.language)}  ·  ${dateStr}${winnerStr}`;
      state.ui.buttons.push({
        x: padX, y: ry, w: rW, h: rH,
        action: { kind: 'startReplay', key: rp.key }, enabled: true, radius: 10,
      });
      // Carte interactive : surface étagée et lisible sur graphite.
      ctx.fillStyle = REPLAY_UI.cardShadow;
      roundRect(ctx, padX, ry + 3, rW, rH, 10); ctx.fill();
      ctx.fillStyle = REPLAY_UI.card;
      roundRect(ctx, padX, ry, rW, rH, 10); ctx.fill();
      ctx.lineWidth = 1.5; ctx.strokeStyle = REPLAY_UI.border;
      roundRect(ctx, padX, ry, rW, rH, 10); ctx.stroke();
      ctx.fillStyle = REPLAY_UI.ink; ctx.font = `12px ${F_TEXTE}`;
      ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
      ctx.fillText(traduire(label, state.language), padX + 12, ry + rH / 2);
    }
    // Retour en bas de la liste défilante (ou à la place de la liste si vide).
    const wB = Math.min(320, CANVAS_W - 72), hB = 52;
    const backY = replays.length
      ? 222 + Math.min(replays.length, parCol) * (rH + rGap) + 16 : 420;
    bouton(state, ctx, cx - wB / 2, backY, wB, hB, '← Retour',
      { kind: 'fermerReplays' },
      { color: REPLAY_UI.green, textColor: REPLAY_UI.ink, outlineColor: REPLAY_UI.greenD,
        sub: 'revenir au menu', subColor: REPLAY_UI.muted });
  } else {
    // 2 colonnes de 10 lignes max (20 entrées ≤ CANVAS_H).
    const rW = 430, rH = 36, rGap = 8, parCol = 10;
    const colX = [cx - rW - 12, cx + 12];
    for (let i = 0; i < replays.length && i < 20; i++) {
      const rp = replays[i];
      const col = Math.floor(i / parCol);
      const x = colX[col];
      const ry = 222 + (i % parCol) * (rH + rGap);
      const d = new Date(rp.startTime);
      const locale = state.language === 'en' ? 'en-GB' : 'fr-FR';
      const dateStr = `${d.toLocaleDateString(locale, { day: '2-digit', month: '2-digit' })} ${d.toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' })}`;
      const modeStr = rp.mode === 'spectator' ? traduire('Spect.', state.language)
        : rp.mode === 'pvai' ? traduire('PvAI', state.language)
        : rp.mode === 'pvw' ? traduire('En ligne', state.language) : traduire('PvP', state.language);
      const diffStr = rp.difficulty ? ` ${traduire('niv.', state.language)}${rp.difficulty}` : '';
      const winnerStr = rp.winner !== null ? `  ·  🏆 ${traduire(NOM_JOUEUR[rp.winner], state.language)}` : '';
      const label = `${modeStr}${diffStr}  ·  ${rp.totalActions} ${traduire('act.', state.language)}  ·  ${dateStr}${winnerStr}`;
      state.ui.buttons.push({
        x, y: ry, w: rW, h: rH,
        action: { kind: 'startReplay', key: rp.key }, enabled: true, radius: 8,
      });
      // Carte interactive : surface étagée et lisible sur graphite.
      ctx.fillStyle = REPLAY_UI.cardShadow;
      roundRect(ctx, x, ry + 3, rW, rH, 8); ctx.fill();
      ctx.fillStyle = REPLAY_UI.card;
      roundRect(ctx, x, ry, rW, rH, 8); ctx.fill();
      ctx.lineWidth = 1.5; ctx.strokeStyle = REPLAY_UI.border;
      roundRect(ctx, x, ry, rW, rH, 8); ctx.stroke();
      ctx.fillStyle = REPLAY_UI.ink; ctx.font = `12px ${F_TEXTE}`;
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(traduire(label, state.language), x + rW / 2, ry + rH / 2);
    }

    // Retour au menu (sous les 2 colonnes de 10 → 222 + 10×44 = 662).
    const wB = 320, hB = 52;
    bouton(state, ctx, cx - wB / 2, 700, wB, hB, '← Retour',
      { kind: 'fermerReplays' },
      { color: REPLAY_UI.green, textColor: REPLAY_UI.ink, outlineColor: REPLAY_UI.greenD,
        sub: 'revenir au menu', subColor: REPLAY_UI.muted });
  }

  dessineBandeauCompte(ctx, state);
}

// Point d'entrée du rendu, appelé chaque frame.
// Phase A.5 v2 Phase 4 : computeGeometry() en TOUTE PREMIÈRE LIGNE pour que toutes
// les fonctions tilePath / cellCenter / pixelVersCase / vueCase / PANEL_X aient la
// géométrie à jour pendant le rendu. computeGeometry() lit state.board[0].length et
// state.board.length — c'est déterministe des deux côtés de la ligne (lockstep OK).
// --- Deck editor UI (recovery 29/07 [23:30]) ---
// Dessine le contenu principal de l'écran DECKS : barre 5 onglets (1..5 cliquables)
// + grille 2×3 des 6 types de pièce avec leurs 3 slots D/A/S cliquables.
// Le state.decksRoot est sanitizé UNE fois au mount de la phase (main.js handler
// `ouvrirDecks`), pas à chaque frame — évite le cost sanitizeRoot + loadDecks redondant.
// SPEC vault [21:40-21:45] : TAB_W=50 / TAB_H=38 / 5 cases 282 px centré sur CANVAS_W=1000
// (tabsX0 = (1000 - 5*50 - 4*8) / 2 = 359). gridY=295 (laisse 47 px pour les onglets + titre).
// === Deck Editor UI — redesign PDF 0030.pdf (Phase 6, 2026-07-30) ===
// Layout : 5 tabs centrés en haut, puis 3 lignes × 2 cards (P/T, C/F, Q/R).
// Chaque card = piece_box blanc à gauche (lettre pièce GROS, style marker via
// Archivo Black) + 3 pills empilés D/A/S à droite, couleurs issues de COULEUR_CAT.
// Contenu pill = UPGRADES[id].nom du slot du deck actif en CAPS, ou "—" si vide.
const DECK_TAB_W = 50;
const DECK_TAB_H = 50;
const DECK_TAB_GAP = 14;
const DECK_TAB_COUNT = 5;
const DECK_TABS_TOTAL = DECK_TAB_COUNT * DECK_TAB_W + (DECK_TAB_COUNT - 1) * DECK_TAB_GAP;
const DECK_TABS_X0 = (CANVAS_W - DECK_TABS_TOTAL) / 2;            // 347 sur CANVAS_W=1000
const DECK_TABS_Y = 86;

const DECK_CATS = ['D', 'A', 'S'];
// IMPORTANT (fix 2026-07-30) : ces codes doivent matcher PIECE_TYPES de decks.js
// (= 'P','N','B','R','Q','K'), sinon sanitizeDeck/setSlot ignore le slot mis à jour
// (le bug original utilisait ['P','T'], ['C','F'], ['Q','R'] = codes français qui
// ne matchaient pas le data model anglais). On garde l'affichage FR via DECK_LETTRE_FR.
// Layout 3×2 (6 types) :
//   Row 0 : Pion (P) + Tour (R)
//   Row 1 : Cavalier (N) + Fou (B)
//   Row 2 : Reine (Q) + Roi (K)
const DECK_ROWS = [['P', 'R'], ['N', 'B'], ['Q', 'K']];
// Affichage Français pour les piece_box du deck editor (cf. design log [12:30]
// « P/T, C/F, Q/R »). Override de `LETTRE` (constants.js) qui mappe N → 'N' (Knight
// en notation internationale) pour forcer 'C' (Cavalier en tradition échecs FR).
const DECK_LETTRE_FR = { P: 'P', R: 'T', N: 'C', B: 'F', Q: 'D', K: 'R' };
// Label canonique des catégories pour le titre du picker.
const DECK_CAT_LABEL = { D: 'Déplacement', A: 'Actif', S: 'Stat' };
const DECK_X_MARGIN = 60;
const DECK_CARD_GAP_X = 20;
const DECK_CARD_W = (CANVAS_W - 2 * DECK_X_MARGIN - DECK_CARD_GAP_X) / 2;
const DECK_CARD_H = 100;
const DECK_ROW_Y = [180, 300, 420];
const DECK_PIECE_BOX_W = 120;
const DECK_PIECE_INNER_GAP = 16;
const DECK_PILL_W = DECK_CARD_W - DECK_PIECE_BOX_W - DECK_PIECE_INNER_GAP;
const DECK_PILL_H = 26;
const DECK_PILL_RADIUS = 6;
const DECK_PILL_X_OFFSET = -4;
const DECK_PILL_INNER_GAP = 4;
const DECK_LETTER_SIZE = 64;
const DECK_RET_W = 220, DECK_RET_H = 44;
const DECK_RET_X = (CANVAS_W - DECK_RET_W) / 2;
const DECK_RET_Y = 720;

// Palette Decks : même langage hybride que le menu, isolé pour ne pas modifier
// le chrome clair du plateau ni les autres écrans.
// Références dynamiques : Decks suit lui aussi le thème choisi sans reconstruire
// le module render.js.
// NB : les pills D/A/S utilisent directement COULEUR_CAT (pas de mapping ici) — les
// alias bleu/rose du thème ont été retirés le 31/07 car ils n'étaient plus référencés.
const DECK_UI = {};
for (const [alias, token] of Object.entries({
  bg: 'background', panel: 'panel', card: 'card', field: 'field',
  ink: 'text', muted: 'muted', border: 'border',
  green: 'primary', greenD: 'primaryDark',
  amber: 'amberLight', amberD: 'amberDark',
})) Object.defineProperty(DECK_UI, alias, { enumerable: true, get: () => UI_THEME[token] });

function dessineDecks(ctx, state) {
  const mobileDeck = !!(state.ui && state.ui.mobileLayout && CANVAS_W < 700);
  const layoutCardW = mobileDeck ? CANVAS_W - 36 : DECK_CARD_W;
  const layoutCardH = mobileDeck ? 112 : DECK_CARD_H;
  const layoutPieceBoxW = mobileDeck ? 92 : DECK_PIECE_BOX_W;
  const layoutInnerGap = mobileDeck ? 10 : DECK_PIECE_INNER_GAP;
  const layoutPillW = layoutCardW - layoutPieceBoxW - layoutInnerGap;
  const layoutRowStep = mobileDeck ? 130 : 120;
  const deckPanelH = mobileDeck ? CANVAS_H - 48 : 744;
  const deckReturnY = mobileDeck ? CANVAS_H - 68 : DECK_RET_Y;

  // Fond graphite + panneau flottant : adaptation Decks de la direction hybride.
  ctx.fillStyle = DECK_UI.bg;
  ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);
  carte(ctx, mobileDeck ? 12 : 36, 24,
    mobileDeck ? CANVAS_W - 24 : CANVAS_W - 72, deckPanelH, 22, DECK_UI.panel,
    { shadow: false, stroke: DECK_UI.border });
  ctx.fillStyle = DECK_UI.ink;
  ctx.font = `24px ${F_DISPLAY}`;
  ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic';
  ctx.fillText(traduire('MES DECKS', state.language), CANVAS_W / 2, 59);

  const root = state.decksRoot || sanitizeRoot(loadDecks());
  state.decksRoot = root;
  const ids = Object.keys(root.decks);
  const activeDeck = root.decks[root.active];

  // === Barre de gestion deck — y=86, MÊME ligne que les tabs ===
  // User request 30/07 : minimalisme visuel — uniquement les 5 tabs (1-5) pour
  // sélectionner / créer un deck. Pas de boutons latéraux : le renommage et la
  // suppression des decks sont accessibles via long-press / clic-droit sur l'onglet
  // (case 'renameDeck' / 'deleteDeck' toujours câblés dans actionBouton, juste plus
  // exposés en CTA visible). Pas de bandeau nom du deck / compteur en dessous — les
  // carrés 1-5 SUFFISENT comme signal (le nombre affiché DANS le carré actif est
  // l'index 1-indexé du deck actif ; les autres chiffres sont les indexes des autres
  // decks ou les slots vides à cliquer-pour-créer). Le nom seul reste consultable via
  // l'info « active deck » exposée plus bas si besoin (placeholder pour extension).

  const deckTabW = mobileDeck ? 50 : DECK_TAB_W;
  const deckTabGap = mobileDeck ? 8 : DECK_TAB_GAP;
  const deckTabsTotal = DECK_TAB_COUNT * deckTabW + (DECK_TAB_COUNT - 1) * deckTabGap;
  const deckTabsX0 = mobileDeck ? (CANVAS_W - deckTabsTotal) / 2 : DECK_TABS_X0;
  for (let i = 0; i < DECK_TAB_COUNT; i++) {
    const tabX = deckTabsX0 + i * (deckTabW + deckTabGap);
    const hasDeck = i < ids.length;
    const isActive = hasDeck && ids[i] === root.active;
    const tabFill = isActive ? DECK_UI.green : (hasDeck ? DECK_UI.field : DECK_UI.panel);
    ctx.fillStyle = isActive ? DECK_UI.greenD : UI_THEME.shadow;
    roundRect(ctx, tabX, DECK_TABS_Y + 3, deckTabW, DECK_TAB_H, 9); ctx.fill();
    ctx.fillStyle = tabFill;
    roundRect(ctx, tabX, DECK_TABS_Y, deckTabW, DECK_TAB_H, 9); ctx.fill();
    ctx.strokeStyle = isActive ? DECK_UI.green : (hasDeck ? DECK_UI.border : UI_THEME.field);
    ctx.lineWidth = isActive ? 3 : 2;
    roundRect(ctx, tabX, DECK_TABS_Y, deckTabW, DECK_TAB_H, 9); ctx.stroke();
    ctx.fillStyle = isActive ? DECK_UI.ink : (hasDeck ? DECK_UI.ink : DECK_UI.muted);
    ctx.font = `24px ${F_DISPLAY}`;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(String(i + 1), tabX + deckTabW / 2, DECK_TABS_Y + DECK_TAB_H / 2);
    state.ui.buttons.push({
      x: tabX, y: DECK_TABS_Y, w: deckTabW, h: DECK_TAB_H,
      action: { kind: 'switchDeck', value: i }, enabled: true, radius: 9,
    });
  }

  const mobileDeckTypes = mobileDeck ? DECK_ROWS.flat() : null;
  const deckRowCount = mobileDeck ? mobileDeckTypes.length : DECK_ROWS.length;
  for (let rowIdx = 0; rowIdx < deckRowCount; rowIdx++) {
    const typeL = mobileDeck ? mobileDeckTypes[rowIdx] : DECK_ROWS[rowIdx][0];
    const typeR = mobileDeck ? null : DECK_ROWS[rowIdx][1];
    const cardY = mobileDeck ? 180 + rowIdx * layoutRowStep : DECK_ROW_Y[rowIdx];
    const cardXL = mobileDeck ? 18 : DECK_X_MARGIN;
    const cardXR = DECK_X_MARGIN + DECK_CARD_W + DECK_CARD_GAP_X;
    const columnCount = mobileDeck ? 1 : 2;
    for (let col = 0; col < columnCount; col++) {
      const type = mobileDeck ? typeL : (col === 0 ? typeL : typeR);
      const cardX = mobileDeck ? cardXL : (col === 0 ? cardXL : cardXR);
      const slots = (activeDeck && activeDeck.slots && activeDeck.slots[type]) || {};

      const pbY = cardY;
      // Encadré « tableau » (31/07) : une seule boîte englobe le cadre de la
      // pièce ET ses 3 améliorations — effet cellule de tableau. Fond + ombre
      // + bordure uniques, puis colonnes pièce | améliorations séparées.
      ctx.fillStyle = UI_THEME.shadow;
      roundRect(ctx, cardX, cardY + 4, layoutCardW, layoutCardH, 12); ctx.fill();
      ctx.fillStyle = DECK_UI.card;
      roundRect(ctx, cardX, cardY, layoutCardW, layoutCardH, 12); ctx.fill();
      ctx.strokeStyle = DECK_UI.border; ctx.lineWidth = 2.5;
      roundRect(ctx, cardX, cardY, layoutCardW, layoutCardH, 12); ctx.stroke();
      // Encadré de pièce : inséré de 4 px pour que la bordure de l'encadré
      // extérieur reste lisible (double-bordure évitée). Le cadre pièce n'a pas
      // de hitbox (seules les pills D/A/S sont cliquables) → inset sûr.
      const pbInset = 4;
      const pbX = cardX + pbInset;
      const pbW = layoutPieceBoxW - pbInset * 2;
      ctx.fillStyle = DECK_UI.field;
      roundRect(ctx, pbX, pbY, pbW, layoutCardH, 10); ctx.fill();
      ctx.strokeStyle = DECK_UI.border; ctx.lineWidth = 2.5;
      roundRect(ctx, pbX, pbY, pbW, layoutCardH, 10); ctx.stroke();
      ctx.strokeStyle = 'rgba(245,241,232,0.20)'; ctx.lineWidth = 1.5;
      roundRect(ctx, pbX + 5, pbY + 5,
        pbW - 10, layoutCardH - 10, 7); ctx.stroke();
      // Séparateur vertical de colonne (pièce | améliorations) — effet tableau.
      ctx.strokeStyle = DECK_UI.border; ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(cardX + layoutPieceBoxW + layoutInnerGap / 2, cardY + 10);
      ctx.lineTo(cardX + layoutPieceBoxW + layoutInnerGap / 2, cardY + layoutCardH - 10);
      ctx.stroke();
      // Sprite de la pièce (camp 0 = bleu) centré dans le piece_box. Fallback lettre
      // FR si le sprite n'est pas encore chargé (canplay race 1re frame). Le deck est
      // neutre — on montre toujours la version bleue peu importe le camp actif.
      // Sprite shrinké à 72 px sur card 100 → 14 px de respiration totale (5 inset + 9 marge)
      // pour respirer face à l'encadré épais.
      const pieceImg = spritePret(0, type);
      const pieceCx = pbX + pbW / 2;
      const pieceCy = pbY + layoutCardH / 2;
      const targetH = layoutCardH - 28; // 72 px sur card 100, marge intérieure 14 px
      if (pieceImg) {
        const ratio = pieceImg.naturalWidth / pieceImg.naturalHeight;
        const w = targetH * ratio;
        ctx.drawImage(pieceImg, pieceCx - w / 2, pieceCy - targetH / 2, w, targetH);
      } else {
        // Fallback lettre FR si sprite pas encore chargé (canplay race 1re frame).
        ctx.fillStyle = DECK_UI.ink;
        ctx.font = `${DECK_LETTER_SIZE}px ${F_DISPLAY}`;
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText(DECK_LETTRE_FR[type] || type, pieceCx, pieceCy + 1);
      }

      const pillX = cardX + layoutPieceBoxW + layoutInnerGap + DECK_PILL_X_OFFSET;
      const pillTopPad = (layoutCardH -
        (DECK_PILL_H * DECK_CATS.length + DECK_PILL_INNER_GAP * (DECK_CATS.length - 1))) / 2;
      for (let s = 0; s < DECK_CATS.length; s++) {
        const cat = DECK_CATS[s];
        const pillY = cardY + pillTopPad + s * (DECK_PILL_H + DECK_PILL_INNER_GAP);
        // Couleur des pills D/A/S — palette demandée par l'utilisateur (31/07) :
        // '#8FB8E0' (D), '#F0B15E' (A), '#9BCB8C' (S) = COULEUR_CAT (constants.js).
        const pillFill = COULEUR_CAT[cat];
        const pillStroke = darken(COULEUR_CAT[cat], 0.28);
        ctx.fillStyle = pillFill;
        roundRect(ctx, pillX, pillY, layoutPillW, DECK_PILL_H, DECK_PILL_RADIUS); ctx.fill();
        ctx.strokeStyle = pillStroke; ctx.lineWidth = 2;
        roundRect(ctx, pillX, pillY, layoutPillW, DECK_PILL_H, DECK_PILL_RADIUS); ctx.stroke();
        const upgId = slots[cat];
        const upg = upgId && UPGRADES[upgId];
        const label = upg ? traduire(upg.nom, state.language).toUpperCase() : '—';
        // Fonds pastel clairs → encre sombre (buttonText) pour garder le contraste AA.
        ctx.fillStyle = UI_THEME.buttonText;
        ctx.font = `600 13px ${F_DISPLAY}`;
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText(label, pillX + layoutPillW / 2, pillY + DECK_PILL_H / 2 + 1);
        state.ui.buttons.push({
          x: pillX, y: pillY, w: layoutPillW, h: DECK_PILL_H,
          action: { kind: 'editSlot', type, cat }, enabled: true, radius: DECK_PILL_RADIUS,
        });
      }
    }
  }

  bouton(state, ctx, mobileDeck ? (CANVAS_W - DECK_RET_W) / 2 : DECK_RET_X, deckReturnY, DECK_RET_W, DECK_RET_H,
    'Retour au menu', { kind: 'fermerDecks' },
    { color: DECK_UI.green, textColor: DECK_UI.ink, outlineColor: DECK_UI.greenD });
}

function dessineDeckPicker(ctx, state) {
  if (!state._deckEditor) return;
  const mobilePicker = !!(state.ui && state.ui.mobileLayout && CANVAS_W < 700);
  const { type, cat } = state._deckEditor;
  if (!state.decksRoot) state.decksRoot = sanitizeRoot(loadDecks());
  const root = state.decksRoot;
  const activeDeck = root.decks[root.active];
  const currentSlot = (activeDeck && activeDeck.slots && activeDeck.slots[type]) ? activeDeck.slots[type][cat] : null;

  // Écran autonome : le deck principal ne reste plus visible sous le picker.
  // Cette surface opaque focalise le choix sur les améliorations compatibles.
  ctx.fillStyle = DECK_UI.bg;
  ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);
  const pickerPanelX = mobilePicker ? 12 : 130;
  const pickerPanelY = mobilePicker ? 24 : 38;
  const pickerPanelW = mobilePicker ? CANVAS_W - 24 : 740;
  const pickerPanelH = mobilePicker ? CANVAS_H - 48 : 700;
  carte(ctx, pickerPanelX, pickerPanelY, pickerPanelW, pickerPanelH, 22, DECK_UI.panel,
    { shadow: false, stroke: DECK_UI.border });

  // Titre.
  ctx.fillStyle = DECK_UI.ink; ctx.font = `22px ${F_DISPLAY}`;
  ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic';
  // Phase 6.2 belt-and-braces — defensive defaults pour les 3 reads.
  // _deckEditor peut etre mal forme (race, partial sanitize, deck user-created
  // incomplet entre frames) — on wrappe chaque lookup avec un fallback chain.
  // Le pattern defense-in-depth protege contre ANY collision future avec un
  // mode degrade silencieux (jamais de throw) au lieu d'un crash picker.
  const typeStr   = LETTRE[type] || type || '?';
  const typeNom   = (typeof nomType === 'function' ? nomType(type, state.language) : traduire(typeStr, state.language)).toUpperCase();
  const catLabel  = DECK_CAT_LABEL[cat] || cat || '—';
  ctx.fillText(`${traduire(typeStr, state.language)} — ${typeNom} · ${traduire(catLabel, state.language).toUpperCase()}`,
    CANVAS_W / 2, 80);
  ctx.fillStyle = DECK_UI.muted; ctx.font = `12px ${F_TEXTE}`;
  ctx.fillText(traduire('Choisis une amélioration compatible', state.language), CANVAS_W / 2, 102);
  // Cartes éligibles : UPGRADES filtrées sur (piece, cat), triées par coût croissant.
  const eligible = Object.values(UPGRADES)
    .filter((u) => u.piece === type && u.cat === cat)
    .sort((a, b) => a.cout - b.cout);
  const cardW = mobilePicker ? CANVAS_W - 48 : 500;
  const cardH = mobilePicker ? 116 : 100;
  const cardGap = mobilePicker ? 12 : 12;
  const startX = (CANVAS_W - cardW) / 2;
  let startY = mobilePicker ? 140 : 130;
  for (let i = 0; i < eligible.length; i++) {
    const u = eligible[i];
    const cx = startX;
    const cy = startY + i * (cardH + cardGap);
    const isCurrent = u.id === currentSlot;
    const categoryColor = COULEUR_CAT[u.cat] || DECK_UI.green;
    carte(ctx, cx, cy, cardW, cardH, 10, isCurrent ? categoryColor : DECK_UI.card,
      { shadow: true, stroke: isCurrent ? darken(categoryColor, 0.28) : DECK_UI.border });
    if (isCurrent) {
      ctx.lineWidth = 3; ctx.strokeStyle = categoryColor;
      roundRect(ctx, cx, cy, cardW, cardH, 10); ctx.stroke();
    }
    // La sélection reprend la couleur de catégorie de l'amélioration (D/A/S),
    // comme les pills du deck, plutôt qu'une couleur verte générique.
    ctx.fillStyle = isCurrent ? C_ENCRE : DECK_UI.ink; ctx.font = `bold 18px ${F_DISPLAY}`;
    ctx.textAlign = 'left'; ctx.textBaseline = 'top';
    ctx.fillText(traduire(u.nom, state.language), cx + 16, cy + 9);
    // Coût lisible en haut à droite.
    ctx.fillStyle = isCurrent ? C_ENCRE : DECK_UI.amber; ctx.font = `700 16px ${F_DISPLAY}`;
    ctx.textAlign = 'right'; ctx.textBaseline = 'top';
    ctx.fillText(`★ ${u.cout}`, cx + cardW - 16, cy + 10);
    // NB : le badge « cd X » / « usage unique » a été retiré du picker : le
    // cooldown et le caractère unique restent décrits dans la description.
    // Description plus présente, avec un interligne adapté aux caractères agrandis.
    ctx.fillStyle = isCurrent ? C_ENCRE : DECK_UI.muted; ctx.font = `13px ${F_TEXTE}`;
    ctx.textAlign = 'left'; ctx.textBaseline = 'top';
    wrapTextLimite(ctx, traduire(u.desc, state.language), cx + 16, cy + 47, cardW - 32, 16, 2);
    // Hit-test cliquable.
    state.ui.buttons.push({ x: cx, y: cy, w: cardW, h: cardH,
      action: { kind: 'pickUpgrade', id: u.id }, enabled: true, radius: 8 });
  }

  // Bouton « Retour » sous la dernière carte (dynamic y).
  const footerY = eligible.length > 0
    ? startY + eligible.length * (cardH + cardGap) + 12
    : startY + 40;
  const footerX = mobilePicker ? (CANVAS_W - 220) / 2 : startX;
  bouton(state, ctx, mobilePicker ? footerX : startX + cardW - 200,
    footerY, 200, 38, '← Retour',
    { kind: 'cancelPick' },
    { color: DECK_UI.green, textColor: DECK_UI.ink, outlineColor: DECK_UI.greenD });
}

function learnWrap(ctx, text, x, y, maxWidth, lineHeight, maxLines = 4) {
  const words = String(text || '').split(/\s+/);
  const lines = [];
  let line = '';
  for (const word of words) {
    const candidate = line ? `${line} ${word}` : word;
    if (line && ctx.measureText(candidate).width > maxWidth) {
      lines.push(line); line = word;
      if (lines.length === maxLines - 1) break;
    } else line = candidate;
  }
  if (line && lines.length < maxLines) lines.push(line);
  for (let i = 0; i < lines.length; i++) ctx.fillText(lines[i], x, y + i * lineHeight);
  return lines.length;
}

// Direction artistique des parcours inspirée de `exemple.png` : forêt sombre,
// aplats olive/terre et accents dorés. Les formes sont procédurales pour rester
// nettes sur Canvas, légères et cohérentes avec les états du parcours.
const PARCOURS_DA = {
  forest: '#243A2A',
  forestDeep: '#18291E',
  leafDark: '#2D4B31',
  leaf: '#46673B',
  olive: '#71864A',
  oliveLight: '#A6B86E',
  earth: '#8A6543',
  earthDark: '#573F2D',
  gold: '#E6C981',
  goldDark: '#927047',
  cream: '#F4E7BE',
  creamMuted: '#C9CDA8',
  card: '#304A32',
  cardLight: '#3D5B3B',
  ink: '#17231A',
  locked: '#415641',
};

// Palette « couleurs du jeu » : Tutoriel et Apprendre reprennent les tons du
// thème (graphite, ardoise, sauge, laiton) au lieu de la forêt de la référence.
const PARCOURS_JEU = {
  checker: true,
  forest: UI_THEME.background,
  forestDeep: UI_THEME.background,
  leafDark: UI_THEME.wineDark,
  leaf: UI_THEME.card,
  olive: UI_THEME.amberDark,
  oliveLight: UI_THEME.amberLight,
  earth: UI_THEME.amberDark,
  earthDark: UI_THEME.amberDark,
  gold: UI_THEME.amber,
  goldDark: UI_THEME.amberDark,
  cream: UI_THEME.text,
  creamMuted: UI_THEME.muted,
  card: UI_THEME.card,
  cardLight: UI_THEME.panelAlt,
  ink: UI_THEME.shadow,
  locked: UI_THEME.disabled,
};

function dessineFondParcours(ctx, pal = PARCOURS_DA) {
  ctx.fillStyle = pal.forestDeep;
  ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);
  if (pal.checker) {
    // Damier discret rappelant le plateau : le fond reste aux couleurs du jeu.
    ctx.save(); ctx.globalAlpha = 0.14;
    for (let row = 0; row < 8; row++) {
      for (let col = 0; col < 16; col++) {
        ctx.fillStyle = (row + col) % 2 ? pal.leafDark : pal.leaf;
        ctx.fillRect(col * 67, 104 + row * 67, 67, 67);
      }
    }
    ctx.restore();
    return;
  }
  // Texture plate de feuillage : motifs déterministes, sans image ni animation.
  ctx.save();
  ctx.globalAlpha = 0.42;
  for (let i = 0; i < 18; i++) {
    const x = (i * 83 + 31) % (CANVAS_W + 90) - 45;
    const y = 104 + ((i * 137) % Math.max(120, CANVAS_H - 104));
    ctx.fillStyle = i % 3 === 0 ? pal.leaf : pal.leafDark;
    ctx.beginPath();
    ctx.arc(x, y, 24 + (i % 4) * 9, 0, Math.PI * 2);
    ctx.arc(x + 22, y + 13, 18 + (i % 3) * 7, 0, Math.PI * 2);
    ctx.arc(x - 20, y + 18, 16 + (i % 2) * 8, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 0.18;
  for (let i = 0; i < 11; i++) {
    const x = (i * 127 + 12) % (CANVAS_W + 80) - 40;
    ctx.fillStyle = pal.olive;
    ctx.fillRect(x, 104, 7 + (i % 3) * 3, CANVAS_H - 104);
  }
  ctx.restore();
  // Voile central discret : les nœuds restent lisibles devant la forêt.
  ctx.save();
  ctx.globalAlpha = 0.22;
  ctx.fillStyle = pal.forest;
  roundRect(ctx, 12, 104, CANVAS_W - 24, Math.max(80, CANVAS_H - 116), 24);
  ctx.fill();
  ctx.restore();
}

function dessineCheminParcours(ctx, positions, pal = PARCOURS_DA) {
  if (positions.length < 2) return;
  ctx.save();
  ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  // Vague organique : chaque segment devient une courbe de Bézier dont les
  // points de contrôle s'écartent perpendiculairement du segment, ce qui
  // dessine un sentier qui serpente entre les niveaux comme sur la référence.
  const controlPoints = [];
  for (let i = 0; i < positions.length - 1; i++) {
    const a = positions[i], b = positions[i + 1];
    const dx = b.x - a.x, dy = b.y - a.y;
    const len = Math.max(1, Math.hypot(dx, dy));
    const amp = Math.min(34, Math.max(14, len * 0.22));
    const nx = -dy / len, ny = dx / len;
    const dir = (i % 2 === 0 ? 1 : -1);
    controlPoints.push({
      c1: { x: a.x + dx / 3 + nx * amp * dir, y: a.y + dy / 3 + ny * amp * dir },
      c2: { x: a.x + (2 * dx) / 3 + nx * amp * dir, y: a.y + (2 * dy) / 3 + ny * amp * dir },
    });
  }
  const trace = (width, color, dash) => {
    ctx.save();
    ctx.strokeStyle = color;
    ctx.lineWidth = width;
    if (dash) ctx.setLineDash(dash);
    ctx.beginPath();
    ctx.moveTo(positions[0].x, positions[0].y);
    for (let i = 0; i < controlPoints.length; i++) {
      const p = controlPoints[i];
      ctx.bezierCurveTo(p.c1.x, p.c1.y, p.c2.x, p.c2.y, positions[i + 1].x, positions[i + 1].y);
    }
    ctx.stroke();
    ctx.restore();
  };
  trace(26, pal.earthDark);
  trace(13, pal.olive);
  trace(3, pal.oliveLight, [4, 14]);
  ctx.restore();
}

// Niveau en forme de tuile carrée arrondie, comme les cases du plateau :
// ombre, halo actif, fond plat, contour épais et numéro centré. `pal` choisit
// la palette sans changer la forme ni les états.
function dessineTuileNiveau(ctx, cxNode, cyNode, size, radius, done, active, text, fill, stroke, numero, pal = PARCOURS_DA) {
  ctx.save();
  const half = size / 2;
  const x = cxNode - half, y = cyNode - half;
  const jeu = pal.checker;
  // Ombre plate sous la tuile (relief pierre posée sur le sentier).
  ctx.fillStyle = pal.ink;
  roundRect(ctx, x + 2, y + 4, size, size, radius); ctx.fill();
  if (active) {
    ctx.globalAlpha = jeu ? 0.22 : 0.30;
    ctx.fillStyle = jeu ? UI_THEME.amberLight : pal.gold;
    roundRect(ctx, x - 7, y - 7, size + 14, size + 14, radius + 6); ctx.fill();
    ctx.globalAlpha = 1;
  }
  ctx.fillStyle = fill;
  roundRect(ctx, x, y, size, size, radius); ctx.fill();
  ctx.lineWidth = done || active ? 3 : 2;
  ctx.strokeStyle = stroke;
  roundRect(ctx, x, y, size, size, radius); ctx.stroke();
  // Liseré intérieur discret façon pierre taillée.
  ctx.globalAlpha = 0.25;
  ctx.strokeStyle = jeu ? UI_THEME.secondaryLight : pal.cream;
  ctx.lineWidth = 1.5;
  roundRect(ctx, x + 5, y + 5, size - 10, size - 10, radius - 3); ctx.stroke();
  ctx.globalAlpha = 1;
  ctx.fillStyle = text;
  ctx.font = `700 20px ${F_DISPLAY}`;
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText(String(numero), cxNode, cyNode + 1);
  ctx.restore();
}

function couleursNoeudParcours(done, active, pal = PARCOURS_DA) {
  if (pal.checker) {
    // Palette du jeu : sauge pour les niveaux terminés, laiton pour l'actif.
    if (done) return { fill: UI_THEME.primary, stroke: UI_THEME.primaryDark, text: UI_THEME.buttonText };
    if (active) return { fill: UI_THEME.amber, stroke: UI_THEME.amberLight, text: UI_THEME.buttonText };
    return { fill: UI_THEME.disabled, stroke: UI_THEME.disabledBorder, text: UI_THEME.disabledText };
  }
  if (done) return { fill: PARCOURS_DA.oliveLight, stroke: PARCOURS_DA.cream, text: PARCOURS_DA.ink };
  if (active) return { fill: PARCOURS_DA.gold, stroke: PARCOURS_DA.cream, text: PARCOURS_DA.ink };
  return { fill: PARCOURS_DA.locked, stroke: PARCOURS_DA.leaf, text: PARCOURS_DA.creamMuted };
}

function dessineTutorielHub(ctx, state) {
  const mobile = !!(state.ui && state.ui.mobileLayout);
  const cx = CANVAS_W / 2;
  const progress = progressionTutoriel(state);
  const completed = new Set(progress.completed || []);
  const nodeW = 60, nodeH = 60, nodeRadius = 14;
  // Les niveaux restent une liste compacte : le chemin décoratif du parcours
  // est volontairement masqué pour ne pas gaspiller l'espace vertical sur mobile.
  const mobileNodeStep = 84;
  const positions = STEPS.map((_, index) => mobile
    ? { x: cx, y: 150 + index * mobileNodeStep }
    : { x: 270 + (index % 3) * 220, y: 180 + Math.floor(index / 3) * 150 });
  const footerY = mobile ? 150 + STEPS.length * mobileNodeStep + 64 : 680;

  // Le Tutoriel reprend les couleurs du jeu : tuiles et chemin serpent
  // conservés, avec la palette graphite/sauge/laiton du thème.
  dessineFondParcours(ctx, PARCOURS_JEU);

  ctx.fillStyle = PARCOURS_JEU.cream; ctx.font = `34px ${F_DISPLAY}`;
  ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic';
  ctx.fillText(traduire('TUTORIEL', state.language), cx, 55);
  ctx.fillStyle = PARCOURS_JEU.creamMuted; ctx.font = `13px ${F_TEXTE}`;
  ctx.fillText(traduire('Maîtrise les règles étape par étape.', state.language), cx, 80);

  dessineCheminParcours(ctx, positions, PARCOURS_JEU);

  STEPS.forEach((step, index) => {
    const { x: cxNode, y: cyNode } = positions[index];
    const unlocked = tutorielEtapeDebloquee(state, index);
    const done = completed.has(index);
    const active = unlocked && !done;
    const nodeColors = couleursNoeudParcours(done, active, PARCOURS_JEU);
    const fill = nodeColors.fill;
    const stroke = nodeColors.stroke;
    const text = nodeColors.text;
    ctx.save();
    dessineTuileNiveau(ctx, cxNode, cyNode, nodeW, nodeRadius, done, active, text, fill, stroke, index + 1, PARCOURS_JEU);
    if (mobile) {
      const labelX = cxNode + 46;
      ctx.fillStyle = PARCOURS_JEU.cream; ctx.font = `13px ${F_DISPLAY}`; ctx.textAlign = 'left';
      const title = traduire(step.title, state.language).toUpperCase();
      const titleLines = wrapTextLines(ctx, title, labelX, cyNode - 10, Math.max(110, CANVAS_W - labelX - 24), 14);
      ctx.fillStyle = PARCOURS_JEU.creamMuted; ctx.font = `11px ${F_TEXTE}`;
      ctx.fillText(traduire(done ? '✓ terminé' : active ? 'à faire' : 'verrouillé', state.language), labelX, cyNode + (titleLines > 1 ? 18 : 14));
    }
    ctx.restore();
    motionMenuBouton(state, cxNode - nodeW / 2, cyNode - nodeH / 2, nodeW, nodeH,
      { kind: 'tutorialStart', index }, unlocked, 12, 'rect');
  });

  ctx.fillStyle = PARCOURS_JEU.cream; ctx.font = `700 12px ${F_TEXTE}`;
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText(traduire(`${completed.size}/${TOTAL_STEPS} étapes maîtrisées`, state.language), cx, footerY);
  bouton(state, ctx, mobile ? cx - 110 : 32, footerY + 32, 220, 38, '← Menu principal',
    { kind: 'retourMenu' }, { color: UI_THEME.card, textColor: UI_THEME.text, outlineColor: UI_THEME.border });
}

function dessineLearnHub(ctx, state) {
  const mobile = !!(state.ui && state.ui.mobileLayout);
  const cx = CANVAS_W / 2;
  const completed = new Set(state.learnProgress?.completed || []);
  // Le téléphone reprend exactement les nœuds circulaires du desktop.
  // Seul le pas vertical est resserré pour rester agréable à faire défiler.
  const mobileNodeStep = 84;
  // Le parcours s'adapte au nombre de niveaux sans modifier le catalogue.
  const columns = mobile ? 1 : 9;
  const positions = LEARN_GAMES.map((_, index) => {
    const row = Math.floor(index / columns);
    const col = index % columns;
    const leftToRight = row % 2 === 0;
    return mobile
      ? { x: cx, y: 150 + row * mobileNodeStep }
      : { x: leftToRight ? 60 + col * 110 : 940 - col * 110, y: 180 + row * 145 };
  });
  const nodeW = 60, nodeH = 60;
  const nodeRadius = 14;

  // Apprendre reprend les couleurs du jeu : damier discret rappelant le
  // plateau, chemin laiton et tuiles sauge/dorées de la palette du thème.
  dessineFondParcours(ctx, PARCOURS_JEU);

  ctx.fillStyle = PARCOURS_JEU.cream; ctx.font = `34px ${F_DISPLAY}`;
  ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic';
  ctx.fillText(traduire('DEFI', state.language), cx, 55);
  ctx.fillStyle = PARCOURS_JEU.creamMuted; ctx.font = `13px ${F_TEXTE}`;
  ctx.fillText(traduire('Avance case après case pour maîtriser les améliorations.', state.language), cx, 80);

  // Chemin serpent : même langage que le Tutoriel et les Puzzles.
  dessineCheminParcours(ctx, positions, PARCOURS_JEU);

  LEARN_GAMES.forEach((game, index) => {
    const { x: cxNode, y: cyNode } = positions[index];
    const x = cxNode - nodeW / 2, y = cyNode - nodeH / 2;
    const done = completed.has(game.id);
    const unlocked = apprendreEstDebloque(state, index);
    const active = unlocked && !done;

    // Les nœuds sont volontairement réduits à un rond numéroté : la couleur
    // décrit l'état du parcours, sans répéter le titre de la situation.
    const nodeColors = couleursNoeudParcours(done, active, PARCOURS_JEU);
    const fill = nodeColors.fill;
    const stroke = nodeColors.stroke;
    const text = nodeColors.text;
    // Même tuile arrondie que sur desktop : la forme des niveaux est commune.
    dessineTuileNiveau(ctx, cxNode, cyNode, nodeW, nodeRadius, done, active, text, fill, stroke, index + 1, PARCOURS_JEU);

    // La hitbox recouvre toute la tuile visible.
    motionMenuBouton(state, x, y, nodeW, nodeH,
      { kind: 'learnStart', index }, unlocked, 12, 'rect');
  });

  const doneCount = completed.size;
  ctx.fillStyle = PARCOURS_JEU.cream; ctx.font = `700 12px ${F_TEXTE}`;
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  const footerY = mobile ? 150 + LEARN_GAMES.length * mobileNodeStep + 64 : 590;
  ctx.fillText(traduire(`${doneCount}/${TOTAL_LEARN_GAMES} cases maîtrisées`, state.language), cx, footerY);
  bouton(state, ctx, mobile ? cx - 110 : 32, mobile ? footerY + 32 : 635, 220, mobile ? 38 : 34, '✦ Puzzles tactiques', { kind: 'openPuzzles' },
    { color: UI_THEME.amber, textColor: UI_THEME.buttonText, outlineColor: UI_THEME.amberLight });
  bouton(state, ctx, cx - 110, mobile ? footerY + 78 : 635, 220, mobile ? 38 : 34, '← Menu principal', { kind: 'retourMenu' },
    { color: UI_THEME.card, textColor: UI_THEME.text, outlineColor: UI_THEME.border });
}

function dessinePuzzleHub(ctx, state) {
  const mobile = !!(state.ui && state.ui.mobileLayout);
  const cx = CANVAS_W / 2;
  const completed = new Set(state.puzzleProgress?.completed || []);
  // Même grille que le Parcours classique : les puzzles reprennent le chemin
  // serpent, les espacements et la respiration visuelle des niveaux classiques.
  const columns = mobile ? 1 : 9;
  const positions = PUZZLES.map((_, index) => {
    const row = Math.floor(index / columns);
    const col = index % columns;
    const leftToRight = row % 2 === 0;
    return mobile
      ? { x: cx, y: 150 + row * 84 }
      : { x: leftToRight ? 60 + col * 110 : 940 - col * 110, y: 180 + row * 145 };
  });
  const nodeW = 60, nodeH = 60, nodeRadius = 14;
  const palettePuzzle = PARCOURS_JEU;
  dessineFondParcours(ctx, palettePuzzle);

  ctx.fillStyle = palettePuzzle.cream; ctx.font = `34px ${F_DISPLAY}`;
  ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic';
  ctx.fillText(traduire('PUZZLES TACTIQUES', state.language), cx, 55);
  ctx.fillStyle = palettePuzzle.creamMuted; ctx.font = `13px ${F_TEXTE}`;
  ctx.fillText(traduire('Trouve l’amélioration nécessaire pour résoudre chaque situation.', state.language), cx, 80);

  dessineCheminParcours(ctx, positions, palettePuzzle);

  PUZZLES.forEach((puzzle, index) => {
    const { x: cxNode, y: cyNode } = positions[index];
    const x = cxNode - nodeW / 2, y = cyNode - nodeH / 2;
    const done = completed.has(puzzle.id);
    const unlocked = apprendrePuzzleEstDebloque(state, index);
    const active = unlocked && !done;
    const nodeColors = couleursNoeudParcours(done, active, PARCOURS_JEU);
    const fill = nodeColors.fill;
    const stroke = nodeColors.stroke;
    const text = nodeColors.text;
    ctx.save();
    // Même composition que le parcours classique : uniquement la tuile
    // numérotée sur le chemin serpent, sans nom ni statut.
    dessineTuileNiveau(ctx, cxNode, cyNode, nodeW, nodeRadius, done, active, text, fill, stroke, index + 1, PARCOURS_JEU);
    ctx.restore();
    motionMenuBouton(state, x, y, nodeW, nodeH,
      { kind: 'puzzleStart', index }, unlocked, 12, 'rect');
  });

  const doneCount = completed.size;
  ctx.fillStyle = PARCOURS_JEU.cream; ctx.font = `700 12px ${F_TEXTE}`;
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  const footerY = mobile ? 150 + PUZZLES.length * 84 + 64 : 590;
  ctx.fillText(traduire(`${doneCount}/${TOTAL_PUZZLES} puzzles résolus`, state.language), cx, footerY);
  bouton(state, ctx, mobile ? cx - 110 : 32, mobile ? footerY + 32 : 635, 220, mobile ? 38 : 34, '← Parcours classique', { kind: 'classicHub' },
    { color: UI_THEME.amber, textColor: UI_THEME.buttonText, outlineColor: UI_THEME.amberLight });
  bouton(state, ctx, cx - 110, mobile ? footerY + 78 : 635, 220, mobile ? 38 : 34, '← Menu principal', { kind: 'retourMenu' },
    { color: UI_THEME.card, textColor: UI_THEME.text, outlineColor: UI_THEME.border });
}

function dessineLearnPanel(ctx, state, now) {
  const x = __PANEL_X_RUNTIME, w = CANVAS_W - x - 16;
  const game = LEARN_GAMES[state.learnIndex];
  if (!game) return;

  // Une fois la pièce sélectionnée, on ouvre le vrai catalogue d'achat :
  // l'utilisateur doit voir et cliquer la carte d'amélioration attendue.
  if (state.panelPiece && state.phase !== 'gameover') {
    ctx.fillStyle = UI_THEME.text; ctx.font = `22px ${F_DISPLAY}`;
    ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
    ctx.fillText(traduire('ACHAT · DEFI', state.language), x, OY + 8);
    ctx.fillStyle = game.color || UI_THEME.amber; ctx.font = `700 10px ${F_TEXTE}`;
    ctx.fillText(`${traduire(game.title, state.language).toUpperCase()} · ${traduire(game.upgrade, state.language).toUpperCase()}`, x, OY + 30);
    dessineCatalogue(ctx, state, x, OY + 48, w, now);
    // Pied de page compact : deux boutons côte à côte en petit, pour laisser
    // toute la place au catalogue au-dessus.
    const footGap = 8, footW = (w - footGap) / 2, footY = CANVAS_H - 48;
    bouton(state, ctx, x, footY, footW, 34, '↻ Recommencer', { kind: 'learnRestart' },
      { color: UI_THEME.card, textColor: UI_THEME.text, fontSize: 10 });
    bouton(state, ctx, x + footW + footGap, footY, footW, 34, '← Menu Défi', { kind: 'learnHub' },
      { color: UI_THEME.primary, textColor: UI_THEME.text, fontSize: 10 });
    return;
  }
  ctx.fillStyle = UI_THEME.text; ctx.font = `22px ${F_DISPLAY}`;
  ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';    ctx.fillText(traduire('DEFI', state.language), x, OY + 8);

  carte(ctx, x, OY + 22, w, 150, 10, UI_THEME.panel, { shadow: true });
  ctx.fillStyle = game.color || UI_THEME.amber; ctx.font = `700 10px ${F_TEXTE}`;
  ctx.fillText(traduire(game.category, state.language), x + 14, OY + 34);
  ctx.fillStyle = UI_THEME.text; ctx.font = `16px ${F_DISPLAY}`;
  learnWrap(ctx, traduire(game.title, state.language), x + 14, OY + 52, w - 28, 20, 2);
  ctx.fillStyle = UI_THEME.muted; ctx.font = `11px ${F_TEXTE}`;
  learnWrap(ctx, traduire(game.text, state.language), x + 14, OY + 92, w - 28, 15, 3);
  ctx.fillStyle = UI_THEME.gold || UI_THEME.amber; ctx.font = `700 11px ${F_TEXTE}`;
  learnWrap(ctx, traduire(`Objectif : ${game.objective}`, state.language), x + 14, OY + 128, w - 28, 14, 2);

  const hint = apprendreHint(state);
  if (state.selected && !state.learnPurchased && game.upgradeId) {
    bouton(state, ctx, x, OY + 184, w, 38, 'Acheter l’amélioration', { kind: 'ameliorer' },
      { color: UI_THEME.amber, textColor: UI_THEME.buttonText, sub: `${traduire(game.upgrade, state.language)} · ${game.cost} ${traduire('écus', state.language)}` });
  }
  if (hint && state.selected && game.power && state.learnPurchased) {
    const actionByPower = { ruee: 'ruee', rayon: 'rayon', vet: 'vet', hypnose: 'hypnose', decret: 'decret', cavalerie: 'cavalerie', echange: 'echange', epine: 'epine', rempart: 'rempart' };
    const kind = actionByPower[game.power];
    if (kind) bouton(state, ctx, x, OY + 184, w, 38, game.power.toUpperCase(), { kind },
      { color: UI_THEME.amber, textColor: UI_THEME.buttonText, sub: 'activer maintenant' });
  }
  if (state.selected) {
    ctx.fillStyle = UI_THEME.muted; ctx.font = `11px ${F_TEXTE}`;
    ctx.fillText(traduire(state.learnPurchased ? 'Amélioration achetée · joue sur le plateau' : 'Pièce sélectionnée · achète d’abord l’amélioration', state.language), x, OY + 234);
  }
  // Pied de page compact : « Recommencer » et « Menu Apprendre » côte à côte,
  // pour laisser tout l'espace au bouton d'amélioration au-dessus.
  const footGap = 8, footW = (w - footGap) / 2, footY = CANVAS_H - 48;
  bouton(state, ctx, x, footY, footW, 34, '↻ Recommencer', { kind: 'learnRestart' },
    { color: UI_THEME.card, textColor: UI_THEME.text, fontSize: 10 });
  bouton(state, ctx, x + footW + footGap, footY, footW, 34, ' Menu défi', { kind: 'learnHub' },
    { color: UI_THEME.primary, textColor: UI_THEME.text, fontSize: 10 });
}

function dessinePuzzlePanel(ctx, state, now) {
  const x = __PANEL_X_RUNTIME, w = CANVAS_W - x - 16;
  const puzzle = PUZZLES[state.puzzleIndex];
  if (!puzzle) return;

  // Après « Acheter la solution », on garde un rappel compact du puzzle puis on
  // laisse le vrai catalogue occuper le panneau. Le catalogue peut contenir cinq
  // cartes : il doit donc commencer en haut plutôt qu'après la fiche complète,
  // sinon les dernières cartes se retrouveraient sous les boutons de pied de page.
  if (state.panelPiece && state.phase !== 'gameover') {
    ctx.fillStyle = UI_THEME.text; ctx.font = `22px ${F_DISPLAY}`;
    ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
    ctx.fillText(traduire('SOLUTION · PUZZLE', state.language), x, OY + 8);
    ctx.fillStyle = puzzle.color || UI_THEME.amber; ctx.font = `700 10px ${F_TEXTE}`;
    ctx.fillText(`${traduire(puzzle.title, state.language).toUpperCase()} · ${traduire(puzzle.upgrade, state.language).toUpperCase()}`, x, OY + 30);
    dessineCatalogue(ctx, state, x, OY + 48, w, now);
  } else {
    ctx.fillStyle = UI_THEME.text; ctx.font = `22px ${F_DISPLAY}`;
    ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic'; ctx.fillText(traduire('PUZZLE', state.language), x, OY + 8);
    carte(ctx, x, OY + 22, w, 166, 10, UI_THEME.panel, { shadow: true });
    ctx.fillStyle = puzzle.color || UI_THEME.amber; ctx.font = `700 10px ${F_TEXTE}`;
    ctx.fillText(traduire(puzzle.category, state.language), x + 14, OY + 34);
    ctx.fillStyle = UI_THEME.text; ctx.font = `16px ${F_DISPLAY}`;
    learnWrap(ctx, traduire(puzzle.title, state.language), x + 14, OY + 52, w - 28, 20, 2);
    ctx.fillStyle = UI_THEME.muted; ctx.font = `11px ${F_TEXTE}`;
    learnWrap(ctx, traduire(puzzle.text, state.language), x + 14, OY + 92, w - 28, 15, 4);
    ctx.fillStyle = UI_THEME.amber; ctx.font = `700 11px ${F_TEXTE}`;
    learnWrap(ctx, traduire(`Objectif : ${puzzle.objective}`, state.language), x + 14, OY + 154, w - 28, 14, 2);

    // Statut de résolution : le feedback s'affiche sous la fiche (il débordait
    // de l'ancienne carte). Le bouton d'action descend seulement quand le
    // feedback occupe l'espace, pour rester au plus près du plateau sinon.
    const actionY = state.puzzleFeedback ? OY + 244 : OY + 204;
    if (state.puzzleFeedback) {
      ctx.fillStyle = UI_THEME.dangerText || '#F4EDEA';
      ctx.font = `700 11px ${F_TEXTE}`;
      learnWrap(ctx, traduire(state.puzzleFeedback, state.language), x + 2, OY + 196, w - 4, 14, 3);
    }

    if (state.selected && !state.puzzlePurchased) {
      bouton(state, ctx, x, actionY, w, 38, 'Acheter la solution', { kind: 'ameliorer' },
        { color: UI_THEME.amber, textColor: UI_THEME.buttonText, sub: `${traduire(puzzle.upgrade, state.language)} · ${puzzle.cost} ${traduire('écus', state.language)}` });
    }
    if (state.puzzlePurchased) {
      ctx.fillStyle = UI_THEME.primaryDark; ctx.font = `700 12px ${F_TEXTE}`;
      ctx.fillText(traduire(`✓ ${puzzle.upgrade} acheté — résous la position`, state.language), x, actionY);
      if (state.selected && puzzle.power && state.phase === 'play') {
        const actionByPower = { ruee: 'ruee', sacrifice: 'sacrifice', echange: 'echange' };
        const kind = actionByPower[puzzle.power];
        if (kind) bouton(state, ctx, x, actionY + 22, w, 38, puzzle.power.toUpperCase(), { kind },
          { color: UI_THEME.amber, textColor: UI_THEME.buttonText, sub: 'activer maintenant' });
      }
    }
  }

  // Pied de page compact : « Recommencer » et « Menu puzzles » côte à côte,
  // pour laisser tout l'espace au bouton d'action au-dessus.
  const footGap = 8, footW = (w - footGap) / 2, footY = CANVAS_H - 48;
  bouton(state, ctx, x, footY, footW, 34, '↻ Recommencer', { kind: 'puzzleRestart' },
    { color: UI_THEME.card, textColor: UI_THEME.text, fontSize: 10 });
  bouton(state, ctx, x + footW + footGap, footY, footW, 34, '← Menu puzzles',
    { kind: 'puzzleHub' }, { color: UI_THEME.primary, textColor: UI_THEME.text, fontSize: 10 });
}

function dessinePuzzleSuccess(ctx, state) {
  const puzzle = PUZZLES[state.puzzleIndex];
  if (!puzzle) return;
  const cx = OX + __BOARD_W / 2, cy = OY + __BOARD_H / 2;
  const mobile = finEcranMobile(state);
  ctx.save(); ctx.fillStyle = UI_THEME.overlay; ctx.fillRect(OX, OY, __BOARD_W, __BOARD_H); ctx.restore();
  const pw = largeurPanneauFin(state, 430), ph = 260, px = cx - pw / 2, py = cy - ph / 2;
  carte(ctx, px, py, pw, ph, 16, UI_THEME.panel, { shadow: true });
  ctx.lineWidth = 3; ctx.strokeStyle = UI_THEME.primary; roundRect(ctx, px, py, pw, ph, 16); ctx.stroke();
  ctx.fillStyle = UI_THEME.primaryDark; ctx.font = `30px ${F_DISPLAY}`;
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(traduire('PUZZLE RÉSOLU !', state.language), cx, py + 44);
  ctx.fillStyle = UI_THEME.text; ctx.font = `17px ${F_DISPLAY}`; ctx.fillText(traduire(puzzle.title, state.language), cx, py + 82);
  ctx.fillStyle = UI_THEME.muted; ctx.font = `13px ${F_TEXTE}`;   learnWrap(ctx, traduire(puzzle.detail, state.language), cx, py + 116, pw - 44, 18, 4);
  const levelButtonH = mobile ? 44 : 36;
  const levelButtonGap = mobile ? 8 : 18;
  const levelButtonPad = 20;
  const levelButtonW = (pw - levelButtonPad * 2 - levelButtonGap * 2) / 3;
  const levelButtonY = mobile ? py + ph - levelButtonH - 12 : py + ph - 56;
  bouton(state, ctx, px + levelButtonPad, levelButtonY, levelButtonW, levelButtonH, 'Rejouer', { kind: 'puzzleRestart' }, { color: UI_THEME.card, textColor: UI_THEME.text });
  bouton(state, ctx, px + levelButtonPad + levelButtonW + levelButtonGap, levelButtonY, levelButtonW, levelButtonH, 'Menu', { kind: 'puzzleHub' }, { color: UI_THEME.primary, textColor: UI_THEME.text });
  const next = state.puzzleIndex + 1 < TOTAL_PUZZLES;
  bouton(state, ctx, px + levelButtonPad + (levelButtonW + levelButtonGap) * 2, levelButtonY, levelButtonW, levelButtonH, next ? 'Suivant' : 'Terminé',
    next ? { kind: 'puzzleNext' } : { kind: 'puzzleHub' },
    { color: UI_THEME.amber, textColor: UI_THEME.buttonText });
}

function dessineLearnSuccess(ctx, state) {
  const game = LEARN_GAMES[state.learnIndex];
  if (!game) return;
  const cx = OX + __BOARD_W / 2, cy = OY + __BOARD_H / 2;
  const mobile = finEcranMobile(state);
  ctx.save(); ctx.fillStyle = UI_THEME.overlay; ctx.fillRect(OX, OY, __BOARD_W, __BOARD_H); ctx.restore();
  const pw = largeurPanneauFin(state, 410), ph = 250, px = cx - pw / 2, py = cy - ph / 2;
  carte(ctx, px, py, pw, ph, 16, UI_THEME.panel, { shadow: true });
  ctx.lineWidth = 3; ctx.strokeStyle = UI_THEME.primary; roundRect(ctx, px, py, pw, ph, 16); ctx.stroke();
  ctx.fillStyle = UI_THEME.primaryDark; ctx.font = `30px ${F_DISPLAY}`;
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(traduire('BIEN JOUÉ !', state.language), cx, py + 44);
  ctx.fillStyle = UI_THEME.text; ctx.font = `17px ${F_DISPLAY}`; ctx.fillText(traduire(game.title, state.language), cx, py + 82);
  ctx.fillStyle = UI_THEME.muted; ctx.font = `13px ${F_TEXTE}`;   learnWrap(ctx, traduire(game.detail, state.language), cx, py + 116, pw - 44, 18, 4);
  const levelButtonH = mobile ? 44 : 36;
  const levelButtonGap = mobile ? 8 : 16;
  const levelButtonPad = 20;
  const mobileLevelButtonW = (pw - levelButtonPad * 2 - levelButtonGap * 2) / 3;
  const levelButtonWidths = mobile ? [mobileLevelButtonW, mobileLevelButtonW, mobileLevelButtonW] : [112, 112, 114];
  const levelButtonXs = mobile
    ? [
      levelButtonPad,
      levelButtonPad + mobileLevelButtonW + levelButtonGap,
      levelButtonPad + (mobileLevelButtonW + levelButtonGap) * 2,
    ]
    : [20, 148, 276];
  const levelButtonY = mobile ? py + ph - levelButtonH - 12 : py + ph - 56;
  bouton(state, ctx, px + levelButtonXs[0], levelButtonY, levelButtonWidths[0], levelButtonH, 'Rejouer', { kind: 'learnRestart' }, { color: UI_THEME.card, textColor: UI_THEME.text });
  bouton(state, ctx, px + levelButtonXs[1], levelButtonY, levelButtonWidths[1], levelButtonH, 'Menu', { kind: 'learnHub' }, { color: UI_THEME.primary, textColor: UI_THEME.text });
  const next = state.learnIndex + 1 < LEARN_GAMES.length;
  bouton(state, ctx, px + levelButtonXs[2], levelButtonY, levelButtonWidths[2], levelButtonH, next ? 'Suivant' : 'Menu',
    next ? { kind: 'learnNext' } : { kind: 'retourMenu' },
    { color: UI_THEME.amber, textColor: UI_THEME.buttonText });
}

export function render(ctx, state, now) {
  computeGeometry(state);
  ensureButtonUI(state);
  majUIFrame(state, now);
  state.ui.buttons = []; // réinitialisé chaque frame pour le hit-test
  ctx.clearRect(0, 0, CANVAS_W, CANVAS_H);

  // SPEC §1.4 : menu d'accueil — occupe tout le canvas, on ne dessine rien d'autre.
  if (state.phase === 'menu') {
    if (state.ui && state.ui.mobile) dessineMenuMobile(ctx, state);
    else dessineMenuDashboard(ctx, state);
    finaliserBoutons(ctx, state);
    return;
  }

  // Parcours TUTORIEL — écran autonome avant le premier plateau.
  if (state.phase === 'tutorial-hub') {
    dessineTutorielHub(ctx, state);
    finaliserBoutons(ctx, state);
    return;
  }

  // Menu APPRENDRE — écran autonome, sans plateau ni réseau.
  if (state.phase === 'learn-hub') {
    dessineLearnHub(ctx, state);
    finaliserBoutons(ctx, state);
    return;
  }
  if (state.phase === 'puzzle-hub') {
    dessinePuzzleHub(ctx, state);
    finaliserBoutons(ctx, state);
    return;
  }

  // Matchmaking PvP en ligne (cycle W1) — plein écran.
  if (state.phase === 'matchmaking') {
    dessineMatchmaking(ctx, state);
    finaliserBoutons(ctx, state);
    return;
  }

  // Écran REPLAYS dédié — plein écran (demande utilisateur 12/07).
  if (state.phase === 'replays') {
    dessineReplays(ctx, state);
    finaliserBoutons(ctx, state);
    return;
  }
  // Deck editor (recovery 29/07 [23:30]) : phase 'decks' = écran principal,
  // phase 'deck-picker' = overlay pour choisir une upgrade pour un slot cliqué.
  if (state.phase === 'decks') { dessineDecks(ctx, state); finaliserBoutons(ctx, state); return; }
  if (state.phase === 'deck-picker') {
    // Le picker est désormais un écran autonome : pas de grille complète des decks
    // en arrière-plan, donc aucune distraction ni amélioration hors contexte visible.
    dessineDeckPicker(ctx, state);
    finaliserBoutons(ctx, state);
    return;
  }

  // Fond parchemin doux (remplace l'ancien fond "app sombre" — cohérent avec
  // la palette pastel déjà définie pour le plateau).
  ctx.fillStyle = UI_THEME.background; ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);

  // Bandeau de tour (DA §11.3.c) — pilule flat plus affirmée : ombre plate,
  // fond de camp ~55 %, contour Encre, onglet 8 px, chevron directionnel.
  // Sur téléphone, le bandeau est retiré pour gagner de la place : le plateau
  // remonte (OY compacté) et les infos de tour restent visibles via les cartes
  // du suivi mobile + les alertes d'échec sur le plateau.
  const mobileGameplayRender = !!(state.ui && state.ui.mobileGameplay);
  if (!mobileGameplayRender) {
  const bY = 10, bH = 26, bR = 13;
  // Ombre plate décalée +2 px (avant la pilule).
  ctx.fillStyle = 'rgba(26,26,26,0.12)';
  roundRect(ctx, OX, bY + 2, __BOARD_W, bH, bR); ctx.fill();
  // Fond de camp à ~55 % d'opacité (hex-alpha 8C) + contour Encre 2 px.
  // Couleur VISUELLE : la bannière « À toi de jouer » prend mon skin en pvw côté 1.
  ctx.fillStyle = ACCENT[campVisuel(state, state.turn)] + '8C';
  roundRect(ctx, OX, bY, __BOARD_W, bH, bR); ctx.fill();
  ctx.lineWidth = 2; ctx.strokeStyle = C_ENCRE;
  roundRect(ctx, OX, bY, __BOARD_W, bH, bR); ctx.stroke();
  // Onglet latéral gauche plein, 8 px.
  //ctx.fillStyle = ACCENT[state.turn];
  //roundRect(ctx, OX, bY, 8, bH, 2.5); ctx.fill();
  // Chevron plein pointant à droite (10×10, Encre).
  const chY = bY + bH / 2;
  ctx.fillStyle = C_ENCRE;
  ctx.beginPath();
  ctx.moveTo(OX + 16, chY - 5); ctx.lineTo(OX + 26, chY); ctx.lineTo(OX + 16, chY + 5);
  ctx.closePath(); ctx.fill();
  ctx.font = `14px ${F_DISPLAY}`;
  ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
  const prefixe = state.mode === 'spectator' ? 'IA ' : '';
  const echecActuel = !!(state.board && state.turn != null
    && state.phase !== 'gameover' && roiEnEchec(state.board, state.turn));
  let banniere;
  switch (state.phase) {
    case 'ruee-target': banniere = 'Ruée : choisissez une cible'; break;
    case 'rayon-target': banniere = 'Rayon sacré : choisissez une cible'; break;
    case 'decret-target': banniere = 'Décret : choisissez un allié adjacent'; break;
    case 'cavalerie-target': banniere = 'Cavalerie : choisissez un ennemi à repousser'; break;
    case 'cavalerie-push': banniere = 'Cavalerie : choisissez la destination'; break;
    case 'echange-target': banniere = 'Échange : choisissez un pion allié'; break;
    case 'vet-target': banniere = 'Vétéran : choisissez le pion à capturer'; break;
    case 'promotion': banniere = 'Promotion : choisissez une pièce'; break;
    default: {
      if (state.mode === 'tutorial') {
        banniere = 'TUTORIEL';
      } else if (state.phase === 'gameover') {
        banniere = 'Partie terminée';
      } else if (echecActuel) {
        banniere = state.mode === 'pvw' && state.pvw && state.turn !== state.pvw.side
          ? 'ÉCHEC — le roi adverse est menacé'
          : 'ÉCHEC — ton roi est menacé';
      } else if (state.ai && state.ai.thinking) {
        banniere = "L'IA RÉFLÉCHIT…";
      } else if (state.mode === 'pvw' && state.pvw) {
        banniere = state.turn === state.pvw.side
          ? 'À toi de jouer'
          : `Au tour de ${state.pvw.oppPseudo || "l'adversaire"}`;
      } else {
        banniere = `Au tour de ${prefixe}${NOM_JOUEUR[state.turn]}`;
      }
    }
  }
  ctx.fillText(traduire(banniere, state.language).toUpperCase(), OX + 32, chY);
  }

  // Tutoriel/Apprendre mobile : les consignes sont dans la carte supérieure,
  // avant le plateau. Les hitboxes restent dans le même canvas logique.
  dessineInstructionsMobile(ctx, state, now);

  // PvP en ligne : bannière de désync (hash discordant, §3.4) — détection W2, annulation W3.
  if (state.mode === 'pvw' && state.pvw && state.pvw.desync) {
    ctx.fillStyle = C_TERRACOTTA;
    roundRect(ctx, OX, OY + __BOARD_H + 6, __BOARD_W, 22, 8); ctx.fill();
    ctx.fillStyle = UI_THEME.text; ctx.font = `12px ${F_DISPLAY}`;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';     ctx.fillText(`⚠ ${traduire('DÉSYNCHRONISATION DÉTECTÉE (voir console)', state.language)}`, OX + __BOARD_W / 2, OY + __BOARD_H + 17);

  }

  dessineEchiquier(ctx, state, now);
  dessinePieces(ctx, state, now);
  if (state.mode === 'tutorial') dessineTutorielCibles(ctx, state, now);
  if (state.mode === 'learn') dessineLearnCibles(ctx, state, now);
  dessinePopups(ctx, state, now);
  dessinePanneauGameplay(ctx, state, now);
  if (state.mode === 'learn' && state.phase === 'learn-success') dessineLearnSuccess(ctx, state);
  if (state.mode === 'learn' && state.phase === 'puzzle-success') dessinePuzzleSuccess(ctx, state);

  // PvP en ligne : bannière de reconnexion (adversaire déconnecté, fenêtre 30 s, §7.2).
  if (state.mode === 'pvw' && state.pvw && state.pvw.oppDisconnected && state.phase !== 'gameover') {
    dessineReconnexionPvw(ctx, state, now);
  }

  if (state.phase === 'promotion') dessinePromotion(ctx, state, now);
  if (state.phase === 'gameover' && state.mode !== 'tutorial') dessineGameOver(ctx, state, now);
  if (state.phase === 'replay') dessineReplayHUD(ctx, state);
  if (state.phase === 'tutorial-done') dessineTutorielFin(ctx, state);
  // Vue « Améliorations achetées » : overlay par-dessus tout (dernier, avant les
  // hitboxes) — comme Promotion, elle masque le reste tant qu'elle est ouverte.
  if (state.upgradesView) dessineVueAmeliorations(ctx, state);
  finaliserBoutons(ctx, state);
}

// --- Guidage visuel du tutoriel ---

// Anneau pulsé autour d'un rectangle (carte d'achat, bouton de pouvoir).
function pulseRect(ctx, x, y, w, h, now) {
  const pulse = 0.5 + 0.5 * Math.sin(now / 400);
  ctx.save();
  ctx.lineWidth = 3.5;
  ctx.strokeStyle = `rgba(231, 189, 20, ${0.45 + 0.55 * pulse})`;
  roundRect(ctx, x - 3, y - 3, w + 6, h + 6, 11); ctx.stroke();
  ctx.restore();
}

// Cases-objectifs de l'étape : anneau ambre pulsé + chevron rebondissant.
function dessineLearnCibles(ctx, state, now) {
  const hint = apprendreHint(state);
  if (!hint || !hint.cells || state.phase === 'learn-success') return;
  const pulse = 0.5 + 0.5 * Math.sin(now / 300);
  for (const cell of hint.cells) {
    const { x, y } = cellCenterVue(state, cell.r, cell.c);
    ctx.save();
    ctx.globalAlpha = 0.20 + pulse * 0.12;
    tilePathVue(ctx, state, cell.r, cell.c); ctx.fillStyle = UI_THEME.amber; ctx.fill();
    ctx.globalAlpha = 0.72 + pulse * 0.24;
    ctx.lineWidth = 3;
    ctx.strokeStyle = UI_THEME.amber;
    ctx.beginPath(); ctx.arc(x, y, Math.max(12, __CELL_SIZE / 2 - 7 + pulse * 3), 0, Math.PI * 2); ctx.stroke();
    ctx.restore();
  }
}

function dessineTutorielCibles(ctx, state, now) {
  const hint = tutorielHint(state);
  if (!hint || !hint.cells) return;
  const pulse = 0.5 + 0.5 * Math.sin(now / 300);

  // Contre-attaque : reprendre exactement les marqueurs du gameplay normal.
  // Les cases vides reçoivent un point ; la première pièce adverse rencontrée
  // reçoit un anneau de capture. Aucun trait, flèche ou pointillé n'est dessiné.
  if (hint.paths && hint.paths.length) {
    for (const path of hint.paths) {
      for (const cell of path.slice(1)) {
        const { x, y } = cellCenterVue(state, cell.r, cell.c);
        const occupant = state.board?.[cell.r]?.[cell.c];
        if (occupant) {
          if (occupant.owner !== state.selected?.owner) {
            ctx.beginPath();
            ctx.arc(x, y, __CELL_SIZE / 2 - 4, 0, Math.PI * 2);
            ctx.lineWidth = 5;
            ctx.strokeStyle = C_CAP;
            ctx.stroke();
          }
          continue;
        }
        ctx.beginPath();
        ctx.arc(x, y, 10, 0, Math.PI * 2);
        ctx.fillStyle = C_MOVE;
        ctx.fill();
      }
    }
    return;
  }

  for (const cell of hint.cells) {
    // Vue identité en tutoriel (jamais pvw) ; passe par le helper par cohérence.
    const { x, y } = cellCenterVue(state, cell.r, cell.c);
    if (hint.markersOnly) continue;
    ctx.save();
    ctx.beginPath(); ctx.arc(x, y, CELL / 2 - 5 + pulse * 3, 0, Math.PI * 2);
    ctx.lineWidth = 4;
    ctx.strokeStyle = `rgba(231, 189, 20, ${0.45 + 0.55 * pulse})`;
    ctx.stroke();
    // Chevron au-dessus de la case (ou en dessous pour la rangée du haut,
    // afin de ne pas chevaucher le bandeau de tour).
    const bas = cell.r === 0;
    const cy = bas ? y + CELL / 2 + 12 + pulse * 5 : y - CELL / 2 - 12 - pulse * 5;
    const pointe = bas ? cy - 10 : cy + 10;
    ctx.fillStyle = C_AMBRE;
    ctx.beginPath();
    ctx.moveTo(x, pointe); ctx.lineTo(x - 8, cy); ctx.lineTo(x + 8, cy);
    ctx.closePath(); ctx.fill();
    ctx.lineWidth = 1.5; ctx.strokeStyle = UI_THEME.border; ctx.stroke();
    ctx.restore();
  }
}

// --- HUD du tutoriel (instructions dans le panneau latéral) ---

function dessineTutorielHUD(ctx, state, x, w, now) {
  const step = STEPS[state.tutorialStep];
  if (!step) return;

  // Titre — wordmark. Retiré sur téléphone pour gagner de la place.
  if (!(state.ui && state.ui.mobileGameplay)) {
    dessineWordmark(ctx, x, OY + 8, 22, 'left');
  }

  // Le suivi détaillé des étapes n'est pas répété sous le plateau : le niveau
  // conserve uniquement son badge et sa barre de progression, plus compacts.
  let y = OY + 40;

  // Badge étape + flash « BIEN JOUÉ ! » à l'arrivée sur l'étape.
  const badgeW = 110, badgeH = 28;
  ctx.fillStyle = UI_THEME.secondary;
  roundRect(ctx, x, y, badgeW, badgeH, 8); ctx.fill();
  ctx.lineWidth = 2; ctx.strokeStyle = C_ENCRE;
  roundRect(ctx, x, y, badgeW, badgeH, 8); ctx.stroke();
  ctx.fillStyle = UI_THEME.text; ctx.font = `13px ${F_DISPLAY}`;
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText(`${traduire('ÉTAPE', state.language)} ${state.tutorialStep + 1}/${TOTAL_STEPS}`, x + badgeW / 2, y + badgeH / 2);
  if (state._tutoBravoT && now - state._tutoBravoT < 1200) {
    ctx.save();
    ctx.globalAlpha = Math.min(1, (1200 - (now - state._tutoBravoT)) / 400);ctx.fillStyle = UI_THEME.primary;
     roundRect(ctx, x + badgeW + 10, y, 130, badgeH, 8); ctx.fill();
    ctx.lineWidth = 2; ctx.strokeStyle = C_ENCRE;
    roundRect(ctx, x + badgeW + 10, y, 130, badgeH, 8); ctx.stroke();
    ctx.fillStyle = UI_THEME.text; ctx.font = `12px ${F_DISPLAY}`;
    ctx.fillText(traduire('✔ BIEN JOUÉ !', state.language), x + badgeW + 75, y + badgeH / 2);
    ctx.restore();
  }
  y += badgeH + 12;

  // Barre de progression.
  const barW = w - 4, barH = 6;
  const pct = (state.tutorialStep + 1) / TOTAL_STEPS;
  ctx.fillStyle = UI_THEME.border;
  roundRect(ctx, x, y, barW, barH, 3); ctx.fill();
  ctx.fillStyle = UI_THEME.secondary;
  roundRect(ctx, x, y, barW * pct, barH, 3); ctx.fill();
  y += barH + 18;

  // Titre de l'étape.
  ctx.fillStyle = UI_THEME.text; ctx.font = `16px ${F_DISPLAY}`;
  ctx.textAlign = 'left'; ctx.textBaseline = 'top';
  ctx.fillText(traduire(step.title, state.language).toUpperCase(), x, y);
  y += 28;

  // Instruction principale.
  ctx.fillStyle = UI_THEME.muted; ctx.font = `600 15px ${F_TEXTE}`;
  const lines = wrapTextLines(ctx, traduire(step.text, state.language), x, y, w - 8, 22);
  y += lines * 22 + 10;

  // Détail.
  if (step.detail) {
    ctx.fillStyle = UI_THEME.disabledText; ctx.font = `12px ${F_TEXTE}`;     const dLines = wrapTextLines(ctx, traduire(step.detail, state.language), x, y, w - 8, 18);

    y += dLines * 18 + 16;
  }

  // Solde d'écus du joueur (le HUD normal est masqué pendant les instructions).
  carte(ctx, x, y, 150, 34, 8, UI_THEME.card);
  ctx.beginPath(); ctx.arc(x + 18, y + 17, 8, 0, Math.PI * 2);ctx.fillStyle = UI_THEME.amber; ctx.fill();
   ctx.lineWidth = 1.5; ctx.strokeStyle = UI_THEME.border; ctx.stroke();
   ctx.fillStyle = UI_THEME.text; ctx.font = `13px ${F_DISPLAY}`;
  ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
  ctx.fillText(`${state.ecus[0]} ${traduire('ÉCUS', state.language)}`, x + 34, y + 18);
  y += 46;

  // Bouton "Continuer" pour les étapes de lecture.
  if (step.continuer) {
    bouton(state, ctx, x + w - 140, y, 130, 36, 'Continuer',
      { kind: 'tutorialContinue' },
      { color: UI_THEME.primary, textColor: UI_THEME.text });
    y += 46;
  }

  // Filet de sécurité : rejouer l'étape depuis zéro en cas d'impasse.
  bouton(state, ctx, x + w - 160, CANVAS_H - 88, 150, 32, '↻ Recommencer',
    { kind: 'tutorialRestart' },
    { color: UI_THEME.card, textColor: UI_THEME.text });

  // Bouton Quitter le tutoriel (toujours visible).
  bouton(state, ctx, x + w - 160, CANVAS_H - 48, 150, 32, '◀  Menu',
    { kind: 'tutorialHub' },
    { color: UI_THEME.card, textColor: UI_THEME.text });
}

// Écran de fin du tutoriel.
function dessineTutorielFin(ctx, state) {
  const cx = OX + __BOARD_W / 2, cy = OY + __BOARD_H / 2;
  const mobile = finEcranMobile(state);

  // Voile de fond.
  ctx.fillStyle = UI_THEME.overlay;
  ctx.fillRect(OX, OY, __BOARD_W, __BOARD_H);

  // Panneau centré.
  const pw = largeurPanneauFin(state, 380), ph = 220;
  const px = cx - pw / 2, py = cy - ph / 2;
  carte(ctx, px, py, pw, ph, 14, UI_THEME.panel, { shadow: true, stroke: null });
  ctx.lineWidth = 3; ctx.strokeStyle = C_SAUGE;
  roundRect(ctx, px, py, pw, ph, 14); ctx.stroke();

  // Titre.
  ctx.font = `32px ${F_DISPLAY}`;
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.lineWidth = 1.5; ctx.lineJoin = 'round'; ctx.strokeStyle = C_ENCRE;
  ctx.strokeText('FÉLICITATIONS !', cx, py + 48);
  ctx.fillStyle = UI_THEME.primaryDark;
  ctx.fillText(traduire('FÉLICITATIONS !', state.language), cx, py + 48);

  // Message.
  ctx.fillStyle = UI_THEME.muted; ctx.font = `15px ${F_TEXTE}`;
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText(traduire('Tu maîtrises les bases de Roychec.', state.language), cx, py + 90);
  ctx.fillText(traduire('Lance une vraie partie !', state.language), cx, py + 112);

  // Bouton Menu : il suit la largeur du panneau sur téléphone tout en gardant
  // une hauteur tactile confortable.
  const finishButtonW = mobile ? pw - 40 : 200;
  const finishButtonH = mobile ? 44 : 48;
  const finishButtonY = mobile ? py + ph - finishButtonH - 12 : py + ph - 62;
  bouton(state, ctx, cx - finishButtonW / 2, finishButtonY, finishButtonW, finishButtonH, 'Menu',
    { kind: 'tutorialHub' },
    { color: UI_THEME.primary, textColor: UI_THEME.text });
}

// --- HUD du mode replay (contrôles de lecture) ---
function dessineReplayHUD(ctx, state) {
  const data = state.replayData;
  if (!data) return;
  // Sur téléphone, le replay prend tout le dessous du plateau : panneau de
  // lecture compact (libellé + Play/Pause + Quitter, progression, vitesses)
  // puis suivi joueurs. Le desktop garde sa barre unique historique.
  if (state.ui && state.ui.mobileGameplay) {
    dessineReplayHUDMobile(ctx, state, Math.max(0, state.replayIndex), data.events.length);
    return;
  }
  const barY = OY + __BOARD_H + 4;
  const barH = 52;

  // Barre de lecture graphite : elle reprend les surfaces du menu hybride
  // sans modifier le rendu du plateau situé au-dessus.
  ctx.fillStyle = REPLAY_UI.panel;
  roundRect(ctx, OX, barY, __BOARD_W, barH, 8); ctx.fill();
  ctx.lineWidth = 1.5; ctx.strokeStyle = REPLAY_UI.border;
  roundRect(ctx, OX, barY, __BOARD_W, barH, 8); ctx.stroke();

  // Progression : "Action X / Y"
  const idx = Math.max(0, state.replayIndex);
  const total = data.events.length;
  ctx.fillStyle = REPLAY_UI.ink; ctx.font = `12px ${F_DISPLAY}`;
  ctx.textAlign = 'left'; ctx.textBaseline = 'middle';  const label = state.replayPlaying
      ? `▶ ${traduire('REPLAY', state.language)} — ${traduire('Action', state.language)} ${idx + 1} / ${total}`
      : `⏸ ${traduire('PAUSE', state.language)} — ${traduire('Action', state.language)} ${idx + 1} / ${total}`;
  if (idx >= total) {     ctx.fillText(`⏹ ${traduire('FIN DU REPLAY', state.language)}`, OX + 12, barY + barH / 2 - 8);

  } else {     ctx.fillText(traduire(label, state.language), OX + 12, barY + barH / 2 - 8);

  }

  // Barre de progression.
  const progW = __BOARD_W - 24, progH = 4;
  const progX = OX + 12, progY = barY + barH / 2 + 4;
  ctx.fillStyle = REPLAY_UI.field;
  roundRect(ctx, progX, progY, progW, progH, 2); ctx.fill();
  if (total > 0) {
    ctx.fillStyle = REPLAY_UI.amber;
    roundRect(ctx, progX, progY, progW * Math.min(1, (idx + 1) / total), progH, 2); ctx.fill();
  }

  // Contrôles (à droite).
  const ctrlX = __BOARD_W - 100;
  const speeds = [
    { label: 'LENT', speed: 1, w: 42 },
    { label: 'NORM', speed: 2, w: 46 },
    { label: 'RAPIDE', speed: 3, w: 54 },
  ];
  let sx = ctrlX - speeds.reduce((s, c) => s + c.w + 6, 0) + 6;
  for (const s of speeds) {
    const sel = state.replaySpeed === s.speed;
    const bw = s.w, bh = 24;
    state.ui.buttons.push({ x: sx, y: barY + barH / 2 - bh / 2 - 1, w: bw, h: bh,
      action: { kind: 'replaySpeed', speed: s.speed }, enabled: true, radius: 6 });
    ctx.fillStyle = sel ? REPLAY_UI.green : REPLAY_UI.field;
    roundRect(ctx, sx, barY + barH / 2 - bh / 2 - 1, bw, bh, 6); ctx.fill();
    ctx.lineWidth = 1; ctx.strokeStyle = sel ? REPLAY_UI.greenD : REPLAY_UI.border;
    roundRect(ctx, sx, barY + barH / 2 - bh / 2 - 1, bw, bh, 6); ctx.stroke();
    ctx.fillStyle = sel ? REPLAY_UI.darkInk : REPLAY_UI.muted;
    ctx.font = `10px ${F_DISPLAY}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';     ctx.fillText(traduire(s.label, state.language), sx + bw / 2, barY + barH / 2 - 1);

    sx += bw + 6;
  }

  // Play/Pause.
  const ppW = 36, ppH = 24, ppX = __BOARD_W -92;
  state.ui.buttons.push({ x: ppX, y: barY + barH / 2 - ppH / 2 - 1, w: ppW, h: ppH,
    action: { kind: 'replayPlayPause' }, enabled: idx < total, radius: 6 });
  ctx.fillStyle = REPLAY_UI.green;
  roundRect(ctx, ppX, barY + barH / 2 - ppH / 2 - 1, ppW, ppH, 6); ctx.fill();
  ctx.lineWidth = 1; ctx.strokeStyle = REPLAY_UI.greenD;
  roundRect(ctx, ppX, barY + barH / 2 - ppH / 2 - 1, ppW, ppH, 6); ctx.stroke();
  ctx.fillStyle = REPLAY_UI.darkInk; ctx.font = `14px ${F_DISPLAY}`;
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText(state.replayPlaying ? '⏸' : '▶', ppX + ppW / 2, barY + barH / 2 - 1);

  // Quitter.
  const qW = 60, qH = 24, qX = __BOARD_W - 48;
  state.ui.buttons.push({ x: qX, y: barY + barH / 2 - qH / 2 - 1, w: qW, h: qH,
    action: { kind: 'replayQuit' }, enabled: true, radius: 6 });
  ctx.fillStyle = REPLAY_UI.rose;
  roundRect(ctx, qX, barY + barH / 2 - qH / 2 - 1, qW, qH, 6); ctx.fill();
  ctx.lineWidth = 1; ctx.strokeStyle = REPLAY_UI.roseD;
  roundRect(ctx, qX, barY + barH / 2 - qH / 2 - 1, qW, qH, 6); ctx.stroke();  ctx.fillStyle = REPLAY_UI.roseInk; ctx.font = `10px ${F_DISPLAY}`;
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText(traduire('QUITTER', state.language), qX + qW / 2, barY + barH / 2 - 1);
}

// HUD replay mobile : panneau compact sous le plateau — ligne 1 libellé de
// lecture + Play/Pause + Quitter, ligne 2 progression, ligne 3 vitesses — puis
// le suivi joueurs (tour + écus) pour garder la lecture lisible sur téléphone.
function dessineReplayHUDMobile(ctx, state, idx, total) {
  const x = OX;
  const w = __BOARD_W;
  const barY = OY + __BOARD_H + 8;
  const barH = 104;
  const playing = state.replayPlaying;

  // Panneau graphite sous le plateau.
  ctx.fillStyle = REPLAY_UI.panel;
  roundRect(ctx, x, barY, w, barH, 10); ctx.fill();
  ctx.lineWidth = 1.5; ctx.strokeStyle = REPLAY_UI.border;
  roundRect(ctx, x, barY, w, barH, 10); ctx.stroke();

  // Ligne 1 : libellé de lecture à gauche, Play/Pause + Quitter à droite.
  const btnY = barY + 12, btnH = 30;
  const qW = 60, ppW = 48, gap = 8;
  const qx = x + w - qW - gap;
  const ppX = qx - ppW - gap;
  const label = playing
    ? `▶ ${traduire('REPLAY', state.language)} — ${traduire('Action', state.language)} ${idx + 1} / ${total}`
    : (idx >= total
      ? `⏹ ${traduire('FIN DU REPLAY', state.language)}`
      : `⏸ ${traduire('PAUSE', state.language)} — ${traduire('Action', state.language)} ${idx + 1} / ${total}`);
  ctx.fillStyle = REPLAY_UI.ink; ctx.font = `12px ${F_DISPLAY}`;
  ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
  const maxLabelW = Math.max(40, ppX - x - 24);
  let labelText = label;
  if (ctx.measureText(labelText).width > maxLabelW) {
    while (labelText.length > 1 && ctx.measureText(`${labelText}…`).width > maxLabelW) {
      labelText = labelText.slice(0, -1);
    }
    labelText += '…';
  }
  ctx.fillText(labelText, x + 12, barY + 27);

  // Play/Pause.
  state.ui.buttons.push({ x: ppX, y: btnY, w: ppW, h: btnH,
    action: { kind: 'replayPlayPause' }, enabled: idx < total, radius: 8 });
  ctx.fillStyle = REPLAY_UI.green;
  roundRect(ctx, ppX, btnY, ppW, btnH, 8); ctx.fill();
  ctx.lineWidth = 1; ctx.strokeStyle = REPLAY_UI.greenD;
  roundRect(ctx, ppX, btnY, ppW, btnH, 8); ctx.stroke();
  ctx.fillStyle = REPLAY_UI.darkInk; ctx.font = `15px ${F_DISPLAY}`;
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText(playing && idx < total ? '⏸' : '▶', ppX + ppW / 2, btnY + btnH / 2 + 1);

  // Quitter.
  state.ui.buttons.push({ x: qx, y: btnY, w: qW, h: btnH,
    action: { kind: 'replayQuit' }, enabled: true, radius: 8 });
  ctx.fillStyle = REPLAY_UI.rose;
  roundRect(ctx, qx, btnY, qW, btnH, 8); ctx.fill();
  ctx.lineWidth = 1; ctx.strokeStyle = REPLAY_UI.roseD;
  roundRect(ctx, qx, btnY, qW, btnH, 8); ctx.stroke();
  ctx.fillStyle = REPLAY_UI.roseInk; ctx.font = `10px ${F_DISPLAY}`;
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText(traduire('QUITTER', state.language), qx + qW / 2, btnY + btnH / 2 + 1);

  // Ligne 2 : barre de progression pleine largeur.
  const progW = w - 24, progH = 5;
  const progX = x + 12, progY = barY + 58;
  ctx.fillStyle = REPLAY_UI.field;
  roundRect(ctx, progX, progY, progW, progH, 3); ctx.fill();
  if (total > 0) {
    ctx.fillStyle = REPLAY_UI.amber;
    roundRect(ctx, progX, progY, progW * Math.min(1, (idx + 1) / total), progH, 3); ctx.fill();
  }

  // Ligne 3 : trois vitesses réparties sur la largeur.
  const speeds = [
    { label: 'LENT', speed: 1 },
    { label: 'NORM', speed: 2 },
    { label: 'RAPIDE', speed: 3 },
  ];
  const sW = 72, sH = 26, sGap = 8;
  const speedsW = speeds.length * sW + (speeds.length - 1) * sGap;
  const sX = x + (w - speedsW) / 2;
  const sY = barY + 70;
  speeds.forEach((s, i) => {
    const bx = sX + i * (sW + sGap);
    const sel = state.replaySpeed === s.speed;
    state.ui.buttons.push({ x: bx, y: sY, w: sW, h: sH,
      action: { kind: 'replaySpeed', speed: s.speed }, enabled: true, radius: 7 });
    ctx.fillStyle = sel ? REPLAY_UI.green : REPLAY_UI.field;
    roundRect(ctx, bx, sY, sW, sH, 7); ctx.fill();
    ctx.lineWidth = 1; ctx.strokeStyle = sel ? REPLAY_UI.greenD : REPLAY_UI.border;
    roundRect(ctx, bx, sY, sW, sH, 7); ctx.stroke();
    ctx.fillStyle = sel ? REPLAY_UI.darkInk : REPLAY_UI.muted;
    ctx.font = `10px ${F_DISPLAY}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(traduire(s.label, state.language), bx + sW / 2, sY + sH / 2 + 1);
  });

  // Suivi joueurs (tour + écus) sous le panneau de lecture. `now` n'est pas
  // utilisé par le suivi : on l'appelle sans pour ne pas dépendre du paramètre.
  dessineSuiviJoueursMobile(ctx, state, x, barY + barH + 12, w);
}
