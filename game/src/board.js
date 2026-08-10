// roychec — état de l'échiquier et fabrique de pièces.
// Phase A.5 v2 (2026-07-29) : dimension du plateau hot-seat paramétrable.
//   Source unique de vérité : `game/src/tailles.js` (zero-dep canonical).
//   - 'std' = 8 × 8 classique (MVP legacy, non-régression)
//   - 'l15' = 8 × 15 (15 colonnes, 8 pions par camp centrés sur colonnes paires)
//           Le moteur live est désormais size-aware : `board.length` pour les
//           rangées, `board[0].length` (alias `board.cols`) pour les colonnes.
//           `inB(board,r,c)` lit board.length et board[0].length — zéro littéral
//           `8` ou `7` hardcodé au niveau de l'invariant boundary.
//           Note : états du moteur qui bouclent sur 8 hardcodé (coupsLegaux/
//           evalBoard dans rules.js et ai.js) généraliseront en Phase A.5 v3.

import { SOLDE_DEPART } from './constants.js?v=110';
import { reglesEconomie, DEFAULT_VARIANT } from './variants.js?v=108';
// Note Phase A.5 v2 polish : `TAILLES` n'est PAS importé ici — les call sites
// qui en ont besoin (render.js pour le bouton TAILLE DE PLATEAU, plus tard
// online.js pour le lockstep header) importeront directement depuis './tailles.js'.
// Seul `DEFAULT_TAILLE` + `getBoardH/W` (helpers de résolution) sont utilisés
// ici par creerPlateau(taille).
import { DEFAULT_TAILLE, getBoardH, getBoardW } from './tailles.js?v=108';

let PROCHAIN_ID = 1;

// Une pièce = instance mutable. Les améliorations sont propres à l'instance (GDD §5.3).
export function creerPiece(type, owner, r, c) {
  return {
    id: PROCHAIN_ID++,
    type,            // 'P' 'N' 'B' 'R' 'Q' 'K'
    owner,           // 0 = Joueur 1 (bas), 1 = Joueur 2 (haut)
    r, c,            // position, tenue synchro avec le plateau
    upgrades: [],    // ids d'améliorations achetées
    shield: false,   // absorbe la prochaine capture (Forteresse, Bouclier, Monture, Couronne, Parade, Majesté)
    cooldowns: {},   // { ruee, Rayon, Tele, second, sacrifice, vet, epine, grand-saut } en tours du joueur
    epineZone: null, // { r, c, owner, turns } — case gelée par Épine
    debuffs: {},     // { sht, root, hypnoseAura } en tours restants
    doubleCoupUsed: false,  // Double coup (usage unique) consommé
    decretUsed: false,      // Décret (usage unique) consommé
    sacrificeArmed: false,  // Sacrifice armé : protège le roi à la prochaine capture
    rempartGranted: false,  // blindage temporaire reçu d'un Rempart (expire au prochain tour)
    folieUsed: false,       // Folie (fou D) : usage unique consommé après la prochaine capture
    feinteUsed: false,      // Feinte (dame D) : usage unique consommé après la prochaine capture
    shtUsed: false,         // S.H.T. (dame A) : usage unique consommé après utilisation
    aBouge: false,          // a déjà bougé (condition du roque, GDD §5.1.b) — posé par jouerCoup/Décret
  };
}

// Placement initial du plateau selon la taille.
//   - 'std' (8×8) : 32 pièces, layout échecs orthodoxe — BYTE-ÉQUIVALENT pré-Phase
//     A.5 v2 (non-régression). Vérifié par tests/ai-dimensions.test.mjs.
//   - 'l15' (8×15) : 32 pièces aussi (8 pions + 8 officiers par camp), réparties
//     sur les 15 colonnes via colonnes paires [0,2,4,6,8,10,12,14]. Colonnes
//     impaires [1,3,5,7,9,11,13] vides au début — pas de gonflement du solde/AI.
//   Note Phase A.5 v3 backlog : passer à 15-pawns (un par colonne) pour se
//   conformer à un chess-15 standard. Pour v2 on garde 8-pawns centrés pour
//   NE PAS modifier l'économie.
//
// Le board ATTACHE ses dimensions en tant que propriétés non-énumérables JS
// (`Object.defineProperty`) plutôt qu'en propriétés énumérables. Cela évite que
// les loops `for (const row of state.board) for (const p of row)` itèrent sur
// ces dimensions intentionnellement (puisque ce ne sont pas des rangées de
// cases). Pour lire les dims côté downstream : state.board.cols / state.board.rows.
export function creerPlateau(taille = DEFAULT_TAILLE) {
  const h = getBoardH(taille);
  const w = getBoardW(taille);
  const board = Array.from({ length: h }, () => Array(w).fill(null));
  Object.defineProperty(board, 'rows', { value: h, enumerable: false, writable: false });
  Object.defineProperty(board, 'cols', { value: w, enumerable: false, writable: false });
  // Phase A.5 v2 : board.cols / board.rows attachés en NON-ENUMERABLE pour ne
  // PAS polluer les loops `for (const row of state.board)` ni `Object.keys(board)`.
  // ATTENTION : un code de debug qui ferait `JSON.stringify(state.board)` ou
  // `Object.assign({}, state.board)` ne verrait PAS ces dims. Pour debug, lire
  // `state.board.cols` et `state.board.rows` directement. C'est le compromis
  // qui maintient `for (const row of board)` propre côté rules.js/main.js/render.js
  // sans qu'on ait à filtrer cols/rows à chaque itération.
  const dos = ['R', 'N', 'B', 'Q', 'K', 'B', 'N', 'R']; // T C F D R F C T

  if (taille === 'l15') {
    // 8×15 : colonnes paires [0,2,4,6,8,10,12,14]. Les colonnes impaires restent vides
    // au début du plateau. RNBQKBNR sur a,c,e,g,i,k,m,o. Pawns alignés dessous.
    const cols = [0, 2, 4, 6, 8, 10, 12, 14];
    for (let i = 0; i < 8; i++) {
      board[0][cols[i]] = creerPiece(dos[i], 1, 0, cols[i]);  // J2 back-rank
      board[1][cols[i]] = creerPiece('P',    1, 1, cols[i]);  // J2 pawn row
      board[6][cols[i]] = creerPiece('P',    0, 6, cols[i]);  // J1 pawn row
      board[7][cols[i]] = creerPiece(dos[i], 0, 7, cols[i]);  // J1 back-rank
    }
  } else {
    // 'std' : 8×8 classique — BYTE-ÉQUIVALENT pré-Phase A.5 v2.
    for (let c = 0; c < 8; c++) {
      board[0][c] = creerPiece(dos[c], 1, 0, c);
      board[1][c] = creerPiece('P',    1, 1, c);
      board[6][c] = creerPiece('P',    0, 6, c);
      board[7][c] = creerPiece(dos[c], 0, 7, c);
    }
  }
  return board;
}

export function creerEtat(options) {
  const mode = (options && options.mode) || 'pvp';
  const difficulty = (options && options.difficulty) || 1;
  // Phase A.5 v2 : taille param (DEFAULT_TAILLE omis = std legacy).
  const taille = (options && options.taille) || DEFAULT_TAILLE;
  const bonusMode = taille === 'bonus' || mode === 'hunt';
  const huntRngSeed = options && options.huntRngSeed != null
    ? (options.huntRngSeed >>> 0)
    : ((Date.now() ^ Math.floor(Math.random() * 0x100000000)) >>> 0);
  const ai = mode === 'pvai' ? { player: 1, difficulty, thinking: false }
           : mode === 'spectator' ? { difficulty, thinking: false } // player set dynamically
           : null;
  return {
    board: creerPlateau(taille),
    // taille attachée pour downstream helpers (render.js CELL recompute, online.js
    // header lockstep, replay.js toAlgebraic dynamique) — ne fait PAS partie du hash
    // d'état côté lockstep (§5.4 : hash dérivé des positions, pas des dimensions).
    taille,
    bonusMode,               // Plateau bonus : cases de Chasse actives quel que soit le mode
    huntRngSeed,             // PRNG partagé par les clients PvP privés
    turn: 0,                 // joueur actif
    ecus: [SOLDE_DEPART, SOLDE_DEPART],
    winner: null,
    phase: 'play',           // 'menu' | 'play' | 'animating' | 'ruee-target' | 'rayon-target' | 'decret-target' | 'gameover'
    mode,                    // 'pvp' | 'pvai' (SPEC §1.2 ; default 'pvp' = non-régression)
    ai,                      // null (PvP) | { player, difficulty, thinking } (PvAI)

    selected: null,          // pièce sélectionnée
    legalMoves: [],          // [{ r, c, capture, tele? }]
    panelPiece: null,        // pièce dont le panneau d'amélioration est ouvert
    ruTargets: [],           // cibles d'un ciblage en cours (Ruée / Rayon / Décret)
    huntBonuses: null,       // cases bonus réservées à chaque camp en mode Chasse
    huntCollected: [0, 0],   // nombre de cases bonus récupérées par camp
    huntLastAward: null,     // dernière amélioration tirée par une case bonus

    replay: null,            // enregistrement de partie (replay.js)
    chain: null,             // enchaînement en attente : { piece, type: 'double-coup' | 'second-galop' }

    // Valeur de départage du matériel CAPTURÉ par chaque camp (GDD §8.3, fix W3) :
    // accumulée à chaque capture avec valeurDepartage(cible) — trace les bonus [S]
    // (Forteresse) des pièces déjà capturées (Vétéran est devenu actif le 31/07,
    // plus de bonus de valeur), insensible aux promotions.
    // Déterministe des deux côtés en ligne (chaque client applique tous les coups).
    capturesDep: [0, 0],

    // Variante locale (GDD §5.2.b + §7.2 v3) : objet de règles d'économie résolu
    // depuis options.variantId par main.js — voir reglesEconomie() / variants.js.
    // Pour les modes hors scope hot-seat local (PvAI, PvP en ligne, spectateur,
    // tutoriel), c'est TOUJOURS l'objet standard (DEFAULT_VARIANT) — le verrou
    // est posé dans variantesPourMode() côté main.js.
    variant: reglesEconomie((options && options.variantId) || DEFAULT_VARIANT),

    anim: null,              // { piece, from{x,y}, to{x,y}, t0, onDone }
    popups: [],              // { text, x, y, t0, color }
    flashes: [],             // { r, c, t0, color }
    buzz: 0,                 // horodatage d'un refus d'achat (tremblement)

    ui: { buttons: [] },     // rectangles cliquables (rempli au rendu)
  };
}

// Phase A.5 v2 : inB devient board-aware (signature change). La fonction est
// pure — elle lit SEULEMENT board.length et board[0].length. Pas d'effet de bord.
// CASCADE : 7 call sites à mettre à jour dans rules.js × 4 + main.js × 1.
//   - rules.js × 4 (cascade sed unanime : `inB(r, c)` -> `inB(board, r, c)`,
//     `inB(nr, nc)` -> `inB(board, nr, nc)` etc — board est en scope des 4 callers)
//   - main.js × 1 `inB(state.board, r, c)` (protection Sacrifice)
//   - caseAt intra-board.js ci-dessous (même module, ajusté pour la nouvelle sig.)
export function inB(board, r, c) {
  return r >= 0 && r < board.length && c >= 0 && c < board[0].length;
}

// Renvoie la pièce, null (case vide) ou undefined (hors plateau).
export function caseAt(board, r, c) {
  return inB(board, r, c) ? board[r][c] : undefined;
}
