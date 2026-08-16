// tests/learn-puzzles.test.mjs — validation des lignes tactiques guidées.
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';

import {
  LEARN_GAMES,
  PUZZLES,
  demarrerMiniJeu,
  demarrerPuzzle,
  learnPermet,
  puzzleReponse,
} from '../game/src/learn.js?v=23';
import { UPGRADES } from '../game/src/constants.js?v=113';
import { coupsLegaux, roiEnEchec } from '../game/src/rules.js?v=116';

const SOLUTIONS = [
  { move: { r: 4, c: 6 }, wrong: { r: 3, c: 4 } },
  { move: { r: 5, c: 2 }, wrong: { r: 3, c: 3 } },
  { target: { r: 5, c: 6 }, wrong: { r: 2, c: 3 } },
  { move: { r: 2, c: 5 }, wrong: { r: 3, c: 3 } },
];

function etatPuzzle(index) {
  const state = {};
  assert.equal(demarrerPuzzle(state, index), true);
  const piece = state.learnExpectedPiece;
  piece.upgrades.push(PUZZLES[index].upgradeId);
  state.learnPurchased = true;
  state.puzzlePurchased = true;
  return { state, piece };
}

describe('Parcours classique — catalogue complet des améliorations actives et déplacement', () => {
  test('enseigne chaque amélioration ACTIF et DÉPLACEMENT prévue dans le parcours', () => {
    const enseignees = new Set(LEARN_GAMES.map((game) => game.upgradeId));
    const attendues = Object.values(UPGRADES)
      .filter((upgrade) => (upgrade.cat === 'A' || upgrade.cat === 'D') && !['sacrifice', 'sht'].includes(upgrade.id))
      .map((upgrade) => upgrade.id);

    assert.deepEqual(
      attendues.filter((id) => !enseignees.has(id)),
      [],
      'aucune amélioration active ou déplacement conservée ne doit manquer du parcours classique',
    );
    assert.equal(enseignees.has('sacrifice'), false, 'Mariage stratégique ne doit plus être dans Apprendre');
    assert.equal(enseignees.has('sht'), false, 'S.H.T. ne doit plus être dans Apprendre');
    assert.equal(new Set(LEARN_GAMES.map((game) => game.id)).size, LEARN_GAMES.length);
  });

  test('chaque étape classique prépare sa pièce et son objectif', () => {
    for (let index = 0; index < LEARN_GAMES.length; index++) {
      const state = {};
      assert.equal(demarrerMiniJeu(state, index), true, LEARN_GAMES[index].id);
      assert.equal(state.learnExpectedPiece?.owner, 0, LEARN_GAMES[index].id);
      assert.equal(typeof LEARN_GAMES[index].check, 'function', LEARN_GAMES[index].id);
    }
  });

  test('Cavalerie présente un pion en face et guide sa poussée', () => {
    const index = LEARN_GAMES.findIndex((game) => game.id === 'cavalerie');
    const state = {};
    assert.notEqual(index, -1);
    assert.equal(demarrerMiniJeu(state, index), true);
    const cavalier = state.learnExpectedPiece;
    assert.equal(cavalier.type, 'N');
    assert.equal(state.board[3][4]?.type, 'P');
    assert.equal(state.board[3][4]?.owner, 1);

    cavalier.upgrades.push('cavalerie');
    state.learnPurchased = true;
    assert.equal(learnPermet(state, { type: 'power', kind: 'cavalerie', piece: cavalier }), true);

    state.phase = 'cavalerie-target';
    assert.equal(learnPermet(state, { type: 'target', cell: { r: 3, c: 4 } }), true);
    state.phase = 'cavalerie-push';
    assert.equal(learnPermet(state, { type: 'target', cell: { r: 2, c: 3 } }), true);
  });
});

describe('Puzzles tactiques — lignes et refus des mauvais coups', () => {
  test('refuse un déplacement légal mais tactiquement incorrect sans modifier la position', () => {
    for (const [index, solution] of [[0, SOLUTIONS[0]], [1, SOLUTIONS[1]], [3, SOLUTIONS[3]]]) {
      const { state, piece } = etatPuzzle(index);
      const before = { r: piece.r, c: piece.c };
      const allowed = learnPermet(state, {
        type: 'move', piece, move: solution.wrong,
      });

      assert.equal(allowed, false, `le puzzle ${PUZZLES[index].id} doit refuser le mauvais coup`);
      assert.equal(piece.r, before.r);
      assert.equal(piece.c, before.c);
      assert.equal(state.board[before.r][before.c], piece);
      assert.equal(typeof state.puzzleFeedback, 'string');
      assert.ok(state.puzzleFeedback.length > 0);
    }
  });

  test('accepte uniquement la destination de la ligne tactique', () => {
    for (const [index, solution] of [[0, SOLUTIONS[0]], [1, SOLUTIONS[1]], [3, SOLUTIONS[3]]]) {
      const { state, piece } = etatPuzzle(index);
      assert.equal(learnPermet(state, {
        type: 'move', piece, move: solution.move,
      }), true, `la solution du puzzle ${PUZZLES[index].id} doit être autorisée`);
    }
  });

  test('explique une mauvaise cible de pouvoir puis accepte la bonne cible', () => {
    const { state, piece } = etatPuzzle(2);
    state.phase = 'ruee-target';

    assert.equal(learnPermet(state, {
      type: 'target', piece, cell: SOLUTIONS[2].wrong,
    }), false);
    assert.match(state.puzzleFeedback, /capture|distance|position|tour|reine/i);

    assert.equal(learnPermet(state, {
      type: 'target', piece, cell: SOLUTIONS[2].target,
    }), true);
    assert.equal(state.puzzleFeedback, '');
  });

  test('le puzzle 1 protège le roi adverse avec une tour en e7', () => {
    const { state } = etatPuzzle(0);
    assert.equal(state.board[0][4]?.type, 'K');
    assert.equal(state.board[0][4]?.owner, 1);
    assert.equal(state.board[1][4]?.type, 'R');
    assert.equal(state.board[1][4]?.owner, 1);
  });

  test('le puzzle 2 met le roi en échec et Pas de côté permet de le sauver', () => {
    const { state, piece } = etatPuzzle(1);
    assert.equal(state.board[5][2]?.type, 'Q');
    assert.equal(roiEnEchec(state.board, 0), true);
    assert.equal(roiEnEchec(state.board, 1), false);
    assert.ok(coupsLegaux(state.board, piece)
      .some((move) => move.r === 5 && move.c === 2 && move.capture));
  });

  test('le puzzle 3 place la reine en g3 et protège la case avec la tour', () => {
    const { state, piece } = etatPuzzle(2);
    assert.equal(state.board[5][6]?.type, 'Q');
    assert.equal(state.board[1][6]?.type, 'R');
    assert.ok(coupsLegaux(state.board, piece)
      .some((move) => move.r === 5 && move.c === 6 && move.capture));

    // Après une capture directe, la tour en g7 attaquerait le cavalier en g3.
    state.board[4][4] = null;
    piece.r = 5; piece.c = 6;
    state.board[5][6] = piece;
    assert.ok(coupsLegaux(state.board, state.board[1][6])
      .some((move) => move.r === 5 && move.c === 6 && move.capture));
  });

  test('le puzzle Couronne protège la reine lors de la reprise du roi', () => {
    const { state, piece } = etatPuzzle(4);
    assert.equal(state.board[5][3]?.type, 'P');
    assert.equal(state.board[6][3]?.type, 'K');
    assert.equal(state.board[6][3]?.owner, 1);
    assert.ok(coupsLegaux(state.board, piece)
      .some((move) => move.r === 5 && move.c === 3 && move.capture));
    // Simule la vraie capture : le pion quitte d3 avant la tentative du roi.
    piece.r = 5; piece.c = 3;
    state.board[4][4] = null;
    state.board[5][3] = piece;
    assert.ok(coupsLegaux(state.board, state.board[6][3])
      .some((move) => move.r === 5 && move.c === 3 && move.capture));
  });

  test('le puzzle 7 échange la tour avec le pion et met le roi en échec', () => {
    const { state, piece } = etatPuzzle(6);
    assert.equal(PUZZLES[6].id, 'puzzle-echange');
    assert.equal(piece.type, 'R');
    assert.equal(state.board[4][4]?.type, 'P');
    assert.equal(state.board[0][2]?.type, 'R');
    assert.equal(state.board[0][2]?.owner, 1);
    assert.equal(piece.r, 4);
    assert.equal(piece.c, 1);
    assert.equal(roiEnEchec(state.board, 1), false);
    assert.equal(learnPermet(state, { type: 'power', kind: 'echange', piece }), true);
    state.phase = 'echange-target';
    assert.equal(learnPermet(state, {
      type: 'target', piece, cell: { r: 4, c: 4 },
    }), true);

    // Reproduit l'échange exécuté par main.js : la tour prend e4,
    // le pion prend b4, puis la colonne ouverte met le roi e8 en échec.
    const pawn = state.board[4][4];
    state.board[4][1] = pawn;
    state.board[4][4] = piece;
    pawn.r = 4; pawn.c = 1;
    piece.r = 4; piece.c = 4;
    assert.equal(roiEnEchec(state.board, 1), true);
    assert.equal(state.board[4][4], piece);
    assert.equal(state.board[4][1], pawn);
    assert.equal(PUZZLES[6].power, 'echange');
  });

  test('le puzzle Mariage immobilise la reine qui menace le roi', () => {
    const { state, piece } = etatPuzzle(5);
    assert.equal(state.board[5][4]?.type, 'Q');
    assert.equal(roiEnEchec(state.board, 0), true);
    assert.equal(Math.max(Math.abs(piece.r - state.board[5][4].r), Math.abs(piece.c - state.board[5][4].c)), 2);
    assert.equal(PUZZLES[5].power, 'sacrifice');
  });

  test('la réponse du puzzle 7 pointe vers le pion adverse', () => {
    const { state } = etatPuzzle(6);
    const response = puzzleReponse(state);
    assert.deepEqual(response.from, { r: 1, c: 7 });
    assert.deepEqual(response.to, { r: 2, c: 7 });
  });

  test('la réponse Couronne part bien du roi en d2', () => {
    const { state } = etatPuzzle(4);
    const response = puzzleReponse(state);
    assert.deepEqual(response.from, { r: 6, c: 3 });
    assert.deepEqual(response.to, { r: 5, c: 3 });
  });

  test('chaque réponse adverse pointe vers une pièce ennemie et une case libre', () => {
    for (let index = 0; index < PUZZLES.length; index++) {
      const { state } = etatPuzzle(index);
      const response = puzzleReponse(state);
      const source = state.board[response.from.r]?.[response.from.c];
      const destination = state.board[response.to.r]?.[response.to.c];

      assert.equal(source?.owner, 1, `${PUZZLES[index].id}: réponse ennemie attendue`);
      if (!response.shieldedCapture) {
        assert.equal(destination, null, `${PUZZLES[index].id}: arrivée libre attendue`);
      } else {
        assert.equal(destination?.type, 'P', `${PUZZLES[index].id}: cible de reprise attendue`);
      }
    }
  });
});
