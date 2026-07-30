// tests/ai-dimensions.test.mjs — Locks invariants dimension runtime (Phase A.0–A.4).
//
// Run via : `node --test tests/ai-dimensions.test.mjs`
// (depuis /Users/simon/Desktop/roychec-jeu)
//
// Contexte : 4 ship-blockers cette session
//   - P0fix2 (v5.0a)     : OX/OY/CELL import manquant dans board.js     → ReferenceError
//   - P0fix3 (?v=132)    : canvas.width dynamique 1180→1670 en 15×8      → panneau coupé
//   - P0fix4 (?v=133)    : 7 fillRect full-canvas utilisaient CANVAS_W    → fond coupé
//   - Phase A.4 (?v=136) : heuristique IA r<8/c<8 migré vers getters     → IA full-dim
//
// Ce fichier lock chaque dimension runtime via node:test built-in (no deps).

import { test, describe, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

import {
  setBoardSize,
  getBoardSize,
  getBoardW,
  getBoardH,
  getCanvasW,
  getPanelX,
  inB,
  creerPlateau,
} from '../game/src/board.js';

// Path to ai.js : permet le test de régression #10 (Phase A.4 migration lock).
// Lit le contenu brut via import.meta.url pour portabilité cross-platform.
const AI_JS_PATH = new URL('../game/src/ai.js', import.meta.url);
const readAiJs = () => fs.readFileSync(AI_JS_PATH, 'utf-8');

describe('board dimension runtime invariants (Phase A.4 lock)', () => {
  // Each test resets to 8x8 default after running to prevent state bleed.
  afterEach(() => setBoardSize(8, 8));

  // ─────────────────────────────────────────────────────────────────────────
  // Invariant 1 — default dimensions after module load
  // ─────────────────────────────────────────────────────────────────────────
  test('(1) default _BOARD_W = 8 at module load time', () => {
    assert.equal(getBoardW(), 8, 'board width default should be 8');
    assert.equal(getBoardH(), 8, 'board height default should be 8');
    assert.deepEqual(getBoardSize(), { w: 8, h: 8 }, 'getBoardSize returns {w:8,h:8} at import');
  });

  // ─────────────────────────────────────────────────────────────────────────
  // Invariant 2 — setBoardSize mutator round-trip
  // ─────────────────────────────────────────────────────────────────────────
  test('(2) setBoardSize(15, 8) → getBoardW()=15', () => {
    setBoardSize(15, 8);
    assert.equal(getBoardW(), 15, 'board width changed to 15');
    assert.equal(getBoardH(), 8, 'board height unchanged');
    assert.deepEqual(getBoardSize(), { w: 15, h: 8 }, 'getBoardSize returns new dimensions');
  });

  test('(2b) setBoardSize round-trip : 8 → 15 → 8 returns to default', () => {
    setBoardSize(15, 8);
    assert.equal(getBoardW(), 15);
    setBoardSize(8, 8);
    assert.equal(getBoardW(), 8, 'round-trip back to default 8');
  });

  // ─────────────────────────────────────────────────────────────────────────
  // Invariant 3 — getCanvasW() live : 1180 (8×8) / 1670 (15×8)
  // ─────────────────────────────────────────────────────────────────────────
  test('(3) getCanvasW() returns 1180 (8x8) / 1670 (15x8)', () => {
    const CANVAS_W_8 = 1180;   // OX=20 + CELL=70 * 8 + 30 + CANVAS_PANEL_W=554 + 16
    const CANVAS_W_15 = 1670;  // OX=20 + CELL=70 * 15 + 30 + 554 + 16
    setBoardSize(8, 8);
    assert.equal(getCanvasW(), CANVAS_W_8, 'canvas should be 1180 in 8x8 default');
    setBoardSize(15, 8);
    assert.equal(getCanvasW(), CANVAS_W_15, 'canvas should be 1670 in 15x8 (panel fits entirely)');
  });

  // ─────────────────────────────────────────────────────────────────────────
  // Invariant 4 — heuristic loop visit count : 64 (8×8) / 120 (15×8)
  // ─────────────────────────────────────────────────────────────────────────
  test('(4) heuristic loop visit count = 64 cells (8x8) / 120 (15x8)', () => {
    // Mirror exact pattern used in ai.js allMoves() and evalPosition().
    setBoardSize(8, 8);
    let count8 = 0;
    for (let r = 0; r < getBoardH(); r++) {
      for (let c = 0; c < getBoardW(); c++) {
        count8++;
      }
    }
    assert.equal(count8, 64, '8x8 heuristic visits 64 cells (8 rows × 8 cols)');
    assert.equal(getBoardW() * getBoardH(), 64);

    setBoardSize(15, 8);
    let count15 = 0;
    for (let r = 0; r < getBoardH(); r++) {
      for (let c = 0; c < getBoardW(); c++) {
        count15++;
      }
    }
    assert.equal(count15, 120, '15x8 heuristic visits 120 cells (8 rows × 15 cols, migrated Phase A.4)');
    assert.equal(getBoardW() * getBoardH(), 120);
  });

  test('(4b) heuristic scan on real board (creerPlateau)', () => {
    // Both 8x8 and 15x8 sparse placement have 32 pieces (16 per side).
    setBoardSize(8, 8);
    const board8 = creerPlateau();
    let occupied8 = 0;
    for (let r = 0; r < getBoardH(); r++) {
      for (let c = 0; c < getBoardW(); c++) {
        if (board8[r][c] != null) occupied8++;
      }
    }
    assert.equal(occupied8, 32, '8x8 board starts with 32 pieces (R+N+B+Q+K+B+N+R + 8 pawns × 2 sides)');

    setBoardSize(15, 8);
    const board15 = creerPlateau();
    let occupied15 = 0;
    for (let r = 0; r < getBoardH(); r++) {
      for (let c = 0; c < getBoardW(); c++) {
        if (board15[r][c] != null) occupied15++;
      }
    }
    assert.equal(occupied15, 32, '15x8 sparse board starts with 32 pieces (same total, sparse placement on even cols)');
  });

  // ─────────────────────────────────────────────────────────────────────────
  // Invariant 5 — inB(r, c) boundary correctness
  // ─────────────────────────────────────────────────────────────────────────
  test('(5) inB(r, c) boundaries correct (8x8 + 15x8)', () => {
    setBoardSize(8, 8);
    assert.equal(inB(0, 0), true, 'top-left corner inside');
    assert.equal(inB(7, 7), true, 'bottom-right inside');
    assert.equal(inB(7, 8), false, 'col 8 out of bounds');
    assert.equal(inB(8, 0), false, 'row 8 out of bounds');
    assert.equal(inB(-1, 0), false, 'negative row');
    assert.equal(inB(0, -1), false, 'negative col');
    assert.equal(inB(3, 5), true, 'mid-board valid');

    setBoardSize(15, 8);
    assert.equal(inB(0, 0), true, '15x8 top-left inside');
    assert.equal(inB(7, 14), true, '15x8 bottom-right inside (col 14 < 15)');
    assert.equal(inB(7, 15), false, '15x8 col 15 out of bounds');
    assert.equal(inB(0, 15), false, '15x8 row 0 col 15 out of bounds');
    assert.equal(inB(8, 0), false, '15x8 row 8 out of bounds (board height still 8)');
  });

  // ─────────────────────────────────────────────────────────────────────────
  // Invariant 6 — getPanelX() = 610 (8×8) / 1100 (15×8)
  // ─────────────────────────────────────────────────────────────────────────
  test('(6) getPanelX() = 610 (8x8) / 1100 (15x8)', () => {
    const PANEL_X_8 = 610;   // OX=20 + 70*8 + 30
    const PANEL_X_15 = 1100; // OX=20 + 70*15 + 30
    setBoardSize(8, 8);
    assert.equal(getPanelX(), PANEL_X_8, 'panel starts at x=610 in 8x8');
    setBoardSize(15, 8);
    assert.equal(getPanelX(), PANEL_X_15, 'panel starts at x=1100 in 15x8');
  });

  // ─────────────────────────────────────────────────────────────────────────
  // Extra — setBoardSize validation (uses lowercase 'dimensions' + 'setBoardSize:' prefix)
  // ─────────────────────────────────────────────────────────────────────────
  test('setBoardSize rejects invalid dimensions', () => {
    // board.js throws : `setBoardSize: dimensions invalides (w=${w}, h=${h})`
    assert.throws(() => setBoardSize(3, 8), /setBoardSize: dimensions invalides/, 'min width 4 enforced');
    assert.throws(() => setBoardSize(8, 3), /setBoardSize: dimensions invalides/, 'min height 4 enforced');
    assert.throws(() => setBoardSize(8.5, 8), /setBoardSize: dimensions invalides/, 'integer-only');
    assert.throws(() => setBoardSize(NaN, 8), /setBoardSize: dimensions invalides/, 'NaN rejected');
  });

  // ─────────────────────────────────────────────────────────────────────────
  // SHIP-LOCKER — phase A.4 migration regression test (no float drift)
  // ─────────────────────────────────────────────────────────────────────────
  test('TOTAL cells ratio = 15/8 via integer cross-multiplication (no float drift)', () => {
    setBoardSize(8, 8);
    const total8 = getBoardW() * getBoardH();
    setBoardSize(15, 8);
    const total15 = getBoardW() * getBoardH();
    // Both sides must equal exactly — equivalent to `total15 / total8 === 15 / 8`
    // but using integer arithmetic to avoid floating-point precision drift.
    assert.equal(total8 * 15, total15 * 8, 'ratio preserved via integer cross-multiply');
  });

  // ─────────────────────────────────────────────────────────────────────────
  // REGRESSION LOCK — Phase A.4 ai.js migration
  // Reads game/src/ai.js directly via fs + import.meta.url, asserts every loop
  // bound uses getBoardW()/getBoardH() (not hardcoded r<8/c<8/nr<8/nc<8).
  // Catches the actual AI regression that the other helper-based tests cannot.
  // ─────────────────────────────────────────────────────────────────────────
  test('(REGRESSION LOCK) ai.js has 0 hardcoded r<8/c<8/nr<8/nc<8 literals', () => {
    const content = readAiJs();
    const r8 = (content.match(/\br\s*<\s*8\b/g) || []).length;
    const c8 = (content.match(/\bc\s*<\s*8\b/g) || []).length;
    const nr8 = (content.match(/\bnr\s*<\s*8\b/g) || []).length;
    const nc8 = (content.match(/\bnc\s*<\s*8\b/g) || []).length;
    assert.equal(r8, 0, `ai.js has ${r8} hardcoded 'r < 8' literal(s) — Phase A.4 migration reverted?`);
    assert.equal(c8, 0, `ai.js has ${c8} hardcoded 'c < 8' literal(s)`);
    assert.equal(nr8, 0, `ai.js has ${nr8} hardcoded 'nr < 8' literal(s) (boundary check)`);
    assert.equal(nc8, 0, `ai.js has ${nc8} hardcoded 'nc < 8' literal(s) (boundary check)`);
  });
});
