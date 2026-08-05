// tests/ai-dimensions.test.mjs — invariants des dimensions runtime (Phase A.0–A.5).
//
// Le moteur actuel résout les dimensions depuis tailles.js :
//   - std   = 8 × 8
//   - l15   = 8 × 15
// Les dimensions ne sont plus modifiées globalement avec setBoardSize(). Chaque
// partie choisit sa taille via creerPlateau(taille), ce qui évite un état global
// partagé entre deux parties ou entre les tests.

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

import {
  creerPlateau,
  inB,
} from '../game/src/board.js';
import {
  DEFAULT_TAILLE,
  getBoardW,
  getBoardH,
} from '../game/src/tailles.js';

const AI_JS_PATH = new URL('../game/src/ai.js', import.meta.url);
const readAiJs = () => fs.readFileSync(AI_JS_PATH, 'utf-8');

describe('board dimension runtime invariants', () => {
  test('(1) la taille standard est un plateau 8×8', () => {
    assert.equal(DEFAULT_TAILLE, 'std');
    assert.equal(getBoardW('std'), 8);
    assert.equal(getBoardH('std'), 8);

    const board = creerPlateau('std');
    assert.equal(board.length, 8);
    assert.equal(board[0].length, 8);
    assert.equal(board.rows, 8);
    assert.equal(board.cols, 8);
  });

  test('(2) l15 est un plateau 8×15', () => {
    assert.equal(getBoardW('l15'), 15);
    assert.equal(getBoardH('l15'), 8);

    const board = creerPlateau('l15');
    assert.equal(board.length, 8);
    assert.equal(board[0].length, 15);
    assert.equal(board.rows, 8);
    assert.equal(board.cols, 15);
  });

  test('(3) un identifiant de taille inconnu revient à la taille standard', () => {
    assert.equal(getBoardW('inconnue'), 8);
    assert.equal(getBoardH('inconnue'), 8);
    const board = creerPlateau('inconnue');
    assert.equal(board.length, 8);
    assert.equal(board[0].length, 8);
  });

  test('(4) le scan des cases couvre 64 cases en std et 120 en l15', () => {
    const board8 = creerPlateau('std');
    let count8 = 0;
    for (let r = 0; r < getBoardH('std'); r++) {
      for (let c = 0; c < getBoardW('std'); c++) count8++;
    }
    assert.equal(count8, 64);
    assert.equal(board8.length * board8[0].length, 64);

    const board15 = creerPlateau('l15');
    let count15 = 0;
    for (let r = 0; r < getBoardH('l15'); r++) {
      for (let c = 0; c < getBoardW('l15'); c++) count15++;
    }
    assert.equal(count15, 120);
    assert.equal(board15.length * board15[0].length, 120);
  });

  test('(5) les deux tailles commencent avec 32 pièces', () => {
    for (const taille of ['std', 'l15']) {
      const board = creerPlateau(taille);
      let occupied = 0;
      for (const row of board) {
        for (const piece of row) if (piece) occupied++;
      }
      assert.equal(occupied, 32, `${taille} doit commencer avec 32 pièces`);
    }
  });

  test('(6) inB respecte les limites du plateau standard', () => {
    const board = creerPlateau('std');
    assert.equal(inB(board, 0, 0), true);
    assert.equal(inB(board, 7, 7), true);
    assert.equal(inB(board, 7, 8), false);
    assert.equal(inB(board, 8, 0), false);
    assert.equal(inB(board, -1, 0), false);
    assert.equal(inB(board, 0, -1), false);
    assert.equal(inB(board, 3, 5), true);
  });

  test('(7) inB respecte les 15 colonnes du plateau l15', () => {
    const board = creerPlateau('l15');
    assert.equal(inB(board, 0, 0), true);
    assert.equal(inB(board, 7, 14), true);
    assert.equal(inB(board, 7, 15), false);
    assert.equal(inB(board, 8, 0), false);
    assert.equal(inB(board, 0, -1), false);
  });

  test('(8) ai.js utilise les bornes runtime et aucun littéral r/c < 8', () => {
    const content = readAiJs();
    const r8 = (content.match(/\br\s*<\s*8\b/g) || []).length;
    const c8 = (content.match(/\bc\s*<\s*8\b/g) || []).length;
    const nr8 = (content.match(/\bnr\s*<\s*8\b/g) || []).length;
    const nc8 = (content.match(/\bnc\s*<\s*8\b/g) || []).length;

    assert.equal(r8, 0);
    assert.equal(c8, 0);
    assert.equal(nr8, 0);
    assert.equal(nc8, 0);
    assert.match(content, /r\s*<\s*board\.length/);
    assert.match(content, /c\s*<\s*board\[0\]\.length/);
  });
});
