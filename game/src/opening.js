// roychec — Opening book (livre d'ouvertures) construit depuis les replays.
// Apprend les ouvertures gagnantes au fil des parties.
// Persisté dans localStorage. Consulté par l'IA (ai.js) comme bonus de score.
import { creerPlateau } from './board.js?v=107';
import { DEFAULT_TAILLE } from './tailles.js?v=107';

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

const BOOK_KEY = 'roychec-opening-book';
const MAX_OPENING_PLY = 12;          // 6 premiers coups complets (12 demi-coups)
const BOOK_WEIGHT = 5.0;             // bonus max pour un book move (unités d'éval)
const MIN_PLAYS_FOR_CONFIDENCE = 3;  // nb de parties mini pour qu'un move soit fiable

// ---------------------------------------------------------------------------
// Hachage — encode le plateau en une chaîne compacte pour servir de clé.
// 64 cases × 2 caractères (type + owner) = 128 caractères.
// ---------------------------------------------------------------------------

function hashPosition(board) {
  let h = '';
  for (let r = 0; r < board.rows; r++) {
    for (let c = 0; c < board.cols; c++) {
      const p = board[r][c];
      h += p ? p.type + p.owner : '__';
    }
  }
  return h;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

// Décode une notation algébrique (ex. 'a1', 'o8') en indices board.
// boardOrRows permet d'adapter la rangée à la hauteur réelle du plateau.
function fromAlgebraic(s, boardOrRows) {
  if (typeof s !== 'string' || !s.length) return null;
  const rows = (boardOrRows && boardOrRows.rows) || boardOrRows || 8;
  return { r: rows - parseInt(s.slice(1)), c: s.charCodeAt(0) - 97 };
}

function moveKey(fromR, fromC, toR, toC) {
  return `${fromR}${fromC}${toR}${toC}`;
}

function parseMoveKey(mk) {
  return {
    fromR: parseInt(mk[0]),
    fromC: parseInt(mk[1]),
    toR: parseInt(mk[2]),
    toC: parseInt(mk[3]),
  };
}

// ---------------------------------------------------------------------------
// API publique — construction du book
// ---------------------------------------------------------------------------

// Met à jour le book à partir du replay d'une partie terminée.
// replayEvents : replayData.events (array de {type, owner, from, to, ...}).
// winner : 0 (J1) ou 1 (J2), le vainqueur de la partie.
export function updateBook(replayEvents, winner, taille = DEFAULT_TAILLE) {
  const book = loadBook();
  const board = creerPlateau(taille);
  let ply = 0;

  for (const e of replayEvents) {
    if (e.type !== 'move') continue;
    if (ply >= MAX_OPENING_PLY) break;

    const from = fromAlgebraic(e.from, board);
    const to = fromAlgebraic(e.to, board);
    if (!from || !to) continue;

    // Enregistre ce coup pour la position actuelle.
    const hash = hashPosition(board);
    if (!book[hash]) book[hash] = {};
    const mk = moveKey(from.r, from.c, to.r, to.c);
    if (!book[hash][mk]) book[hash][mk] = { plays: 0, wins: 0 };
    book[hash][mk].plays++;
    if (e.owner === winner) book[hash][mk].wins++;

    // Applique le coup au plateau simulé pour la suite.
    const piece = board[from.r][from.c];
    if (piece) {
      board[to.r][to.c] = null; // capture éventuelle
      board[from.r][from.c] = null;
      piece.r = to.r; piece.c = to.c;
      board[to.r][to.c] = piece;
    }
    // Si la pièce n'existe pas (edge case : pouvoir actif type Ruée/Rayon/Décret
    // dans la phase d'ouverture), on saute l'application mais le book a déjà
    // enregistré le move — le hash restera cohérent pour les coups suivants
    // puisque la position n'a pas changé.

    ply++;
  }

  saveBook(book);
  return book;
}

// ---------------------------------------------------------------------------
// API publique — consultation
// ---------------------------------------------------------------------------

// Bonus de score pour un coup du book. Renvoie 0 si le coup n'est pas connu.
// Le bonus est d'autant plus fort que le coup a un bon win-rate ET un
// nombre de parties suffisant (confiance statistique).
export function getBookBonus(board, fromR, fromC, toR, toC, aiPlayer) {
  const piece = board[fromR][fromC];
  if (!piece || piece.owner !== aiPlayer) return 0;

  const book = loadBook();
  const hash = hashPosition(board);
  const entry = book[hash];
  if (!entry) return 0;

  const mk = moveKey(fromR, fromC, toR, toC);
  const stats = entry[mk];
  if (!stats || stats.plays < MIN_PLAYS_FOR_CONFIDENCE) return 0;

  // winRate ∈ [0, 1], centré sur 0.5 → bonus ∈ [-BOOK_WEIGHT/2, +BOOK_WEIGHT/2]
  // Pondéré par le log du nombre de parties (plus de données = plus de poids).
  const winRate = stats.wins / stats.plays;
  const confidence = Math.min(Math.log2(stats.plays) / Math.log2(10), 1); // saturé à 10 parties
  return BOOK_WEIGHT * (winRate - 0.5) * confidence;
}

// Renvoie la liste des coups du book pour la position actuelle.
// Utile pour le debug / affichage. Chaque entrée : { fromR, fromC, toR, toC, winRate, plays }.
export function getBookMoves(board, aiPlayer) {
  const book = loadBook();
  const hash = hashPosition(board);
  const entry = book[hash];
  if (!entry) return [];

  const moves = [];
  for (const [mk, stats] of Object.entries(entry)) {
    const { fromR, fromC, toR, toC } = parseMoveKey(mk);
    const piece = board[fromR][fromC];
    if (!piece || piece.owner !== aiPlayer) continue;
    moves.push({
      fromR, fromC, toR, toC,
      winRate: stats.plays > 0 ? stats.wins / stats.plays : 0,
      plays: stats.plays,
    });
  }
  return moves;
}

// Renvoie le nombre total d'entrées dans le book (pour affichage debug).
export function bookSize() {
  const book = loadBook();
  let total = 0;
  for (const entry of Object.values(book)) total += Object.keys(entry).length;
  return total;
}

// ---------------------------------------------------------------------------
// Persistance localStorage
// ---------------------------------------------------------------------------

function loadBook() {
  try {
    if (typeof localStorage === 'undefined') return {};
    const raw = localStorage.getItem(BOOK_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch (_) { return {}; }
}

function saveBook(book) {
  try {
    if (typeof localStorage === 'undefined') return;
    // Compactage : supprime les entrées avec 0 plays (devrait pas arriver, défense).
    for (const hash of Object.keys(book)) {
      for (const mk of Object.keys(book[hash])) {
        if (book[hash][mk].plays === 0) delete book[hash][mk];
      }
      if (!Object.keys(book[hash]).length) delete book[hash];
    }
    localStorage.setItem(BOOK_KEY, JSON.stringify(book));
  } catch (_) { /* localStorage plein ou indisponible — non bloquant */ }
}
