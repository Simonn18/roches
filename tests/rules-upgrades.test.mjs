// tests/rules-upgrades.test.mjs — règles des quatre améliorations ajoutées aux cases bonus.
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';

import { creerPiece } from '../game/src/board.js?v=109';
import { coupsLegaux, zonesInterdites } from '../game/src/rules.js?v=116';

function plateauVide(rows = 8, cols = 8) {
  return Array.from({ length: rows }, () => Array(cols).fill(null));
}

function placer(board, type, owner, r, c, upgrades = []) {
  const piece = creerPiece(type, owner, r, c);
  piece.upgrades = [...upgrades];
  board[r][c] = piece;
  return piece;
}

function contient(moves, r, c, predicate = () => true) {
  return moves.some((move) => move.r === r && move.c === c && predicate(move));
}

describe('Améliorations des cases bonus — règles utilisables', () => {
  test('Pas diagonal avance en diagonale sans capturer', () => {
    const board = plateauVide();
    const pawn = placer(board, 'P', 0, 4, 3, ['pas-diag']);
    const moves = coupsLegaux(board, pawn);

    assert.equal(contient(moves, 3, 2, (move) => move.pasDiag && !move.capture), true);
    assert.equal(contient(moves, 3, 4, (move) => move.pasDiag && !move.capture), true);

    const occupied = plateauVide();
    const blockedPawn = placer(occupied, 'P', 0, 4, 3, ['pas-diag']);
    placer(occupied, 'P', 1, 3, 2);
    const blockedMoves = coupsLegaux(occupied, blockedPawn);
    assert.equal(contient(blockedMoves, 3, 2, (move) => move.pasDiag), false);
    assert.equal(contient(blockedMoves, 3, 2, (move) => move.capture), true);
  });

  test('Grand saut propose les bonds 3×1 et 3×2, sans capture', () => {
    const board = plateauVide();
    const knight = placer(board, 'N', 0, 4, 3, ['grand-saut']);
    const moves = coupsLegaux(board, knight);

    assert.equal(contient(moves, 1, 4, (move) => move.grandSaut && !move.capture), true);
    assert.equal(contient(moves, 1, 5, (move) => move.grandSaut && !move.capture), true);

    board[2][4] = creerPiece('P', 1, 2, 4);
    const blockedMoves = coupsLegaux(board, knight);
    assert.equal(contient(blockedMoves, 1, 4, (move) => move.grandSaut), false);

    board[2][4] = null;
    board[3][5] = creerPiece('P', 1, 3, 5);
    const blockedLongMoves = coupsLegaux(board, knight);
    assert.equal(contient(blockedLongMoves, 1, 5, (move) => move.grandSaut), false);
  });

  test('Haute fuite bondit de trois cases en ligne libre et ne capture pas', () => {
    const board = plateauVide();
    const king = placer(board, 'K', 0, 4, 3, ['haute-fuite']);
    const moves = coupsLegaux(board, king);

    assert.equal(contient(moves, 1, 3, (move) => move.hauteFuite && !move.capture), true);
    assert.equal(contient(moves, 1, 0, (move) => move.hauteFuite && !move.capture), true);

    board[2][3] = creerPiece('P', 1, 2, 3);
    const blockedMoves = coupsLegaux(board, king);
    assert.equal(contient(blockedMoves, 1, 3, (move) => move.hauteFuite), false);
  });

  test('Épine interdit aux adversaires d’entrer dans la case gelée', () => {
    const board = plateauVide();
    const source = placer(board, 'P', 0, 2, 2, ['epine']);
    source.epineZone = { r: 3, c: 3, owner: 0, turns: 2 };
    const enemy = placer(board, 'K', 1, 4, 4);
    const moves = coupsLegaux(board, enemy);

    assert.equal(contient(moves, 3, 3), false);
    assert.equal(contient(moves, 3, 4), true);
  });

  test('Hypnose bloque les cases adjacentes, mais pas au-delà', () => {
    const board = plateauVide();
    const fou = placer(board, 'B', 0, 4, 4);
    fou.debuffs.hypnoseAura = 1;
    const adjacent = placer(board, 'P', 1, 2, 3);
    const distant = placer(board, 'P', 1, 1, 2);
    const interdites = zonesInterdites(board, 1);

    assert.equal(interdites.has('3,3'), true);
    assert.equal(interdites.has('2,3'), false);
    assert.equal(contient(coupsLegaux(board, adjacent), 3, 3), false);
    assert.equal(contient(coupsLegaux(board, distant), 2, 2), true);
  });
});
