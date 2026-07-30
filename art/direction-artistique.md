---
projet: roychec
agent: artiste
date: 2026-07-06
version: 2
statut: brouillon
---

# Direction artistique — roychec

> Source visuelle qui fait autorité pour tout ce qui est dessiné dans le jeu (plateau, pièces,
> HUD, panneaux, icônes). Toute production graphique qui s'en écarte doit repasser par ce
> document. Conforme au GDD (`design/gdd.md`) : rien ici ne modifie une mécanique, uniquement
> l'habillage visuel.

> **Changelog v2 (2026-07-06)** — Décision utilisateur tranchée : le jeu doit se rapprocher du
> langage visuel **Clash Royale**. Arbitrage retenu : **on ne pivote pas** vers du pseudo-3D
> saturé — le style flat outline pastel (§0-§10, inchangé) reste la fondation — mais on **pousse
> les codes visuels Clash Royale** sur les éléments qui bénéficient le plus de « punch » et de
> lisibilité économique : cartes d'amélioration, HUD (écus, bandeau de tour), boutons/panneaux, et
> un nouvel écran de victoire festif. Tout ça est spécifié en **§11**, entièrement dessinable en
> Canvas 2D procédural dans `game/src/render.js`, sans nouvel asset image requis. Les §0-§10
> restent la référence de base (palette, plateau, pièces, typo) ; **§11 ne les remplace pas, il
> les prolonge.**

## 0. Arbitrage de style (décision utilisateur, tranchée)

Deux références ont été fournies avec des langages visuels différents :
- `art/refs/mockup-ui-01.png` : UI flat, gros contours noirs, coins arrondis, palette pastel.
- `art/refs/mockup-pieces-01.png` : pièces d'échecs sculptées en bois, rendu 3D réaliste, gravures
  fines, personnages (reine couronnée, cheval cabré, bouffon à grelots, soldat napoléonien au
  bicorne, roi barbu, donjon à visage).

**Décision retenue : tout en flat outline.** On garde le langage graphique de la maquette UI
(épaisseur de trait, palette, coins arrondis, typo) pour **tout l'écran de jeu**, et on **reprend
les personnages** de la maquette pièces (qui ils sont, pas comment ils sont rendus) en les
redessinant intégralement en flat à gros contours noirs dans la palette pastel. Le rendu bois/3D
réaliste est abandonné. Pas de patchwork de styles : un seul système visuel cohérent du plateau
au dernier bouton.

> **v2** : ce principe reste entier. « Façon Clash Royale » est traité comme une **direction
> d'habillage** (cadres, pastilles, HUD, énergie visuelle) appliquée *à l'intérieur* du système
> flat outline existant — pas comme un changement de technique de rendu. Voir §11.

## 1. Style global

| Paramètre | Valeur |
|---|---|
| Technique | Illustration **flat** (aplats de couleur), pas de dégradé ni d'ombre portée réaliste |
| Contour | **Noir plein**, épaisseur constante. ~4-5% de la plus grande dimension de l'élément (ex. 3 px sur un bouton de 42 px de haut, 5-6 px sur un sprite de pièce maître à 512 px) |
| Coins arrondis | Systématiques sur tout élément d'UI et sur les cases du plateau. Rayon ≈ 12-16% de la plus petite dimension de l'élément (voir §3 pour les cases) |
| Ombres | Aucune ombre portée réaliste. Un très léger liseré interne ou un décalage plat (« shadow flat » 2-3 px, même teinte plus foncée) est acceptable sur les boutons pour suggérer un état pressé — **en v2 ce traitement devient le traitement par défaut des boutons et de certaines cartes, voir §11.4** |
| Ambiance | Appli de jeu de société moderne, amicale, lisible à distance d'écran ; ton « party game » plutôt que « simulateur d'échecs sérieux » — cohérent avec le GDD (roguelite léger, référence Clash Royale pour la lisibilité des cartes) |
| Densité de détail | Faible à moyenne : silhouette et couleur priment sur le détail interne, pour rester lisible à 64-72 px |

## 2. Palette

Palette nommée, dérivée de `mockup-ui-01.png`. Tous les hex sont définitifs sauf mention contraire.

| Nom | Rôle | Hex |
|---|---|---|
| **Brume** | Fond général de l'écran de jeu | `#EDEFF7` |
| **Prune** | Case sombre du plateau | `#8C6B84` |
| **Ivoire** | Case claire du plateau | `#FBF6F0` |
| **Sauge** | Accent de statut (badge « à vous de jouer », succès) | `#ADCBA6` |
| **Encre** | Contours et texte par défaut | `#1A1A1A` |
| **Carte** | Fond des panneaux (Améliorations / En cours / Monnaie) | `#FCF8F3` |
| **Bleu Poudré** | Accent Camp 1 (Joueur 1) | `#7FA6D9` |
| **Corail** | Accent Camp 2 (Joueur 2) | `#E08A6E` |
| **Ivoire Bois** | Teinte neutre commune des personnages (peau/matériau de base, clin d'œil aux pièces en bois de la réf) | `#F0DFC0` |
| **Alerte** | Capture / danger (anneau de coup capturable, flash) | `#D96B5A` |
| **Info Déplacement** | Catégorie de carte [D] (existant dans le code, réaccordé pastel) | `#8FB8E0` |
| **Info Actif** | Catégorie de carte [A] | `#F0B15E` |
| **Info Stat** | Catégorie de carte [S] | `#9BCB8C` |

### Palette étendue — chrome HUD/boutons (formalisée en v2)

Ces tons existent déjà dans `game/src/constants.js` (section « Tons additionnels pour l'habillage
chrome ») ; ils ont été introduits directement en code sans être couchés dans ce tableau. Le v2
les formalise ici — **aucun changement de valeur**, uniquement la mise en cohérence documentaire,
et l'ajout d'un seul ton réellement nouveau (Doré Clair, pour le burst de victoire §11.5).

| Nom | Rôle | Hex | Statut |
|---|---|---|---|
| **Encre Douce** | Texte secondaire sur fond clair (sous-titres, libellés discrets) | `#786F60` | déjà en code (`C_ENCRE_DOUX`) |
| **Encre Pâle** | Texte tertiaire / désactivé | `#A79C8C` | déjà en code (`C_ENCRE_PALE`) |
| **Liseré Carte** | Contour discret par défaut des panneaux/cartes | `rgba(26,20,15,0.10)` | déjà en code (`C_CARTE_BORD`) |
| **Ombre Douce** | Ombre portée douce (blur) sur cartes/panneaux | `rgba(60,45,30,0.16)` | déjà en code (`C_OMBRE`) |
| **Doré** | Accent premium — cadre de carte chère, écusson d'écus, couronne de victoire | `#e7bd14` | déjà en code (`C_AMBRE`) — c'est **le** doré Clash Royale de ce projet |
| **Doré Foncé** | Texte lisible posé sur un fond Doré ou Ambre clair | `#8A5A22` | déjà en code (`C_AMBRE_FONCE`) |
| **Terracotta** | Prix inabordable / alerte douce | `#B5573F` | déjà en code (`C_TERRACOTTA`) |
| **Sauge Foncé** | Validation / état « déjà acheté » | `#5E8A52` | déjà en code (`C_SAUGE_FONCE`) |
| **Doré Clair** *(nouveau v2)* | Rayons du burst de victoire, reflet/second ton du cadre doré | `#F4D58D` | **nouveau** — déjà utilisé comme teinte de bijoux/couronne dans `art/prompts-assets.md`, réemployé ici comme deuxième ton du duo doré. À ajouter dans `constants.js` sous `C_AMBRE_CLAIR` |

### Règle de contraste texte/fond
- **Encre (`#1A1A1A`) sur Brume, Ivoire, Carte ou Sauge** : contraste ≥ 4.5:1, toujours OK pour du
  texte, y compris petit (labels de carte, coût en écus, descriptions).
- **Encre sur Prune (`#8C6B84`)** : contraste ≈ 4.5:1, tout juste correct — acceptable pour un
  **contour de pièce épais** (élément décoratif large), mais **à éviter pour du texte fin posé
  directement sur une case sombre** (ex. coordonnées a-h/1-8 quand elles tombent sur Prune). Dans
  ce cas, utiliser un texte en **Ivoire** ou en **Encre avec un mini-contour clair de 1 px**
  plutôt que de l'Encre nu.
- **Encre sur Bleu Poudré / Corail** : contraste correct pour de l'encre en usage décoratif
  (contours de pièce) mais éviter d'y poser du texte pleine longueur ; si un badge doit porter du
  texte sur un accent de camp, passer le texte en blanc cassé (`#FFFDF9`) plutôt qu'en Encre.
- **Encre ou Ivoire sur Doré (`#e7bd14`)** : privilégier un texte clair (Ivoire `#FBF6F0`) avec un
  **liseré Encre de 1 px derrière** plutôt que de l'Encre nu — le Doré est assez saturé pour que
  l'Encre seule reste lisible mais perde en punch ; le duo Ivoire + liseré Encre est la version
  qui lit le mieux à petite taille (pastilles de coût, badges HUD, voir §11).

## 3. Typographie

| Usage | Police | Source | Traitement |
|---|---|---|---|
| Display / titres / HUD / badges (« VOTRE TOUR », « ROYCHEC », labels de panneaux, chiffres de timer/écus) | **Archivo Black** | Google Fonts (licence Apache 2.0, gratuite) | Toujours en **CAPITALES**, jamais d'italique |
| Corps / descriptions de cartes d'amélioration, infobulles | **Nunito Sans** (poids 600/700) | Google Fonts (licence OFL, gratuite) | Casse normale, pas de majuscules forcées, pour rester lisible sur les textes plus longs (descriptions de carte) |

**Contrainte technique (CLAUDE.md §1, pas de dépendance non justifiée) :** ne pas charger ces
polices via un lien CDN Google Fonts en prod. Télécharger les fichiers `.woff2` et les placer dans
`game/assets/fonts/` (`ArchivoBlack-Regular.woff2`, `NunitoSans-SemiBold.woff2`,
`NunitoSans-Bold.woff2`), puis les déclarer en `@font-face` locales.

> **Statut v2** : cette intégration est **faite** — `game/index.html` déclare déjà les trois
> `@font-face` locales pointant vers `game/assets/fonts/`, et `render.js` utilise `F_DISPLAY` /
> `F_TEXTE` avec fallback `system-ui`. Rien à changer ici ; §11 réutilise ces mêmes constantes de
> police, aucune nouvelle police n'est nécessaire pour l'habillage Clash Royale.

## 4. Plateau — style des cases

- Chaque case est un **carré à coins arrondis**, pas un carré plein contigu : on reproduit
  l'espacement de la maquette (petites marges de fond visibles entre les cases, effet « cases
  posées comme des tuiles »).
- Rayon de coin : **~14% de la taille de case**. Pour `CELL = 70` (valeur actuelle dans
  `game/src/constants.js`), cela donne un rayon d'environ **10 px**.
- Marge/gouttière entre cases : **~4 px** à `CELL = 70`, remplie par la couleur de fond (Brume).
  Concrètement, dessiner chaque case légèrement rétrécie (case de `CELL - 4` px) centrée dans sa
  cellule de grille de `CELL` px.
- Contour de case : trait Encre plein, **~3 px** à cette échelle.
- Deux couleurs en damier : **Ivoire** (case claire) / **Prune** (case sombre) — alternance
  classique (r+c) % 2.
- Pas de texture de bois, pas de dégradé : aplat pur partout.
- Repères a-h / 1-8 : texte Encre en Nunito Sans (ou fallback system-ui) sur fond Ivoire/Brume ;
  sur les cases Prune, utiliser un texte Ivoire (voir règle de contraste §2).

## 5. Panneaux (HUD latéral)

Panneaux concernés : « Améliorations disponibles », « En cours », « Monnaie » (voir note de
renommage ci-dessous), infobulle de pièce sélectionnée, panneau d'achat.

- Fond : **Carte** (`#FCF8F3`).
- Contour : Encre, **3-4 px**.
- Coins arrondis : rayon **~16 px** pour un panneau standard (ex. 280×260 px comme dans la
  maquette), soit ~6% de la largeur.
- Titre de panneau : Archivo Black, Encre, en capitales, aligné en haut à gauche à l'intérieur du
  panneau, avec un petit padding (~16 px).
- Corps (liste de cartes, description) : Nunito Sans, Encre.
- Cartes d'amélioration à l'intérieur du panneau d'achat : même logique flat — fond Carte ou
  Ivoire légèrement distinct du fond de panneau, contour Encre 2 px, coins arrondis ~8 px, un
  **liseré de catégorie** sur le bord gauche (Info Déplacement / Info Actif / Info Stat, voir §2)
  — c'est la continuité directe du code déjà en place (`COULEUR_CAT` dans `constants.js`), juste
  reteinté en version pastel.

> **v2** : cette carte de base ne change pas de géométrie fondamentale, mais elle reçoit un
> habillage Clash Royale complet (pastille de coût, cadre doré pour les cartes chères, badge
> « achetée », état grisé plus lisible) — voir **§11.2**, qui prime sur ce paragraphe pour tout ce
> qui concerne l'apparence détaillée des cartes du panneau d'achat.

### Note de renommage à valider
La maquette affiche un panneau **« MONNAIE »**. Le GDD nomme systématiquement la ressource
**« écus »** (§5.2, §5.6, §7). Je recommande de renommer ce panneau **« ÉCUS »** pour rester
cohérent avec le vocabulaire du jeu (le contenu du panneau — le solde du joueur — reste identique).
**Changement mineur, réversible, à valider par l'utilisateur** — sinon on garde « MONNAIE » comme
simple titre générique et « écus » reste seulement l'unité affichée à l'intérieur.

## 6. HUD — badge de statut et timer

- **Badge de tour** (« VOTRE TOUR » / « AU TOUR DE JOUEUR 2 ») : pilule (coins entièrement
  arrondis, rayon = moitié de la hauteur), fond **Sauge**, contour Encre 3 px, texte Archivo
  Black Encre en capitales. C'est l'usage principal de l'accent Sauge — ne pas la réutiliser comme
  couleur de camp (voir §7) pour éviter toute confusion entre « statut de tour » et « identité de
  joueur ».
  > **v2** : ce bandeau reçoit un traitement plus affirmé (opacité, contour, icône directionnelle)
  > — voir **§11.3.c**, qui prime sur ce point précis (couleur Sauge de fond conservée uniquement
  > pour le badge de statut générique ; le bandeau de tour utilise l'accent de camp, voir le code
  > actuel et §11.3.c).
- **Timer (« 00:30 »)** : la maquette montre un timer, mais le GDD est explicite — **le MVP se
  joue sans horloge** (GDD §7 « Timers de partie », §9 hors scope). Je conserve l'**emplacement**
  du timer dans le layout (pilule fond Carte, contour Encre, chiffres Archivo Black) pour ne pas
  casser la mise en page prévue quand l'horloge sera câblée plus tard, mais il doit être marqué
  **« prévu, non câblé au MVP »** : soit masqué, soit affiché en état neutre/désactivé (ex. `--:--`
  ou pilule grisée sans compte à rebours actif). Ne pas afficher un faux décompte qui tourne sans
  effet de jeu — ce serait trompeur.
- **Compteur d'écus** : à l'intérieur du panneau Écus/Monnaie, gros chiffre Archivo Black Encre,
  précédé d'une petite icône de pièce (voir prompts §8) ou, en fallback sans sprite, d'un simple
  disque Sauge ou doré.
  > **v2** : ce compteur passe dans un écusson doré dédié, voir **§11.3.a**.

## 7. Distinguer les deux camps (Joueur 1 / Joueur 2)

Contrainte : rester en flat, contour Encre commun aux deux camps (le contour ne doit **jamais**
coder l'identité de joueur — sinon on perd la cohérence du style flat qui veut un contour noir
uniforme partout).

**Solution retenue — double signal, un seul système de couleur :**

1. **Signal primaire — socle/anneau de base de la pièce.** Chaque pièce illustrée repose sur un
   petit **socle circulaire** (clin d'œil au piètement des pièces en bois de la référence). Ce
   socle est peint dans la couleur d'accent du camp :
   - Camp 1 (Joueur 1) → **Bleu Poudré** `#7FA6D9`.
   - Camp 2 (Joueur 2) → **Corail** `#E08A6E`.
   C'est le signal le plus lisible même à très petite taille (une case de plateau à 64 px) car
   c'est une zone pleine, pas un détail fin.
2. **Signal secondaire — un élément de costume retint dans la même couleur d'accent** (ex. le
   liseré de la robe de la Dame, le tissu de selle du Cavalier, les pompons du Fou, les revers du
   Pion, la doublure de cape du Roi, la bannière de la Tour). Le reste du personnage (visage,
   matériau principal) reste dans la teinte neutre **Ivoire Bois** `#F0DFC0` pour les deux camps :
   c'est le même personnage des deux côtés de l'échiquier, seule sa « couleur d'équipe » change —
   exactement comme un maillot sportif.
3. Le **contour reste Encre pour les deux camps**, sans exception.

Cette solution réutilise directement la mécanique déjà codée : `ACCENT[owner]` dans
`game/src/constants.js` sert déjà de couleur de camp pour le contour de pièce et le point HUD.
Il suffit de changer les deux valeurs du tableau `ACCENT` (voir §9 fallback) — même levier, juste
une teinte pastel au lieu du bleu/rouge saturé actuel, et on lui donne un second rôle (socle/liseré
d'illustration) une fois les sprites finaux en place.

> **Décision à valider par l'utilisateur** : j'ai choisi Bleu Poudré / Corail (au lieu du
> bleu/rouge saturé actuel) parce que ça reste dans la même famille de sens (froid vs chaud,
> même lecture immédiate « camp A / camp B ») tout en restant pastel et cohérent avec la palette
> Brume/Prune/Sauge. Si un autre couple de teintes est préféré, seul le tableau `ACCENT` change —
> aucun impact sur le reste de la DA.

## 8. Résolution cible & export des sprites

- Taille de case en jeu : **64-72 px** (le code actuel utilise `CELL = 70`).
- Les pièces illustrées doivent tenir dans un cercle/silhouette d'environ **56-64 px de diamètre**
  à cette échelle (marge de 3-7 px de chaque côté dans la case, cohérent avec la gouttière du
  plateau §4), casque/couronne/chapeau pouvant légèrement déborder du socle sans jamais toucher le
  bord de case.
- **Fichiers maîtres** : produire chaque personnage sur un canvas carré **1024×1024 px**, fond
  **transparent**, vue de face, contour Encre net (pas anti-aliasé mou), aplats propres.
- **Export jeu** : downscale du maître vers :
  - `@1x` = 128×128 px (fichier de référence intermédiaire)
  - `@2x` (retina, celui à livrer dans `game/assets/`) = 256×256 px, affiché ensuite à ~64-72 px
    en CSS/canvas pour un rendu net sur écrans HiDPI.
- Format : **PNG-24 avec canal alpha**. Pas de JPEG (pas de transparence, artefacts sur les aplats).
- Nommage suggéré : `game/assets/pieces/{camp}-{type}.png`, ex. `bleu-dame.png`,
  `corail-cavalier.png`, `bleu-tour.png`, etc. (12 fichiers : 6 pièces × 2 camps).
- Icônes (pièce de monnaie écu, pouvoirs actifs) : même règle, maître 512×512, export @2x en
  96×96 ou 128×128 selon l'emplacement.

Voir `art/pieces-spec.md` pour le détail par pièce et `art/prompts-assets.md` pour les prompts de
génération prêts à l'emploi.

## 9. Fallback placeholder — applicable IMMÉDIATEMENT, sans aucun sprite

Objectif : gameplay-dev peut réhabiller le rendu Canvas 2D existant (`game/src/render.js`,
`game/src/constants.js`) dans la palette pastel **avant** que les sprites finaux existent, en ne
touchant que des couleurs/valeurs, pas de logique. Rien ci-dessous ne nécessite d'asset image.

> **Statut v2** : ce fallback est **implémenté** — les constantes ci-dessous sont déjà les valeurs
> réelles dans `game/src/constants.js` (vérifié à la relecture v2). Le tableau reste ici comme
> référence historique du mapping ancien → nouveau ; §11 ajoute des constantes, il n'en modifie
> aucune de celles listées ici.

### Constantes à modifier dans `game/src/constants.js`

| Constante actuelle | Rôle | Nouvelle valeur pastel |
|---|---|---|
| `C_CLAIR = '#EBECD0'` | Case claire | `'#FBF6F0'` (Ivoire) |
| `C_FONCE = '#779556'` | Case sombre | `'#8C6B84'` (Prune) |
| `ACCENT = ['#3b82f6', '#ef4444']` | Accent par camp (contour pièce, HUD, bandeau de tour) | `['#7FA6D9', '#E08A6E']` (Bleu Poudré / Corail) |
| `C_SEL = 'rgba(246, 216, 84, 0.55)'` | Case sélectionnée | `'rgba(173, 203, 166, 0.55)'` (Sauge translucide) |
| `C_MOVE = 'rgba(30, 40, 60, 0.30)'` | Point de coup légal | `'rgba(26, 26, 26, 0.28)'` (Encre translucide) |
| `C_CAP = 'rgba(220, 40, 40, 0.55)'` | Anneau de coup capturable | `'rgba(217, 107, 90, 0.65)'` (Alerte) |
| `C_RUEE = 'rgba(245, 158, 11, 0.9)'` | Ciblage Ruée | `'rgba(240, 177, 94, 0.9)'` (Info Actif) |
| `COULEUR_CAT = { D: '#3b82f6', A: '#f59e0b', S: '#22c55e' }` | Catégories de carte | `{ D: '#8FB8E0', A: '#F0B15E', S: '#9BCB8C' }` (Info Déplacement/Actif/Stat) |

### Fond de canvas et texte (dans `render.js`)

- Le fond plein écran (`ctx.fillStyle = '#0e1116'`) passe en **Brume** `#EDEFF7`.
- Tous les fonds de panneaux/boutons sombres (`#141a22`, `#1b2530`, `#20262f`, `#2b3444`, etc.)
  passent en **Carte** `#FCF8F3`, avec un contour Encre 2-3 px (au lieu du contour gris-bleu
  actuel `#48566b`/`#2a3038`).
- Tout le texte clair actuel (`#e8edf4`, `#dfe6ef`, `#c8d2e0`, `#9aa6b6`) passe en **Encre**
  `#1A1A1A` (le fond devient clair, donc le texte doit redevenir sombre).
- Les rayons d'arrondi (`roundRect(ctx, ..., 6)` ou `7`) peuvent monter à **10-14** pour se
  rapprocher du rendu « coins bien arrondis » de la maquette — changement cosmétique, sans risque.
- Les pièces restent des **cercles avec une lettre** (`LETTRE` déjà FR : P/C/F/T/D/R) — pas de
  changement de forme requise pour le fallback. Seul le remplissage change :
  - Remplissage du cercle : au lieu de `p.owner === 0 ? '#f3f5f8' : '#2a2e39'` (blanc/noir selon
    camp), utiliser une teinte pastel **par camp** directement dérivée de l'accent : Camp 1 →
    `'#D9E6F2'`, Camp 2 → `'#F5E0D6'` (versions très éclaircies de Bleu Poudré/Corail).
  - Contour du cercle : **toujours Encre** `#1A1A1A`, 3 px (au lieu de `ACCENT[p.owner]`) — c'est
    le changement qui aligne le placeholder sur la règle « contour noir commun aux deux camps »
    du §7. L'identité de camp reste lisible via le remplissage pastel, pas via le contour.
  - Lettre : toujours en **Encre**, gras, centrée (au lieu de blanc/clair selon camp).
  - Badges d'amélioration (petits carrés sous la pièce) : déjà positionnés correctement dans le
    code (`y + rayon - 4`), garder cette ancre, juste reteindre avec `COULEUR_CAT` mis à jour
    ci-dessus.
- Le halo doré d'achat (`rgba(246,204,84,...)`) et l'anneau cyan de blindage (`#38e0d8`) peuvent
  rester tels quels pour le fallback (ce sont des effets ponctuels, pas des couleurs de camp/plateau
  ni de texte) — retouche pastel optionnelle, non prioritaire.

Ce tableau suffit à donner au MVP une identité pastel/flat cohérente en quelques minutes de
remplacement de constantes, sans bloquer sur la production des sprites illustrés (§8-§10 et les
fichiers `art/pieces-spec.md` / `art/prompts-assets.md` viennent ensuite, en parallèle, sans
urgence de blocage).

## 10. Ce qui attend les sprites finaux (non bloquant)

- Remplacement des cercles-lettres par les 12 illustrations (6 pièces × 2 camps) une fois
  générées et validées — voir `art/pieces-spec.md` et `art/prompts-assets.md`.
  > **v2** : fait en partie — le code charge déjà les sprites `game/assets/pieces/{camp}-{type}.png`
  > avec fallback jeton flat quand un fichier manque (`render.js`, fonctions `chargerSprites` /
  > `spritePret`). Rien à changer ici pour le v2.
- Icône de pièce d'écu dans le panneau Écus/Monnaie (actuellement texte seul « N écus »).
  > **v2** : couvert par l'écusson doré procédural du §11.3.a — plus besoin d'attendre un sprite
  > d'icône pour avoir un compteur d'écus visuellement fort.
- Icônes de pouvoir actif (Ruée, Garde royale, Double coup, etc.) au lieu de simples boutons
  textuels — amélioration visuelle, pas un blocage : les boutons actuels avec libellé texte
  restent fonctionnels et lisibles en attendant.
- Intégration effective des polices Archivo Black / Nunito Sans en local (fichiers `.woff2`),
  aujourd'hui fallback `system-ui`.
  > **v2** : fait — voir note de statut en §3.

---

## 11. Habillage Clash Royale (v2 — 2026-07-06)

### 11.0 Cadrage

Décision utilisateur : garder le flat outline pastel (§0-§10), et **pousser les codes visuels
Clash Royale** sur quatre zones précises : cartes d'amélioration, HUD, boutons/panneaux, écran de
victoire. Principes transverses qui s'appliquent à toute cette section :

- **Aucun dégradé.** Clash Royale utilise des dégradés et de la lumière directionnelle ; on garde
  la règle flat du §1 (« pas de dégradé »). L'énergie visuelle vient de : cadres doublés, formes
  qui débordent des conteneurs (badges qui chevauchent un bord), ombres plates dures (pas de
  blur), et de la taille/l'épaisseur des éléments — pas de la lumière.
- **Grammaire visuelle commune : « l'élément important déborde du conteneur ».** Que ce soit la
  pastille de coût d'une carte ou la couronne de l'écran de victoire, l'élément le plus important
  chevauche le bord supérieur de son conteneur plutôt que d'être posé dedans à plat. C'est le
  réflexe Clash Royale le plus reconnaissable et le plus facile à reproduire en Canvas 2D (un
  cercle centré sur `y` du bord suffit).
- **Rien ici ne modifie une mécanique du GDD** : coûts, catégories, cooldowns, timings de feedback
  (150/200/600/300 ms, §7 GDD) restent strictement ceux du GDD. Cette section ne spécifie que
  l'apparence.
- **v3.2 — le « tout procédural » est amendé.** L'effet feu sur la pièce (§11.7, GDD §5.3.b)
  est désormais une **vidéo mp4** (`game/assets/pieces/265194.mp4`, ~5 Mo, H.264+AAC),
  pivot utilisateur 2026-07-11. Le reste du §11 reste procédural Canvas 2D : cartes, HUD,
  boutons, écran de victoire — aucune autre section n'introduit d'asset image. Un seul ajout
  de constante reste recommandé :
  recommandé (`C_AMBRE_CLAIR = '#F4D58D'`, voir §2) ; tout le reste se dessine avec les primitives
  déjà utilisées dans `render.js` (`roundRect`, `carte`, `bouton`, arcs, triangles).

Repères de layout actuels (pour cadrer les dimensions ci-dessous, tirés de `constants.js`) :
`CANVAS_W = 980`, `CANVAS_H = 640`, `CELL = 70`, `BOARD = 560`, `PANEL_X = 610`, largeur utile du
panneau `w = CANVAS_W - PANEL_X - 16 = 354`, hauteur de carte de catalogue actuelle `h = 62`.

---

### 11.1 Cartes d'amélioration — cadre, pastille de coût, états

Base inchangée : carte `w × 62` (largeur panneau, hauteur existante), coins arrondis `r = 8`,
liseré de catégorie sur le bord gauche (`COULEUR_CAT[cat]`, déjà en place). Le v2 ajoute une
**pastille de coût qui chevauche le bord supérieur**, un **cadre doré pour les cartes chères**, et
des états « achetée » / « grisée » plus francs.

**Ordre de priorité visuel (une carte n'affiche qu'un seul de ces états à la fois, dans cet
ordre) :**

1. **Bientôt disponible** (`u.nonImplemente`) — inchangé, fond `#F3EFE7`, texte « bientôt » en
   Encre Pâle. Pas de traitement premium ici : une carte pas encore jouable ne doit pas donner
   envie, elle doit juste être neutre.
2. **Achetée** (badge médaille, prime sur le cadre doré même si le coût était ≥12).
3. **Cadre doré de tier** (coût ≥ 12), affiché que la carte soit abordable ou non — c'est un
   signal de **rareté**, pas d'affordabilité (comme les cadres légendaires de Clash Royale, qui
   restent dorés même quand on n'a pas assez d'élixir).
4. **Standard** (coût < 12), abordable ou grisée selon le solde.

#### a. Cadre — carte standard (coût < 12)
- Fond : `#FFFFFF` (abordable) ou `#F3EFE7` (grisée, solde insuffisant) — **inchangé du code
  actuel**.
- Contour : Liseré Carte `rgba(26,20,15,0.10)`, **1 px** — inchangé.
- Liseré de catégorie (bord gauche) : passe de **5 px à 8 px** de large, rayon 4, sur toute la
  hauteur — épaissi pour mieux lire à distance, c'est le seul changement de la carte standard.

#### b. Cadre — carte chère, tier premium (coût ≥ 12 : Téléportation courte, Double coup,
   Sacrifice, Décret)
- Contour externe : **Doré `#e7bd14`, 3 px**, tracé sur le chemin de la carte (`roundRect`,
  `r = 8`) à la place du liseré Carte 1 px.
- Contour interne (optionnel mais recommandé) : un second trait **Encre 1 px**, tracé sur un
  `roundRect` identique mais inset de 2 px (`r = 6-7`) — donne l'effet « double liseré » des
  cartes de rareté élevée en CR, en deux appels de `stroke()` supplémentaires seulement.
- Fond : `#FFFFFF` si abordable, `#EAE3D2` (grisé chaud, plus doré que le gris neutre des cartes
  standard grisées) si le solde est insuffisant — la teinte grisée reste légèrement chaude pour ne
  pas contredire visuellement le cadre doré.
- Liseré de catégorie (bord gauche) : identique à la carte standard (8 px, couleur `COULEUR_CAT`)
  — le doré signale le **tier**, la couleur de catégorie continue de signaler le **type d'effet**
  (D/A/S), les deux informations coexistent sans se substituer l'une à l'autre.
- Optionnel, non bloquant : un petit **éclat à 4 branches** (deux rectangles fins superposés en
  croix, ~8×8 px, fond Doré, contour Encre 1 px) dans le coin supérieur gauche de la carte, du
  côté opposé à la pastille de coût — pur flourish, à ne faire que si le temps le permet.

#### c. Pastille de coût (façon coût d'élixir CR)
- Position : cercle centré en `x = carte.x + w - 20`, `y = carte.y` (c'est-à-dire **centré sur le
  bord supérieur de la carte** — la moitié du cercle dépasse au-dessus de la carte, la moitié est
  à l'intérieur). C'est l'application directe de la grammaire « déborde du conteneur » du §11.0.
- Dimensions : cercle plein, **rayon 15 px** (30 px de diamètre) — assez grand pour 1 ou 2
  chiffres en Archivo Black 13-14 px.
- Remplissage :
  - Carte standard (coût < 12) : couleur de catégorie (`COULEUR_CAT[cat]`), comme le liseré.
  - Carte premium (coût ≥ 12) : **Doré `#e7bd14`** — la pastille devient dorée en plus du cadre,
    double signal de rareté cohérent avec la carte.
- Contour : Encre, **2 px**.
- Texte : le coût en chiffres, Archivo Black, **13-14 px**, couleur **Ivoire `#FBF6F0`** avec un
  fin liseré Encre 1 px derrière (dessiner le texte deux fois : `strokeText` Encre puis
  `fillText` Ivoire) — lisible sur les quatre remplissages possibles (bleu/orange/vert/doré) sans
  réglage au cas par cas, cf. règle de contraste §2.
- Variante optionnelle « goutte » (non bloquante) : ajouter un petit triangle plein (10×8 px, même
  remplissage, sans contour propre) accolé sous le cercle avant de tracer le contour Encre du
  cercle, pour se rapprocher de la silhouette de goutte d'élixir. Le cercle seul est suffisant et
  plus rapide à produire ; ne pas bloquer dessus.

#### d. État « achetée »
- Fond de carte : Sauge clair `#EAF1E6` — inchangé.
- Contour externe : **Sauge Foncé `#5E8A52`, 2 px** (remplace le doré ou le liseré Carte selon le
  tier de la carte — l'état « achetée » prime toujours, voir ordre de priorité en tête de §11.1).
- Liseré de catégorie (bord gauche) : passe lui aussi en **Sauge Foncé `#5E8A52`** — une carte
  achetée n'a plus besoin d'afficher sa catégorie en avant-plan (l'info reste dans la description),
  le signal dominant devient « c'est acquis ».
- Pastille : remplace la pastille de coût par un **badge médaille** à la même position (chevauche
  le bord supérieur, même cercle 30 px) : fond **Sauge `#ADCBA6`**, contour Encre 2 px, glyphe
  `✓` centré (le glyphe Unicode déjà utilisé dans le code aujourd'hui — `'achetée ✓'` — suffit,
  pas besoin de tracer un chemin de coche procédural, sauf si un designer veut pousser plus loin
  plus tard).

#### e. État grisé (solde insuffisant), carte standard
- Fond : `#F3EFE7` — inchangé.
- Texte (nom, description) : Encre Pâle `#A79C8C` — inchangé.
- Coût : reste affiché en Terracotta `#B5573F` dans la pastille (remplissage catégorie inchangé,
  seul le texte du chiffre passe en Terracotta au lieu d'Ivoire, pour signaler « pas assez
  d'écus ») avec le même liseré Encre 1 px derrière pour la lisibilité.
- Optionnel, non bloquant : remplacer le chiffre par un petit cadenas plat (corps = rectangle
  arrondi 8×6 px, anse = arc 1.5 px) dans la pastille — sympathique mais dispensable, GDD ne
  demande qu'une carte « grisée, achat refusé » lisible, ce qui est déjà couvert sans le cadenas.

#### f. Note d'implémentation Canvas
Tout ce qui précède se résume à des appels supplémentaires autour de la fonction `carte()` et de
la boucle de `dessineCatalogue()` déjà existantes dans `render.js` : un `if (u.cout >= 12)` pour
choisir le contour (doré vs liseré standard), un bloc de dessin de cercle + texte pour la pastille
(positionné une fois `y` du haut de carte connu), et une bascule de fill/stroke pour l'état
« achetée » qui existe déjà partiellement dans le code (`deja ? '#EAF1E6' : ...`). Aucune nouvelle
dépendance, aucun nouvel asset.

---

### 11.2 (réservé)
*(numérotation continue en 11.3 pour rester alignée avec l'ordre du brief : cartes → HUD →
boutons/panneaux → écran de victoire ; voir 11.1 ci-dessus pour les cartes.)*

### 11.3 HUD

#### a. Compteur d'écus — écusson doré
Contexte : dans chaque ligne joueur du HUD (`w × 42`, déjà en place dans `dessinePanneau`), le
nom et le solde sont actuellement du texte simple. Le v2 ajoute un écusson dédié à droite de la
ligne, sans toucher au point d'accent de camp existant à gauche (`ACCENT[j]`, cercle 9 px).

- Forme : pilule (rectangle entièrement arrondi, rayon = moitié de la hauteur).
- Dimensions : **60 × 24 px**, ancrée à `x = ligne.x + w - 66`, `y = ligne.y + 9` (centrée
  verticalement dans la ligne de 42 px).
- Fond :
  - Ligne du joueur **actif** : **Doré `#e7bd14`**.
  - Ligne du joueur **inactif** : Doré désaturé — `#E7DFC7` (mélange Doré/Carte, ton neutre) pour
    que l'écusson du joueur actif reste le point d'attention dominant, cohérent avec l'esprit
    « c'est votre tour, votre économie compte maintenant ».
- Contour : Encre, **2 px**.
- Icône pièce (à l'intérieur, extrémité gauche de la pilule) : disque plein **14 px** de diamètre,
  fond Ivoire `#FBF6F0`, anneau Encre 1.5 px — représentation minimale d'une pièce de monnaie,
  aucun sprite requis.
- Texte : solde en chiffres, Archivo Black, **13 px**, Encre, aligné à droite avec **8 px** de
  marge intérieure droite.
- Le point d'accent de camp existant (cercle `ACCENT[j]`, 9 px, à gauche) et le libellé du nom de
  joueur ne changent pas de position — seul le solde texte actuel (`ecusLabel`) est remplacé par
  cet écusson en fin de ligne.

#### b. « +N » écus — popup plus punchy
Timing GDD inchangé (**600 ms de montée + fondu**, GDD §7 — ne pas retoucher cette valeur). Ce qui
change est purement la manière dont le texte est dessiné pendant ces 600 ms :

- **Trait de contour** : dessiner le texte deux fois par frame — `strokeText` Encre **2 px**
  d'abord, puis `fillText` par-dessus dans la couleur du popup (remplace l'actuel halo blanc en
  `shadowBlur`, qui devient inutile une fois le contour Encre en place). Le contour assure la
  lisibilité sur n'importe quel fond, y compris une case Prune ou une pièce claire.
- **Overshoot d'échelle** : dans les premiers **15% de la durée** (~90 ms), l'échelle du texte part
  de **1.3×** et retombe à **1.0×** (un `k` local allant de 0 à 1 sur cette fenêtre, appliqué via
  `ctx.scale` centré sur le point d'ancrage du popup) ; le reste de l'animation (montée + fondu)
  ne change pas. C'est le « pop » caractéristique de Clash Royale sur les gains de ressource.
- **Taille selon le montant** : au lieu d'une taille fixe 20 px pour tous les gains, faire varier
  la taille de police selon la valeur du gain — **20 px** pour un revenu de coup simple (+2, la
  valeur GDD la plus fréquente), **26 px** pour un bonus de capture (+3 à +9 selon la pièce prise,
  GDD §7). Un gain plus gros se voit plus gros, sans changer aucun chiffre du GDD.
- **Couleur** : conserver `pop.color` tel que défini par l'appelant (le code choisit déjà une
  couleur par contexte) ; si un seul ton doit être choisi pour uniformiser, utiliser **Doré
  `#e7bd14`** pour tous les gains d'écus (coup simple et capture), qui est maintenant le ton
  d'identité de l'économie du jeu (cf. écusson §11.3.a).

#### c. Bandeau « à vous de jouer » — plus affirmé
Le bandeau de tour existant (pilule `BOARD × 26` en haut du plateau, remplie à ~15% d'opacité de
`ACCENT[turn]`, sans contour) devient :

- Fond : opacité relevée de ~15% à **~55%** (`ACCENT[turn] + '8C'` en notation hex-alpha) — reste
  un aplat de couleur de camp, mais beaucoup plus présent, plus « carte flat » que « surlignage ».
- Contour : ajout d'un trait **Encre 2 px** autour de la pilule (actuellement `stroke: null`).
- Onglet latéral gauche (déjà présent) : passe de **5 px à 8 px** de large, même hauteur, même
  couleur pleine `ACCENT[turn]`.
- Icône : un petit chevron plein pointant vers la droite (triangle, **10×10 px**, Encre), placé
  juste avant le texte, pour renforcer le sentiment « à vous d'agir ».
- Typographie : taille du libellé relevée de **12 px à 14 px**, toujours Archivo Black Encre en
  capitales.
- Ombre plate : une copie de la pilule, décalée de **+2 px en y**, remplie d'un ton assombri
  (Encre à 12% d'opacité, `rgba(26,26,26,0.12)`), dessinée **avant** la pilule principale — cf.
  traitement générique du §11.4, appliqué ici pour donner de l'épaisseur au bandeau sans rien
  changer à son texte ni à son rôle fonctionnel (statuts de ciblage Ruée/Rayon/Décret restent
  affichés tels quels, seule l'enveloppe visuelle change).

---

### 11.4 Boutons et panneaux

#### a. Bouton standard — shadow flat
S'applique à tous les boutons dessinés via la fonction `bouton()` existante (Améliorer, pouvoirs
actifs, Terminer le tour, Nouvelle partie, fermeture de panneau ×, etc.).

- **Contour** : Encre, **2.5 px**, tracé sur le `roundRect` du bouton (remplace le contour discret
  1 px hérité de `carte()` — les boutons doivent avoir un contour plus marqué que les panneaux
  passifs, c'est ce qui les fait lire comme « cliquables »).
- **Ombre plate (état repos, bouton actif/`enabled`)** : dessiner, **avant** le bouton, un
  `roundRect` identique décalé de **+4 px en y** (même x, même w/h, même rayon), rempli d'un ton
  assombri de la couleur du bouton, sans flou (`shadowBlur = 0`) :
  - Bouton `C_CARTE` (`#FCF8F3`) → ombre `#DCD5C7`.
  - Bouton `C_AMBRE` (`#e7bd14`, boutons de pouvoir actif / CTA) → ombre `#B99510`.
  - Règle générale si d'autres couleurs de bouton apparaissent : assombrir chaque canal RGB
    d'environ 15-20%.
- **État désactivé (`enabled = false`)** : pas d'ombre (déjà le cas dans le code, `shadow:
  enabled`) — un bouton grisé doit paraître plat et inerte, cohérent avec l'absence de shadow
  flat qui signale justement « non actionnable ».
- **État pressé** (nouveau, optionnel — à ne coder que si le temps le permet, ne bloque aucune
  mécanique) : au moment du clic, pendant **~100 ms**, dessiner le bouton **sans son ombre** et
  **translaté de +4 px en y** (il « s'enfonce » jusqu'à la position de son ombre, qui disparaît).
  Implémentation suggérée : un état éphémère `state.ui.pressed = { x, y, w, h, t0 }` posé au
  clic, lu par `bouton()` pour cette fenêtre de 100 ms — timing purement suggéré par l'artiste
  (pas une valeur GDD), ajustable librement par gameplay-dev.
- **Titre** : Archivo Black, capitales — déjà le cas dans le code (`label.toUpperCase()`), aucun
  changement requis.

#### b. Panneaux (têtes de panneau)
- Le corps des panneaux (fond Carte, liseré 1 px, ombre douce floutée) ne change pas — il reste
  le traitement "passif" qui contraste avec les boutons "actionnables" du point a.
- Optionnel, non bloquant : sous le titre de panneau (Archivo Black, capitales), ajouter un filet
  **Doré 2 px** de la largeur du titre (pas de toute la largeur du panneau) pour un petit accent
  "premium" cohérent avec le reste de l'habillage — purement décoratif, à ne faire qu'une fois
  les points a/§11.1/§11.3 en place.

---

### 11.5 Écran de victoire festif

Remplace/étend `dessineGameOver()`. Reste dans l'esprit flat pastel (aucun dégradé), mais avec
l'énergie Clash Royale : burst de rayons plats, couronne, cadre doré, CTA proéminent.

- **Voile de fond** : inchangé, `rgba(36,28,22,0.72)` sur la zone du plateau.
- **Burst de rayons plats** (nouveau, derrière le panneau) : un éventail de **16 quartiers**
  triangulaires alternant **Doré `#e7bd14`** et **Doré Clair `#F4D58D`**, partant du centre du
  plateau (`cx, cy`), rayon **~250 px** (un peu moins que la demi-diagonale du plateau, pour
  rester dans la zone voilée). Aplats purs, pas de dégradé radial — chaque quartier est un
  triangle plein d'une des deux couleurs, dessiné avec une légère opacité (~35-40%) pour rester
  discret derrière le panneau plutôt que criard.
- **Panneau** : passe de `340×190` à **`380×230`**, toujours centré sur `(cx, cy)`, rayon **14**,
  fond Carte. Contour : **Doré `#e7bd14`, 3 px** (au lieu du `stroke: null` actuel) — c'est le
  même traitement « cadre premium » que les cartes chères du §11.1.b, réutilisé ici pour l'unique
  écran qui mérite ce traitement en dehors du panneau d'achat.
- **Couronne** : forme plate procédurale positionnée **centrée sur le bord supérieur du panneau**
  (moitié dépasse au-dessus), même grammaire que la pastille de coût (§11.0). Dimensions : **~52 px
  de large, ~34 px de haut**. Construction simple : un socle (rectangle arrondi bas, 52×14 px) +
  3 pointes triangulaires (la centrale plus haute que les deux latérales) + un petit disque
  (« joyau », 6 px) au sommet de chaque pointe. Remplissage **Doré `#e7bd14`**, contour Encre 2 px.
- **Nom du vainqueur** : `ACCENT[state.winner]`, Archivo Black, taille relevée de **28 px à 32
  px**, avec un liseré Encre 1.5 px derrière le texte (même technique `strokeText` puis
  `fillText` que la pastille de coût et le popup d'écus, §11.1.c / §11.3.b) — cohérence
  typographique de tout l'habillage v2 : tout texte Archivo Black posé sur un aplat coloré reçoit
  ce liseré Encre.
- **Sous-texte** (« Roi capturé ») : inchangé, Nunito Sans, Encre Douce.
- **Bouton « Nouvelle partie »** : passe de `180×44` à **`200×48`**, reçoit le traitement shadow
  flat du §11.4.a (ombre `#B99510` sous un bouton Doré), reste le seul CTA de l'écran.
- **Confettis statiques** (optionnel, non bloquant, pur flourish) : 12-16 petits flats (carrés
  6-10 px ou triangles), couleurs piochées dans Doré / Sauge / Bleu Poudré / Corail, dispersés à
  positions et rotations fixes autour du panneau (pas d'animation requise — un motif statique
  suffit à l'ambiance festive). À ne faire qu'en dernier, une fois tout le reste en place ; aucune
  dépendance sur un système d'animation supplémentaire si les positions sont pré-calculées une
  fois par affichage de l'écran de victoire.

---

### 11.6 Récapitulatif des constantes à ajouter dans `constants.js`

Seul ajout réellement nécessaire pour coder tout le §11 (tout le reste réutilise des constantes
déjà présentes : `C_AMBRE`, `C_AMBRE_FONCE`, `C_TERRACOTTA`, `C_SAUGE_FONCE`, `C_ENCRE_PALE`,
`COULEUR_CAT`, `ACCENT`, `F_DISPLAY`, `F_TEXTE`) :

```js
// Doré Clair — deuxième ton du duo doré (burst de victoire, §11.5). Nouveau en v2.
export const C_AMBRE_CLAIR = '#F4D58D';
```

Aucune autre constante n'a besoin de changer de valeur. Les ombres plates des boutons (§11.4.a)
peuvent être codées en dur dans `render.js` (`#DCD5C7`, `#B99510`) ou promues en constantes
nommées si gameplay-dev préfère centraliser — les deux options sont acceptables,ce n'est pas une décision d'art bloquante.

### 11.7 Effet feu vidéo sur la pièce (v3.2 — 2026-07-11, pivot depuis procédural v3)

Refonte du feedback d'amélioration (GDD §5.3.b) : le **pivot v3.2** remplace le rendu procédural
Canvas 2D (quilles colorées du commit `9f48b832`) par une **vidéo mp4** fournie par l'utilisateur
(`game/assets/pieces/265194.mp4`, mp4 1920×1080, ~10 s, ~60 fps, H.264 + AAC strippé). **Position**
imposée par le user : la vidéo est rendue **DERRIÈRE** la pièce (et non plus au-dessus), via
la flamme tracée **avant** `ctx.drawImage(sprite)` dans `dessinePiece()`.
**Raffinement v3.3 (11/07, retour utilisateur)** : le tint `saturate(0)` + `screen` de la v3.2
produisait un **disque plein** de couleur cat (le fond noir de la vidéo passé en screen = aplat) ;
la v3.3 convertit la **luminance de la frame en alpha** — seule la **silhouette de flamme**
est dessinée, teintée `COULEUR_CAT[cat]`, le plateau visible autour (détail en c.).
Code : `game/src/render.js`, helpers `optionsFeuPour` + `dessineFeu` + pipeline `feuInitMask` /
`feuMajMask` / `feuTinte` (vidéo capturée par `const videoFeu = document.getElementById('video-feu')`).

#### a. Source et forme du rendu
- **Source** : `game/assets/pieces/265194.mp4` — vidéo mp4 pré-rendue. Le navigateur la décode
  en GPU, le rendu canvas la pioche via `drawImage(videoElement)` à 60 fps.
- **Forme à l'écran** (v3.3) : **silhouette de flamme** dans une texture 80×80 px (rayon 40)
  centrée sur la pièce, fond transparent. Une **vignette radiale** (pleine opacité jusqu'à 60 %
  du rayon, smoothstep vers 0 au bord) fond la flamme au lieu de la couper net — la gouttière
  entre tuiles est respectée sans clip circulaire. Le sprite de la pièce (environ 26-30 px)
  reste NET au premier plan, la flamme ondule derrière.
- **Aucune quille procédurale** — la version v3 (quilles `quadraticCurveTo` colorées au-dessus
  du sprite) est annulée. La motion, la silhouette et le « wow » de la flamme viennent
  exclusivement de la vidéo.

#### b. Animation
- **60 fps** : la vidéo joue en boucle (`loop=true`) à son rythme natif (~60 fps H.264 décode).
- **Pas de modulation manuelle** de la hauteur / inclinaison / opacité (la modulation procédurale
  v3 `Math.sin(now/200)` est annulée).
- **Sacrifice armé** : modulation d'`ctx.globalAlpha` sur la passe vidéo (0,7 → 1,0 cyclique
  ~400 ms). Le pulse reste **discret** pour ne pas noyer le mouvement naturel de la vidéo.
- **Cache navigateur** : la vidéo est mise en cache après le 1er chargement — les boots
  suivants sont instantanés (cache-bust via `?v=` dans la balise source, aligné sur main.js).
- **Lecture forcée (v3.3)** : l'attribut `autoplay` ne suffit pas pour une `<video>`
  hors-viewport (1×1 px) — Chrome la laissait en pause et le canvas dessinait la frame 0
  en boucle (constat 11/07). `render.js` force `play()` au parsing du module + re-tente
  sur `canplay` / 1re interaction / retour d'onglet.

#### c. Tint colorimétrique par catégorie (pipeline v3.3/v3.4 — chroma-key → alpha)
- **Étape 0 (v3.4)** — cadrage : `265194.mp4` est un feu cartoon sur **fond VERT
  chroma-key** avec 2 langues de flammes ; la texture est cadrée sur la **langue de
  droite** (crop ~440×700 du 1920×1080, constantes fractionnaires `FEU_SRC`) pour que la
  flamme remplisse le halo 80×80.
- **Étape 1** — masque partagé (1 calcul/frame, canvas offscreen 80×80) : boucle de
  pixels (`getImageData`) qui pose `l = max(r, b)` — **clé chroma** : le canal vert
  n'apporte jamais d'alpha, donc le fond vert est transparent tandis que le feu
  (jaune/rouge/cœur blanc, r toujours élevé) reste opaque — puis `r=g=b=l` (grisaille)
  et `alpha = l × vignette radiale`.
- **Étape 2** — canvas teinté par cat (mémoïsé par frame et par couleur) : silhouette ×
  teinte plate (`source-in` + `fillRect COULEUR_CAT[cat]`), puis **cœur « chaud »** —
  la grisaille redessinée en `screen` à alpha **0.4** re-blanchit le centre de la flamme
  (à 1.0 le blanc noie la teinte cat — dosage QA visuelle 11/07).
- **Couleurs de catégorie** : Info Déplacement `#8FB8E0` (bleu) → feu bleuté ; Info Actif
  `#F0B15E` (orange) → feu ambre (quasi tel quel) ; Info Stat `#9BCB8C` (vert) → feu sauge.
- **Luminance préservée** : les flammes paraissent toujours *chaudes* (les blancs → gris clair
  de la vidéo désaturée restent lumineux en `screen` blend) — le « chaud » de la vidéo mp4
  n'est jamais perdu.
- **Pas de contour Encre épais** : la vidéo fournit sa propre silhouette organique ; on ne
  rajoute pas de filet Encre 1 px autour comme en v3-procédural. Seul le `p.shield ring` 1 px
  Encre reste un marqueur Encre tracé SUR la silhouette.
- **DA §7** : le feu **ne porte pas l'identité de camp** — juste la catégorie d'amélioration.
  Comme en v3-procédural.

#### d. Bicouleur (2 améliorations)
- **Approche (v3.3)** : deux clips rectangulaires (un par moitié), chacun dessinant le
  canvas de flamme teinté de sa cat (`feuTinte(cat_color)`, mémoïsé — les pièces qui
  partagent une cat réutilisent le même canvas).
- **Plus de lèvre Encre centrale** (v3.3) : sur fond transparent elle flotterait sur le
  plateau là où la flamme est absente — la frontière des deux teintes suffit.
- **Gauche** = `cat1` (catégorie de `p.upgrades[0]`) ; **Droite** = `cat2` (catégorie de `p.upgrades[1]`).
- **Coût** : 2× drawImage d'un canvas 80×80 pré-teinté — négligeable (60 fps).

#### e. Cas vide (0 amélioration, pas de Sacrifice armé)
- **Aucun feu.** Le sprite de la pièce est seul. Logique : pas d'upgrade = pas de marqueur.

#### f. Cas Sacrifice armé (GDD §6.2)
- Le feu prend la couleur **Info Actif `#F0B15E`** (catégorie A du Sacrifice, **forcée** par
  `optionsFeuPour` indépendamment des upgrades — correction NO-GO code-reviewer 11/07).
- **Pulse subtil** : modulation de `ctx.globalAlpha` sur la passe vidéo
  (`alpha = 0,7 + 0,3 * Math.sin(now/400 + 1,0)`). L'alternance lumineuse se compose
  naturellement avec l'anim 60 fps de la vidéo sans noyer le mouvement.
- **Plus d'anneau pointillé additionnel** : le feu ambre pulsé est l'unique feed « roi sous
  protection ».

#### g. Ancrage géométrique & débordement de tuile (v3.3)
- Texture flamme 80×80 px (rayon 40) centrée sur la pièce — déborde de 5 px par côté de
  la tuile CELL=70, mais la **vignette radiale** (opacité 0 au bord de la texture) fait
  que rien de visible ne franchit la gouttière entre tuiles.
- (La géométrie des quilles procédurales v3 — `baseY`, `len` 0,65 — est caduque depuis
  le pivot vidéo v3.2.)

#### h. Garde-fous DA (rappel §7)
- Le **contour Encre reste commun aux deux camps** — le feu ne porte pas d'identité de camp,
  juste une identité de **catégorie d'amélioration**.
- **Aucun sprite image** n'est requis : tout est procédural (`quadPath`, `arc`, `ellipse`,
  `clip`). Le rendu reste aligné avec §0 (flat outline pastel).
- Aucune flamme ne déborde dans la case adjacente — ancrage et dimensions calibrés pour rester
  dans le contour de la tuile (cf. §g, marge de sécurité 3-4 px avant le bord supérieur).

### 11.8 Non-régression (incl. v3 — 2026-07-11)

- Aucun coût, aucune catégorie, aucun cooldown, aucun timing de feedback du GDD (§7) n'est modifié
  par cette section. Les seules durées mentionnées ici (100 ms d'état pressé, overshoot d'échelle
  sur ~90 ms) sont des **suggestions de mise en scène de l'artiste**, pas des valeurs de design —
  gameplay-dev peut les ajuster librement sans repasser par le game-designer.
- Le renommage « MONNAIE » → « ÉCUS » (§5, note de renommage) reste une décision séparée, toujours
  en attente de validation utilisateur — le §11 ne préjuge pas de cette réponse.
- Le couple Bleu Poudré / Corail comme accents de camp (§7) reste également soumis à validation
  utilisateur — le §11 les réutilise tels quels (écusson HUD, bandeau de tour) mais n'ajoute
  aucune contrainte nouvelle dessus.
- **v3 — Effet feu sur la pièce** (§11.7 + GDD §5.3.b) : le feu est un **feedback visuel pur**.
  Aucun coût, aucune mécanique, aucune règle de filtrage de coups / cible / capture n'est
  modifiée. Les anneaux cyan-sauge et ambre pointillé sont supprimés uniquement côté **rendu**
  (ils étaient purement visuels) — le moteur (`game/src/rules.js`, `game/src/main.js`) n'a
  pas à connaître l'effet feu et ne change pas. Le halo doré d'achat (GDD §5.3, §7) reste en
  place, inchangé.
