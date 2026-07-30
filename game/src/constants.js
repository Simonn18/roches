// roychec — constantes partagées (GDD §6, §7).
// Aucun frontmatter : c'est du code. Suit les valeurs chiffrées du GDD.

// --- Économie (GDD §7) ---
export const REVENU_PAR_COUP = 2;   // +2 écus par coup joué
export const SOLDE_DEPART = 0; // GDD §7 : les deux joueurs commencent à sec.
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
    id: 'bouclier', nom: 'Bouclier de fantassin',cat:'A',cout:6,piece: 'P',
    desc: 'Annule la prochaine capture subie'
  },
  'vet':{
    id: 'vet', nom: 'Vétéran',cat:'S',cout:5,piece: 'P',
    desc: 'Le pion vaut **3 points** au départage au lieu de 1'
  },
  
  'second': {
    id: 'second', nom: 'Second Galop', cat: 'D', cout: 8, piece: 'N', cooldown: 3,
    desc: 'Le cavalier peut, une fois par tour où il ne capture pas, enchaîner un 2e saut',
  },
  'ruee': {
    id: 'ruee', nom: 'Ruée', cat: 'A', cout: 9, piece: 'N', cooldown: 4,
    desc: 'Actif : capture un ennemi à distance de cavalier sans bouger.',
  },
  'monture': {
    id: 'monture', nom: 'Monture blindée', cat: 'S', cout: 7, piece: 'N', cooldown: 4,
    desc: 'Absorbe la première capture subie (survit une fois), puis boost consommé.',
  },

  'pas-de-cote': {
    id: 'pas-de-cote', nom: 'Pas de côté', cat: 'D', cout: 6, piece: 'B',
    desc: "Déplacement d'une case orthogonale.",
  },
  'Rayon': {
    id: 'Rayon', nom: 'Rayon sacré', cat: 'A', cout: 10, piece: 'B', cooldown: 4,
    desc: "Actif, capture à distance la 1re pièce adverse sur une diagonale, sans bouger.",
  },
  'Zone': {
    id: 'Zone', nom: 'Zone de contrôle', cat: 'S', cout: 6, piece: 'B',
    desc: "Empêche n'importe quelle pièce de rang inférieur ou égal de se déplacer sur les cases autour de lui",
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
    desc: "la dame se pose sur n'importe quelle case vide à 3 cases cases autour maximum (ignore les obstacles)",
  },
  'double-coup': {
    id: 'double-coup', nom: 'Double coup', cat: 'A', cout: 15, piece: 'Q', once: true,
    desc: 'Usage unique : rejoue un 2e coup (ne consomme pas le tour).',
  },
  'couronne': {
    id: 'couronne', nom: 'Couronne', cat: 'S', cout: 9, piece: 'Q',
    desc: 'La dame absorbe la première capture subie (survit une fois).',
  },

  'passe-royale': {
    id: 'passe-royale', nom: 'Passe royal', cat: 'D', cout: 8, piece: 'K',
    desc:"Le roi peut se déplacer de 2 cases en ligne droite (orthogonal/diagonal), cases libres.",
  },
  'sacrifice': {
    id: 'sacrifice', nom: 'Sacrifice', cat: 'A', cout: 12, piece: 'K', cooldown: 6,
    desc: "Appelle un pion pour le protéger, le pion meurt à la place du roi et le roi peut se déplacer sur une des cases autour de lui. Si auncun pion n'est disponible, la pièce avec avec une valeur juste supérieur aux pions protège le roi .",
  },
  'decret': {
    id: 'decret', nom: 'Décret', cat: 'A', cout: 12, piece: 'K', once: true,
    desc: "Usage unique : échange la position du roi avec une de ses pièces alliées adjacentes (mini-roque libre).",
  },

  // --- Catalogue étendu [21:30] — 2 D + 2 A + 1 S par pièce (5 cartes × 6 types = 30) ---
  // Pion — 2e déplacement (cumul avec Marche arrière)
  'pas-diag': {
    id: 'pas-diag', nom: 'Pas diagonal', cat: 'D', cout: 4, piece: 'P',
    desc: "Avance d'une case en diagonale, sans capturer (cumul avec Marche arrière).",
  },
  // Pion — 2e actif : geler la case
  'epine': {
    id: 'epine', nom: 'Épine', cat: 'A', cout: 7, piece: 'P', cooldown: 5,
    desc: "Actif : la case du pion est gelée 2 tours — aucune pièce adverse ne peut y entrer.",
  },
  // Cavalier — 2e déplacement : bond long (3,1) ou (3,2)
  'grand-saut': {
    id: 'grand-saut', nom: 'Grand saut', cat: 'D', cout: 9, piece: 'N', cooldown: 4,
    desc: 'Cavalier peut sauter en (3,1) ou (3,2) — cases intermédiaire et finale libres.',
  },
  // Cavalier — 2e actif : alternatif de Ruée (cd 4)
  'cavalerie': {
    id: 'cavalerie', nom: 'Cavalerie', cat: 'A', cout: 9, piece: 'N', cooldown: 4,
    desc: 'Actif : capture un ennemi à distance de cavalier sans bouger.',
  },
  // Fou — 2e déplacement : reculer en diagonale
  'reprise': {
    id: 'reprise', nom: 'Reprise', cat: 'D', cout: 5, piece: 'B',
    desc: "Le fou peut aussi reculer en diagonale (au lieu d'avancer seulement).",
  },
  // Fou — 2e actif : alternatif de Rayon (cd 4)
  'hypnose': {
    id: 'hypnose', nom: 'Hypnose', cat: 'A', cout: 10, piece: 'B', cooldown: 4,
    desc: "Actif, capture à distance la 1re pièce adverse sur une diagonale, sans bouger.",
  },
  // Tour — 2e déplacement : saut de la 1re pièce
  'enjambeur': {
    id: 'enjambeur', nom: 'Enjambeur', cat: 'D', cout: 6, piece: 'R',
    desc: "La tour peut sauter la première pièce rencontrée sur son glissement (jamais le roi).",
  },
  // Tour — 2e actif : alternatif de Rempart (cd 5)
  'echange': {
    id: 'echange', nom: 'Échange', cat: 'A', cout: 9, piece: 'R', cooldown: 5,
    desc: "La tour se pose ; elle et les alliés orthogonalement adjacents sont blindés (survivent à 1 prise) jusqu'au prochain tour du joueur.",
  },
  // Dame — 2e déplacement : avance de 2 cases tout droit en sautant
  'feinte': {
    id: 'feinte', nom: 'Feinte', cat: 'D', cout: 12, piece: 'Q', cooldown: 5,
    desc: "La dame peut avancer de 2 cases tout droit en sautant la première case, sans capture.",
  },
  // Dame — 2e actif : alternatif de Double coup (once)
  'sht': {
    id: 'sht', nom: 'S.H.T.', cat: 'A', cout: 15, piece: 'Q', once: true,
    desc: 'Usage unique : rejoue un 2e coup (ne consomme pas le tour).',
  },
  // Roi — 2e déplacement : fuite de 3 cases
  'haute-fuite': {
    id: 'haute-fuite', nom: 'Haute fuite', cat: 'D', cout: 10, piece: 'K',
    desc: 'Le roi peut fuir de 3 cases tout droit (ortho/diag) — cases libres, sans capture.',
  },
  // Roi — 1re stat : 1 point au départage à la valeur au lieu de 0
  'majeste': {
    id: 'majeste', nom: 'Majesté royale', cat: 'S', cout: 8, piece: 'K',
    desc: 'Le roi vaut **1 point** au départage à la valeur au lieu de 0.',
  },
};

// Améliorations disponibles indexées par type de pièce (pour le panneau).
export const UPGRADES_PAR_TYPE = {};
for (const u of Object.values(UPGRADES)) {
  (UPGRADES_PAR_TYPE[u.piece] ||= []).push(u.id);
}

export const MAX_UPGRADES_PAR_PIECE = 2; // GDD §5.3

// --- PvP en ligne : cadences proposées (spec-pvp-online §6) ---
// Temps initial par joueur, en secondes. SANS incrément (décision utilisateur 12/07,
// spec §6.1 v3.1). Le choix se fait APRÈS « Lancer une recherche » / « Jouer avec un ami »
// et AVANT tout appel réseau ; deux joueurs ne s'apparient que sur la même cadence.
export const PVW_CADENCES = [
  { s: 60,    label: '1 minute',  sub: 'bullet',  emoji: '⚡' },
  { s: 300,   label: '5 minutes', sub: 'blitz',   emoji: '🔥' },
  { s: 3600,  label: '1 heure',   sub: 'longue',  emoji: '🕐' },
  { s: 86400, label: '1 journée', sub: 'lente',   emoji: '📅' },
];
// Libellé court d'une cadence depuis son temps initial (fallback : mm min).
export function cadenceLabel(s) {
  const c = PVW_CADENCES.find((x) => x.s === s);
  return c ? c.label : `${Math.round(s / 60)} min`;
}

// Couleurs de catégorie (GDD §5.3 / DA §9) : Info Déplacement / Actif / Stat, pastel.
export const COULEUR_CAT = { D: '#8FB8E0', A: '#F0B15E', S: '#9BCB8C' };

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

// --- Palette pastel (DA §2) ---
export const C_BRUME = '#EDEFF7';   // fond général de l'écran
export const C_CARTE = '#FCF8F3';   // fond des panneaux/boutons
export const C_ENCRE = '#1A1A1A';   // contours et texte par défaut
export const C_SAUGE = '#ADCBA6';   // accent de statut (badge « à vous »)
export const C_IVOIRE_BOIS = '#ffffff';

// Couleurs échiquier / pièces (DA §9).
export const C_CLAIR = '#FBF6F0';   // Ivoire — case claire
export const C_FONCE = '#8a6b8c';   // Prune — case sombre
export const C_SEL = 'rgba(232, 238, 231, 0.25)';  // Sauge translucide — case sélectionnée
export const C_MOVE = 'rgba(26, 26, 26, 0.28)';    // Encre translucide — point coup légal
export const C_CAP = 'rgba(217, 107, 90, 0.65)';   // Alerte — anneau capture
export const C_RUEE = 'rgba(240, 177, 94, 0.9)';   // Info Actif — cible Ruée

// Remplissage pastel du disque de pièce par camp (DA §9).
export const REMPLI_PIECE = ['#f2efd9', '#623526'];

// Accents par joueur (DA §7/§9). Joueur 1 = owner 0 (Bleu Poudré), Joueur 2 = owner 1 (Corail).
export const ACCENT = ['#f3a135', '#a7a4a3'];
export const NOM_JOUEUR = ['Joueur 1', 'Joueur 2'];

// --- Tons additionnels pour l'habillage chrome (HUD, panneaux, boutons) ---
// Prolonge la palette pastel du plateau au reste de l'écran (DA §2/§9).
export const C_ENCRE_DOUX = '#786F60';        // texte secondaire, sur fond clair
export const C_ENCRE_PALE = '#8f6526';        // texte tertiaire / désactivé
export const C_CARTE_BORD = 'rgba(26,20,15,0.10)'; // liseré discret des cartes
export const C_OMBRE = 'rgba(60,45,30,0.16)'; // ombre portée douce
export const C_AMBRE = '#e7bd14';             // accent chaleureux (pouvoirs actifs, écus)
export const C_AMBRE_FONCE = '#8A5A22';       // texte sur fond ambre clair
export const C_TERRACOTTA = '#B5573F';        // prix inabordable / alerte douce
export const C_SAUGE_FONCE = '#5E8A52';       // validation (« achetée »)
// Doré Clair — deuxième ton du duo doré (burst de victoire, DA §11.5). Nouveau en v2.
export const C_AMBRE_CLAIR = '#F4D58D';
export const C_ENCRE_sub = '#c8d7e7'