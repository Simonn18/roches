---
projet: roychec
agent: game-designer
date: 2026-07-12
version: 3.1
statut: valide
---

# GDD — roychec

> Source de vérité du jeu. Auteur unique : game-designer. Toute production aval (code, art,
> audio, niveaux) qui contredit ce document re-produit (voir CLAUDE.md §7).

## Changelog

- **v3.1 (2026-07-12, demande utilisateur 12/07 après-midi)** — **Variantes étendues aux
  parties privées en ligne (« Jouer avec un ami »).** Le scope strict v3 est assoupli d'un
  cran : en plus du hot-seat local, le **créateur d'une partie privée** en ligne choisit la
  variante (mêmes 6 combinaisons §7.2), **l'ami en hérite** automatiquement (même canal
  serveur que la cadence : `matches.variant`, imposée à la création, transmise au
  rejoignant, copiée par la revanche). Restent verrouillés Standard × Standard : la **file
  publique** (référence d'équilibrage du ladder — un match classé ne se joue jamais en
  variante) et le **PvAI**. Le timer d'inactivité Élim. ×2 s'applique aussi en privé en
  ligne (déterministe des deux côtés, compté dans le moteur). Amendement §7.2.
- **v3 (2026-07-12, demande utilisateur 12/07)** — **Variantes locales hot-seat.**
  L'économie d'écus du §5.2 est désormais **personnalisable** par le créateur de la
  partie, sous forme de **deux axes orthogonaux combinés librement** (3 économie ×
  2 combat = 6 combinaisons). La valeur par défaut **Standard × Standard** reproduit
  *strictement* le comportement legacy — aucune régression des modes PvAI ou PvP en
  ligne. **Scope strict : hot-seat local 1J vs 2J uniquement** ; le PvAI et le PvP
  en ligne **refusent** la sélection (fallback Standard × Standard, log d'avertissement
  côté code). **Pas de timer d'horloge de partie** dans les variantes locales.
  Variantes **Élimination ×2** assorties d'un **timer d'inactivité** : seuil
  **  10 tours-joueur cumulés** sans capture par aucun camp → injection **silencieuse**
  de **+2 écus** au joueur qui vient de jouer (compté dans le plafond de la variante),
  reset du compteur sur la 1re capture. Catalogue 15 cartes inchangé (mêmes coûts
  4-15, mêmes cooldowns, mêmes effets). Détail mécanique §5.2.b + matrice chiffrée
  §7.2.
- **v2 (2026-07-11)** — Capture du roi comme fin de partie (§8.1 — abandon de
  l'échec et mat classique). **Ambiguités tranchées du GDD v1 levées** :
  §5.5 Zone de contrôle (valeur cible ≤ valeur du fou porteur, traversée autorisée),
  §6.1 Second galop (2e saut = repositionnement seul, jamais de capture, refus =
  pas de cooldown posé), §6.2 Sacrifice (échec sans évasion = fin de partie, pas
  d'effet protecteur), §8.3 cartes [S] de valeur (Vétéran / Forteresse = effet
  chiffré uniquement au départage à la valeur, feedback infobulle dès l'achat).

---

## 1. Pitch

**roychec** est un jeu d'échecs tour par tour, augmenté d'un système d'améliorations de pièces
qui se débloquent **pendant la partie**. Les règles de base des échecs restent intactes
(déplacements classiques, tour par tour, capture). La couche neuve : chaque coup rapporte une
**monnaie** que le joueur dépense quand il veut pour équiper une pièce d'une amélioration
(nouveau déplacement, pouvoir actif ou boost de valeur). Chaque amélioration est propre à un
**type de pièce** (pion, cavalier, fou, tour, dame, roi). Plus la pièce jouée à deux cases à sa disposition,
plus le nombre de pièce gagnée augmente. Plus la pièce à l'origine possède un statut hait, plus son amélioration est chère à activé.

Hors partie, une **voie des trophées** (façon Clash Royale) sert uniquement au matchmaking :
gagner monte les trophées, donc le niveau d'adversaire. Aucune amélioration ne persiste entre
les parties — chaque partie repart de zéro côté améliorations.
La voie de trophées permet de débloquer des bouts de skins de pièces. 

## 2. Genre & références

- **Genre** : stratégie tour par tour / échecs augmentés (roguelite léger intra-partie).
- **Références** :
  - *chess.com* — les échecs classiques, l'échiquier, les timers de partie.
  - *Clash Royale* — l'économie de ressource dépensable, la voie des trophées / ligues, la
    lisibilité des cartes/pouvoirs.

## 3. Core loop

Boucle d'un tour :

1. Le joueur actif **gagne des écus** (résolus au coup précédent) et voit son solde.
2. Il choisit : **jouer un coup** (déplacer/capturer normalement) **ou dépenser des écus** pour
   améliorer une de ses pièces (l'achat ne consomme pas le tour, voir §5.2), **ou** déclencher un
   **pouvoir actif** déjà équipé (ce qui, lui, consomme le tour).
3. Le coup crée de nouvelles menaces / ouvre de nouvelles options d'amélioration.
4. Tour de l'adversaire.

Pourquoi c'est satisfaisant : la tension habituelle des échecs + une **décision économique**
continue (« j'accumule pour une grosse amélioration sur ma dame, ou je blinde tout de suite ce
pion menacé ? »). Chaque partie produit des configurations de pièces différentes.

## 4. Contrôles

MVP = 2 joueurs en local, même écran, **hot-seat** (chacun son tour sur la même souris/clavier).

**Souris (principal)**
| Action | Contrôle |
|---|---|
| Sélectionner une pièce | Clic gauche sur la pièce |
| Voir coups légaux + améliorations dispo | Automatique à la sélection (surbrillance) |
| Déplacer / capturer | Clic gauche sur une case de destination valide |
| Ouvrir le panneau d'amélioration d'une pièce | Clic droit sur sa propre pièce (ou bouton « Améliorer » dans le HUD quand la pièce est sélectionnée) |
| Acheter une amélioration | Clic gauche sur la carte d'amélioration dans le panneau |
| Déclencher un pouvoir actif | Clic sur l'icône de pouvoir de la pièce sélectionnée, puis cible si besoin |
| Désélectionner / fermer panneau | Clic droit dans le vide ou `Échap` |

**Clavier (secondaire / confort)**
| Action | Touche |
|---|---|
| Désélectionner / fermer | `Échap` |
| Confirmer un coup / pouvoir ciblé | `Entrée` |
| Passer au joueur suivant (fin de tour forcée si applicable) | `Espace` |

> Le gameplay-dev implémente le mapping souris tel quel pour le MVP. Le clavier est un plus.

## 5. Mécaniques

Format : **entrée → règle → effet → feedback**.

### 5.1 Coups d'échecs classiques
- **Entrée** : sélection d'une pièce puis clic sur une case légale.
- **Règle** : déplacements standards (pion, cavalier, fou, tour, dame, roi), prise incluse.
  Le roque et la promotion sont **implémentés** (§5.1.b, livrés 2026-07-11 sur demande
  utilisateur — sortis du backlog §9). La prise en passant reste hors périmètre.
- **Effet** : la pièce se déplace ; toute pièce sur la case cible est capturée.
- **Feedback** : cases légales surlignées à la sélection ; animation de glissement (~150 ms) ;
  SFX « pose de pièce » ; flash rouge + SFX de capture sur une prise.

### 5.1.b Roque et Promotion (v2.1 — 2026-07-11, demande utilisateur)

**Roque** — coup du ROI (sélectionner le roi ; la destination à 2 colonnes apparaît
dans ses coups légaux).
- **Conditions** : le roi ET la tour concernée n'ont **jamais bougé** (flag `aBouge`,
  posé sur toute pièce déplacée — y compris via Décret, qui échange roi et allié) ;
  toutes les cases **entre** eux sont vides. **Pas de condition d'échec** : roychec n'a
  pas de notion d'échec (§8.1, on capture le roi) — on peut roquer sous attaque, à
  travers ou vers une case attaquée. C'est un choix de design assumé, cohérent avec le
  reste des règles.
- **Petit roque** : roi e→g, tour h→f. **Grand roque** : roi e→c, tour a→d (cases b, c,
  d vides). Valable pour les deux camps sur leur rangée de départ.
- **Effet** : roi et tour bougent dans le même coup ; jamais de capture ; consomme le
  tour ; revenu normal (+2 écus). Améliorations/cooldowns des deux pièces conservés.
- **Interactions** : Zone de contrôle sans effet (roi et tour valeur ≥ 5, exemptés
  §5.5) ; si le roi a « Passe royal », le bond horizontal de 2 cases vers une
  destination de roque est **résolu comme un roque** (la tour suit — le générateur
  déduplique, priorité roque).
- **Feedback** : le roi glisse (anim standard) ; la tour est repositionnée
  instantanément (assumé v1).

**Promotion** — pion atteignant la **dernière rangée adverse** (rangée 8 pour J1,
rangée 1 pour J2), par avance ou par capture.
- **Règle** : la promotion est **obligatoire** ; choix entre **Dame, Tour, Fou,
  Cavalier** (pas de roi, pas de pion). L'IA choisit toujours la Dame.
- **Effet** : la pièce change de type immédiatement (avant fin du coup). **Les
  améliorations, blindages et cooldowns du pion sont PERDUS** — les cartes sont liées
  au type de pièce (§5.3) et un pion promu est une pièce neuve. Elle peut racheter des
  cartes de son nouveau type (plafond 2 repart de zéro). Sa valeur de capture/départage
  devient celle du nouveau type (§7).
- **Entrée (humain)** : cliquer le coup de promotion ouvre un **panneau modal**
  (4 choix) ; le coup n'est joué qu'après le choix ; cliquer hors du panneau annule et
  rend la sélection. En PvP en ligne, l'horloge **continue de tourner** pendant le
  choix (le panneau fait partie du coup).
- **PvP en ligne** : le choix voyage dans l'événement `move` (champ `promo`) ; le
  récepteur revalide et applique le même type. Hash d'état inchangé de part et d'autre.
- **Feedback** : flash doré sur la pièce promue (réutilise le halo d'achat) ; le feu
  d'améliorations disparaît (améliorations perdues).

### 5.2 Monnaie — les Écus
Système **global** (voir décision tranchée §5.6), pas un compteur par pièce.
- **Entrée** : jouer un coup légal.
- **Règle** :
  - Chaque coup joué rapporte un **revenu de base** au joueur qui vient de jouer.
  - Une **capture** rapporte un **bonus** égal à la valeur de la pièce capturée (voir §7).
  - Les écus sont un **pool commun au joueur** (pas rattaché à une pièce). Solde plafonné (§7).
- **Effet** : le solde d'écus augmente ; il est dépensable à tout moment pendant SON tour.
- **Feedback** : compteur d'écus par joueur dans le HUD ; petit « +N » animé qui monte du HUD ;
  SFX « pièce de monnaie » discret (deux tons selon coup simple / capture).

### 5.2.b Variantes locales hot-seat (v3 — 2026-07-12, demande utilisateur)

L'économie d'écus décrite en §5.2 peut être **personnalisée** par le **créateur de la
partie** via un choix simple du **mode de combat**. **Deux combinaisons
résultantes** sont proposées. La combinaison par défaut **Standard × Standard** reproduit
*strictement* le comportement legacy — **aucune régression** des modes PvAI ou PvP en
ligne (qui refusent la sélection, cf. §7.2 — *Scope strict*).

**Économie (plafond du solde par joueur) :**

| Variante | Plafond | Effet attendu |
|---|---|---|
| Standard | **30 écus** | Identique à v2 ; plafond lisible qui évite l'accumulation excessive vers un combo dame. |

> Le réglage d'écus n'est plus une variante : le plafond est **fixé à 30 écus par joueur**.
> Les choix **Plafond 15** et **Illimité** sont retirés de l'interface pour garder un nombre
> de modes lisible. Les anciens ids restent acceptés uniquement pour relire des parties privées
> ou des replays historiques ; ils ne peuvent plus être sélectionnés pour une nouvelle partie.

**Axe Combat (revenu de base et multiplicateur de capture) :**

| Variante | Revenu / coup joué | Multiplicateur de capture | Effet attendu |
|---|---|---|---|
| Standard | **+2 écus** | **× 1** (P+1, N+3, B+3, R+5, D+9, K+0) | Identique à v2 ; barème GDD §7 inchangé. |
| Élimination ×2 | **+0 écu** (revenu de base **supprimé**) | **× 2** (P+2, N+6, B+6, R+10, D+18, K+0) | Économie **100 % capture-driven**. Une partie sans capture par aucun camp ne génère aucun revenu (voir timer d'inactivité §7.2). Les captures rapportent le double — un pion adverse capture = 2 écus. |

**Timer d'inactivité** (variantes Élimination ×2 uniquement) : si **10 tours-joueur
cumulés** passent sans qu'aucun joueur n'ait réalisé une capture, **injection
silencieuse de +2 écus** au joueur qui vient de jouer (plafonnée par la variante,
jamais au-delà). Le compteur **reset** sur la première capture (de n'importe quel
camp). C'est un **filet anti-économie-gelée** : il évite qu'une partie Élimination ×2
soit bloquée par deux joueurs passifs, **sans transformer** le mode en « gracieux »
(l'injection reste rare et silencieuse — pas de notification visible).

### 5.3 Achat d'amélioration
- **Entrée** : ouvrir le panneau d'une de ses pièces, cliquer une carte d'amélioration abordable.
- **Règle** :
  - L'amélioration s'applique à **cette pièce précise** (instance), pas à tout le type.
  - Le catalogue proposé dépend du **type** de la pièce (une carte « pion » n'apparaît que sur un
    pion). Voir catalogue §6.
  - Une pièce peut cumuler **au maximum 2 améliorations** (garde-fou anti-super-pièce).
  - **Acheter ne consomme pas le tour du joueur** : c'est une action d'intendance qui peut se
    faire avant de jouer son coup. Le joueur doit quand même jouer un coup (ou un pouvoir) pour
    finir son tour. On peut acheter plusieurs améliorations le même tour si le solde suit.
  - Solde insuffisant → carte grisée, achat refusé.
- **Effet** : la pièce gagne un déplacement, un pouvoir actif ou un boost (selon la carte) pour
  **le reste de la partie en cours uniquement**.
- **Feedback** : cartes affichées avec coût, icône de catégorie et couleur (déplacement = bleu,
  actif = orange, stat = vert) ; achat = flash doré sur la pièce + badge d'amélioration persistant
  sous/à côté de la pièce ; SFX « achat/upgrade » ; refus = buzz court + carte qui tremble.

### 5.3.b Règle détaillée — Effet feu vidéo sur la pièce (v3.2 — pivot 2026-07-11)

**Pivot v3 → v3.2** : l'effet initial commit `9f48b832` (quilles Canvas 2D colorées via
`quadraticCurveTo`) est remplacé par une **vidéo mp4**. L'utilisateur a fourni
`game/assets/pieces/265194.mp4` (mp4 1920×1080, ~10 s, ~60 fps, H.264 + AAC strippé) et
a demandé explicitement « j'aimerais ce style de feu **DERRIÈRE** la pièce » — ce qui
inverse la disposition précédente : le feu n'est plus au-dessus du sprite, il ondule
derrière, le sprite reste NET au premier plan.

**Raffinements v3.3 → v3.4 (2026-07-11, retours utilisateur)** : la v3.2 teintait la vidéo
en `screen` par-dessus un `drawImage` opaque — le fond de la vidéo devenait un **disque
plein** de couleur cat, sans flamme visible. La v3.3 a introduit le pipeline
silhouette-alpha ; la v3.4 corrige la clé d'extraction : `265194.mp4` est un feu cartoon
sur **fond VERT chroma-key** (2 langues de flammes dans le cadre 16:9), donc l'alpha
vient de `max(r, b)` — le canal vert n'apporte **jamais** d'alpha. (La v3.3 utilisait
`max(r,g,b)` : le fond vert pur (g=255) restait opaque → disque pastel, flammes noyées,
« certaines pièces n'ont pas les flammes des fois » selon la case et la taille du
sprite — bug signalé par l'utilisateur.) La texture est en outre **cadrée sur la langue
de droite** (crop ~440×700 px du 1920×1080, constantes fractionnaires `FEU_SRC`) pour
que la flamme remplisse le halo au lieu d'être perdue dans le cadre large.

- **Cas vide** : 0 amélioration ET pas de Sacrifice armé → **aucun feu**. Le sprite est seul.
- **Position** : flamme tracée **avant** `drawImage(sprite)` dans `dessinePiece()` → la
  vidéo est en arrière-plan, le sprite en avant. Texture 80×80 px (rayon 40) centrée sur
  (x, y) ; une **vignette radiale** pré-calculée (pleine opacité jusqu'à 60 % du rayon,
  smoothstep vers 0 au bord) fond la flamme au lieu de la couper net — la gouttière entre
  tuiles (CELL=70) est respectée sans clip circulaire.
- **Pipeline (une fois par frame, partagé entre pièces)** : la zone `FEU_SRC` de la frame
  vidéo (langue de droite) est copiée dans un canvas offscreen 80×80, puis une boucle de
  pixels (`getImageData`, ~6 400 px) pose `l = max(r, b)` (clé chroma : le vert du fond
  ne compte pas ; le feu jaune/rouge/blanc a toujours r élevé), `r=g=b=l` (grisaille) et
  `alpha = l × vignette` (fond vert → transparent). Par couleur cat, un canvas teinté
  mémoïsé : silhouette × teinte plate (`source-in`), puis cœur « chaud » re-blanchi
  par la grisaille en `screen` à alpha 0.4 (à 1.0 le blanc noie la teinte — QA visuelle 11/07).
- **1 amélioration** : flamme **uniforme** de la couleur de catégorie (`COULEUR_CAT[cat]`).
- **2 améliorations** : flamme **bicolore**. Deux clips rectangulaires (un par moitié) →
  moitié gauche cat1, moitié droite cat2. **Plus de lèvre Encre centrale** (v3.3) : sur
  fond transparent elle flotterait sur le plateau là où la flamme est absente.
- **Sacrifice armé** : feu ambre `COULEUR_CAT.A = #F0B15E` avec **pulse d'alpha** modulé
  sur ~400 ms (`globalAlpha = 0.7 + 0.3 * Math.sin(now / 400 + 1.0)`). La cat A est
  **forcée** par `optionsFeuPour` quand `p.sacrificeArmed`, indépendamment de la cat des
  upgrades portés (correction NO-GO round 1 code-reviewer 11/07). Le fond étant
  transparent en v3.3, le pulse module toute la flamme sans faire clignoter d'aplat.
- **Lecture vidéo forcée** : l'attribut HTML `autoplay` ne suffit **pas** pour une
  `<video>` hors-viewport (1×1 px) — Chrome la laissait en pause (constat 11/07 :
  `readyState=4` mais `paused=true`, le canvas dessinait éternellement la frame 0).
  `render.js` force `play()` au parsing du module et re-tente sur `canplay` / 1re
  interaction / retour d'onglet (`play()` muet toujours autorisé par la policy).
- **Compatibilité / fallback** : quand `videoFeu.readyState < 3` (chargement en cours,
  seeking), le rendu bascule sur un **placeholder procédural** : un halo radial gradient
  de la couleur cat à `globalAlpha = 0.5`. Aucune frame n'est vide. Plus de dépendance à
  `ctx.filter` (la grisaille est faite dans la boucle de pixels) → Safari iOS < 14.5 a le
  même rendu que Chrome.
- **Performance** : **une seule instance `<video>` partagée** entre toutes les pièces.
  `drawImage(videoFeu)` est appelé N fois par frame (N = pièces avec upgrade), à des
  coordonnées différentes. Le GPU décode la vidéo en arrière-plan, le rendu canvas à
  60 fps suit naturellement. Pas de pression supplémentaire sur le main thread — `videoFeu`
  vivante en permanence, jamais recréée.
- **Plafond 2 améliorations respecté** : si une 3e amélioration est forcée en jeu (bug),
  seule la 1re et la 2de sont rendues (le feedback n'invente pas d'upgrade fantôme).
- **Pourquoi ce pivot** : la vidéo fournie par l'utilisateur est plus expressive qu'un
  procédural (flammes réalistes, éclairage interne, mouvement organique). Les quilles
  Canvas 2D étaient correctes techniquement mais plates visuellement. La vidéo est
  UN asset (~5 Mo mp4 H.264) tolérable pour le boot (cache après 1er chargement).

### 5.4 Pouvoirs actifs
- **Entrée** : sélectionner une pièce équipée d'un pouvoir actif, cliquer son icône, cibler si
  requis.
- **Règle** :
  - Déclencher un pouvoir actif **consomme le tour** (à la place d'un coup), sauf mention contraire
    de la carte (ex. « Double coup »).
  - Chaque pouvoir a un **cooldown en tours du joueur** (§6/§7) ; certains sont **à usage unique**.
  - Toute amélioration de catégorie **[D]** est à **usage unique pour son mouvement spécial** : dès que ce mouvement est joué, la carte est consommée et ne génère plus ce mouvement. Les déplacements classiques de la pièce restent disponibles.
  - Un pouvoir en cooldown est indisponible (icône grisée + compteur).
- **Effet** : dépend de la carte (bouclier, tir à distance, saut, etc.).
- **Feedback** : icône de pouvoir sur la pièce ; anneau de cooldown ; télégraphie de la zone/cible
  visée avant confirmation ; effet visuel dédié au déclenchement + SFX propre à chaque pouvoir.

### 5.5 Boosts de stats / valeur
- **Entrée** : achat d'une carte de catégorie « stat ».
- **Règle** : modifie une propriété passive de la pièce (valeur en points pour le départage,
  survie à une prise, portée de contrôle). Toujours passif, aucun déclenchement.
- **Plafond de partie** : au maximum **4 pièces distinctes** peuvent recevoir une amélioration
  de catégorie [S] pendant la partie. Une même pièce ne consomme qu'un seul emplacement [S]
  même si plusieurs cartes [S] lui sont attribuées ; une pièce capturée ou promue ne libère
  pas son emplacement déjà consommé. Le plafond s'applique aux achats, aux récompenses de
  Chasse et aux décisions de l'IA.
- **Effet** : ex. « Vétéran » → le pion vaut 3 points au départage au lieu de 1 ; « Blindage » →
  absorbe la première capture (la pièce survit, l'attaquant reste sur sa case de départ).
- **Feedback** : effet « feu » **vidéo mp4** projeté **DERRIÈRE** la pièce
  (`game/assets/pieces/265194.mp4`, mp4 1920×1080 ~10 s ~60 fps), tinté par `COULEUR_CAT`
  — **Déplacement** = Bleu Poudré, **Actif** = Orange, **Stat** = Sauge. Si la pièce porte
  **2 améliorations**, le feu est **bicolore** : demi-cercle gauche teint de la cat de la
  1re carte, demi-cercle droit de la cat de la 2de, lèvre Encre 1 px verticale au milieu.
  Sur « Blindage » consommé, bris visuel type coquille + SFX ; la valeur modifiée apparaît
  dans l'infobulle de la pièce. **Position DERRIÈRE la pièce** (explicite, pivot
  utilisateur 2026-07-11) — l'anim 60 fps de la vidéo ondule, le sprite reste NET au
  premier plan. Détail (compatibilité vidéo, bicolore, Sacrifice armé, cas vide) en §5.3.b.
- **Anciens feedbacks retirés** : les **anneaux** d'état (liseré cyan-sauge de blindage
  et anneau pointillé ambre de Sacrifice armé) ainsi que les **badges 5 px** de catégorie
  sont supprimés — la vidéo feu les remplace (couleur du feu = catégorie, pulse α pour
  l'armement). Le **halo doré d'achat** (300 ms éphémère, GDD §7) reste inchangé.
- **Pivot v3 → v3.2** : l'implémentation initiale (commit `9f48b832`, quilles Canvas
  2D cat-couleur `quadraticCurveTo`) cédée sa place à la vidéo fournie par l'utilisateur.
  Le procédural n'est PLUS utilisé et l'ordonnancement passe de « quilles au-dessus du
  sprite » à « vidéo derrière le sprite ». Le halo doré d'achat reste en flash bref
  post-achat par-dessus tout.
- **Règle — Zone de contrôle (aura passive)** : le fou porteur projette une **aura** sur les 8
  cases qui l'entourent. Une pièce adverse dont la **valeur de départage est ≤ 3** (soit pion,
  cavalier, fou — c.-à-d. une valeur **inférieure ou égale à celle du fou porteur**, qui vaut 3)
  **ne peut pas terminer un déplacement** sur une case de l'aura. Les pièces de valeur ≥ 5 (tour,
  dame, roi) **ignorent l'aura**. L'aura interdit uniquement de **s'arrêter** sur une case : une
  pièce peut **traverser** l'aura (case intermédiaire d'un bond) sans être bloquée. L'aura filtre
  les déplacements et la Téléportation courte ; elle **n'affecte pas** les captures à distance qui
  ne déplacent pas la pièce (Ruée, Rayon sacré). Cumul : plusieurs auras adverses se combinent
  (union des cases interdites).
- **Feedback — Zone de contrôle** : les 8 cases de l'aura sont **teintées** en permanence tant
  qu'une pièce affectée est sélectionnée ; une case d'aura n'apparaît jamais comme coup légal pour
  une pièce faible.

### 5.6 Décision tranchée — monnaie GLOBALE vs compteur par pièce
Le pitch initial parlait d'un **compteur de coups par pièce**. Je tranche pour une **monnaie
globale gagnée à chaque coup**, pour ces raisons :
1. **Lisibilité** : un seul chiffre par joueur au lieu de 16 compteurs à suivre.
2. **Décision stratégique plus riche** : le joueur arbitre où investir un pool commun, au lieu
   d'être forcé de bouger une pièce N fois pour la débloquer (ce qui pousse à des coups artificiels).
3. **Anti-abus** : un compteur par pièce récompense le fait de tripoter une pièce sûre en fond
   d'échiquier ; un pool global couplé au bonus de capture récompense le **jeu actif**.
Conséquence pour le code : pas de champ `moveCount` déterminant les déblocages ; un champ
`ecus` par joueur, et des `upgrades[]` par instance de pièce.

## 6. Catalogue d'améliorations (MVP)

Catégories : **[D]** déplacement · **[A]** actif · **[S]** stat. Coûts en écus (barème §7).
Chaque carte est propre à un type de pièce. Les cooldowns des cartes [A] sont exprimés en **tours du joueur**; les cartes [D] se consomment au premier mouvement spécial joué.

### Pion
| Carte | Cat. | Coût | Effet |
|---|---|---|---|
| Marche arrière | D | 4 | Le pion peut reculer d'une case (jamais pour capturer). |
| Bouclier de fantassin | A | 6 | Usage unique : annule la prochaine capture subie (l'attaquant reste sur place). |
| Vétéran | S | 5 | Le pion vaut **3 points** au départage au lieu de 1 (voir §8.2). La valeur modifiée s'affiche dans l'infobulle du pion **dès l'achat**, dans tous les modes. |

### Cavalier
| Carte | Cat. | Coût | Effet |
|---|---|---|---|
| Second galop | D | 8 | Le tour où son saut **ne capture pas**, le cavalier peut enchaîner immédiatement un **2e saut** unique. Ce 2e saut est un **repositionnement seul : il ne peut jamais capturer** (voir §6.1). L'enchaînement est facultatif — le refuser conserve la carte. |
| Ruée (charge) | A | 9 | Actif, cooldown 4 : capture une pièce adverse à distance de cavalier **sans se déplacer**. |
| Monture blindée | S | 7 | Absorbe la première capture subie (survit une fois), puis boost consommé. |

### Fou
| Carte | Cat. | Coût | Effet |
|---|---|---|---|
| Pas de côté | D | 6 | Le fou peut se déplacer d'une case orthogonale (change de couleur de case). |
| Rayon sacré | A | 10 | Actif, cooldown 4 : capture à distance la 1re pièce adverse sur une diagonale, sans bouger. |
| Zone de contrôle | S | 6 | Aura passive : aucune pièce adverse de **valeur ≤ 3** (pion, cavalier, fou) ne peut **terminer** un déplacement sur l'une des 8 cases adjacentes au fou. Tour, dame et roi (valeur ≥ 5) l'ignorent. Règle complète et cas de bord en §5.5. |

### Tour
| Carte | Cat. | Coût | Effet |
|---|---|---|---|
| Pivot | D | 7 | La tour peut se déplacer d'une case en diagonale (1 case seulement). |
| Rempart | A | 9 | Actif, cooldown 5 : la tour se pose ; elle et les alliés orthogonalement adjacents sont blindés (survivent à 1 prise) jusqu'au prochain tour du joueur. |
| Forteresse | S | 8 | La tour vaut **8 points** au départage et absorbe la première capture subie. |

### Dame
| Carte | Cat. | Coût | Effet |
|---|---|---|---|
| Téléportation courte | D | 12 | Actif à mouvement à usage unique : la dame se pose sur n'importe quelle case vide à ≤3 cases (ignore les obstacles), puis la carte est consommée. |
| Double coup | A | 15 | Actif, **usage unique**, ne consomme pas le tour : après un coup de la dame, rejouez immédiatement un 2e coup avec elle. |
| Couronne | S | 9 | La dame absorbe la première capture subie (survit une fois). |

### Roi
| Carte | Cat. | Coût | Effet |
|---|---|---|---|
| Passe royal | D | 8 | Le roi peut se déplacer de **2 cases** en ligne droite (orthogonal/diagonal), cases libres. |
| Sacrifice | A | 12 | Actif, cooldown 6 : arme le roi. À la prochaine capture qui le viserait, une pièce alliée meurt **à sa place** et le roi s'évade sur une case adjacente. Priorité de victime et issue sans évasion : voir §6.2. |
| Décret | A | 14 | Actif, **usage unique**, cooldown ∞ : échange la position du roi avec une de ses pièces alliées adjacentes (mini-roque libre). |

> Le catalogue est volontairement resté à **3 cartes par type** pour le MVP. Extension possible
> ensuite (level-designer + game-designer). Toute nouvelle carte respecte les 3 catégories et le
> plafond de 2 améliorations par pièce.

### 6.1 Règle détaillée — Second galop
- **Déclenchement** : uniquement après un **1er saut sans capture** du cavalier équipé, si la carte n'a pas déjà été consommée.
- **2e saut** : c'est un mouvement de cavalier classique **restreint aux cases sans capture**. Le
  cavalier **ne peut jamais capturer sur son 2e saut**, même si une prise est disponible.
- **Refus** : l'enchaînement est facultatif. Le joueur peut le **décliner** (`Espace` / bouton) ;
  dans ce cas la carte reste disponible et le tour se termine.
- **Coût** : dès qu'un 2e saut est joué, la carte est consommée et le tour se termine.
- **Pourquoi cette restriction** : autoriser une capture sur le 2e saut donnerait au cavalier une
  **double prise en un seul tour** (ou une prise après repositionnement libre), un tempo bien trop
  fort pour une carte à 8 écus. Le Second galop reste un outil de **mobilité/repositionnement**,
  pas de suractivité offensive. La suractivité offensive est réservée aux actifs dédiés (Ruée) et
  aux cartes décisives à prix fort (Double coup).

### 6.2 Règle détaillée — Sacrifice
- **Armement** : déclencher Sacrifice **consomme le tour** et pose le cooldown (6 tours du joueur).
  Le roi est alors **armé** jusqu'à ce que l'effet se résolve.
- **Déclenchement** : à la **prochaine capture visant le roi armé**, avant que le roi ne soit
  retiré, le système tente de le protéger.
- **Choix de la victime (ordre de priorité)** : la pièce alliée sacrifiée est celle de **valeur de
  départage la plus basse** (un **pion en priorité**, valeur 1 ; à défaut la pièce alliée de valeur
  la plus faible disponible, « juste supérieure » aux pions). Le **roi n'est jamais** une victime.
  **Départage** entre plusieurs candidates de même valeur : la **plus proche du roi** (distance de
  Chebyshev) ; à distance égale, la première rencontrée dans le balayage de l'échiquier.
- **Évasion du roi** : la victime disparaît « à la place du roi », puis le roi se déplace sur la
  **case adjacente libre la plus éloignée de l'attaquant** (distance de Chebyshev ; à égalité, la
  première case libre rencontrée). Le roi n'est **pas** capturé.
- **Échec du sacrifice (issues normatives)** : le sacrifice **échoue et le roi est capturé
  normalement (fin de partie)** dans deux cas —
  1. **aucune case adjacente libre** où le roi puisse s'évader ;
  2. **aucune pièce alliée sacrifiable** sur l'échiquier (le roi est seul, ou seules restent des
     pièces qui ne comptent pas — voir ci-dessus).
  Dans ces cas, l'armement est réputé non consommé (il n'a rien protégé) ; le résultat est de toute
  façon la fin de partie par capture du roi (§8.1).
- **Feedback** : télégraphie de l'armement (halo sur le roi tant qu'il est armé) ; flash rouge sur
  la victime sacrifiée ; flash cyan sur la case d'évasion du roi ; SFX dédié.

## 7. Équilibrage (valeurs chiffrées)

### Économie
| Paramètre | Valeur | Note |
|---|---|---|
| Revenu par coup joué | **+2 écus** | Au joueur qui vient de jouer. |
| Bonus de capture | **+ valeur de la pièce prise** | Pion 1, Cavalier 3, Fou 3, Tour 5, Dame 9. Roi = 0 (fin de partie). |
| Solde de départ | **0 écu** | Les deux joueurs commencent à sec. |
| Plafond de solde | **30 écus** | Évite la thésaurisation infinie vers un combo dame. |
| Écus au 1er coup | inclus | Le tout premier coup rapporte déjà +2. |

Repère de rythme : sans capture, un joueur atteint ~6 écus au tour 3, ~10 au tour 5. La première
petite amélioration (4-6) tombe donc vers les tours 2-3, une grosse (12-15) vers les tours 6-8 ou
plus tôt si le joueur capture agressivement.

### Coûts (rappel, barème par impact)
- Petites (déplacement/stat locale) : **4-8 écus**.
- Actifs à distance / mobilité forte : **9-12 écus**.
- Effets décisifs (Double coup, Décret) : **14-15 écus**.

### Cooldowns (en tours du joueur)
| Type d'effet | Cooldown |
|---|---|
| Enchaînement mouvement (Second galop, Téléportation) | — (usage unique) |
| Tir à distance (Ruée, Rayon sacré) | 4 |
| Zone défensive (Rempart, Sacrifice) | 5-6 |
| Usage unique (Bouclier, Double coup, Décret) | — (une fois) |

### Timings d'affichage / feedback
| Élément | Valeur |
|---|---|
| Animation de déplacement | 150 ms (glissement) |
| Flash de capture | 200 ms |
| « +N écus » animé | 600 ms de montée + fondu |
| Flash doré d'achat | 300 ms |
| Télégraphie de ciblage (pouvoir) | maintenue jusqu'à confirmation/annulation |### Timers de partie
Prévus (héritage chess.com) : **1 min / 3 min / 10 min / 24 h** par joueur. **Hors périmètre MVP
local** (voir §8 et §9) — le MVP local joue **sans horloge**. Les horloges **existent en PvP
en ligne** (cadence 5+3 depuis le cycle W2, 2026-07-10) : leur chute de drapeau déclenche le
départage à la valeur (§8.2).

### 7.2 Variantes locales hot-seat (v3 — 2026-07-12)

**Matrice actuelle des 2 combinaisons** :

| # | ID | Plafond | Revenu / coup | Capture × | Effet gameplay cible |
|---|---|---|---|---|---|
| 1 | `pvp_standard` | 30 | +2 | × 1 | Référence lisible et identique au comportement v2. |
| 2 | `pvp_elimX2` | 30 | +0 | × 2 | Mode sanglant — économie orientée capture, timer d'inactivité 10 tours-joueur. |

**Scope (amendé v3.1) :** les variantes sont disponibles dans **deux contextes** :

1. le mode `pvp` **local hot-seat 1J vs 2J** (sélection au menu, v3) ;
2. les **parties privées en ligne** (« Jouer avec un ami », v3.1) : le **créateur**
   choisit la variante sur l'écran de cadence, **le rejoignant en hérite** (serveur
   autoritaire : `matches.variant`, transmis par `pvp_join_code`, copié par
   `pvp_rematch` pour la revanche). Les deux clients partagent le même id de variante,
   donc la même économie — le lockstep §5.4 (hash) reste valide.

Restent **verrouillés Standard × Standard** : la **file publique** (`pvp_find_match`
n'accepte aucune variante) et le **PvAI** — le GDD §7 établit le plafond 30 + le barème
des captures comme **référence d'équilibrage** des modes mesurés (PvAI, ladder PvP), et
cette référence ne doit pas être altérée en mode classé ou contre l'IA. Une partie
privée n'est pas classée-référence au sens strict (pas de matchmaking par bande), d'où
l'assouplissement v3.1 sans toucher au ladder.

**Pas de timer de partie** dans les variantes locales (mode local sans horloge, comme
le MVP initial §9). La capture du roi reste la condition de victoire exclusive
(§8.1) ; il n'y a **pas** de départage à la valeur au temps dans les variantes
locales (même si certaines combinaisons ressemblent au comportement PvP en ligne,
le timer n'est pas activé).

**Règles d'économie par variante :**

- La **base** du coup joué est `+2 × revenuBase` où `revenuBase ∈ {0, 1}` (multiplie
  1 par défaut, 0 le supprime).
- Le **bonus de capture** est `valeur(cible) × captureMul` où `captureMul ∈ {1, 2}`.
- Le plafond est appliqué **après combinaison** : `min(solde + montant, plafond)`.
- En mode `elimX2`, le compteur `stagnationCpt` démarre à 0 et s'incrémente à chaque
  coup joué sans capture par aucun camp. Quand il atteint le **seuil 10**, injection
  de `+2` au joueur qui vient de jouer (compté dans le plafond), puis reset à 0.

**Catalogue de cartes inchangé** : les 15 cartes du §6 restent **identiques** dans
toutes les variantes (mêmes coûts 4-15 écus, mêmes cooldowns, mêmes effets). Seules
les **sources d'écus** changent. En particulier :

- `Double coup` (15 écus, dame) **reste** la carte la plus chère : en plafond 15,
  elle n'est atteignable que par une capture majeure (dame = 9 en standard, 18 en
  élimination ×2) ou une accumulation plafond + capture mixte.
- `Décret` (14 écus, roi) reste aussi cher : juste sous le plafond 15.

## 8. Win / Lose

### 8.0 Condition principale — capture du roi
- **Victoire** : capturer le **roi** adverse (le roi mangé = partie finie). Décision tranchée §8.1.
- **Défaite** : voir son propre roi capturé.

### 8.2 Condition secondaire — fin du temps (départage à la valeur)
- Active dès qu'une **horloge** est en jeu : **PvP en ligne** (cadence 5+3, cycle W2) et, à terme,
  les modes locaux chronométrés. Le MVP local **sans horloge** n'y recourt pas.
- À l'épuisement du temps d'un joueur (chute de drapeau), on compare la **valeur totale des pièces
  capturées** par chacun.
- **Valeurs de départage** : Pion 1, Cavalier 3, Fou 3, Tour 5, Dame 9. Les cartes **[S]** de type
  « valeur » **modifient ce total** : capturer une pièce portant un boost de valeur rapporte sa
  **valeur boostée** (ex. capturer un pion **Vétéran** compte **3**, une tour **Forteresse** compte
  **8**). C'est **le seul canal par lequel Vétéran, Forteresse et assimilés produisent un effet**
  chiffré (voir §8.3).
- **Total supérieur = victoire** ; **égalité = nulle**.

### Nulle
- Nulle par accord (bouton, futur), ou égalité de valeur au temps. Le pat classique n'est pas une
  condition de fin en mode capture-du-roi (voir §8.1).

### 8.1 Décision tranchée — capture du roi vs échec et mat
Je tranche pour la **capture du roi** (le roi se prend comme une pièce normale), et **je retire
l'échec/mat/pat classiques** du MVP, parce que :
1. Les améliorations (Bouclier, Sacrifice, Téléportation, tirs à distance) rendent la
   détection d'échec et mat **très coûteuse et ambiguë** à coder correctement.
2. « roychec » reste lisible : on cherche à **manger le roi**, les pouvoirs défensifs du roi
   (Sacrifice, Décret) prennent tout leur sens comme filets de survie.
3. Simplicité d'implémentation pour le MVP.
Conséquence : pas d'obligation de sortir d'échec, pas de coup interdit « qui laisse le roi en
prise ». On peut exposer/sacrifier son roi — à ses risques. **À valider par l'utilisateur** (voir
note finale) : c'est un écart assumé vis-à-vis des échecs classiques.

### 8.3 Décision tranchée — statut des cartes de valeur (Vétéran & assimilées) selon le mode
Les cartes **[S] de valeur** (Vétéran, Forteresse, et le volet « valeur » de toute future carte)
n'ont d'**effet chiffré qu'au départage à la valeur** (§8.2). Or ce départage **existe désormais**
(chute de drapeau du PvP en ligne, cycle W2). Je tranche donc :
- La carte **reste achetable et visible dans tous les modes** (pas de masquage local). Masquer une
  carte selon le mode fragmenterait le catalogue et casserait la lisibilité.
- Son **feedback est toujours présent** : la **valeur modifiée s'affiche dans l'infobulle** de la
  pièce **dès l'achat**, quel que soit le mode. Une mécanique sans feedback n'existe pas pour le
  joueur (CLAUDE.md §7.4) — l'infobulle est ce feedback, y compris en local hors horloge.
- Son **effet mécanique** (peser sur le départage) s'applique **là où un départage à la valeur se
  résout** : PvP en ligne aujourd'hui, modes locaux chronométrés demain. En **MVP local sans
  horloge**, la carte est un pari sur une éventuelle horloge (aucune, donc aucun effet de score) :
  l'infobulle reste sa seule manifestation, ce qui est **assumé**.
- **Cohérence du départage (règle normative)** : le départage compte la valeur **boostée** des
  pièces capturées (§8.2). L'écart connu de l'implémentation en ligne (le bonus [S] des pièces
  **déjà capturées** n'est pas encore comptabilisé) est un **bug d'implémentation à corriger**,
  pas la règle : la règle de référence est bien « valeur boostée comptée ».

## 9. Scope MVP

**Objectif MVP : une partie de roychec complète, jouable à 2 en local (hot-seat), sur Canvas 2D,
avec l'économie d'écus et au moins une amélioration par type de pièce fonctionnelle.**

### Dans le MVP
1. Échiquier 8×8, placement initial standard, rendu Canvas 2D (placeholders : cases + pièces
   dessinées en formes/lettres colorées suffisent, cf. CLAUDE.md §7.4).
2. Déplacements classiques des 6 pièces + capture. Tour par tour alterné.
3. **Économie d'écus** : revenu +2/coup, bonus de capture, plafond 30 (paramétrable dans
   les variantes locales — voir §5.2.b + §7.2), HUD par joueur.
4. **Achat d'améliorations** : panneau par pièce, catalogue §6 filtré par type, plafond 2/pièce,
  plafond global de 4 pièces distinctes porteuses d'une carte [S], achat sans consommer le tour.

   > Reste du catalogue = extension post-MVP.
5. **Fin de partie par capture du roi** + écran de victoire indiquant le vainqueur.
6. Feedback minimal : surbrillance des coups légaux, animation de déplacement, SFX
   coup/capture/achat (placeholders audio OK), compteur d'écus animé.
7. **Variantes locales hot-seat** (§5.2.b + §7.2 — deux combinaisons simples,
   plafond d'écus fixe à 30 ; sélection **locale hot-seat uniquement**, refusée par
   PvAI et PvP en ligne). Paramétrage via un choix simple du mode de combat sur le menu d'accueil
   (accordéon « VARIANTES (LOCAL) » sous le bouton « 1J VS 2J »).

### Hors MVP (plus tard)
- **IA adversaire** (aucun bot dans le MVP local initial ; livrée depuis, voir spec-ia.md).
- **Réseau / matchmaking en ligne** et **voie des trophées** : le PvP en ligne et le départage à la
  valeur sont désormais implémentés (cycles W1-W3) ; la voie des trophées reste en construction.
- **Horloges de partie** : actives en PvP en ligne (5+3) ; les cadences locales (1/3/10 min, 24 h)
  restent à venir.
- Reste du catalogue d'améliorations (les 2 autres cartes par type).
- ~~Roque, promotion~~ : **LIVRÉS 2026-07-11** (§5.1.b, demande utilisateur — avec choix
  de pièce à la promotion). Seule la **prise en passant** reste hors périmètre.
- Retour à l'échec et mat classique en option de mode, si souhaité (cf. §8.1).

## 10. Systèmes (méta, hors partie)

- **Voie des trophées (matchmaking)** : chaque victoire fait **monter les trophées** du joueur,
  chaque défaite les fait légèrement baisser. Les trophées déterminent le niveau d'adversaire
  (façon Clash Royale). **Aucune amélioration ne persiste** entre parties : la voie des trophées
  ne débloque **que** des paliers de matchmaking, pas de bonus de gameplay (décision : reset par
  partie, pas de méta persistante type arbre Clash Royale).
- **Reset par partie** : à chaque nouvelle partie, toutes les pièces repartent **sans
  amélioration**, solde d'écus à 0. Seuls les trophées sont conservés.
- **Trophées = PvP en ligne uniquement** (décision utilisateur 2026-07-09) : le PvAI ne rapporte
  aucun trophée. Le ladder est un Elo PvP (K=32).
- **Statut** : PvP en ligne (matchmaking, synchro, horloges, Elo) livré (cycles W1-W3). La voie des
  trophées à paliers / skins reste conçue et non implémentée.
