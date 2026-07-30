// roychec — harness Node ESM pour QA-IA-05 (spec-ia.md §1.3.0).
// Joue N parties J1=Aléatoire vs J2=IA Avancé (difficulty 3).
// Métriques : achats de l'IA par partie, % de tours où state.ecus[1] atteint 30 AVANT
// la phase d'achat (le plafond est mesuré après le crédit des +2 mais avant que
// decideAchats tourne, donc un bot qui dépense y passera <10% du temps). 0 régression,
// 0 erreur console : toute exception est rapportée mais ne pollue pas les autres games.
//
// Lancement : `node scripts/test-ai-metriques.mjs`
//   (cible : 30 parties en < 30s sur M1/M2). Cap dur : 400 demi-coups par partie.

import { coupsLegaux } from '../game/src/rules.js';
import {
  creerEtat, caseAt,
} from '../game/src/board.js';
import {
  REVENU_PAR_COUP, PLAFOND_ECUS, VALEUR_PIECE, UPGRADES,
} from '../game/src/constants.js';
import { iaDecideTour } from '../game/src/ai.js';

const N = parseInt(process.argv[2] || '30', 10);
const HARD_CAP_HALF_MOVES = 400;          // 200 coups par joueur : au-delà, on coupe
const NO_CAPTURE_DRAW_AT = 100;           // règle des 50 coups sans prise

// IDs de blindage (miroir de main.js acheter() et spec §1.3.3).
const SHIELD_IDS = ['forteresse', 'bouclier', 'monture', 'couronne'];

function listAllMoves(board, player) {
  const moves = [];
  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      const p = board[r][c];
      if (!p || p.owner !== player) continue;
      const legal = coupsLegaux(board, p);
      for (const mv of legal) moves.push({ piece: p, move: mv });
    }
  }
  return moves;
}

// Applique un mouvement légal sur le board (miroir fidèle de main.js jouerCoup(),
// simplifié : pas de chaîne, pas de pouvoir actif — l'IA ne déclenche jamais).
// `state.turn` doit être le joueur qui joue au moment de l'appel.
function applyMoveFromPiece(piece, mv, state) {
  const fromR = piece.r, fromC = piece.c;
  const target = state.board[mv.r][mv.c];

  // Blindage : la capture est absorbée, l'attaquant reste sur place (GDD §5.5).
  if (target && target.owner !== piece.owner && target.shield) {
    target.shield = false;
    state.ecus[state.turn] = Math.min(
      PLAFOND_ECUS, state.ecus[state.turn] + REVENU_PAR_COUP);
    return { halfMoveDone: true, capturedType: null, ended: false, winner: null };
  }

  // Capture normale.
  let bonus = 0, ended = false, winner = null;
  if (target && target.owner !== piece.owner) {
    bonus = VALEUR_PIECE[target.type]; // 0 pour K (mais on coupe avant : ended)
    if (target.type === 'K') { ended = true; winner = piece.owner; }
    state.board[mv.r][mv.c] = null;
  }

  state.board[fromR][fromC] = null;
  piece.r = mv.r; piece.c = mv.c;
  state.board[mv.r][mv.c] = piece;

  state.ecus[state.turn] = Math.min(
    PLAFOND_ECUS, state.ecus[state.turn] + REVENU_PAR_COUP + bonus);

  return {
    halfMoveDone: true,
    capturedType: target && target.owner !== piece.owner ? target.type : null,
    ended, winner,
  };
}

// Applique un achat (miroir de main.js acheter(), sans recordReplay).
function applyPurchase(target, upgradeId, state) {
  const u = UPGRADES[upgradeId];
  if (!u) throw new Error(`unknown upgrade ${upgradeId}`);
  if (target.upgrades.includes(upgradeId)) throw new Error('duplicate upgrade');
  if (target.upgrades.length >= 2) throw new Error('max 2 upgrades/pièce');
  if (state.ecus[state.turn] < u.cout) throw new Error('insolvent');
  target.upgrades.push(upgradeId);
  state.ecus[state.turn] -= u.cout;
  if (SHIELD_IDS.includes(upgradeId)) target.shield = true;
}

// Décrément des cooldowns (miroir de main.js finDeTour()).
function decrementCooldowns(state, player) {
  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      const p = state.board[r][c];
      if (!p || p.owner !== player) continue;
      for (const k of Object.keys(p.cooldowns)) {
        if (p.cooldowns[k] > 0) p.cooldowns[k]--;
      }
    }
  }
}

// Coup Aléatoire uniforme (proxy Niveau 1 : random parmi coupsLegaux).
function randomMove(state, player) {
  const moves = listAllMoves(state.board, player);
  if (!moves.length) return null;
  return moves[Math.floor(Math.random() * moves.length)];
}

// Joue une partie complète. Renvoie des stats agrégées pour J2 (l'IA).
function playOneGame(gameIdx) {
  const state = creerEtat({ mode: 'pvai', difficulty: 3 });
  state.ai = { player: 1, difficulty: 3, thinking: false };
  state.phase = 'play';

  const stats = {
    gameIdx,
    winner: null,
    reason: 'unknown',
    halfMoves: 0,
    achats: 0,
    toursIA: 0,
    toursPlafond: 0,        // tours du bot où ecus[1] === 30 APRÈS +2 (avant decideAchats)
    maxDecisionMs: 0,
    iaError: null,
  };

  let noCaptureStreak = 0;

  while (state.phase === 'play' && stats.halfMoves < HARD_CAP_HALF_MOVES) {
    stats.halfMoves++;
    const active = state.turn;

    // Pas de +2 ici : dans main.js, le +2 du joueur actif est crédité à la FIN du
    // coup précédent (gagnerEcus post-move dans jouerCoup), pas au début du tour.
    // Le solde mesuré ici = fin du coup PRÉCÉDEMMENT joué. C'est exactement la
    // vision qu'a decideAchats au moment de la décision (visibilité : main.js
    // appelle iaDecideTour depuis planifierCoupIA, qui s'exécute après finDeTour).

    // Métriques : on mesure le plafond AVANT decideAchats, sur le solde tel qu'il
    // est au moment où main.js prendrait sa décision. Si state.ecus[1] === 30 ici,
    // c'est que le bot A atteint le plafond AVANT la phase d'achat v2 (= c'est ce
    // qu'on veut mesurer, cf. spec §1.3.0 : « <10 % de tours-IA avec solde == 30 »).
    if (active === 1) {
      stats.toursIA++;
      if (state.ecus[1] === PLAFOND_ECUS) stats.toursPlafond++;
    }

    // Décision.
    let tour = null;
    const t0 = performance.now();
    try {
      if (active === 1) {
        tour = iaDecideTour(state);
      } else {
        const decision = randomMove(state, active);
        tour = decision ? { achats: [], mouvement: decision } : { achats: [], mouvement: null };
      }
    } catch (e) {
      stats.iaError = String(e && e.message || e);
      stats.reason = `IA error at halfMove ${stats.halfMoves}`;
      console.warn(`[game ${gameIdx}] ${stats.reason}: ${stats.iaError}`);
      return stats;
    }
    if (active === 1) {
      const dt = performance.now() - t0;
      if (dt > stats.maxDecisionMs) stats.maxDecisionMs = dt;
    }

    // Application des achats (un par un, comme main.js).
    if (tour && tour.achats) {
      for (const a of tour.achats) {
        try {
          applyPurchase(a.target, a.upgradeId, state);
          if (active === 1) stats.achats++;
        } catch (e) {
          // Ne devrait pas arriver : decideAchats valide. Mais garde-fou.
          console.warn(`[game ${gameIdx}] achat refusé hm ${stats.halfMoves}: ${e.message}`);
        }
      }
    }

    // Application du mouvement.
    if (tour && tour.mouvement) {
      const r = applyMoveFromPiece(tour.mouvement.piece, tour.mouvement.move, state);
      if (r.ended) {
        stats.winner = r.winner;
        stats.reason = 'king_captured';
        break;
      }
      noCaptureStreak = r.capturedType ? 0 : (noCaptureStreak + 1);
    } else {
      // Aucun coup légal → on « passe » le tour (pas de mat dans cette version).
      noCaptureStreak++;
    }

    // Fin de tour : switch + décrément des cooldowns du nouveau joueur.
    state.turn = 1 - state.turn;
    decrementCooldowns(state, state.turn);

    if (noCaptureStreak >= NO_CAPTURE_DRAW_AT) {
      stats.reason = '50-move-rule';
      break;
    }
  }

  if (stats.reason === 'unknown' && stats.halfMoves >= HARD_CAP_HALF_MOVES) {
    stats.reason = 'cap';
  }

  return stats;
}

function median(arr) {
  if (!arr.length) return 0;
  const s = [...arr].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

function main() {
  console.log(`\n=== test-ai-metriques — spec-ia v2 (game/src/ai.js) ===`);
  console.log(`N=${N} parties | J1 random (difficulty 1) vs J2 Avancé (difficulty 3)`);
  console.log(`Cibles : ≥5 achats/partie Avancé ; <10% tours-IA au plafond 30 (spec §1.3.0)`);
  console.log('');

  const results = [];
  const t0Total = performance.now();
  for (let i = 0; i < N; i++) {
    const s = playOneGame(i);
    results.push(s);
    const pctP = s.toursIA ? ((s.toursPlafond / s.toursIA) * 100).toFixed(1) : '–';
    console.log(
      `  game ${String(i + 1).padStart(2)}/${N}` +
      `  J2 wins=${s.winner === 1 ? 'O' : (s.winner === 0 ? 'X' : '?')}` +
      `  ach=${String(s.achats).padStart(2)}` +
      `  tIA=${String(s.toursIA).padStart(3)}` +
      `  plaf=${String(s.toursPlafond).padStart(2)} (${pctP}%)` +
      `  hm=${String(s.halfMoves).padStart(3)}` +
      `  reason=${s.reason}` +
      `  maxD=${s.maxDecisionMs.toFixed(0)}ms`
    );
  }
  const elapsed = performance.now() - t0Total;

  // Agrégats.
  const achats = results.map((s) => s.achats);
  const pctPl = results.map((s) => (s.toursIA ? s.toursPlafond / s.toursIA : 0));
  const toursIA = results.map((s) => s.toursIA);
  const maxD = results.map((s) => s.maxDecisionMs);
  const avgAch = achats.reduce((a, b) => a + b, 0) / N;
  const medAch = median(achats);
  const avgPI = pctPl.reduce((a, b) => a + b, 0) / N;
  const avgToursIA = toursIA.reduce((a, b) => a + b, 0) / N;
  const avgMaxD = maxD.reduce((a, b) => a + b, 0) / N;

  const reasons = {};
  for (const s of results) reasons[s.reason] = (reasons[s.reason] || 0) + 1;
  const errs = results.filter((s) => s.iaError).length;
  const winsJ2 = results.filter((s) => s.winner === 1).length;
  const winsJ1 = results.filter((s) => s.winner === 0).length;
  const draws = results.filter((s) => s.winner === null).length;

  console.log('\n=== AGGREGATS ===');
  console.log(`Durée totale          : ${elapsed.toFixed(0)}ms (≈ ${(elapsed / N).toFixed(0)}ms/partie)`);
  console.log(`Achats moyen/médiane  : ${avgAch.toFixed(2)} / ${medAch.toFixed(1)}  (min=${Math.min(...achats)} max=${Math.max(...achats)})`);
  console.log(`Tours-IA moyen        : ${avgToursIA.toFixed(1)}`);
  console.log(`% plafond moyen       : ${(avgPI * 100).toFixed(1)}%`);
  console.log(`Décision max moyenne  : ${avgMaxD.toFixed(0)}ms (cap sur ${Math.max(...maxD).toFixed(0)}ms)`);
  console.log(`Issues de fins        : ${JSON.stringify(reasons)}`);
  console.log(`Score J2:J1:nulle     : ${winsJ2} : ${winsJ1} : ${draws}`);
  console.log(`Erreurs IA            : ${errs}`);

  // Seuils spec-ia v2 §1.3.0.
  const seuilAch = avgAch >= 5;
  const seuilPlaf = (avgPI * 100) < 10;
  console.log('');
  console.log(`✓ ≥5 achats/partie (spec §1.3.0)         : ${seuilAch ? '✅ PASS' : '❌ FAIL'} (avg=${avgAch.toFixed(2)})`);
  console.log(`✓ <10% tours au plafond 30 (spec §1.3.0) : ${seuilPlaf ? '✅ PASS' : '❌ FAIL'} (avg=${(avgPI * 100).toFixed(1)}%)`);
  console.log(`✓ 0 erreur IA             (regression)    : ${errs === 0 ? '✅ PASS' : '❌ FAIL'} (count=${errs})`);
  console.log('');
}

main();
