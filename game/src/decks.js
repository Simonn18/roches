// roychec — Deck Builder d'upgrades (GDD §5.3.c v3.3 — demande utilisateur 12/07 23:55+).
// Couche DONNÉES pure (pas de DOM, pas de canvas) : le module expose load/save/validate
// et des helpers de manipulation de slots. Le rendu et l'intégration UI vivent dans
// render.js / main.js.
//
// Modèle :
//   decksRoot = { active: 'default', decks: { [id]: Deck } }
//   Deck      = { name: string, slots: { P: {D,A,S}, N: {...}, B: {...}, R: {...}, Q: {...}, K: {D,A,S} } }
//   slot value = upgrade id (string) | null (vide)
//
// Roi (K) = 3 slots D/A/S comme tous les autres types. Sacrifice est en [S] et
// Décret en [A] (constants.js) ; la migration conserve les choix déjà sauvegardés.
// La catégorie du pion a été inversée : Bouclier est maintenant [S], Vétéran [A].
//
// Persistance : localStorage clé 'roychec_decks_v1' (le _v1 permet une migration future
// si le format évolue). Validation systématique au load : un fichier corrompu / une carte
// retirée du catalogue n'invalide pas le deck (les slots sont conservés tels quels — l'UI
// les ignorera à l'affichage), mais le format global est assaini.

// -----------------------------------------------------------------------
// 1. Constantes
// -----------------------------------------------------------------------

const STORAGE_KEY = 'roychec_decks_v1';
// v3.3 r12 (13/07 demandeur) : barre horizontale 1..5 -> cap dur a 5.
// v3.3 r12 (13/07 demandeur) : barre horizontale 1..5 -> cap dur a 5.
export const DECK_LIMIT = 5;                // cap dur UI (= nb d'onglets visibles)
const PIECE_TYPES = ['P', 'N', 'B', 'R', 'Q', 'K'];
// Schéma de migration cumulatif : on bumpe `_schemaVersion` à chaque migration one-shot.
// Les migrations CUMULATIVES idempotentes (Sacrifice↔Décret inversions cat, Bouclier↔Vétéran
// cat) restent dans sanitizeDeck() (auto-arming par état-devenu-incohérent). Les migrations
// UNILATÉRALES (swaps A→A où l'utilisateur peut vouloir revenir à l'ancienne valeur)
// sont gérées dans sanitizeRoot() via ce numéro de version, pour ne JAMAIS s'appliquer
// deux fois de force (cf. bug v4.4.2 : si l'utilisateur remet 'Rayon' après migration
// Rayon→hypnose, le rechargement écrasait silencieusement son choix).
const SCHEMA_VERSION = 5;

// Catalogue « tous les slots valides » par type — utilisé par sanitizeDeck() pour
// nettoyer un état chargé d'un vieux build (un upgrade retiré n'est pas une erreur, juste
// un slot ignoré au rendu). Ne dépend pas de constants.js pour rester testable.
// v3.3 r11 (13/07 03:00+) : tous les types (P, N, B, R, Q, K) ont 3 slots D/A/S.
const SLOT_LABELS = { D: 'Déplacement', A: 'Actif', S: 'Stat' };

// -----------------------------------------------------------------------
// 2. Construction
// -----------------------------------------------------------------------

// Construit le slot map pour un type de pièce. Si `overrides` est fourni, il est appliqué
// tel quel ; sinon on retourne un slot vide pour chaque catégorie.
// `idForCat(type, cat)` est la fonction optionnelle qui retourne l'id par défaut pour
// un (type, cat) — utile pour defaultDeck() (fourni par constants.UPGRADES).
export function emptySlots(type, idForCat) {
  const out = {};
  for (const cat of Object.keys(SLOT_LABELS)) {
    out[cat] = idForCat ? (idForCat(type, cat) || null) : null;
  }
  return out;
}

// Construit un deck vide (tous les slots à null) ou copie d'un autre deck, ou encore
// pré-rempli avec un mapping type→cat→id.
export function makeDeck({ name = 'Nouveau deck', slots = null } = {}) {
  const s = {};
  for (const t of PIECE_TYPES) {
    s[t] = slots && slots[t]
      ? { ...slots[t] }
      : emptySlots(t);
  }
  return { name, slots: s };
}

// ID unique stable pour un nouveau deck (évite les collisions de nom de clé).
export function newDeckId() {
  return 'd_' + Math.random().toString(36).slice(2, 9);
}

// -----------------------------------------------------------------------
// 3. Validation / sanitisation
// -----------------------------------------------------------------------

// Assainit un deck : retire les ids inconnus, force les types, supprime les clés
// inattendues. Renvoie un deck neuf (NE mute PAS l'entrée).
export function sanitizeDeck(deck) {
  const out = makeDeck({ name: typeof deck?.name === 'string' ? deck.name : 'Sans nom' });
  if (deck && deck.slots && typeof deck.slots === 'object') {
    for (const t of PIECE_TYPES) {
      const src = deck.slots[t];
      if (!src || typeof src !== 'object') continue;
      for (const cat of Object.keys(SLOT_LABELS)) {
        const v = src[cat];
        if (typeof v === 'string' && v.length > 0 && v.length < 40) {
          out.slots[t][cat] = v;
        } else {
          out.slots[t][cat] = null;
        }
      }
    }
    // Migration des decks existants : Sacrifice [A→S] et Décret [S→A].
    // Les états plus anciens avec Décret déjà en A sont déjà conformes.
    const roi = out.slots.K;
    if (roi.A === 'sacrifice' && roi.S === 'decret') {
      roi.A = 'decret';
      roi.S = 'sacrifice';
    } else if (roi.A === 'sacrifice' && roi.S == null) {
      roi.A = null;
      roi.S = 'sacrifice';
    } else if (roi.S === 'decret' && roi.A == null) {
      roi.A = 'decret';
      roi.S = null;
    }
    // Migration des decks existants : conserve les choix du joueur dans leur
    // nouvelle catégorie après l'inversion Bouclier [A→S] / Vétéran [S→A].
    const pion = out.slots.P;
    if (pion.A === 'bouclier' && (pion.S === 'vet' || pion.S == null)) {
      pion.A = pion.S === 'vet' ? 'vet' : null;
      pion.S = 'bouclier';
    } else if (pion.S === 'vet' && pion.A == null) {
      pion.A = 'vet';
      pion.S = null;
    }
    // NOTE : la migration v4.4 (Hypnose remplace Rayon dans le deck Fou cat A) est
    // gérée par sanitizeRoot() avec un _schemaVersion stamp (cf. SCHEMA_VERSION), pas
    // ici. Raison : c'est un swap UNILATÉRAL (A→A), pas une inversion cat — si on
    // l'exécutait à chaque sanitizeDeck (= chaque loadDecks), un user qui remet 'Rayon'
    // via le deck editor verrait son choix écrasé silencieusement au rechargement.
    // On ne migre que la PREMIÈRE fois (schemaVersion < 4).
  }
  return out;
}

// Assainit un decksRoot complet. Garantit qu'il existe au moins un deck 'default'.
// Si l'id actif n'existe plus (deck supprimé), bascule sur 'default'.
export function sanitizeRoot(root) {
  let decks = {};
  if (root && root.decks && typeof root.decks === 'object') {
    for (const [id, deck] of Object.entries(root.decks)) {
      if (!/^d_[a-z0-9]{4,12}$/.test(id) && id !== 'default') continue; // ids légitimes uniquement
      decks[id] = sanitizeDeck(deck);
    }
  }
  if (Object.keys(decks).length === 0) {
    decks.default = makeDeck({ name: 'Mon deck' });
  }
  // v3.3 r12 : cap dur a 5 decks (UI tab bar). On tronque silencieusement les
  // excedents d'un vieux localStorage (r10/r11 acceptait jusqu'a 8). Si
  // l'actif est dans la liste tombée, on bascule sur le 1er restant.
  if (Object.keys(decks).length > DECK_LIMIT) {
    const keeps = Object.keys(decks).slice(0, DECK_LIMIT);
    const dropped = Object.keys(decks).filter((k) => !keeps.includes(k));
    const out = {};
    for (const k of keeps) out[k] = decks[k];
    decks = out;
    console.warn("[decks] troncature r12: " + dropped.length + " deck(s) abandonné(s) (cap 5). Recliquer sur les onglets concernés.");
  }
  let active = typeof root?.active === 'string' ? root.active : 'default';
  if (!decks[active]) active = Object.keys(decks)[0];

  // --- Migrations one-shot gérées par SCHEMA_VERSION ---
  // Lit la version portée par le root (_schemaVersion) ; défaut 0 si absente.
  // Chaque incrément déclenche TOUTES les migrations cumulatives < SCHEMA_VERSION,
  // exactement UNE fois. L'utilisateur peut ensuite modifier son deck librement sans
  // risquer qu'une migration unilatérale (cat A→A) écrase son choix au rechargement.
  let schemaVersion = (root && typeof root._schemaVersion === 'number') ? root._schemaVersion : 0;
  if (schemaVersion < SCHEMA_VERSION) {
    // v4.4 — Hypnose remplace Rayon en cat A du Fou (1ère migration cumul. one-shot).
    // Avant ce bump, les decks existants dataient d'avant le catalogue étendu du Fou,
    // et 'Rayon' était la cat A par défaut. On swap les decks pré-v4 vers hypnose
    // pour rendre la nouvelle carte achetable dans le shop. NE SE RE-EXÉCUTE PAS si
    // l'utilisateur remet 'Rayon' manuellement ensuite (la version bump à SCHEMA_VERSION
    // ferme la migration définitivement, préservant le choix de l'utilisateur).
    for (const id of Object.keys(decks)) {
      const fou = decks[id] && decks[id].slots && decks[id].slots.B;
      if (fou && fou.A === 'Rayon') {
        fou.A = 'hypnose';
      }
    }
    // v4.5 — Cavalerie (N cat A) / Echange (R cat A) / SHT (Q cat A) remplacent leurs
    // defaults pré-catalogue-étendu (`ruee` / `rempart` / `double-coup`). Cumulatif
    // sur le bloc v4.4 Hypnose : si `schemaVersion < 5`, les 2 blocs s'exécutent en
    // séquence (legacy decks `_schemaVersion = 0` → 5 directement). Idempotence :
    // exact-match only — un user qui a customisé N.A avec un autre id ou `null`
    // n'est PAS écrasé (le swap ne déclenche que sur la valeur par défaut historique).
    // Même contrat que v4.4 : après bump à 5, NE SE RÉ-EXÉCUTE JAMAIS — l'utilisateur
    // peut remettre 'ruee' via le deck editor sans risquer un overwrite silencieux
    // au rechargement (cf. leçon §8.1 idempotence hole CA-2026-07-15-24:35).
    for (const id of Object.keys(decks)) {
      const slots = decks[id] && decks[id].slots;
      if (!slots) continue;
      if (slots.N && slots.N.A === 'ruee') slots.N.A = 'cavalerie';
      if (slots.R && slots.R.A === 'rempart') slots.R.A = 'echange';
      if (slots.Q && slots.Q.A === 'double-coup') slots.Q.A = 'sht';
    }
    schemaVersion = SCHEMA_VERSION;
  }
  // Note : on garde le préfixe `_schemaVersion` (pas `schemaVersion`) sur l'objet serialized
  // pour signaler aux lecteurs d'API que ce champ est MÉTADONNÉE (pas un slot utilisateur).

  return { active, decks, _schemaVersion: schemaVersion };
}

// -----------------------------------------------------------------------
// 4. Persistance
// -----------------------------------------------------------------------

// Lit depuis localStorage. Renvoie un root assaini (jamais null). Sur erreur (JSON
// corrompu, localStorage indisponible, version future non gérée), reset silencieux.
export function loadDecks() {
  try {
    if (typeof localStorage === 'undefined') return makeDefaultDecks();
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return makeDefaultDecks();
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return makeDefaultDecks();
    return sanitizeRoot(parsed);
  } catch (e) {
    console.warn('[decks] load failed, resetting to default:', e);
    return makeDefaultDecks();
  }
}

// Écrit dans localStorage. Échec silencieux (mode privé Safari, quota plein).
export function saveDecks(root) {
  try {
    if (typeof localStorage === 'undefined') return;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(sanitizeRoot(root)));
  } catch (e) {
    console.warn('[decks] save failed:', e);
  }
}

// Construit le decksRoot initial pour un 1er run : un seul deck 'Mon deck' avec TOUTES
// les upgrades pré-cochées (filtre = aucun en partie = comportement legacy v2). L'uti-
// lisateur voit immédiatement un deck complet non restrictif ; il peut ensuite éditer
// pour restreindre. On n'utilise pas constants.js ici pour éviter une dépendance cyclique
// (decks.js est importé par main.js qui importe déjà constants.js — l'import est OK
// en ESM mais on garde decks.js PUR pour rester testable).
function makeDefaultDecks() {
  // Mappings explicites (le catalogue n'est pas importé pour découpler).
  // Ces ids DOIVENT correspondre à constants.js UPGRADES.
  // v4.4 — Hypnose (fou, cat A, 11¤) devient le cat A par défaut du Fou (extension
  // catalogue v4.4). Hypnose remplace Rayon en cat A (1 slot par cat). Les decks
  // existants avec Rayon sont migrés automatiquement par `sanitizeDeck()` plus bas.
  const full = {
    P: { D: 'marche-arriere', A: 'vet', S: 'bouclier' },
    N: { D: 'second', A: 'cavalerie', S: 'monture' },
    B: { D: 'pas-de-cote', A: 'hypnose', S: 'Zone' },
    R: { D: 'pivot', A: 'echange', S: 'forteresse' },
    Q: { D: 'Tele', A: 'sht', S: 'couronne' },
    K: { D: 'passe-royale', A: 'decret', S: 'sacrifice' },
  };
  const deck = makeDeck({ name: 'Mon deck' });
  for (const t of PIECE_TYPES) deck.slots[t] = { ...full[t] };
  return { active: 'default', decks: { default: deck } };
}

// -----------------------------------------------------------------------
// 5. Helpers de lecture / manipulation
// -----------------------------------------------------------------------

// Renvoie le deck actif (objet {name, slots}) ou null si pas de decks. Ne mute pas.
export function getActiveDeck(root) {
  if (!root || !root.decks) return null;
  return root.decks[root.active] || Object.values(root.decks)[0] || null;
}

// Liste les upgrades filtrés pour un type de pièce donné (la liste qu'on montre
// dans le shop en partie). Renvoie une liste d'ids — le caller doit filtrer les
// déjà-équipés et la limite MAX_UPGRADES_PAR_PIECE côté gameplay.
// `allForType` = liste brute fournie par le caller (UPGRADES_PAR_TYPE[type]).
export function upgradesForPiece(deck, type, allForType) {
  if (!allForType) return [];
  if (!deck || !deck.slots || !deck.slots[type]) {
    // Fallback sur le catalogue complet si aucun deck actif ou slot non configuré.
    // Cela garantit que le jeu reste jouable même si le deck est vide/corrompu,
    // et que le rendu et la logique d'achat restent cohérents.
    return allForType.slice();
  }
  const slot = deck.slots[type];
  const ids = [];
  for (const v of Object.values(slot)) {
    if (typeof v === 'string') ids.push(v);
  }
  // Filtre par appartenance au catalogue (un slot pourri ne fait pas planter).
  const allowed = new Set(allForType);
  const result = ids.filter((id) => allowed.has(id));
  // Si le deck n'a aucune upgrade valide pour ce type, on fallback sur le
  // catalogue complet pour éviter un shop vide/non-jouable.
  return result.length ? result : allForType.slice();
}

// Vrai si l'upgrade est dans le deck actif (= sera visible dans le shop).
export function isActiveUpgrade(deck, type, upgradeId) {
  if (!deck || !upgradeId) return false;
  const slot = deck.slots[type];
  if (!slot) return false;
  for (const v of Object.values(slot)) if (v === upgradeId) return true;
  return false;
}

// Applique un slot (immutable : retourne un nouveau root). `value` peut être null
// pour vider le slot.
export function setSlot(root, type, cat, value) {
  const next = sanitizeRoot(root);
  const deck = next.decks[next.active];
  if (!deck || !deck.slots[type]) return next;
  if (deck.slots[type][cat] === value) return next;
  // Si on remplit un slot exclusif avec un id, on purge les autres slots de la
  // même paire exclusive (cas K.A : choisir Sacrifice vide Décret et vice-versa).
  deck.slots[type] = { ...deck.slots[type], [cat]: value };
  return next;
}

// Crée un nouveau deck (clonage de l'actif pour ne pas partir de zéro) et le
// sélectionne. Renvoie {root, newId}. Échoue (renvoie le root inchangé) si la
// limite DECK_LIMIT est atteinte.
export function createDeck(root, name) {
  const next = sanitizeRoot(root);
  if (Object.keys(next.decks).length >= DECK_LIMIT) return { root: next, newId: null };
  const id = newDeckId();
  const src = next.decks[next.active] || Object.values(next.decks)[0];
  // Clone profond des slots (le nom seul est nouveau).
  const cloned = makeDeck({
    name: (typeof name === 'string' && name.trim()) ? name.trim().slice(0, 24) : `Deck ${Object.keys(next.decks).length + 1}`,
    slots: deepCloneSlots(src ? src.slots : null),
  });
  next.decks[id] = cloned;
  next.active = id;
  return { root: next, newId: id };
}

function deepCloneSlots(slots) {
  const out = {};
  for (const t of PIECE_TYPES) {
    out[t] = {};
    for (const cat of Object.keys(SLOT_LABELS)) {
      out[t][cat] = (slots && slots[t] && slots[t][cat]) || null;
    }
  }
  return out;
}

// Supprime un deck. Renvoie le root mis à jour. Ne supprime jamais le dernier deck.
export function deleteDeck(root, id) {
  const next = sanitizeRoot(root);
  if (Object.keys(next.decks).length <= 1) return next;
  if (!next.decks[id]) return next;
  delete next.decks[id];
  if (next.active === id) next.active = Object.keys(next.decks)[0];
  return next;
}

// Renomme un deck. Trim à 24 chars (UI menu fit).
export function renameDeck(root, id, newName) {
  const next = sanitizeRoot(root);
  if (!next.decks[id]) return next;
  const trimmed = (typeof newName === 'string' ? newName.trim() : '').slice(0, 24);
  if (!trimmed) return next;
  next.decks[id] = { ...next.decks[id], name: trimmed };
  return next;
}

// Change le deck sélectionné. `id` doit exister.
export function setActiveDeck(root, id) {
  const next = sanitizeRoot(root);
  if (!next.decks[id]) return next;
  next.active = id;
  return next;
}
