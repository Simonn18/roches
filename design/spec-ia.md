---
projet: roychec
agent: game-designer
date: 2026-07-11
version: 2
statut: brouillon
---

# Spec — Mode IA 1v1 (PvAI) — Joueur humain vs ordinateur

> **Changelog v2 (2026-07-11)** — amendement « fréquence d'achat » (directive utilisateur ferme).
> L'IA thésaurisait (audit 11/07 : 9 achats sur 30 parties en Avancé). Trois blocs réécrits :
> **§1.3** politique d'achat entièrement remplacée (les 5 règles A-E → une politique de dépense
> chiffrée, par bandes de solde) ; **§2.2** poids MENACE replafonné (fix « posturing » du greedy) ;
> **§2.4** micro-incitation à dépenser. Impacts code signalés en **§6.1**. Les pouvoirs actifs
> (ex-règles D/E) restent **hors-scope de ce cycle** (voir §1.3.5). Le reste du document (v1) est
> inchangé.

> **Statut** : brouillon game-designer, livré en amont d'un cycle `/feature IA-1v1`
> (gameplay-dev → QA) si l'utilisateur tranche d'aller au-delà de la spec.
> **Périmètre** : mode local, 1 joueur humain + 1 joueur contrôlé par l'ordinateur.
> **Hors scope** : online, matchmaking, voie des trophées (déjà hors MVP §10 du GDD).
> **Référence code existant** : `game/src/main.js`, `game/src/rules.js`,
> `game/src/board.js`, `game/src/constants.js`, `game/src/render.js`, `game/src/ai.js`,
> `window.__roychec.state` (getter exposé ligne 543), `window.__roychec.jouerCoup()`.
> **Conformité** : GDD v1 (`design/gdd.md`) et leçons du rapport QA 04
> (`qa/rapport-playtest-04.md`, 2026-07-06).

---

## 1. Réponses aux 4 questions à trancher

### 1.1 Niveau de difficulté — **3 boutons au lancement, sans adaptatif**

**Décision** : 3 boutons fixes, **Débutant** (1-ply greedy), **Intermédiaire** (2-ply α-β),
**Avancé** (3-ply α-β + table de transposition).

**Cohérence avec le moteur** :
- L'évaluation est **statique** (l'état ne se « déroule » que dans la recherche α-β). Une
  1-ply greedy est triviale à coder (~50 lignes) et robuste : elle choisit le coup qui maximise
  l'évaluation sur l'état résultant. C'est ce qu'on appelle « material-aware greedy ».
- Une 3-ply α-β sur un facteur de branchement roychec ≈ 30-40 coups (incluant les achats et les
  pouvoirs) ≈ 30³ = 27 000 feuilles. Avec élagage α-β (`β ≤ 30^2 × depth_factor ≈ 500`)
  et évaluation statique, ça tient en 200-800 ms (cf. §4.4 timeouts).
- Une **adaptative** (qui monte de niveau en milieu de partie) est *pédagogiquement* sympa mais
  complique la lecture pour l'utilisateur et masque la difficulté réelle. À laisser pour un
  post-MVP si on observe que les 3 niveaux fixes ne suffisent pas.

**Justification « pas d'adaptatif v1 »** : la spec MVP-post-MVP doit être tranchée et testable.
3 niveaux fixes = 3 bots distincts à régresser, c'est déterministe. Si la QA du cycle
`/feature IA-1v1` trouve un comportement bizarre, on saura quel niveau le provoque.

### 1.2 Camp de l'IA — **Joueur 2 fixe (convention échecs)**

**Décision** : l'IA joue **toujours Joueur 2** (Corail, accent `#E08A6E`). L'humain est
Joueur 1 (Bleu Poudré, `#7FA6D9`). Pas de sélecteur côté utilisateur v1.

**Justifications empilées** :
1. **Convention chess.com/Lichess** : le joueur 1 (le « premier à jouer ») est humain, le joueur
   2 (qui joue en réponse) est le bot. Ancre culturelle pour les joueurs qui découvrent le mode.
2. **Asymétrie inhérente** : J1 joue 1 coup en premier, donc a 1 coup d'avance à la fin. Si l'IA
   était J1 elle aurait cet avantage — choix neutre par défaut : avantage au joueur humain.
3. **Déséquilibre algorithmique symétrique** : aucune raison technique de préférer un camp
   (mêmes `coupsLegaux` symétriques via `owner`). La différence est seulement l'ordre des coups.
4. **Code existant préservé** : `state.turn = 0` reste l'humain. Pas de refactor des boucles.

**Cas particulier** : si l'utilisateur veut rejouer après une partie, il reste humain (même
side). Pas de swap automatique (ce serait une feature « revanche couleur inversée » à part).

### 1.3 Stratégie d'achat — **politique de dépense chiffrée (v2)**

> **Réécriture complète (v2, 2026-07-11).** Les 5 règles A-E de la v1 sont **retirées** : elles
> produisaient un bot avare (audit 11/07 : 9 achats / 30 parties en Avancé, soit **0,3 achat /
> partie**). La cause : réserve ≥ 4 appliquée à la lettre, `purchaseBonus` d'éval trop timide, et
> aucun mécanisme d'urgence à l'approche du plafond 30. Le sort des règles A-E est acté en §1.3.5.
> La nouvelle politique est **une seule règle, dépensière, chiffrée**, implémentable telle quelle.

#### 1.3.0 Principe directeur

Dans l'économie du GDD (§7), **tout écu au-delà de 30 est perdu** (+2/coup, aucun stockage
au-dessus du plafond). Un bot rationnel ne doit donc **jamais camper à 30**. La politique
transforme cette contrainte en comportement : plus le solde monte, plus dépenser devient urgent
(à 30, chaque coup joué sans achat = 2 écus jetés). On garde une **hiérarchie de préférence
simple** : défense d'une pièce menacée > amélioration d'une pièce active > achat opportuniste.

**Objectif mesurable (à vérifier par QA sur parties auto-jouées, IA vs IA ou IA vs coups aléatoires) :**

| Métrique | Baseline v1 (audit 11/07) | Cible v2 (Interm. / Avancé) | Cible v2 (Débutant) |
|---|---|---|---|
| Tours-joueur de l'IA avec solde == 30 | non mesuré (thésaurisation) | **< 10 %** | **< 15 %** |
| Achats par partie et par IA | 0,3 | **≥ 5** (fourchette saine 5–8) | **≥ 3** |

Cohérence du chiffre « ≥ 5 achats » : une partie type dure ~20-30 coups par joueur → ~40-60 écus
de revenu de base + captures. Le catalogue coûte 4-15 écus (moyenne ≈ 8). Pour ne pas gaspiller
son revenu, l'IA **doit** convertir ~40-60 écus en cartes, soit 5-8 achats. En dessous de 5, elle
gaspille mécaniquement au plafond → la cible < 10 % de tours au plafond ne peut pas être tenue.

#### 1.3.1 Architecture — l'achat devient une **phase distincte pré-mouvement**

> **Impact code (signalé en §6.1).** En v1, l'achat « émergeait » de la recherche comme un coup
> complet candidat parmi d'autres — d'où sa timidité (le gain d'éval d'un achat est petit face à
> celui d'un bon coup, donc l'achat perdait presque toujours l'argmax). En v2, **l'achat est
> extrait de la recherche** : une fonction dédiée `decideAchats(state, ai)` s'exécute **une fois,
> au début du tour du bot, AVANT la sélection du coup**. Elle achète 0 à N cartes (boucle
> §1.3.4), puis la recherche de coup tourne sur le plateau déjà amélioré. C'est licite : acheter
> ne consomme pas le tour (GDD §5.3). **Cette phase est commune aux 3 niveaux** ; seul le *choix
> de la carte* diffère (§1.3.4). Le déplacement des pièces menacées reste, lui, du ressort de la
> recherche de coup (l'éval MENACE pénalise une pièce alliée attaquable, §2.2, ce qui pousse
> naturellement le bot à fuir/défendre par le coup quand l'achat n'est pas possible).

#### 1.3.2 Bandes de solde — QUAND et COMBIEN dépenser (commun aux 3 niveaux)

`decideAchats` compare chaque achat candidat à un **gate** (gain d'éval minimal exigé) qui
**décroît quand le solde monte**, et respecte un **nombre max d'achats par tour** croissant :

| Bande de solde | Gate `gainEval` min | Achats max / tour | Comportement |
|---|---|---|---|
| **0 – 3** | — | 0 | Rien d'abordable (carte la moins chère du catalogue = 4 écus). |
| **4 – 11** | **≥ +1.0** | 1 | Sélectif : n'achète qu'une carte à vrai gain (blindage, stat) ou une défense (§1.3.3). |
| **12 – 19** | **≥ 0.0** | 1 | Achète dès qu'un candidat à gain non négatif existe (y compris cartes de déplacement). |
| **20 – 25** | **≥ −2.0** | 2 | Dépense forcée : accepte des upgrades médiocres pour redescendre. |
| **26 – 30** | **aucun gate** | 3 | **Urgence plafond** : achète les meilleurs candidats abordables jusqu'à repasser < 26. |

**Réserve minimale = 0 écu.** La réserve ≥ 4 de la v1 (ex-Règle A) est **supprimée** : c'était le
principal moteur de thésaurisation, et elle est inutile puisque la défense est désormais
proactive (on blinde avant d'être en danger, on ne garde pas une cagnotte « au cas où »). Le bot
peut descendre son solde jusqu'à 0.

#### 1.3.3 Priorité DÉFENSE (court-circuite le gate)

> **S'il existe une pièce alliée attaquable par l'humain au prochain coup** (c.-à-d. il existe un
> coup adverse légal qui la capture — *pas* `coupsLegaux == []`, qui désignait à tort une pièce
> bloquée en v1), **et** qu'une carte de blindage compatible est abordable, **acheter ce
> blindage**, quel que soit le gate, tant que la bande autorise encore un achat ce tour.

Correspondance pièce → carte de blindage (absorbe la 1re capture), et **ordre de priorité par
valeur décroissante** :

| Pièce menacée | Carte de blindage | Coût | Condition d'achat défensif |
|---|---|---|---|
| Dame (Q) | Couronne | 9 | Toujours si abordable (bande ≥ 4… soit solde ≥ 9). |
| Tour (R) | Forteresse | 8 | Toujours si abordable. |
| Cavalier (N) | Monture blindée | 7 | Toujours si abordable. |
| Fou (B) | *(aucune)* | — | **Pas d'achat défensif possible** (le catalogue Fou n'a pas de blindage) → le bot compte sur le **déplacement** de la pièce (recherche de coup). |
| Pion (P) | Bouclier de fantassin | 6 | Seulement si **solde ≥ 12** (un pion vaut 1 : on ne blinde un pion que si l'or est abondant). |

Si plusieurs pièces sont menacées, on protège d'abord la plus chère (Q > R > N > P). Une seule
carte de blindage par pièce (déjà dans le catalogue : chaque type n'a qu'un blindage). Le roi
menacé ne relève pas de cette table (ses cartes de survie — Sacrifice, Décret — sont des pouvoirs
actifs, hors-scope §1.3.5) : le bot défend son roi **par le coup** (l'éval KING_SAFETY / MATERIEL
roi = 100 y pousse fortement).

#### 1.3.4 Choix de la carte — QUELLE carte (diffère par niveau)

Construction des **candidats** (identique aux 3 niveaux) :
```
candidats = []
pour chaque pièce alliée p ayant < 2 améliorations (plafond GDD §5.3):
  pour chaque carte c du catalogue de type(p) que p ne possède pas encore:
    si coût(c) ≤ solde courant:
      gainEval = eval(appliquerAchat(state, p, c), ai) - eval(state, ai)
      candidats.push({ p, c, cout: coût(c), gainEval })
```

Puis, par niveau :
- **Débutant** : parmi les candidats **passant le gate de la bande** (§1.3.2), choisir **au hasard
  (uniforme)**. La priorité DÉFENSE (§1.3.3) reste **forcée** (si un blindage défensif existe et
  est abordable, on le prend, sans tirage). → bot dépensier mais au choix chaotique.
- **Intermédiaire & Avancé** : parmi les candidats passant le gate, choisir **`argmax gainEval`**
  (départage à égalité : la carte la moins chère, puis aléatoire). DÉFENSE prioritaire de même.

**Boucle multi-achats (les 3 niveaux)** : après chaque achat, recalculer le solde et les
candidats, et **racheter** tant que : (a) le nombre d'achats du tour < max de la bande, **et**
(b) au moins un candidat passe encore le gate (ou une défense reste à couvrir), **et** (c) solde
≥ 4. Sinon, fin de la phase d'achat → passage à la recherche de coup.

#### 1.3.5 Statut des ex-règles A-E

| Règle v1 | Sort en v2 |
|---|---|
| **A** — réserve ≥ 4 écus | **Retirée.** Réserve = 0 (§1.3.2). C'était le frein principal à la dépense. |
| **B** — blindage pièce menacée | **Réécrite** en §1.3.3, avec la **correction de bug** : « menacée » = attaquable au prochain coup adverse, et non `coupsLegaux == []` (pièce bloquée). Ordre Q>R>N/B>P conservé. |
| **C** — pouvoir offensif 50 % au-dessus de 12 | **Retirée.** Remplacée par les bandes de solde (§1.3.2), qui déclenchent l'achat de façon déterministe et bien plus fréquente. Le non-déterminisme demandé en v1 est désormais porté par le niveau Débutant (choix aléatoire de carte). |
| **D / E** — activation des pouvoirs actifs | **Hors-scope de ce cycle** (directive utilisateur = fréquence d'achat, pas activation). Le bot **achète** les cartes actives (Ruée, Rayon, Rempart, Téléport, Double coup, Sacrifice, Décret) — elles comptent comme dépense et rapportent un bonus d'éval (§2.4) — **mais ne les DÉCLENCHE jamais** en v1/v2. Limitation connue et assumée. À traiter dans un cycle dédié « IA — pouvoirs actifs » ultérieur. **Non exigé ici.** |

### 1.4 UX mode selector — **Menu d'accueil avant la partie, 2+1 boutons**

**Décision** : nouvelle **vue d'accueil** occupant tout le canvas (overlay opaque par-dessus
le plateau vide), avec **3 boutons verticaux** :

```
       ♞ ROYCHEC
   Choisissez un mode de jeu

   ┌──────────────────────────┐
   │  1J VS 2J   (HOT-SEAT)   │  ← bouton principal, dorure ambre
   └──────────────────────────┘

   ┌──────────────────────────┐
   │  VS ORDINATEUR            │  ← bouton secondaire, sauge
   └──────────────────────────┘
   ┌──────────────────────────┐
   │  DÉBUTANT  |  INTERM.  |  AVANCÉ │  ← sous-boutons du second (3 chips pastel)
   └──────────────────────────┘

       Coup d'essai (aide-mémoire)
       ↪ capture du roi = victoire
```

**Justifications empilées** :
- **Texte français capitalisé** (cohérence DA), longueur max 18 caractères (« VS ORDINATEUR » = 13 ; « 1J VS 2J » = 8 ; conforme aux boutons existants).
- **Sous-boutons chip pastel** pour la difficulté : « DÉBUTANT » (sauge `#9BCB8C`), « INTERMÉDIAIRE » (ambre `#F0B15E`), « AVANCÉ » (terracotta `#B5573F`) — couleurs distinctes inspirées des catégories de cartes (GDD §5.3).
- **Pas de menu déroulant** : chips cliquables directement visibles. (Liste verticale dropdown = 2 clics + scroll, ergonomiquement moins bon.)
- **Layout dans `PANEL_X`** : à droite du plateau, dans la zone HUD actuelle. Pas d'extension de canvas. Si pas assez de place (canvas 980×640 + panneau ~370), le menu peut superposer le plateau (overlay `rgba(237,239,247,0.92)` semi-opaque).
- **L'overlay se ferme au clic du mode** ; `state.mode` est posé, `creerEtat()` est appelé avec ce paramètre, le plateau apparaît.
- **Pas de persistance** v1 (URL hash ou localStorage) : refresh = retour menu. (Cohérent avec le « reset par partie » du GDD §10, ne crée pas de mémoire entre sessions.)
- **Bouton Rejouer (écran de victoire)** reste « NOUVELLE PARTIE » et **retourne au menu d'accueil** (pas relance directe, pour respecter « reset par partie »).

---

## 2. Spécification de la fonction d'évaluation (TERME A — points fixes)

**Signature** : `eval(state, aiPlayer) → number` où `aiPlayer ∈ {0, 1}`.

L'évaluation est calculée du **point de vue de `aiPlayer`** (score positif = bon pour l'IA,
score négatif = bon pour l'humain). Formule :

```
eval = MATERIEL + MENACE + MOBILITE + UPGRADES_EN_JEU + POSITION_PAWN + KING_SAFETY
```

### 2.1 Terme MATERIEL (poids principal)

| Pièce vivante | Valeur de base | Multiplicateur si upgrade | Multiplicateur si shield |
|---|---|---|---|
| Pion | 1.0 | ×1.5 si Vétéran (effet hors MVP, mais le bot peut quand même l'acheter pour la satisfaction) | ×1.0 si shield consommé, ×2.0 si shield actif |
| Cavalier | 3.0 | ×1.3 si Monture (shield) | idem |
| Fou | 3.0 | ×1.4 si Zone (zone = menace passive sur 8 cases) | idem |
| Tour | 5.0 | ×1.7 si Forteresse (8 pts au lieu de 5) | idem |
| Dame | 9.0 | ×1.4 si Couronne (shield) | idem |
| Roi | **100.0** (coefficient énorme — la vie est plus que toute autre chose) | ×1.5 si sacrificeArmed (roi est protégé) | ×1.2 si decreeUsed ou use fait |

Justification 100.0 pour le roi : c'est la « loss averse » classique — perdre le roi = -∞.
Avec ce coefficient, le bot défendra son roi à tout prix, comme un humain le ferait.

### 2.2 Terme MENACE — **replafonné v2 (fix « posturing »)**

> **Réécriture v2 (2026-07-11).** L'audit 11/07 a montré que le `+50` à plat par pièce attaquable
> **dépassait la valeur matérielle d'une dame (9)**. Conséquence : le greedy 1-ply préférait
> *maintenir* une menace (+50) plutôt que *capturer* une pièce gratuite (+9 de matériel). C'est le
> bug de « posturing ». **Correctif tranché : la contribution d'une menace est plafonnée à 30 % de
> la valeur matérielle de la cible** — donc toujours strictement inférieure au gain d'une capture
> réelle (valeur pleine du matériel + écus de capture, GDD §7). Le greedy préfère désormais
> capturer.

```
MENACE =
  + MENACE_ROI (= +12) si l'IA menace de capturer le roi adverse au prochain coup
  + 0.30 × valeurMatérielle(cible)   par pièce adverse attaquable au prochain coup
  - 0.30 × valeurMatérielle(cible)   par pièce alliée attaquable au prochain coup par l'humain
```

où `valeurMatérielle` = barème du GDD §7 (P 1, N 3, B 3, R 5, Q 9). Exemples : menacer une dame
vaut **+2.7** (au lieu de +50), menacer un pion **+0.3**.

**Justification chiffrée :**
- **0.30 × valeur** : une menace est une pression réelle (on la valorise), mais capturer doit
  rester strictement préférable. Capturer une dame rapporte 9 de matériel *permanent* + 9 écus ;
  la menacer ne rapporte que 2.7 → le bot capture. Bug de posturing supprimé sans recherche.
- **Roi = +12** (au lieu de +150) : menacer le roi reste prioritaire (12 > la valeur d'une dame,
  9), donc le bot poursuit le roi ; mais borné, pour ne pas ré-introduire une boucle de posture
  autour du roi. Le mat réel n'a **pas besoin** de ce terme : à la profondeur ≥ 2, la recherche
  voit la capture du roi via le MATERIEL (roi = 100) au nœud feuille. Le +12 n'est qu'un aiguillon
  au niveau greedy (Intermédiaire) ; l'Avancé tranche par lookahead de toute façon.

### 2.3 Terme MOBILITÉ

```
MOBILITE = Σ (coupsLegaux(ai, p).length × w_mob[p.type]) - Σ (coupsLegaux(humain, q).length × w_mob[q.type])
```

avec `w_mob = { Q: 0.3, R: 0.25, N/B: 0.15, P: 0.05, K: 0.0 }`. Le cavalier et le fou ont plus de
mobilité effective au-delà de leur simple compte de coups (ils peuvent sauter). Pondéré modeste
pour ne pas écraser le terme MATERIEL.

### 2.4 Terme UPGRADES_EN_JEU — bonus pour les activations actives

```
+1.5 par Bouclier/Forteresse/Monture/Couronne/shield posé (conservé ou consommé)
+2.0 par Téléportation cooldown = 0 (encore utilisable)
+3.0 par Sacrifice armé (roi protégé à la prochaine capture)
-0.5 par cooldowns longs (>5) actifs (perte d'option stratégique)
+0.5 par amélioration équipée, TOUTES catégories (v2 — incitation à convertir l'or en capacités)
```

> **Ajout v2 (dernière ligne).** Le `+0.5 par amélioration équipée` (cumulable, plafond 2/pièce)
> donne un gain d'éval **positif à toute carte**, y compris les cartes de déplacement (D) qui
> n'apportaient auparavant presque rien à l'éval statique. Effet : le gate de la bande 4-11
> (§1.3.2) se déclenche plus tôt sur les cartes utiles, et le bot cesse de thésauriser faute de
> candidat « rentable ». Le terme reste **symétrique** (il valorise aussi les upgrades adverses en
> négatif), donc n'introduit pas de biais, seulement une préférence générale à s'équiper.

### 2.5 Terme POSITION (pion)

```
+0.1 par pion passé la rangée 4 (pour le bot, -0.1 par pion adverse passé rangée 4)
-0.2 par pion isolé (pas de pion allié sur la même colonne ± 1)
```

Simple, pas critique. Sert juste à éviter que le bot double ses pions s'ils sont cloués.

### 2.6 Terme KING_SAFETY

```
KING_SAFETY = +0.5 par case adjacente libre autour du roi du bot
            -1.0 par pièce adverse à distance cavalier du roi du bot
            +2.0 si sacrificeArmed (protection active)
```

---

## 3. Algorithme de recherche par niveau (TERME B)

> **Note v2** : la sélection **du coup** est inchangée. Seule la **phase d'achat** a bougé — elle
> précède maintenant la recherche de coup (`decideAchats`, §1.3.1) et n'est donc plus mêlée aux
> `coupsPossibles`. Les pseudo-codes ci-dessous sont mis à jour en conséquence.

### 3.1 Niveau 1 « Débutant » — randomisation pondérée

```
decideAchats(state, ai)  // phase d'achat pré-mouvement, choix de carte aléatoire (§1.3.4)
Pour chaque pièce du bot:
  coupsPossibles = [ ...coupsLegaux ]
  si pouvoir actif prêt et cible existe:   // NB: activation = hors-scope v1/v2 (§1.3.5)
    coupsPossibles += [ activation du pouvoir avec cible optimale ]
  si coupsPossibles est non vide:
    choisir aléatoirement 1 coup parmi coupsPossibles (uniforme)
  sinon:
    premier coup légal disponible (fallback)
```

Justification « randomisation » : un humain qui joue contre un random trouve des trous
immédiatement (niveau perçu : très faible). Acceptable comme « débutant ». **La phase d'achat,
elle, n'est PAS relâchée** : le Débutant applique les mêmes bandes de solde anti-thésaurisation
(§1.3.2) — il dépense donc autant (cible ≥ 3 achats/partie), simplement sur des cartes tirées au
hasard. Sans ça, le contraste de gameplay demandé (écus rarement au plafond) ne serait visible
qu'aux niveaux 2-3 ; on le veut **à tous les niveaux**.

### 3.2 Niveau 2 « Intermédiaire » — 1-ply greedy

```
decideAchats(state, ai)  // phase d'achat pré-mouvement, choix argmax gainEval (§1.3.4)
1. Générer TOUS les coups de mouvement possibles sur le plateau (déjà amélioré);
   cardinalité typique: ~40-60 par tour pour le bot.
2. Pour chaque coup, simuler l'état résultant (applyMove).
3. Calculer eval(state_apres, ai).
4. Choisir le coup qui maximise eval.
Si plusieurs coups à égalité → randomiser parmi les 5 meilleurs (évite la rigidité).
```

Algorithme déterministe, complexité linéaire sur les coups (~60). Impl ~80 lignes. Les achats ne
sont plus des candidats de coup (ils ont été résolus en amont par `decideAchats`), ce qui **règle
la timidité v1** : l'achat ne perd plus l'argmax face à un bon déplacement.

### 3.3 Niveau 3 « Avancé » — 2-ply α-β avec extensions

```
decideAchats(state, ai)  // phase d'achat pré-mouvement, choix argmax gainEval (§1.3.4)
function search(state, depth, alpha, beta, ai):
  si depth == 0: return eval(state, ai)
  génère coups de mouvement du joueur actif
  trie par heuristique MVV-LVA:
    1. coups qui capturent le roi (-∞ si coup l'adversaire peut riposter)
    2. coups qui capturent une pièce de valeur ≥ 9 (dame adverse)
    3. captures de valeur >= 5, 3, 3, 1 (par ordre décroissant)
    4. autres coups (coups neutres)
  pour chaque coup:
    score = -search(children, depth-1, -beta, -alpha)
    alpha = max(alpha, score)
    si alpha >= beta: break (β-cut)
  return alpha
```

Profondeur effective : 2 (coup bot → coup humain en réponse). Avec branche ≈ 60, recherche
naïve = 3 600 feuilles. α-β coupe typiquement **75-90 %** → ~500-900 feuilles → 200-500 ms
en pratique sur Chrome desktop. Largement sous le time-out (§4.4).

> **Garde-fou anti-plafond pour l'Avancé** : comme les achats de l'Avancé passent aussi par
> `decideAchats` (partagé), la cible < 10 % de tours au plafond est garantie de la même façon
> qu'aux autres niveaux. En particulier, la bande **26-30 sans gate** (§1.3.2) force la vidange
> même si la recherche de coup, elle, ne « voit » pas l'intérêt de dépenser. C'est volontaire :
> l'anti-thésaurisation est un plancher de comportement, pas une conséquence espérée de l'éval.

**Note 4-ply reportée à post-MVP** : 4-ply × 60 = 12,96 M feuilles naïves, ~1,3 M avec α-β actif.
Impliquerait table de transposition (Zobrist hash) et iterative deepening. **Hors MVP** —
3-ply suffit.

---

## 4. Génération d'un « tour complet » (TERME C — modèle de Move)

### 4.1 Structure `TourIA`

Un tour complet du bot est un objet composite :
```
TourIA {
  achats: [{ target: piece, upgradeId }, ...],  // 0 à N achats (phase decideAchats, §1.3)
  mouvement?: { piece, from:{r,c}, to:{r,c} }, // 0 ou 1 mouvement
  pouvoir?: { piece, activation: 'ruee'|'rayon'|'sacrifice'|'decret'|'rempart',
              cible?:{r,c} }                    // hors-scope v1/v2 : jamais renseigné (§1.3.5)
}
```

> **Maj v2** : `achats` est désormais une **liste** (0 à N, plafonnée par la bande de solde et par
> le max 2/pièce du GDD §5.3), résolue avant le mouvement, et non plus un champ optionnel unique.

**Cas particulier Double coup** : si la dame possède `double-coup` non consommé, le tour peut
contenir **2 mouvements** de la même dame (enchainement). Ceci est rare en v1 — le bot « avancé »
peut le tenter via la recherche α-β sur les coups successifs.

### 4.2 Contraintes d'ordonnancement

```
Phase 1 (decideAchats): 0 à N achats, chacun débité du solde avant le suivant (le solde
   disponible doit couvrir chaque achat). Aucun pouvoir déclenché (hors-scope §1.3.5).
Phase 2 (recherche de coup): 1 mouvement légal sur le plateau amélioré.
```

Justification : ces contraintes **matchés au moteur existant** — si l'IA choisit un combo
illégal, le moteur le rejettera et le bot coincera. La phase d'achat filtre par coût et par
plafond 2/pièce ; la recherche de coup ne travaille que sur des `coupsLegaux` réels.

### 4.3 Actions valides par type de pièce au tour du bot

| Pièce | Mouvement | Achat possible | Pouvoir actif possible |
|---|---|---|---|
| Pion (P) | coupsLegaux + marche arrière si upgrade | Bouclier/Vétéran (forteresse non) | Bouclier : usage unique sur capture (≠ pouvoir actif) — n/a en recherche offensive |
| Cavalier (N) | coupsLegaux | Monture/Ruée/Second galop | Ruée (si prêt) — hors-scope activation §1.3.5 |
| Fou (B) | coupsLegaux + Pas de côté si upgrade | Rayon/Zone | Rayon sacré — hors-scope activation §1.3.5 |
| Tour (R) | coupsLegaux + Pivot si upgrade | Rempart/Forteresse | Rempart — hors-scope activation §1.3.5 |
| Dame (Q) | coupsLegaux + Téléport si upgrade + double coup | Téléport/Double coup/Couronne | Double coup — hors-scope activation §1.3.5 |
| Roi (K) | coupsLegaux + Passe royal si upgrade | Passe royal/Sacrifice/Décret | Sacrifice ; Décret — hors-scope activation §1.3.5 |

### 4.4 Garde-fous (TERME D)

| Risque | Garde-fou |
|---|---|
| Hang / boucle infinie | `setTimeout(800)` (time-guard existant) autour de `search(...)` ; si pas terminé, fallback 1-ply greedy sur le coup déjà calculé |
| Aucun coup légal (bot bloqué) | Logique de fallback : (a) la phase d'achat a déjà pu s'exécuter ; (b) skip du tour avec message HUD « IA passe » |
| King safety check | Avant de retourner eval(), vérifier si le roi du bot est capturable au prochain coup adverse (recherche α-β profondeur 1 sur le rôle inversé). Si oui, eval -= 30 supplémentaire (pénalité au bot qui se met en danger) |
| Stall (3-fold répétition) | Garder un `state.history` (liste des 8 derniers `state.board` hashés) ; si un coup ramène le plateau à un état vu il y a ≤ 6 tours, bannir ce coup de la liste `coupsPossibles` (anti-stall) |
| Boucle d'achat qui ne termine pas | La boucle multi-achats (§1.3.4) est bornée par le max/tour de la bande (≤ 3) ET par le nombre de candidats (fini) ET par solde ≥ 4 ; terminaison garantie |
| Anti-bug | Wrap toute la recherche IA dans un try/catch ; en cas d'exception, fallback 1-ply greedy avec un message d'erreur loggé sur console (ne pas faire planter la partie humaine) |

---

## 5. UX mode selector — détails écran d'accueil (TERME E)

### 5.1 Layout exact (canvas 980×640)

```
┌────────────────────────────────────────────────────────────────┐
│                                                                │
│                                                                │
│                       ♞ ROYCHEC                                │  ← wordmark Archivo Black 36px
│                                                                │
│                  Choisissez un mode de jeu                     │  ← sous-titre Nunito Sans 14px
│                                                                │
│              ┌──────────────────────────────────┐             │
│              │  1J VS 2J  (HOT-SEAT)            │  ← bouton A : 320×52, fond ambre
│              └──────────────────────────────────┘             │
│                                                                │
│              ┌──────────────────────────────────┐             │
│              │  VS ORDINATEUR                   │  ← bouton B : 320×52, fond sauge
│              └──────────────────────────────────┘             │
│                                                                │
│              Débutant  ·  Intermédiaire  ·  Avancé            │  ← 3 chips pastel, 100×32 chacune
│                                                                │
│                                                                │
│              Coup d'essai : capturer le roi gagne              │
│                                                                │
└────────────────────────────────────────────────────────────────┘
```

Centroïde `(490, 320)`. Largeur bouton 320, hauteur 52. Chips en dessous (y=420), espacement
24px entre eux. Couleurs :

- Bouton A (PvP) : fond `C_AMBRE` (#e7bd14) - ombre plate décalée `#B99510` (DA §11.4.a)
- Bouton B (PvAI) : fond `C_SAUGE` (#ADCBA6) - ombre plate décalée `#5E8A52`
- Chips difficulté :
  - **Débutant** : fond `COULEUR_CAT.S` (#9BCB8C), texte `#1A1A1A`
  - **Intermédiaire** : fond `COULEUR_CAT.A` (#F0B15E), texte `#2B1D06`
  - **Avancé** : fond `C_TERRACOTTA` (#B5573F), texte `#FFFFFF`

### 5.2 Interaction et feedback

- **Hover** : opacité passe de 1.0 → 0.85, transition 100 ms (cohérent avec charte existante).
- **Clic** : flash doré 200 ms (`_goldT = performance.now()`), puis transition vers le plateau :
  - `state.mode = 'pvp'` (PvP actuel) → `creerEtat()` puis `render(...)`.
  - `state.mode = 'pvai', state.ai = { player: 1, depth: 1|2|3 }` → `creerEtat()` puis `render(...)`.
  - `state.selected = null` ; `state.phase = 'play'`.

### 5.3 Reset et recommencer

- Bouton « NOUVELLE PARTIE » actuel sur l'écran de victoire (DA §11.5) **retourne au menu
  d'accueil** au lieu de relancer direct. Le porteur de clic vérifie `state.mode` :
  - Si `state.mode === 'pvp'` → retour accueil.
  - Si `state.mode === 'pvai'` → retour accueil (le choix de difficulté est conservé en
    mémoire pour la session).
- **Pourquoi** : conforme à la philosophy GDD §10 « reset par partie » — chaque partie est
  une nouvelle décision (mode, difficulté). Évite aussi d'oublier le menu après 4 parties.

### 5.4 Persistance

**Pas de persistance v1**. Pas d'URL hash, pas de localStorage. Chaque refresh de page
retourne au menu. Justification : ça reste un MVP local. La persistance (et notamment le
score/trophées) relève de la Voie des Trophées (GDD §10), déjà hors MVP.

---

## 6. Compatibilité avec le moteur existant (TERME F)

### 6.1 Modifications nécessaires (à passer à gameplay-dev ensuite)

| Layer | Changement | Risque |
|---|---|---|
| `ai.js` — **phase d'achat (v2, priorité)** | **Extraire la décision d'achat dans une fonction dédiée `decideAchats(state, ai)` appelée UNE fois au début du tour du bot, AVANT la sélection du coup** (§1.3.1). Elle implémente les bandes de solde (§1.3.2), la priorité défense (§1.3.3) et la boucle multi-achats (§1.3.4). **Retirer** l'ancienne logique d'achat émergente (achat-en-coup-complet). | **Moyen** : c'est le cœur de l'amendement v2. Régler d'abord ceci, tester la métrique « achats/partie » et « % tours au plafond » (§1.3.0). |
| `ai.js` — **éval MENACE (v2)** | Remplacer le `+50/-50` à plat par `±0.30 × valeurMatérielle(cible)` et le `+150` roi par `+12` (§2.2). | Faible : constantes. Vérifier que le greedy capture désormais une pièce gratuite (non-régression du posturing). |
| `ai.js` — **éval UPGRADES (v2)** | Ajouter `+0.5 par amélioration équipée, toutes catégories` (§2.4). | Faible : une ligne, symétrique. |
| `state` (board.js / main.js) | Ajouter `state.mode = 'pvp'` par défaut, `state.ai = null` par défaut | Basique : ajouter les champs dans `creerEtat()` |
| `main.js` — boucle de tour | Hook post-`finDeTour()` : si `state.mode === 'pvai' && state.turn === state.ai.player` → planifier un coup IA via `requestAnimationFrame` (asynchrone) | Faible : brancher conditionnellement sur `state.ai` |
| `main.js` — affichage | Pendant le tour IA, afficher badge « L'IA RÉFLÉCHIT… » | Moyen : ajouter `state.ai.thinking` |
| `render.js` — surligner le coup | Avant `jouerCoup`, surligner la case cible (anneau cyan pulsé 500 ms) | Moyen : `state.highlightAI` |
| `index.html` | Importer `ai.js` en module | Basique |

### 6.2 Pas de modification nécessaire

- `board.js` — la structure `state` reste compatible via ajout de champs optionnels.
- `rules.js` — `coupsLegaux`, `ciblesRuee`, `ciblesRayon` sont **réutilisés tels quels** comme
  fournisseurs de coups pour l'IA (DRY strict, pas de duplication).
- `constants.js` — aucune modification. L'IA consulte `UPGRADES`, `VALEUR_PIECE`, etc. en lecture.

### 6.3 Régression à surveiller

Le test critique de non-régression : **le mode PvP actuel ne doit pas être modifié**. La clause
critique est dans `creerEtat()` (où `state.mode = 'pvp'` par défaut) et la garde
`if (state.mode === 'pvai' && state.turn === state.ai.player)` dans la boucle de tour. Si la
garde est bien testée, le mode PvP est rendu **structurellement** impossible d'être affecté par
le code IA. **Ajout v2** : l'éval MENACE et UPGRADES étant partagées, vérifier qu'aucune
régression de force de jeu (le bot doit toujours capturer les pièces gratuites — c'est justement
ce que le fix §2.2 améliore).

---

## 7. Tests minimaux à prévoir (TERME G — pour QA post-implémentation)

| # | Scénario | Statut attendu |
|---|---|---|
| QA-IA-01 | L'IA joue un coup légal aléatoire au niveau 1 sur plateau initial | ✅ coup joué, `state.board` modifié, `state.turn` alterné |
| QA-IA-02 | Au niveau 2, l'IA achète Forteresse/Couronne/Monture sur une pièce menacée (§1.3.3) quand abordable | ✅ pièce blindée, shield actif |
| QA-IA-03 | Au niveau 3, l'IA détecte le mat imminent (capture roi 1 coup) et joue la défense | ✅ roi sauvé |
| QA-IA-04 | Le greedy (niveau 2) capture une dame gratuite au lieu de « posturer » (non-régression §2.2) | ✅ capture jouée, matériel gagné |
| QA-IA-05 | **Anti-thésaurisation (v2)** : sur 30 parties auto-jouées niveau Interm./Avancé, écus au plafond 30 sur < 10 % des tours-IA ET ≥ 5 achats/partie | ✅ métriques §1.3.0 tenues |
| QA-IA-06 | **Anti-thésaurisation Débutant (v2)** : ≥ 3 achats/partie, plafond sur < 15 % des tours | ✅ métriques §1.3.0 tenues |
| QA-IA-07 | Quand l'IA n'a aucun coup légal (roi bloqué), elle log un message et skip proprement | ✅ pas de crash |
| QA-IA-08 | Le time-guard 800 ms fonctionne : si la recherche explose, fallback 1-ply greedy | ✅ coup joué, log `[AI]` |
| QA-IA-09 | Le mode PvP actuel continue de fonctionner EXACTEMENT comme avant (régression critique) | ✅ tests QA04 restent PASS |

Critères PASS :
- **0 régression silencieuse** sur les scénarios QA04.
- **0 crash** sur 100 coups IA consécutifs.
- **Métriques d'achat v2 tenues** (QA-IA-05 / QA-IA-06) — c'est le critère central de cet amendement.
- **Ratio de parties gagnées par le bot** vs joueur humain moyen (au moins 50 % en Avancé).

---

## 8. Hors-périmètre v1/v2 (roadmap post-cycle)

- **Activation des pouvoirs actifs (ex-règles D/E)** : le bot achète mais ne déclenche pas
  Ruée/Rayon/Rempart/Téléport/Double coup/Sacrifice/Décret. Cycle dédié ultérieur (§1.3.5).
- Choix du camp de l'IA (toujours J2) — laisser le choix v2+ si la communauté le demande.
- Mode adaptatif (la difficulté monte quand l'humain gagne) — v2+ si demande forte.
- IA « pédagogique » qui explique son coup après l'avoir joué — v3 (tutoriel).
- IA qui joue J1 aussi (mode « humain perd ») — peut être ajouté après v1, ~1 jour.
- Endgame tablebase (positions pré-calculées roi + 2-3 pièces) — hors scope.

---

## 9. Tranchés — résumé

| Question | Décision |
|---|---|
| Niveau de difficulté | 3 niveaux fixes (Débutant 1-ply / Intermédiaire 2-ply / Avancé 3-ply avec α-β) |
| Camp de l'IA | Joueur 2 (Corail) fixe — humain reste J1 |
| **Stratégie d'achat (v2)** | **Politique de dépense chiffrée par bandes de solde (gate décroissant, urgence à l'approche du plafond 30), réserve = 0, achat = phase pré-mouvement dédiée. Priorité : défense pièce menacée > amélioration argmax > opportuniste. Cibles : < 10 % de tours au plafond, ≥ 5 achats/partie (≥ 3 en Débutant). Anti-thésaurisation appliquée aux 3 niveaux.** |
| **Poids MENACE (v2)** | **±0.30 × valeur matérielle de la cible (plafonné sous la valeur de capture) ; roi = +12. Supprime le posturing du greedy.** |
| Pouvoirs actifs (D/E) | Hors-scope de ce cycle : le bot les achète, ne les déclenche pas. |
| UX mode selector | Menu d'accueil 2 boutons (PvP / PvAI) + 3 chips pastel de difficulté, pas de persistance v1 |

Le moteur existant est **réutilisé tel quel** (coupsLegaux, ciblesRuee, ciblesRayon,
state, gagnerEcus, ValPiece). Les ajouts v2 sont concentrés dans `ai.js` : `decideAchats`
(phase d'achat), 3 constantes d'éval revues (§2.2, §2.4). Aucun nouveau système ni nouvelle
carte (catalogue et économie GDD inchangés).
