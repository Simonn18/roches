// roychec — mode « Plateau bonus » / Chasse aux améliorations.
// Deux cases bonus sont réservées à chaque camp. Une pièce qui atteint sa case
// reçoit gratuitement une amélioration compatible, sans doublon, puis une nouvelle
// case est tirée pour le même camp. Le tirage est déterministe : le mode peut donc
// fonctionner dans le lockstep PvP privé sans désynchroniser les clients.
import { UPGRADES, UPGRADES_PAR_TYPE, MAX_UPGRADES_PAR_PIECE } from './constants.js?v=111';

function casesLibres(state, interdites = []) {
  const interditesSet = new Set(interdites.filter(Boolean).map((cell) => `${cell.r},${cell.c}`));
  const libres = [];
  for (let r = 0; r < state.board.length; r++) {
    for (let c = 0; c < state.board[r].length; c++) {
      if (state.board[r][c] === null && !interditesSet.has(`${r},${c}`)) libres.push({ r, c });
    }
  }
  return libres;
}

// PRNG compact et sérialisable : le même seed initial + le même ordre d'actions
// produit exactement les mêmes cases et cartes sur les deux clients en ligne.
function tirageDeterministe(state, longueur) {
  const seed = (state.huntRngSeed >>> 0) || 0x9e3779b9;
  let next = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
  state.huntRngSeed = next;
  return longueur ? next % longueur : 0;
}

function nouvelleCase(state, owner, current = null) {
  const other = state.huntBonuses && state.huntBonuses[1 - owner];
  const libres = casesLibres(state, [current, other]);
  if (!libres.length) return null;
  return libres[tirageDeterministe(state, libres.length)];
}

export function initialiserChasse(state) {
  state.huntBonuses = [null, null];
  state.huntCollected = [0, 0];
  state.huntLastAward = null;
  // Tirage séparé : les cases sont libres, distinctes et réservées à leur camp.
  state.huntBonuses[0] = nouvelleCase(state, 0);
  state.huntBonuses[1] = nouvelleCase(state, 1, state.huntBonuses[0]);
  return state.huntBonuses;
}

export function caseChassePour(state, owner) {
  return state.huntBonuses && state.huntBonuses[owner] ? state.huntBonuses[owner] : null;
}

export function recolterChasse(state, piece) {
  if (!state || (!(state.bonusMode || state.mode === 'hunt')) || !piece || !state.huntBonuses) return null;
  const bonusCase = state.huntBonuses[piece.owner];
  if (!bonusCase || bonusCase.r !== piece.r || bonusCase.c !== piece.c) return null;

  // Une carte déjà portée par la pièce est exclue du tirage. Si toutes les cartes
  // compatibles sont déjà prises, la case réapparaît sans modifier la pièce.
  const possedees = new Set(piece.upgrades || []);
  const candidates = piece.upgrades.length >= MAX_UPGRADES_PAR_PIECE
    ? []
    : (UPGRADES_PAR_TYPE[piece.type] || [])
      // Double garde : l'index est déjà groupé par type, mais la définition
      // de la carte reste l'autorité. Une récompense ne peut être utilisable
      // que par la pièce qui l'a ramassée.
      .filter((id) => {
        const upgrade = UPGRADES[id];
        return !!upgrade
          && upgrade.piece === piece.type
          && !upgrade.nonImplemente
          && !possedees.has(id);
      });
  const upgradeId = candidates.length
    ? candidates[tirageDeterministe(state, candidates.length)]
    : null;
  const nextCase = nouvelleCase(state, piece.owner, bonusCase);
  state.huntBonuses[piece.owner] = nextCase;
  state.huntCollected[piece.owner]++;

  if (!upgradeId) {
    state.huntLastAward = { owner: piece.owner, piece, upgradeId: null, cell: bonusCase, nextCase };
    return state.huntLastAward;
  }

  piece.upgrades.push(upgradeId);
  const upgrade = UPGRADES[upgradeId];
  if (['forteresse', 'bouclier', 'monture', 'couronne', 'majeste', 'Zone'].includes(upgradeId)) {
    piece.shield = true;
  }
  piece._goldT = typeof performance !== 'undefined' ? performance.now() : 0;
  state.huntLastAward = { owner: piece.owner, piece, upgradeId, upgrade, cell: bonusCase, nextCase };
  return state.huntLastAward;
}
