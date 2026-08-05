// roychec — enregistrement de partie (replay) pour tutoriel / analyse.
// Hooké dans main.js (jouerCoup, acheter, pouvoirs, finPartie).
// Sortie : markdown téléchargeable + localStorage (max 20 parties).
import { NOM_JOUEUR, ACCENT, REVENU_PAR_COUP } from './constants.js?v=109';
import { VARIANT_PRESETS, ECONOMIES, COMBATS, DEFAULT_VARIANT } from './variants.js?v=107';
// Phase A.5 v2 : toAlgebraic doit connaître la hauteur du plateau pour encoder
// correctement les rangées sous forme algébrique (8 - r sur plateau 8×N).
import { DEFAULT_TAILLE, getBoardH } from './tailles.js?v=108';

// ---------------------------------------------------------------------------
// Helpers d'affichage
// ---------------------------------------------------------------------------

const PIECE_EMOJI = { P: '♟', N: '♞', B: '♝', R: '♜', Q: '♛', K: '♚' };
const PIECE_NOM = { P: 'Pion', N: 'Cavalier', B: 'Fou', R: 'Tour', Q: 'Dame', K: 'Roi' };

// Encode une case (r, c) en notation algébrique. Supporte jusqu'à 15 colonnes
// (a-o) et toute hauteur de plateau via boardOrRows (board avec .rows ou nombre).
function toAlgebraic(r, c, boardOrRows) {
  const rows = (boardOrRows && boardOrRows.rows) || boardOrRows || 8;
  const file = String.fromCharCode(97 + c);
  return file + (rows - r);
}

function formatTime(ts) {
  const d = new Date(ts);
  return d.toISOString().replace('T', ' ').slice(0, 19);
}

function formatDuration(ms) {
  const s = Math.floor(ms / 1000);
  const m = Math.floor(s / 60);
  return m > 0 ? `${m} min ${s % 60} s` : `${s} s`;
}

const MODE_LABEL = { pvp: '1J vs 2J (Hot-seat)', hunt: 'Chasse aux améliorations', pvai: 'Humain vs IA', spectator: 'Spectateur (IA vs IA)' };

// ---------------------------------------------------------------------------
// API publique
// ---------------------------------------------------------------------------

// Initialise l'enregistreur pour une nouvelle partie.
export function initReplay(state) {
  const r = {
    mode: state.mode,
    difficulty: state.ai ? state.ai.difficulty : null,
    // Variante locale (GDD §7.2 v3) : snapshot de l'id pour fidélité du replay.
    // Pour les modes hors scope (PvAI / PvP en ligne), `state.variant` est TOUJOURS
    // la variante standard (DEFAULT_VARIANT) — la snapshot ne capture rien d'autre.
    variant: (state && state.variant && state.variant.id) || DEFAULT_VARIANT,
    startTime: Date.now(),
    // Phase A.5 v2 : la taille du plateau est nécessaire pour recréer un board
    // fidèle dans l'opening book (hash dynamique) et pour décoder les replays.
    taille: state.taille || DEFAULT_TAILLE,
    huntRngSeed: state.huntRngSeed >>> 0,
    huntBonuses: null,
    events: [],
    stats: {
      purchases: { 0: [], 1: [] },
      powers: { 0: 0, 1: 0 },
      captures: { 0: 0, 1: 0 },
      maxEcus: [0, 0],
    },
  };
  state.replay = r;
  return r;
}

// Enregistre un mouvement. `mv` (optionnel) porte les métadonnées roque/promotion
// (GDD §5.1.b) — au moment de l'appel, piece.type est déjà le type promu.
// `gain` (optionnel) = total d'écus effectivement crédités pour ce coup (inclut
// revenueBase × REVENU_PAR_COUP + captureBonus × captureMul). Stocké pour fidélité
// du replay sous variantes non-standards (GDD §7.2 v3). Backward compat : si null
// (replays pré-v3), à l'application on retombe sur REVENU_PAR_COUP+bonus, qui
// matche exactement les parties standard enregistrées avant cette version.
export function recordMove(state, piece, from, to, capturedType, bonus, mv, gain) {
  if (!state.replay) return;
  const r = state.replay;
  if (capturedType) r.stats.captures[piece.owner]++;
  // Plafond écus (le solde a déjà été crédité par gagnerEcus).
  r.stats.maxEcus[piece.owner] = Math.max(r.stats.maxEcus[piece.owner], state.ecus[piece.owner]);
  r.events.push({
    idx: r.events.length,
    type: 'move',
    owner: piece.owner,
    piece: piece.type,
    from: toAlgebraic(from.r, from.c, state.board),
    to: toAlgebraic(to.r, to.c, state.board),
    captured: capturedType || null,
    bonus: bonus || 0,
    // gain effectif (fidéle à la variante utilisée). Null = replay pré-v3.
    gain: gain != null ? gain : null,
    chain: !!state.chain,
    // Métadonnées des déplacements issus des nouvelles cartes bonus.
    pasDiag: !!(mv && mv.pasDiag),
    grandSaut: !!(mv && mv.grandSaut),
    hauteFuite: !!(mv && mv.hauteFuite),
    promo: mv && mv.promotion ? piece.type : null,
    castle: mv && mv.castle
      ? { rookFrom: toAlgebraic(mv.castle.rookFrom.r, mv.castle.rookFrom.c, state.board),
          rookTo: toAlgebraic(mv.castle.rookTo.r, mv.castle.rookTo.c, state.board) }
      : null,
  });
}

// Enregistre un achat (appelé après débit du solde et push dans piece.upgrades).
export function recordPurchase(state, piece, upgradeId, cost) {
  if (!state.replay) return;
  const r = state.replay;
  r.stats.purchases[piece.owner].push({ id: upgradeId, turn: r.events.length, cost });
  r.stats.maxEcus[piece.owner] = Math.max(r.stats.maxEcus[piece.owner], state.ecus[piece.owner]);
  r.events.push({
    idx: r.events.length,
    type: 'purchase',
    owner: piece.owner,
    piece: piece.type,
    pos: toAlgebraic(piece.r, piece.c, state.board),
    upgrade: upgradeId,
    cost,
  });
}

// Enregistre l'activation d'un pouvoir actif. `gain` (optionnel) = total d'écus
// crédités pour les pouvoirs ACTIFS qui rapportent (Ruée, Rayon sacré — Rempart,
// Sacrifice, Décret ne créditent rien). Voir recordMove() pour la sémantique gain.
export function recordPower(state, piece, powerType, targetPos, gain) {
  if (!state.replay) return;
  const r = state.replay;
  r.stats.powers[piece.owner]++;
  r.events.push({
    idx: r.events.length,
    type: 'power',
    owner: piece.owner,
    piece: piece.type,
    power: powerType,
    // Position de la pièce au moment du pouvoir : utile pour rejouer Épine
    // précisément, sans ambiguïté si plusieurs pièces ont le même type.
    pos: piece ? { r: piece.r, c: piece.c } : null,
    target: targetPos || null,
    gain: gain != null ? gain : null,
  });
}

// Enregistre une récompense gratuite du mode Chasse. La position de la nouvelle
// case est conservée pour que le replay puisse reproduire le plateau bonus.
export function recordHuntAward(state, piece, upgradeId, cell, nextCell) {
  if (!state.replay) return;
  const r = state.replay;
  r.events.push({
    idx: r.events.length,
    type: 'hunt-award',
    owner: piece.owner,
    piece: piece.type,
    pos: toAlgebraic(piece.r, piece.c, state.board),
    upgrade: upgradeId,
    cell: cell ? { ...cell } : null,
    nextCell: nextCell ? { ...nextCell } : null,
  });
}

// Finalise le replay au game over. À appeler dans finPartie().
export function finalizeReplay(state) {
  if (!state.replay) return null;
  const r = state.replay;
  r.result = {
    winner: state.winner,
    totalActions: r.events.length,
    duration: Date.now() - r.startTime,
  };
  saveToLocalStorage(state);
  exposeForDebug(state);
  return r;
}

// ---------------------------------------------------------------------------
// Conversion markdown
// ---------------------------------------------------------------------------

export function toMarkdown(state) {
  const boardRows = getBoardH(state.taille || DEFAULT_TAILLE);
  const r = state.replay;
  if (!r || !r.result) return '';
  const win = r.result.winner;
  const modeLabel = MODE_LABEL[r.mode] || r.mode;
  const diffLabel = r.difficulty ? ` niv.${r.difficulty}` : '';

  let md = '';
  md += `# Partie — ${modeLabel}${diffLabel}\n`;
  md += `**Date:** ${formatTime(r.startTime)}  \n`;
  md += `**Durée:** ${r.result.totalActions} actions (${formatDuration(r.result.duration)})  \n`;
  md += `**Vainqueur:** ${NOM_JOUEUR[win]} — capture du roi 🏆\n`;
  // Variante locale (GDD §7.2 v3) : libellé lisible de l'en-tête (« Plafond 15 ×
  // Élim. ×2 »). Lookup direct dans les catalogues ECONOMIES / COMBATS (qui sont
  // importés au-dessus). Les parties standard (DEFAULT_VARIANT) et pré-v3 (variant
  // absent) n'affichent rien — l'en-tête reste concis pour le MVP.
  if (r.variant && r.variant !== DEFAULT_VARIANT) {
    const preset = VARIANT_PRESETS.find((v) => v.id === r.variant);
    if (preset) {
      const ecoLabel = (ECONOMIES.find((e) => e.id === preset.economie) || {}).label || preset.economie;
      const cbtLabel = (COMBATS.find((c) => c.id === preset.combat) || {}).label || preset.combat;
      md += `**Variante:** ${ecoLabel} × ${cbtLabel}\n`;
    }
  }
  md += '\n';

  // Chronologie
  md += '## Déroulement\n';
  md += '| # | Joueur | Action | Détail |\n';
  md += '|---|--------|--------|--------|\n';
  for (const e of r.events) {
    const joueur = `${NOM_JOUEUR[e.owner]}`;
    if (e.type === 'move') {
      const emoji = PIECE_EMOJI[e.piece];
      const capture = e.captured ? ` × ${PIECE_EMOJI[e.captured]} capture ${PIECE_NOM[e.captured]}` : '';
      const bonus = e.bonus ? ` (+${e.bonus + 2} écus)` : ' (+2 écus)'; // +2 base + bonus
      const chainTag = e.chain ? ' 🔗 chaîne' : '';
      md += `| ${e.idx + 1} | ${joueur} | ${emoji} ${PIECE_NOM[e.piece]} | ${e.from} → ${e.to}${capture}${bonus}${chainTag} |\n`;
    } else if (e.type === 'purchase') {
      md += `| ${e.idx + 1} | ${joueur} | 🛒 Achat | ${PIECE_NOM[e.piece]} en ${e.pos} : ${e.upgrade} (−${e.cost} écus) |\n`;
    } else if (e.type === 'power') {
      const target = e.target ? ` → ${toAlgebraic(e.target.r, e.target.c, boardRows)}` : '';
      md += `| ${e.idx + 1} | ${joueur} | ⚡ ${e.power} | ${PIECE_NOM[e.piece]}${target} (consomme le tour) |\n`;
    } else if (e.type === 'hunt-award') {
      md += `| ${e.idx + 1} | ${joueur} | ✦ Chasse | ${PIECE_NOM[e.piece]} reçoit ${e.upgrade || 'aucune'} sur ${e.pos} |\n`;
    }
  }
  md += '\n';

  // Statistiques
  md += '## Statistiques\n';
  md += '| | Joueur 1 | Joueur 2 |\n';
  md += '|---|---|---|\n';

  const achatsLabel = (owner) => {
    const items = r.stats.purchases[owner];
    if (!items.length) return '—';
    return items.map(p => `${p.id} (action ${p.turn + 1}, −${p.cost})`).join(', ');
  };
  md += `| Achats | ${achatsLabel(0)} | ${achatsLabel(1)} |\n`;
  md += `| Pouvoirs activés | ${r.stats.powers[0]} | ${r.stats.powers[1]} |\n`;
  md += `| Captures | ${r.stats.captures[0]} | ${r.stats.captures[1]} |\n`;
  md += `| Écus max | ${r.stats.maxEcus[0]} | ${r.stats.maxEcus[1]} |\n`;
  md += '\n';

  // Moments clés (captures de pièces majeures, achats ≥ 12 écus, chaînes)
  md += '## Moments clés\n';
  let highlights = 0;
  for (const e of r.events) {
    if (e.type === 'move' && e.captured) {
      if (['Q', 'R', 'K'].includes(e.captured)) {
        md += `- **Action ${e.idx + 1}:** ${PIECE_NOM[e.piece]} capture ${PIECE_NOM[e.captured]} en ${e.to}\n`;
        highlights++;
      }
    }
    if (e.type === 'purchase' && e.cost >= 12) {
      md += `- **Action ${e.idx + 1}:** Achat décisif — ${e.upgrade} sur ${PIECE_NOM[e.piece]} (−${e.cost} écus)\n`;
      highlights++;
    }
    if (e.type === 'move' && e.chain) {
      md += `- **Action ${e.idx + 1}:** Chaîne — ${PIECE_NOM[e.piece]} enchaîne un 2e coup\n`;
      highlights++;
    }
  }
  if (!highlights) md += 'Aucun moment décisif détecté.\n';

  return md;
}

// ---------------------------------------------------------------------------
// Stockage & debug
// ---------------------------------------------------------------------------

const MAX_STORED = 20;
const LS_PREFIX = 'roychec-replay-';

export function downloadReplayMD(state) {
  if (typeof document === 'undefined') return;
  const md = toMarkdown(state);
  if (!md) return;
  const blob = new Blob([md], { type: 'text/markdown;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `roychec-partie-${state.replay ? state.replay.startTime : Date.now()}.md`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  // Firefox/Chromium peuvent ne pas avoir queue le download au moment du click ;
  // un court délai évite de révoquer l'URL avant que le navigateur ne l'ait lue.
  setTimeout(() => URL.revokeObjectURL(url), 100);
}

function saveToLocalStorage(state) {
  try {
    if (typeof localStorage === 'undefined') return;
    const md = toMarkdown(state);
    if (!md) return;
    const payload = JSON.stringify({ md, data: state.replay });
    const key = LS_PREFIX + state.replay.startTime;
    localStorage.setItem(key, payload);
    // Nettoyage : garder les MAX_STORED plus récents.
    const keys = Object.keys(localStorage)
      .filter(k => k.startsWith(LS_PREFIX))
      .sort();
    while (keys.length > MAX_STORED) localStorage.removeItem(keys.shift());
  } catch (_) { /* localStorage indisponible ou plein — non bloquant */ }
}

// Vrai si au moins un replay est stocké dans localStorage.
export function hasReplays() {
  try {
    if (typeof localStorage === 'undefined') return false;
    return Object.keys(localStorage).some(k => k.startsWith(LS_PREFIX));
  } catch (_) { return false; }
}

// Charge le replay le plus récent. Renvoie l'objet data ou null.
export function loadLastReplay() {
  try {
    if (typeof localStorage === 'undefined') return null;
    const keys = Object.keys(localStorage)
      .filter(k => k.startsWith(LS_PREFIX))
      .sort();
    if (!keys.length) return null;
    return loadReplayByKey(keys[keys.length - 1]);
  } catch (_) { return null; }
}

// Charge un replay par sa clé localStorage. Renvoie l'objet data ou null.
export function loadReplayByKey(key) {
  try {
    if (typeof localStorage === 'undefined') return null;
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return parsed.data || null;
  } catch (_) { return null; }
}

// Liste les replays disponibles (max 5, du plus récent au plus ancien).
// Chaque entrée contient les infos pour l'affichage dans le menu.
export function getReplayList() {
  try {
    if (typeof localStorage === 'undefined') return [];
    const keys = Object.keys(localStorage)
      .filter(k => k.startsWith(LS_PREFIX))
      .sort()
      .reverse();
    // 20 = tout le stock localStorage (LS_MAX) — l'écran REPLAYS dédié les liste tous.
    return keys.slice(0, 20).map(key => {
      try {
        const raw = localStorage.getItem(key);
        const parsed = JSON.parse(raw);
        const d = parsed.data;
        return {
          key,
          mode: d.mode || '?',
          difficulty: d.difficulty || null,
          startTime: d.startTime || 0,
          totalActions: d.result ? d.result.totalActions : (d.events ? d.events.length : 0),
          winner: d.result ? d.result.winner : null,
          duration: d.result ? d.result.duration : 0,
        };
      } catch (_) { return null; }
    }).filter(Boolean);
  } catch (_) { return []; }
}

function exposeForDebug(state) {
  if (typeof window === 'undefined') return;
  const md = toMarkdown(state);
  if (!window.__roychec) window.__roychec = {};
  window.__roychec.lastReplayMD = md;
  window.__roychec.lastReplay = state.replay;
}
