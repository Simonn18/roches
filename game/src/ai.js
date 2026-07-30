// roychec — IA (cycle 2, amendement v2) : évaluation statique + recherche + achats
// SPEC design/spec-ia.md v2 (§1.3 politique de dépense, §2.2 MENACE, §2.4 UPGRADES).
// Niveau 1 : mouvement aléatoire uniforme.
// Niveau 2 : 1-ply greedy (max eval).
// Niveau 3 : 3-ply α-β + MVV-LVA + time guard 800ms.
// Achats (v2) : PHASE DISTINCTE pré-mouvement `decideAchats()` — bandes de solde à gate
//   décroissant, réserve = 0, priorité défense, boucle multi-achats. L'ancienne logique
//   d'achat « émergente » (achat-en-coup-complet) est RETIRÉE.
// Pouvoirs actifs (ex-règles D-E) : hors-scope v1/v2 (le bot achète, ne déclenche pas).
// Invariant préservé : la recherche travaille sur des CLONES, l'état réel n'est jamais muté.
import { coupsLegaux, DIRS8 } from './rules.js';
import { VALEUR_PIECE, UPGRADES, UPGRADES_PAR_TYPE, MAX_UPGRADES_PAR_PIECE } from './constants.js';
import { getBookBonus } from './opening.js';

// ---------------------------------------------------------------------------
// Helpers — clone & manipulation du plateau pour la recherche
// ---------------------------------------------------------------------------

function clonePiece(p) {
  if (!p) return null;
  return {
    id: p.id, type: p.type, owner: p.owner, r: p.r, c: p.c,
    upgrades: [...p.upgrades],
    shield: p.shield,
    cooldowns: { ...p.cooldowns },
    doubleCoupUsed: p.doubleCoupUsed,
    decretUsed: p.decretUsed,
    sacrificeArmed: p.sacrificeArmed,
    rempartGranted: p.rempartGranted,
    aBouge: p.aBouge, // condition du roque (GDD §5.1.b) — la recherche doit la voir
  };
}

function cloneBoard(board) {
  return board.map(row => row.map(p => clonePiece(p)));
}

function applyMove(board, piece, move) {
  board[piece.r][piece.c] = null;
  piece.r = move.r;
  piece.c = move.c;
  board[move.r][move.c] = piece;
  piece.aBouge = true;
  // Roque (GDD §5.1.b) : la tour suit dans la simulation aussi, sinon l'éval juge
  // une position fausse (tour restée dans le coin).
  if (move.castle) {
    const rook = board[move.castle.rookFrom.r][move.castle.rookFrom.c];
    if (rook) {
      board[move.castle.rookFrom.r][move.castle.rookFrom.c] = null;
      rook.r = move.castle.rookTo.r; rook.c = move.castle.rookTo.c;
      board[rook.r][rook.c] = rook;
      rook.aBouge = true;
    }
  }
  // Promotion (GDD §5.1.b) : l'IA promeut toujours Dame — la simulation aligne
  // l'éval sur ce que main.js jouera réellement (promo 'Q', upgrades perdues).
  if (move.promotion && piece.type === 'P') {
    piece.type = 'Q';
    piece.upgrades = [];
    piece.shield = false;
    piece.cooldowns = {};
  }
}

function allMoves(board, player) {
  const moves = [];
  // Phase A.5 v2 — size-aware : pour PvAI / spectateur / hot-seat sur plateau l15 (8×15).
  // board.length = 8 (std) ou 15 (l15), board[0].length = 8 (std) ou 15 (l15).
  for (let r = 0; r < board.length; r++) {
    for (let c = 0; c < board[0].length; c++) {
      const p = board[r][c];
      if (!p || p.owner !== player) continue;
      const legal = coupsLegaux(board, p);
      for (const mv of legal) moves.push({ piece: p, move: mv });
    }
  }
  return moves;
}

// ---------------------------------------------------------------------------
// Évaluation statique (§2) — score du point de vue de aiPlayer (> 0 = bon)
// ---------------------------------------------------------------------------

const W_MOB = { Q: 0.3, R: 0.25, N: 0.15, B: 0.15, P: 0.05, K: 0 }; // §2.3
const SHIELD_IDS = ['forteresse', 'bouclier', 'monture', 'couronne'];
const KNIGHT_DELTAS = [[-2,-1],[-2,1],[-1,-2],[-1,2],[1,-2],[1,2],[2,-1],[2,1]];

function evalBoard(board, aiPlayer) {
  const human = 1 - aiPlayer;
  let material = 0, mobility = 0, upgradesScore = 0, pawnScore = 0, kingSafety = 0, menace = 0;
  let aiKing = null, humanKing = null;

  const aiThreats = new Set();
  const humanThreats = new Set();

  // ---- Passe unique : MATERIEL + MOBILITÉ + UPGRADES + PAWNS + menaces ----
  for (let r = 0; r < board.length; r++) {
    for (let c = 0; c < board[0].length; c++) {
      const p = board[r][c];
      if (!p) continue;
      const sign = p.owner === aiPlayer ? 1 : -1;

      // MATERIEL
      let val = VALEUR_PIECE[p.type];
      if (p.type === 'K') {
        if (p.owner === aiPlayer) aiKing = p;
        else humanKing = p;
        val = 100;
      }
      if (p.upgrades.includes('vet')) val = Math.max(val, 3);
      if (p.upgrades.includes('forteresse')) val = 8;
      if (p.shield && SHIELD_IDS.some(u => p.upgrades.includes(u))) val *= 2;
      material += sign * val;

      // Menaces & mobilité
      const legalMoves = coupsLegaux(board, p);
      const threats = p.owner === aiPlayer ? aiThreats : humanThreats;
      for (const mv of legalMoves) threats.add(mv.r + ',' + mv.c);

      mobility += sign * legalMoves.length * (W_MOB[p.type] || 0);

      // UPGRADES_EN_JEU (§2.4)
      // +0.5 par amélioration équipée, TOUTES catégories (v2) : gain d'éval positif à
      // toute carte (y compris déplacement), pour inciter l'IA à convertir l'or en
      // capacités. Terme symétrique (valorise aussi les upgrades adverses en négatif).
      upgradesScore += sign * p.upgrades.length * 0.5;
      if (p.shield && SHIELD_IDS.some(u => p.upgrades.includes(u))) upgradesScore += sign * 1.5;
      if (p.upgrades.includes('Tele') && (p.cooldowns.Tele || 0) === 0) upgradesScore += sign * 2.0;
      if (p.type === 'K' && p.sacrificeArmed) upgradesScore += sign * 3.0;
      for (const cd of Object.values(p.cooldowns)) { if (cd > 5) upgradesScore -= sign * 0.5; }

      // POSITION (pions) (§2.5)
      if (p.type === 'P') {
        const passed = p.owner === aiPlayer ? r <= 3 : r >= 4;
        if (passed) pawnScore += sign * 0.1;
      }
    }
  }

  // Pions isolés (§2.5) — size-aware : nc dans [0, board[0].length[, nr dans [0, board.length[.
  for (let r = 0; r < board.length; r++) {
    for (let c = 0; c < board[0].length; c++) {
      const p = board[r][c];
      if (!p || p.type !== 'P') continue;
      const sign = p.owner === aiPlayer ? 1 : -1;
      let hasNeighbor = false;
      for (let dc = -1; dc <= 1 && !hasNeighbor; dc += 2) {
        const nc = c + dc;
        if (nc < 0 || nc >= board[0].length) continue;
        for (let nr = 0; nr < board.length && !hasNeighbor; nr++) {
          const q = board[nr][nc];
          if (q && q.type === 'P' && q.owner === p.owner) hasNeighbor = true;
        }
      }
      if (!hasNeighbor) pawnScore -= sign * 0.2;
    }
  }

  // MENACE — capture du roi (§2.2 v2 : +12 borné, plus le +150 qui rouvrait le posturing)
  if (humanKing && aiThreats.has(humanKing.r + ',' + humanKing.c)) menace += 12;
  if (aiKing && humanThreats.has(aiKing.r + ',' + aiKing.c)) menace -= 12;

  // MENACE — pièces attaquables (§2.2 v2 : ±0.30 × valeur matérielle de la cible).
  // Plafonné sous la valeur d'une capture réelle → le greedy préfère CAPTURER que « poser »
  // une menace (fix du bug de posturing : menacer une dame = +2.7, la capturer = +9).
  for (let r = 0; r < board.length; r++) {
    for (let c = 0; c < board[0].length; c++) {
      const p = board[r][c];
      if (!p || p.type === 'K') continue;
      const key = r + ',' + c;
      const w = 0.30 * (VALEUR_PIECE[p.type] || 0);
      if (p.owner !== aiPlayer && aiThreats.has(key)) menace += w;
      if (p.owner === aiPlayer && humanThreats.has(key)) menace -= w;
    }
  }

  // KING_SAFETY (§2.6)
  kingSafety += kingSafetyScore(board, aiPlayer, aiKing, humanKing);

  return material + menace + mobility + upgradesScore + pawnScore + kingSafety;
}

function kingSafetyScore(board, aiPlayer, aiKing, humanKing) {
  // Phase A.5 v2 — bounds size-aware via board.length / board[0].length. Sans ça, en
  // l15 le roi pourrait être score comme adjacent à des cases hors-board (undefined lookup).
  let score = 0;
  const H = board.length, W = board[0].length;
  if (aiKing) {
    for (const [dr, dc] of DIRS8) {
      const nr = aiKing.r + dr, nc = aiKing.c + dc;
      if (nr >= 0 && nr < H && nc >= 0 && nc < W && board[nr][nc] === null) score += 0.5;
    }
    for (const [dr, dc] of KNIGHT_DELTAS) {
      const nr = aiKing.r + dr, nc = aiKing.c + dc;
      if (nr >= 0 && nr < H && nc >= 0 && nc < W) {
        const q = board[nr][nc];
        if (q && q.owner !== aiPlayer) score -= 1.0;
      }
    }
    if (aiKing.sacrificeArmed) score += 2.0;
  }
  if (humanKing) {
    for (const [dr, dc] of DIRS8) {
      const nr = humanKing.r + dr, nc = humanKing.c + dc;
      if (nr >= 0 && nr < H && nc >= 0 && nc < W && board[nr][nc] === null) score -= 0.5;
    }
    for (const [dr, dc] of KNIGHT_DELTAS) {
      const nr = humanKing.r + dr, nc = humanKing.c + dc;
      if (nr >= 0 && nr < H && nc >= 0 && nc < W) {
        const q = board[nr][nc];
        if (q && q.owner === aiPlayer) score += 1.0;
      }
    }
    if (humanKing.sacrificeArmed) score -= 2.0;
  }
  return score;
}

// ---------------------------------------------------------------------------
// PHASE D'ACHAT (v2, §1.3) — décision dépensière pré-mouvement, sur clones.
// `decideAchats` s'exécute UNE fois au début du tour du bot, AVANT la recherche de
// coup. Elle achète 0 à N cartes selon les bandes de solde (gate décroissant), avec
// priorité défense, puis rend la liste d'achats + le plateau amélioré (clone) sur
// lequel la recherche de coup travaillera. L'état réel n'est jamais muté ici.
// ---------------------------------------------------------------------------

// Applique un achat sur une pièce clonée.
function applyPurchase(piece, upgradeId) {
  piece.upgrades.push(upgradeId);
  if (['forteresse', 'bouclier', 'monture', 'couronne'].includes(upgradeId)) {
    piece.shield = true;
  }
}

// Bandes de solde (§1.3.2) — QUAND et COMBIEN dépenser. Réserve minimale = 0.
// `gate` = gain d'éval minimal exigé pour un achat non défensif ; `maxBuys` = nombre
// max d'achats du tour tant qu'on reste dans cette bande.
function bandFor(solde) {
  if (solde < 4)   return { gate: Infinity,  maxBuys: 0 }; // rien d'abordable
  if (solde <= 11) return { gate: 1.0,       maxBuys: 1 }; // sélectif
  if (solde <= 19) return { gate: 0.0,       maxBuys: 1 }; // gain non négatif
  if (solde <= 25) return { gate: -2.0,      maxBuys: 2 }; // dépense forcée
  return             { gate: -Infinity, maxBuys: 3 };      // 26-30 : urgence plafond
}

// Correspondance pièce menacée → carte de blindage (§1.3.3). Le Fou n'a pas de blindage.
const BLINDAGE = { Q: 'couronne', R: 'forteresse', N: 'monture', P: 'bouclier' };

// Ensemble des cases occupées par une pièce ALLIÉE de l'IA attaquable par l'humain au
// prochain coup (§1.3.3 : « attaquable », PAS coupsLegaux == []). Renvoie les pièces
// menacées triées par valeur décroissante (protège d'abord la plus chère).
function piecesMenacees(board, aiPlayer) {
  const human = 1 - aiPlayer;
  const threats = new Set();
  // Phase A.5 v2 — size-aware.
  for (let r = 0; r < board.length; r++) {
    for (let c = 0; c < board[0].length; c++) {
      const p = board[r][c];
      if (!p || p.owner !== human) continue;
      for (const mv of coupsLegaux(board, p)) {
        if (mv.capture) threats.add(mv.r + ',' + mv.c);
      }
    }
  }
  const menacees = [];
  for (let r = 0; r < board.length; r++) {
    for (let c = 0; c < board[0].length; c++) {
      const p = board[r][c];
      if (!p || p.owner !== aiPlayer || p.type === 'K') continue;
      if (threats.has(r + ',' + c)) menacees.push(p);
    }
  }
  menacees.sort((a, b) => (VALEUR_PIECE[b.type] || 0) - (VALEUR_PIECE[a.type] || 0));
  return menacees;
}

// Priorité DÉFENSE (§1.3.3) : court-circuite le gate. Renvoie le blindage à acheter
// pour la pièce menacée la plus chère, ou null si aucun n'est abordable/pertinent.
function pickDefense(board, aiPlayer, solde) {
  for (const p of piecesMenacees(board, aiPlayer)) {
    if (p.upgrades.length >= MAX_UPGRADES_PAR_PIECE) continue;
    const id = BLINDAGE[p.type];
    if (!id) continue;                         // Fou : pas de blindage → fuite par le coup
    if (p.upgrades.includes(id)) continue;     // déjà blindé
    if (p.type === 'P' && solde < 12) continue; // pion : on ne le blinde que si l'or abonde
    const cost = UPGRADES[id].cout;
    if (cost > solde) continue;
    return { piece: p, upgradeId: id, cost };
  }
  return null;
}

// Construit les candidats d'achat (§1.3.4), identique aux 3 niveaux. `base` = éval du
// plateau avant achat, pour calculer gainEval = éval(après) - éval(avant).
function buildCandidates(board, aiPlayer, solde, base) {
  const cands = [];
  // Phase A.5 v2 — size-aware.
  for (let r = 0; r < board.length; r++) {
    for (let c = 0; c < board[0].length; c++) {
      const p = board[r][c];
      if (!p || p.owner !== aiPlayer) continue;
      if (p.upgrades.length >= MAX_UPGRADES_PAR_PIECE) continue;
      const ids = UPGRADES_PAR_TYPE[p.type] || [];
      for (const id of ids) {
        if (p.upgrades.includes(id)) continue;
        const u = UPGRADES[id];
        if (!u || u.cout > solde) continue;
        const clone = cloneBoard(board);
        applyPurchase(clone[p.r][p.c], id);
        const gainEval = evalBoard(clone, aiPlayer) - base;
        cands.push({ piece: p, upgradeId: id, cost: u.cout, gainEval });
      }
    }
  }
  return cands;
}

// Phase d'achat complète (§1.3). Renvoie { achats, board } :
//   - `achats` : liste [{ target: piece RÉELLE, upgradeId }] à exécuter par main.js.
//   - `board`  : clone du plateau AVEC les achats appliqués (pour la recherche de coup).
// `realBoard` = state.board (jamais muté) ; les cibles renvoyées y sont ré-adressées par
// coordonnées (un achat ne déplace pas les pièces, donc les coords restent valides).
function decideAchats(realBoard, aiPlayer, ecus, difficulty) {
  const achats = [];
  let solde = ecus;
  const work = cloneBoard(realBoard); // clone muté au fil des achats
  let guard = 0;
  while (guard++ < 8) {
    const band = bandFor(solde);
    if (achats.length >= band.maxBuys) break;
    if (solde < 4) break;

    // 1) Défense prioritaire (bypass gate).
    let chosen = pickDefense(work, aiPlayer, solde);

    // 2) Sinon, achat selon le gate de la bande.
    if (!chosen) {
      const base = evalBoard(work, aiPlayer);
      const cands = buildCandidates(work, aiPlayer, solde, base);
      const passing = cands.filter(c => c.gainEval >= band.gate);
      if (!passing.length) break;
      if (difficulty === 1) {
        // Débutant : choix aléatoire uniforme parmi les candidats passant le gate.
        chosen = passing[Math.floor(Math.random() * passing.length)];
      } else {
        // Interm./Avancé : argmax gainEval (départage : moins cher, puis aléatoire).
        passing.sort((a, b) => (b.gainEval - a.gainEval) || (a.cost - b.cost));
        const top = passing[0];
        const ties = passing.filter(c =>
          Math.abs(c.gainEval - top.gainEval) < 0.001 && c.cost === top.cost);
        chosen = ties[Math.floor(Math.random() * ties.length)];
      }
    }

    // Enregistre l'achat (cible = pièce RÉELLE) et l'applique sur le clone `work`.
    const realPiece = realBoard[chosen.piece.r][chosen.piece.c];
    achats.push({ target: realPiece, upgradeId: chosen.upgradeId });
    applyPurchase(work[chosen.piece.r][chosen.piece.c], chosen.upgradeId);
    solde -= chosen.cost;
  }
  return { achats, board: work };
}

// ---------------------------------------------------------------------------
// Recherche Niveau 2 — 1-ply greedy (§3.2). Sélection du COUP seulement : les achats
// ont déjà été résolus par decideAchats() en amont. `board` est le plateau amélioré.
// Renvoie { piece, move } (piece référence le plateau passé) ou null.
// ---------------------------------------------------------------------------

function greedySearch(board, aiPlayer) {
  let best = [];
  let bestScore = -Infinity;

  const moves = allMoves(board, aiPlayer);
  for (const { piece, move } of moves) {
    const target = board[move.r][move.c];
    if (target && target.type === 'K' && target.owner !== aiPlayer) {
      return { piece, move }; // rien ne bat la capture du roi
    }
    const clone = cloneBoard(board);
    applyMove(clone, clone[piece.r][piece.c], move);
    const bonus = getBookBonus(board, piece.r, piece.c, move.r, move.c, aiPlayer);
    const score = evalBoard(clone, aiPlayer) + bonus;
    if (score > bestScore + 0.001) { bestScore = score; best = [{ piece, move }]; }
    else if (Math.abs(score - bestScore) < 0.001) { best.push({ piece, move }); }
  }

  if (!best.length) return null;
  return best[Math.floor(Math.random() * best.length)];
}

// ---------------------------------------------------------------------------
// Recherche Niveau 3 — 3-ply α-β avec MVV-LVA (§3.3) + achats au niveau racine.
// Time guard à 800ms : si la recherche explose, fallback sur greedySearch().
// ---------------------------------------------------------------------------

let AB_NODES = 0; // compteur partagé pour le time guard (reset à chaque appel racine).
const AB_TIMEOUT = 800; // ms — au-delà, on lève une exception rattrapée par iaDecideTour.

function mvvLva(move, attacker, board) {
  const target = board[move.r][move.c];
  if (!target) return 0;
  if (target.type === 'K') return 10000;
  return (VALEUR_PIECE[target.type] || 0) * 100 - (VALEUR_PIECE[attacker.type] || 0);
}

function alphaBeta(board, depth, alpha, beta, maximizing, aiPlayer, t0) {
  if (depth === 0) return evalBoard(board, aiPlayer);

  // Time guard : vérifié tous les 2000 nœuds. Évite de bloquer le thread > 800ms.
  AB_NODES++;
  if (t0 && AB_NODES % 2000 === 0 && performance.now() - t0 > AB_TIMEOUT) {
    throw new Error('AI timeout');
  }

  const player = maximizing ? aiPlayer : 1 - aiPlayer;
  let moves = allMoves(board, player);
  if (!moves.length) return evalBoard(board, aiPlayer);

  moves.sort((a, b) => mvvLva(b.move, b.piece, board) - mvvLva(a.move, a.piece, board));

  if (maximizing) {
    let maxEval = -Infinity;
    for (const { piece, move } of moves) {
      const target = board[move.r][move.c];
      if (target && target.type === 'K' && target.owner !== player) return 10000 + depth;
      const clone = cloneBoard(board);
      const p = clone[piece.r][piece.c];
      applyMove(clone, p, move);
      const score = alphaBeta(clone, depth - 1, alpha, beta, false, aiPlayer, t0);
      maxEval = Math.max(maxEval, score);
      alpha = Math.max(alpha, score);
      if (beta <= alpha) break;
    }
    return maxEval;
  } else {
    let minEval = Infinity;
    for (const { piece, move } of moves) {
      const target = board[move.r][move.c];
      if (target && target.type === 'K' && target.owner !== player) return -(10000 + depth);
      const clone = cloneBoard(board);
      const p = clone[piece.r][piece.c];
      applyMove(clone, p, move);
      const score = alphaBeta(clone, depth - 1, alpha, beta, true, aiPlayer, t0);
      minEval = Math.min(minEval, score);
      beta = Math.min(beta, score);
      if (beta <= alpha) break;
    }
    return minEval;
  }
}

function alphaBetaSearch(board, aiPlayer) {
  AB_NODES = 0; // reset du compteur pour cette recherche
  const t0 = performance.now();
  let best = [];
  let bestScore = -Infinity;

  // Sélection du COUP seulement : les achats ont déjà été résolus par decideAchats().
  const moves = allMoves(board, aiPlayer);
  moves.sort((a, b) => mvvLva(b.move, b.piece, board) - mvvLva(a.move, a.piece, board));
  for (const { piece, move } of moves) {
    const target = board[move.r][move.c];
    if (target && target.type === 'K' && target.owner !== aiPlayer) {
      return { piece, move };
    }
    const clone = cloneBoard(board);
    applyMove(clone, clone[piece.r][piece.c], move);
    const bonus = getBookBonus(board, piece.r, piece.c, move.r, move.c, aiPlayer);
    const score = alphaBeta(clone, 2, -Infinity, Infinity, false, aiPlayer, t0) + bonus;
    if (score > bestScore + 0.001) { bestScore = score; best = [{ piece, move }]; }
    else if (Math.abs(score - bestScore) < 0.001) { best.push({ piece, move }); }
  }

  if (!best.length) return null;
  return best[Math.floor(Math.random() * best.length)];
}

// ---------------------------------------------------------------------------
// Point d'entrée
// ---------------------------------------------------------------------------

export function iaDecideTour(state) {
  const ai = state.ai;
  if (!ai) return null;
  // Spectateur : ai.player est posé dynamiquement par planifierCoupIA() avant
  // l'appel. Fallback sur state.turn (robustesse).
  const aiPlayer = ai.player !== undefined ? ai.player : state.turn;
  if (state.turn !== aiPlayer) return null;
  if (state.phase !== 'play') return null;

  const difficulty = ai.difficulty || 1;
  const ecus = state.ecus[aiPlayer];

  // -------- PHASE 1 : achats pré-mouvement (§1.3, commune aux 3 niveaux) --------
  // Renvoie la liste d'achats (cibles = pièces réelles) + le plateau amélioré (clone)
  // sur lequel la recherche de coup va travailler (« plateau déjà amélioré », §1.3.1).
  let achats = [];
  let boardApres = state.board;
  try {
    const res = decideAchats(state.board, aiPlayer, ecus, difficulty);
    achats = res.achats;
    boardApres = res.board;
  } catch (e) {
    console.warn('[AI] decideAchats failed, no purchase this turn:', e);
    achats = [];
    boardApres = state.board;
  }

  // -------- PHASE 2 : sélection du coup (sur le plateau amélioré) --------
  let mouvement;
  if (difficulty === 1) {
    const moves = allMoves(boardApres, aiPlayer);
    mouvement = moves.length ? moves[Math.floor(Math.random() * moves.length)] : null;
  } else if (difficulty === 2) {
    mouvement = greedySearch(boardApres, aiPlayer);
  } else {
    try {
      mouvement = alphaBetaSearch(boardApres, aiPlayer);
    } catch (e) {
      console.warn('[AI] α-β failed, fallback greedy:', e);
      mouvement = greedySearch(boardApres, aiPlayer);
    }
  }

  // Fallback : si la recherche n'a rien trouvé, coup aléatoire sur le plateau amélioré.
  if (!mouvement) {
    const moves = allMoves(boardApres, aiPlayer);
    mouvement = moves.length ? moves[Math.floor(Math.random() * moves.length)] : null;
  }

  // Ré-adressage : la recherche a tourné sur `boardApres` (clone). On remappe la pièce
  // vers l'instance RÉELLE (même case — un achat ne déplace pas les pièces) pour que
  // main.js exécute selectionner()/jouerCoup() sur le vrai plateau.
  if (mouvement) {
    const realPiece = state.board[mouvement.piece.r][mouvement.piece.c];
    mouvement = { piece: realPiece, move: mouvement.move };
  }

  if (!mouvement && !achats.length) {
    console.warn('[AI] no move found, skipping turn');
    return null;
  }

  return { achats, mouvement, pouvoir: null };
}
