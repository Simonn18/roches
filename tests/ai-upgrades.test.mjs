// tests/ai-upgrades.test.mjs — IA : les quatre améliorations des cases bonus
// sont utilisables par l'ordinateur (achats + phase pouvoir Épine).
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';

import { creerPiece } from '../game/src/board.js?v=109';
import { UPGRADES_PAR_TYPE } from '../game/src/constants.js?v=110';
import { choisirPouvoirIA, iaDecideTour } from '../game/src/ai.js?v=111';

function plateauVide() {
  return Array.from({ length: 8 }, () => Array(8).fill(null));
}

function placer(board, type, owner, r, c, upgrades = [], extra = {}) {
  const piece = creerPiece(type, owner, r, c);
  piece.upgrades = [...upgrades];
  Object.assign(piece, extra);
  board[r][c] = piece;
  return piece;
}

// Deck actif restreint aux QUATRE nouvelles cartes : un achat ne peut
// sélectionner que parmi elles (déterminisme du test d'achat).
function deckQuatreCartes() {
  const slots = {
    P: { 'pas-diag': 'pas-diag', epine: 'epine' },
    N: { 'grand-saut': 'grand-saut' },
    K: { 'haute-fuite': 'haute-fuite' },
  };
  return { slots };
}

// Deck complet (toutes les cartes du catalogue autorisées par type).
function deckComplet() {
  const slots = {};
  for (const type of Object.keys(UPGRADES_PAR_TYPE)) {
    const byCat = {};
    for (const id of UPGRADES_PAR_TYPE[type]) byCat[id] = id;
    slots[type] = byCat;
  }
  return { slots };
}

function etatIA(owner, board, ecus = 30, deck = deckComplet()) {
  return {
    ai: { player: owner, difficulty: 3, thinking: false },
    turn: owner,
    phase: 'play',
    ecus: [ecus, ecus],
    board,
    activeDeck: deck,
    variant: { plafond: Infinity, revenueBase: 1, captureMul: 1 },
  };
}

describe('IA — les quatre améliorations des cases bonus', () => {
  test('choisirPouvoirIA active Épine quand un ennemi est adjacent au pion', () => {
    const board = plateauVide();
    placer(board, 'P', 0, 4, 4, ['epine']);
    placer(board, 'N', 1, 3, 5);
    const pouvoir = choisirPouvoirIA(etatIA(0, board));
    assert.ok(pouvoir);
    assert.equal(pouvoir.kind, 'epine');
    assert.equal(pouvoir.piece.type, 'P');
    assert.equal(pouvoir.piece.r, 4);
    assert.equal(pouvoir.piece.c, 4);
  });

  test('choisirPouvoirIA reste inactif sans ennemi adjacent', () => {
    const board = plateauVide();
    placer(board, 'P', 0, 4, 4, ['epine']);
    const pouvoir = choisirPouvoirIA(etatIA(0, board));
    assert.equal(pouvoir, null);
  });

  test('iaDecideTour achète parmi les quatre améliorations quand l’or abonde', () => {
    const board = plateauVide();
    // Une pièce de chaque type porteur d'une des quatre cartes.
    placer(board, 'P', 0, 6, 0);
    placer(board, 'N', 0, 7, 1);
    placer(board, 'K', 0, 7, 4);

    const tour = iaDecideTour(etatIA(0, board, 30, deckQuatreCartes()));
    assert.ok(tour, 'un tour est décidé');
    assert.ok(Array.isArray(tour.achats));
    assert.ok(tour.achats.length > 0, 'l’IA achète au moins une carte');
    const ids = tour.achats.map((a) => a.upgradeId);
    const toutesDansLesQuatre = ids.every((id) =>
      ['pas-diag', 'epine', 'grand-saut', 'haute-fuite'].includes(id));
    assert.equal(toutesDansLesQuatre, true, `achats: ${ids.join(', ')}`);
  });

  test('iaDecideTour génère un coup avec Grand saut quand c’est le seul légal', () => {
    const board = plateauVide();
    // Cavalier en (4,4) avec Grand saut. Géométrie : chaque case intermédiaire d'un
    // Grand saut est un pas de cavalier, donc AUSSI une destination standard — bloquer
    // les 8 destinations par des pièces bloquerait aussi les 16 bonds. On gèle donc
    // les 8 destinations standard par des zones Épine ENNEMIES : coupsLegaux filtre
    // l'ARRIVÉE standard (casesEpines), mais l'intermédiaire du Grand saut n'est
    // contrôlé que sur case VIDE — le gel n'empêche pas le passage, seulement
    // l'arrivée. Les bonds 3×1/3×2 deviennent le SEUL type de coup légal du camp 0
    // (le cavalier est l'unique pièce alliée) → assertion déterministe : quel que
    // soit le coup choisi par la recherche, c'est forcément un Grand saut.
    placer(board, 'N', 0, 4, 4, ['grand-saut']);
    const destsStd = [
      [2, 3], [2, 5], [3, 2], [3, 6],
      [5, 2], [5, 6], [6, 3], [6, 5],
    ];
    // Pions ennemis en rangée 0 (jamais atteints par le cavalier ni les bonds) :
    // chacun porte une zone Épine pointant sur une destination standard du cavalier.
    for (let i = 0; i < destsStd.length; i++) {
      const [r, c] = destsStd[i];
      placer(board, 'P', 1, 0, i, [], { epineZone: { r, c, owner: 1, turns: 2 } });
    }

    const tour = iaDecideTour(etatIA(0, board, 0));
    assert.ok(tour, 'un tour est décidé');
    assert.equal(tour.achats.length, 0, '0 écu → aucun achat');
    assert.ok(tour.mouvement, 'un coup est choisi');
    assert.equal(tour.mouvement.move.grandSaut, true,
      `le coup ${tour.mouvement.move.r},${tour.mouvement.move.c} doit être un Grand saut`);
  });
});
