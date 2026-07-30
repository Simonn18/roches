// roychec — rendu Canvas 2D. Dessine plateau, pièces, feedback, HUD et panneaux.
// Toute l'UI est dessinée sur le canvas ; les boutons cliquables sont enregistrés
// dans state.ui.buttons (hit-testés par main.js).
//
// Direction artistique : plateau de jeu en bois clair / prune, jetons façon
// pièces tournées, chrome (HUD, panneaux) en carton ivoire — pas d'interface
// "app sombre" plaquée par-dessus. Toute la palette vient de constants.js.
import {
  CELL, OX, OY, PANEL_X, CANVAS_W, CANVAS_H,
  C_CLAIR, C_FONCE, C_SEL, C_MOVE, C_CAP, C_RUEE,
  LETTRE, VALEUR_PIECE, UPGRADES, UPGRADES_PAR_TYPE, COULEUR_CAT,
  MAX_UPGRADES_PAR_PIECE, ACCENT, NOM_JOUEUR,
  DUREE_ANIM, DUREE_FLASH, DUREE_POPUP, DUREE_GOLD,
  C_BRUME, C_CARTE, C_ENCRE, C_SAUGE, C_IVOIRE_BOIS,
  C_ENCRE_DOUX, C_ENCRE_PALE, C_CARTE_BORD, C_OMBRE,
  C_AMBRE, C_AMBRE_FONCE, C_TERRACOTTA, C_SAUGE_FONCE, C_AMBRE_CLAIR,
  REMPLI_PIECE,C_ENCRE_sub,
  PVW_CADENCES, cadenceLabel,
} from './constants.js';
import { VARIANT_PRESETS, ECONOMIES, COMBATS, variantLabel } from './variants.js';
// Phase A.5 v2 Phase 3 : TAILLE DE PLATEAU chips itèrent sur TAILLES (maison canonique
// zero-dep de tailles.js). Pas de cycle : tailles.js n'importe aucun autre module.
import { TAILLES } from './tailles.js';
import { DIRS8 } from './rules.js';
import { STEPS, TOTAL_STEPS, tutorielPermet, tutorielHint, tutorielPanneauNormal } from './tutorial.js';
// Deck editor UI (recovery 29/07 [23:30]) : couche DONNÉES pure — loadDecks/getActiveDeck/
// setSlot sont utilisés par main.js (handlers) et render.js (lecture seule du deck actif
// pour l'affichage). Aucune dépendance inverse.
import { loadDecks, getActiveDeck, setActiveDeck, createDeck, sanitizeRoot } from './decks.js';


// Polices (DA §3) : Archivo Black pour tout le display (titres, HUD, badges,
// chiffres d'écus, boutons — toujours en CAPITALES) ; Nunito Sans pour les
// textes longs (descriptions de cartes). Fallback system-ui si les .woff2
// locales ne sont pas encore chargées — le jeu ne bloque jamais dessus.
const F_DISPLAY = '"Archivo Black", system-ui, sans-serif';
const F_TEXTE = '"Nunito Sans", system-ui, -apple-system, "Segoe UI", sans-serif';

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
function computeGeometry(state) {
  __COLS = state && state.board ? state.board[0].length : 8;
  __ROWS = state && state.board ? state.board.length : 8;
  // cellSize : 70 pour std, FLOOR(W_disponible / COLS) pour >8. W_disponible = CANVAS_W
  // moins OX (marge gauche) moins 280 (panel reserve à droite avec marge). Pour l15 :
  // floor((1072-20-280)/15) = floor(772/15) = 51 px → board 765×408, panel à 815 px.
  // Pour Phase A.5 v3 (l11, big), FLOOR gère naturellement tout >8 cols.
  __CELL_SIZE = __COLS > 8
    ? Math.floor((CANVAS_W - OX - 280) / __COLS)
    : 70;
  __BOARD_W = __COLS * __CELL_SIZE;
  __BOARD_H = __ROWS * __CELL_SIZE;
  __TILE_R = Math.round(__CELL_SIZE * 0.14);
  __PANEL_X_RUNTIME = OX + __BOARD_W + 30;
}
// Export pour permettre aux appelants externes (main.js click handlers entre frames)
// de lire la géométrie courante sans la recalculer — source-of-truth unique du module.
export function getCellSize() { return __CELL_SIZE; }
export function getBoardFrame() { return { w: __BOARD_W, h: __BOARD_H, rows: __ROWS, cols: __COLS }; }
export function getPanelXRuntime() { return __PANEL_X_RUNTIME; }

// Confettis statiques de l'écran de victoire (DA §11.5) : positions/rotations fixes
// relatives au centre du panneau, dispersées hors de son emprise (~±190 / ±115 px).
// Motif figé (pas d'animation) — c'est un flourish d'ambiance, calculé une seule fois.
const CONFETTIS = [
  { dx: -235, dy: -150, s: 9, rot: 0.4, ci: 0, tri: false },
  { dx: 235, dy: -130, s: 7, rot: 1.1, ci: 1, tri: true },
  { dx: -260, dy: 30, s: 8, rot: 0.8, ci: 2, tri: false },
  { dx: 250, dy: 60, s: 10, rot: 0.2, ci: 3, tri: true },
  { dx: -200, dy: 150, s: 7, rot: 1.4, ci: 0, tri: false },
  { dx: 210, dy: 160, s: 9, rot: 0.6, ci: 1, tri: false },
  { dx: -140, dy: -175, s: 8, rot: 0.9, ci: 2, tri: true },
  { dx: 130, dy: -180, s: 6, rot: 0.3, ci: 3, tri: false },
  { dx: 0, dy: -195, s: 9, rot: 1.2, ci: 0, tri: true },
  { dx: -280, dy: -60, s: 6, rot: 0.5, ci: 1, tri: false },
  { dx: 275, dy: -20, s: 8, rot: 1.0, ci: 2, tri: false },
  { dx: -90, dy: 175, s: 7, rot: 0.7, ci: 3, tri: true },
  { dx: 90, dy: 180, s: 9, rot: 0.1, ci: 0, tri: false },
  { dx: 300, dy: 120, s: 6, rot: 1.3, ci: 1, tri: true },
  { dx: -300, dy: 110, s: 8, rot: 0.6, ci: 2, tri: false },
  { dx: 40, dy: 205, s: 7, rot: 0.9, ci: 3, tri: true },
];

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
// Phase A.5 v2 Phase 5.A — SPRITE_H size-aware : la cible std (60 px) est préservée à
// cellSize=70, et la pièce shrink proportionnellement quand __CELL_SIZE descend (l15).
// std 70×0.857=60 ; l15 51×0.857=44 (vs cellule 47 utile). On garde un ratio dérivable,
// pas un const : si tailles.js rajoute une taille plus grande, le scaling suit.
const SPRITE_H_RATIO = 60 / 70; // 0.857143
function getSpriteHeight() { return Math.round(__CELL_SIZE * SPRITE_H_RATIO); }
// Incrémente ce numéro après avoir changé les images dans assets/pieces/
// pour forcer le navigateur à recharger les sprites au lieu d'utiliser son cache.
const SPRITE_VERSION = 13;
const sprites = {};  // clé `${owner}${type}` -> HTMLImageElement

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
  const n = parseInt(hex.slice(1), 16);
  const r = Math.round(((n >> 16) & 255) * (1 - f));
  const g = Math.round(((n >> 8) & 255) * (1 - f));
  const b = Math.round((n & 255) * (1 - f));
  return `rgb(${r},${g},${b})`;
}

// Ton d'ombre plate d'un bouton selon sa couleur (DA §11.4.a).
function ombreBouton(color) {
  if (color === C_CARTE) return '#DCD5C7';
  if (color === C_AMBRE) return '#cfaa27';
  return darken(color, 0.17);
}

// Carte / panneau avec ombre douce et liseré — motif chrome répété partout.
function carte(ctx, x, y, w, h, r, fill, { shadow = true, stroke = C_CARTE_BORD } = {}) {
  ctx.save();
  if (shadow) {
    ctx.shadowColor = C_OMBRE;
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

function bouton(state, ctx, x, y, w, h, label, action, { enabled = true, sub = '', color = C_CARTE, textColor = C_ENCRE, subColor = C_ENCRE_sub } = {}) {
  state.ui.buttons.push({ x, y, w, h, action, enabled });
  const r = 10;
  // Ombre plate dure décalée de +4 px (DA §11.4.a) — seulement si actionnable.
  if (enabled) {
    ctx.fillStyle = ombreBouton(color);
    roundRect(ctx, x, y + 4, w, h, r); ctx.fill();
  }
  // Corps du bouton (aplat plein, pas de blur).
  ctx.fillStyle = enabled ? color : '#E7E1D6';
  roundRect(ctx, x, y, w, h, r); ctx.fill();
  // Contour marqué 2.5 px : signale « cliquable » (DA §11.4.a).
  ctx.lineWidth = 2.5; ctx.strokeStyle = enabled ? C_ENCRE : C_ENCRE_PALE;
  roundRect(ctx, x, y, w, h, r); ctx.stroke();
  // Libellé principal : Archivo Black en CAPITALES (DA §3).
  ctx.fillStyle = enabled ? textColor : C_ENCRE_PALE;
  ctx.font = `13px ${F_DISPLAY}`;
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText(label.toUpperCase(), x + w / 2, y + h / 2 - (sub ? 7 : 0));
  if (sub) {
    // Sous-titre descriptif : Nunito Sans, casse normale (texte plus long).
    ctx.font = `11px ${F_TEXTE}`; ctx.fillStyle = enabled ? subColor : C_ENCRE_sub;
    ctx.fillText(sub, x + w / 2, y + h / 2 + 9);
  }
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
  // Phase A.5 v2 Phase 5.A — size-aware via getSpriteHeight() (std 60/2=30, l15 44/2=22).
  const rEtat = img ? getSpriteHeight() / 2 : rayon;

  // 1. Effet feu (pivot v3.2 — 2026-07-11) D'ABORD : derrière le sprite (le user a
  // demandé explicitement « DERRIÈRE la pièce »). Halo radius 34 px autour de (x, y),
  // vidéo tintée par catégorie cat1/cat2 (v3.2 procédure), ou ambre pulsé si Sacrifice
  // armé (cat A forcée par optionsFeuPour).
  // [v3 11/07 → v3.1 11/07 → v3.2 11/07] : feu procédural quilles (annulé) → feu
  // procédural cat (commit 9f48b832) → feu VIDÉO mp4 tinté (pivot user).
  const feuOpts = optionsFeuPour(p);
  if (feuOpts) {
    dessineFeu(ctx, x, y, now, rEtat, feuOpts.col1, feuOpts.col2, feuOpts.pulsed);
  }

  // 2. Sprite de la pièce OU fallback jeton flat — DESSUS le feu (le feu est DERRIÈRE).
  if (img) {
    // Sprite : carré, ratio préservé, centré (léger décalage haut pour laisser
    // un peu d'air avec le halo du feu).
    // Phase A.5 v2 Phase 5.A — hauteur (et largeur) size-aware via getSpriteHeight().
    const ratio = img.naturalWidth / img.naturalHeight;
    const h = getSpriteHeight(), w = h * ratio;
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
function dessineFeu(ctx, x, y, now, r, col1, col2, pulsed) {
  if (!col1) return;
  // Rayon du halo vidéo — bump de 34 → 40 px (11/07 round 2 user request) : le
  // mouvement des flammes est plus visible à distance quand le halo déborde davantage
  // autour de la silhouette (tuile CELL=70 ; la vignette du masque fond les bords).
  const radius = 40;
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

  // Flashes de case (capture terracotta / bris de blindage sauge) — forme tuile.
  for (const f of state.flashes) {
    const k = 1 - (now - f.t0) / DUREE_FLASH;
    if (k <= 0) continue;
    tilePathVue(ctx, state, f.r, f.c);
    ctx.fillStyle = f.color === 'red'
      ? `rgba(181,87,63,${0.55 * k})`
      : `rgba(79,167,156,${0.55 * k})`;
    ctx.fill();
  }

  // Case sélectionnée — forme tuile.
  if (state.selected) {
    const s = state.selected;
    tilePathVue(ctx, state, s.r, s.c);
    ctx.fillStyle = C_SEL; ctx.fill();
  }

  // Aura de Zone de contrôle : teinte les 8 tuiles autour du fou équipé sélectionné.
  if (state.selected && state.selected.type === 'B' && state.selected.upgrades.includes('Zone')) {
    const s = state.selected;
    ctx.fillStyle = 'rgba(155, 203, 140, 0.30)'; // sauge translucide (catégorie stat)
    for (const [dr, dc] of DIRS8) {
      const r = s.r + dr, c = s.c + dc;
      // Phase A.5 v2 Phase 4 : bounds __ROWS/__COLS dynamic (futur-proof l11+).
      if (r >= 0 && r < __ROWS && c >= 0 && c < __COLS) { tilePathVue(ctx, state, r, c); ctx.fill(); }
    }
  }

  // Coups légaux. Phase A.5 v2 Phase 4 : capture ring CELL/2 → __CELL_SIZE/2 (l15 = 25 px).
  for (const mv of state.legalMoves) {
    const { x, y } = cellCenterVue(state, mv.r, mv.c);
    if (mv.capture) {
      ctx.beginPath(); ctx.arc(x, y, __CELL_SIZE / 2 - 4, 0, Math.PI * 2);
      ctx.lineWidth = 5; ctx.strokeStyle = C_CAP; ctx.stroke();
    } else if (mv.tele) {
      // Téléportation : anneau ambre pointillé pour distinguer du déplacement normal.
      ctx.save();
      ctx.beginPath(); ctx.arc(x, y, 13, 0, Math.PI * 2);
      ctx.setLineDash([4, 3]); ctx.lineWidth = 3; ctx.strokeStyle = C_AMBRE; ctx.stroke();
      ctx.restore();
    } else {
      ctx.beginPath(); ctx.arc(x, y, 10, 0, Math.PI * 2);
      ctx.fillStyle = C_MOVE; ctx.fill();
    }
  }

  // Cibles en ciblage : Ruée / Rayon (anneau ambre) ou Décret (anneau sauge sur allié).
  if (state.phase === 'ruee-target' || state.phase === 'rayon-target' || state.phase === 'decret-target') {
    const couleur = state.phase === 'decret-target' ? '#7FB069' : C_RUEE;
    for (const t of state.ruTargets) {
      const { x, y } = cellCenterVue(state, t.r, t.c);
      ctx.beginPath(); ctx.arc(x, y, __CELL_SIZE / 2 - 3, 0, Math.PI * 2);
      ctx.lineWidth = 4; ctx.strokeStyle = couleur; ctx.stroke();
    }
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
    ctx.lineWidth = 2; ctx.lineJoin = 'round'; ctx.strokeStyle = C_ENCRE;
    ctx.strokeText(pop.text, 0, 0);
    ctx.fillStyle = pop.color;
    ctx.fillText(pop.text, 0, 0);
    ctx.restore();
  }
}

// Horloge depuis un nombre de secondes (arrondi haut, jamais négatif).
// < 1 h : mm:ss (inchangé). ≥ 1 h (cadences 1 heure / 1 journée) : « 5h32 » — les
// secondes n'apportent rien à cette échelle et déborderaient la pastille (« 1440:00 »).
function fmtClock(s) {
  s = Math.max(0, Math.ceil(s));
  if (s >= 3600) {
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    return `${h}h${m < 10 ? '0' : ''}${m}`;
  }
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
    carte(ctx, x, y, w, h, 8, actif ? '#FFFFFF' : C_CARTE, { shadow: actif });
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
    ctx.fillStyle = C_ENCRE; ctx.font = `11px ${F_DISPLAY}`;
    ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
    let nom = row.label.toUpperCase();
    if (nom.length > 14) nom = nom.slice(0, 13) + '…';
    ctx.fillText(nom, x + 28, y + h / 2);
    // Horloge mm:ss à droite.
    ctx.fillStyle = bas ? C_TERRACOTTA : C_ENCRE;
    ctx.font = `15px ${F_DISPLAY}`;
    ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
    ctx.fillText('⏱ ' + fmtClock(t), x + w - 10, y + h / 2);
    y += h + 6;
  }
  return y + 6;
}

// --- Panneau latéral (HUD + infos pièce + achats) ---
// Phase A.5 v2 Phase 4 : PANEL_X runtime (__PANEL_X_RUNTIME) recalculé top of render()
// en fonction de __BOARD_W. Std 8x8 → 610 (identique à PANEL_X historique) ; l15 → 815.
function dessinePanneau(ctx, state, now) {
  const x = __PANEL_X_RUNTIME;
  const w = CANVAS_W - __PANEL_X_RUNTIME - 16;

  // Mode tutoriel : instructions à la place du panneau normal, sauf si le
  // panneau d'achat est ouvert ou si l'étape demande le panneau normal
  // (ex. pièce à pouvoir sélectionnée : le joueur doit voir le vrai bouton).
  if (state.mode === 'tutorial' && state.tutorialStep != null && !state.panelPiece
      && !tutorielPanneauNormal(state)) {
    dessineTutorielHUD(ctx, state, x, w, now);
    return;
  }

  // Titre — wordmark Archivo Black en capitales (DA §3).
  ctx.fillStyle = C_ENCRE; ctx.font = `22px ${F_DISPLAY}`;
  ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
  ctx.fillText('♞ ROYCHEC', x, OY + 8);

  // HUD écus des deux joueurs (joueur actif encadré, liseré latéral coloré).
  let y = OY + 34;
  // PvP en ligne (§9.3) : deux horloges mm:ss (adversaire en haut, moi en bas) avant l'HUD.
  if (state.mode === 'pvw' && state.pvw) y = dessineHorlogesPvw(ctx, state, x, w, y, now);
  for (let j = 0; j < 2; j++) {
    const actif = j === state.turn && state.phase !== 'gameover';
    // Couleur VISUELLE du camp (échange 0↔1 en pvw côté 1 : ma ligne « Toi » = skin bleu).
    const vj = campVisuel(state, j);
    carte(ctx, x, y, w, 42, 8, actif ? '#FFFFFF' : C_CARTE, { shadow: actif });
    if (actif) {
      ctx.fillStyle = ACCENT[vj];
      roundRect(ctx, x, y, 4, 42, 2); ctx.fill();
    }
    // Point d'accent de camp (inchangé, DA §11.3.a) + nom du joueur.
    ctx.fillStyle = ACCENT[vj]; ctx.beginPath(); ctx.arc(x + 20, y + 21, 9, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = C_ENCRE; ctx.font = `12px ${F_DISPLAY}`;
    ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
    // En PvP en ligne, on nomme les camps « Toi » / pseudo adverse plutôt que Joueur 1/2.
    let nomJ = NOM_JOUEUR[j];
    if (state.mode === 'pvw' && state.pvw) nomJ = j === state.pvw.side ? 'Toi' : (state.pvw.oppPseudo || 'Adversaire');
    ctx.fillText((nomJ + (actif ? '  ·  à jouer' : '')).toUpperCase(), x + 36, y + 21);

    // Écusson doré du solde (DA §11.3.a) : pilule 60×24, Doré si actif sinon désaturé.
    const eW = 60, eH = 24, eX = x + w - 66, eY = y + 9;
    ctx.fillStyle = ACCENT[vj];
    roundRect(ctx, eX, eY, eW, eH, eH / 2); ctx.fill();
    ctx.lineWidth = 2; ctx.strokeStyle = C_ENCRE;
    roundRect(ctx, eX, eY, eW, eH, eH / 2); ctx.stroke();
    // Icône pièce de monnaie minimale (disque Ivoire + anneau Encre).
    ctx.beginPath(); ctx.arc(eX + 13, eY + eH / 2, 7, 0, Math.PI * 2);
    ctx.fillStyle = C_IVOIRE_BOIS; ctx.fill();
    ctx.lineWidth = 1.5; ctx.strokeStyle = C_ENCRE; ctx.stroke();
    // Solde en chiffres, aligné à droite (8 px de marge).
    ctx.fillStyle = C_ENCRE; ctx.font = `13px ${F_DISPLAY}`;
    ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
    ctx.fillText(String(state.ecus[j]), eX + eW - 8, eY + eH / 2 + 1);
    y += 50;
  }

  y += 8;

  // Enchaînement en attente (Double coup / Second galop).
  if (state.chain) {
    const msg = state.chain.type === 'double-coup'
      ? 'Double coup : rejouez la Dame'
      : 'Second galop : rejouez le Cavalier (sans capture)';
    ctx.fillStyle = C_AMBRE_FONCE; ctx.font = `600 14px ${F_TEXTE}`;
    ctx.textAlign = 'left'; ctx.textBaseline = 'top';
    ctx.fillText(msg, x, y);
    y += 22;
    bouton(state, ctx, x, y, w, 30, 'Terminer le tour', { kind: 'endChain' });
    y += 40;
  }

  // Pièce sélectionnée : infos + actions.
  const sel = state.selected;
  if (sel && sel.owner === state.turn && state.phase !== 'gameover') {
    carte(ctx, x, y, w, 26, 7, '#FFFFFF');
    ctx.fillStyle = C_ENCRE; ctx.font = `600 14px ${F_TEXTE}`;
    ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
    const valeur = valeurAffichee(sel);
    ctx.fillText(`${nomType(sel.type)} — valeur ${valeur}`, x + 10, y + 13);
    y += 34;

    // Pouvoir actif : Ruée (cavalier).
    if (sel.type === 'N' && sel.upgrades.includes('ruee')) {
      const cd = sel.cooldowns.ruee || 0;
      const pret = cd === 0 && state.phase === 'play'
        && tutorielPermet(state, { type: 'power', kind: 'ruee' });
      bouton(state, ctx, x, y, w, 34, 'Ruée', { kind: 'ruee' },
        { enabled: pret, color: C_AMBRE, textColor: '#2B1D06', sub: cd > 0 ? `recharge ${cd}` : 'capture à distance' });
      // Tutoriel : surligne le bouton quand l'étape guide vers ce pouvoir.
      const hintTuto = state.mode === 'tutorial' ? tutorielHint(state) : null;
      if (hintTuto && hintTuto.power === 'ruee') pulseRect(ctx, x, y, w, 34, now);
      y += 42;
    }

    // Pouvoir actif : Rempart (tour).
    if (sel.type === 'R' && sel.upgrades.includes('rempart')) {
      const cd = sel.cooldowns.rempart || 0;
      const pret = cd === 0 && state.phase === 'play'
        && tutorielPermet(state, { type: 'power', kind: 'rempart' });
      bouton(state, ctx, x, y, w, 34, 'Rempart', { kind: 'rempart' },
        { enabled: pret, color: C_AMBRE, textColor: '#2B1D06', sub: cd > 0 ? `recharge ${cd}` : 'blinde la tour et les alliés' });
      y += 42;
    }

    // Pouvoir actif : Rayon sacré (fou).
    if (sel.type === 'B' && sel.upgrades.includes('Rayon')) {
      const cd = sel.cooldowns.Rayon || 0;
      const pret = cd === 0 && state.phase === 'play'
        && tutorielPermet(state, { type: 'power', kind: 'rayon' });
      bouton(state, ctx, x, y, w, 34, 'Rayon sacré', { kind: 'rayon' },
        { enabled: pret, color: C_AMBRE, textColor: '#2B1D06', sub: cd > 0 ? `recharge ${cd}` : 'capture à distance' });
      y += 42;
    }

    // Pouvoir actif : Sacrifice (roi).
    if (sel.type === 'K' && sel.upgrades.includes('sacrifice')) {
      const cd = sel.cooldowns.sacrifice || 0;
      const pret = cd === 0 && !sel.sacrificeArmed && state.phase === 'play'
        && tutorielPermet(state, { type: 'power', kind: 'sacrifice' });
      bouton(state, ctx, x, y, w, 34, 'Sacrifice', { kind: 'sacrifice' },
        { enabled: pret, color: C_AMBRE, textColor: '#2B1D06',
          sub: sel.sacrificeArmed ? 'armé' : (cd > 0 ? `recharge ${cd}` : 'protège le roi (consomme le tour)') });
      y += 42;
    }

    // Pouvoir actif : Décret (roi, usage unique).
    if (sel.type === 'K' && sel.upgrades.includes('decret')) {
      const pret = !sel.decretUsed && state.phase === 'play'
        && tutorielPermet(state, { type: 'power', kind: 'decret' });
      bouton(state, ctx, x, y, w, 34, 'Décret', { kind: 'decret' },
        { enabled: pret, color: C_AMBRE, textColor: '#2B1D06',
          sub: sel.decretUsed ? 'déjà utilisé' : 'échange avec un allié adjacent' });
      y += 42;
    }

    // Bouton Améliorer (si des cartes existent pour ce type et plafond non atteint).
    const cartes = UPGRADES_PAR_TYPE[sel.type] || [];
    if (!state.panelPiece && cartes.length && sel.upgrades.length < MAX_UPGRADES_PAR_PIECE) {
      bouton(state, ctx, x, y, w, 32, 'Améliorer  (clic droit)', { kind: 'ameliorer' },
        { enabled: tutorielPermet(state, { type: 'panel', piece: sel }) });
      y += 40;
    }
  }

  // Panneau d'achat ouvert.
  if (state.panelPiece && state.phase !== 'gameover') {
    y = dessineCatalogue(ctx, state, x, y, w, now);
  }


  // Bouton Retour (spectateur) / Abandonner (PvP, PvAI) — ancré en bas du panneau.
  if (state.phase !== 'gameover' && state.phase !== 'menu' && state.phase !== 'replay') {
    const btnY = CANVAS_H - 48;
    if (state.mode === 'spectator') {
      bouton(state, ctx, __PANEL_X_RUNTIME + w - 140, btnY, 130, 32, '◀  Retour',
        { kind: 'retourMenu' },
        { color: C_SAUGE, textColor: C_ENCRE });
    } else if (state.mode === 'pvp' || state.mode === 'pvai' || state.mode === 'pvw') {
      bouton(state, ctx, __PANEL_X_RUNTIME + w - 140, btnY, 130, 32, 'Abandonner',
        { kind: 'abandonner' },
        { color: C_TERRACOTTA, textColor: '#FFFFFF' });
    }
  }

  // Aide en bas.
  //ctx.fillStyle = C_ENCRE_PALE; ctx.font = `11px ${F_TEXTE}`;
  //ctx.textAlign = 'left'; ctx.textBaseline = 'bottom';
  //ctx.fillText('Clic gauche : jouer  ·  Clic droit : améliorer  ·  Échap : annuler',
  //  x, CANVAS_H - 12);
}

// Petite légende D / A / S — rend lisible le code couleur utilisé sur chaque carte.
function dessineLegendeCategories(ctx, x, y) {
  const items = [['D', 'Déplacement'], ['A', 'Actif'], ['S', 'Stat']];
  ctx.font = `10px ${F_TEXTE}`; ctx.textBaseline = 'middle';
  let lx = x;
  for (const [cat, label] of items) {
    ctx.beginPath(); ctx.arc(lx + 4, y, 4, 0, Math.PI * 2);
    ctx.fillStyle = COULEUR_CAT[cat]; ctx.fill();
    ctx.fillStyle = C_ENCRE_DOUX; ctx.textAlign = 'left';
    ctx.fillText(label, lx + 11, y);
    lx += ctx.measureText(label).width + 26;
  }
}

function dessineCatalogue(ctx, state, x, y, w, now) {
  const p = state.panelPiece;
  ctx.fillStyle = C_ENCRE; ctx.font = `13px ${F_DISPLAY}`;
  ctx.textAlign = 'left'; ctx.textBaseline = 'top';
  ctx.fillText(`AMÉLIORER : ${nomType(p.type).toUpperCase()}`, x, y);
  bouton(state, ctx, x + w - 26, y - 4, 26, 22, '×', { kind: 'closePanel' }, { color: '#F0DED8', textColor: C_TERRACOTTA });
  y += 20;
  dessineLegendeCategories(ctx, x, y + 6);
  // Marge supplémentaire : laisse respirer la pastille de coût qui déborde du haut
  // de la 1re carte (DA §11.1.c, grammaire « déborde du conteneur »).
  y += 28;

  const solde = state.ecus[state.turn];
  const trembler = now - state.buzz < 300;
  const hintTuto = state.mode === 'tutorial' ? tutorielHint(state) : null;
  for (const id of (UPGRADES_PAR_TYPE[p.type] || [])) {
    const u = UPGRADES[id];
    const bientot = !!u.nonImplemente; // effet pas encore codé (GDD) : carte grisée neutre
    // Tutoriel : les cartes hors étape sont verrouillées (grisées + cadenas).
    const verrou = state.mode === 'tutorial' && !tutorielPermet(state, { type: 'buy', id });
    const deja = p.upgrades.includes(id);
    const plein = p.upgrades.length >= MAX_UPGRADES_PAR_PIECE;
    const abordable = solde >= u.cout;
    const achetable = !bientot && !verrou && !deja && !plein && abordable;
    const premium = u.cout >= 12;            // tier « carte chère » (DA §11.1.b) — signal de rareté
    const h = 62;
    const dx = (trembler && state.buzzId === id) ? (Math.random() * 6 - 3) : 0;
    const cx0 = x + dx;

    // Hitbox : toute la carte (w×62). Inchangée par rapport au code corrigé (commit e2fb50be) ;
    // la pastille de coût déborde au-dessus de cette zone mais reste purement décorative
    // (le clic d'achat se fait sur le corps de la carte). Le clic est refusé (buzz) côté acheter().
    state.ui.buttons.push({ x: cx0, y, w, h, action: { kind: 'buy', id }, enabled: true });

    // Fond de carte selon l'état (priorité : bientôt/verrou > achetée > premium > standard, DA §11.1).
    let bg;
    if (bientot || verrou) bg = '#F3EFE7';
    else if (deja) bg = '#EAF1E6';
    else if (premium) bg = abordable ? '#FFFFFF' : '#EAE3D2'; // grisé chaud (reste doré)
    else bg = abordable ? '#FFFFFF' : '#F3EFE7';
    carte(ctx, cx0, y, w, h, 8, bg, { shadow: achetable || deja, stroke: null });

    // Contour selon l'état (un seul, dans l'ordre de priorité DA §11.1).
    if (deja) {
      // Achetée : contour Sauge Foncé 2 px (prime sur le cadre doré).
      ctx.lineWidth = 2; ctx.strokeStyle = C_SAUGE_FONCE;
      roundRect(ctx, cx0, y, w, h, 8); ctx.stroke();
    } else if (premium) {
      // Cadre premium doré 3 px + double liseré Encre 1 px inset (DA §11.1.b).
      ctx.lineWidth = 3; ctx.strokeStyle = C_AMBRE;
      roundRect(ctx, cx0, y, w, h, 8); ctx.stroke();
      ctx.lineWidth = 1; ctx.strokeStyle = C_ENCRE;
      roundRect(ctx, cx0 + 2, y + 2, w - 4, h - 4, 6); ctx.stroke();
    } else {
      // Standard : liseré discret 1 px.
      ctx.lineWidth = 1; ctx.strokeStyle = C_CARTE_BORD;
      roundRect(ctx, cx0, y, w, h, 8); ctx.stroke();
    }

    // Liseré de catégorie (bord gauche) épaissi à 8 px (DA §11.1.a). Sauge Foncé si achetée.
    ctx.fillStyle = deja ? C_SAUGE_FONCE : COULEUR_CAT[u.cat];
    roundRect(ctx, cx0, y, 8, h, 4); ctx.fill();

    // Nom + description (décalés à droite du liseré 8 px).
    ctx.fillStyle = (achetable || deja) && !bientot ? C_ENCRE : C_ENCRE_PALE;
    ctx.font = `12px ${F_DISPLAY}`; ctx.textAlign = 'left'; ctx.textBaseline = 'top';
    ctx.fillText(u.nom.toUpperCase(), cx0 + 18, y + 8);
    ctx.fillStyle = C_ENCRE_DOUX; ctx.font = `11px ${F_TEXTE}`;
    wrapText(ctx, u.desc, cx0 + 18, y + 28, w - 52, 14);

    // Carte « bientôt » : pas de pastille, juste un libellé neutre (DA §11.1, pas de premium).
    if (bientot) {
      ctx.textAlign = 'right'; ctx.font = `700 13px ${F_TEXTE}`; ctx.fillStyle = C_ENCRE_PALE;
      ctx.fillText('bientôt', cx0 + w - 10, y + 8);
    } else if (verrou) {
      // Carte verrouillée par l'étape du tutoriel : cadenas à la place de la pastille.
      ctx.textAlign = 'right'; ctx.font = `700 13px ${F_TEXTE}`; ctx.fillStyle = C_ENCRE_PALE;
      ctx.fillText('🔒', cx0 + w - 10, y + 8);
    } else {
      // Pastille de coût / badge médaille, chevauchant le bord supérieur (DA §11.1.c/d).
      const pcx = cx0 + w - 20, pcy = y, pr = 15;
      let pFill, pTexte, pTexteColor;
      if (deja) {
        pFill = C_SAUGE; pTexte = '✓'; pTexteColor = C_IVOIRE_BOIS; // badge médaille (DA §11.1.d)
      } else {
        pFill = premium ? C_AMBRE : COULEUR_CAT[u.cat];             // doré si premium (DA §11.1.c)
        pTexte = String(u.cout);
        pTexteColor = abordable ? C_IVOIRE_BOIS : C_TERRACOTTA;     // Terracotta si solde insuffisant
      }
      ctx.beginPath(); ctx.arc(pcx, pcy, pr, 0, Math.PI * 2);
      ctx.fillStyle = pFill; ctx.fill();
      ctx.lineWidth = 2; ctx.strokeStyle = C_ENCRE; ctx.stroke();
      // Texte : Archivo Black 13 px, liseré Encre 1 px puis remplissage (lisible sur tout fond).
      ctx.font = `13px ${F_DISPLAY}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.lineWidth = 1; ctx.lineJoin = 'round'; ctx.strokeStyle = C_ENCRE;
      ctx.strokeText(pTexte, pcx, pcy + 1);
      ctx.fillStyle = pTexteColor; ctx.fillText(pTexte, pcx, pcy + 1);
    }
    // Tutoriel : surbrillance pulsée + flèche sur la carte que l'étape fait acheter.
    if (hintTuto && hintTuto.buyId === id) {
      pulseRect(ctx, cx0, y, w, h, now);
      ctx.save();
      // Flèche pointant vers la carte
      ctx.fillStyle = C_AMBRE;
      ctx.beginPath();
      ctx.moveTo(cx0 - 14, y + h / 2);
      ctx.lineTo(cx0 - 3, y + h / 2 - 7);
      ctx.lineTo(cx0 - 3, y + h / 2 + 7);
      ctx.closePath(); ctx.fill();
      // Contour de la flèche
      ctx.lineWidth = 1.5; ctx.strokeStyle = C_ENCRE;
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
    ctx.lineWidth = 1.5; ctx.strokeStyle = C_ENCRE; ctx.stroke();
  }
}

// Panneau modal de promotion (GDD §5.1.b) : le pion a atteint la dernière rangée,
// le joueur choisit sa nouvelle pièce AVANT que le coup ne parte (une seule émission
// réseau). Un clic hors du panneau annule (géré côté main.js, mousedown).
function dessinePromotion(ctx, state, now) {
  const promo = state.promo;
  if (!promo) return;

  // Voile sombre : signale le modal, le plateau reste lisible dessous.
  ctx.fillStyle = 'rgba(36, 28, 22, 0.45)';
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

  carte(ctx, x0, y0, W, H, 14, C_CARTE);

  ctx.fillStyle = C_ENCRE;
  ctx.font = `20px ${F_DISPLAY}`;
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText('PROMOTION', x0 + W / 2, y0 + 30);
  ctx.fillStyle = C_ENCRE_sub;
  ctx.font = `600 12px ${F_TEXTE}`;
  ctx.fillText('Choisissez la nouvelle pièce du pion', x0 + W / 2, y0 + 52);

  // 4 tuiles de choix : sprite réel de la pièce (au skin/camp VISUEL du joueur).
  types.forEach((choix, i) => {
    const bx = x0 + PAD + i * (TILE + GAP);
    const by = y0 + 70;
    carte(ctx, bx, by, TILE, TILE, 10, '#FFFFFF', { shadow: false });
    state.ui.buttons.push({ x: bx, y: by, w: TILE, h: TILE,
      action: { kind: 'promoChoice', t: choix.t }, enabled: true });
    dessinePiece(ctx, state, {
      type: choix.t, owner: promo.piece.owner, upgrades: [], shield: false,
      sacrificeArmed: false, cooldowns: {},
    }, bx + TILE / 2, by + TILE / 2 - 6, now);
    ctx.fillStyle = C_ENCRE_sub;
    ctx.font = `700 10px ${F_TEXTE}`;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(choix.nom.toUpperCase(), bx + TILE / 2, by + TILE - 9);
  });

  // ✕ annuler (coin haut droit) — rend la sélection sans jouer le coup.
  const cx = x0 + W - 30, cy = y0 + 10, cs = 20;
  state.ui.buttons.push({ x: cx, y: cy, w: cs, h: cs,
    action: { kind: 'promoCancel' }, enabled: true });
  ctx.fillStyle = C_TERRACOTTA;
  ctx.font = `700 15px ${F_TEXTE}`;
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText('✕', cx + cs / 2, cy + cs / 2);
}

function dessineGameOver(ctx, state, now) {
  const cx = OX + __BOARD_W / 2, cy = OY + __BOARD_H / 2;
  // Voile de fond (inchangé, DA §11.5).
  ctx.fillStyle = 'rgba(36,28,22,0.72)';
  ctx.fillRect(OX, OY, __BOARD_W, __BOARD_H);

  // Burst de 16 rayons plats alternant Doré / Doré Clair, derrière le panneau (DA §11.5).
  ctx.save();
  ctx.beginPath(); ctx.rect(OX, OY, __BOARD_W, __BOARD_H); ctx.clip(); // rester dans la zone voilée
  ctx.globalAlpha = 0.38;
  const R = 250, N = 16;
  for (let i = 0; i < N; i++) {
    const a0 = (i / N) * Math.PI * 2 - Math.PI / 2;
    const a1 = ((i + 1) / N) * Math.PI * 2 - Math.PI / 2;
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.lineTo(cx + Math.cos(a0) * R, cy + Math.sin(a0) * R);
    ctx.lineTo(cx + Math.cos(a1) * R, cy + Math.sin(a1) * R);
    ctx.closePath();
    ctx.fillStyle = i % 2 === 0 ? C_AMBRE : C_AMBRE_CLAIR;
    ctx.fill();
  }
  ctx.restore();

  // Confettis statiques autour du panneau (DA §11.5, flourish figé).
  const confColors = [C_AMBRE, C_SAUGE, ACCENT[0], ACCENT[1]];
  ctx.save();
  ctx.beginPath(); ctx.rect(OX, OY, __BOARD_W, __BOARD_H); ctx.clip();
  for (const cf of CONFETTIS) {
    ctx.save();
    ctx.translate(cx + cf.dx, cy + cf.dy); ctx.rotate(cf.rot);
    ctx.fillStyle = confColors[cf.ci];
    ctx.lineWidth = 1.5; ctx.strokeStyle = C_ENCRE;
    if (cf.tri) {
      ctx.beginPath();
      ctx.moveTo(0, -cf.s / 2); ctx.lineTo(cf.s / 2, cf.s / 2); ctx.lineTo(-cf.s / 2, cf.s / 2);
      ctx.closePath();
    } else {
      roundRect(ctx, -cf.s / 2, -cf.s / 2, cf.s, cf.s, 2);
    }
    ctx.fill(); ctx.stroke();
    ctx.restore();
  }
  ctx.restore();

  // Bloc trophées : depuis W3, EXCLUSIVEMENT en PvP en ligne (le PvAI n'écrit rien —
  // QA-PVW-18). state.trophy est posé par reporterResultatPvP (pending → résolu).
  const tr = state.trophy;
  const pvw = state.mode === 'pvw' && state.pvw;
  const voided = !!(pvw && state.pvw.voided);          // match annulé (désync, §3.4)
  const showTrophy = pvw && !voided && tr && !tr.pending;
  const pendingTrophy = pvw && !voided && tr && tr.pending;
  const guestEph = false;                               // PvP = compte requis, jamais éphémère

  // Panneau centré, cadre Doré 3 px (DA §11.5). Hauteur adaptée au contenu.
  const hasReplay = !!state.replay;
  const pw = 380;
  let ph = 210;
  if (showTrophy || pendingTrophy || voided) ph += 60;
  if (hasReplay) ph += 52;
  if (pvw && !voided) ph += 56;                         // bouton Revanche
  if (pvw) ph += 56;                                    // bouton Nouvelle partie (aussi si voided)
  const px = cx - pw / 2, py = cy - ph / 2;
  carte(ctx, px, py, pw, ph, 14, C_CARTE, { shadow: true, stroke: null });
  ctx.lineWidth = 3; ctx.strokeStyle = C_AMBRE;
  roundRect(ctx, px, py, pw, ph, 14); ctx.stroke();

  // Couronne centrée sur le bord supérieur du panneau (moitié dépasse, DA §11.5).
  dessineCouronne(ctx, cx, py - 17);

  // Nom du vainqueur : Archivo Black 32 px, liseré Encre 1.5 px puis remplissage camp.
  ctx.font = `32px ${F_DISPLAY}`;
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.lineWidth = 1.5; ctx.lineJoin = 'round'; ctx.strokeStyle = C_ENCRE;
  // PvP en ligne : nom du vainqueur = « Toi » / pseudo adverse ; nulle possible (§6.3).
  // (pvw déjà calculé plus haut pour le gating du bloc trophée.)
  let titre, titreColor;
  if (state.winner === null) {
    titre = 'ÉGALITÉ'; titreColor = C_ENCRE;
  } else if (pvw) {
    const nom = state.winner === state.pvw.side ? 'TU' : (state.pvw.oppPseudo || 'Adversaire').toUpperCase();
    titre = `${nom} GAGNE${state.winner === state.pvw.side ? 'S' : ''} !`;
    // Couleur VISUELLE : si je gagne, la couleur annoncée est celle de MES pièces à l'écran.
    titreColor = ACCENT[campVisuel(state, state.winner)];
  } else {
    titre = `${NOM_JOUEUR[state.winner].toUpperCase()} GAGNE !`;
    titreColor = ACCENT[campVisuel(state, state.winner)];
  }
  ctx.strokeText(titre, cx, py + 48);
  ctx.fillStyle = titreColor;
  ctx.fillText(titre, cx, py + 48);

  // Sous-texte selon la cause de fin.
  ctx.fillStyle = C_ENCRE_DOUX; ctx.font = `15px ${F_TEXTE}`;
  let soustexte = 'Roi capturé';
  if (voided) soustexte = 'Partie annulée';
  else if (pvw && state.pvw.endReason === 'time') soustexte = state.winner === null ? 'Égalité au temps (départage)' : 'Victoire au temps (départage)';
  else if (pvw && state.pvw.endReason === 'resign') soustexte = 'Abandon';
  else if (pvw && state.pvw.endReason === 'abandon') soustexte = 'Victoire par abandon (adversaire déconnecté)';
  ctx.fillText(soustexte, cx, py + 84);

  // --- Bloc central : trophée (PvP), calcul en cours, ou annulation ---
  const midY = py + 116;
  if (voided) {
    ctx.fillStyle = C_TERRACOTTA; ctx.font = `14px ${F_TEXTE}`;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText('Désynchronisation détectée — aucun trophée attribué.', cx, midY);
  } else if (pendingTrophy) {
    ctx.fillStyle = C_ENCRE_DOUX; ctx.font = `14px ${F_TEXTE}`;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    const dots = ['.', '..', '...'][Math.floor(now / 400) % 3];
    ctx.fillText('Calcul des trophées' + dots, cx, midY);
  } else if (showTrophy) {
    dessineBlocTrophee(ctx, state, cx, midY, guestEph, now);
  }

  // --- Boutons empilés depuis le bas ---
  let btnY = py + ph - 58;
  // Bouton principal : retour au menu (tous modes).
  bouton(state, ctx, cx - 100, btnY, 200, 46, pvw ? 'Menu' : 'Nouvelle partie',
    { kind: 'restart' }, { color: pvw ? C_CARTE : C_AMBRE, textColor: pvw ? C_ENCRE : '#2B1D06' });

  // Bouton « Nouvelle partie » (PvP uniquement) : enchaîner une recherche publique sans
  // repasser par le menu/lobby. Présent aussi si le match est annulé (voided) — même besoin.
  // Désactivé si une revanche est en cours de lancement (évite un double départ).
  if (pvw) {
    btnY -= 54;
    const rmLaunching = !!(state.pvw.rematch && state.pvw.rematch.launching);
    bouton(state, ctx, cx - 130, btnY, 260, 46, '🔍 Nouvelle partie', { kind: 'newSearchOnline' },
      { color: C_SAUGE, textColor: C_ENCRE, sub: 'chercher un autre adversaire', enabled: !rmLaunching });
  }

  // Bouton Revanche (PvP uniquement, §9.4) : au-dessus du bouton Menu.
  if (pvw && !voided) {
    btnY -= 54;
    const rm = state.pvw.rematch || {};
    if (rm.expired) {
      bouton(state, ctx, cx - 130, btnY, 260, 46, 'Adversaire parti', { kind: 'noop' },
        { enabled: false });
    } else if (rm.launching) {
      bouton(state, ctx, cx - 130, btnY, 260, 46, 'Revanche en cours…', { kind: 'noop' },
        { enabled: false });
    } else if (rm.offeredByMe) {
      bouton(state, ctx, cx - 130, btnY, 260, 46, 'En attente de l\'adversaire…', { kind: 'noop' },
        { enabled: false });
    } else {
      const sub = rm.offeredByOpp ? 'l\'adversaire propose une revanche !' : 'couleurs inversées';
      bouton(state, ctx, cx - 130, btnY, 260, 46, '🔁 Revanche', { kind: 'rematch' },
        { color: C_AMBRE, textColor: '#2B1D06', sub });
    }
  }

  // Bouton replay : téléchargement du .md (Blob + download). Au-dessus des CTA.
  if (hasReplay) {
    btnY -= 52;
    bouton(state, ctx, cx - 160, btnY, 320, 42, '📥 Télécharger le replay (.md)',
      { kind: 'downloadReplay' },
      { color: C_CARTE, textColor: C_ENCRE, sub: 'pour analyse ou futur tutoriel' });
  }
}

// Bannière de reconnexion (§7.2) : l'adversaire a disparu, fenêtre de 30 s avant
// victoire par abandon. Bandeau semi-opaque en haut du plateau + barre décroissante.
function dessineReconnexionPvw(ctx, state, now) {
  const p = state.pvw;
  const restant = Math.max(0, 30 - (now - p.oppDcT0) / 1000);
  const bw = __BOARD_W - 40, bx = OX + 20, by = OY + __BOARD_H / 2 - 34, bh = 68;
  ctx.save();
  ctx.fillStyle = 'rgba(36,28,22,0.82)';
  roundRect(ctx, bx, by, bw, bh, 12); ctx.fill();
  ctx.lineWidth = 2; ctx.strokeStyle = C_TERRACOTTA;
  roundRect(ctx, bx, by, bw, bh, 12); ctx.stroke();
  const nom = (p.oppPseudo || 'Adversaire');
  ctx.fillStyle = '#FFFFFF'; ctx.font = `15px ${F_DISPLAY}`;
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText(`${nom} déconnecté`.toUpperCase(), bx + bw / 2, by + 20);
  ctx.fillStyle = '#F1E4D2'; ctx.font = `13px ${F_TEXTE}`;
  ctx.fillText(`Reprise possible — ${Math.ceil(restant)} s`, bx + bw / 2, by + 40);
  // Barre décroissante.
  const barW = bw - 40, barX = bx + 20, barY = by + bh - 14;
  ctx.fillStyle = 'rgba(255,255,255,0.2)';
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
    ctx.fillStyle = C_ENCRE_DOUX; ctx.font = `14px ${F_TEXTE}`;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    let m = 'Trophées non modifiés';
    if (tr.disputed) m = 'Résultat contesté — trophées non modifiés';
    else if (tr.status === 'pending') m = 'En attente du rapport adverse…';
    else m = 'Hors ligne — trophées non sauvegardés';
    ctx.fillText(m, cx, baseY);
    ctx.fillStyle = C_ENCRE_PALE; ctx.font = `13px ${F_TEXTE}`;
    ctx.fillText(`Trophées : ${tr.total != null ? tr.total : tr.prev}`, cx, baseY + 24);
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
  ctx.fillStyle = C_ENCRE_DOUX; ctx.font = `14px ${F_TEXTE}`;
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  const note = tr.error ? '  (hors ligne, non sauvegardé)' : '';
  ctx.fillText(`Trophées : ${shown}${note}`, cx, baseY + 30);
}

// --- Helpers d'affichage ---
function nomType(t) {
  return { P: 'Pion', N: 'Cavalier', B: 'Fou', R: 'Tour', Q: 'Dame', K: 'Roi' }[t];
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

// Bandeau compte affiché en haut du menu (cycle A, spec-online §5.1). Les formulaires
// (email / code / pseudo) sont eux gérés en DOM (overlay), pas ici. La saisie du texte
// n'appartient pas au canvas ; ce bandeau ne fait qu'afficher l'état + un bouton d'action.
function dessineBandeauCompte(ctx, state) {
  const acc = state.account || { status: 'guest' };
  const bw = 156, right = CANVAS_W - 20;
  if (acc.status === 'connected') {
    // Ligne pseudo + compteur trophées (DA §11.3 : ambre/or), puis bouton DÉCONNEXION.
    ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
    ctx.fillStyle = C_AMBRE_FONCE; ctx.font = `14px ${F_DISPLAY}`;
    ctx.fillText('🏆 ' + (acc.trophies || 0), right, 30);
    ctx.fillStyle = C_ENCRE; ctx.font = `15px ${F_DISPLAY}`;
    ctx.fillText(('♟ ' + (acc.pseudo || '')).toUpperCase(), right, 50);
    bouton(state, ctx, right - bw, 64, bw, 32, 'Déconnexion', { kind: 'logout' },
      { color: C_CARTE, textColor: C_ENCRE });
  } else {
    // Invité (ou pose de pseudo en cours) : bouton CONNEXION.
    bouton(state, ctx, right - bw, 24, bw, 38, 'Connexion', { kind: 'login' },
      { color: C_SAUGE, textColor: C_ENCRE, sub: 'sauvegarde ta progression' });
    // Compteur RAM éphémère (spec §2.4) : n'affiché que si des trophées ont été gagnés
    // durant la session (perdus au reload).
    if (acc.trophies > 0) {
      ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
      ctx.fillStyle = C_AMBRE_FONCE; ctx.font = `13px ${F_DISPLAY}`;
      ctx.fillText('🏆 ' + acc.trophies, right, 74);
      ctx.fillStyle = C_ENCRE_PALE; ctx.font = `10px ${F_TEXTE}`;
      ctx.fillText('éphémère — connecte-toi pour sauvegarder', right, 88);
    }
  }
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
function dessineMenu(ctx, state) {
  // [V2] Constantes (palette + typo, mêmes que v5.10).
  const F_V2 = 'ui-rounded, "SF Pro Rounded", "Segoe UI Rounded", "Baloo 2", system-ui, sans-serif';
  const V2 = {
    bg:       '#EFEAF6', card:    '#FFFFFF',
    ink:      '#2B2440', inkSoft: '#6B6280',
    purple:   '#8B6BB5', purpleD: '#6E4FA0',
    green:    '#3F5B4C', greenD:  '#33493D',
    rose:     '#E7B9AC', roseD:   '#D99A88',
    panelL:   '#F1EAFA', panelO:  '#F4F2FB', panelC: '#FBEEE9',
    field:    '#E6E1F2', fldInk:  '#4A4460', border: '#E3DCF4',
  };
  const R_LG = 22, R_MD = 16, R_SM = 12, R_XS = 8;

  // [V2] Helpers LOCAUX (DRY canvas draws).
  function panelBg(x, y, w, h, bg, radius = R_MD) {
    ctx.fillStyle = bg;
    roundRect(ctx, x, y, w, h, radius); ctx.fill();
    ctx.lineWidth = 1; ctx.strokeStyle = V2.border;
    roundRect(ctx, x, y, w, h, radius); ctx.stroke();
  }
  function panelLabel(x, y, w, label) {
    ctx.fillStyle = V2.card;
    roundRect(ctx, x, y, w, 34, R_SM); ctx.fill();
    ctx.lineWidth = 1; ctx.strokeStyle = V2.border;
    roundRect(ctx, x, y, w, 34, R_SM); ctx.stroke();
    ctx.fillStyle = V2.ink; ctx.font = `bold 13px ${F_V2}`;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(label.toUpperCase(), x + w / 2, y + 17);
  }
  function field(x, y, w, h, label, action, opts = {}) {
    const enabled = opts.enabled !== false;
    state.ui.buttons.push({ x, y, w, h, action, enabled });
    ctx.fillStyle = enabled ? V2.field : '#E8E3EE';
    roundRect(ctx, x, y, w, h, R_MD); ctx.fill();
    ctx.lineWidth = 1;
    ctx.strokeStyle = enabled ? V2.border : 'rgba(43,36,64,0.18)';
    roundRect(ctx, x, y, w, h, R_MD); ctx.stroke();
    ctx.fillStyle = enabled ? V2.fldInk : V2.inkSoft;
    ctx.font = `bold 13px ${F_V2}`;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(label.toUpperCase(), x + w / 2, y + h / 2 - (opts.sub ? 8 : 0));
    if (opts.sub) {
      ctx.font = `11px ${F_V2}`;
      ctx.fillStyle = enabled ? V2.fldInk : V2.inkSoft;
      ctx.fillText(opts.sub, x + w / 2, y + h / 2 + 10);
    }
  }
  function cta(x, y, w, h, label, action, color = V2.green, opts = {}) {
    const enabled = opts.enabled !== false;
    state.ui.buttons.push({ x, y, w, h, action, enabled });
    if (enabled) {
      ctx.save(); ctx.globalAlpha = 0.18; ctx.fillStyle = V2.purpleD;
      roundRect(ctx, x, y + 3, w, h, R_LG); ctx.fill(); ctx.restore();
    }
    ctx.fillStyle = enabled ? color : V2.field;
    roundRect(ctx, x, y, w, h, R_LG); ctx.fill();
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = enabled ? V2.purpleD : 'rgba(43,36,64,0.18)';
    roundRect(ctx, x, y, w, h, R_LG); ctx.stroke();
    ctx.fillStyle = enabled ? '#FFFFFF' : V2.inkSoft;
    ctx.font = `bold 15px ${F_V2}`;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(label.toUpperCase(), x + w / 2, y + h / 2 - (opts.sub ? 9 : 0));
    if (opts.sub) {
      ctx.font = `12px ${F_V2}`;
      ctx.fillStyle = enabled ? 'rgba(255,255,255,0.92)' : V2.inkSoft;
      ctx.fillText(opts.sub, x + w / 2, y + h / 2 + 12);
    }
  }
  function friendBtn(x, y, w, h, label, action) {
    state.ui.buttons.push({ x, y, w, h, action, enabled: true });
    ctx.save(); ctx.globalAlpha = 0.18; ctx.fillStyle = V2.purpleD;
    roundRect(ctx, x, y + 3, w, h, R_LG); ctx.fill(); ctx.restore();
    ctx.fillStyle = V2.rose;
    roundRect(ctx, x, y, w, h, R_LG); ctx.fill();
    ctx.lineWidth = 1.5; ctx.strokeStyle = V2.purpleD;
    roundRect(ctx, x, y, w, h, R_LG); ctx.stroke();
    ctx.fillStyle = V2.ink; ctx.font = `bold 13px ${F_V2}`;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(label, x + w / 2, y + h / 2);
  }

  const cx = CANVAS_W / 2;
  const diffSelected = !!(state.menu && state.menu.difficulty);
  const varOpen = !!(state.menu && state.menu.showVariant);
  const varEco = (state.menu && state.menu.economie) || 'standard';
  const varCbt = (state.menu && state.menu.combat) || 'standard';
  const cbtLabel = (COMBATS.find((c) => c.id === varCbt) || {}).label || varCbt;
  const ecoLabel = (ECONOMIES.find((e) => e.id === varEco) || {}).label || varEco;
  const varStatus = `${varOpen ? '▼' : '▶'}  VARIANTES  ·  ${ecoLabel} × ${cbtLabel}`;

  // === Fond lavande ===
  ctx.fillStyle = V2.bg;
  ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);

  // === Title row (y=24..80) ===
  ctx.fillStyle = V2.purpleD; ctx.font = `bold 38px ${F_V2}`;
  ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
  ctx.fillText('♞ ROYCHEC', 32, 78);

  // === TUTORIEL bar full-width (y=110..166) ===
  const tutY = 110, tutH = 56, tutX = 32, tutW = CANVAS_W - 64;
  state.ui.buttons.push({ x: tutX, y: tutY, w: tutW, h: tutH,
    action: { kind: 'tutoriel' }, enabled: true });
  ctx.fillStyle = V2.panelO;
  roundRect(ctx, tutX, tutY, tutW, tutH, R_MD); ctx.fill();
  ctx.lineWidth = 1; ctx.strokeStyle = V2.border;
  roundRect(ctx, tutX, tutY, tutW, tutH, R_MD); ctx.stroke();
  ctx.fillStyle = V2.purpleD; ctx.font = `bold 18px ${F_V2}`;
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText('🎓  TUTORIEL', cx, tutY + 22);
  ctx.font = `12px ${F_V2}`; ctx.fillStyle = V2.fldInk;
  ctx.fillText('apprendre à jouer en 5 minutes', cx, tutY + 42);

  // === VARIANTES toggle bar (y=190..225, full-width, partagé) ===
  const varY = 190, varH = 35;
  state.ui.buttons.push({ x: 32, y: varY, w: CANVAS_W - 64, h: varH,
    action: { kind: 'toggleVariant' }, enabled: true });
  ctx.fillStyle = V2.panelL;
  roundRect(ctx, 32, varY, CANVAS_W - 64, varH, R_SM); ctx.fill();
  ctx.lineWidth = 1; ctx.strokeStyle = V2.border;
  roundRect(ctx, 32, varY, CANVAS_W - 64, varH, R_SM); ctx.stroke();
  ctx.fillStyle = V2.purpleD; ctx.font = `bold 13px ${F_V2}`;
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText(varStatus.toUpperCase(), cx, varY + varH / 2);

  // === Accordion ECONOME + COMBAT chips (when state.menu.showVariant) ===
  let panelsY = varY + varH + 16;  // 241 si fermé
  let panelsH = 530;
  if (varOpen) {
    let accY = varY + varH + 8;  // 233
    ctx.fillStyle = V2.inkSoft; ctx.font = `10px ${F_V2}`;
    ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic';
    ctx.fillText('MODE ÉCONOMIE — plafond du solde (écus)', cx, accY + 4);
    accY += 14;
    const ecoChipW = 92, ecoChipH = 26;
    const ecoTotal = 3 * ecoChipW + 2 * 8;
    for (let i = 0; i < ECONOMIES.length; i++) {
      const e = ECONOMIES[i];
      const ex = cx - ecoTotal / 2 + i * (ecoChipW + 8);
      const sel = varEco === e.id;
      state.ui.buttons.push({ x: ex, y: accY, w: ecoChipW, h: ecoChipH,
        action: { kind: 'pickEconomie', value: e.id }, enabled: true });
      ctx.fillStyle = sel ? V2.green : V2.field;
      roundRect(ctx, ex, accY, ecoChipW, ecoChipH, R_XS); ctx.fill();
      ctx.lineWidth = 1.5; ctx.strokeStyle = sel ? V2.greenD : V2.border;
      roundRect(ctx, ex, accY, ecoChipW, ecoChipH, R_XS); ctx.stroke();
      ctx.fillStyle = sel ? '#FFFFFF' : V2.fldInk;
      ctx.font = `bold 11px ${F_V2}`;
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(e.label.toUpperCase(), ex + ecoChipW / 2, accY + ecoChipH / 2);
    }
    accY += ecoChipH + 16;
    ctx.fillStyle = V2.inkSoft; ctx.font = `10px ${F_V2}`;
    ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic';
    ctx.fillText("MODE COMBAT — les déplacements n'apportent pas d'écus", cx, accY + 4);
    accY += 14;
    const cbtChipW = 142, cbtChipH = 26;
    const cbtTotal = 2 * cbtChipW + 1 * 8;
    for (let i = 0; i < COMBATS.length; i++) {
      const c = COMBATS[i];
      const cxx = cx - cbtTotal / 2 + i * (cbtChipW + 8);
      const sel = varCbt === c.id;
      state.ui.buttons.push({ x: cxx, y: accY, w: cbtChipW, h: cbtChipH,
        action: { kind: 'pickCombat', value: c.id }, enabled: true });
      const selCol = sel ? V2.rose : V2.field;
      ctx.fillStyle = selCol;
      roundRect(ctx, cxx, accY, cbtChipW, cbtChipH, R_XS); ctx.fill();
      ctx.lineWidth = 1.5; ctx.strokeStyle = sel ? V2.roseD : V2.border;
      roundRect(ctx, cxx, accY, cbtChipW, cbtChipH, R_XS); ctx.stroke();
      ctx.fillStyle = sel ? V2.ink : V2.fldInk;
      ctx.font = `bold 11px ${F_V2}`;
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(c.label.toUpperCase(), cxx + cbtChipW / 2, accY + cbtChipH / 2);
    }
    accY += cbtChipH + 16;
    // === Phase A.5 v2 Phase 3 — 3e row « TAILLE DE PLATEAU » ===
    // Itère directement sur TAILLES (maison canonique zero-dep de tailles.js) — DRY,
    // auto-future-proof si Phase A.5 v3 ajoute une taille (l11, big...). Std = vert,
    // l15 = violet pour contraste visuel. Le silent fallback std pour modes hors
    // scope (PvAI / PvP en ligne standard-only) est appliqué côté commencerPartie.
    ctx.fillStyle = V2.inkSoft; ctx.font = `10px ${F_V2}`;
    ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic';
    ctx.fillText('TAILLE DE PLATEAU — 8 × 8 (standard) ou 8 × 15', cx, accY + 4);
    accY += 14;
    {
      const tailChipW = 142, tailChipH = 26;
      const tailArray = Object.values(TAILLES);
      const tailTotal = tailArray.length * tailChipW + (tailArray.length - 1) * 8;
      const varTail = (state.menu && state.menu.taille) || 'std';
      // Header text dynamique derived from TAILLES (DRY — si Phase A.5 v3 ajoute
      // une taille, le label suit automatiquement).
      const sizesHeader = tailArray.map((t) => t.label).join(' ou ');
      ctx.fillText(`TAILLE DE PLATEAU — ${sizesHeader}`.toUpperCase(), cx, accY - 10);
      for (let i = 0; i < tailArray.length; i++) {
        const t = tailArray[i];
        const txx = cx - tailTotal / 2 + i * (tailChipW + 8);
        const sel = varTail === t.id;
        state.ui.buttons.push({ x: txx, y: accY, w: tailChipW, h: tailChipH,
          action: { kind: 'pickTaille', value: t.id }, enabled: true });
        // Lookup direct fill (V2[t.accent]) + stroke (V2[t.stroke]) — pas d'approximation
        // +'D'. tailees.js est la maison canonique des deux clés : tout nouveau TAILLES.*
        // (Phase A.5 v3+) doit déclarer BOTH `accent` ET `stroke`.
        const selCol = sel ? (V2[t.accent] || V2.green) : V2.field;
        const strokeCol = sel ? (V2[t.stroke] || V2.border) : V2.border;
        ctx.fillStyle = selCol;
        roundRect(ctx, txx, accY, tailChipW, tailChipH, R_XS); ctx.fill();
        ctx.lineWidth = 1.5; ctx.strokeStyle = strokeCol;
        roundRect(ctx, txx, accY, tailChipW, tailChipH, R_XS); ctx.stroke();
        ctx.fillStyle = sel ? '#FFFFFF' : V2.fldInk;
        ctx.font = `bold 11px ${F_V2}`;
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText(t.label.toUpperCase(), txx + tailChipW / 2, accY + tailChipH / 2);
      }
    }
    panelsY = accY + 26 + 8;  // tailChipH=26 + 8 gap ; ≈ 380
    panelsH = 368;  // compressé davantage car la row TAILLE ajoute une ligne
  }

  // === 3 PANELS (LOCAL / EN LIGNE / ORDINATEUR) ===
  const PANEL_W = 302;
  const PANEL_GAP = 14;
  const PANEL_PAD = 14;
  const P_X0 = 32;
  const P_X1 = P_X0 + PANEL_W + PANEL_GAP;
  const P_X2 = P_X1 + PANEL_W + PANEL_GAP;
  const IN_W = PANEL_W - 2 * PANEL_PAD;

  // — LOCAL panel (panel-local bg) : 1J VS 2J field + status + Lancer CTA
  panelBg(P_X0, panelsY, PANEL_W, panelsH, V2.panelL);
  panelLabel(P_X0 + PANEL_PAD, panelsY + PANEL_PAD, IN_W, 'LOCAL');
  field(P_X0 + PANEL_PAD, panelsY + PANEL_PAD + 42, IN_W, 50, '1J VS 2J',
    { kind: 'pickMode', mode: 'pvp' },
    { sub: 'même écran, chacun son tour' });
  // Status display (read-only) : config de partie actuelle
  const statusY = panelsY + PANEL_PAD + 102;
  ctx.fillStyle = V2.card;
  roundRect(ctx, P_X0 + PANEL_PAD, statusY, IN_W, 64, R_MD); ctx.fill();
  ctx.lineWidth = 1; ctx.strokeStyle = V2.border;
  roundRect(ctx, P_X0 + PANEL_PAD, statusY, IN_W, 64, R_MD); ctx.stroke();
  ctx.fillStyle = V2.fldInk; ctx.font = `bold 11px ${F_V2}`;
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText('CONFIGURATION PARTIE', P_X0 + PANEL_PAD + IN_W / 2, statusY + 18);
  ctx.font = `13px ${F_V2}`;
  ctx.fillText(`${ecoLabel} × ${cbtLabel}`, P_X0 + PANEL_PAD + IN_W / 2, statusY + 42);
  // Primary CTA (PvP local)
  cta(P_X0 + PANEL_PAD, panelsY + panelsH - 60, IN_W, 52, 'Lancer une partie',
    { kind: 'pickMode', mode: 'pvp' }, V2.green,
    { sub: 'PvP 1J VS 2J local' });

  // — EN LIGNE panel (panel-online bg) : status + 2 CTAs (recherche + ami)
  panelBg(P_X1, panelsY, PANEL_W, panelsH, V2.panelO);
  panelLabel(P_X1 + PANEL_PAD, panelsY + PANEL_PAD, IN_W, 'EN LIGNE');
  const statusY2 = panelsY + PANEL_PAD + 42;
  ctx.fillStyle = V2.card;
  roundRect(ctx, P_X1 + PANEL_PAD, statusY2, IN_W, 64, R_MD); ctx.fill();
  ctx.lineWidth = 1; ctx.strokeStyle = V2.border;
  roundRect(ctx, P_X1 + PANEL_PAD, statusY2, IN_W, 64, R_MD); ctx.stroke();
  ctx.fillStyle = V2.fldInk; ctx.font = `bold 11px ${F_V2}`;
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText('CONFIGURATION PARTIE', P_X1 + PANEL_PAD + IN_W / 2, statusY2 + 18);
  ctx.font = `13px ${F_V2}`;
  ctx.fillText(`${ecoLabel} × ${cbtLabel}`, P_X1 + PANEL_PAD + IN_W / 2, statusY2 + 42);
  // 2 CTAs en cta-row (verte + rose)
  const ctaPriW = Math.round((IN_W - 10) * 0.62);
  const ctaFriW = IN_W - 10 - ctaPriW;
  cta(P_X1 + PANEL_PAD, panelsY + panelsH - 60, ctaPriW, 52,
    'Lancer une recherche', { kind: 'startSearch' }, V2.green);
  friendBtn(P_X1 + PANEL_PAD + ctaPriW + 10, panelsY + panelsH - 60, ctaFriW, 52,
    'Jouer avec un ami', { kind: 'createPrivateMatch' });

  // — ORDINATEUR panel (panel-cpu bg) : MODE DE JEU + 3 difficulty chips + SPECTATEUR + CTA
  panelBg(P_X2, panelsY, PANEL_W, panelsH, V2.panelC);
  panelLabel(P_X2 + PANEL_PAD, panelsY + PANEL_PAD, IN_W, 'ORDINATEUR');
  // MODE DE JEU : field déclenche `toggleVariant` (même état que la bar globale du haut).
  field(P_X2 + PANEL_PAD, panelsY + PANEL_PAD + 42, IN_W, 50, 'MODE DE JEU',
    { kind: 'toggleVariant' },
    { sub: `${ecoLabel} × ${cbtLabel}` });
  const chipW = (IN_W - 14) / 3;
  const chipH = 38;
  const chipY = panelsY + PANEL_PAD + 102;  // shift +60 to make room for MODE DE JEU above
  const chipNames = ['Débutant', 'Intermédiaire', 'Avancé'];
  for (let i = 0; i < 3; i++) {
    const lvl = i + 1;
    const cxx = P_X2 + PANEL_PAD + i * (chipW + 7);
    const sel = !!(state.menu && state.menu.difficulty === lvl);
    state.ui.buttons.push({ x: cxx, y: chipY, w: chipW, h: chipH,
      action: { kind: 'pickDifficulty', level: lvl }, enabled: true });
    ctx.fillStyle = sel ? V2.purple : V2.card;
    roundRect(ctx, cxx, chipY, chipW, chipH, R_SM); ctx.fill();
    ctx.lineWidth = sel ? 2 : 1.5;
    ctx.strokeStyle = sel ? V2.purpleD : 'rgba(43,36,64,0.18)';
    roundRect(ctx, cxx, chipY, chipW, chipH, R_SM); ctx.stroke();
    ctx.fillStyle = sel ? '#FFFFFF' : V2.ink;
    ctx.font = `bold 11px ${F_V2}`;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(chipNames[i].toUpperCase(), cxx + chipW / 2, chipY + chipH / 2);
  }
  field(P_X2 + PANEL_PAD, panelsY + PANEL_PAD + 152, IN_W, 50, 'SPECTATEUR',  // shift +60
    { kind: 'pickMode', mode: 'spectator' },
    { enabled: diffSelected,
      sub: diffSelected ? 'les 2 camps IA — observez' : '↑ choisissez une difficulté' });
  cta(P_X2 + PANEL_PAD, panelsY + panelsH - 60, IN_W, 52, 'VS ORDINATEUR',
    { kind: 'pickMode', mode: 'pvai' }, V2.green,
    { enabled: diffSelected,
      sub: diffSelected ? "l'IA joue Joueur 2" : '↑ choisissez une difficulté' });

  // === Boutons DECKS + REPLAYS (recovery 29/07 [23:40]) ===
  // Sous les 3 panels (LOCAL / EN LIGNE / ORDINATEUR). 2 boutons côte à côte centrés :
  // largeur 240 + gap 20 = 500 px → startX = (1000-500)/2 = 250.
  // Vertical : y = panelsY + panelsH + 24 (gap 24 sous les panels, lequel finit à
  // VS ORDINATEUR bottom = panelsY + panelsH - 60 + 52 = panelsY + panelsH - 8).
  // hit-test auto via bouton() → push state.ui.buttons (main.js hit-test).
  const drY = panelsY + panelsH + 24;
  const drW = 240, drGap = 20;
  const drTotalW = drW * 2 + drGap;
  const drX0 = (CANVAS_W - drTotalW) / 2;
  bouton(state, ctx, drX0, drY, drW, 40, '🗂️  Decks',
    { kind: 'ouvrirDecks' });
  bouton(state, ctx, drX0 + drW + drGap, drY, drW, 40, '🎬  Replays',
    { kind: 'ouvrirReplays' });

  // === Bandeau compte (top-right corner — peut overlap le tagline « Choisis
  //     ton mode », connu : suivre §8.1 follow-up UX) ===
  dessineBandeauCompte(ctx, state);
}

// --- Écrans de matchmaking PvP en ligne (cycle W1, spec-pvp-online §9.2) ---

function dessineMatchmaking(ctx, state) {
  const mm = state.matchmaking || {};
  const cx = CANVAS_W / 2, cy = CANVAS_H / 2;

  // Fond Brume.
  ctx.fillStyle = C_BRUME;
  ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);

  // [23:55] Bannière d'erreur matchmaking — affiche state.matchmaking.error
  // (set par main.js : « Connectez-vous d'abord » ou « Service indisponible »).
  // Position : y=180→228 (SOUS le wordmark baseline y=150 cap-h≈28 → bottom≈155).
  // Fix collision bannière↔wordmark identifiée par code-reviewer RECHECK.
  // Texte multi-lignes via wrapText (cap 3 lignes pour erreurs futures plus longues).
  if (mm.error) {
    const bx = 200, by = 180, bw = 600, bh = 48;
    carte(ctx, bx, by, bw, bh, 10, '#FFFFFF', { shadow: true });
    ctx.strokeStyle = C_TERRACOTTA;
    ctx.lineWidth = 2.5;
    roundRect(ctx, bx, by, bw, bh, 10); ctx.stroke();
    ctx.fillStyle = C_TERRACOTTA;
    ctx.font = `600 14px ${F_TEXTE}`;
    ctx.textAlign = 'center'; ctx.textBaseline = 'top';
    // ⚠ + message, wrap sur 2-3 lignes si trop long.
    ctx.fillText('⚠', bx + 30, by + 8);
    wrapText(ctx, mm.error, bx + 50, by + 10, bw - 70, 16, 2);
  }

  // Wordmark.
  ctx.fillStyle = C_ENCRE; ctx.font = `36px ${F_DISPLAY}`;
  ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic';
  ctx.fillText('♞ ROYCHEC', cx, 86);

  const wB = 320, hB = 52;

  if (mm.mode === 'lobby') {
    // LOBBY EN LIGNE — 100 % local, aucun appel réseau (spec-pvp-online §9.2).
    // Trois choix clairs : recherche publique, partie entre amis, rejoindre par code.
    const acc = state.account || {};
    ctx.fillStyle = C_ENCRE; ctx.font = `18px ${F_DISPLAY}`;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText('JOUER EN LIGNE', cx, 180);

    // Sous-titre : pseudo + trophées du joueur connecté.
    if (acc.status === 'connected') {
      ctx.fillStyle = C_ENCRE_DOUX; ctx.font = `13px ${F_TEXTE}`;
      ctx.fillText(`♟ ${acc.pseudo || ''}  ·  🏆 ${acc.trophies || 0} trophées`, cx, 208);
    }

    // 3 gros boutons distincts.
    bouton(state, ctx, cx - wB / 2, 244, wB, 58, '🔍 Lancer une recherche',
      { kind: 'startSearch' },
      { color: C_AMBRE, textColor: '#2B1D06', sub: 'trouver un adversaire au hasard' });

    bouton(state, ctx, cx - wB / 2, 314, wB, 58, '👥 Jouer avec un ami',
      { kind: 'createPrivateMatch' },
      { color: C_SAUGE, textColor: C_ENCRE, sub: 'créer une partie privée' });

    bouton(state, ctx, cx - wB / 2, 384, wB, 58, '🔑 Rejoindre par code',
      { kind: 'showJoinCode' },
      { color: C_CARTE, textColor: C_ENCRE, sub: 'entrer un code d\'invitation' });

    // Retour au menu.
    bouton(state, ctx, cx - wB / 2, 460, wB, hB, '← Retour',
      { kind: 'quitterLobby' },
      { color: C_CARTE, textColor: C_ENCRE });

    if (mm.error) {
      ctx.fillStyle = C_TERRACOTTA; ctx.font = `13px ${F_TEXTE}`;
      ctx.fillText(mm.error, cx, 530);
    }

  } else if (mm.mode === 'cadence') {
    // Écran CADENCE (spec §6) — 100 % local, s'intercale entre le lobby et le réseau.
    // Le titre rappelle l'action d'origine ; deux joueurs ne s'apparient que sur la
    // même cadence (file publique) / le créateur impose la sienne (partie privée).
    ctx.fillStyle = C_ENCRE; ctx.font = `18px ${F_DISPLAY}`;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText('CADENCE DE JEU', cx, 180);
    ctx.fillStyle = C_ENCRE_DOUX; ctx.font = `13px ${F_TEXTE}`;
    ctx.fillText(mm.pendingAction === 'private'
      ? 'Temps de réflexion de la partie privée (ton ami en hérite)'
      : 'Temps de réflexion — tu ne rencontres que des joueurs de la même cadence', cx, 208);

    // Grille 2×2 de cadences (sans incrément — spec §6.1 v3.1).
    const gw = 155, gh = 58, gap = 10;
    PVW_CADENCES.forEach((c, i) => {
      const col = i % 2, row = Math.floor(i / 2);
      bouton(state, ctx,
        cx - gw - gap / 2 + col * (gw + gap), 244 + row * (gh + gap + 4), gw, gh,
        `${c.emoji} ${c.label}`,
        { kind: 'pickCadence', cadence: c.s },
        { color: c.s === 300 ? C_AMBRE : C_CARTE, textColor: c.s === 300 ? '#2B1D06' : C_ENCRE, sub: c.sub });
    });

    // Variante (GDD §7.2 v3.1) — partie PRIVÉE uniquement : le créateur impose,
    // l'ami en hérite. Chips identiques au menu local, sélection partagée via
    // state.menu (pickEconomie/pickCombat autorisés ici par peutChoisirVariante).
    // La file publique reste Standard × Standard : aucun chip côté 'search'.
    let retourY = 432;
    if (mm.pendingAction === 'private') {
      const varEco = (state.menu && state.menu.economie) || 'standard';
      const varCbt = (state.menu && state.menu.combat) || 'standard';
      ctx.fillStyle = C_ENCRE_DOUX; ctx.font = `10px ${F_TEXTE}`;
      ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic';
      ctx.fillText('VARIANTE  —  ton ami hérite de ton choix', cx, 408);
      // Rangée ÉCONOMIE (3 chips 92×26) puis COMBAT (2 chips 142×26), style menu.
      const rows = [
        { list: ECONOMIES, w: 92, kind: 'pickEconomie', sel: varEco, y: 416 },
        { list: COMBATS,   w: 142, kind: 'pickCombat',   sel: varCbt, y: 450 },
      ];
      for (const row of rows) {
        const total = row.list.length * row.w + (row.list.length - 1) * 8;
        row.list.forEach((it, i) => {
          const x = cx - total / 2 + i * (row.w + 8);
          const sel = row.sel === it.id;
          state.ui.buttons.push({
            x, y: row.y, w: row.w, h: 26,
            action: { kind: row.kind, value: it.id }, enabled: true,
          });
          const selColor = row.kind === 'pickCombat' && it.id === 'elimX2' ? C_TERRACOTTA
            : (row.kind === 'pickCombat' ? C_SAUGE : C_AMBRE);
          ctx.fillStyle = ombreBouton(sel ? selColor : C_CARTE);
          roundRect(ctx, x, row.y + 3, row.w, 26, 8); ctx.fill();
          ctx.fillStyle = sel ? selColor : C_CARTE;
          roundRect(ctx, x, row.y, row.w, 26, 8); ctx.fill();
          ctx.lineWidth = sel ? 3 : 1.5; ctx.strokeStyle = sel ? C_ENCRE : C_CARTE_BORD;
          roundRect(ctx, x, row.y, row.w, 26, 8); ctx.stroke();
          ctx.fillStyle = sel && row.kind === 'pickCombat' ? '#FFFFFF' : (sel ? '#2B1D06' : C_ENCRE);
          ctx.font = `11px ${F_DISPLAY}`;
          ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
          ctx.fillText(it.label.toUpperCase(), x + row.w / 2, row.y + 13);
        });
      }
      retourY = 500;
    }

    // Retour au lobby (aucun réseau engagé à ce stade).
    bouton(state, ctx, cx - wB / 2, retourY, wB, hB, '← Retour',
      { kind: 'cancelMatchmaking' },
      { color: C_CARTE, textColor: C_ENCRE, sub: 'revenir au lobby' });

  } else if (mm.mode === 'search') {
    // Écran RECHERCHE (spec §9.2).
    const elapsed = Math.floor((Date.now() - (mm.searchStart || Date.now())) / 1000);
    const band = mm.band || 100;
    const bandLabel = band >= 99999 ? 'tous niveaux' : `±${band}`;

    ctx.fillStyle = C_ENCRE; ctx.font = `16px ${F_DISPLAY}`;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText('RECHERCHE D\'UN ADVERSAIRE…', cx, 194);

    // Spinner simple (texte animé).
    const dots = ['.', '..', '...'][Math.floor(Date.now() / 500) % 3];
    ctx.fillStyle = C_ENCRE_DOUX; ctx.font = `28px ${F_TEXTE}`;
    ctx.fillText(dots, cx, 230);

    // Infos (la cadence choisie borne la file : rappel visible pendant l'attente).
    ctx.fillStyle = C_ENCRE_DOUX; ctx.font = `13px ${F_TEXTE}`;
    ctx.fillText(`Temps écoulé : ${elapsed}s  ·  Niveau : ${bandLabel}  ·  ⏱ ${cadenceLabel(mm.cadence || 300)}`, cx, 270);

    // Bouton Annuler : ramène AU LOBBY (retire de la file publique via cancelWait).
    bouton(state, ctx, cx - wB / 2, 320, wB, hB, '✕ Annuler',
      { kind: 'cancelMatchmaking' },
      { color: C_CARTE, textColor: C_ENCRE, sub: 'revenir au lobby' });

    if (mm.error) {
      ctx.fillStyle = C_TERRACOTTA; ctx.font = `13px ${F_TEXTE}`;
      ctx.fillText(mm.error, cx, 400);
    }

  } else if (mm.mode === 'private_create') {
    // Écran CRÉATION partie privée.
    ctx.fillStyle = C_ENCRE; ctx.font = `16px ${F_DISPLAY}`;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText('PARTIE PRIVÉE CRÉÉE', cx, 194);

    if (mm.privateCode) {
      // Code en gros.
      ctx.fillStyle = C_AMBRE; ctx.font = `42px ${F_DISPLAY}`;
      ctx.fillText(mm.privateCode, cx, 250);
      ctx.fillStyle = C_ENCRE_DOUX; ctx.font = `13px ${F_TEXTE}`;
      ctx.fillText('Partage ce code avec ton adversaire', cx, 284);
      const varSuffix = mm.variant && mm.variant !== 'pvp_standard'
        ? `  ·  ⚔ ${variantLabel(mm.variant)}` : '';
      ctx.fillText(`Cadence : ⏱ ${cadenceLabel(mm.cadence || 300)}${varSuffix}  ·  En attente…`, cx, 308);
    } else {
      ctx.fillStyle = C_ENCRE_DOUX; ctx.font = `15px ${F_TEXTE}`;
      ctx.fillText('Création en cours…', cx, 240);
    }

    bouton(state, ctx, cx - wB / 2, 354, wB, hB, '✕ Annuler',
      { kind: 'cancelMatchmaking' },
      { color: C_CARTE, textColor: C_ENCRE });

    if (mm.error) {
      ctx.fillStyle = C_TERRACOTTA; ctx.font = `13px ${F_TEXTE}`;
      ctx.fillText(mm.error, cx, 430);
    }

  } else if (mm.mode === 'private_join') {
    // Écran REJOINDRE partie privée.
    ctx.fillStyle = C_ENCRE; ctx.font = `16px ${F_DISPLAY}`;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText('REJOINDRE UNE PARTIE', cx, 194);

    ctx.fillStyle = C_ENCRE_DOUX; ctx.font = `14px ${F_TEXTE}`;
    ctx.fillText('Entre le code à 6 caractères :', cx, 230);

    // Bouton qui déclenche un prompt (simplifié — pas de DOM input en v1).
    bouton(state, ctx, cx - 120, 264, 240, 46, 'Entrer le code',
      { kind: 'joinByCode', code: '' },
      { color: C_AMBRE, textColor: '#2B1D06', sub: 'cliquer pour saisir' });

    // Note : le prompt est déclenché par un listener spécial dans main.js.
    // On override le code vide → au clic, un prompt s'ouvre, puis on rappelle
    // actionBouton avec le code saisi. Géré par le handler mousedown.

    bouton(state, ctx, cx - wB / 2, 330, wB, hB, '← Retour',
      { kind: 'cancelMatchmaking' },
      { color: C_CARTE, textColor: C_ENCRE, sub: 'revenir au lobby' });

    if (mm.error) {
      ctx.fillStyle = C_TERRACOTTA; ctx.font = `13px ${F_TEXTE}`;
      ctx.fillText(mm.error, cx, 390);
    }

  } else if (mm.mode === 'matched') {
    // Écran MATCH TROUVÉ (spec §9.2).
    ctx.fillStyle = C_SAUGE; ctx.font = `22px ${F_DISPLAY}`;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText('✓ ADVERSIRE TROUVÉ !', cx, 194);

    // Infos adversaire.
    ctx.fillStyle = C_ENCRE; ctx.font = `18px ${F_DISPLAY}`;
    ctx.fillText(`♟ ${(mm.oppPseudo || 'Adversaire').toUpperCase()}`, cx, 244);
    ctx.fillStyle = C_AMBRE_FONCE; ctx.font = `15px ${F_DISPLAY}`;
    ctx.fillText(`🏆 ${mm.oppTrophies || 0} trophées`, cx, 274);

    // Variante héritée (partie privée non-standard) : le rejoignant découvre ici
    // la variante imposée par le créateur (GDD §7.2 v3.1).
    if (mm.variant && mm.variant !== 'pvp_standard') {
      ctx.fillStyle = C_TERRACOTTA; ctx.font = `13px ${F_TEXTE}`;
      ctx.fillText(`⚔ Variante : ${variantLabel(mm.variant)}`, cx, 296);
    }

    // Compte à rebours visuel.
    ctx.fillStyle = C_ENCRE_DOUX; ctx.font = `14px ${F_TEXTE}`;
    ctx.fillText('Connexion en cours…', cx, 318);
  }

  // Bandeau compte (toujours visible).
  dessineBandeauCompte(ctx, state);
}

// Écran REPLAYS dédié (phase 'replays') — plein écran, même modèle que le lobby
// en ligne. Liste jusqu'à 20 parties (tout le stock localStorage) sur 2 colonnes,
// clic = lancement du replay, « ← Retour » (ou Échap) = menu d'accueil.
function dessineReplays(ctx, state) {
  const cx = CANVAS_W / 2;

  // Fond Brume + wordmark (identique à dessineMatchmaking).
  ctx.fillStyle = C_BRUME;
  ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);
  ctx.fillStyle = C_ENCRE; ctx.font = `36px ${F_DISPLAY}`;
  ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic';
  ctx.fillText('♞ ROYCHEC', cx, 86);

  ctx.fillStyle = C_ENCRE; ctx.font = `18px ${F_DISPLAY}`;
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText('🎬 REPLAYS', cx, 160);
  ctx.fillStyle = C_ENCRE_DOUX; ctx.font = `13px ${F_TEXTE}`;
  ctx.fillText('Revoir tes dernières parties — les 20 plus récentes sont conservées', cx, 188);

  const replays = state._replayList || [];
  if (!replays.length) {
    ctx.fillStyle = C_ENCRE_DOUX; ctx.font = `15px ${F_TEXTE}`;
    ctx.fillText('Aucun replay pour l\'instant — joue une partie !', cx, 300);
  }

  // 2 colonnes de 10 lignes max (20 entrées ≤ CANVAS_H).
  const rW = 430, rH = 36, rGap = 8, parCol = 10;
  const colX = [cx - rW - 12, cx + 12];
  for (let i = 0; i < replays.length && i < 20; i++) {
    const rp = replays[i];
    const col = Math.floor(i / parCol);
    const x = colX[col];
    const ry = 222 + (i % parCol) * (rH + rGap);
    const d = new Date(rp.startTime);
    const dateStr = `${d.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit' })} ${d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}`;
    const modeStr = rp.mode === 'spectator' ? 'Spect.' : rp.mode === 'pvai' ? 'PvAI' : rp.mode === 'pvw' ? 'En ligne' : 'PvP';
    const diffStr = rp.difficulty ? ` niv.${rp.difficulty}` : '';
    const winnerStr = rp.winner !== null ? `  ·  🏆 ${NOM_JOUEUR[rp.winner]}` : '';
    const label = `${modeStr}${diffStr}  ·  ${rp.totalActions} act.  ·  ${dateStr}${winnerStr}`;
    state.ui.buttons.push({
      x, y: ry, w: rW, h: rH,
      action: { kind: 'startReplay', key: rp.key }, enabled: true,
    });
    ctx.fillStyle = ombreBouton(C_CARTE);
    roundRect(ctx, x, ry + 3, rW, rH, 8); ctx.fill();
    ctx.fillStyle = C_CARTE;
    roundRect(ctx, x, ry, rW, rH, 8); ctx.fill();
    ctx.lineWidth = 1.5; ctx.strokeStyle = C_CARTE_BORD;
    roundRect(ctx, x, ry, rW, rH, 8); ctx.stroke();
    ctx.fillStyle = C_ENCRE; ctx.font = `12px ${F_TEXTE}`;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(label, x + rW / 2, ry + rH / 2);
  }

  // Retour au menu (sous les 2 colonnes de 10 → 222 + 10×44 = 662).
  const wB = 320, hB = 52;
  bouton(state, ctx, cx - wB / 2, 700, wB, hB, '← Retour',
    { kind: 'fermerReplays' },
    { color: C_CARTE, textColor: C_ENCRE, sub: 'revenir au menu (Échap)' });

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
// Layout : 5 tabs centrés en haut, 3 lignes × 2 cards (P/T, C/F, Q/R); chaque
// card = piece_box blanc à gauche (lettre pièce GROS, style marker via Archivo
// Black) + 3 pills empilés D/A/S à droite, couleurs issues de COULEUR_CAT (DRY
// avec le feu des game pieces). Contenu pill = UPGRADES[id].nom du slot du deck
// actif en CAPS, ou "—" si slot vide.
const DECK_TAB_W = 50;
const DECK_TAB_H = 50;
const DECK_TAB_GAP = 14;
const DECK_TAB_COUNT = 5;
const DECK_TABS_TOTAL = DECK_TAB_COUNT * DECK_TAB_W + (DECK_TAB_COUNT - 1) * DECK_TAB_GAP;
const DECK_TABS_X0 = (CANVAS_W - DECK_TABS_TOTAL) / 2;            // 347 sur CANVAS_W=1000
const DECK_TABS_Y = 86;

const DECK_CATS = ['D', 'A', 'S'];
const DECK_ROWS = [['P', 'T'], ['C', 'F'], ['Q', 'R']];
const DECK_X_MARGIN = 60;
const DECK_CARD_GAP_X = 20;
const DECK_CARD_W = (CANVAS_W - 2 * DECK_X_MARGIN - DECK_CARD_GAP_X) / 2;
const DECK_CARD_H = 100;
const DECK_ROW_Y = [180, 300, 420];
const DECK_PIECE_BOX_W = 120;
const DECK_PIECE_INNER_GAP = 16;
const DECK_PILL_W = DECK_CARD_W - DECK_PIECE_BOX_W - DECK_PIECE_INNER_GAP;
const DECK_PILL_H = 26;
const DECK_PILL_INNER_GAP = 4;
const DECK_LETTER_SIZE = 64;
const DECK_RET_W = 220, DECK_RET_H = 44;
const DECK_RET_X = (CANVAS_W - DECK_RET_W) / 2;
const DECK_RET_Y = 720;

function dessineDecks(ctx, state) {
  const root = state.decksRoot || sanitizeRoot(loadDecks());
  state.decksRoot = root;
  const ids = Object.keys(root.decks);
  const activeDeck = root.decks[root.active];

  for (let i = 0; i < DECK_TAB_COUNT; i++) {
    const tabX = DECK_TABS_X0 + i * (DECK_TAB_W + DECK_TAB_GAP);
    const hasDeck = i < ids.length;
    const isActive = hasDeck && ids[i] === root.active;
    ctx.fillStyle = ombreBouton('#FFFFFF');
    roundRect(ctx, tabX, DECK_TABS_Y + 3, DECK_TAB_W, DECK_TAB_H, 9); ctx.fill();
    ctx.fillStyle = '#FFFFFF';
    roundRect(ctx, tabX, DECK_TABS_Y, DECK_TAB_W, DECK_TAB_H, 9); ctx.fill();
    ctx.strokeStyle = isActive ? COULEUR_CAT.D : (hasDeck ? C_ENCRE : C_ENCRE_PALE);
    ctx.lineWidth = isActive ? 3 : 2;
    roundRect(ctx, tabX, DECK_TABS_Y, DECK_TAB_W, DECK_TAB_H, 9); ctx.stroke();
    ctx.fillStyle = isActive ? COULEUR_CAT.D : C_ENCRE;
    ctx.font = `24px ${F_DISPLAY}`;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(String(i + 1), tabX + DECK_TAB_W / 2, DECK_TABS_Y + DECK_TAB_H / 2);
    state.ui.buttons.push({
      x: tabX, y: DECK_TABS_Y, w: DECK_TAB_W, h: DECK_TAB_H,
      action: { kind: 'switchDeck', value: i }, enabled: true,
    });
  }

  for (let rowIdx = 0; rowIdx < DECK_ROWS.length; rowIdx++) {
    const [typeL, typeR] = DECK_ROWS[rowIdx];
    const cardY = DECK_ROW_Y[rowIdx];
    const cardXL = DECK_X_MARGIN;
    const cardXR = DECK_X_MARGIN + DECK_CARD_W + DECK_CARD_GAP_X;
    for (let col = 0; col < 2; col++) {
      const type = col === 0 ? typeL : typeR;
      const cardX = col === 0 ? cardXL : cardXR;
      const slots = (activeDeck && activeDeck.slots && activeDeck.slots[type]) || {};

      const pbX = cardX, pbY = cardY;
      ctx.fillStyle = ombreBouton('#FFFFFF');
      roundRect(ctx, pbX, pbY + 3, DECK_PIECE_BOX_W, DECK_CARD_H, 10); ctx.fill();
      ctx.fillStyle = '#FFFFFF';
      roundRect(ctx, pbX, pbY, DECK_PIECE_BOX_W, DECK_CARD_H, 10); ctx.fill();
      ctx.strokeStyle = C_ENCRE; ctx.lineWidth = 2;
      roundRect(ctx, pbX, pbY, DECK_PIECE_BOX_W, DECK_CARD_H, 10); ctx.stroke();
      ctx.fillStyle = C_ENCRE;
      ctx.font = `${DECK_LETTER_SIZE}px ${F_DISPLAY}`;
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(type, pbX + DECK_PIECE_BOX_W / 2, pbY + DECK_CARD_H / 2 + 3);

      const pillX = cardX + DECK_PIECE_BOX_W + DECK_PIECE_INNER_GAP;
      const pillTopPad = (DECK_CARD_H -
        (DECK_PILL_H * DECK_CATS.length + DECK_PILL_INNER_GAP * (DECK_CATS.length - 1))) / 2;
      for (let s = 0; s < DECK_CATS.length; s++) {
        const cat = DECK_CATS[s];
        const pillY = cardY + pillTopPad + s * (DECK_PILL_H + DECK_PILL_INNER_GAP);
        ctx.fillStyle = COULEUR_CAT[cat];
        roundRect(ctx, pillX, pillY, DECK_PILL_W, DECK_PILL_H, DECK_PILL_H / 2); ctx.fill();
        ctx.strokeStyle = C_ENCRE; ctx.lineWidth = 2;
        roundRect(ctx, pillX, pillY, DECK_PILL_W, DECK_PILL_H, DECK_PILL_H / 2); ctx.stroke();
        const upgId = slots[cat];
        const upg = upgId && UPGRADES[upgId];
        const label = upg ? upg.nom.toUpperCase() : '—';
        ctx.fillStyle = C_ENCRE;
        ctx.font = `600 13px ${F_DISPLAY}`;
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText(label, pillX + DECK_PILL_W / 2, pillY + DECK_PILL_H / 2 + 1);
        state.ui.buttons.push({
          x: pillX, y: pillY, w: DECK_PILL_W, h: DECK_PILL_H,
          action: { kind: 'editSlot', type, cat }, enabled: true,
        });
      }
    }
  }

  bouton(state, ctx, DECK_RET_X, DECK_RET_Y, DECK_RET_W, DECK_RET_H,
    'Retour au menu', { kind: 'fermerDecks' });
}

function dessineDeckPicker(ctx, state) {
  if (!state._deckEditor) return;
  const { type, cat } = state._deckEditor;
  if (!state.decksRoot) state.decksRoot = sanitizeRoot(loadDecks());
  const root = state.decksRoot;
  const activeDeck = root.decks[root.active];
  const currentSlot = activeDeck ? activeDeck.slots[type][cat] : null;

  // Overlay sombre transparent.
  ctx.save();
  ctx.fillStyle = 'rgba(26, 20, 15, 0.55)'; ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);
  ctx.restore();

  // Titre.
  ctx.fillStyle = C_BRUME; ctx.font = `22px ${F_DISPLAY}`;
  ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic';
  ctx.fillText(`${LETTRE[type]} — ${nomType(type).toUpperCase()} · ${DECK_CAT_LABEL[cat].toUpperCase()}`,
    CANVAS_W / 2, 80);
  ctx.fillStyle = C_CARTE; ctx.font = `12px ${F_TEXTE}`;
  ctx.fillText('Choisis une amélioration (ou vide le slot)', CANVAS_W / 2, 102);

  // Cartes éligibles : UPGRADES filtrées sur (piece, cat), triées par coût croissant.
  const eligible = Object.values(UPGRADES)
    .filter((u) => u.piece === type && u.cat === cat)
    .sort((a, b) => a.cout - b.cout);
  const cardW = 500, cardH = 100, cardGap = 12;
  const startX = (CANVAS_W - cardW) / 2;
  let startY = 130;
  for (let i = 0; i < eligible.length; i++) {
    const u = eligible[i];
    const cx = startX;
    const cy = startY + i * (cardH + cardGap);
    const isCurrent = u.id === currentSlot;
    carte(ctx, cx, cy, cardW, cardH, 10, isCurrent ? C_AMBRE_CLAIR : '#FFFFFF',
      { shadow: true });
    if (isCurrent) {
      ctx.lineWidth = 3; ctx.strokeStyle = C_AMBRE;
      roundRect(ctx, cx, cy, cardW, cardH, 10); ctx.stroke();
    }
    // Nom upgrade (bold).
    ctx.fillStyle = C_ENCRE; ctx.font = `bold 16px ${F_TEXTE}`;
    ctx.textAlign = 'left'; ctx.textBaseline = 'top';
    ctx.fillText(u.nom, cx + 16, cy + 10);
    // Coût ★ en haut à droite.
    ctx.fillStyle = C_AMBRE_FONCE; ctx.font = `600 14px ${F_DISPLAY}`;
    ctx.textAlign = 'right'; ctx.textBaseline = 'top';
    ctx.fillText(`★ ${u.cout}`, cx + cardW - 16, cy + 12);
    // Badge cd/once sous le coût.
    if (u.cooldown || u.once) {
      ctx.fillStyle = C_ENCRE_PALE; ctx.font = `600 10px ${F_TEXTE}`;
      ctx.fillText(u.once ? 'usage unique' : `cd ${u.cooldown}`, cx + cardW - 16, cy + 32);
    }
    // ✓ si carte courante.
    if (isCurrent) {
      ctx.fillStyle = C_AMBRE_FONCE; ctx.font = `bold 18px ${F_DISPLAY}`;
      ctx.textAlign = 'left'; ctx.textBaseline = 'top';
      ctx.fillText('✓ ACTUEL', cx + 16, cy + 32);
    }
    // Description multi-lignes — utilise wrapText existant (helper module-scope ligne 1405).
    // N.B. une longue desc peut déborder verticalement (cardH=100 dispose ~4 lignes max à
    // lineH=14) ; pas critique : si on veut borner à 3 lignes strictes avec « … », ajouter
    // un wrapDeckText dédié. Pour MVP, acceptons le débordement contrôlé.
    ctx.fillStyle = C_ENCRE_DOUX; ctx.font = `12px ${F_TEXTE}`;
    ctx.textAlign = 'left'; ctx.textBaseline = 'top';
    wrapText(ctx, u.desc, cx + 16, cy + cardH - 38, cardW - 32, 14);
    // Hit-test cliquable.
    state.ui.buttons.push({ x: cx, y: cy, w: cardW, h: cardH,
      action: { kind: 'pickUpgrade', id: u.id }, enabled: true });
  }

  // Bouton « Vider le slot » + « Retour » sous la dernière carte (dynamic y).
  const footerY = eligible.length > 0
    ? startY + eligible.length * (cardH + cardGap) + 12
    : startY + 40;
  bouton(state, ctx, startX, footerY, 240, 38, '🗑️  Vider le slot',
    { kind: 'pickUpgrade', id: null },
    { enabled: currentSlot !== null, color: C_CARTE });
  bouton(state, ctx, startX + cardW - 200, footerY, 200, 38, '← Retour',
    { kind: 'cancelPick' });
}

export function render(ctx, state, now) {
  computeGeometry(state);
  state.ui.buttons = []; // réinitialisé chaque frame pour le hit-test
  ctx.clearRect(0, 0, CANVAS_W, CANVAS_H);

  // SPEC §1.4 : menu d'accueil — occupe tout le canvas, on ne dessine rien d'autre.
  if (state.phase === 'menu') {
    dessineMenu(ctx, state);
    return;
  }

  // Matchmaking PvP en ligne (cycle W1) — plein écran.
  if (state.phase === 'matchmaking') {
    dessineMatchmaking(ctx, state);
    return;
  }

  // Écran REPLAYS dédié — plein écran (demande utilisateur 12/07).
  if (state.phase === 'replays') {
    dessineReplays(ctx, state);
    return;
  }
  // Deck editor (recovery 29/07 [23:30]) : phase 'decks' = écran principal,
  // phase 'deck-picker' = overlay pour choisir une upgrade pour un slot cliqué.
  if (state.phase === 'decks') { dessineDecks(ctx, state); return; }
  if (state.phase === 'deck-picker') {
    dessineDecks(ctx, state); // fond + grille derrière l'overlay
    dessineDeckPicker(ctx, state); // overlay
    return;
  }

  // Fond parchemin doux (remplace l'ancien fond "app sombre" — cohérent avec
  // la palette pastel déjà définie pour le plateau).
  ctx.fillStyle = C_BRUME; ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);

  // Bandeau de tour (DA §11.3.c) — pilule flat plus affirmée : ombre plate,
  // fond de camp ~55 %, contour Encre, onglet 8 px, chevron directionnel.
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
  const banniere = state.phase === 'ruee-target'
    ? 'Ruée : choisissez une cible'
    : (state.phase === 'rayon-target' ? 'Rayon sacré : choisissez une cible'
      : (state.phase === 'decret-target' ? 'Décret : choisissez un allié adjacent'
        : (state.phase === 'promotion' ? 'Promotion : choisissez une pièce'
          : (state.mode === 'tutorial' ? 'TUTORIEL'
            : (state.phase === 'gameover' ? 'Partie terminée'
              : ((state.ai && state.ai.thinking) ? 'L\'IA RÉFLÉCHIT…'
                : (state.mode === 'pvw' && state.pvw
                  ? (state.turn === state.pvw.side ? 'À toi de jouer'
                    : `Au tour de ${state.pvw.oppPseudo || 'l\'adversaire'}`)
                  : `Au tour de ${prefixe}${NOM_JOUEUR[state.turn]}`)))))));
  ctx.fillText(banniere.toUpperCase(), OX + 32, chY);

  // PvP en ligne : bannière de désync (hash discordant, §3.4) — détection W2, annulation W3.
  if (state.mode === 'pvw' && state.pvw && state.pvw.desync) {
    ctx.fillStyle = C_TERRACOTTA;
    roundRect(ctx, OX, OY + __BOARD_H + 6, __BOARD_W, 22, 8); ctx.fill();
    ctx.fillStyle = '#FFFFFF'; ctx.font = `12px ${F_DISPLAY}`;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText('⚠ DÉSYNCHRONISATION DÉTECTÉE (voir console)', OX + __BOARD_W / 2, OY + __BOARD_H + 17);
  }

  dessineEchiquier(ctx, state, now);
  dessinePieces(ctx, state, now);
  if (state.mode === 'tutorial') dessineTutorielCibles(ctx, state, now);
  dessinePopups(ctx, state, now);
  dessinePanneau(ctx, state, now);

  // PvP en ligne : bannière de reconnexion (adversaire déconnecté, fenêtre 30 s, §7.2).
  if (state.mode === 'pvw' && state.pvw && state.pvw.oppDisconnected && state.phase !== 'gameover') {
    dessineReconnexionPvw(ctx, state, now);
  }

  if (state.phase === 'promotion') dessinePromotion(ctx, state, now);
  if (state.phase === 'gameover' && state.mode !== 'tutorial') dessineGameOver(ctx, state, now);
  if (state.phase === 'replay') dessineReplayHUD(ctx, state);
  if (state.phase === 'tutorial-done') dessineTutorielFin(ctx, state);
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
function dessineTutorielCibles(ctx, state, now) {
  const hint = tutorielHint(state);
  if (!hint || !hint.cells) return;
  const pulse = 0.5 + 0.5 * Math.sin(now / 300);
  for (const cell of hint.cells) {
    // Vue identité en tutoriel (jamais pvw) ; passe par le helper par cohérence.
    const { x, y } = cellCenterVue(state, cell.r, cell.c);
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
    ctx.lineWidth = 1.5; ctx.strokeStyle = C_ENCRE; ctx.stroke();
    ctx.restore();
  }
}

// --- HUD du tutoriel (instructions dans le panneau latéral) ---
function dessineTutorielHUD(ctx, state, x, w, now) {
  const step = STEPS[state.tutorialStep];
  if (!step) return;

  // Titre — wordmark.
  ctx.fillStyle = C_ENCRE; ctx.font = `22px ${F_DISPLAY}`;
  ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
  ctx.fillText('♞ ROYCHEC', x, OY + 8);

  let y = OY + 40;

  // Badge étape + flash « BIEN JOUÉ ! » à l'arrivée sur l'étape.
  const badgeW = 110, badgeH = 28;
  ctx.fillStyle = '#8FB8E0';
  roundRect(ctx, x, y, badgeW, badgeH, 8); ctx.fill();
  ctx.lineWidth = 2; ctx.strokeStyle = C_ENCRE;
  roundRect(ctx, x, y, badgeW, badgeH, 8); ctx.stroke();
  ctx.fillStyle = C_ENCRE; ctx.font = `13px ${F_DISPLAY}`;
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText(`ÉTAPE ${state.tutorialStep + 1}/${TOTAL_STEPS}`, x + badgeW / 2, y + badgeH / 2);
  if (state._tutoBravoT && now - state._tutoBravoT < 1200) {
    ctx.save();
    ctx.globalAlpha = Math.min(1, (1200 - (now - state._tutoBravoT)) / 400);
    ctx.fillStyle = C_SAUGE;
    roundRect(ctx, x + badgeW + 10, y, 130, badgeH, 8); ctx.fill();
    ctx.lineWidth = 2; ctx.strokeStyle = C_ENCRE;
    roundRect(ctx, x + badgeW + 10, y, 130, badgeH, 8); ctx.stroke();
    ctx.fillStyle = C_ENCRE; ctx.font = `12px ${F_DISPLAY}`;
    ctx.fillText('✔ BIEN JOUÉ !', x + badgeW + 75, y + badgeH / 2);
    ctx.restore();
  }
  y += badgeH + 12;

  // Barre de progression.
  const barW = w - 4, barH = 6;
  const pct = (state.tutorialStep + 1) / TOTAL_STEPS;
  ctx.fillStyle = 'rgba(26,20,15,0.10)';
  roundRect(ctx, x, y, barW, barH, 3); ctx.fill();
  ctx.fillStyle = '#8FB8E0';
  roundRect(ctx, x, y, barW * pct, barH, 3); ctx.fill();
  y += barH + 18;

  // Titre de l'étape.
  ctx.fillStyle = C_ENCRE; ctx.font = `16px ${F_DISPLAY}`;
  ctx.textAlign = 'left'; ctx.textBaseline = 'top';
  ctx.fillText(step.title.toUpperCase(), x, y);
  y += 28;

  // Instruction principale.
  ctx.fillStyle = C_ENCRE_DOUX; ctx.font = `600 15px ${F_TEXTE}`;
  const lines = wrapTextLines(ctx, step.text, x, y, w - 8, 22);
  y += lines * 22 + 10;

  // Détail.
  if (step.detail) {
    ctx.fillStyle = C_ENCRE_PALE; ctx.font = `12px ${F_TEXTE}`;
    const dLines = wrapTextLines(ctx, step.detail, x, y, w - 8, 18);
    y += dLines * 18 + 16;
  }

  // Solde d'écus du joueur (le HUD normal est masqué pendant les instructions).
  carte(ctx, x, y, 150, 34, 8, '#FFFFFF');
  ctx.beginPath(); ctx.arc(x + 18, y + 17, 8, 0, Math.PI * 2);
  ctx.fillStyle = C_AMBRE; ctx.fill();
  ctx.lineWidth = 1.5; ctx.strokeStyle = C_ENCRE; ctx.stroke();
  ctx.fillStyle = C_ENCRE; ctx.font = `13px ${F_DISPLAY}`;
  ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
  ctx.fillText(`${state.ecus[0]} ÉCUS`, x + 34, y + 18);
  y += 46;

  // Bouton "Continuer" pour les étapes de lecture.
  if (step.continuer) {
    bouton(state, ctx, x + w - 140, y, 130, 36, 'Continuer',
      { kind: 'tutorialContinue' },
      { color: C_SAUGE, textColor: C_ENCRE });
    y += 46;
  }

  // Filet de sécurité : rejouer l'étape depuis zéro en cas d'impasse.
  bouton(state, ctx, x + w - 160, CANVAS_H - 88, 150, 32, '↻ Recommencer',
    { kind: 'tutorialRestart' },
    { color: C_CARTE, textColor: C_ENCRE });

  // Bouton Quitter le tutoriel (toujours visible).
  bouton(state, ctx, x + w - 160, CANVAS_H - 48, 150, 32, '◀  Menu',
    { kind: 'retourMenu' },
    { color: C_CARTE, textColor: C_ENCRE });
}

// Écran de fin du tutoriel.
function dessineTutorielFin(ctx, state) {
  const cx = OX + __BOARD_W / 2, cy = OY + __BOARD_H / 2;

  // Voile de fond.
  ctx.fillStyle = 'rgba(36,28,22,0.72)';
  ctx.fillRect(OX, OY, __BOARD_W, __BOARD_H);

  // Panneau centré.
  const pw = 380, ph = 220;
  const px = cx - pw / 2, py = cy - ph / 2;
  carte(ctx, px, py, pw, ph, 14, C_CARTE, { shadow: true, stroke: null });
  ctx.lineWidth = 3; ctx.strokeStyle = C_SAUGE;
  roundRect(ctx, px, py, pw, ph, 14); ctx.stroke();

  // Titre.
  ctx.font = `32px ${F_DISPLAY}`;
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.lineWidth = 1.5; ctx.lineJoin = 'round'; ctx.strokeStyle = C_ENCRE;
  ctx.strokeText('FÉLICITATIONS !', cx, py + 48);
  ctx.fillStyle = C_SAUGE_FONCE;
  ctx.fillText('FÉLICITATIONS !', cx, py + 48);

  // Message.
  ctx.fillStyle = C_ENCRE_DOUX; ctx.font = `15px ${F_TEXTE}`;
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText('Tu maîtrises les bases de Roychec.', cx, py + 90);
  ctx.fillText('Lance une vraie partie !', cx, py + 112);

  // Bouton Menu.
  bouton(state, ctx, cx - 100, py + ph - 62, 200, 48, 'Menu',
    { kind: 'restart' },
    { color: C_SAUGE, textColor: C_ENCRE });
}

// --- HUD du mode replay (contrôles de lecture) ---
function dessineReplayHUD(ctx, state) {
  const data = state.replayData;
  if (!data) return;
  const barY = OY + __BOARD_H + 4;
  const barH = 52;

  // Fond semi-transparent.
  ctx.fillStyle = 'rgba(26,26,26,0.82)';
  roundRect(ctx, OX, barY, __BOARD_W, barH, 8); ctx.fill();

  // Progression : "Action X / Y"
  const idx = Math.max(0, state.replayIndex);
  const total = data.events.length;
  ctx.fillStyle = '#FFFFFF'; ctx.font = `12px ${F_DISPLAY}`;
  ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
  const label = state.replayPlaying
    ? `▶ REPLAY — Action ${idx + 1} / ${total}`
    : `⏸ PAUSE — Action ${idx + 1} / ${total}`;
  if (idx >= total) {
    ctx.fillText('⏹ FIN DU REPLAY', OX + 12, barY + barH / 2 - 8);
  } else {
    ctx.fillText(label, OX + 12, barY + barH / 2 - 8);
  }

  // Barre de progression.
  const progW = __BOARD_W - 24, progH = 4;
  const progX = OX + 12, progY = barY + barH / 2 + 4;
  ctx.fillStyle = 'rgba(255,255,255,0.18)';
  roundRect(ctx, progX, progY, progW, progH, 2); ctx.fill();
  if (total > 0) {
    ctx.fillStyle = C_AMBRE;
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
      action: { kind: 'replaySpeed', speed: s.speed }, enabled: true });
    ctx.fillStyle = sel ? C_AMBRE : 'rgba(255,255,255,0.12)';
    roundRect(ctx, sx, barY + barH / 2 - bh / 2 - 1, bw, bh, 6); ctx.fill();
    ctx.fillStyle = sel ? '#2B1D06' : 'rgba(255,255,255,0.7)';
    ctx.font = `10px ${F_DISPLAY}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(s.label, sx + bw / 2, barY + barH / 2 - 1);
    sx += bw + 6;
  }

  // Play/Pause.
  const ppW = 36, ppH = 24, ppX = __BOARD_W -92;
  state.ui.buttons.push({ x: ppX, y: barY + barH / 2 - ppH / 2 - 1, w: ppW, h: ppH,
    action: { kind: 'replayPlayPause' }, enabled: idx < total });
  ctx.fillStyle = 'rgba(255,255,255,0.15)';
  roundRect(ctx, ppX, barY + barH / 2 - ppH / 2 - 1, ppW, ppH, 6); ctx.fill();
  ctx.fillStyle = '#FFFFFF'; ctx.font = `14px ${F_DISPLAY}`;
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText(state.replayPlaying ? '⏸' : '▶', ppX + ppW / 2, barY + barH / 2 - 1);

  // Quitter.
  const qW = 60, qH = 24, qX = __BOARD_W - 48;
  state.ui.buttons.push({ x: qX, y: barY + barH / 2 - qH / 2 - 1, w: qW, h: qH,
    action: { kind: 'replayQuit' }, enabled: true });
  ctx.fillStyle = C_TERRACOTTA;
  roundRect(ctx, qX, barY + barH / 2 - qH / 2 - 1, qW, qH, 6); ctx.fill();
  ctx.fillStyle = '#FFFFFF'; ctx.font = `10px ${F_DISPLAY}`;
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText('QUITTER', qX + qW / 2, barY + barH / 2 - 1);
}