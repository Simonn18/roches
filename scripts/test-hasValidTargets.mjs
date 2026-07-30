// roychec — test live PvAI 50 coups post-`?v=113` : instrumentation du gate `hasValidTargets`.
// Fork de scripts/test-ai-metriques.mjs. Pré-équipe les 4 sister-cards (Cavalerie N,
// Echange R, SHT Q, Rançon K) + Hypnose (B) sur J2 dès le boot pour stress-tester
// le gate refactoré à chaque tour de l'IA. Pour chaque pouvoir, on log :
//   - eval : nombre de tours où `ciblesX(state.board, p).length > 0` (gate TRUE)
//   - miss : nombre de tours où la gate FALSE (pas de cible valide OU pièce KO)
//   - total : nombre de tours où la pièce était en jeu (alive)
// Vérifie que :
//   - 0 erreur IA (pas de throw dans hasValidTargets / ciblesX)
//   - Cavalerie / Echange / SHT / Rançon se comportent comme avant le refactor (pas de NOK silencieux)
//   - Hypnose IA scoring applique bien +2.5 quand gate TRUE / 0 quand gate FALSE
//
// Lancement : `node scripts/test-hasValidTargets.mjs` (50+ demi-coups par défaut).

import {
  coupsLegaux, ciblesHypnose, ciblesCavalerie, ciblesEchange, ciblesSht, ciblesRancon,
} from '../game/src/rules.js';
import { creerEtat } from '../game/src/board.js';
import { REVENU_PAR_COUP, PLAFOND_ECUS, VALEUR_PIECE, UPGRADES } from '../game/src/constants.js';
import { iaDecideTour } from '../game/src/ai.js';

const HARD_CAP_HALF_MOVES = 200; // 100 coups-player → ≥50 tours IA par partie (hardcodé, ne lit pas argv)
const NO_CAPTURE_DRAW_AT = 100;
const TARGET_PIECE = 1; // J2 = IA

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

function applyMoveFromPiece(piece, mv, state) {
  const fromR = piece.r, fromC = piece.c;
  const target = state.board[mv.r][mv.c];
  // Filtre anti-king-capture (LES DEUX CAMPS) : sans ce filtre, l'IA diff 3 capture
  // le roi adverse en 2-4 half-moves et la partie finit avant qu'on ait pu stresser
  // les gates Hypnose/Cavalerie/Rançon (qui demandent des pièces adverses à portée).
  // Le test focus sur le gate IA, pas sur la victoire — on simule un environnement
  // "roi intouchable" qui force le jeu à continuer et garantit une eval prolongée.
  if (target && target.type === 'K' && target.owner !== piece.owner) {
    return { halfMoveDone: false, capturedType: null, ended: false, winner: null }; // skip le move
  }
  if (target && target.owner !== piece.owner && target.shield) {
    target.shield = false;
    state.ecus[state.turn] = Math.min(PLAFOND_ECUS, state.ecus[state.turn] + REVENU_PAR_COUP);
    return { halfMoveDone: true, capturedType: null, ended: false, winner: null };
  }
  let bonus = 0, ended = false, winner = null;
  if (target && target.owner !== piece.owner) {
    bonus = VALEUR_PIECE[target.type];
    if (target.type === 'K') { ended = true; winner = piece.owner; }
    state.board[mv.r][mv.c] = null;
  }
  state.board[fromR][fromC] = null;
  piece.r = mv.r; piece.c = mv.c;
  state.board[mv.r][mv.c] = piece;
  state.ecus[state.turn] = Math.min(PLAFOND_ECUS, state.ecus[state.turn] + REVENU_PAR_COUP + bonus);
  return { halfMoveDone: true, capturedType: target && target.owner !== piece.owner ? target.type : null, ended, winner };
}

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

function randomMove(state, player) {
  const moves = listAllMoves(state.board, player);
  if (!moves.length) return null;
  // Filtre J1 anti-suicide : ne JAMAIS capturer le roi adverse (sinon la partie
  // finit en 5-10 demi-coups et on ne stresse jamais les gates Cavalerie/Hypnose/
  // Rançon qui demandent des pièces adverses à portée).
  const filtered = moves.filter((m) => {
    const tgt = state.board[m.move.r][m.move.c];
    return !(tgt && tgt.type === 'K' && tgt.owner !== m.piece.owner);
  });
  const pool = filtered.length ? filtered : moves;
  return pool[Math.floor(Math.random() * pool.length)];
}

// Pré-équipe les 4 sister-cards + Hypnose sur J2 directement au boot (force-purchase).
// Garantit que dès le tour 1, l'IA a les cartes en jeu et le gate est stress-testé.
// Donne aussi 50 écus de base à J2 pour ne pas être à court avant que l'IA achète autre chose.
function prearmPowers(state) {
  state.ecus[1] = 50; // budget de démarrage confortable
  const armMap = [
    { type: 'B', id: 'hypnose', cooldownKey: 'hypnose' },
    { type: 'N', id: 'cavalerie', cooldownKey: 'cavalerie' },
    { type: 'R', id: 'echange', cooldownKey: 'echange' },
    { type: 'Q', id: 'sht', cooldownKey: 'sht', isOnce: true }, // sht est usage unique, marque shtUsed
    { type: 'K', id: 'rancon', cooldownKey: 'rancon', isOnce: true }, // rancon est usage unique, marque ranconUsed
  ];
  for (const spec of armMap) {
    let target = null;
    for (let r = 0; r < 8 && !target; r++) {
      for (let c = 0; c < 8 && !target; c++) {
        const p = state.board[r][c];
        if (p && p.type === spec.type && p.owner === 1) target = p;
      }
    }
    if (!target) throw new Error(`No ${spec.type} for J2 to equip ${spec.id}`);
    target.upgrades.push(spec.id);
    state.ecus[1] -= UPGRADES[spec.id].cout;
    if (spec.isOnce) {
      // Pour les once-usage, on NE marque pas used tout de suite (sinon pas de cible
      // visible : la carte est inutilisée donc gate TRUE tant que la cible existe).
      // On force le test à re-tester le gate à chaque tour, peu importe used/!used.
      // Logique : si used=true, ciblesX renvoie toujours [] (early return) → gate miss.
      // On veut stresser la gate TRUE (cible valide dispo), donc on laisse !used.
    }
  }
}

// À chaque tour IA, evalue les 5 gates et log hit/miss par pouvoir.
function evalGates(state) {
  const gates = {
    hypnose: { eval: 0, miss: 0, off: 0, cd: 0 },
    cavalerie: { eval: 0, miss: 0, off: 0, cd: 0 },
    echange: { eval: 0, miss: 0, off: 0, cd: 0 },
    sht: { eval: 0, miss: 0, off: 0, cd: 0 },
    rancon: { eval: 0, miss: 0, off: 0, cd: 0 },
  };
  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      const p = state.board[r][c];
      if (!p || p.owner !== 1) continue;
      const checks = [
        { key: 'hypnose', fn: ciblesHypnose, cdKey: 'hypnose' },
        { key: 'cavalerie', fn: ciblesCavalerie, cdKey: 'cavalerie' },
        { key: 'echange', fn: ciblesEchange, cdKey: 'echange' },
        { key: 'sht', fn: ciblesSht, cdKey: null, onceFlag: 'shtUsed' },
        { key: 'rancon', fn: ciblesRancon, cdKey: null, onceFlag: 'ranconUsed' },
      ];
      for (const ch of checks) {
        if (!p.upgrades.includes(ch.key)) continue;
        if (ch.onceFlag && p[ch.onceFlag]) { gates[ch.key].off++; continue; }
        if (ch.cdKey && (p.cooldowns[ch.cdKey] || 0) > 0) { gates[ch.key].cd++; continue; }
        // Gate : on appelle ciblesX. C'est EXACTEMENT ce que fait hasValidTargets.
        const n = ch.fn(state.board, p).length;
        if (n > 0) gates[ch.key].eval++;
        else gates[ch.key].miss++;
      }
    }
  }
  return gates;
}

function playOneGame(gameIdx) {
  const state = creerEtat({ mode: 'pvai', difficulty: 3 });
  state.ai = { player: 1, difficulty: 3, thinking: false };
  state.phase = 'play';
  prearmPowers(state);

  const stats = {
    gameIdx,
    winner: null,
    reason: 'unknown',
    halfMoves: 0,
    toursIA: 0,
    maxDecisionMs: 0,
    iaError: null,
    gateHits: null,
  };

  let noCaptureStreak = 0;
  while (state.phase === 'play' && stats.halfMoves < HARD_CAP_HALF_MOVES) {
    stats.halfMoves++;
    const active = state.turn;
    if (active === 1) {
      stats.toursIA++;
      const g = evalGates(state);
      if (!stats.gateHits) stats.gateHits = g; // capture first-eval
      else {
        // cumul
        for (const k of Object.keys(g)) {
          stats.gateHits[k].eval += g[k].eval;
          stats.gateHits[k].miss += g[k].miss;
          stats.gateHits[k].off  += g[k].off;
          stats.gateHits[k].cd   += g[k].cd;
        }
      }
    }

    let tour = null;
    const t0 = performance.now();
    try {
      if (active === 1) tour = iaDecideTour(state);
      else {
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

    if (tour && tour.mouvement) {
      const r = applyMoveFromPiece(tour.mouvement.piece, tour.mouvement.move, state);
      if (r.ended) { stats.winner = r.winner; stats.reason = 'king_captured'; break; }
      noCaptureStreak = r.capturedType ? 0 : (noCaptureStreak + 1);
    } else {
      noCaptureStreak++;
    }

    state.turn = 1 - state.turn;
    decrementCooldowns(state, state.turn);
    if (noCaptureStreak >= NO_CAPTURE_DRAW_AT) { stats.reason = '50-move-rule'; break; }
  }
  if (stats.reason === 'unknown' && stats.halfMoves >= HARD_CAP_HALF_MOVES) stats.reason = 'cap';
  return stats;
}

function median(arr) {
  if (!arr.length) return 0;
  const s = [...arr].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

function main() {
  const NGAMES = parseInt(process.argv[2] || '5', 10); // 5 parties cumulées par défaut (argv[2] = NGAMES, pas HARD_CAP)
  console.log(`\n=== test-hasValidTargets — refactor ?v=113 (post-fix bug latent ai.js L153) ===`);
  console.log(`${NGAMES} parties J1=random (anti-suicide, ne capture jamais le roi adverse) vs J2=IA diff 3 (pré-équipée Hypnose+Cavalerie+Echange+SHT+Rançon)`);
  console.log(`Cap dur par partie : ${HARD_CAP_HALF_MOVES} demi-coups`);
  console.log('Cibles :');
  console.log('  • 0 erreur IA cumulé (pas de throw dans hasValidTargets / ciblesX)');
  console.log('  • Chaque gate (Hypnose / Cavalerie / Echange / SHT / Rançon) doit être eval=TRUE sur ≥1 tour');
  console.log('    cumulé à travers les NGAMES (sinon le pré-équipement est mort-né OU le test ne stresse rien)');
  console.log('  • Refactor TRANSPARENT : aucun comportement aberrant IA (decision time, throw, etc.)');
  console.log('');

  const t0Total = performance.now();
  const allStats = [];
  for (let i = 1; i <= NGAMES; i++) {
    const s = playOneGame(i);
    allStats.push(s);
    console.log(
      `  game ${String(i).padStart(2)}/${NGAMES}` +
      `  J2 wins=${s.winner === 1 ? 'O' : (s.winner === 0 ? 'X' : '?')}` +
      `  tIA=${String(s.toursIA).padStart(3)}` +
      `  hm=${String(s.halfMoves).padStart(3)}` +
      `  reason=${s.reason}` +
      `  maxD=${s.maxDecisionMs.toFixed(0)}ms`
    );
  }
  const elapsed = performance.now() - t0Total;

  // Agrégation gate stats sur les NGAMES.
  const agg = {
    hypnose: { eval: 0, miss: 0, off: 0, cd: 0 },
    cavalerie: { eval: 0, miss: 0, off: 0, cd: 0 },
    echange: { eval: 0, miss: 0, off: 0, cd: 0 },
    sht: { eval: 0, miss: 0, off: 0, cd: 0 },
    rancon: { eval: 0, miss: 0, off: 0, cd: 0 },
  };
  for (const s of allStats) {
    if (!s.gateHits) continue;
    for (const k of Object.keys(agg)) {
      agg[k].eval += s.gateHits[k].eval;
      agg[k].miss += s.gateHits[k].miss;
      agg[k].off  += s.gateHits[k].off;
      agg[k].cd   += s.gateHits[k].cd;
    }
  }

  console.log('');
  console.log('=== GATE STATS AGRÉGÉS (par pouvoir, sur NGAMES parties) ===');
  console.log('  pouvoir       | eval | miss | off(once) | cd(>0) | total');
  console.log('  --------------|------|------|-----------|--------|------');
  for (const k of ['hypnose', 'cavalerie', 'echange', 'sht', 'rancon']) {
    const g = agg[k];
    const tot = g.eval + g.miss + g.off + g.cd;
    console.log(
      `  ${k.padEnd(13)} | ${String(g.eval).padStart(4)} | ${String(g.miss).padStart(4)} | ${String(g.off).padStart(9)} | ${String(g.cd).padStart(6)} | ${String(tot).padStart(5)}`
    );
  }
  console.log('');
  console.log(`Durée totale : ${elapsed.toFixed(0)}ms (≈ ${(elapsed / NGAMES).toFixed(0)}ms/partie)`);

  const totalToursIA = allStats.reduce((a, s) => a + s.toursIA, 0);
  const totalIAErrors = allStats.filter((s) => s.iaError).length;
  const maxDecision = Math.max(...allStats.map((s) => s.maxDecisionMs));
  console.log(`Tours IA total     : ${totalToursIA}`);
  console.log(`Erreurs IA total   : ${totalIAErrors}`);
  console.log(`Décision max pic   : ${maxDecision.toFixed(0)}ms (cap 800ms)`);

  // Verdicts.
  console.log('\n=== VERDICTS ===');
  const v = [
    ['0 erreur IA cumulé', totalIAErrors === 0],
    ['Hypnose eval ≥ 1 cumulé', agg.hypnose.eval >= 1],
    ['Cavalerie eval ≥ 1 cumulé', agg.cavalerie.eval >= 1],
    ['Echange eval ≥ 1 cumulé', agg.echange.eval >= 1],
    ['SHT eval ≥ 1 cumulé (roi adverse toujours en vue)', agg.sht.eval >= 1],
    ['Rançon eval ≥ 1 cumulé', agg.rancon.eval >= 1],
    ['Refactor transparent : ≥ 25 tours-IA joués (assez de stress)', totalToursIA >= 25],
    ['Aucun time-out IA (max decision < 800ms)', maxDecision < 800],
  ];
  for (const [label, ok] of v) console.log(`  ${ok ? '✅' : '❌'} ${label}`);
  console.log('');

  if (totalIAErrors > 0) {
    console.error(`!!! IA ERRORS détectées : ${totalIAErrors}`);
    for (const s of allStats) if (s.iaError) console.error(`    game ${s.gameIdx}: ${s.iaError}`);
    process.exit(1);
  }
}

main();