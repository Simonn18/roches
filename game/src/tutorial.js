// roychec — tutoriel interactif guidé.
// Chaque étape = un plateau pré-configuré, des instructions, une validation
// automatique ET une liste blanche d'actions (`allow`). En mode tutoriel, tout
// ce qui n'est pas explicitement autorisé par l'étape courante est bloqué :
// main.js et render.js consultent tutorielPermet() avant d'agir, si bien
// qu'aucun clic ne peut sortir l'étape de son scénario ni casser le jeu.
import { creerPiece } from './board.js';
import { UPGRADES, CELL, OX, OY } from './constants.js';
// Variantes locales (GDD §7.2 v3, delivré 12/07) : basePlateau doit poser
// state.variant pour que crediterCoup() (rewiré dans le lot variantes) lise
// v.revenueBase / v.plafond / v.captureMul sans crasher. capturesDep pour
// la même raison — jouée par jouerCoup() à chaque capture, cf. fix W3.
import { reglesEconomie, DEFAULT_VARIANT } from './variants.js';

function plateauVide() {
  return Array.from({ length: 8 }, () => Array(8).fill(null));
}

// Centre pixel d'une case (équivalent de cellCenter — render.js importe ce
// module, on ne peut pas l'importer en retour sans cycle).
const centre = (r, c) => ({ x: OX + c * CELL + CELL / 2, y: OY + r * CELL + CELL / 2 });

// Pose le plateau d'une étape et remet à zéro tous les champs transients de
// l'état. Chaque setup est auto-suffisant : une étape peut être rejouée
// (rejouerEtape) sans dépendre de l'étape précédente.
function basePlateau(state, b, ecus) {
  state.board = b;
  state.turn = 0;
  state.ecus = [ecus, 0];
  state.selected = null;
  state.legalMoves = [];
  state.panelPiece = null;
  state.chain = null;
  state.ruTargets = [];
  state.winner = null;
  state.phase = 'play';
  state.ai = null;
  state.mode = 'tutorial';
  state.anim = null;
  state.popups = [];
  state.flashes = [];
  state._tutoDemo = null;
  // Variante (GDD §7.2 v3) : le tutoriel ignore les chips ÉCONOMIE/COMBAT
  // sélectionnés au menu ('pvp_standard' partout — cf. variantesPourMode()), on
  // pose donc l'objet standard dans tous les cas. AVANT ce fix, le 1er coup
  // du tutoriel (étape 1) appelait crediterCoup() → state.variant indéfini
  // → TypeError « Cannot read properties of undefined (reading 'revenueBase') »
  // → tour jamais rendu (jeu perçu figé). capturesDep suit le même raisonnement
  // (utilisé par jouerCoup dès l'étape 2, capture).
  state.variant = reglesEconomie(DEFAULT_VARIANT);
  state.capturesDep = [0, 0];
}

const estJoueur = (p) => !!p && p.owner === 0;

// Toutes les étapes du tutoriel, dans l'ordre.
// Champs par étape :
//   title / text / detail : instructions affichées dans le HUD latéral.
//   setup(state)          : plateau auto-suffisant.
//   check(state)          : condition de passage, évaluée chaque frame.
//   allow                 : liste blanche — select / move / panel / buy / power.
//                           Absent ou vide = action bloquée (défaut : tout est verrouillé).
//   hint(state)?          : { cells, buyId, power } — cibles à surligner pour guider.
//   continuer?            : true = étape de lecture, validée par le bouton CONTINUER.
//   panneauNormal(state)? : true = affiche le panneau latéral normal (boutons pouvoir).
export const STEPS = [
  // ═══ Étape 1 : Déplacer une pièce ═══
  {
    title: 'Déplacer une pièce',
    text: 'Sélectionne le pion et déplace-le.',
    detail: 'Clique sur le pion signalé, puis sur une des cases proposées. Seul ce pion répond : le reste du plateau est verrouillé pendant le tutoriel.',
    setup(state) {
      const b = plateauVide();
      b[6][4] = creerPiece('P', 0, 6, 4); // pion e2 (joueur)
      b[7][4] = creerPiece('K', 0, 7, 4); // roi e1
      b[1][3] = creerPiece('P', 1, 1, 3); // pion adverse d7 (décor)
      b[0][3] = creerPiece('K', 1, 0, 3); // roi adverse d8 (décor)
      basePlateau(state, b, 0);
    },
    allow: {
      select: (state, p) => estJoueur(p) && p.type === 'P',
      move: () => true,
    },
    hint(state) { return state.selected ? null : { cells: [{ r: 6, c: 4 }] }; },
    check(state) {
      // Le pion a quitté sa case de départ (e2 = row 6, col 4).
      return state.board[6][4] === null;
    },
  },

  // ═══ Étape 2 : Capturer une pièce ═══
  {
    title: 'Capturer une pièce',
    text: 'Capture le pion adverse avec ton pion.',
    detail: 'Le cercle rouge = capture possible. Les captures rapportent un bonus d\'écus égal à la valeur de la pièce prise.',
    setup(state) {
      const b = plateauVide();
      b[4][4] = creerPiece('P', 0, 4, 4); // pion joueur en e4
      b[3][3] = creerPiece('P', 1, 3, 3); // pion adverse en d5
      b[7][4] = creerPiece('K', 0, 7, 4); // roi joueur
      b[0][3] = creerPiece('K', 1, 0, 3); // roi adverse
      basePlateau(state, b, 4);
    },
    allow: {
      select: (state, p) => estJoueur(p) && p.type === 'P',
      // Seule la capture est ouverte : impossible de « rater » l'étape en avançant tout droit.
      move: (state, p, mv) => !!mv.capture,
    },
    hint() { return { cells: [{ r: 3, c: 3 }] }; },
    check(state) {
      const p = state.board[3][3];
      return !!(p && p.owner === 0);
    },
  },

  // ═══ Étape 3 : L'économie d'écus ═══
  {
    title: 'Les écus',
    text: 'Chaque coup rapporte +2 écus. Une capture ajoute la valeur de la pièce prise.',
    detail: 'Ton solde est affiché ci-dessous (plafond : 30 écus). Les écus servent à acheter des améliorations — c\'est le cœur de roychec. Clique CONTINUER.',
    setup(state) {
      const b = plateauVide();
      b[3][3] = creerPiece('P', 0, 3, 3); // le pion victorieux de l'étape précédente
      b[7][4] = creerPiece('K', 0, 7, 4);
      b[0][3] = creerPiece('K', 1, 0, 3);
      basePlateau(state, b, 10);
    },
    allow: {}, // lecture seule : tout clic plateau est verrouillé
    continuer: true,
    check(state) { return state._tutorialAdvance; },
  },

  // ═══ Étape 4 : Acheter une amélioration ═══
  {
    title: 'Améliorer une pièce',
    text: 'Un pion ennemi menace ta tour ! Achète FORTERESSE pour la blinder.',
    detail: `Clic droit sur la tour (ou clic gauche puis AMÉLIORER) pour ouvrir le panneau, puis clique sur la carte Forteresse (${UPGRADES['forteresse'].cout} écus). Regarde ensuite le pion tenter sa capture…`,
    setup(state) {
      const b = plateauVide();
      b[7][0] = creerPiece('R', 0, 7, 0); // tour joueur en a1
      b[6][1] = creerPiece('P', 1, 6, 1); // pion ennemi en b2 — menace RÉELLE (capture diagonale vers a1)
      b[7][4] = creerPiece('K', 0, 7, 4); // roi joueur
      b[0][3] = creerPiece('K', 1, 0, 3); // roi adverse
      basePlateau(state, b, 10);
    },
    allow: {
      select: (state, p) => estJoueur(p) && p.type === 'R',
      panel: (state, p) => estJoueur(p) && p.type === 'R',
      buy: (state, id) => id === 'forteresse',
      // Pas de move : la tour doit rester en a1 pour la démo du blindage.
    },
    // Tour sélectionnée au clic gauche → panneau normal visible : le joueur
    // doit voir le bouton AMÉLIORER (l'instruction propose les deux chemins).
    panneauNormal(state) {
      return !!(state.selected && state.selected.type === 'R');
    },
    hint(state) {
      if (!state.panelPiece) return { cells: [{ r: 7, c: 0 }] };
      return { buyId: 'forteresse' };
    },
    check(state) {
      const tour = state.board[7][0];
      if (!tour || !tour.upgrades.includes('forteresse')) return false;
      const now = performance.now();
      // Forteresse achetée — démo : le pion tente RÉELLEMENT sa capture, le
      // blindage bloque et l'attaquant reste sur place (règle GDD §5.5).
      // Machine à 3 temps : lire (l'anneau apparaît) → charge (aller-retour
      // du pion via state.anim, séquencé par les onDone) → fin (pause lecture).
      if (!state._tutoDemo) {
        state._tutoDemo = { stage: 'lire', t0: now };
        state.panelPiece = null; // ferme le catalogue : le regard revient au plateau
      }
      const demo = state._tutoDemo;
      const pion = state.board[6][1];
      if (demo.stage === 'lire' && now - demo.t0 > 700 && pion) {
        demo.stage = 'charge';
        state.phase = 'animating'; // fige les entrées pendant la démo
        state.anim = {
          piece: pion,
          from: centre(6, 1), to: centre(7, 0),
          t0: now,
          onDone() {
            // Impact : le blindage absorbe (anneau cyan consommé)…
            tour.shield = false;
            state.flashes.push({ r: 7, c: 0, t0: performance.now(), color: 'cyan' });
            const { x, y } = centre(7, 0);
            state.popups.push({ text: 'BLINDAGE !', x, y: y - 20, t0: performance.now(), color: '#4FA79C' });
            // …et le pion recule : la capture est annulée, il reste en b2.
            state.phase = 'animating';
            state.anim = {
              piece: pion,
              from: centre(7, 0), to: centre(6, 1),
              t0: performance.now(),
              onDone() { demo.stage = 'fin'; demo.tFin = performance.now(); state.phase = 'play'; },
            };
          },
        };
      }
      // Pause de lecture (~1.1 s) après l'attaque bloquée, puis étape suivante.
      return demo.stage === 'fin' && now - demo.tFin > 1100;
    },
  },

  // ═══ Étape 5 : La contre-attaque ═══
  {
    title: 'La contre-attaque',
    text: 'Ta tour a survécu grâce au blindage : capture le fou adverse en haut de la colonne !',
    detail: 'Le blindage est à usage unique — l\'anneau cyan a disparu. La carte Forteresse reste acquise (badge sous la pièce) et la tour vaut désormais 8 points.',
    setup(state) {
      const b = plateauVide();
      const tour = creerPiece('R', 0, 7, 0); // la tour de l'étape 4, blindage consommé
      tour.upgrades.push('forteresse');
      b[7][0] = tour;
      b[6][1] = creerPiece('P', 1, 6, 1); // le pion attaquant de l'étape 4, toujours là (continuité)
      b[0][0] = creerPiece('B', 1, 0, 0); // fou adverse en a8 (même colonne)
      b[7][4] = creerPiece('K', 0, 7, 4); // roi joueur
      b[0][4] = creerPiece('K', 1, 0, 4); // roi adverse
      basePlateau(state, b, 2);
    },
    allow: {
      select: (state, p) => estJoueur(p) && p.type === 'R',
      move: (state, p, mv) => !!mv.capture,
    },
    hint() { return { cells: [{ r: 0, c: 0 }] }; },
    check(state) {
      const p = state.board[0][0];
      return !!(p && p.owner === 0);
    },
  },

  // ═══ Étape 6 : Pouvoir actif — Ruée ═══
  {
    title: 'Pouvoir actif : Ruée',
    text: 'Sélectionne le cavalier, utilise le bouton RUÉE, puis choisis le pion ennemi.',
    detail: 'La Ruée capture à distance de cavalier SANS bouger. Les pouvoirs actifs se déclenchent par leur bouton dans le panneau.',
    setup(state) {
      const b = plateauVide();
      const cav = creerPiece('N', 0, 4, 4); // cavalier joueur en e4
      cav.upgrades.push('ruee');
      b[4][4] = cav;
      b[2][3] = creerPiece('P', 1, 2, 3); // pion adverse en d6 (à distance de cavalier)
      b[7][4] = creerPiece('K', 0, 7, 4); // roi joueur
      b[0][4] = creerPiece('K', 1, 0, 4); // roi adverse
      basePlateau(state, b, 5);
    },
    allow: {
      select: (state, p) => estJoueur(p) && p.type === 'N',
      power: (state, kind) => kind === 'ruee',
      // Pas de move : le joueur doit passer par le bouton Ruée.
    },
    // Cavalier sélectionné → panneau normal visible (le vrai bouton Ruée).
    panneauNormal(state) {
      return !!(state.selected && state.selected.type === 'N');
    },
    hint(state) {
      if (!state.selected) return { cells: [{ r: 4, c: 4 }] };
      if (state.phase !== 'ruee-target') return { power: 'ruee' };
      return { cells: [{ r: 2, c: 3 }] };
    },
    check(state) {
      // Le pion adverse en d6 a été capturé par la Ruée.
      return state.board[2][3] === null;
    },
  },

  // ═══ Étape 7 : Recharges et limites ═══
  {
    title: 'Recharges et limites',
    text: 'Trois garde-fous : recharge des pouvoirs, 2 améliorations max par pièce, plafond de 30 écus.',
    detail: `La Ruée que tu viens d'utiliser se recharge en ${UPGRADES['ruee'].cooldown} tours. Chaque pièce accepte au plus 2 améliorations, perdues si elle est capturée. Clique CONTINUER.`,
    setup(state) {
      const b = plateauVide();
      const cav = creerPiece('N', 0, 4, 4); // le cavalier, pouvoir en recharge
      cav.upgrades.push('ruee');
      cav.cooldowns.ruee = UPGRADES['ruee'].cooldown;
      b[4][4] = cav;
      b[7][4] = creerPiece('K', 0, 7, 4);
      b[0][4] = creerPiece('K', 1, 0, 4);
      basePlateau(state, b, 5);
    },
    allow: {}, // lecture seule
    continuer: true,
    check(state) { return state._tutorialAdvance; },
  },

  // ═══ Étape 8 : Téléportation courte ═══
  {
    title: 'Téléportation courte',
    text: 'La dame est encerclée… téléporte-la ! Clique un anneau ambre pointillé.',
    detail: 'La Téléportation pose la dame sur une case vide à 3 cases ou moins en IGNORANT les obstacles. Certaines améliorations ouvrent des déplacements impossibles aux échecs.',
    setup(state) {
      const b = plateauVide();
      const dame = creerPiece('Q', 0, 4, 4); // dame joueur en e4
      dame.upgrades.push('Tele');
      b[4][4] = dame;
      // Anneau de pions alliés : tous les coups normaux sont bloqués,
      // seuls les anneaux de téléportation restent — la démonstration est pure.
      for (const [r, c] of [[3, 3], [3, 4], [3, 5], [4, 3], [4, 5], [5, 3], [5, 4], [5, 5]]) {
        b[r][c] = creerPiece('P', 0, r, c);
      }
      b[7][4] = creerPiece('K', 0, 7, 4); // roi joueur
      b[0][4] = creerPiece('K', 1, 0, 4); // roi adverse
      basePlateau(state, b, 3);
    },
    allow: {
      select: (state, p) => estJoueur(p) && p.type === 'Q',
      move: (state, p, mv) => !!mv.tele,
    },
    hint(state) { return state.selected ? null : { cells: [{ r: 4, c: 4 }] }; },
    check(state) {
      // La téléportation pose son cooldown : preuve que le coup joué était bien un tele.
      for (const row of state.board) {
        for (const p of row) {
          if (p && p.owner === 0 && p.type === 'Q') return (p.cooldowns.Tele || 0) > 0;
        }
      }
      return false;
    },
  },

  // ═══ Étape 9 : Victoire — capturer le roi ═══
  {
    title: 'Capturer le roi !',
    text: 'Capture le roi adverse avec ta dame pour gagner.',
    detail: 'Pas d\'échec ni de mat dans roychec : la partie se gagne en MANGEANT le roi adverse.',
    setup(state) {
      const b = plateauVide();
      b[1][4] = creerPiece('K', 1, 1, 4); // roi adverse en e7
      b[0][3] = creerPiece('P', 1, 0, 3); // pion adverse décor
      b[0][5] = creerPiece('P', 1, 0, 5); // pion adverse décor
      b[3][4] = creerPiece('Q', 0, 3, 4); // dame joueur en e5, prête à frapper
      b[7][4] = creerPiece('K', 0, 7, 4); // roi joueur
      basePlateau(state, b, 8);
    },
    allow: {
      select: (state, p) => estJoueur(p) && p.type === 'Q',
      move: () => true,
    },
    hint() { return { cells: [{ r: 1, c: 4 }] }; },
    check(state) {
      // Le roi adverse a été capturé.
      return state.winner !== null;
    },
  },
];

// Nombre total d'étapes.
export const TOTAL_STEPS = STEPS.length;

// Démarre le tutoriel à l'étape 0.
export function demarrerTutoriel(state) {
  state.tutorialStep = 0;
  state._tutorialAdvance = false;
  state._tutoBravoT = 0;
  STEPS[0].setup(state);
}

// Passe à l'étape suivante. Renvoie true si le tutoriel est terminé.
export function etapeSuivante(state) {
  state.tutorialStep++;
  state._tutorialAdvance = false;
  state._tutoDemo = null;
  state._tutoBravoT = performance.now(); // flash « BIEN JOUÉ ! » dans le HUD
  // Nettoie l'état entre les étapes.
  state.selected = null;
  state.legalMoves = [];
  state.panelPiece = null;
  state.chain = null;
  state.ruTargets = [];
  state.phase = 'play';
  if (state.tutorialStep >= TOTAL_STEPS) {
    // Tutoriel terminé
    state.phase = 'tutorial-done';
    return true;
  }
  STEPS[state.tutorialStep].setup(state);
  return false;
}

// Rejoue l'étape courante depuis zéro (bouton « Recommencer » du HUD) —
// filet de sécurité si le joueur s'est mis dans une impasse.
export function rejouerEtape(state) {
  if (state.mode !== 'tutorial') return;
  const step = STEPS[state.tutorialStep];
  if (!step) return;
  state._tutorialAdvance = false;
  state._tutoDemo = null;
  step.setup(state);
}

// Vérifie si l'étape courante est complétée.
export function verifierEtape(state) {
  if (state.mode !== 'tutorial') return false;
  const step = STEPS[state.tutorialStep];
  if (!step) return false;
  return step.check(state);
}

// Force l'avancement (pour les étapes de lecture validées par le bouton CONTINUER).
export function forcerAvancement(state) {
  if (state.mode === 'tutorial') {
    state._tutorialAdvance = true;
  }
}

// ---------- Verrouillage des actions (le cœur du guidage) ----------
// En mode tutoriel, TOUT est interdit par défaut ; chaque étape n'ouvre que
// les actions dont son scénario a besoin. Hors tutoriel : tout passe.
// Actions : { type: 'select'|'move'|'panel', piece } | { type: 'buy', id }
//         | { type: 'power', kind }.
export function tutorielPermet(state, action) {
  if (state.mode !== 'tutorial') return true;
  const step = STEPS[state.tutorialStep];
  if (!step || !step.allow) return false;
  const a = step.allow;
  switch (action.type) {
    case 'select': return !!(a.select && a.select(state, action.piece));
    case 'move': return !!(a.move && a.move(state, action.piece, action.move));
    case 'panel': return !!(a.panel && a.panel(state, action.piece));
    case 'buy': return !!(a.buy && a.buy(state, action.id));
    case 'power': return !!(a.power && a.power(state, action.kind));
    default: return false;
  }
}

// Cibles à surligner pour guider le joueur : { cells: [{r,c}], buyId, power }.
export function tutorielHint(state) {
  if (state.mode !== 'tutorial') return null;
  const step = STEPS[state.tutorialStep];
  if (!step || !step.hint) return null;
  return typeof step.hint === 'function' ? step.hint(state) : step.hint;
}

// Certaines étapes affichent le panneau latéral normal (boutons de pouvoir)
// à la place des instructions quand la bonne pièce est sélectionnée.
export function tutorielPanneauNormal(state) {
  const step = STEPS[state.tutorialStep];
  return !!(step && step.panneauNormal && step.panneauNormal(state));

}

