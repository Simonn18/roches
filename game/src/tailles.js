// roychec — Catalogue canonique des tailles de plateau (Phase A.5 v2, 2026-07-29).
//
// MAISON CANONIQUE zero-dep. Ce module NE dépend d'AUCUN autre module de
// game/src/ — il est juste un export de constante + helpers dimensions. board.js
// et variants.js importent tous les deux depuis ici, ce qui CASSLE le cycle
// board.js ↔ variants.js qui causait le TDZ `ReferenceError: Cannot access
// 'TAILLES_BOARD' before initialization` en Phase A.5 v1 (cf. obsidian/CRITICAL_FACTS
// §15×8 SPEC-ONLY entry + Logs/2026-07-29 [17:00]).
//
//   - 'std' = 8 × 8 classique (MVP legacy, non-régression)
//   - 'l15' = 8 × 15 (15 colonnes, 8 pions par camp centrés sur colonnes paires
//           [0,2,4,6,8,10,12,14]). Les colonnes impaires [1,3,5,7,9,11,13] sont
//           vides au début ; pas de gonflement du solde ni du catalogue de cartes.
//
// ADDITION FUTURE (backlog) : Phase A.5 v3 livrera un layout « Standard »
// 15-pawns (un pion par colonne, plus conforme à un chess-15 large). Phase A.5
// v2 garde 8-pawns centrés pour NE PAS modifier l'économie de partie.

// --- Catalogue des tailles disponibles ---
// h = nombre de rangées (rows), w = nombre de colonnes (cols).
// 'l15' = 8×15 signifie w=15 (15 colonnes larges) et h=8 (8 rangées).
// `accent` = couleur du chip sélectionné (V2[t.accent]).
// `stroke` = couleur du contour du chip sélectionné (V2[t.stroke]).
// L'appellation est asymétrique : V2 n'expose pas `purpleDD` (le stroke dark n'existe
// pas pour purple). On stocke donc DEUX clés séparées par taille — DRY-friendly,
// future-proof (Phase A.5 v3+ peut ajouter rose/roseD, orange/ouangeD etc. sans
// logique dans render.js).
export const TAILLES = {
  std: { id: 'std', h: 8, w: 8,  label: '8 × 8',  sub: 'plateau standard',       accent: 'green',   stroke: 'greenD' },
  l15: { id: 'l15', h: 8, w: 15, label: '8 × 15', sub: '15 colonnes (Phase A.5)', accent: 'purpleD', stroke: 'purpleD' },
};

export const DEFAULT_TAILLE = 'std';

// --- Helpers de résolution ---
// Renvoie le nombre de rangées (rows) d'une taille donnée, fallback DEFAULT_TAILLE
// si l'id est inconnu (forward-compat : Phase A.5 v3+ pourra ajouter 'l13',
// 'l20' etc sans modifier les call sites).
export function getBoardH(taille) {
  return (TAILLES[taille] || TAILLES[DEFAULT_TAILLE]).h;
}

// Renvoie le nombre de colonnes (cols) d'une taille donnée.
export function getBoardW(taille) {
  return (TAILLES[taille] || TAILLES[DEFAULT_TAILLE]).w;
}
