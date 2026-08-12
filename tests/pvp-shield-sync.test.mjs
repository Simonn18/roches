// tests/pvp-shield-sync.test.mjs — garde de régression du lockstep PvP sur les boucliers.
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const MAIN_JS = new URL('../game/src/main.js', import.meta.url);
const source = fs.readFileSync(MAIN_JS, 'utf8');

function shieldBranch() {
  const start = source.indexOf('  // Cas blindage :');
  const end = source.indexOf('\n  // Cas Sacrifice', start);
  assert.notEqual(start, -1, 'la branche blindage doit exister');
  assert.notEqual(end, -1, 'la branche Sacrifice doit suivre la branche blindage');
  return source.slice(start, end);
}

describe('capture absorbée par un bouclier en PvP', () => {
  test('diffuse la tentative de capture sans l’enregistrer comme déplacement de replay', () => {
    const branch = shieldBranch();
    const credit = branch.indexOf('crediterCoup(');
    const emit = branch.indexOf('pvwEmitMove(');
    const animate = branch.indexOf('demarrerAnim(piece, from, from');
    const resolve = branch.indexOf('resoudreApresCoup(');

    assert.ok(credit >= 0, 'le revenu du coup absorbé doit être calculé');
    assert.ok(emit > credit, 'la tentative doit être diffusée après le calcul de l’état');
    assert.ok(animate > emit, 'la capture absorbée doit suivre le cycle d’animation PvP');
    assert.ok(resolve > animate, 'la résolution du tour doit attendre la fin de l’animation');
    assert.doesNotMatch(branch, /recordMove\(/, 'un coup absorbé ne doit pas déplacer la pièce dans un replay');
    assert.match(branch, /pvwEmitMove\(piece, from, \{ r: mv\.r, c: mv\.c \}, cible\.type, 0, mv\)/);
  });
});
