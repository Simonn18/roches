// roychec — génération des coups légaux (GDD §5.1) + cibles de pouvoirs.
// Pas de détection d'échec/mat : la partie se gagne en capturant le roi (GDD §8.1).
import { inB, caseAt } from './board.js?v=109';

const KNIGHT = [[-2, -1], [-2, 1], [-1, -2], [-1, 2], [1, -2], [1, 2], [2, -1], [2, 1]];
const DIAG = [[-1, -1], [-1, 1], [1, -1], [1, 1]];
const ORTHO = [[-1, 0], [1, 0], [0, -1], [0, 1]];
// Grand saut : décalages de 3×1 ou 3×2, dans toutes les orientations.
const GRAND_SAUT = [
  [-3, -1], [-3, 1], [-3, -2], [-3, 2],
  [3, -1], [3, 1], [3, -2], [3, 2],
  [-1, -3], [1, -3], [-2, -3], [2, -3],
  [-1, 3], [1, 3], [-2, 3], [2, 3],
];
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

// Glissement capture uniquement : ajoute la première pièce adverse rencontrée dans
// chaque direction (utilisé par Folie et Feinte pour les coups d'attaque uniques).
function glisseCapture(m, board, p, dirs) {
  for (const [dr, dc] of dirs) {
    let r = p.r + dr, c = p.c + dc;
    while (inB(board, r, c)) {
      const t = board[r][c];
      if (t === null) { r += dr; c += dc; continue; }
      if (t.owner !== p.owner) m.push({ r, c, capture: true });
      break;
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
  // Pas diagonal [D] : avance d'une case en diagonale, mais uniquement sur
  // une case vide — ce n'est pas une capture diagonale supplémentaire.
  if (p.upgrades.includes('pas-diag')) {
    for (const dc of [-1, 1]) {
      if (caseAt(board, p.r + dir, p.c + dc) === null) {
        m.push({ r: p.r + dir, c: p.c + dc, capture: false, pasDiag: true });
      }
    }
  }
  // Promotion (GDD §5.1.b) : tout coup ARRIVANT sur la dernière rangée adverse est
  // marqué — le choix de pièce (promo) est résolu par main.js (panneau / IA / réseau).
  const derniere = p.owner === 0 ? 0 : board.length - 1;
  for (const mv of m) if (mv.r === derniere) mv.promotion = true;
  return m;
}

function coupsCavalier(board, p) {
  const m = [];
  for (const [dr, dc] of KNIGHT) pousse(m, board, p, p.r + dr, p.c + dc);
  // Grand saut [D] : bond de 3×1 ou 3×2. Le saut ne capture jamais et
  // demande une case intermédiaire libre pour éviter de traverser un obstacle.
  if (p.upgrades.includes('grand-saut') && (p.cooldowns['grand-saut'] || 0) === 0) {
    for (const [dr, dc] of GRAND_SAUT) {
      // L'intermédiaire est toujours un pas de cavalier vers la destination :
      // on réduit la composante LONGUE (3 → 2, ou 2 → 1) et on conserve la
      // composante courte. 3×1 → 2×1, 3×2 → 1×2, 2×3 → 2×1, 1×3 → 1×2.
      const absR = Math.abs(dr), absC = Math.abs(dc);
      const long = absR >= absC ? absR : absC;   // 3 ou 2
      const short = absR >= absC ? absC : absR;  // 1 ou 2
      // Longue réduction : 3×1 → 2, 3×2 → 1, 2×3 → 1, 1×3 → 2.
      const step = (long === 3 && short === 1) ? 2 : 1;
      const iR = absR >= absC
        ? Math.sign(dr) * step
        : Math.sign(dr) * short;
      const iC = absC >= absR
        ? Math.sign(dc) * step
        : Math.sign(dc) * short;
      const intermediate = caseAt(board, p.r + iR, p.c + iC);
      const destination = caseAt(board, p.r + dr, p.c + dc);
      if (intermediate === null && destination === null) {
        m.push({ r: p.r + dr, c: p.c + dc, capture: false, grandSaut: true });
      }
    }
  }
  // Second galop : l'enchaînement d'un 2e saut est géré comme un post-coup
  // (modèle Double coup, voir main.js), pas comme des cases jouables ici.
  return m;
}

function coupsFou(board, p) {
  const m = [];
  glisse(m, board, p, DIAG);                    // coup de base
  // Pas de côté [D] (demande user 31/07) : le fou se déplace comme un cavalier
  // (8 sauts en L), en plus de sa glisse diagonale de base.
  if (p.upgrades.includes('pas-de-cote')) {
    for (const [dr, dc] of KNIGHT) pousse(m, board, p, p.r + dr, p.c + dc);
  }
  // Folie [D] : usage unique, la prochaine attaque se déplace comme une dame.
  // On ajoute tous les déplacements (capture + vides) dans les 8 directions.
  if (p.upgrades.includes('reprise') && !p.folieUsed) {
    glisse(m, board, p, DIRS8);
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
  // Enjambeur [D] : la tour saute la première pièce rencontrée sur son glissement
  // (jamais le roi) et atterrit sur la première case libre derrière elle.
  if (p.upgrades.includes('enjambeur')) {
    for (const [dr, dc] of ORTHO) {
      let r = p.r + dr, c = p.c + dc;
      // Glisser jusqu'à trouver une pièce
      while (inB(board, r, c)) {
        const t = board[r][c];
        if (t !== null) {
          // Si c'est un roi (allié ou adverse), on ne saute jamais par-dessus
          if (t.type === 'K') break;
          // Regarder la case juste derrière
          const br = r + dr, bc = c + dc;
          if (inB(board, br, bc) && board[br][bc] === null) {
            m.push({ r: br, c: bc, capture: false });
          }
          break;
        }
        r += dr; c += dc;
      }
    }
  }
  return m;
}

function coupsDame(board, p) {
  const m = [];
  glisse(m, board, p, DIRS8); // coup de base

  // Feinte [D] : usage unique, la prochaine attaque se déplace comme toutes les
  // pièces. On ajoute les déplacements à la façon du cavalier (cases vides + captures).
  if (p.upgrades.includes('feinte') && !p.feinteUsed) {
    for (const [dr, dc] of KNIGHT) {
      const r = p.r + dr, c = p.c + dc;
      if (inB(board, r, c)) {
        const t = board[r][c];
        if (t === null) m.push({ r, c, capture: false });
        else if (t.owner !== p.owner) m.push({ r, c, capture: true });
      }
    }
  }

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
  // Haute fuite [D] : bond de 3 cases en ligne droite (ortho ou diagonale).
  // Jamais de capture : les deux cases intermédiaires et l'arrivée sont vides.
  if (p.upgrades.includes('haute-fuite')) {
    for (const [dr, dc] of [...DIAG, ...ORTHO]) {
      const r1 = p.r + dr, c1 = p.c + dc;
      const r2 = p.r + 2 * dr, c2 = p.c + 2 * dc;
      const r3 = p.r + 3 * dr, c3 = p.c + 3 * dc;
      if (caseAt(board, r1, c1) === null
          && caseAt(board, r2, c2) === null
          && caseAt(board, r3, c3) === null) {
        m.push({ r: r3, c: c3, capture: false, hauteFuite: true });
      }
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

// Cases interdites par l'aura d'Hypnose adverse : les pièces faibles (P/N/B)
// ne peuvent pas se déplacer dans les cases adjacentes à un fou adverse équipé
// de l'aura Hypnose (debuffs.hypnoseAura > 0). Renvoie un Set de clés "r,c".
export function zonesInterdites(board, owner) {
  const s = new Set();
  for (let r = 0; r < board.length; r++) {
    for (let c = 0; c < board[r].length; c++) {
      const q = board[r][c];
      if (!q || q.owner === owner || q.type !== 'B' || !(q.debuffs && q.debuffs.hypnoseAura > 0)) continue;
      for (let dr = -1; dr <= 1; dr++) {
        for (let dc = -1; dc <= 1; dc++) {
          if (Math.abs(dr) + Math.abs(dc) === 0) continue;
          const nr = r + dr, nc = c + dc;
          if (inB(board, nr, nc)) s.add(nr + ',' + nc);
        }
      }
    }
  }
  return s;
}

// Cases gelées par Épine : contrairement à Hypnose, l'effet bloque toutes les
// pièces adverses, y compris les pièces majeures et les captures.
export function casesEpines(board, owner) {
  const s = new Set();
  for (let r = 0; r < board.length; r++) {
    for (let c = 0; c < board[r].length; c++) {
      const p = board[r][c];
      if (!p || p.owner === owner || !p.epineZone || p.epineZone.turns <= 0) continue;
      s.add(`${p.epineZone.r},${p.epineZone.c}`);
    }
  }
  return s;
}

// Coups légaux d'une pièce (améliorations de déplacement incluses).
export function coupsLegaux(board, p) {
  let m;
  // Gel complet (Sacrifice du roi) : la pièce ne peut plus bouger.
  if (p.debuffs && p.debuffs.root > 0) return [];
  switch (p.type) {
    case 'P': m = coupsPion(board, p); break;
    case 'N': m = coupsCavalier(board, p); break;
    case 'B': m = coupsFou(board, p); break;
    case 'R': m = coupsTour(board, p); break;
    case 'Q': m = coupsDame(board, p); break;
    case 'K': m = coupsRoi(board, p); break;
    default: return [];
  }
  // Épine bloque toute arrivée adverse sur sa case, quelle que soit la pièce.
  const epines = casesEpines(board, p.owner);
  if (epines.size) m = m.filter((mv) => !epines.has(`${mv.r},${mv.c}`));
  // Zone de contrôle : une pièce faible (P/N/B) ne peut pas TERMINER un
  // déplacement sur une case sous aura adverse (déplacements et téléportation ;
  // Ruée / Rayon sacré, qui ne déplacent pas, ne passent pas par ici).
  if (TYPES_FAIBLES.has(p.type)) {
    const interdit = zonesInterdites(board, p.owner);
    if (interdit.size) m = m.filter((mv) => !interdit.has(mv.r + ',' + mv.c));
  }
  return m;
}

// Indique si le roi d'un camp est actuellement attaquable par un coup adverse.
// ROYCHEC conserve la règle historique « capture du roi = victoire » : cette
// fonction est donc informative uniquement et ne filtre aucun coup légal.
export function roiEnEchec(board, owner) {
  if (!board || !board.length || !board[0]) return false;
  let roi = null;
  for (let r = 0; r < board.length; r++) {
    for (let c = 0; c < board[r].length; c++) {
      const piece = board[r][c];
      if (piece && piece.type === 'K' && piece.owner === owner) {
        roi = piece;
        break;
      }
    }
    if (roi) break;
  }
  if (!roi) return false; // roi déjà capturé : état de fin, pas un « échec » à afficher

  for (let r = 0; r < board.length; r++) {
    for (let c = 0; c < board[r].length; c++) {
      const piece = board[r][c];
      if (!piece || piece.owner === owner) continue;
      if (coupsLegaux(board, piece).some((move) =>
        move.capture && move.r === roi.r && move.c === roi.c)) return true;
    }
  }
  return false;
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

// Cibles de Vétéran (pion) : le pion ENNEMI se trouvant directement en face
// (même colonne, une rangée devant). Décision utilisateur 31/07 : ne cible QUE
// les pions adverses (pas les autres pièces). Le pion vétéran ne bouge pas — il
// capture le pion qui lui fait face (GDD §6). Direction = celle de la marche.
export function ciblesVet(board, p) {
  const dir = p.owner === 0 ? -1 : 1;
  const r = p.r + dir;
  const q = caseAt(board, r, p.c);
  if (q && q.owner !== p.owner && q.type === 'P') return [{ r, c: p.c }];
  return [];
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
