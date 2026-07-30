// roychec — génération des coups légaux (GDD §5.1) + cibles de pouvoirs.
// Pas de détection d'échec/mat : la partie se gagne en capturant le roi (GDD §8.1).
import { inB, caseAt } from './board.js';

const KNIGHT = [[-2, -1], [-2, 1], [-1, -2], [-1, 2], [1, -2], [1, 2], [2, -1], [2, 1]];
const DIAG = [[-1, -1], [-1, 1], [1, -1], [1, 1]];
const ORTHO = [[-1, 0], [1, 0], [0, -1], [0, 1]];
export const DIRS8 = [...DIAG, ...ORTHO];

// Types affectés par la Zone de contrôle (valeur ≤ 3 ; tour, dame et roi exemptés).
const TYPES_FAIBLES = new Set(['P', 'N', 'B']);

function pousse(m, board, p, r, c, capturableOnly = false, moveOnly = false) {
  const t = caseAt(board, r, c);
  if (t === undefined) return;            // hors plateau
  if (t === null) { if (!capturableOnly) m.push({ r, c, capture: false }); return; }
  if (t.owner !== p.owner && !moveOnly) m.push({ r, c, capture: true });
}

function glisse(m, board, p, dirs) {
  for (const [dr, dc] of dirs) {
    let r = p.r + dr, c = p.c + dc;
    while (inB(board, r, c)) {
      const t = board[r][c];
      if (t === null) { m.push({ r, c, capture: false }); }
      else { if (t.owner !== p.owner) m.push({ r, c, capture: true }); break; }
      r += dr; c += dc;
    }
  }
}

function coupsPion(board, p) {
  const m = [];
  const dir = p.owner === 0 ? -1 : 1;               // Joueur 1 monte, Joueur 2 descend
  const depart = p.owner === 0 ? 6 : 1;
  // Avance simple / double depuis la rangée de départ.
  if (caseAt(board, p.r + dir, p.c) === null) {
    m.push({ r: p.r + dir, c: p.c, capture: false });
    if (p.r === depart && caseAt(board, p.r + 2 * dir, p.c) === null) {
      m.push({ r: p.r + 2 * dir, c: p.c, capture: false });
    }
  }
  // Captures en diagonale avant.
  for (const dc of [-1, 1]) {
    const t = caseAt(board, p.r + dir, p.c + dc);
    if (t && t.owner !== p.owner) m.push({ r: p.r + dir, c: p.c + dc, capture: true });
  }
  // Marche arrière [D] : recule d'une case, case vide uniquement, jamais pour capturer.
  if (p.upgrades.includes('marche-arriere')) {
    if (caseAt(board, p.r - dir, p.c) === null) {
      m.push({ r: p.r - dir, c: p.c, capture: false });
    }
  }
  // Promotion (GDD §5.1.b) : tout coup ARRIVANT sur la dernière rangée adverse est
  // marqué — le choix de pièce (promo) est résolu par main.js (panneau / IA / réseau).
  const derniere = p.owner === 0 ? 0 : 7;
  for (const mv of m) if (mv.r === derniere) mv.promotion = true;
  return m;
}

function coupsCavalier(board, p) {
  const m = [];
  for (const [dr, dc] of KNIGHT) pousse(m, board, p, p.r + dr, p.c + dc);
  // Second galop : l'enchaînement d'un 2e saut est géré comme un post-coup
  // (modèle Double coup, voir main.js), pas comme des cases jouables ici.
  return m;
}

function coupsFou(board, p) {
  const m = [];
  glisse(m, board, p, DIAG);                    // coup de base
  if (p.upgrades.includes('pas-de-cote')) {      // + ajout indépendant
    for (const [dr, dc] of ORTHO) pousse(m, board, p, p.r + dr, p.c + dc);
  }
  return m;
}

function coupsTour(board, p) {
  const m = [];
  glisse(m, board, p, ORTHO);                    // coup de base
  // Pivot [D] : un pas d'une case en diagonale (une seule case), capture incluse.
  if (p.upgrades.includes('pivot')) {
    for (const [dr, dc] of DIAG) pousse(m, board, p, p.r + dr, p.c + dc);
  }
  return m;
}

function coupsDame(board, p) {
  const m = [];
  glisse(m, board, p, DIRS8); // coup de base

  // Téléportation courte [D] : cases VIDES à distance de Chebyshev ≤ 3, obstacles
  // ignorés. Disponible seulement hors cooldown. On marque tele:true et on exclut
  // les cases déjà atteignables normalement (pas de doublon ni de cooldown injustifié).
  if (p.upgrades.includes('Tele') && (p.cooldowns.Tele || 0) === 0) {
    const dejaAtteint = new Set(m.map((x) => x.r + ',' + x.c));
    for (let dr = -3; dr <= 3; dr++) {
      for (let dc = -3; dc <= 3; dc++) {
        if (Math.max(Math.abs(dr), Math.abs(dc)) === 0) continue; // pas sur place
        const r = p.r + dr, c = p.c + dc;
        if (!inB(board, r, c)) continue;
        if (board[r][c] !== null) continue;          // cases vides uniquement (jamais de capture)
        if (dejaAtteint.has(r + ',' + c)) continue;  // déjà un coup normal
        m.push({ r, c, capture: false, tele: true });
      }
    }
  }
  return m;
}
function coupsRoi(board, p) {
  const m = [];
  for (const [dr, dc] of [...DIAG, ...ORTHO]) pousse(m, board, p, p.r + dr, p.c + dc);
  // Roque (GDD §5.1.b) : roi et tour jamais bougés (aBouge), cases entre eux vides.
  // PAS de condition d'échec (le concept n'existe pas dans roychec — §8.1). Généré
  // AVANT Passe royal : si les deux mènent à la même case, le roque a priorité
  // (Passe royal déduplique ci-dessous — déterminisme requis par le lockstep en ligne).
  if (!p.aBouge) {
    for (const [rookC, kingTo, rookTo] of [[7, 6, 5], [0, 2, 3]]) { // petit / grand roque
      const rook = caseAt(board, p.r, rookC);
      if (!rook || rook.type !== 'R' || rook.owner !== p.owner || rook.aBouge) continue;
      let libre = true;
      const [lo, hi] = rookC > p.c ? [p.c + 1, rookC - 1] : [rookC + 1, p.c - 1];
      for (let c = lo; c <= hi; c++) if (board[p.r][c] !== null) { libre = false; break; }
      if (!libre) continue;
      m.push({
        r: p.r, c: kingTo, capture: false,
        castle: { rookFrom: { r: p.r, c: rookC }, rookTo: { r: p.r, c: rookTo } },
      });
    }
  }
  // Passe royal [D] : bond de 2 cases en ligne droite (ortho ou diagonale).
  // Jamais de capture : la case intermédiaire ET la case d'arrivée doivent être vides.
  if (p.upgrades.includes('passe-royale')) {
    const deja = new Set(m.map((x) => x.r + ',' + x.c)); // dédup vs roque (même case d'arrivée)
    for (const [dr, dc] of [...DIAG, ...ORTHO]) {
      const inter = caseAt(board, p.r + dr, p.c + dc);
      const dest = caseAt(board, p.r + 2 * dr, p.c + 2 * dc);
      if (inter === null && dest === null && !deja.has((p.r + 2 * dr) + ',' + (p.c + 2 * dc))) {
        m.push({ r: p.r + 2 * dr, c: p.c + 2 * dc, capture: false });
      }
    }
  }
  return m;
}

// Cases interdites par une Zone de contrôle adverse : les 8 cases autour de
// chaque fou adverse équipé de 'Zone'. Renvoie un Set de clés "r,c".
export function zonesInterdites(board, owner) {
  const s = new Set();
  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      const q = board[r][c];
      if (!q || q.owner === owner || q.type !== 'B' || !q.upgrades.includes('Zone')) continue;
      for (const [dr, dc] of DIRS8) {
        const nr = r + dr, nc = c + dc;
        if (inB(board, nr, nc)) s.add(nr + ',' + nc);
      }
    }
  }
  return s;
}

// Coups légaux d'une pièce (améliorations de déplacement incluses).
export function coupsLegaux(board, p) {
  let m;
  switch (p.type) {
    case 'P': m = coupsPion(board, p); break;
    case 'N': m = coupsCavalier(board, p); break;
    case 'B': m = coupsFou(board, p); break;
    case 'R': m = coupsTour(board, p); break;
    case 'Q': m = coupsDame(board, p); break;
    case 'K': m = coupsRoi(board, p); break;
    default: return [];
  }
  // Zone de contrôle : une pièce faible (P/N/B) ne peut pas TERMINER un
  // déplacement sur une case sous aura adverse (déplacements et téléportation ;
  // Ruée / Rayon sacré, qui ne déplacent pas, ne passent pas par ici).
  if (TYPES_FAIBLES.has(p.type)) {
    const interdit = zonesInterdites(board, p.owner);
    if (interdit.size) m = m.filter((mv) => !interdit.has(mv.r + ',' + mv.c));
  }
  return m;
}

// Cibles de la Ruée : pièces adverses à distance de cavalier (le cavalier ne bouge pas).
export function ciblesRuee(board, p) {
  const t = [];
  for (const [dr, dc] of KNIGHT) {
    const q = caseAt(board, p.r + dr, p.c + dc);
    if (q && q.owner !== p.owner) t.push({ r: p.r + dr, c: p.c + dc });
  }
  return t;
}

// Cibles du Rayon sacré : sur chacune des 4 diagonales du fou, la 1re pièce
// rencontrée ; si elle est adverse, c'est une cible (le fou ne bouge pas).
export function ciblesRayon(board, p) {
  const t = [];
  for (const [dr, dc] of DIAG) {
    let r = p.r + dr, c = p.c + dc;
    while (inB(board, r, c)) {
      const q = board[r][c];
      if (q) {                                   // 1re pièce sur la diagonale
        if (q.owner !== p.owner) t.push({ r, c }); // adverse -> cible
        break;                                   // qu'elle soit alliée ou non, on s'arrête
      }
      r += dr; c += dc;
    }
  }
  return t;
}
