// roychec — variantes locales hot-seat (GDD §5.2.b + §7.2 v3, 2026-07-12)
//
// Six combinaisons résultent du croisement orthogonal de DEUX axes (3 économie ×
// 2 combat = 6). La valeur par défaut « Standard × Standard » reproduit strictement
// l'économie legacy du MVP v2 : aucune régression des modes PvAI ou PvP en ligne,
// qui REFUSENT la sélection (fallback « Standard × Standard » + console.warn —
// décision verrouillée GDD §7.2 scope strict hot-seat local).
//
// Implémenté par gameplay-dev sur spec du game-designer 12/07.

import { REVENU_PAR_COUP } from './constants.js?v=109';

// --- Catalogues des deux axes orthogonaux ---

// Plafond du solde par joueur (GDD §5.2.b). Infinity = pas de plafond (illimité).
export const ECONOMIES = [
  { id: 'standard',  plafond: 30,       label: 'Plafond 30', sub: 'plafond 30 écus' },
  { id: 'plafond15', plafond: 15,       label: 'Plafond 15', sub: 'plafond bas, tactique' },
  { id: 'illimite',  plafond: Infinity, label: 'Illimité',   sub: 'thésaurisation libre' },
];

// Revenu de base par coup joué ET multiplicateur de capture (GDD §5.2.b).
// Seul `elimX2` porte un timer d'inactivité (stagnation > 0).
export const COMBATS = [
  { id: 'standard', revenueBase: 1, captureMul: 1, stagnation: 0,
    label: 'Déplacement +2', sub: '+2 écus par déplacement, capture ×1' },
  { id: 'elimX2',   revenueBase: 0, captureMul: 2, stagnation: 10,
    label: 'Élim. ×2', sub: '+0/coup, capture ×2, filet 10' },
];

// --- Catalogue complet des 6 combinaisons (référence matrice GDD §7.2) ---

export const VARIANT_PRESETS = [
  { id: 'pvp_standard',     economie: 'standard',  combat: 'standard' },
  { id: 'pvp_plafond15',    economie: 'plafond15', combat: 'standard' },
  { id: 'pvp_illimite',     economie: 'illimite',  combat: 'standard' },
  { id: 'pvp_elimX2',       economie: 'standard',  combat: 'elimX2'   },
  { id: 'pvp_plafond15_x2', economie: 'plafond15', combat: 'elimX2'   },
  { id: 'pvp_illimite_x2',  economie: 'illimite',  combat: 'elimX2'   },
];

export const DEFAULT_VARIANT = 'pvp_standard';

// Modes où les variantes sont autorisées via le menu local (GDD §7.2). Depuis v3.1
// (12/07, demande utilisateur), le PvP en ligne PRIVÉ (« Jouer avec un ami ») accepte
// aussi une variante — mais par un canal distinct : le créateur l'impose via
// pvp_create_private(p_variant), le rejoignant en hérite (commencerPartie('pvw',
// { variant }) court-circuite variantePourMode). La file PUBLIQUE et le PvAI restent
// verrouillés Standard × Standard.
export const MODES_VARIANTE = new Set(['pvp']);

// Libellé humain d'une variante (« Plafond 15 × Élim. ×2 »). Utilisé par les écrans
// en ligne (cadence privé / code ami / match trouvé) et le header replay.
export function variantLabel(variantId) {
  const preset = VARIANT_PRESETS.find((v) => v.id === variantId) || VARIANT_PRESETS[0];
  const eco = ECONOMIES.find((e) => e.id === preset.economie) || ECONOMIES[0];
  const cbt = COMBATS.find((c) => c.id === preset.combat) || COMBATS[0];
  return `${eco.label} × ${cbt.label}`;
}

// --- Résolution des règles d'économie depuis un id de variante ---
// Usine : chaque appel produit un objet frais avec `stagnationCpt: 0`. Le compteur
// sera muté localement à state.variant pendant la partie — pas de partage entre
// parties (sinon le filet d'inactivité serait réinitialisé à chaque nouvelle partie).
// Renvoie un objet riche consommé par board.js (champ state.variant) et main.js
// (gagnerEcus, stagnationTick).
export function reglesEconomie(variantId) {
  const preset = VARIANT_PRESETS.find((v) => v.id === variantId) || VARIANT_PRESETS[0];
  const eco = ECONOMIES.find((e) => e.id === preset.economie) || ECONOMIES[0];
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

// Helper UI : reconstitue l'id de variante à partir des DEUX axes orthogonaux
// sélectionnés au menu (state.menu.economie × state.menu.combat). Si l'utilisateur
// n'a touché à rien, retourne le défaut. Utilisé par le bouton « 1J vs 2J » du menu
// pour passer la bonne variante à commencerPartie().
export function variantIdFromMenu(state) {
  const m = (state && state.menu) || {};
  const eco = m.economie || 'standard';
  const cbt = m.combat || 'standard';
  // Si l'utilisateur a bricolé manuellement un état incohérent, retombe sur standard.
  return ([...VARIANT_PRESETS]).find((v) => v.economie === eco && v.combat === cbt)?.id
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
// Note 2 : `state.ecus` n'est PAS infini par défaut : on borne par v.plafond pour
// rester cohérent avec le plafond basse/variants plafond15.
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
