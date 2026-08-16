// roychec — variantes locales hot-seat (GDD §5.2.b + §7.2 v3, 2026-07-12)
//
// Deux combinaisons simples résultent du croisement de DEUX axes (1 économie ×
// 2 combats). La valeur par défaut « Standard × Standard » reproduit strictement
// l'économie legacy du MVP v2 : aucune régression des modes PvAI ou PvP en ligne,
// qui REFUSENT la sélection (fallback « Standard × Standard » + console.warn —
// décision verrouillée GDD §7.2 scope strict hot-seat local).
//
// Implémenté par gameplay-dev sur spec du game-designer 12/07.

import { REVENU_PAR_COUP } from './constants.js?v=113';

// --- Catalogue du mode de combat (l'économie reste Standard) ---

// Plafond du solde par joueur (GDD §5.2.b). Les variantes économiques
// Plafond 15 et Illimité ne sont plus proposées dans l'interface.
export const ECONOMIES = [
  { id: 'standard', plafond: 30, label: 'Plafond 30 écus', sub: 'plafond 30 écus' },
];

// Compatibilité descendante uniquement : ces anciennes variantes restent
// compréhensibles pour une partie privée ou un replay créé avant leur retrait,
// mais ne sont jamais renvoyées par variantIdFromMenu().
const ECONOMIES_COMPAT = [
  ...ECONOMIES,
  { id: 'plafond15', plafond: 15, label: 'Plafond 15 écus', sub: 'ancien mode' },
  { id: 'illimite', plafond: Infinity, label: 'Illimité', sub: 'ancien mode' },
];

// Revenu de base par coup joué ET multiplicateur de capture (GDD §5.2.b).
// Seul `elimX2` porte un timer d'inactivité (stagnation > 0).
export const COMBATS = [
  { id: 'standard', revenueBase: 1, captureMul: 1, stagnation: 0,
    label: 'Déplacement +2 écus', sub: '+2 écus par déplacement, capture ×1' },
  { id: 'elimX2',   revenueBase: 0, captureMul: 2, stagnation: 10,
    label: 'Élim. ×2 écus', sub: '+0/coup, capture ×2, filet 10' },
];

// --- Catalogue actuel des 2 combinaisons proposées ---

export const VARIANT_PRESETS = [
  { id: 'pvp_standard', economie: 'standard', combat: 'standard' },
  { id: 'pvp_elimX2',   economie: 'standard', combat: 'elimX2' },
];

const VARIANT_PRESETS_COMPAT = [
  ...VARIANT_PRESETS,
  { id: 'pvp_plafond15',    economie: 'plafond15', combat: 'standard' },
  { id: 'pvp_illimite',     economie: 'illimite',  combat: 'standard' },
  { id: 'pvp_plafond15_x2', economie: 'plafond15', combat: 'elimX2' },
  { id: 'pvp_illimite_x2',  economie: 'illimite',  combat: 'elimX2' },
];

export const DEFAULT_VARIANT = 'pvp_standard';

// Modes où les variantes sont autorisées via le menu local (GDD §7.2). Depuis v3.1
// (12/07, demande utilisateur), le PvP en ligne PRIVÉ (« Jouer avec un ami ») accepte
// aussi une variante — mais par un canal distinct : le créateur l'impose via
// pvp_create_private(p_variant), le rejoignant en hérite (commencerPartie('pvw',
// { variant }) court-circuite variantePourMode). La file PUBLIQUE et le PvAI restent
// verrouillés Standard × Standard.
export const MODES_VARIANTE = new Set(['pvp']);

// Libellé humain d'une variante. Les anciens ids restent lisibles pour les
// replays et parties privées déjà créés.
export function variantLabel(variantId) {
  const preset = VARIANT_PRESETS_COMPAT.find((v) => v.id === variantId) || VARIANT_PRESETS[0];
  const cbt = COMBATS.find((c) => c.id === preset.combat) || COMBATS[0];
  return cbt.label;
}

// --- Résolution des règles d'économie depuis un id de variante ---
// Usine : chaque appel produit un objet frais avec `stagnationCpt: 0`. Le compteur
// sera muté localement à state.variant pendant la partie — pas de partage entre
// parties (sinon le filet d'inactivité serait réinitialisé à chaque nouvelle partie).
// Renvoie un objet riche consommé par board.js (champ state.variant) et main.js
// (gagnerEcus, stagnationTick).
export function reglesEconomie(variantId) {
  const preset = VARIANT_PRESETS_COMPAT.find((v) => v.id === variantId) || VARIANT_PRESETS[0];
  const eco = ECONOMIES_COMPAT.find((e) => e.id === preset.economie) || ECONOMIES[0];
  const cbt = COMBATS.find((c) => c.id === preset.combat) || COMBATS[0];
  return {
    id: preset.id,
    economie: preset.economie,
    combat: preset.combat,
    plafond: eco.plafond,
    // revenueBase est un booléen multiplicateur : 1 = +REVENU_PAR_COUP par coup,
    // 0 = revenu de base supprimé (GDD §5.2.b, variantes Élimination ×2).
    revenueBase: cbt.revenueBase,
    // captureMul multiplie la valeur de la pièce capturée (GDD §5.2.b).
    captureMul: cbt.captureMul,
    // stagnation = nombre de tours-joueur cumulés SANS capture avant injection
    // silencieuse de +REVENU_PAR_COUP au joueur qui vient de jouer. 0 = pas de
    // filet (modes Standard × Standard et consort — l'économie n'est jamais gelée).
    stagnation: cbt.stagnation,
    stagnationCpt: 0,
  };
}

// Résout la variante à utiliser au démarrage d'une partie en fonction du mode.
// Pour les modes hors scope (PvAI / PvP en ligne / tutoriel / spectateur), force
// 'pvp_standard' et journalise un warning explicite côté code si une autre
// variante a été demandée. Le choix utilisateur EST conservé en state.menu pour
// qu'il soit réutilisé au prochain passage en mode 'pvp' — c'est une « mémoire
// visuelle » de l'intention, pas une régression silencieuse.
export function variantePourMode(mode, demandeId) {
  if (MODES_VARIANTE.has(mode)) return demandeId || DEFAULT_VARIANT;
  if (demandeId && demandeId !== DEFAULT_VARIANT) {
    console.warn(`[variants] Variante « ${demandeId} » refusée en mode « ${mode} ».`
      + ` Fallback « ${DEFAULT_VARIANT} » (GDD §7.2 — scope strict hot-seat local).`);
  }
  return DEFAULT_VARIANT;
}

// Helper UI : reconstitue l'id de variante depuis le mode de combat sélectionné.
// Le plafond d'écus est toujours Standard (30). Si l'état historique contient encore
// une ancienne valeur d'économie, elle est volontairement ignorée.
export function variantIdFromMenu(state) {
  const m = (state && state.menu) || {};
  const cbt = m.combat || 'standard';
  return ([...VARIANT_PRESETS]).find((v) => v.combat === cbt)?.id
    || DEFAULT_VARIANT;
}

// --- Gestion du timer d'inactivité (ÉlImin. ×2 uniquement, GDD §5.2.b / §7.2) ---
// Compté en tours-joueur cumulés (1 par coup joué localement par n'importe quel
// camp). Reset à 0 sur la première capture rencontrée. À l'atteinte du seuil,
// injection silencieuse de +REVENU_PAR_COUP au joueur qui vient de jouer, plafonnée
// par la variante. Le compteur est ensuite remis à 0.
//
// Note : la valeur injectée est TOUJOURS +REVENU_PAR_COUP (=2), même en élimination
// où le revenu de base est 0 — c'est précisément le rôle du filet : débloquer une
// économie gelée par deux joueurs passifs (sans transformer le mode en gracieux).
// Note 2 : `state.ecus` est borné par le plafond Standard ; les anciens ids
// conservent leur plafond historique uniquement lors de leur résolution compat.
// Renvoie le montant EFFECTIVEMENT injecté (0 hors seuil) — consommé par
// crediterCoup (main.js) pour la fidélité du gain enregistré au replay.
export function stagnationTick(state, wasCapture) {
  const v = state && state.variant;
  if (!v || !v.stagnation || v.stagnation <= 0) return 0;
  if (wasCapture) {
    v.stagnationCpt = 0;
    return 0;
  }
  v.stagnationCpt++;
  if (v.stagnationCpt >= v.stagnation) {
    const avant = state.ecus[state.turn];
    state.ecus[state.turn] = Math.min(v.plafond, avant + REVENU_PAR_COUP);
    v.stagnationCpt = 0;
    return state.ecus[state.turn] - avant;
  }
  return 0;
}
