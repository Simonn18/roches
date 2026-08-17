// roychec — constantes partagées (GDD §6, §7).
// Aucun frontmatter : c'est du code. Suit les valeurs chiffrées du GDD.

// --- Économie (GDD §7) ---
export const REVENU_PAR_COUP = 2;   // +2 écus par coup joué
export const SOLDE_DEPART = 30; // GDD §7 : les deux joueurs commencent à sec.
export const PLAFOND_ECUS = 30;

// Valeurs de pièce = bonus de capture (GDD §7). Roi = 0 (fin de partie).
export const VALEUR_PIECE = { P: 1, N: 3, B: 3, R: 5, Q: 9, K: 0 };

// Lettres françaises affichées sur les pièces (type interne -> initiale FR).
export const LETTRE = { P: 'P', N: 'N', B: 'F', R: 'T', Q: 'D', K: 'R' };

// --- Catalogue d'améliorations livrées au MVP (GDD §9.5) ---
// 3 carte par type de pièce, mix des catégories. cat: D=déplacement, A=actif, S=stat.
export const UPGRADES = {
  'marche-arriere': {
    id: 'marche-arriere', nom: 'Marche arrière', cat: 'D', cout: 4, piece: 'P',
    desc: "Recule d'une case (jamais pour capturer).",
  },
  'bouclier':{
    id: 'bouclier', nom: 'Bouclier de fantassin',cat:'S',cout:6,piece: 'P',
    desc: 'Annule la prochaine capture subie'
  },
  'vet':{
    id: 'vet', nom: 'Vétéran',cat:'A',cout:5,piece: 'P', cooldown: 4,
    desc: "Capture le pion ennemi se trouvant directement en face du pion, sans bouger."
  },
  
  'second': {
    id: 'second', nom: 'Second Galop', cat: 'D', cout: 8, piece: 'N', cooldown: 3,
    desc: 'Le cavalier peut, une fois par tour où il ne capture pas, enchaîner un 2e saut (le deuxième saut ne peut pas capturer)',
  },
  'ruee': {
    id: 'ruee', nom: 'Ruée', cat: 'A', cout: 9, piece: 'N', cooldown: 4,
    desc: 'Capture un ennemi à distance de cavalier sans bouger.',
  },
  'monture': {
    id: 'monture', nom: 'Monture blindée', cat: 'S', cout: 7, piece: 'N', cooldown: 4,
    desc: 'Absorbe la première capture subie (survit une fois), puis boost consommé.',
  },

  'pas-de-cote': {
    id: 'pas-de-cote', nom: 'Pas de côté', cat: 'D', cout: 6, piece: 'B',
    desc: "Le fou peut se déplacer comme un cavalier (saut en L), en plus de sa diagonale.",
  },
  'Rayon': {
    id: 'Rayon', nom: 'Rayon sacré', cat: 'A', cout: 10, piece: 'B', cooldown: 4,
    desc: "Capture à distance la 1re pièce adverse sur une diagonale, sans bouger.",
  },
  'Zone': {
    id: 'Zone', nom: 'Parade', cat: 'S', cout: 6, piece: 'B',
    desc: "Parade : annule la prochaine capture subie par le fou.",
  },

  'pivot': {
    id: 'pivot', nom: 'Pivot', cat: 'D', cout: 7, piece: 'R',
    desc: "La tour peut se déplacer d'une case en diagonale (1 case seulement).",
  },
  'rempart': {
    id: 'rempart', nom: 'Rempart', cat: 'A', cout: 9, piece: 'R',cooldown:5,
    desc: "La tour se pose ; elle et les alliés orthogonalement adjacents sont blindés (survivent à 1 prise) jusqu'au prochain tour du joueur.",
  },
  'forteresse': {
    id: 'forteresse', nom: 'Forteresse', cat: 'S', cout: 8, piece: 'R',
    desc: 'Absorbe la première capture subie.',
  },

  'Tele': {
    id: 'Tele', nom: 'Téléportation courte', cat: 'D', cout: 12, piece: 'Q', cooldown:5,
    desc: "la dame se pose sur n'importe quelle case vide à 3 cases autour maximum (ignore les obstacles)",
  },
  'double-coup': {
    id: 'double-coup', nom: 'Double coup', cat: 'A', cout: 15, piece: 'Q', once: true,
    desc: 'Rejoue un 2e coup.',
  },
  'couronne': {
    id: 'couronne', nom: 'Couronne', cat: 'S', cout: 9, piece: 'Q',
    desc: 'La dame absorbe la première capture subie (survit une fois).',
  },

  'passe-royale': {
    id: 'passe-royale', nom: 'Passe royal', cat: 'D', cout: 8, piece: 'K',
    desc:"Le roi peut se déplacer de 2 cases en ligne droite (orthogonal/diagonal), cases libres.",
  },
  // Roi — 1re actif : si la reine adverse est à 2 cases ou moins, elle ne peut plus bouger pendant 2 tours
  'sacrifice': {
    id: 'sacrifice', nom: 'Mariage stratégique', cat: 'A', cout: 12, piece: 'K', cooldown: 6,
    desc: "Si la reine adverse est à 2 cases ou moins du roi, elle ne peut plus bouger pendant les 2 prochains tours.",
  },
  'decret': {
    id: 'decret', nom: 'Décret', cat: 'A', cout: 12, piece: 'K', once: true,
    desc: "Échange la position du roi avec une de ses pièces alliées adjacentes (mini-roque libre).",
  },

  // --- Catalogue étendu [21:30] — 2 D + 2 A + 1 S par pièce (5 cartes × 6 types = 30) ---
  // Pion — 2e déplacement (cumul avec Marche arrière)
  'pas-diag': {
    id: 'pas-diag', nom: 'Pas diagonal', cat: 'D', cout: 4, piece: 'P',
    desc: "Avance d'une case en diagonale, sans capturer.",
  },
  // Pion — 2e actif : geler la case
  'epine': {
    id: 'epine', nom: 'Ronce', cat: 'A', cout: 7, piece: 'P', cooldown: 5,
    desc: "La case du pion est gelée 2 tours — aucune pièce adverse ne peut y entrer.",
  },
  // Cavalier — 2e déplacement : bond long (3,1) ou (3,2)
  'grand-saut': {
    id: 'grand-saut', nom: 'Grand saut', cat: 'D', cout: 9, piece: 'N', cooldown: 4,
    desc: 'Cavalier peut sauter en (3,1) ou (3,2) — cases intermédiaire et finale libres.',
  },
  // Cavalier — 2e actif : repousse une pièce adverse sur une case d'attaque
  'cavalerie': {
    id: 'cavalerie', nom: 'Cavalerie', cat: 'A', cout: 9, piece: 'N', cooldown: 4,
    desc: "Choisit une pièce adverse à distance de cavalier et la repousse d'une case en arrière sur une case d'attaque.",
  },
  // Fou — 2e déplacement : pour la prochaine attaque, le fou se déplace comme une dame
  'reprise': {
    id: 'reprise', nom: 'Folie', cat: 'D', cout: 5, piece: 'B',
    desc: "Pour la prochaine attaque, le fou se déplace comme une dame.",
  },
  // Fou — 2e actif : les pièces ennemies (hors roi/reine) ne peuvent plus bouger
  // dans les cases adjacentes au fou pendant 2 tours.
  'hypnose': {
    id: 'hypnose', nom: 'Hypnose', cat: 'A', cout: 10, piece: 'B', cooldown: 4,
    desc: "Les pièces ennemies (hors roi et reine) ne peuvent pas se déplacer dans une case adjacente au fou pendant 2 tours.",
  },
  // Tour — 2e déplacement : saut de la 1re pièce
  'enjambeur': {
    id: 'enjambeur', nom: 'Enjambeur', cat: 'D', cout: 6, piece: 'R',
    desc: "La tour peut sauter la première pièce rencontrée sur son glissement (jamais le roi).",
  },
  // Tour — 2e actif : échange de place avec un pion allié dans le champ d'action de la tour
  'echange': {
    id: 'echange', nom: 'Échange', cat: 'A', cout: 9, piece: 'R', cooldown: 5,
    desc: "La tour échange sa position avec un pion allié situé sur une ligne, colonne ou diagonale de la tour.",
  },
  // Dame — 2e déplacement : pour la prochaine attaque, la dame se déplace comme n'importe quelle pièce
  'feinte': {
    id: 'feinte', nom: 'Feinte', cat: 'D', cout: 12, piece: 'Q', cooldown: 5,
    desc: "Pour la prochaine attaque, la dame peut se déplacer comme n'importe quelle pièce.",
  },
  // Dame — 2e actif : empêche le roi adverse d'utiliser ses améliorations pendant 2 tours
  'sht': {
    id: 'sht', nom: 'S.H.T.', cat: 'A', cout: 15, piece: 'Q', once: true,
    desc: "Le roi adverse ne peut utiliser aucune de ses améliorations pendant les 2 prochains tours.",
  },
  // Roi — 2e déplacement : fuite de 3 cases
  'haute-fuite': {
    id: 'haute-fuite', nom: 'Haute fuite', cat: 'D', cout: 10, piece: 'K',
    desc: 'Le roi peut fuir de 3 cases tout droit (ortho/diag) — cases libres, sans capture.',
  },
  // Roi — 1re stat : survit à la première tentative de capture
  'majeste': {
    id: 'majeste', nom: 'Majesté royale', cat: 'S', cout: 8, piece: 'K',
    desc: 'Le roi absorbe la première capture subie (survit une fois).',
  },
};

// Améliorations disponibles indexées par type de pièce (pour le panneau).
export const UPGRADES_PAR_TYPE = {};
for (const u of Object.values(UPGRADES)) {
  (UPGRADES_PAR_TYPE[u.piece] ||= []).push(u.id);
}

export const MAX_UPGRADES_PAR_PIECE = 2; // GDD §5.3 — maximum 2 améliorations par pièce
// Limite PAR JOUEUR de pièces distinctes porteuses d'une [S] : chaque camp peut
// équiper jusqu'à 4 pièces d'une carte stat (8 au total sur le plateau).
export const MAX_STATS_PAR_JOUEUR = 4;

// Une pièce ne consomme qu'un emplacement global, même si elle reçoit plusieurs [S] :
// la capture ou la promotion de sa pièce ne libère pas un nouvel emplacement.
export function estAmeliorationStat(id) {
  return UPGRADES[id]?.cat === 'S';
}

// --- PvP en ligne : cadences proposées (spec-pvp-online §6) ---
// Temps initial par joueur, en secondes. SANS incrément (décision utilisateur 12/07,
// spec §6.1 v3.1). Le choix se fait APRÈS « Lancer une recherche » / « Jouer avec un ami »
// et AVANT tout appel réseau ; deux joueurs ne s'apparient que sur la même cadence.
export const PVW_CADENCES = [
  { s: 60,  label: '1 minute',  sub: 'bullet', emoji: '⚡' },
  { s: 300, label: '5 minutes', sub: 'blitz',  emoji: '🔥' },
];
// Libellé court d'une cadence depuis son temps initial (fallback : mm min).
export function cadenceLabel(s) {
  const c = PVW_CADENCES.find((x) => x.s === s);
  return c ? c.label : `${Math.round(s / 60)} min`;
}

// Couleurs de catégorie (GDD §5.3 / DA §9) : Info Déplacement / Actif / Stat, pastel.
export const COULEUR_CAT = { D: '#8FB8E0', A: '#F0B15E', S: '#9BCB8C' };
// Phase 6 — accent PRIMARY bleu du sélecteur de deck (5 tabs multi-deck). Distinct du
// COULEUR_CAT.D (catégorie D = feu des pièces, bleu pâle pastille) pour ne pas confondre
// la signalétique « deck actif » (CTA principal, saturé) avec le signal « feu cat D »
// (HUD cosmétique). Choix ≈ bleu design-system iOS/Material card-list, ≈ #3F7CB0.
export const DECK_ACCENT = '#3F7CB0';

// --- Timings feedback (GDD §7) ---
export const DUREE_ANIM = 150;   // glissement
export const DUREE_FLASH = 200;  // flash capture
export const DUREE_POPUP = 600;  // « +N écus »
export const DUREE_GOLD = 300;   // flash doré d'achat

// --- Layout Canvas ---
export const CELL = 70;
export const OX = 20;            // origine X de l'échiquier
export const OY = 44;            // origine Y de l'échiquier
export const BOARD = CELL * 8;   // 560
export const PANEL_X = OX + BOARD + 30; // début du panneau latéral
export const CANVAS_W = 1000;
export const CANVAS_H = 900;

// --- Thème UI centralisé (source unique de vérité) ---
// Pour changer l'habillage global, modifier uniquement ces valeurs. Les écrans
// Menu, Decks, Replays, matchmaking et les boutons communs les consomment via
// les alias sémantiques ci-dessous ; les couleurs du plateau restent séparées.
// Deux habillages UI. Le plateau et ses signaux de gameplay restent hors de ces
// palettes : ils conservent leurs propres constantes plus bas.
export const UI_THEMES = {
  dark: {
    // Palette graphite, ardoise et accents désaturés.
    background: '#202326',
    panel: '#2A2D31',
    panelAlt: '#34383D',
    card: '#30343A',
    field: '#25292D',
    text: '#ECEBE7',
    muted: '#AEB3B8',
    border: 'rgba(236, 235, 231, 0.18)',
    shadow: '#151719',
    primary: '#6F8F7A',
    primaryDark: '#526B5C',
    secondary: '#8A9CAF',
    secondaryLight: '#B7C2CD',
    danger: '#B86F6B',
    dangerDark: '#7E4B4A',
    dangerText: '#F4EDEA',
    wine: '#4A5058',
    wineDark: '#363B42',
    amber: '#B69B63',
    amberLight: '#D0BC8C',
    amberDark: '#7D6A43',
    buttonText: '#1E211F',
    disabled: '#34383D',
    disabledText: '#8A9097',
    disabledBorder: 'rgba(236, 235, 231, 0.10)',
    overlay: 'rgba(12, 14, 16, 0.84)',
    subtext: '#C5C9CC',
  },
  light: {
    // Version claire : ivoire, gris minéral et accents sauge/laiton.
    background: '#F2F1EE',
    panel: '#FFFFFF',
    panelAlt: '#E8E9E7',
    card: '#F7F7F4',
    field: '#E6E8E6',
    text: '#25282A',
    muted: '#667078',
    border: 'rgba(37, 40, 42, 0.18)',
    shadow: '#C8CBC8',
    primary: '#5E806B',
    primaryDark: '#45614F',
    secondary: '#63778A',
    secondaryLight: '#93A4B3',
    danger: '#A45D59',
    dangerDark: '#874743',
    dangerText: '#FFFFFF',
    wine: '#59616A',
    wineDark: '#424950',
    amber: '#A17E3F',
    amberLight: '#C5A96F',
    amberDark: '#715829',
    buttonText: '#25282A',
    disabled: '#E1E3E0',
    disabledText: '#8A9097',
    disabledBorder: 'rgba(37, 40, 42, 0.12)',
    overlay: 'rgba(20, 24, 28, 0.52)',
    subtext: '#54616B',
  },
};

// Objet stable consommé par Canvas et par main.js : Object.assign permet de
// changer de thème à chaud sans casser les références importées par render.js.
export const UI_THEME = { ...UI_THEMES.dark };

// --- Palette historique du plateau et du chrome de partie ---
// Ces tokens restent séparés du thème UI global : ils servent aux cases, pièces
// et feedbacks de gameplay, qui ont leurs propres contraintes de contraste.
export const C_BRUME = '#202326';             // fond graphite entre les cases
export const C_CARTE = '#ECEBE7';             // contraste clair du plateau
export const C_ENCRE = '#202326';             // contours graphite profond
export const C_SAUGE = '#6F8F7A';             // accent sauge (badge « à vous »)
export const C_IVOIRE_BOIS = '#B69B63';       // cadre laiton du plateau

// Couleurs échiquier / pièces (DA §9).
export const C_CLAIR = '#f0ede9';   // Ivoire chaud — case claire
export const C_FONCE = '#6B3A52';   // Prune vin — case sombre
export const C_SEL = 'rgba(227, 192, 127, 0.28)';  // Or translucide — sélection
export const C_MOVE = 'rgba(26, 18, 32, 0.34)';     // Encre translucide — coup légal
export const C_CAP = 'rgba(196, 106, 106, 0.72)';   // Alerte — anneau capture
export const C_RUEE = 'rgba(227, 192, 127, 0.92)';  // Or — cible Ruée

// Remplissage pastel du disque de pièce par camp (DA §9).
export const REMPLI_PIECE = ['#F2E8D8', '#4A2032'];

// Accents par joueur (DA §7/§9). Joueur 1 = owner 0 (Bleu Poudré), Joueur 2 = owner 1 (Corail).
export const ACCENT = ['#E3C07F', '#747876'];
export const NOM_JOUEUR = ['Joueur 1', 'Joueur 2'];

// --- Tons additionnels pour l'habillage chrome (HUD, panneaux, boutons) ---
// Prolonge la palette pastel du plateau au reste de l'écran (DA §2/§9).
export const C_ENCRE_DOUX = '#AEB3B8';        // texte secondaire neutre
export const C_ENCRE_PALE = '#8A9097';        // texte tertiaire / désactivé
export const C_CARTE_BORD = 'rgba(236,235,231,0.12)'; // liseré chrome discret
export const C_OMBRE = 'rgba(21,23,25,0.24)';  // ombre graphite
export const C_AMBRE = '#B69B63';             // accent laiton sobre
export const C_AMBRE_FONCE = '#7D6A43';       // texte sur accent laiton
export const C_TERRACOTTA = '#B86F6B';        // alerte de gameplay
export const C_SAUGE_FONCE = '#526B5C';       // validation (« achetée »)
// Laiton clair — accent de victoire et de confirmation.
export const C_AMBRE_CLAIR = '#D0BC8C';
export const C_ENCRE_sub = '#B7C2CD';