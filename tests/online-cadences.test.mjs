// tests/online-cadences.test.mjs — catalogue des cadences proposées dans le lobby PvP.
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';

import { PVW_CADENCES } from '../game/src/constants.js?v=113';

describe('Cadences PvP proposées', () => {
  test('ne propose que 1 minute et 5 minutes', () => {
    assert.deepEqual(PVW_CADENCES.map((cadence) => cadence.s), [60, 300]);
    assert.equal(PVW_CADENCES.some((cadence) => cadence.s === 3600), false);
    assert.equal(PVW_CADENCES.some((cadence) => cadence.s === 86400), false);
  });
});
