// roychec — mode APPRENDRE : démonstrations + puzzles tactiques rejouables.
// Les scénarios préparent des plateaux, puis réutilisent le moteur réel de main.js.
// Aucun réseau, replay ou trophée n'est impliqué dans ce mode.
import { creerPiece } from './board.js?v=109';
import { reglesEconomie, DEFAULT_VARIANT } from './variants.js?v=108';
import { coupsLegaux, roiEnEchec } from './rules.js?v=116';
import { CELL, OX, OY } from './constants.js?v=109';

const STORAGE_KEY = 'roychec-learn-progress';

function plateauVide() {
  return Array.from({ length: 8 }, () => Array(8).fill(null));
}

function baseScenario(state, board, ecus = 0) {
  state.mode = 'learn';
  state.phase = state.learnKind === 'puzzle' ? 'puzzle-game' : 'learn-game';
  state.board = board;
  state.taille = 'std';
  state.turn = 0;
  state.ecus = [ecus, 0];
  state.variant = reglesEconomie(DEFAULT_VARIANT);
  state.capturesDep = [0, 0];
  state.selected = null;
  state.legalMoves = [];
  state.panelPiece = null;
  state.ruTargets = [];
  state.chain = null;
  state.anim = null;
  state.winner = null;
  state.ai = null;
  state.popups = [];
  state.flashes = [];
  state.buzz = 0;
  state.learnSuccess = false;
  state.learnSuccessAt = 0;
  state.learnMessage = '';
  state.puzzlePurchased = false;
  state.learnPurchased = false;
  state.learnAutoDemo = false;
  state._shieldDemo = null;
  state._hypnoseDemo = null;
  state.puzzleMoves = 0;
  state.puzzleResponseDone = false;
  state.puzzleResponsePending = false;
  state.puzzleShieldUsed = false;
  state.puzzleFeedback = '';
  // Pièce attendue par le guidage : conservée après l'achat d'un puzzle pour
  // empêcher un changement de pièce avant le déplacement solution.
  state.learnExpectedPiece = null;
  // Les puzzles doivent toujours montrer la solution dans le catalogue, même si
  // le deck de partie courant a été personnalisé. Cela ne modifie jamais le deck
  // sauvegardé : null déclenche simplement le fallback catalogue de main.js.
  state.activeDeck = null;
  for (const row of board) {
    for (const piece of row) {
      if (piece) {
        piece.cooldowns = {};
        piece.debuffs = {};
      }
    }
  }
}

function rois(board, own = true) {
  board[7][4] = creerPiece('K', 0, 7, 4);
  board[0][4] = creerPiece('K', own ? 1 : 0, 0, 4);
}

function scenarioBouclier(state) {
  const b = plateauVide();
  const shielded = creerPiece('P', 0, 7, 5);
  const attacker = creerPiece('P', 1, 6, 6);
  // Bouclier appartient aux pions : le joueur l'achète sur sa pièce, puis le
  // scénario simule la capture adverse qui le consomme.
  b[7][5] = shielded; b[6][6] = attacker;
  baseScenario(state, b, 6);
}

function scenarioPasDeCote(state) {
  const b = plateauVide();
  const fou = creerPiece('B', 0, 4, 4);
  b[4][4] = fou; rois(b);
  baseScenario(state, b, 6);
}

function scenarioRuee(state) {
  const b = plateauVide();
  const cavalier = creerPiece('N', 0, 4, 4);
  b[4][4] = cavalier; b[2][3] = creerPiece('P', 1, 2, 3); rois(b);
  baseScenario(state, b, 9);
}

function scenarioRayon(state) {
  const b = plateauVide();
  const fou = creerPiece('B', 0, 4, 4);
  b[4][4] = fou; b[2][2] = creerPiece('P', 1, 2, 2); rois(b);
  baseScenario(state, b, 10);
}

function scenarioVeteran(state) {
  const b = plateauVide();
  const pion = creerPiece('P', 0, 4, 4);
  b[4][4] = pion; b[3][4] = creerPiece('P', 1, 3, 4); rois(b);
  baseScenario(state, b, 5);
}

function scenarioTeleportation(state) {
  const b = plateauVide();
  const dame = creerPiece('Q', 0, 4, 4);
  b[4][4] = dame;
  // Les alliés bloquent les déplacements ordinaires autour de la dame.
  for (const [r, c] of [[3, 3], [3, 4], [3, 5], [4, 3], [4, 5], [5, 3], [5, 4], [5, 5]]) {
    b[r][c] = creerPiece('P', 0, r, c);
  }
  rois(b); // les rois sont décoratifs et le roi J1 reste en dehors de la zone.
  b[7][4] = null;
  baseScenario(state, b, 12);
}

function scenarioHypnose(state) {
  const b = plateauVide();
  const fou = creerPiece('B', 0, 4, 4);
  b[4][4] = fou;
  // Deux pions ennemis commencent juste hors de l'aura : leur prochaine case
  // (3,3) et (3,5) est adjacente au fou et donc interdite.
  b[2][3] = creerPiece('P', 1, 2, 3);
  b[2][5] = creerPiece('P', 1, 2, 5);
  rois(b); baseScenario(state, b, 10);
}

function scenarioDecret(state) {
  const b = plateauVide();
  const roi = creerPiece('K', 0, 6, 4);
  const tour = creerPiece('R', 0, 6, 5);
  b[6][4] = roi; b[6][5] = tour; b[0][4] = creerPiece('K', 1, 0, 4);
  baseScenario(state, b, 12);
}

// Lot 2 — déplacements spéciaux déjà implémentés dans rules.js.
function scenarioMarcheArriere(state) {
  const b = plateauVide();
  const pion = creerPiece('P', 0, 4, 4);
  // Le pion est bloqué vers l'avant, mais peut reculer d'une case vide.
  b[4][4] = pion;
  b[3][4] = creerPiece('P', 0, 3, 4);
  rois(b); baseScenario(state, b, 4);
}

function scenarioPivot(state) {
  const b = plateauVide();
  const tour = creerPiece('R', 0, 4, 4);
  // La diagonale d3 est inaccessible à une tour classique.
  b[4][4] = tour;
  rois(b); baseScenario(state, b, 7);
}

function scenarioEnjambeur(state) {
  const b = plateauVide();
  const tour = creerPiece('R', 0, 4, 4);
  b[4][4] = tour;
  b[4][5] = creerPiece('P', 0, 4, 5);
  // La case derrière l'obstacle devient atteignable par le saut.
  rois(b); baseScenario(state, b, 6);
}

function scenarioReprise(state) {
  const b = plateauVide();
  const fou = creerPiece('B', 0, 4, 4);
  b[4][4] = fou;
  // La Folie permet au fou de frapper horizontalement comme une tour.
  b[4][6] = creerPiece('P', 1, 4, 6);
  rois(b); baseScenario(state, b, 6);
}

function scenarioFeinte(state) {
  const b = plateauVide();
  const dame = creerPiece('Q', 0, 4, 4);
  b[4][4] = dame;
  // La cible en saut de cavalier n'est accessible ni en ligne ni en diagonale.
  b[2][5] = creerPiece('P', 1, 2, 5);
  rois(b); baseScenario(state, b, 12);
}

function scenarioPasseRoyale(state) {
  const b = plateauVide();
  const roi = creerPiece('K', 0, 6, 4);
  b[6][4] = roi;
  // Deux cases en avant, sans capture : le saut dépasse le déplacement royal normal.
  rois(b); b[7][4] = null;
  baseScenario(state, b, 8);
}

// --- Puzzles tactiques : l'amélioration n'est pas équipée au départ ---
// Le budget est exactement égal au coût de la solution. Une mauvaise carte
// consomme donc la tentative et impose de recommencer, comme dans un vrai puzzle.
function scenarioPuzzleEnjambeur(state) {
  const b = plateauVide();
  const tour = creerPiece('R', 0, 4, 4);
  const obstacle = creerPiece('P', 0, 4, 5);
  const menace = creerPiece('N', 1, 3, 6);
  const tempo = creerPiece('P', 1, 2, 7);
  const gardeRoi = creerPiece('R', 1, 1, 4);
  // La tour noire protège le roi en e8 : sans elle, la tour blanche en e4
  // lui donnerait un échec direct avant même l'achat d'Enjambeur.
  b[4][4] = tour; b[4][5] = obstacle; b[2][7] = tempo;
  b[1][4] = gardeRoi; b[3][6] = menace;
  rois(b); baseScenario(state, b, 6);
}

function scenarioPuzzlePasDeCote(state) {
  const b = plateauVide();
  const fou = creerPiece('B', 0, 4, 4);
  const menace = creerPiece('Q', 1, 5, 2);
  const tempo = creerPiece('P', 1, 1, 2);
  const soutien = creerPiece('P', 0, 5, 4);
  // La reine en c3 met directement le roi blanc en e1 en échec
  // (diagonale c3–d2–e1). Le Fou en e4 ne peut la sauver qu'après l'achat
  // de Pas de côté, qui autorise le saut en L vers c3.
  b[4][4] = fou; b[5][2] = menace; b[1][2] = tempo; b[5][4] = soutien;
  rois(b); baseScenario(state, b, 6);
}

function scenarioPuzzleRuee(state) {
  const b = plateauVide();
  const cavalier = creerPiece('N', 0, 4, 4);
  const menace = creerPiece('Q', 1, 5, 6);
  // La tour contrôle g3 : une capture directe ferait atterrir le cavalier
  // sur une case menacée. La Ruée permet de supprimer la reine sans bouger.
  const tempo = creerPiece('P', 1, 0, 7);
  const garde = creerPiece('R', 1, 1, 6);
  b[4][4] = cavalier; b[5][6] = menace; b[0][7] = tempo; b[1][6] = garde;
  rois(b); baseScenario(state, b, 9);
}

function scenarioPuzzleFeinte(state) {
  const b = plateauVide();
  const dame = creerPiece('Q', 0, 4, 3);
  const menace = creerPiece('R', 1, 2, 5);
  const tempo = creerPiece('P', 1, 1, 4);
  const garde = creerPiece('B', 1, 0, 7);
  b[4][3] = dame; b[2][2] = menace; b[1][4] = tempo; b[0][7] = garde;
  rois(b); baseScenario(state, b, 12);
}

function scenarioPuzzleCouronne(state) {
  const b = plateauVide();
  const dame = creerPiece('Q', 0, 4, 4);
  const pion = creerPiece('P', 1, 5, 3);
  const roiAdverse = creerPiece('K', 1, 6, 3);
  const roiAllie = creerPiece('K', 0, 7, 7);
  // La dame peut prendre le pion en d3, dans le rayon du roi adverse en d2.
  // Après la capture, le roi tentera réellement d'aller de d2 à d3 : Couronne
  // absorbe cette reprise et la dame survit sur d3.
  b[4][4] = dame; b[5][3] = pion; b[6][3] = roiAdverse; b[7][7] = roiAllie;
  baseScenario(state, b, 9);
}

function scenarioPuzzleMariage(state) {
  const b = plateauVide();
  const roi = creerPiece('K', 0, 7, 4);
  const reine = creerPiece('Q', 1, 5, 4);
  const roiAdverse = creerPiece('K', 1, 0, 4);
  const pion = creerPiece('P', 1, 1, 7);
  // La reine est à deux cases du roi et donne déjà échec sur la colonne e.
  // Le Mariage stratégique la fige avant qu'elle ne puisse poursuivre son attaque.
  b[7][4] = roi; b[5][4] = reine; b[0][4] = roiAdverse;
  b[1][7] = pion;
  baseScenario(state, b, 12);
}

function scenarioPuzzleEchange(state) {
  const b = plateauVide();
  const tour = creerPiece('R', 0, 4, 1);
  const pion = creerPiece('P', 0, 4, 4);
  const roiAdverse = creerPiece('K', 1, 0, 4);
  const tourAdverse = creerPiece('R', 1, 0, 2);
  const pionTempo = creerPiece('P', 1, 1, 7);
  const roiAllie = creerPiece('K', 0, 7, 7);
  // La tour est à gauche en b4, avec deux cases libres entre elle et le pion
  // allié en e4. Le roi e8 n'est donc pas dans sa ligne au départ. Une tour
  // noire en c8 garde le décor sous pression sans bloquer la solution.
  // Après l'Échange, la tour prend e4 et ouvre la colonne jusqu'au roi e8.
  b[4][1] = tour; b[4][4] = pion;
  b[0][4] = roiAdverse; b[0][2] = tourAdverse;
  b[1][7] = pionTempo; b[7][7] = roiAllie;
  baseScenario(state, b, 9);
}

export const LEARN_GAMES = [
  {
    id: 'bouclier', title: 'Bouclier de fantassin', upgrade: 'Bouclier', upgradeId: 'bouclier',
    category: 'STAT', cost: 6, color: '#9BCB8C',
    text: 'Une pièce protégée peut survivre à une capture.',
    detail: 'Achète Bouclier sur le pion, puis observe la capture adverse être annulée : le pion reste en place et le bouclier se brise.',
    objective: 'Acheter puis utiliser le Bouclier',
    setup: scenarioBouclier,
    noMove: true,
    hint: () => ({ cells: [{ r: 7, c: 5 }] }),
    check: (state) => {
      const shielded = state.board[7][5];
      const attacker = state.board[6][6];
      if (!state.learnPurchased || !shielded || !attacker) return !!state._shieldDemo?.done;

      const centre = (r, c) => ({
        x: OX + c * CELL + CELL / 2,
        y: OY + r * CELL + CELL / 2,
      });
      const now = performance.now();

      // L'attaque est une vraie séquence visuelle : le pion adverse fonce
      // jusqu'au pion protégé, sans modifier le plateau logique.
      if (!state._shieldDemo) {
        state._shieldDemo = { stage: 'attaque' };
        state.phase = 'animating';
        state.anim = {
          piece: attacker,
          from: centre(6, 6),
          to: centre(7, 5),
          t0: now,
          onDone() {
            // Impact : le Bouclier absorbe la capture. Le pion adverse n'est
            // jamais déplacé dans state.board ; il va simplement rebondir.
            shielded.shield = false;
            state._shieldDemo.stage = 'recul';
            state.flashes.push({ r: 7, c: 5, t0: performance.now(), color: 'cyan' });
            state.popups.push({
              text: 'BOUCLIER !',
              x: OX + 5 * CELL + CELL / 2,
              y: OY + 7 * CELL + CELL / 2 - 28,
              t0: performance.now(),
              color: '#4FA79C',
            });
            state.phase = 'animating';
            state.anim = {
              piece: attacker,
              from: centre(7, 5),
              to: centre(6, 6),
              t0: performance.now(),
              onDone() {
                state._shieldDemo.stage = 'bloquee';
                state._shieldDemo.done = true;
                state.phase = 'learn-game';
              },
            };
          },
        };
        return false;
      }

      return !!state._shieldDemo.done;
    },
  },
  {
    id: 'pas-de-cote', title: 'Pas de côté', upgrade: 'Pas de côté', upgradeId: 'pas-de-cote',
    category: 'DÉPLACEMENT', cost: 6, color: '#8FB8E0',
    text: 'Le fou gagne un saut en L en plus de sa diagonale.',
    detail: 'Sélectionne le fou puis joue le saut vers c3. Cette carte ouvre une case normalement inaccessible au fou.',
    objective: 'Jouer un déplacement en L',
    setup: scenarioPasDeCote,
    hint: () => ({ cells: [{ r: 4, c: 4 }, { r: 2, c: 3 }] }),
    check: (state) => !!state.board[2][3]?.upgrades.includes('pas-de-cote'),
  },
  {
    id: 'ruee', title: 'Ruée', upgrade: 'Ruée', upgradeId: 'ruee', category: 'ACTIF', cost: 9, color: '#F0B15E',
    text: 'Le cavalier capture à distance sans bouger.',
    detail: 'Sélectionne le cavalier, active RUÉE, puis vise le pion en d6. Le cavalier reste sur e4.',
    objective: 'Capturer sans déplacer le cavalier', setup: scenarioRuee,
    hint: (state) => state.phase === 'ruee-target' ? { cells: [{ r: 2, c: 3 }] } : { cells: [{ r: 4, c: 4 }] },
    power: 'ruee', check: (state) => !state.board[2][3] && !!state.board[4][4]?.upgrades.includes('ruee'),
  },
  {
    id: 'rayon', title: 'Rayon sacré', upgrade: 'Rayon sacré', upgradeId: 'Rayon', category: 'ACTIF', cost: 10, color: '#F0B15E',
    text: 'Le fou frappe la première pièce sur une diagonale.',
    detail: 'Sélectionne le fou, active RAYON SACRÉ et vise le pion en c3. Le fou ne quitte jamais e4.',
    objective: 'Capturer sur une diagonale à distance', setup: scenarioRayon,
    hint: (state) => state.phase === 'rayon-target' ? { cells: [{ r: 2, c: 2 }] } : { cells: [{ r: 4, c: 4 }] },
    power: 'rayon', check: (state) => !state.board[2][2] && !!state.board[4][4]?.upgrades.includes('Rayon'),
  },
  {
    id: 'veteran', title: 'Vétéran', upgrade: 'Vétéran', upgradeId: 'vet', category: 'ACTIF', cost: 5, color: '#F0B15E',
    text: 'Le pion capture directement devant lui, sans avancer.',
    detail: 'Active VÉTÉRAN sur le pion e4 puis vise le pion adverse en e5. Le pion reste sur sa case.',
    objective: 'Capturer le pion en face', setup: scenarioVeteran,
    hint: (state) => state.phase === 'vet-target' ? { cells: [{ r: 3, c: 4 }] } : { cells: [{ r: 4, c: 4 }] },
    power: 'vet', check: (state) => !state.board[3][4] && !!state.board[4][4]?.upgrades.includes('vet'),
  },
  {
    id: 'tele', title: 'Téléportation courte', upgrade: 'Téléportation courte', upgradeId: 'Tele', category: 'DÉPLACEMENT', cost: 12, color: '#8FB8E0',
    text: 'La dame s’échappe vers une case vide en ignorant les obstacles.',
    detail: 'Sélectionne la dame encerclée puis choisis l’anneau ambre en e7. Aucun pion ne doit être déplacé.',
    objective: 'Sortir de l’encerclement', setup: scenarioTeleportation,
    hint: () => ({ cells: [{ r: 4, c: 4 }, { r: 1, c: 4 }] }),
    check: (state) => state.board[1][4]?.type === 'Q' && (state.board[1][4].cooldowns.Tele || 0) > 0,
  },
  {
    id: 'hypnose', title: 'Hypnose', upgrade: 'Hypnose', upgradeId: 'hypnose', category: 'ACTIF', cost: 10, color: '#F0B15E',
    text: 'Le fou crée une zone qui gêne les petites pièces ennemies.',
    detail: 'Sélectionne le fou et active HYPNOSE. Deux pions vont tenter d’entrer dans la case adjacente, mais leurs déplacements sont bloqués.',
    objective: 'Déployer l’aura et repousser les pions', setup: scenarioHypnose,
    hint: () => ({ cells: [{ r: 4, c: 4 }] }),
    power: 'hypnose',
    check: (state) => {
      const fou = state.board[4][4];
      const pionGauche = state.board[2][3];
      const pionDroit = state.board[2][5];
      if (!(fou?.debuffs?.hypnoseAura > 0)) return !!state._hypnoseDemo?.done;
      if (!pionGauche || !pionDroit) return false;
      // Vérifie avec le moteur réel que les deux cases d'entrée sont bien
      // refusées : la démonstration ne repose pas uniquement sur l'animation.
      const caseInterdite = (piece, r, c) => !coupsLegaux(state.board, piece)
        .some((move) => move.r === r && move.c === c);
      if (!caseInterdite(pionGauche, 3, 3) || !caseInterdite(pionDroit, 3, 5)) return false;

      const centre = (r, c) => ({
        x: OX + c * CELL + CELL / 2,
        y: OY + r * CELL + CELL / 2,
      });
      const now = performance.now();
      const demo = state._hypnoseDemo;

      // Les pions restent à leur place dans le plateau logique : l'animation
      // montre leur tentative d'entrer sur une case interdite, puis leur recul.
      if (!demo) {
        state._hypnoseDemo = { stage: 'gauche-approche' };
        state.phase = 'animating';
        state.anim = {
          piece: pionGauche,
          from: centre(2, 3),
          to: centre(3, 3),
          t0: now,
          onDone() {
            state.flashes.push({ r: 3, c: 3, t0: performance.now(), color: '#B57EDC' });
            state.popups.push({
              text: 'ZONE INTERDITE',
              x: centre(3, 3).x,
              y: centre(3, 3).y - 24,
              t0: performance.now(),
              color: '#B57EDC',
            });
            state._hypnoseDemo.stage = 'gauche-recul';
            state.phase = 'animating';
            state.anim = {
              piece: pionGauche,
              from: centre(3, 3),
              to: centre(2, 3),
              t0: performance.now(),
              onDone() {
                state._hypnoseDemo.stage = 'droit-approche';
                state.phase = 'animating';
                state.anim = {
                  piece: pionDroit,
                  from: centre(2, 5),
                  to: centre(3, 5),
                  t0: performance.now(),
                  onDone() {
                    state.flashes.push({ r: 3, c: 5, t0: performance.now(), color: '#B57EDC' });
                    state.popups.push({
                      text: 'ZONE INTERDITE',
                      x: centre(3, 5).x,
                      y: centre(3, 5).y - 24,
                      t0: performance.now(),
                      color: '#B57EDC',
                    });
                    state._hypnoseDemo.stage = 'droit-recul';
                    state.phase = 'animating';
                    state.anim = {
                      piece: pionDroit,
                      from: centre(3, 5),
                      to: centre(2, 5),
                      t0: performance.now(),
                      onDone() {
                        state._hypnoseDemo.stage = 'termine';
                        state._hypnoseDemo.done = true;
                        state.phase = 'learn-game';
                      },
                    };
                  },
                };
              },
            };
          },
        };
        return false;
      }

      return !!demo.done;
    },
  },
  {
    id: 'decret', title: 'Décret', upgrade: 'Décret', upgradeId: 'decret', category: 'ACTIF', cost: 12, color: '#F0B15E',
    text: 'Le roi échange sa place avec une pièce alliée adjacente.',
    detail: 'Sélectionne le roi, active DÉCRET, puis choisis la tour à sa droite. Une sortie d’urgence en un clic.',
    objective: 'Échanger les positions', setup: scenarioDecret,
    hint: (state) => state.phase === 'decret-target' ? { cells: [{ r: 6, c: 5 }] } : { cells: [{ r: 6, c: 4 }] },
    power: 'decret', check: (state) => state.board[6][5]?.type === 'K' && state.board[6][5].decretUsed,
  },
  {
    id: 'marche-arriere', title: 'Marche arrière', upgrade: 'Marche arrière', upgradeId: 'marche-arriere', category: 'DÉPLACEMENT', cost: 4, color: '#8FB8E0',
    text: 'Le pion peut reculer quand sa route est bloquée.',
    detail: 'Le pion est bloqué par un allié devant lui. Fais-le reculer d’une case pour retrouver de l’espace.',
    objective: 'Reculer d’une case', setup: scenarioMarcheArriere,
    hint: () => ({ cells: [{ r: 4, c: 4 }, { r: 5, c: 4 }] }),
    check: (state) => state.board[5][4]?.type === 'P'
      && state.board[5][4].upgrades.includes('marche-arriere'),
  },
  {
    id: 'pivot', title: 'Pivot', upgrade: 'Pivot', upgradeId: 'pivot', category: 'DÉPLACEMENT', cost: 7, color: '#8FB8E0',
    text: 'La tour gagne un pas diagonal.',
    detail: 'La tour peut atteindre la case diagonale d3, impossible avec son déplacement classique.',
    objective: 'Jouer un pas diagonal', setup: scenarioPivot,
    hint: () => ({ cells: [{ r: 4, c: 4 }, { r: 3, c: 3 }] }),
    check: (state) => state.board[3][3]?.type === 'R'
      && state.board[3][3].upgrades.includes('pivot'),
  },
  {
    id: 'enjambeur', title: 'Enjambeur', upgrade: 'Enjambeur', upgradeId: 'enjambeur', category: 'DÉPLACEMENT', cost: 6, color: '#8FB8E0',
    text: 'La tour saute le premier obstacle rencontré.',
    detail: 'Un pion allié bloque la ligne. Fais franchir l’obstacle à la tour pour atterrir juste derrière.',
    objective: 'Sauter un obstacle', setup: scenarioEnjambeur,
    hint: () => ({ cells: [{ r: 4, c: 4 }, { r: 4, c: 6 }] }),
    check: (state) => state.board[4][6]?.type === 'R'
      && state.board[4][6].upgrades.includes('enjambeur'),
  },
  {
    id: 'reprise', title: 'Folie', upgrade: 'Folie', upgradeId: 'reprise', category: 'DÉPLACEMENT', cost: 5, color: '#8FB8E0',
    text: 'Le fou peut frapper comme une tour une fois.',
    detail: 'Le pion en f6 est horizontal au fou. Active la Folie en jouant cette capture inhabituelle.',
    objective: 'Capturer comme une tour', setup: scenarioReprise,
    hint: () => ({ cells: [{ r: 4, c: 4 }, { r: 4, c: 6 }] }),
    check: (state) => state.board[4][6]?.type === 'B'
      && state.board[4][6].folieUsed,
  },
  {
    id: 'feinte', title: 'Feinte', upgrade: 'Feinte', upgradeId: 'feinte', category: 'DÉPLACEMENT', cost: 12, color: '#8FB8E0',
    text: 'La dame peut surprendre comme un cavalier.',
    detail: 'La cible est à un saut de cavalier. Utilise la Feinte pour atteindre une case que la dame ne peut normalement pas viser.',
    objective: 'Capturer en saut de cavalier', setup: scenarioFeinte,
    hint: () => ({ cells: [{ r: 4, c: 4 }, { r: 2, c: 5 }] }),
    check: (state) => state.board[2][5]?.type === 'Q'
      && state.board[2][5].feinteUsed,
  },
  {
    id: 'passe-royale', title: 'Passe royal', upgrade: 'Passe royal', upgradeId: 'passe-royale', category: 'DÉPLACEMENT', cost: 8, color: '#8FB8E0',
    text: 'Le roi bondit de deux cases sans capturer.',
    detail: 'Fais franchir au roi les deux cases libres en ligne droite pour sortir de la zone dangereuse.',
    objective: 'Bondir de deux cases', setup: scenarioPasseRoyale,
    hint: () => ({ cells: [{ r: 6, c: 4 }, { r: 4, c: 4 }] }),
    check: (state) => state.board[4][4]?.type === 'K'
      && state.board[4][4].upgrades.includes('passe-royale'),
  },
];

export const TOTAL_LEARN_GAMES = LEARN_GAMES.length;

const PUZZLE_STORAGE_KEY = 'roychec-puzzle-progress';

export const PUZZLES = [
  {
    id: 'puzzle-enjambeur', title: 'La ligne bloquée', upgrade: 'Enjambeur', upgradeId: 'enjambeur',
    category: 'PUZZLE · DÉPLACEMENT', cost: 6, color: '#8FB8E0',
    text: "Ta tour est menacée par le cavalier et par la tour adverse. Trouve une manière de mettre la pression sur la cavalier sans rester dans le champ d'action de la tour.",
    detail: "Achète Enjambeur, franchis l'obstacle, puis observe la réponse adverse. Une autre pièce ennemie garde la case de sortie.",
    objective: "Atteindre la case derrière l'obstacle", setup: scenarioPuzzleEnjambeur,
    hint: (state) => ({ cells: state.puzzlePurchased ? [{ r: 4, c: 6 }] : [{ r: 4, c: 4 }] }),
    failMessage: "La tour doit franchir l'obstacle maintenant : chaque autre coup laisse la ligne se fermer.",
    response: { from: { r: 2, c: 7 }, to: { r: 3, c: 7 }, text: 'Les renforts avancent.', color: '#B86F6B' },
    check: (state) => state.puzzlePurchased && state.puzzleResponseDone
      && state.board[4][6]?.type === 'R'
      && state.board[4][6].upgrades.includes('enjambeur'),
  },
  {
    id: 'puzzle-angle-mort', title: "L'angle mort", upgrade: 'Pas de côté', upgradeId: 'pas-de-cote',
    category: 'PUZZLE · DÉPLACEMENT', cost: 6, color: '#8FB8E0',
    text: "La dame ennemie menace le centre, mais ton fou peut la prendre par un angle inattendu.",
    detail: 'Ton roi est en échec par la reine en c3. Achète Pas de côté, puis sauve-le en capturant la reine depuis e4.',
    objective: 'Sauver le roi en capturant la reine', setup: scenarioPuzzlePasDeCote,
    hint: (state) => ({ cells: state.puzzlePurchased ? [{ r: 5, c: 2 }] : [{ r: 4, c: 4 }] }),
    failMessage: 'Ton roi est en échec : le fou doit capturer la reine en c3 grâce au saut en L.',
    response: { from: { r: 1, c: 2 }, to: { r: 2, c: 2 }, text: 'Le pion adverse reprend sa marche.', color: '#B86F6B' },
    check: (state) => state.puzzlePurchased && state.puzzleResponseDone
      && state.board[5][2]?.type === 'B'
      && state.board[5][2].upgrades.includes('pas-de-cote'),
  },
  {
    id: 'puzzle-ruee', title: "L'assassin immobile", upgrade: 'Ruée', upgradeId: 'ruee',
    category: 'PUZZLE · ACTIF', cost: 9, color: '#F0B15E',
    text: 'La reine en g3 est protégée par la tour en g7. Une capture directe placerait ton cavalier sous attaque.',
    detail: 'Achète Ruée et capture la reine à distance : le cavalier reste en e4 et évite la tour qui contrôle g3.',
    objective: 'Capturer sans entrer sous la menace de la tour', setup: scenarioPuzzleRuee,
    hint: (state) => state.phase === 'ruee-target' ? { cells: [{ r: 5, c: 6 }] } : { cells: [{ r: 4, c: 4 }] },
    failMessage: 'Ne déplace pas le cavalier sur g3 : la tour en g7 contrôle cette case. Utilise Ruée depuis e4.',
    response: { from: { r: 0, c: 7 }, to: { r: 1, c: 7 }, text: 'Le pion adverse avance ; la tour garde g3.', color: '#B86F6B' },
    power: 'ruee', check: (state) => state.puzzlePurchased && state.puzzleResponseDone
      && !state.board[5][6]
      && state.board[4][3]?.type === 'N'
      && state.board[4][3].upgrades.includes('ruee'),
  },
  {
    id: 'puzzle-feinte', title: 'Le saut impossible', upgrade: 'Feinte', upgradeId: 'feinte',
    category: 'PUZZLE · DÉPLACEMENT', cost: 12, color: '#8FB8E0',
    text: 'La tour ennemie verrouille la diagonale : seule une feinte de cavalier permet à la dame de la prendre.',
    detail: 'Achète Feinte, capture la tour par le saut en L, puis laisse le fou adverse reprendre une case de contrôle.',
    objective: 'Capturer par un saut de cavalier', setup: scenarioPuzzleFeinte,
    hint: () => ({ cells: [{ r: 4, c: 3 }, { r: 2, c: 2 }] }),
    failMessage: 'La dame doit surprendre la tour par le saut en L : ses mouvements habituels ne suffisent pas.',
    response: { from: { r: 0, c: 7 }, to: { r: 4, c: 3 }, text: 'Le fou adverse essaye de reprendre le contrôle.', color: '#B86F6B' },
    check: (state) => state.puzzlePurchased && state.puzzleResponseDone
      && state.board[2][2]?.type === 'Q'
      && state.board[2][2].upgrades.includes('feinte')
      && state.board[2][2].feinteUsed,
  },
  {
    id: 'puzzle-couronne', title: 'Le bouclier royal', upgrade: 'Couronne', upgradeId: 'couronne',
    category: 'PUZZLE · STAT', cost: 9, color: '#9BCB8C',
    text: 'La dame doit capturer un pion placé dans le rayon du roi adverse.',
    detail: 'Achète Couronne, capture le pion en d3 avec la dame, puis vois le roi en d2 tenter une vraie reprise absorbée par le bouclier royal.',
    objective: 'Capturer sous la protection de Couronne', setup: scenarioPuzzleCouronne,
    hint: (state) => ({ cells: state.puzzlePurchased ? [{ r: 5, c: 3 }] : [{ r: 4, c: 4 }] }),
    failMessage: 'La dame doit prendre le pion en d3 : Couronne est nécessaire pour survivre à la reprise du roi en d2.',
    response: { from: { r: 6, c: 3 }, to: { r: 5, c: 3 }, capture: true, shieldedCapture: true,
      text: 'Le roi tente la reprise : Couronne absorbe la capture.', color: '#4FA79C' },
    check: (state) => state.puzzlePurchased && state.puzzleResponseDone && state.puzzleShieldUsed
      && state.board[5][3]?.type === 'Q'
      && state.board[5][3].upgrades.includes('couronne')
      && !state.board[5][3].shield,
  },
  {
    id: 'puzzle-mariage', title: 'Le mariage stratégique', upgrade: 'Mariage stratégique', upgradeId: 'sacrifice',
    category: 'PUZZLE · ACTIF', cost: 12, color: '#F0B15E',
    text: 'La reine ennemie se rapproche du roi et prépare une attaque derrière un pion.',
    detail: 'Achète Mariage stratégique sur le roi, active-le avant que la reine en e3 ne puisse bouger, puis observe le pion adverse avancer.',
    objective: 'Sauver le roi en immobilisant la reine', setup: scenarioPuzzleMariage,
    hint: () => ({ cells: [{ r: 7, c: 4 }] }),
    failMessage: 'Le roi doit immobiliser la reine en e3 avec Mariage stratégique avant qu’elle ne puisse agir.',
    response: { from: { r: 1, c: 7 }, to: { r: 2, c: 7 }, text: 'Le pion avance, mais la reine reste immobilisée.', color: '#B86F6B' },
    power: 'sacrifice', check: (state) => state.puzzlePurchased && state.puzzleResponseDone
      && state.board[5][4]?.type === 'Q'
      && state.board[5][4].debuffs.root > 0
      && state.board[7][4]?.type === 'K',
  },
  {
    id: 'puzzle-echange', title: 'La tour en embuscade', upgrade: 'Échange', upgradeId: 'echange',
    category: 'PUZZLE · ACTIF', cost: 9, color: '#F0B15E',
    text: 'Un pion bloque la tour, mais sa place ouvre une ligne d’échec vers le roi adverse.',
    detail: 'Achète Échange, sélectionne la tour en b4, échange-la avec le pion en e4 et ouvre la colonne jusqu’au roi en e8.',
    objective: 'Mettre le roi adverse en échec par Échange', setup: scenarioPuzzleEchange,
    hint: (state) => state.phase === 'echange-target'
      ? { cells: [{ r: 4, c: 4 }] }
      : { cells: [{ r: 4, c: 1 }] },
    failMessage: 'La tour doit échanger sa place avec le pion en e4 pour ouvrir la colonne et mettre le roi en échec.',
    response: { from: { r: 0, c: 4 }, to: { r: 1, c: 3 }, text: 'Le roi est obligé de bouger pour ne plus être en échec.', color: '#B86F6B' },
    power: 'echange', check: (state) => state.puzzlePurchased && state.puzzleResponseDone
      && state.board[1][3]?.type === 'K'
      && state.board[4][4]?.type === 'R'
      && state.board[4][4].upgrades.includes('echange')
      //&& roiEnEchec(state.board, 1),
  },
];

export const TOTAL_PUZZLES = PUZZLES.length;

function lireProgression() {
  try {
    const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
    return Array.isArray(parsed.completed) ? parsed : { completed: [] };
  } catch (_) { return { completed: [] }; }
}

function ecrireProgression(progress) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(progress)); } catch (_) { /* non bloquant */ }
}

export function progressionApprendre() { return lireProgression(); }

function lireProgressionPuzzles() {
  try {
    const parsed = JSON.parse(localStorage.getItem(PUZZLE_STORAGE_KEY) || '{}');
    return Array.isArray(parsed.completed) ? parsed : { completed: [] };
  } catch (_) { return { completed: [] }; }
}

function ecrireProgressionPuzzles(progress) {
  try { localStorage.setItem(PUZZLE_STORAGE_KEY, JSON.stringify(progress)); } catch (_) { /* non bloquant */ }
}

export function progressionPuzzles() { return lireProgressionPuzzles(); }

export function apprendrePuzzleEstDebloque(state, index) {
  if (!Number.isInteger(index) || index < 0 || index >= PUZZLES.length) return false;
  if (index === 0) return true;
  const completed = new Set(state?.puzzleProgress?.completed || lireProgressionPuzzles().completed || []);
  return completed.has(PUZZLES[index - 1].id);
}

export function marquerPuzzleReussi(state) {
  const progress = lireProgressionPuzzles();
  const id = PUZZLES[state.puzzleIndex]?.id;
  if (id && !progress.completed.includes(id)) {
    progress.completed.push(id);
    ecrireProgressionPuzzles(progress);
  }
  return progress;
}

// Une case est disponible si elle est la première du parcours ou si la case
// précédente a été maîtrisée. Les cases déjà réussies restent rejouables.
export function apprendreEstDebloque(state, index) {
  if (!Number.isInteger(index) || index < 0 || index >= LEARN_GAMES.length) return false;
  if (index === 0) return true;
  const completed = new Set(state?.learnProgress?.completed || lireProgression().completed || []);
  return completed.has(LEARN_GAMES[index - 1].id);
}

export function marquerMiniJeuReussi(state) {
  const progress = lireProgression();
  const id = LEARN_GAMES[state.learnIndex]?.id;
  if (id && !progress.completed.includes(id)) {
    progress.completed.push(id);
    ecrireProgression(progress);
  }
  return progress;
}

export function demarrerApprendre(state) {
  state.mode = 'learn';
  state.learnKind = 'classic';
  state.phase = 'learn-hub';
  state.board = null;
  state.turn = null;
  state.selected = null;
  state.legalMoves = [];
  state.panelPiece = null;
  state.ruTargets = [];
  state.learnIndex = null;
  state.puzzleIndex = null;
  state.learnSuccess = false;
  state.learnProgress = lireProgression();
  state.puzzleProgress = lireProgressionPuzzles();
}

export function demarrerPuzzles(state) {
  state.mode = 'learn';
  state.learnKind = 'puzzle';
  state.phase = 'puzzle-hub';
  state.board = null;
  state.turn = null;
  state.selected = null;
  state.legalMoves = [];
  state.panelPiece = null;
  state.ruTargets = [];
  state.learnIndex = null;
  state.puzzleIndex = null;
  state.learnSuccess = false;
  state.puzzleProgress = lireProgressionPuzzles();
}

function poserPieceAttendue(state, definition) {
  // Les niveaux qui ne font pas acheter une carte (ex. Bouclier : la pièce
  // adverse est déjà protégée pour illustrer la règle) restent immédiatement
  // jouables. Tous les autres commencent verrouillés jusqu'à l'achat.
  state.learnPurchased = !definition?.upgradeId;
  state.learnAutoDemo = !!definition?.noMove;
  const hint = definition && definition.hint ? definition.hint(state) : null;
  const cell = hint && hint.cells && hint.cells[0];
  state.learnExpectedPiece = cell && state.board && state.board[cell.r]
    ? state.board[cell.r][cell.c] || null
    : null;
}

export function demarrerMiniJeu(state, index) {
  const game = LEARN_GAMES[index];
  if (!game) return false;
  state.learnKind = 'classic';
  state.learnIndex = index;
  state.puzzleIndex = null;
  state.learnProgress = lireProgression();
  game.setup(state);
  poserPieceAttendue(state, game);
  return true;
}

export function demarrerPuzzle(state, index) {
  const puzzle = PUZZLES[index];
  if (!puzzle) return false;
  state.learnKind = 'puzzle';
  state.puzzleIndex = index;
  state.learnIndex = null;
  state.puzzleProgress = lireProgressionPuzzles();
  puzzle.setup(state);
  state.puzzleUpgrade = puzzle.upgradeId;
  poserPieceAttendue(state, puzzle);
  return true;
}

export function verifierMiniJeu(state) {
  const game = LEARN_GAMES[state.learnIndex];
  return !!(game && game.check && game.check(state));
}

export function verifierPuzzle(state) {
  const puzzle = PUZZLES[state.puzzleIndex];
  return !!(puzzle && puzzle.check && puzzle.check(state));
}

function puzzleCourant(state) {
  return state && state.learnKind === 'puzzle' ? PUZZLES[state.puzzleIndex] : null;
}

export function puzzleReponse(state) {
  const puzzle = puzzleCourant(state);
  return puzzle && puzzle.response ? {
    ...puzzle.response,
    from: { ...puzzle.response.from },
    to: { ...puzzle.response.to },
  } : null;
}

export function marquerPuzzleReponse(state) {
  if (puzzleCourant(state)) {
    state.puzzleResponseDone = true;
    state.puzzleResponsePending = false;
  }
}

export function reinitialiserMiniJeu(state) {
  const game = LEARN_GAMES[state.learnIndex];
  if (game) {
    game.setup(state);
    poserPieceAttendue(state, game);
  }
}

export function reinitialiserPuzzle(state) {
  const puzzle = PUZZLES[state.puzzleIndex];
  if (puzzle) {
    puzzle.setup(state);
    poserPieceAttendue(state, puzzle);
  }
}

export function apprendreHint(state) {
  if (state.learnKind === 'puzzle') {
    const puzzle = PUZZLES[state.puzzleIndex];
    return puzzle && puzzle.hint ? puzzle.hint(state) : null;
  }
  const game = LEARN_GAMES[state.learnIndex];
  return game && game.hint ? game.hint(state) : null;
}

// Liste blanche des actions du mode APPRENDRE. Les niveaux restent jouables avec
// le moteur réel, mais le joueur ne peut pas sortir du scénario prévu : une seule
// pièce, une seule case solution, un seul achat ou pouvoir selon le niveau.
export function learnPermet(state, action) {
  if (!state || state.mode !== 'learn') return true;
  const definition = state.learnKind === 'puzzle'
    ? PUZZLES[state.puzzleIndex]
    : LEARN_GAMES[state.learnIndex];
  if (!definition || !action) return false;
  const hint = definition.hint ? definition.hint(state) : null;
  const cells = Array.isArray(hint?.cells) ? hint.cells : [];
  const sameCell = (a, b) => !!a && !!b && a.r === b.r && a.c === b.c;
  const expectedPiece = state.learnExpectedPiece;
  const selectedPiece = action.piece;
  const mustPurchase = !!definition.upgradeId;

  switch (action.type) {
    case 'select':
      // Après un achat, la pièce guidée est conservée même si le hint passe à la
      // case d'arrivée du puzzle.
      if (expectedPiece && selectedPiece === expectedPiece) return true;
      return !!(selectedPiece && selectedPiece.owner === 0
        && cells[0] && selectedPiece.r === cells[0].r && selectedPiece.c === cells[0].c);
    case 'panel':
      return mustPurchase && !state.learnPurchased && selectedPiece === expectedPiece;
    case 'buy':
      return mustPurchase && !state.learnPurchased
        && action.id === definition.upgradeId
        && state.panelPiece === expectedPiece;
    case 'power':
      return !!definition.power && state.learnPurchased
        && action.kind === definition.power
        && selectedPiece === expectedPiece;
    case 'move': {
      const target = cells.length > 1 ? cells[1] : cells[0];
      if (state.learnKind === 'puzzle') {
        if (!expectedPiece || selectedPiece !== expectedPiece || state.puzzleResponseDone) return false;
        // Une position tactique peut exiger un pouvoir actif : un déplacement
        // légal mais non pertinent doit tout de même expliquer l'idée au joueur.
        if (definition.power || definition.noMove || (mustPurchase && !state.learnPurchased)
            || !target || !sameCell(action.move, target)) {
          state.puzzleFeedback = definition.failMessage
            || 'Ce coup ne résout pas la position. Réessaie depuis la même position.';
          state.buzz = performance.now();
          return false;
        }
        state.puzzleFeedback = '';
        return true;
      }
      if (definition.power || definition.noMove || (mustPurchase && !state.learnPurchased)) return false;
      return !!(expectedPiece && selectedPiece === expectedPiece && target
        && sameCell(action.move, target));
    }
    case 'target':
      if (state.learnKind === 'puzzle') {
        if (state.puzzleResponseDone) return false;
        if (!definition.power || !state.learnPurchased || !cells[0]
            || !sameCell(action.cell, cells[0])) {
          state.puzzleFeedback = definition.failMessage
            || 'Cette cible ne résout pas la position. Réessaie depuis la même position.';
          state.buzz = performance.now();
          return false;
        }
        state.puzzleFeedback = '';
        return true;
      }
      return !!(definition.power && state.learnPurchased
        && cells[0] && sameCell(action.cell, cells[0]));
    default:
      return false;
  }
}

export function apprendrePower(state) {
  if (state.learnKind === 'puzzle') {
    const puzzle = PUZZLES[state.puzzleIndex];
    return puzzle && puzzle.power ? puzzle.power : null;
  }
  const game = LEARN_GAMES[state.learnIndex];
  return game && game.power ? game.power : null;
}
