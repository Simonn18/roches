// tests/hunt.test.mjs — compatibilité stricte des récompenses de Chasse.
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';

// Même URL versionnée que hunt.js : le test peut donc injecter une entrée parasite
// dans l'index et vérifier le garde-fou sur UPGRADES[id].piece.
import {
  UPGRADES,
  UPGRADES_PAR_TYPE,
  MAX_UPGRADES_PAR_PIECE,
} from '../game/src/constants.js?v=110';
import { initialiserChasse, recolterChasse } from '../game/src/hunt.js?v=3';

const TYPES = ['P', 'N', 'B', 'R', 'Q', 'K'];

function etatPour(type, owner = 0) {
  const cell = { r: 3, c: 3 };
  return {
    mode: 'hunt',
    board: Array.from({ length: 8 }, () => Array(8).fill(null)),
    huntBonuses: owner === 0 ? [cell, null] : [null, cell],
    huntCollected: [0, 0],
    huntLastAward: null,
    piece: { owner, type, r: cell.r, c: cell.c, upgrades: [], shield: false },
  };
}

describe('Chasse — récompense utilisable par la pièce collectrice', () => {
  test('attribue uniquement une amélioration du type exact de la pièce', () => {
    const originalRandom = Math.random;
    Math.random = () => 0;
    try {
      for (const type of TYPES) {
        const state = etatPour(type);
        const award = recolterChasse(state, state.piece);

        assert.ok(award?.upgradeId, `une récompense est tirée pour le type ${type}`);
        assert.equal(
          UPGRADES[award.upgradeId].piece,
          type,
          `${award.upgradeId} doit être utilisable par une pièce ${type}`,
        );
        assert.equal(
          UPGRADES[award.upgradeId].nonImplemente,
          undefined,
          `${award.upgradeId} doit avoir un effet utilisable dans le moteur`,
        );
        assert.deepEqual(state.piece.upgrades, [award.upgradeId]);
        assert.equal(state.huntCollected[0], 1);
      }
    } finally {
      Math.random = originalRandom;
    }
  });

  test('ignore une carte étrangère même si elle apparaît par erreur dans l’index du type', () => {
    const foreignId = 'ruee';
    const pawnIndex = UPGRADES_PAR_TYPE.P;
    const originalIndex = pawnIndex.slice();
    const originalRandom = Math.random;
    Math.random = () => 0;
    // La placer en tête force le tirage à la rencontrer avec Math.random() = 0.
    pawnIndex.unshift(foreignId);
    try {
      const state = etatPour('P');
      const award = recolterChasse(state, state.piece);

      assert.ok(award?.upgradeId);
      assert.notEqual(award.upgradeId, foreignId);
      assert.equal(UPGRADES[award.upgradeId].piece, 'P');
    } finally {
      pawnIndex.splice(0, pawnIndex.length, ...originalIndex);
      Math.random = originalRandom;
    }
  });

  test('attribue désormais les quatre améliorations implémentées', () => {
    const cases = [
      ['P', 'pas-diag'],
      ['P', 'epine'],
      ['N', 'grand-saut'],
      ['K', 'haute-fuite'],
    ];
    const originalRandom = Math.random;
    try {
      for (const [type, implementedId] of cases) {
        const index = UPGRADES_PAR_TYPE[type];
        const originalIndex = index.slice();
        index.splice(0, index.length, implementedId);
        Math.random = () => 0;
        try {
          const state = etatPour(type);
          const award = recolterChasse(state, state.piece);
          assert.equal(award?.upgradeId, implementedId);
          assert.equal(UPGRADES[award.upgradeId].piece, type);
          assert.equal(UPGRADES[award.upgradeId].nonImplemente, undefined);
        } finally {
          index.splice(0, index.length, ...originalIndex);
        }
      }
    } finally {
      Math.random = originalRandom;
    }
  });

  test('reproduit les mêmes cases et récompenses avec le même seed', () => {
    const makeState = () => ({
      mode: 'pvai', bonusMode: true, huntRngSeed: 0x12345678,
      board: Array.from({ length: 8 }, () => Array(8).fill(null)),
      huntBonuses: null, huntCollected: [0, 0], huntLastAward: null,
    });
    const a = makeState();
    const b = makeState();
    initialiserChasse(a);
    initialiserChasse(b);
    assert.deepEqual(a.huntBonuses, b.huntBonuses);
    const pieceA = { owner: 0, type: 'P', ...a.huntBonuses[0], upgrades: [], shield: false };
    const pieceB = { owner: 0, type: 'P', ...b.huntBonuses[0], upgrades: [], shield: false };
    const awardA = recolterChasse(a, pieceA);
    const awardB = recolterChasse(b, pieceB);
    assert.equal(awardA.upgradeId, awardB.upgradeId);
    assert.deepEqual(awardA.nextCase, awardB.nextCase);
    assert.equal(a.huntRngSeed, b.huntRngSeed);
  });

  test('ne dépasse pas le plafond d’améliorations de la pièce', () => {
    const type = 'P';
    const owned = UPGRADES_PAR_TYPE[type].slice(0, MAX_UPGRADES_PAR_PIECE);
    const state = etatPour(type);
    state.piece.upgrades = owned;

    const award = recolterChasse(state, state.piece);

    assert.equal(award.upgradeId, null);
    assert.deepEqual(state.piece.upgrades, owned);
    assert.equal(state.huntCollected[0], 1);
  });
});
