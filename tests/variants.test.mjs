// tests/variants.test.mjs — catalogue utilisateur réduit à deux variantes lisibles.
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';

import {
  ECONOMIES,
  VARIANT_PRESETS,
  DEFAULT_VARIANT,
  reglesEconomie,
  variantIdFromMenu,
} from '../game/src/variants.js?v=110';

describe('Variantes — catalogue simplifié', () => {
  test('ne propose plus les plafonds 15 écus et illimité', () => {
    assert.deepEqual(ECONOMIES.map((item) => item.id), ['standard']);
    assert.deepEqual(VARIANT_PRESETS.map((variant) => variant.id), [
      'pvp_standard',
      'pvp_elimX2',
    ]);
  });

  test('reconstruit uniquement Standard ou Élimination ×2 depuis le menu', () => {
    assert.equal(variantIdFromMenu({ menu: { economie: 'standard', combat: 'standard' } }), 'pvp_standard');
    assert.equal(variantIdFromMenu({ menu: { economie: 'standard', combat: 'elimX2' } }), 'pvp_elimX2');
    assert.equal(variantIdFromMenu({ menu: { economie: 'plafond15', combat: 'standard' } }), DEFAULT_VARIANT);
    assert.equal(variantIdFromMenu({ menu: { economie: 'illimite', combat: 'elimX2' } }), 'pvp_elimX2');
  });

  test('conserve la lecture des anciennes variantes sans les proposer', () => {
    assert.equal(reglesEconomie('pvp_plafond15').plafond, 15);
    assert.equal(reglesEconomie('pvp_illimite').plafond, Infinity);
    assert.equal(reglesEconomie('pvp_plafond15_x2').captureMul, 2);
  });
});
