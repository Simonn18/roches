---
projet: roychec
agent: qa
date: 2026-07-06
version: 1
statut: livre
---

# Rapport de playtest 03 — non-régression ciblée sur le « reste à tester » du rapport 02

> Playtest en navigateur réel (Chromium 149 / Playwright 1.61, piloté depuis `game/src/`
> tel quel, serveur `python3 -m http.server 8000 --directory game`). Aucune validation sur
> lecture de code seule : chaque verdict ci-dessous vient d'un clic souris réel (position
> pixel calculée depuis le `boundingBox()` du canvas, comme un vrai joueur) ou, quand précisé
> explicitement, d'une mutation directe de `window.__roychec.state` pour poser un décor de
> test (même technique acceptée en rapport 02 §2), suivie d'un clic réel pour l'action jouée.
> Console navigateur inspectée à chaque script : **0 erreur, 0 warning** sur l'ensemble de la
> session — voir §4 pour la portée de ce constat (les régressions trouvées sont **silencieuses**,
> aucune ne lève d'exception).

## 1. Périmètre testé (exactement le §6 du rapport 02)

| # | Scénario mandaté | Résultat |
|---|---|---|
| 1 | Boucle de fin de partie (capture du roi → écran de victoire → rejouer) | **PASS** |
| 2 | Solde de départ sur chargement vierge : 0 ou 10 ? | **Tranché : 10, confirmé bug/écart réel** |
| 3 | Plafond 30 écus + refus 3e amélioration/pièce | **PASS** (les deux) |
| 4 | Cartes de base non retestées (9 cartes) | **5 PASS / 4 FAIL** (voir détail §3.4) |
| 5 | Cas limites navigateur (Sacrifice, Ruée/Rayon vs Zone) | **Ruée : PASS** · **Rayon : bloqué (bouton mort)** · **Sacrifice : FAIL total, cas limites sans objet** |

Verdict résumé en une phrase : **la boucle MVP centrale (coups, écus, achat, fin de partie,
plafonds) tient parfaitement, mais une bonne moitié du catalogue d'améliorations est
silencieusement non fonctionnelle dans `game/src/main.js` actuel** — régression sévère par
rapport à ce que le rapport 02 avait confirmé PASS sur les mêmes cartes.

## 2. Méthode

- Serveur : `python3 -m http.server 8000 --directory game`.
- Pilotage : Playwright (Chromium local déjà en cache `~/Library/Caches/ms-playwright`,
  installé via `npx playwright@1.61.1` dans un dossier scratch, aucune dépendance ajoutée
  au dépôt).
- Clics réels : coordonnées calculées depuis `#jeu.boundingBox()` (position + échelle CSS
  réelle du canvas dans la page), pas de coordonnées canvas brutes — un vrai clic souris
  passe par `rect.left/top` exactement comme documenté dans `main.js` (`souris(e)`).
- Setup de décor accéléré par mutation directe de `window.__roychec.state` (le getter
  exposé renvoie l'objet live, donc `state.ecus[0] = 29` ou `state.board[r][c] = {...}`
  modifie réellement la partie en cours) — **uniquement pour positionner des pièces ou un
  solde avant l'action testée**, jamais pour simuler l'action elle-même. L'action mesurée
  (achat, coup, capture, clic de bouton) est toujours un événement souris réel.
- Chaque script Node dédié à un scénario, résultats lus via `window.__roychec.state` après
  chaque étape, captures d'écran prises aux points clés.
- 18 scripts de test exécutés dans cette session (fin de partie, solde de départ, plafonds,
  9 cartes de base, Second Galop, Rayon sacré, Sacrifice, Décret, Ruée + Zone de contrôle,
  Téléportation + cooldown, Zone de contrôle sanity).

## 3. Résultats détaillés

### 3.1 Boucle de fin de partie (priorité 1 du mandat) — PASS

Séquence jouée intégralement à la souris (clics réels sur les cases), sans jamais
recourir à une capture du roi simulée par mutation :
1. `e2-e4`, `e7-e5`, `Dd1-h5`, `a7-a6` (neutre), `Dh5xf7` (capture du pion), `a6-a5` (neutre,
   J2 n'a jamais protégé son roi — la règle GDD §8.1 « pas d'obligation de sortir d'échec »
   est bien appliquée, aucun blocage du coup n'est imposé), `Df7xe8` **capture réelle du roi**.
2. État observé juste après : `{"winner":0,"phase":"gameover"}`. Référence code :
   `main.js:130` (`if (roiPris) { state.winner = state.turn; state.phase = 'gameover'; return; }`).
3. Écran de victoire affiché : « JOUEUR 1 GAGNE ! » / « Roi capturé » / bouton « NOUVELLE
   PARTIE » — capture `playtest-05-victoire.png`.
4. Tentative de rejouer un coup pendant `gameover` : **bloquée**, la phase reste `gameover`
   (conforme, `main.js:282` `if (state.phase === 'animating' || state.phase === 'gameover') return;`).
5. Clic réel sur le bouton « Nouvelle partie » (coordonnées lues dans `state.ui.buttons`,
   comme un joueur cliquerait) : état réinitialisé, `{"ecus":[10,10],"turn":0,"phase":"play","winner":null}`,
   plateau entièrement redéployé — capture `playtest-05-apres-restart.png`.

**Verdict : conforme au GDD §8 dans tous ses aspects testés.** C'était le risque n°1
identifié par le rapport 02 ; il est levé.

### 3.2 Solde de départ (priorité 2 du mandat) — tranché : bug confirmé, pas un artefact de test

Chargement de `index.html` **sans aucune injection d'état**, lecture de
`window.__roychec.state` 500 ms après le `load` : `{"ecus":[10,10],"turn":0,"phase":"play","winner":null}`.

Ce n'est **pas** un artefact laissé par un script de test précédent : c'est la valeur par
défaut de `creerEtat()` (`board.js:41`, `ecus: [SOLDE_DEPART, SOLDE_DEPART]`), elle-même
définie dans `constants.js:6-7` :
```js
// GDD §7 dit 0 ; 10 conservé pour tester les améliorations en parties d'essai.
export const SOLDE_DEPART = 10;
```
Le commentaire du code lui-même admet l'écart assumé. **Verdict : écart de conformité GDD
réel et persistant**, pas une question ouverte — c'est un réglage de confort de dev resté
dans le build livré. Sévérité **mineure** au sens strict (rien ne casse, la partie reste
jouable), mais c'est une valeur d'équilibrage explicitement chiffrée au GDD §7, donc à
trancher formellement (retirer l'override ou mettre à jour le GDD) avant toute validation
finale MVP — voir §5.

### 3.3 Plafonds (priorité 3 du mandat) — PASS (les deux)

- **Plafond 30 écus** : solde forcé à 29 (mutation), un coup réel joué (+2 théorique) →
  solde observé **30**, pas 31. Un second coup réel joué juste après → solde reste **30**.
  Conforme `constants.js:8 PLAFOND_ECUS = 30` et `main.js:47`
  (`state.ecus[joueur] = Math.min(PLAFOND_ECUS, avant + montant)`).
- **Plafond 2 améliorations/pièce** : sur un même pion, achat réel de Marche arrière (4,
  solde 30→26) puis Vétéran (5, 26→21) via clics sur les cartes du panneau. Tentative
  d'achat d'une 3e carte (Bouclier, 6 écus, solde suffisant) sur la **même pièce** :
  **refusée** — solde inchangé à 21, `upgrades` toujours `["marche-arriere","vet"]`, `buzz`
  posé avec `buzzId: "bouclier"` (tremblement visuel). Conforme `constants.js:104
  MAX_UPGRADES_PAR_PIECE = 2` et `main.js:232`. Capture `playtest-05-plafond-upgrades.png` :
  la carte refusée apparaît visuellement grisée dans le panneau (fond pâle, texte atténué)
  bien que le bouton interne garde `enabled:true` — ce n'est pas un bug, c'est un choix de
  code assumé et commenté (« Toujours enregistrer un bouton : le clic est refusé (buzz)
  côté acheter() », `render.js:452`) : le vrai gate est dans `acheter()`, pas dans l'état du
  bouton. Vérifié en conditions réelles : le clic est bien refusé.

### 3.4 Cartes de base non retestées (priorité 4 du mandat) — 5 PASS / 4 FAIL

Chaque carte achetée par un clic réel sur sa case du panneau, effet vérifié en jouant un
coup ou une capture réelle (jamais en lisant seulement `upgrades[]`).

| Carte | Type | Résultat | Détail |
|---|---|---|---|
| **Marche arrière** | Pion [D] | **PASS** | Achat réel, pion avancé puis reculé d'une case via clic réel ; position confirmée sur le plateau après le coup. |
| **Vétéran** | Pion [S] | **FAIL partiel** | Achat réel débité (5 écus). Mais l'infobulle du HUD reste « Pion — valeur 1 » après achat (capture `playtest-05-veteran-valeur-inchangee.png`) : `render.js:502-506 valeurAffichee()` ne connaît que Forteresse, pas Vétéran. Le boost est payé mais **jamais reflété nulle part** (aucun système de départage n'existe encore, donc l'effet réel est de toute façon invisible en jeu — impact pratique faible, mais la carte n'a **strictement aucun effet observable**, contrairement à Forteresse qui, elle, met à jour la tooltip). |
| **Bouclier de fantassin** | Pion [A] | **FAIL — régression confirmée** | Achat réel (6 écus). `shield` reste `false` après achat (`main.js:239` ne pose `shield=true` que pour `id === 'forteresse'`, aucun cas pour `'bouclier'`). Capture réelle exécutée par l'adversaire (clic réel) : le pion « protégé » **meurt normalement**, l'attaquant touche le bonus complet (+3 = 2+1, pas +2 seul). **Contredit directement le rapport 02 vague 1 pt.8, qui avait validé ce même comportement en PASS** — régression avérée depuis. |
| **Monture blindée** | Cavalier [S] | **FAIL — même régression** | Achat réel (7 écus), `shield` reste `false`. Capture réelle du cavalier par l'adversaire : meurt normalement, attaquant touche +5 (2+3, valeur pleine du cavalier) au lieu de +2 seul. |
| **Pas de côté** | Fou [D] | **PASS** | Achat réel (6 écus). Coup orthogonal (7,2)→(6,2) proposé après dégagement de la case, joué réellement, position du fou confirmée sur le plateau. Conforme `rules.js:68` (seule des cartes de mouvement « secondaires » à être réellement câblée). |
| **Pivot** | Tour [D] | **FAIL — jamais implémenté** | Achat réel (7 écus), débit confirmé. Mais `rules.js` `coupsTour()` (ligne 74) ne référence **jamais** `'pivot'` — aucun coup diagonal n'est jamais ajouté aux coups légaux, même case adjacente dégagée exprès pour le test. La carte est payante et strictement décorative. |
| **Rempart** | Tour [A] | **FAIL — aucun bouton d'activation n'existe** | Achat réel (9 écus), débit confirmé. Sélection de la tour équipée : **aucun bouton d'action** n'apparaît dans le panneau (liste des boutons observée = `[]`, capture `playtest-05-rempart-sans-bouton.png`), alors que Ruée/Rayon/Sacrifice/Décret ont chacun leur bouton dédié dans `render.js`. `render.js` ne contient **aucune** ligne `kind: 'rempart'` et `main.js`'s `actionBouton()` n'a aucun `case 'rempart'`. Le pouvoir actif est payant et **impossible à déclencher**, quel que soit ce qu'on fait ensuite. |
| **Forteresse** | Tour [S] | **PASS (test de contrôle)** | Achat réel (8 écus) → `shield` posé à `true` **immédiatement** (seul cas correctement câblé dans `main.js:239`). Capture réelle par l'adversaire : la tour **survit**, l'attaquant reste sur sa propre case, ne touche que +2 (pas de bonus). Ce test sert de **contrôle positif** : il prouve que le mécanisme générique de blindage (`main.js:107-113`, `cible.shield`) fonctionne parfaitement dans le moteur — le bug de Bouclier/Monture/Couronne n'est donc **pas** un bug moteur, mais un oubli précis d'appel `p.shield = true` à l'achat pour ces trois id spécifiques. |
| **Double coup** | Dame [A] | **PASS** | Achat réel (15 écus). 1er coup de dame joué réellement → `inDoubleCoup:true`, tour non consommé (`turn` reste à 0), 2e coup légal recalculé et joué réellement → `doubleCoupUsed:true`, tour transmis ensuite. Conforme au GDD (« usage unique », « ne consomme pas le tour »). |
| **Couronne** | Dame [S] | **FAIL — même régression que Bouclier/Monture** | Achat réel (9 écus), `shield` reste `false`. Capture réelle de la dame : meurt normalement, attaquant touche +11 (2+9, valeur pleine) au lieu de +2 seul. |

**Synthèse 3.4** : sur les 10 cartes de base retestées (les 9 mandatées + Forteresse en
contrôle), **6 PASS, 4 FAIL** (Vétéran compté FAIL partiel car strictement décoratif à ce
stade, distinct des 3 FAIL francs Bouclier/Monture/Couronne). Trois des quatre échecs
(Bouclier, Monture, Couronne) partagent **exactement la même cause racine** : `main.js`
n'appelle `p.shield = true` qu'au cas `id === 'forteresse'`, jamais pour les trois autres
id de type « absorbe la 1re capture ».

### 3.5 Cas limites (priorité 5 du mandat)

- **Ruée (cavalier) non bloquée par Zone de contrôle** : **PASS, vérifié en jeu réel.**
  Décor : fou adverse « Zone » placé de sorte que la case de la cible pion soit dans son
  aura (confirmé au passage que le cavalier lui-même perd ses coups de déplacement normaux
  vers cette zone — `legalMoves: []`, cohérent). Activation réelle du bouton Ruée (clic →
  `phase:'ruee-target'`), cible toujours proposée malgré la Zone, capture exécutée par un
  clic réel : pion adverse retiré, cavalier resté sur sa case, +3 écus. Confirme noir sur
  blanc que la Zone (qui filtre les **déplacements**, `rules.js:147-150`) ne touche pas aux
  captures à distance (qui ne passent jamais par `coupsLegaux`).
- **Rayon sacré non bloqué par Zone de contrôle** : **non testable en jeu — le bouton
  d'activation est mort** (voir ci-dessous). Impossible de vérifier ce cas limite via un
  parcours joueur légitime cette session ; classé **bloqué**, pas PASS ni FAIL.
- **Sacrifice sans pion disponible / sans case d'évasion** : **sans objet — le mécanisme de
  base n'existe plus du tout** (voir ci-dessous). Les deux cas limites demandés supposent un
  Sacrifice qui protège au moins une fois ; ce n'est jamais le cas ici.

## 4. Anomalies — régressions majeures découvertes hors mandat direct mais nécessaires pour honorer le mandat

En creusant les cas limites du §3.5 (impossibles à isoler sans comprendre pourquoi les
boutons ne réagissaient pas), la QA a découvert que **`game/src/main.js` (355 lignes) est
en décalage fonctionnel sévère avec `render.js`, `rules.js` et `board.js`**, qui contiennent
tous les trois du code prêt pour des mécaniques que `main.js` ne sait plus déclencher. Tout
ce qui suit est vérifié par clic réel (ou par clic réel après avoir forcé uniquement le
*décor*, jamais l'action mesurée elle-même), console systématiquement vide (0 erreur) —
ce sont des **échecs silencieux**, pas des crashs.

### 4.1 BLOQUANT — Rayon sacré (fou) totalement inutilisable en jeu

Achat réel (10 écus), bouton « Rayon sacré » **s'affiche, `enabled:true`**. Clic réel dessus :
**aucun effet** — `state.phase` reste `'play'` (attendu `'rayon-target'`). Cause : le switch
`actionBouton()` de `main.js` (lignes 246-254) n'a **aucun `case 'rayon'`** — la fonction
`activerRayon()` (définie en ligne 185) existe mais n'est jamais appelée. Poussé plus loin
par acquit de conscience : en forçant manuellement `state.phase = 'rayon-target'` +
`ruTargets` (pour isoler si seul le bouton est mort ou si le ciblage l'est aussi), un clic
réel sur la case cible télégraphiée ne capture rien non plus — `main.js` ne traite que
`state.phase === 'ruee-target'` dans son gestionnaire de clic (ligne 288), aucun cas pour
`'rayon-target'`. **Régression totale** vs rapport 02 vague 2 pt.5 qui avait validé cette
carte en PASS.

### 4.2 BLOQUANT — Sacrifice (roi) totalement inutilisable, protection jamais appliquée

Même symptôme qu'en 4.1 : bouton « Sacrifice » affiché `enabled:true`, clic réel sans
aucun effet (`sacrificeArmed` reste `false`, pas de cooldown posé) — pas de `case
'sacrifice'` dans `actionBouton()`. Pire : en forçant directement `sacrificeArmed = true`
sur le roi (pour vérifier si la substitution fonctionnerait au moins une fois l'armement
obtenu autrement), puis en faisant capturer le roi **réellement** par un clic adverse :
le roi meurt normalement, `phase:'gameover'`, `winner` attribué à l'attaquant — **aucun
code dans `jouerCoup()` ne teste jamais `piece.sacrificeArmed`**. Le mécanisme de
substitution (pion qui meurt à la place du roi, GDD §6 Roi) n'existe **nulle part** dans
le moteur actuel, indépendamment du bouton. Conséquence directe pour le mandat : les deux
cas limites demandés (« sacrifice sans pion disponible », « sacrifice sans case
d'évasion ») sont **sans objet** — il n'y a plus de mécanique de base à mettre en défaut.
Régression totale vs rapport 02 vague 2 pt.4.

### 4.3 MAJEUR — Décret (roi) totalement inutilisable

Même schéma exactement : bouton affiché `enabled:true`, clic réel sans effet
(`state.phase` reste `'play'`). Vérifié également que le ciblage serait cassé même si
l'activation marchait : phase forcée à `'decret-target'`, clic réel sur l'allié adjacent
proposé → aucun échange, roi et fou restent chacun sur leur case, phase retombe à `'play'`.
Régression totale vs rapport 02 vague 2 pt.3.

### 4.4 MAJEUR — Second galop (cavalier) : l'enchaînement n'existe plus

Achat réel (8 écus). Saut de cavalier réel sans capture joué : `state.chain` reste `null`
et le tour est **immédiatement transmis** à l'adversaire (`turn` passe à 1 après un seul
saut) — aucune proposition de 2e saut. Cause : `state.chain` n'est **jamais assigné** nulle
part dans `main.js` (`grep` confirme qu'il n'est lu qu'en lecture dans `render.js:337`) ;
le commentaire de `rules.js:60-61` renvoie vers « main.js, modèle Double coup » pour cette
logique, mais elle n'existe plus dans le fichier actuel. Régression totale vs rapport 02
vague 2 pt.2.

### 4.5 MAJEUR — Bouclier de fantassin / Monture blindée / Couronne : shield jamais posé

Détaillé en §3.4. Cause unique : `main.js:239` (`if (id === 'forteresse') p.shield = true;`)
ne couvre qu'un seul des quatre id de type « absorbe la 1re capture » du catalogue.
Confirmé que le moteur de blindage lui-même fonctionne (Forteresse sert de contrôle
positif) : c'est un oubli de branchement à l'achat, pas un bug de `jouerCoup()`/
`executerRuee()`/`executerRayon()` qui, eux, savent parfaitement gérer `cible.shield`.

### 4.6 MINEUR — Pivot (tour) : carte payante sans aucun effet

`rules.js` `coupsTour()` ignore totalement l'upgrade `'pivot'`. Achat débité, zéro coup
supplémentaire quelle que soit la position testée.

### 4.7 MAJEUR — Rempart (tour) : pouvoir actif acheté mais impossible à déclencher

Aucun bouton `kind:'rempart'` n'existe dans `render.js`, aucun `case 'rempart'` dans
`main.js`. La carte est vendue au même prix (9 écus) et avec la même présentation que les
pouvoirs actifs fonctionnels (Ruée, Double coup), sans que rien dans l'UI ne signale au
joueur qu'il vient d'acheter une carte inerte.

### 4.8 MAJEUR — Téléportation courte (dame) : cooldown jamais appliqué (déjà utilisable en boucle)

Découvert en vérifiant que Téléportation n'avait pas régressé au passage (elle n'était pas
dans le mandat direct mais son fonctionnement conditionne la lecture de 4.4). Téléportation
jouée réellement une 1re fois : `cooldowns` reste `{}` (pas de `Tele:5` posé). Au tour
suivant de la même dame, **8 nouveaux coups de téléportation** sont de nouveau proposés
sans aucune restriction. Cause : `jouerCoup()` ne teste jamais `mv.tele` pour poser le
cooldown — contrairement à `executerRuee()`/`executerRayon()` qui posent bien
`cooldowns.ruee`/`cooldowns.Rayon` à l'exécution. Le GDD §7 fixe ce cooldown à 5 (« tir à
distance / enchaînement mouvement » = 3-5) ; il est désormais totalement absent en jeu —
régression vs rapport 02 vague 2 pt.1, qui avait confirmé le blocage par cooldown en PASS.

### 4.9 MINEUR — Vétéran (pion) : effet acheté jamais reflété dans l'UI

Voir §3.4. Distinct des 4.1-4.4 (aucune conséquence de gameplay puisque le départage n'est
pas implémenté au MVP), mais un joueur qui paie 5 écus pour ce boost n'a **aucun retour
visuel** que l'achat a eu un effet quelconque — seule la carte « achetée ✓ » dans le
panneau en témoigne.

### 4.10 Diagnostic transverse

Neuf des quinze cartes du catalogue étendu (hors 3 de base originales testées en rapport
02 vague 1) présentent un dysfonctionnement total ou partiel dans le build actuel :
Bouclier, Monture, Couronne (shield jamais posé), Pivot (mouvement jamais ajouté), Rempart
(bouton inexistant), Second galop (enchaînement disparu), Rayon sacré, Sacrifice, Décret
(boutons d'activation ET logique de ciblage disparus), Téléportation (cooldown disparu).
Le motif commun est que **`game/src/main.js` semble être une version antérieure ou
partiellement régressée** par rapport aux trois autres fichiers du moteur, qui contiennent
tous du code écrit en présupposant l'existence de branchements (`state.chain`, cas de
switch `rayon`/`sacrifice`/`decret`/`rempart`, pose de `shield`/`cooldowns.Tele`) que
`main.js` ne fournit plus. Aucune trace Git ne permet de dater la régression (dépôt à un
seul commit `a919ba54`), donc impossible de dire à quel livrable précis elle remonte —
mais elle est bien réelle et vérifiée par clic réel sur chacune des neuf cartes,
indépendamment les unes des autres.

## 5. Vérification de conformité GDD — mise à jour

| Mécanique GDD | Statut | Référence code |
|---|---|---|
| Fin de partie par capture du roi + écran de victoire + rejouer | **Conforme, vérifié en jeu** | `main.js:130`, bouton `restart` |
| Solde de départ = 0 (§7) | **Non conforme, confirmé en conditions réelles** (10 codé en dur, override assumé en commentaire) | `constants.js:6-7` |
| Plafond 30 écus | **Conforme, vérifié en jeu** | `constants.js:8`, `main.js:47` |
| Max 2 améliorations/pièce | **Conforme, vérifié en jeu** | `constants.js:104`, `main.js:232` |
| Marche arrière, Pas de côté, Double coup, Forteresse | **Conformes, vérifiés en jeu** | voir §3.4 |
| Vétéran | **Achat sans effet observable** (valeur non reflétée dans l'UI ; départage hors MVP de toute façon) | `render.js:502-506` |
| Bouclier de fantassin, Monture blindée, Couronne | **Non conformes — shield jamais posé, régression confirmée** | `main.js:239` (cas manquants) |
| Pivot | **Non conforme — mouvement jamais implémenté** | `rules.js:74` (aucune référence à `pivot`) |
| Rempart | **Non conforme — aucun moyen de déclenchement** | absent de `render.js`/`main.js` |
| Second galop (enchaînement) | **Non conforme — mécanique disparue** | `state.chain` jamais assigné |
| Rayon sacré | **Non conforme — bouton et ciblage morts** | `main.js` switch incomplet |
| Sacrifice | **Non conforme — bouton mort, substitution absente de `jouerCoup()`** | idem |
| Décret | **Non conforme — bouton et ciblage morts** | idem |
| Téléportation courte | **Non conforme — cooldown jamais posé (spam illimité)** | `jouerCoup()` ignore `mv.tele` |
| Ruée (cavalier) non bloquée par Zone | **Conforme, vérifié en jeu** | `rules.js` (Ruée hors `coupsLegaux`) |
| Rayon sacré non bloqué par Zone | **Non testable** (bouton mort) | — |

## 6. Reste à tester

- **Rejouer les 9 cartes régressées après correction par gameplay-dev** : Bouclier,
  Monture, Couronne (poser `shield=true` à l'achat comme pour Forteresse), Pivot (ajouter
  la branche diagonale dans `coupsTour`), Rempart (créer le bouton + l'action + l'effet de
  blindage de zone), Second galop (réimplémenter `state.chain` façon Double coup mais pour
  `N`), Rayon sacré/Sacrifice/Décret (rebrancher les 3 `case` manquants + les phases de
  ciblage `rayon-target`/`decret-target` dans le gestionnaire de clic), Téléportation
  (poser `cooldowns.Tele` dans `jouerCoup()` quand `mv.tele` est vrai).
- **Rayon sacré non bloqué par Zone de contrôle** : à tester en conditions réelles dès que
  le bouton est réparé (le code de `ciblesRayon()` ne filtre déjà pas par Zone, comme
  `ciblesRuee()` — cohérent avec le comportement attendu, mais non vérifiable en jeu tant
  que le bouton reste mort).
- **Sacrifice sans pion disponible / sans case d'évasion** : à tester dès que la mécanique
  de base sera réimplémentée — actuellement sans objet.
- Interactions croisées listées au rapport 02 §6 non reprises ici faute de temps (Double
  coup + Téléportation sur la même dame le même tour, deux Zones de contrôle superposées) —
  à couvrir lors du prochain playtest, une fois les 9 régressions ci-dessus corrigées.
- Solde de départ [10,10] : décision formelle attendue (retirer l'override ou acter 10
  comme nouveau barème et mettre à jour le GDD §7).

## 7. Ressenti de jeu

- La boucle de fin de partie est le point fort de cette session : capture réelle, message
  clair (« JOUEUR 1 GAGNE ! » / « Roi capturé »), bouton de reprise immédiat et fiable —
  aucune friction, aucun état bloqué observé.
- Le retour visuel du panneau d'achat reste bon (carte grisée pour un achat refusé, badge
  « achetée ✓ »), mais ce même panneau **ne distingue en rien une carte fonctionnelle d'une
  carte inerte** : rien ne prévient le joueur qu'il vient de payer 9 écus pour un Rempart
  qu'il ne pourra jamais activer, ou 8 écus pour un Pivot qui ne fera jamais bouger sa tour
  en diagonale. Du point de vue du joueur, ça se lit comme un bug de jeu (« j'ai payé, rien
  ne se passe ») plutôt que comme une carte affichée par erreur — c'est plus trompeur qu'un
  simple manque de contenu, parce que rien à l'écran ne le signale.
- Sur Bouclier/Monture/Couronne, l'expérience est particulièrement mauvaise : le joueur
  voit sa pièce annoncée comme protégée (le catalogue promet « absorbe la prochaine
  capture subie »), engage un pari stratégique dessus, puis la voit mourir exactement
  comme si de rien n'était, sans le moindre indice que la protection n'a jamais existé.
  C'est le genre de régression qui, en test utilisateur non technique, se lirait comme
  « le jeu m'a menti », pas comme un simple manque.
- Aucun crash, aucune erreur console sur l'ensemble des 18 scripts de cette session : les
  9 régressions listées en §4 sont toutes des **échecs silencieux**, ce qui les rend
  d'autant plus difficiles à repérer sans playtest actif — un simple `node --check`
  (vérification de syntaxe) comme pratiqué en rapport 02 ne les aurait jamais révélées,
  puisque le code est syntaxiquement valide, juste incomplet fonctionnellement.

## 8. Verdict global

**Le mandat de cette session (5 points, tous testés en conditions réelles) donne : fin de
partie PASS, plafonds PASS (les deux), solde de départ tranché en écart confirmé (10 au
lieu de 0), cartes de base 6 PASS / 4 FAIL, cas limites Ruée/Zone PASS mais Rayon/Sacrifice
bloqués par des régressions découvertes en cours de route.**

Le risque n°1 du rapport 02 (fin de partie jamais testée) est **levé et validé PASS sans
réserve**. Mais cette session révèle un risque **plus grave et plus large** : neuf cartes du
catalogue MVP, plusieurs explicitement validées PASS par le rapport 02, sont aujourd'hui
**silencieusement non fonctionnelles** dans `game/src/main.js` (Bouclier, Monture, Couronne,
Pivot, Rempart, Second galop, Rayon sacré, Sacrifice, Décret) ou partiellement cassées
(Téléportation courte, cooldown absent). Le catalogue annoncé au joueur (15 cartes, 3 par
type) n'est aujourd'hui réellement fonctionnel qu'à hauteur d'environ **6 cartes sur 15**
(Marche arrière, Pas de côté, Double coup, Forteresse, Ruée, et partiellement Vétéran).

**Verdict : NE PAS valider le MVP en l'état.** La boucle centrale (échecs + écus + achat +
fin de partie) est solide et jouable, mais le contenu vendu au joueur dans le panneau
d'amélioration est majoritairement décoratif. Priorité absolue avant toute nouvelle
validation : gameplay-dev doit rebrancher les 9 mécaniques listées en §4 dans
`game/src/main.js`, puis la QA doit rejouer chacune en conditions réelles (pas de
`node --check`, qui ne les aurait jamais détectées) avant de considérer le MVP livrable.
