// roychec — mode APPRENDRE : démonstrations + puzzles tactiques rejouables.
// Les scénarios préparent des plateaux, puis réutilisent le moteur réel de main.js.
// Aucun réseau, replay ou trophée n'est impliqué dans ce mode.
import { creerPiece } from './board.js?v=107';
import { reglesEconomie, DEFAULT_VARIANT } from './variants.js?v=107';

const STORAGE_KEY = 'roychec-learn-progress';

function plateauVide() {
  return Array.from({ length: 8 }, () => Array(8).fill(null));
}

function baseScenario(state, board, ecus = 0) {
  state.mode = 'learn';
  state.phase = state.learnKind === 'puzzle' ? 'puzzle-game' : 'learn-game';
  state.board = board;
  state.taille = 'std';
  state.turn = 0;
  state.ecus = [ecus, 0];
  state.variant = reglesEconomie(DEFAULT_VARIANT);
  state.capturesDep = [0, 0];
  state.selected = null;
  state.legalMoves = [];
  state.panelPiece = null;
  state.ruTargets = [];
  state.chain = null;
  state.anim = null;
  state.winner = null;
  state.ai = null;
  state.popups = [];
  state.flashes = [];
  state.buzz = 0;
  state.learnSuccess = false;
  state.learnMessage = '';
  state.puzzlePurchased = false;
  state.puzzleMoves = 0;
  // Les puzzles doivent toujours montrer la solution dans le catalogue, même si
  // le deck de partie courant a été personnalisé. Cela ne modifie jamais le deck
  // sauvegardé : null déclenche simplement le fallback catalogue de main.js.
  state.activeDeck = null;
  for (const row of board) {
    for (const piece of row) {
      if (piece) {
        piece.cooldowns = {};
        piece.debuffs = {};
      }
    }
  }
}

function rois(board, own = true) {
  board[7][4] = creerPiece('K', 0, 7, 4);
  board[0][4] = creerPiece('K', own ? 1 : 0, 0, 4);
}

function scenarioBouclier(state) {
  const b = plateauVide();
  const king = creerPiece('K', 0, 7, 5);
  const target = creerPiece('P', 1, 6, 6);
  target.upgrades.push('bouclier'); target.shield = true;
  b[7][5] = king; b[6][6] = target;
  baseScenario(state, b, 0);
}

function scenarioPasDeCote(state) {
  const b = plateauVide();
  const fou = creerPiece('B', 0, 4, 4);
  fou.upgrades.push('pas-de-cote');
  b[4][4] = fou; rois(b);
  baseScenario(state, b, 0);
}

function scenarioRuee(state) {
  const b = plateauVide();
  const cavalier = creerPiece('N', 0, 4, 4);
  cavalier.upgrades.push('ruee');
  b[4][4] = cavalier; b[2][3] = creerPiece('P', 1, 2, 3); rois(b);
  baseScenario(state, b, 9);
}

function scenarioRayon(state) {
  const b = plateauVide();
  const fou = creerPiece('B', 0, 4, 4);
  fou.upgrades.push('Rayon');
  b[4][4] = fou; b[2][2] = creerPiece('P', 1, 2, 2); rois(b);
  baseScenario(state, b, 10);
}

function scenarioVeteran(state) {
  const b = plateauVide();
  const pion = creerPiece('P', 0, 4, 4);
  pion.upgrades.push('vet');
  b[4][4] = pion; b[3][4] = creerPiece('P', 1, 3, 4); rois(b);
  baseScenario(state, b, 5);
}

function scenarioTeleportation(state) {
  const b = plateauVide();
  const dame = creerPiece('Q', 0, 4, 4);
  dame.upgrades.push('Tele');
  b[4][4] = dame;
  // Les alliés bloquent les déplacements ordinaires autour de la dame.
  for (const [r, c] of [[3, 3], [3, 4], [3, 5], [4, 3], [4, 5], [5, 3], [5, 4], [5, 5]]) {
    b[r][c] = creerPiece('P', 0, r, c);
  }
  rois(b); // les rois sont décoratifs et le roi J1 reste en dehors de la zone.
  b[7][4] = null;
  baseScenario(state, b, 12);
}

function scenarioHypnose(state) {
  const b = plateauVide();
  const fou = creerPiece('B', 0, 4, 4);
  fou.upgrades.push('hypnose');
  b[4][4] = fou;
  b[4][7] = creerPiece('N', 1, 4, 7);
  rois(b); baseScenario(state, b, 10);
}

function scenarioDecret(state) {
  const b = plateauVide();
  const roi = creerPiece('K', 0, 6, 4);
  roi.upgrades.push('decret');
  const tour = creerPiece('R', 0, 6, 5);
  b[6][4] = roi; b[6][5] = tour; b[0][4] = creerPiece('K', 1, 0, 4);
  baseScenario(state, b, 12);
}

// Lot 2 — déplacements spéciaux déjà implémentés dans rules.js.
function scenarioMarcheArriere(state) {
  const b = plateauVide();
  const pion = creerPiece('P', 0, 4, 4);
  pion.upgrades.push('marche-arriere');
  // Le pion est bloqué vers l'avant, mais peut reculer d'une case vide.
  b[4][4] = pion;
  b[3][4] = creerPiece('P', 0, 3, 4);
  rois(b); baseScenario(state, b, 4);
}

function scenarioPivot(state) {
  const b = plateauVide();
  const tour = creerPiece('R', 0, 4, 4);
  tour.upgrades.push('pivot');
  // La diagonale d3 est inaccessible à une tour classique.
  b[4][4] = tour;
  rois(b); baseScenario(state, b, 4);
}

function scenarioEnjambeur(state) {
  const b = plateauVide();
  const tour = creerPiece('R', 0, 4, 4);
  tour.upgrades.push('enjambeur');
  b[4][4] = tour;
  b[4][5] = creerPiece('P', 0, 4, 5);
  // La case derrière l'obstacle devient atteignable par le saut.
  rois(b); baseScenario(state, b, 6);
}

function scenarioReprise(state) {
  const b = plateauVide();
  const fou = creerPiece('B', 0, 4, 4);
  fou.upgrades.push('reprise');
  b[4][4] = fou;
  // La Folie permet au fou de frapper horizontalement comme une tour.
  b[4][6] = creerPiece('P', 1, 4, 6);
  rois(b); baseScenario(state, b, 6);
}

function scenarioFeinte(state) {
  const b = plateauVide();
  const dame = creerPiece('Q', 0, 4, 4);
  dame.upgrades.push('feinte');
  b[4][4] = dame;
  // La cible en saut de cavalier n'est accessible ni en ligne ni en diagonale.
  b[2][5] = creerPiece('P', 1, 2, 5);
  rois(b); baseScenario(state, b, 8);
}

function scenarioPasseRoyale(state) {
  const b = plateauVide();
  const roi = creerPiece('K', 0, 6, 4);
  roi.upgrades.push('passe-royale');
  b[6][4] = roi;
  // Deux cases en avant, sans capture : le saut dépasse le déplacement royal normal.
  rois(b); b[7][4] = null;
  baseScenario(state, b, 8);
}

// --- Puzzles tactiques : l'amélioration n'est pas équipée au départ ---
// Le budget est exactement égal au coût de la solution. Une mauvaise carte
// consomme donc la tentative et impose de recommencer, comme dans un vrai puzzle.
function scenarioPuzzleEnjambeur(state) {
  const b = plateauVide();
  const tour = creerPiece('R', 0, 4, 4);
  const obstacle = creerPiece('P', 0, 4, 5);
  const menace = creerPiece('B', 1, 4, 7);
  b[4][4] = tour; b[4][5] = obstacle; b[4][7] = menace;
  rois(b); baseScenario(state, b, 6);
}

function scenarioPuzzlePasDeCote(state) {
  const b = plateauVide();
  const fou = creerPiece('B', 0, 4, 4);
  const menace = creerPiece('Q', 1, 2, 3);
  b[4][4] = fou; b[2][3] = menace;
  rois(b); baseScenario(state, b, 6);
}

function scenarioPuzzleRuee(state) {
  const b = plateauVide();
  const cavalier = creerPiece('N', 0, 4, 4);
  const menace = creerPiece('Q', 1, 2, 3);
  b[4][4] = cavalier; b[2][3] = menace;
  rois(b); baseScenario(state, b, 9);
}

function scenarioPuzzleFeinte(state) {
  const b = plateauVide();
  const dame = creerPiece('Q', 0, 4, 4);
  const menace = creerPiece('R', 1, 2, 5);
  b[4][4] = dame; b[2][5] = menace;
  rois(b); baseScenario(state, b, 12);
}

export const LEARN_GAMES = [
  {
    id: 'bouclier', title: 'Bouclier de fantassin', upgrade: 'Bouclier',
    category: 'STAT', cost: 6, color: '#9BCB8C',
    text: 'Une pièce protégée peut survivre à une capture.',
    detail: 'Capture le pion protégé avec ton roi. Le pion reste en place et le bouclier se brise : tu viens de voir une attaque annulée.',
    objective: 'Capturer la pièce blindée',
    setup: scenarioBouclier,
    hint: () => ({ cells: [{ r: 7, c: 5 }, { r: 6, c: 6 }] }),
    check: (state) => state.board[6][6] && !state.board[6][6].shield
      && state.board[7][5]?.type === 'K',
  },
  {
    id: 'pas-de-cote', title: 'Pas de côté', upgrade: 'Pas de côté',
    category: 'DÉPLACEMENT', cost: 6, color: '#8FB8E0',
    text: 'Le fou gagne un saut en L en plus de sa diagonale.',
    detail: 'Sélectionne le fou puis joue le saut vers c3. Cette carte ouvre une case normalement inaccessible au fou.',
    objective: 'Jouer un déplacement en L',
    setup: scenarioPasDeCote,
    hint: () => ({ cells: [{ r: 4, c: 4 }, { r: 2, c: 3 }] }),
    check: (state) => !!state.board[2][3]?.upgrades.includes('pas-de-cote'),
  },
  {
    id: 'ruee', title: 'Ruée', upgrade: 'Ruée', category: 'ACTIF', cost: 9, color: '#F0B15E',
    text: 'Le cavalier capture à distance sans bouger.',
    detail: 'Sélectionne le cavalier, active RUÉE, puis vise le pion en d6. Le cavalier reste sur e4.',
    objective: 'Capturer sans déplacer le cavalier', setup: scenarioRuee,
    hint: (state) => state.phase === 'ruee-target' ? { cells: [{ r: 2, c: 3 }] } : { cells: [{ r: 4, c: 4 }] },
    power: 'ruee', check: (state) => !state.board[2][3] && !!state.board[4][4]?.upgrades.includes('ruee'),
  },
  {
    id: 'rayon', title: 'Rayon sacré', upgrade: 'Rayon sacré', category: 'ACTIF', cost: 10, color: '#F0B15E',
    text: 'Le fou frappe la première pièce sur une diagonale.',
    detail: 'Sélectionne le fou, active RAYON SACRÉ et vise le pion en c3. Le fou ne quitte jamais e4.',
    objective: 'Capturer sur une diagonale à distance', setup: scenarioRayon,
    hint: (state) => state.phase === 'rayon-target' ? { cells: [{ r: 2, c: 2 }] } : { cells: [{ r: 4, c: 4 }] },
    power: 'rayon', check: (state) => !state.board[2][2] && !!state.board[4][4]?.upgrades.includes('Rayon'),
  },
  {
    id: 'veteran', title: 'Vétéran', upgrade: 'Vétéran', category: 'ACTIF', cost: 5, color: '#F0B15E',
    text: 'Le pion capture directement devant lui, sans avancer.',
    detail: 'Active VÉTÉRAN sur le pion e4 puis vise le pion adverse en e5. Le pion reste sur sa case.',
    objective: 'Capturer le pion en face', setup: scenarioVeteran,
    hint: (state) => state.phase === 'vet-target' ? { cells: [{ r: 3, c: 4 }] } : { cells: [{ r: 4, c: 4 }] },
    power: 'vet', check: (state) => !state.board[3][4] && !!state.board[4][4]?.upgrades.includes('vet'),
  },
  {
    id: 'tele', title: 'Téléportation courte', upgrade: 'Téléportation courte', category: 'DÉPLACEMENT', cost: 12, color: '#8FB8E0',
    text: 'La dame s’échappe vers une case vide en ignorant les obstacles.',
    detail: 'Sélectionne la dame encerclée puis choisis l’anneau ambre en e7. Aucun pion ne doit être déplacé.',
    objective: 'Sortir de l’encerclement', setup: scenarioTeleportation,
    hint: () => ({ cells: [{ r: 4, c: 4 }, { r: 1, c: 4 }] }),
    check: (state) => state.board[1][4]?.type === 'Q' && (state.board[1][4].cooldowns.Tele || 0) > 0,
  },
  {
    id: 'hypnose', title: 'Hypnose', upgrade: 'Hypnose', category: 'ACTIF', cost: 10, color: '#F0B15E',
    text: 'Le fou crée une zone qui gêne les petites pièces ennemies.',
    detail: 'Sélectionne le fou et active HYPNOSE. L’aura reste active pendant les prochains tours.',
    objective: 'Déployer l’aura d’Hypnose', setup: scenarioHypnose,
    hint: () => ({ cells: [{ r: 4, c: 4 }] }),
    power: 'hypnose', check: (state) => (state.board[4][4]?.debuffs?.hypnoseAura || 0) > 0,
  },
  {
    id: 'decret', title: 'Décret', upgrade: 'Décret', category: 'ACTIF', cost: 12, color: '#F0B15E',
    text: 'Le roi échange sa place avec une pièce alliée adjacente.',
    detail: 'Sélectionne le roi, active DÉCRET, puis choisis la tour à sa droite. Une sortie d’urgence en un clic.',
    objective: 'Échanger les positions', setup: scenarioDecret,
    hint: (state) => state.phase === 'decret-target' ? { cells: [{ r: 6, c: 5 }] } : { cells: [{ r: 6, c: 4 }] },
    power: 'decret', check: (state) => state.board[6][5]?.type === 'K' && state.board[6][5].decretUsed,
  },
  {
    id: 'marche-arriere', title: 'Marche arrière', upgrade: 'Marche arrière', category: 'DÉPLACEMENT', cost: 4, color: '#8FB8E0',
    text: 'Le pion peut reculer quand sa route est bloquée.',
    detail: 'Le pion est bloqué par un allié devant lui. Fais-le reculer d’une case pour retrouver de l’espace.',
    objective: 'Reculer d’une case', setup: scenarioMarcheArriere,
    hint: () => ({ cells: [{ r: 4, c: 4 }, { r: 5, c: 4 }] }),
    check: (state) => state.board[5][4]?.type === 'P'
      && state.board[5][4].upgrades.includes('marche-arriere'),
  },
  {
    id: 'pivot', title: 'Pivot', upgrade: 'Pivot', category: 'DÉPLACEMENT', cost: 7, color: '#8FB8E0',
    text: 'La tour gagne un pas diagonal.',
    detail: 'La tour peut atteindre la case diagonale d3, impossible avec son déplacement classique.',
    objective: 'Jouer un pas diagonal', setup: scenarioPivot,
    hint: () => ({ cells: [{ r: 4, c: 4 }, { r: 3, c: 3 }] }),
    check: (state) => state.board[3][3]?.type === 'R'
      && state.board[3][3].upgrades.includes('pivot'),
  },
  {
    id: 'enjambeur', title: 'Enjambeur', upgrade: 'Enjambeur', category: 'DÉPLACEMENT', cost: 6, color: '#8FB8E0',
    text: 'La tour saute le premier obstacle rencontré.',
    detail: 'Un pion allié bloque la ligne. Fais franchir l’obstacle à la tour pour atterrir juste derrière.',
    objective: 'Sauter un obstacle', setup: scenarioEnjambeur,
    hint: () => ({ cells: [{ r: 4, c: 4 }, { r: 4, c: 6 }] }),
    check: (state) => state.board[4][6]?.type === 'R'
      && state.board[4][6].upgrades.includes('enjambeur'),
  },
  {
    id: 'reprise', title: 'Folie', upgrade: 'Folie', category: 'DÉPLACEMENT', cost: 5, color: '#8FB8E0',
    text: 'Le fou peut frapper comme une tour une fois.',
    detail: 'Le pion en f6 est horizontal au fou. Active la Folie en jouant cette capture inhabituelle.',
    objective: 'Capturer comme une tour', setup: scenarioReprise,
    hint: () => ({ cells: [{ r: 4, c: 4 }, { r: 4, c: 6 }] }),
    check: (state) => state.board[4][6]?.type === 'B'
      && state.board[4][6].folieUsed,
  },
  {
    id: 'feinte', title: 'Feinte', upgrade: 'Feinte', category: 'DÉPLACEMENT', cost: 12, color: '#8FB8E0',
    text: 'La dame peut surprendre comme un cavalier.',
    detail: 'La cible est à un saut de cavalier. Utilise la Feinte pour atteindre une case que la dame ne peut normalement pas viser.',
    objective: 'Capturer en saut de cavalier', setup: scenarioFeinte,
    hint: () => ({ cells: [{ r: 4, c: 4 }, { r: 2, c: 5 }] }),
    check: (state) => state.board[2][5]?.type === 'Q'
      && state.board[2][5].feinteUsed,
  },
  {
    id: 'passe-royale', title: 'Passe royal', upgrade: 'Passe royal', category: 'DÉPLACEMENT', cost: 8, color: '#8FB8E0',
    text: 'Le roi bondit de deux cases sans capturer.',
    detail: 'Fais franchir au roi les deux cases libres en ligne droite pour sortir de la zone dangereuse.',
    objective: 'Bondir de deux cases', setup: scenarioPasseRoyale,
    hint: () => ({ cells: [{ r: 6, c: 4 }, { r: 4, c: 4 }] }),
    check: (state) => state.board[4][4]?.type === 'K'
      && state.board[4][4].upgrades.includes('passe-royale'),
  },
];

export const TOTAL_LEARN_GAMES = LEARN_GAMES.length;

const PUZZLE_STORAGE_KEY = 'roychec-puzzle-progress';

export const PUZZLES = [
  {
    id: 'puzzle-enjambeur', title: 'La ligne bloquée', upgrade: 'Enjambeur', upgradeId: 'enjambeur',
    category: 'PUZZLE · DÉPLACEMENT', cost: 6, color: '#8FB8E0',
    text: 'Ta tour doit rejoindre la ligne de tir, mais un pion allié lui barre le passage.',
    detail: "Achète Enjambeur, puis franchis l'obstacle. Sans cette amélioration, la tour ne peut pas atteindre la case d'interception.",
    objective: "Atteindre la case derrière l'obstacle", setup: scenarioPuzzleEnjambeur,
    hint: (state) => ({ cells: state.puzzlePurchased ? [{ r: 4, c: 6 }] : [{ r: 4, c: 4 }] }),
    check: (state) => state.puzzlePurchased
      && state.board[4][6]?.type === 'R'
      && state.board[4][6].upgrades.includes('enjambeur'),
  },
  {
    id: 'puzzle-angle-mort', title: "L'angle mort", upgrade: 'Pas de côté', upgradeId: 'pas-de-cote',
    category: 'PUZZLE · DÉPLACEMENT', cost: 6, color: '#8FB8E0',
    text: "Une pièce majeure est à portée d'un saut en L, mais ton fou ne peut normalement pas la viser.",
    detail: 'Achète Pas de côté, puis capture la dame depuis la case e4. Le déplacement diagonal classique ne suffit pas.',
    objective: 'Capturer la pièce hors diagonale', setup: scenarioPuzzlePasDeCote,
    hint: (state) => ({ cells: state.puzzlePurchased ? [{ r: 2, c: 3 }] : [{ r: 4, c: 4 }] }),
    check: (state) => state.puzzlePurchased
      && state.board[2][3]?.type === 'B'
      && state.board[2][3].upgrades.includes('pas-de-cote'),
  },
  {
    id: 'puzzle-ruee', title: "L'assassin immobile", upgrade: 'Ruée', upgradeId: 'ruee',
    category: 'PUZZLE · ACTIF', cost: 9, color: '#F0B15E',
    text: 'Le cavalier a une cible parfaite, mais il doit rester sur sa case pour conserver sa position.',
    detail: 'Achète Ruée, active-la, puis capture la dame à distance. Un déplacement normal ferait quitter le cavalier.',
    objective: 'Capturer sans déplacer le cavalier', setup: scenarioPuzzleRuee,
    hint: (state) => state.phase === 'ruee-target' ? { cells: [{ r: 2, c: 3 }] } : { cells: [{ r: 4, c: 4 }] },
    power: 'ruee', check: (state) => state.puzzlePurchased
      && !state.board[2][3]
      && state.board[4][4]?.type === 'N'
      && state.board[4][4].upgrades.includes('ruee'),
  },
  {
    id: 'puzzle-feinte', title: 'Le saut impossible', upgrade: 'Feinte', upgradeId: 'feinte',
    category: 'PUZZLE · DÉPLACEMENT', cost: 12, color: '#8FB8E0',
    text: 'La tour ennemie est à un saut de cavalier : la dame ne peut pas la prendre avec ses mouvements habituels.',
    detail: 'Achète Feinte, puis capture la tour par le saut en L. La solution exige le mouvement spécial de la dame.',
    objective: 'Capturer par un saut de cavalier', setup: scenarioPuzzleFeinte,
    hint: (state) => ({ cells: [{ r: 4, c: 4 }, { r: 2, c: 5 }] }),
    check: (state) => state.puzzlePurchased
      && state.board[2][5]?.type === 'Q'
      && state.board[2][5].upgrades.includes('feinte')
      && state.board[2][5].feinteUsed,
  },
];

export const TOTAL_PUZZLES = PUZZLES.length;

function lireProgression() {
  try {
    const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
    return Array.isArray(parsed.completed) ? parsed : { completed: [] };
  } catch (_) { return { completed: [] }; }
}

function ecrireProgression(progress) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(progress)); } catch (_) { /* non bloquant */ }
}

export function progressionApprendre() { return lireProgression(); }

function lireProgressionPuzzles() {
  try {
    const parsed = JSON.parse(localStorage.getItem(PUZZLE_STORAGE_KEY) || '{}');
    return Array.isArray(parsed.completed) ? parsed : { completed: [] };
  } catch (_) { return { completed: [] }; }
}

function ecrireProgressionPuzzles(progress) {
  try { localStorage.setItem(PUZZLE_STORAGE_KEY, JSON.stringify(progress)); } catch (_) { /* non bloquant */ }
}

export function progressionPuzzles() { return lireProgressionPuzzles(); }

export function apprendrePuzzleEstDebloque(state, index) {
  if (!Number.isInteger(index) || index < 0 || index >= PUZZLES.length) return false;
  if (index === 0) return true;
  const completed = new Set(state?.puzzleProgress?.completed || lireProgressionPuzzles().completed || []);
  return completed.has(PUZZLES[index - 1].id);
}

export function marquerPuzzleReussi(state) {
  const progress = lireProgressionPuzzles();
  const id = PUZZLES[state.puzzleIndex]?.id;
  if (id && !progress.completed.includes(id)) {
    progress.completed.push(id);
    ecrireProgressionPuzzles(progress);
  }
  return progress;
}

// Une case est disponible si elle est la première du parcours ou si la case
// précédente a été maîtrisée. Les cases déjà réussies restent rejouables.
export function apprendreEstDebloque(state, index) {
  if (!Number.isInteger(index) || index < 0 || index >= LEARN_GAMES.length) return false;
  if (index === 0) return true;
  const completed = new Set(state?.learnProgress?.completed || lireProgression().completed || []);
  return completed.has(LEARN_GAMES[index - 1].id);
}

export function marquerMiniJeuReussi(state) {
  const progress = lireProgression();
  const id = LEARN_GAMES[state.learnIndex]?.id;
  if (id && !progress.completed.includes(id)) {
    progress.completed.push(id);
    ecrireProgression(progress);
  }
  return progress;
}

export function demarrerApprendre(state) {
  state.mode = 'learn';
  state.learnKind = 'classic';
  state.phase = 'learn-hub';
  state.board = null;
  state.turn = null;
  state.selected = null;
  state.legalMoves = [];
  state.panelPiece = null;
  state.ruTargets = [];
  state.learnIndex = null;
  state.puzzleIndex = null;
  state.learnSuccess = false;
  state.learnProgress = lireProgression();
  state.puzzleProgress = lireProgressionPuzzles();
}

export function demarrerPuzzles(state) {
  state.mode = 'learn';
  state.learnKind = 'puzzle';
  state.phase = 'puzzle-hub';
  state.board = null;
  state.turn = null;
  state.selected = null;
  state.legalMoves = [];
  state.panelPiece = null;
  state.ruTargets = [];
  state.learnIndex = null;
  state.puzzleIndex = null;
  state.learnSuccess = false;
  state.puzzleProgress = lireProgressionPuzzles();
}

export function demarrerMiniJeu(state, index) {
  const game = LEARN_GAMES[index];
  if (!game) return false;
  state.learnKind = 'classic';
  state.learnIndex = index;
  state.puzzleIndex = null;
  state.learnProgress = lireProgression();
  game.setup(state);
  return true;
}

export function demarrerPuzzle(state, index) {
  const puzzle = PUZZLES[index];
  if (!puzzle) return false;
  state.learnKind = 'puzzle';
  state.puzzleIndex = index;
  state.learnIndex = null;
  state.puzzleProgress = lireProgressionPuzzles();
  puzzle.setup(state);
  state.puzzleUpgrade = puzzle.upgradeId;
  return true;
}

export function verifierMiniJeu(state) {
  const game = LEARN_GAMES[state.learnIndex];
  return !!(game && game.check && game.check(state));
}

export function verifierPuzzle(state) {
  const puzzle = PUZZLES[state.puzzleIndex];
  return !!(puzzle && puzzle.check && puzzle.check(state));
}

export function reinitialiserMiniJeu(state) {
  const game = LEARN_GAMES[state.learnIndex];
  if (game) game.setup(state);
}

export function reinitialiserPuzzle(state) {
  const puzzle = PUZZLES[state.puzzleIndex];
  if (puzzle) puzzle.setup(state);
}

export function apprendreHint(state) {
  if (state.learnKind === 'puzzle') {
    const puzzle = PUZZLES[state.puzzleIndex];
    return puzzle && puzzle.hint ? puzzle.hint(state) : null;
  }
  const game = LEARN_GAMES[state.learnIndex];
  return game && game.hint ? game.hint(state) : null;
}

export function apprendrePower(state) {
  if (state.learnKind === 'puzzle') {
    const puzzle = PUZZLES[state.puzzleIndex];
    return puzzle && puzzle.power ? puzzle.power : null;
  }
  const game = LEARN_GAMES[state.learnIndex];
  return game && game.power ? game.power : null;
}
