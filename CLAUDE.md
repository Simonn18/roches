# ROYCHEC — Jeu vidéo 2D web

Fichier d'instructions racine. Il fait office de **contrat** : architecture, roster des agents,
arborescence, conventions et règles transverses. Chaque agent lit ce fichier avant de produire.

Le projet **roychec** est un **jeu vidéo 2D jouable dans le navigateur**.

---

## 1. Stack technique

| Brique | Choix | Détail |
|---|---|---|
| Langage | **JavaScript (ES modules)** | Pas de build, pas de bundler au départ. |
| Rendu | **HTML5 Canvas 2D** | Prototype léger. Upgradable vers **Phaser 3** si le scope grossit. |
| Point d'entrée | `game/index.html` | Charge `game/src/main.js`. |
| Assets | `game/assets/` | Sprites, sons, tilesets. Placeholders acceptés tant que l'art final n'est pas prêt. |
| Lancer | serveur statique local | `python3 -m http.server 8000 --directory game` → http://localhost:8000 |

> Règle stack : tant que le prototype tient en Canvas pur, on n'ajoute pas Phaser. On migre
> seulement quand un besoin réel l'exige (physique complexe, scènes multiples, tilemaps lourds).

---

## 2. Principe directeur

**L'orchestrateur (Claude Code) route et consolide, il n'écrit pas le livrable à la place d'un
agent spécialisé.** Chaque livrable a un **auteur unique**, identifié dans son frontmatter.
Un agent à la fois sur une même feature. Validation utilisateur aux étapes critiques
(design tranché, feature codée, playtest).

**Le GDD fait autorité.** `design/gdd.md` est la source de vérité : mécaniques, boucle de
gameplay, contrôles, contraintes. Un agent qui produit contre le GDD re-produit.

---

## 3. Équipe game-dev

| Agent | Modèle | Mission | Dossier |
|---|---|---|---|
| **game-designer** | Opus | GDD, boucle de gameplay, mécaniques, systèmes, équilibrage | `design/` |
| **narrative** | Sonnet | Univers, lore, personnages, dialogues, quêtes | `narrative/` |
| **gameplay-dev** | Opus | Code le jeu (JS/Canvas), implémente les mécaniques | `game/` |
| **artiste** | Sonnet | Direction artistique, prompts d'assets, sprites placeholder | `art/` |
| **audio** | Sonnet | Sound design, briefs musique, SFX | `audio/` |
| **level-designer** | Sonnet | Niveaux, progression, courbe de difficulté | `levels/` |
| **qa** | Sonnet | Plans de playtest, scénarios de test, rapports de bug | `qa/` |

Chaque agent est défini dans `.claude/agents/*.md`.

---

## 4. Slash commands

| Commande | Action |
|---|---|
| `/gdd` | Lance le game-designer pour (re)produire le Game Design Document |
| `/feature` | Boucle complète sur une feature : design → code → playtest |
| `/code` | Lance gameplay-dev pour implémenter une mécanique/feature |
| `/niveau` | Lance level-designer pour créer/équilibrer un niveau |
| `/art` | Lance l'artiste pour une direction / un pack d'assets |
| `/audio` | Lance l'agent audio pour un brief SFX / musique |
| `/playtest` | Lance QA pour tester le jeu et remonter les bugs |

Définies dans `.claude/commands/`.

---

## 5. Arborescence

```
.
├── CLAUDE.md              ← ce contrat
├── .claude/
│   ├── agents/            ← 7 sous-agents game-dev (*.md)
│   └── commands/          ← 7 slash commands (*.md)
├── game/                  ← LE JEU (code jouable)
│   ├── index.html
│   ├── src/               ← main.js, systèmes, entités
│   └── assets/            ← sprites, sons, tilesets
├── design/               ← game-designer (gdd.md + specs mécaniques)
├── narrative/            ← narrative (lore, dialogues)
├── levels/               ← level-designer (données de niveaux)
├── art/                  ← artiste (direction, prompts d'assets)
├── audio/                ← audio (briefs SFX/musique)
└── qa/                   ← QA (plans de test, bugs)
```

Les dossiers design/narrative/levels sont la **mémoire partagée** : des fichiers markdown
versionnés que chaque agent relit avant de produire. `game/` contient le code réel.

> Note : l'équipe **marketing NAIOM** (pour promouvoir le jeu au lancement) vit dans le projet
> voisin `../roychec/` (pitch deck, posts, trailer, analytics). Les deux projets sont séparés.

---

## 6. Convention — frontmatter YAML (docs de design)

Tout livrable de design/narrative/QA commence par un frontmatter :

```yaml
---
projet: roychec
agent: game-designer     # game-designer | narrative | gameplay-dev | artiste | audio | level-designer | qa
date: 2026-07-04
version: 1
statut: brouillon        # brouillon | valide | livre
---
```

Le code dans `game/` n'a pas de frontmatter (c'est du code) mais suit les conventions du GDD.

---

## 7. Garde-fous transverses (bloquants)

1. **GDD d'abord.** Tout agent game-dev lit `design/gdd.md` avant de produire. Produire contre
   le GDD est bloquant : l'agent re-produit.
2. **Le jeu doit tourner.** Toute feature codée est vérifiée en lançant le jeu (serveur local),
   pas seulement « ça compile ». QA valide en jouant.
3. **Pas de dépendance non justifiée.** On reste en Canvas pur tant que possible (voir §1).
4. **Assets placeholder assumés.** Mieux vaut un carré coloré qui bouge qu'un blocage sur l'art.
5. **Séquentiel sur une feature.** Design → code → test. Un agent à la fois.
