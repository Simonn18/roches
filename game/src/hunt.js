// roychec — mode local « Chasse aux améliorations ».
// Deux cases bonus sont réservées à chaque camp. Une pièce qui atteint sa case
// reçoit gratuitement une amélioration compatible, sans doublon, puis une nouvelle
// case est tirée pour le même camp. Le module reste volontairement sans DOM,
// réseau ou replay : main.js orchestre les effets de bord du moteur.
import { UPGRADES, UPGRADES_PAR_TYPE, MAX_UPGRADES_PAR_PIECE } from './constants.js?v=108';

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

function nouvelleCase(state, owner, current = null) {
  const other = state.huntBonuses && state.huntBonuses[1 - owner];
  const libres = casesLibres(state, [current, other]);
  if (!libres.length) return null;
  return libres[Math.floor(Math.random() * libres.length)];
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
  if (!state || state.mode !== 'hunt' || !piece || !state.huntBonuses) return null;
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
    ? candidates[Math.floor(Math.random() * candidates.length)]
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
