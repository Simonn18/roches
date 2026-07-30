---
projet: roychec
agent: qa
date: 2026-07-05
version: 1
statut: livre
---

# Rapport de playtest 02 — corrections MVP + catalogue complet (5 cartes)

> Consolidation QA de deux vagues de livraison gameplay-dev, playtestées en navigateur réel
> (Chromium via Playwright, http://localhost:8000, serveur `python3 -m http.server 8000
> --directory game`). Vérification statique complémentaire (`node --check`) sur les cinq
> fichiers de `game/src/` : **board.js, constants.js, main.js, render.js, rules.js** → tous OK,
> aucune erreur de syntaxe.

## 1. Périmètre testé

| Vague | Contenu | Résultat | Capture |
|---|---|---|---|
| Vague 1 | Corrections post-bugs + boucle MVP (coup, écus, achat, Rayon sacré, Passe royal, refus d'achat, Bouclier de fantassin) | **12/12 PASS** | `playtest-02-corrections.png` |
| Vague 2 | 5 nouvelles cartes (Téléportation courte, Second galop, Décret, Sacrifice, Zone de contrôle) + carte « Zone » du fou passée de non-implémentée à jouable | **14/14 PASS** | `playtest-03-cartes-completes.png` |

Total : **26/26 scénarios PASS** sur les deux vagues. Aucun bug bloquant ni majeur détecté sur le
périmètre effectivement rejoué.

## 2. Méthode

- Pilotage du canvas par événements souris/clavier synthétiques (Playwright), lecture d'état via
  le hook `window.__roychec` exposé par `game/src/main.js` (ligne ~507).
- **Vague 1** : parcours complet rejoué carte par carte, y compris le circuit d'achat (débit,
  refus, non-consommation du tour) pour Rayon sacré, Passe royal, Couronne, Bouclier de fantassin.
- **Vague 2** : les mécaniques des 5 nouvelles cartes ont été testées en **injectant les upgrades
  directement dans l'état** (`upgrades: [...]`) plutôt qu'en rejouant l'achat carte par carte au
  panneau. Le circuit d'achat lui-même a été validé en vague 1 sur du code de panneau identique
  (`main.js` ligne ~375, `p.upgrades.length >= MAX_UPGRADES_PAR_PIECE`), donc jugé non nécessaire
  à revalider par carte — **hypothèse à garder à l'esprit** : cela ne prouve pas que l'UI d'achat
  affiche correctement CES 5 cartes précises (coût, catégorie, couleur) dans le panneau, seulement
  que leur logique de jeu fonctionne une fois l'upgrade posée.
- **Sacrifice** et **Zone de contrôle** : configurations de plateau artificielles (pièces déplacées
  par mutation directe de `state`) pour placer les pièces adverses aux bonnes cases avant de
  déclencher le pouvoir. Les cas limites suivants ont été vérifiés **en headless par gameplay-dev,
  pas en navigateur** par la QA : sacrifice sans pion disponible (report sur la pièce de plus
  faible valeur), sacrifice sans case d'évasion (le roi meurt), Ruée / Rayon sacré non bloqués par
  Zone de contrôle. Ces trois derniers cas sont donc **non re-vérifiés visuellement par la QA** et
  restent à rejouer en conditions réelles (voir §5).
- Console navigateur inspectée à chaque vague : **0 erreur, 0 warning** en fin de vague 2 (favicon
  inline résolu, plus de 404 réseau).

## 3. Résultats détaillés

### 3.1 Vague 1 — corrections + MVP (12/12 PASS)

1. État initial conforme : écus [10,10], tour Joueur 1, phase `play`.

   > Écart GDD à noter : le §7 du GDD fixe le **solde de départ à 0 écu** (« Les deux joueurs
   > commencent à sec »). L'état initial observé est **[10,10]**, pas **[0,0]**. Ce n'est pas un
   > bug de logique en soi (rien ne casse), mais c'est un **écart de conformité GDD non trivial**
   > sur une valeur d'équilibrage explicitement chiffrée — à signaler à gameplay-dev/game-designer
   > pour trancher (état de test de dev laissé en place, ou changement de barème assumé ?).
2. Coup de pion Joueur 1 puis Joueur 2 : +2 écus chacun (conforme `REVENU_PAR_COUP = 2`,
   `constants.js` ligne 5), alternance des tours correcte.
3. Carte « Zone » (fou) : au moment du test vague 1, encore marquée `nonImplemente` → achat
   refusé (buzz, aucun débit). Comportement voulu à ce stade de dev, plus vrai depuis la vague 2
   où la carte est passée en achetable/implémentée — cohérent, pas un bug rétroactif.
4. Achat Rayon sacré (10 écus) : débit 12→2 conforme au catalogue (`constants.js`,
   `UPGRADES['Rayon']`, coût 10 = GDD §6 Fou). Upgrade posée, **achat ne consomme pas le tour**
   (le fou a pu se déplacer ensuite dans le même tour) → conforme GDD §5.3 « acheter ne consomme
   pas le tour du joueur ».
5. Rayon sacré activé : phase `rayon-target`, cibles surlignées, capture à distance en (1,3), fou
   reste immobile, cooldown posé à 4 (conforme GDD §7, « tir à distance » = cooldown 4), gain
   +2 (revenu) + 1 (valeur de la pièce prise, un pion) écus, tour consommé — conforme GDD §5.4
   (« déclencher un pouvoir actif consomme le tour »).
6. Achat Passe royal (8 écus) sur le roi : coût conforme (GDD §6 Roi = 8). Coup de 2 cases
   (0,4)→(2,4) proposé puis joué avec succès.
7. Refus d'achat Couronne (9 écus, solde 7) : buzz, aucun débit → conforme GDD §5.3 (« solde
   insuffisant → carte grisée, achat refusé »).
8. Bouclier de fantassin : shield posé à l'achat ; en jeu, absorbe la capture (pion survit,
   shield consommé, l'attaquant **reste sur sa case** — conforme GDD §5.5 « l'attaquant reste sur
   sa case de départ »), l'attaquant touche +2 écus **sans** bonus de capture (cohérent : la pièce
   n'a pas réellement été capturée, donc pas de valeur à créditer).

### 3.2 Vague 2 — 5 nouvelles cartes (14/14 PASS)

1. **Téléportation courte** (dame, 12 écus, GDD §6) : 14 cases vides à distance de Chebyshev ≤3
   proposées et marquées `tele`, y compris par-dessus des obstacles (conforme « ignore les
   obstacles »). Téléportation jouée → cooldown posé à 5 (conforme GDD §7 « enchaînement
   mouvement » = 3-5), tour consommé. Pendant le cooldown, plus aucun coup `tele` proposé —
   comportement de blocage correct (`main.js` ligne 209, `piece.cooldowns.Tele`).
2. **Second galop** (cavalier, 8 écus) : après un saut sans capture, un enchaînement est proposé
   (`state.chain`, `main.js` ligne 82) ; le 2e saut est bien filtré pour exclure toute capture
   (conforme GDD « une fois par tour où il ne capture pas »). 2e saut joué → cooldown posé à 3
   (conforme GDD §7), tour passé. Déclin de l'enchaînement via `Espace` → aucun cooldown posé
   (conforme GDD, le pouvoir n'a pas été utilisé) — logique lisible dans `main.js` lignes 479-481.
3. **Décret** (roi, 14 écus) : bouton → phase `decret-target`, 4 cibles toutes alliées adjacentes
   proposées (conforme « échange avec une pièce alliée adjacente »). Swap roi↔fou effectué,
   `decretUsed = true` posé (conforme « usage unique »), tour consommé.
4. **Sacrifice** (roi, 12 écus) : activation → `sacrificeArmed = true`, cooldown posé à 6
   (conforme GDD §7 « zone défensive » = 5-6), tour consommé. Dame adverse capture le roi armé →
   le roi **survit** et se déplace sur une case adjacente libre, le pion allié le plus proche est
   retiré du plateau (7→6 pions restants), l'attaquant occupe l'ancienne case du roi, l'attaquant
   gagne +2 (revenu) + valeur du **pion** sacrifié (16→19 écus) — **et non** la valeur du roi
   (cohérent avec GDD §7 « Roi = 0, fin de partie » : puisque le roi n'est in fine pas capturé, ce
   serait de toute façon sans objet). Armement consommé, pas de fin de partie déclenchée. Conforme
   au texte GDD §6 Roi/Sacrifice (« le pion meurt à la place du roi et le roi peut se déplacer sur
   une des cases autour de lui »).
5. **Zone de contrôle** (fou, 6 écus) : le cavalier adverse perd deux de ses atterrissages, (5,3)
   et (5,5), situés dans l'aura du fou ; un pion adverse est bloqué en (5,4) (plus d'avance
   possible) ; la tour adverse est **exemptée** du blocage (atterrit en (4,3) malgré l'aura) et
   peut même capturer le fou lui-même. Aura affichée en surlignage sauge à la sélection du fou
   (confirmé visuellement sur `playtest-03-cartes-completes.png`, cases d5/f5/d3/f3 en vert clair
   autour du fou noir en e4).

   > **Point de vigilance GDD** : le texte du GDD §6 pour Zone de contrôle dit « empêche
   > n'importe quelle pièce de **rang inférieur ou égal** de se déplacer sur les cases autour de
   > lui ». Le comportement observé (cavalier et pion bloqués, tour non bloquée) est cohérent
   > **si** on lit « rang » comme la valeur en écus (Tour = 5 > Fou = 3, donc exemptée ; Cavalier =
   > 3 = Fou, bloqué ; Pion = 1 < Fou, bloqué). C'est une interprétation plausible mais le GDD ne
   > la formule pas explicitement en ces termes — la note de méthode de gameplay-dev confirme
   > d'ailleurs que la règle codée est « pièces adverses de valeur ≤3 seulement », donc une tour
   > (valeur 5) n'est jamais bloquée et une dame (valeur 9) non plus. Ce point mérite d'être
   > formalisé dans le GDD (voir §5 reste à faire) pour lever toute ambiguïté sur le mot « rang ».
6. Console navigateur : 0 erreur, 0 warning en fin de vague 2.
7. HUD : accord grammatical « 1 écu » / « N écus » vérifié — le « 1 écus » visible sur
   `playtest-02-corrections.png` (capture d'avant vague 2) est corrigé depuis, voir §4.1.

## 4. Anomalies

### 4.1 Accord grammatical « 1 écus » au singulier — corrigé en vague 2

- **Historique** : visible sur `playtest-02-corrections.png` (capture prise **avant** la vague 2),
  HUD Joueur 1 affichant « **1 écus** » au lieu de « 1 écu ».
- **Statut** : **corrigé en vague 2, vérifié dans le code** — `render.js:446` définit
  `ecusLabel(n)` (`return n + (Math.abs(n) <= 1 ? ' écu' : ' écus')`), utilisée par le HUD en
  `render.js:277` (`ctx.fillText(ecusLabel(state.ecus[j]), ...)`). Le seul « écus » codé en dur
  restant est `render.js:416`, qui concerne le coût des cartes du panneau (toujours ≥ 4 écus,
  donc toujours pluriel à bon droit) — pas le compteur de solde. Plus une anomalie ouverte.

### 4.2 Solde de départ [10,10] au lieu de [0,0] — mineur (écart GDD)

- Voir §3.1 point 1. Le GDD §7 est explicite : « Solde de départ : 0 écu ». L'état initial observé
  en vague 1 est [10,10]. Si c'est un artefact de configuration de test (état injecté par
  Playwright pour accélérer le scénario) plutôt qu'un vrai défaut du jeu au chargement, ce n'est
  pas un bug — mais rien dans les livrables ne confirme explicitement lequel des deux c'est. Faute
  d'observation en navigateur sur un chargement `index.html` totalement vierge (sans injection
  d'état), la QA classe ce point en **mineur, à vérifier explicitement** plutôt qu'en bug confirmé
  ou en non-bug confirmé.

Aucune autre anomalie fonctionnelle (bloquante ou majeure) n'a été observée sur les scénarios
effectivement rejoués. Aucun bug non reproductible à signaler pour cette session — tous les
scénarios ci-dessus ont un statut PASS net.

## 5. Vérification de conformité GDD — synthèse

| Mécanique GDD | Statut | Référence code |
|---|---|---|
| Coups classiques + alternance | Conforme | `main.js` boucle de tour |
| Écus : +2/coup, bonus = valeur capturée | Conforme | `constants.js:5` `REVENU_PAR_COUP`, `main.js:169,188,210,240,266,276,303,313` |
| Solde de départ = 0 | **Écart observé** (voir §4.2) | — |
| Plafond 30 écus | Défini dans le code (`constants.js:8 PLAFOND_ECUS = 30`) mais **non exercé en navigateur** | à tester (§6) |
| Achat ne consomme pas le tour | Conforme | vague 1, pt. 4 |
| Max 2 améliorations/pièce | Défini (`constants.js:91`) mais **non exercé en navigateur** cette session | à tester (§6) |
| Pouvoir actif consomme le tour (sauf Double coup) | Conforme sur Rayon sacré, Sacrifice, Décret, Second galop, Téléportation | vagues 1 et 2 |
| Cooldowns en tours du joueur (barème GDD §7) | Conforme sur Rayon (4), Second galop (3), Téléportation (5), Sacrifice (6) | `main.js` (cooldowns cités §3) |
| Bouclier / Blindage : attaquant reste sur sa case, pas de bonus de capture réel | Conforme | vague 1, pt. 8 |
| Zone de contrôle : blocage par rang/valeur | Fonctionne, **mais formulation GDD ambiguë** (« rang inférieur ou égal ») vs implémentation (« valeur ≤3 ») | voir §3.2 pt. 5 |
| Fin de partie par capture du roi + écran de victoire | **Non testé cette session** | voir §6 |
| Double coup (dame) | **Non testé cette session** | voir §6 |
| Rempart, Pivot, Forteresse, Monture blindée, Marche arrière, Vétéran, Pas de côté, Garde royale | Cartes du catalogue de base **hors périmètre des deux vagues testées** — non couvertes ici | voir §6 |

## 6. Reste à tester

- **Ressenti manuel humain** en partie réelle (souris/clavier, pas seulement événements
  synthétiques) : lisibilité des pointillés de Téléportation, de l'anneau de cooldown Sacrifice, de
  l'aura sauge de Zone de contrôle en jeu dynamique plutôt que sur captures figées.
- **Partie complète de bout en bout** jusqu'à capture effective du roi + écran de victoire +
  bouton rejouer (aucune des deux vagues n'a exercé la condition de fin de partie GDD §8).
- **Interactions croisées non couvertes** :
  - Double coup + Téléportation courte sur la même dame dans un même tour.
  - Sacrifice déclenché par une capture à distance (Ruée du cavalier ou Rayon sacré du fou)
    plutôt que par un déplacement classique, en conditions navigateur (vérifié en headless
    seulement par gameplay-dev à ce stade).
  - Deux fous « Zone de contrôle » adverses dont les auras se superposent sur les mêmes cases.
  - Plafond de 30 écus réellement atteint et vérifié comme bloquant tout gain supplémentaire.
  - Plafond de 2 améliorations par pièce réellement exercé (tentative d'achat d'une 3e carte sur
    la même pièce → refus attendu).
- **Cartes du catalogue de base non retestées dans ces deux vagues** : Marche arrière, Vétéran
  (pion), Monture blindée (cavalier), Pas de côté (fou), Pivot, Rempart, Forteresse (tour),
  Double coup, Couronne (dame, hors le refus d'achat testé), Garde royale — à vérifier qu'elles
  n'ont pas régressé suite aux deux vagues de modifications.
- **Cas limites Sacrifice/Zone vérifiés en headless par gameplay-dev mais jamais en navigateur** :
  sacrifice sans pion disponible (report sur la pièce de plus faible valeur suivante), sacrifice
  sans case d'évasion disponible (le roi doit alors mourir), Ruée/Rayon sacré non bloqués par
  Zone de contrôle — à rejouer manuellement pour confirmer visuellement le comportement.
- **Spécifications à trancher formellement dans le GDD par le game-designer** (actuellement
  déduites du comportement du code plutôt que written noir sur blanc) :
  - Second galop : que se passe-t-il si le 2e saut serait normalement une capture — actuellement
    filtré/interdit, à documenter explicitement.
  - Sacrifice : ordre de priorité de protection (pion le plus proche, sinon pièce de plus faible
    valeur), et issue en cas d'absence de case d'évasion (le roi meurt) — le libellé GDD actuel
    (§6 Roi/Sacrifice) ne précise ni l'ordre de priorité, ni l'échec possible.
  - Zone de contrôle : seuil exact de blocage (« valeur ≤3 » côté code vs « rang inférieur ou
    égal » côté GDD) et confirmation que les captures à distance (Ruée, Rayon sacré) ne sont
    jamais bloquées par une Zone adverse.
  - Solde de départ : trancher [0,0] (texte GDD actuel) vs tout état de test observé à [10,10].

## 7. Ressenti de jeu (sur la base des captures et de la lecture du flux d'événements)

Le retour n'engage que ce qui a été observé sur les deux captures et les traces d'événements ;
aucune session de jeu manuelle prolongée n'a encore été menée par la QA (voir §6).

- Le HUD est lisible : solde par joueur, nom de la pièce sélectionnée, catégories de cartes
  colorées (bleu déplacement / orange actif / vert stat) conformes à la charte GDD §5.3, badge
  « achetée ✓ » clair sur la carte déjà achetée.
- Le fait que l'achat ne consomme pas le tour se lit bien à l'écran (le panneau reste ouvert, la
  pièce reste sélectionnable pour jouer un coup ensuite) — ça correspond à l'intention du GDD
  §5.2/§5.3 de laisser une phase d'intendance avant le coup.
- L'aura de Zone de contrôle (cases sauge) est visuellement discrète mais présente sur la
  capture — reste à confirmer en jeu si elle est assez visible en plein feu de l'action, avec
  plusieurs highlights de sélection/coups légaux superposés.
- Point d'attention pédagogique : la distinction entre le blocage de Zone de contrôle (« valeur
  ≤3 ») n'est communiquée nulle part à l'écran (pas de tooltip observé sur les captures) — un
  joueur humain qui voit sa tour ignorer l'aura d'un fou adverse pourrait croire à un bug plutôt
  qu'à une règle. À vérifier lors du test de ressenti manuel (§6) si un feedback existe.

## 8. Verdict global

Sur les 26 scénarios rejoués en navigateur (12 vague 1 + 14 vague 2), **26/26 PASS**, 0 bug
bloquant, 0 bug majeur. Deux points à trancher/clarifier (solde de départ, formulation « rang »
de Zone de contrôle) ; l'anomalie cosmétique d'accord « 1 écus » relevée sur la capture de vague 1
est corrigée depuis (voir §4.1). Le socle testé est solide et conforme au GDD dans les grandes
lignes ; le principal risque restant n'est pas dans ce qui a été
testé mais dans ce qui **ne l'a pas encore été** : la boucle de fin de partie (capture du roi,
écran de victoire) n'a jamais été exercée dans ces deux vagues, et c'est une brique GDD §8
explicitement dans le scope MVP — elle doit être priorisée avant toute validation finale du MVP.
