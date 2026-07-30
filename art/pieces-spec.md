---
projet: roychec
agent: artiste
date: 2026-07-04
version: 1
statut: brouillon
---

# Spec des pièces — roychec

> Complète `art/direction-artistique.md` (§7 distinction de camp, §8 résolution/export). Reprend
> les personnages de `art/refs/mockup-pieces-01.png`, redessinés en flat à gros contours noirs,
> palette pastel, plafonnés à 2 signaux de camp (socle + un élément de costume, voir DA §7).

Règles communes aux 6 pièces (à ne pas répéter à chaque fiche) :
- Contour **Encre** `#1A1A1A` plein, épaisseur constante sur tout le personnage.
- Vue de **face**, buste ou figure centrée, posée sur un **socle circulaire** simple.
- Matériau/teinte de base commune aux deux camps : **Ivoire Bois** `#F0DFC0` (visage, matériau
  principal du personnage).
- Couleur de camp appliquée à : (a) le socle en entier, (b) un élément de costume désigné par
  pièce (voir fiches). Camp 1 = **Bleu Poudré** `#7FA6D9`, Camp 2 = **Corail** `#E08A6E`.
- Accessoires dorés (couronne, croix, boutons) : une seule teinte or pastel commune aux deux
  camps, **`#F4D58D`**, jamais recolorée par camp (l'or reste neutre, seul le tissu/socle change).
- Aucun texte intégré au sprite (voir note lisibilité en fin de document).
- Chaque pièce doit rester identifiable **en silhouette seule**, sans couleur, à 64 px — c'est le
  test de lisibilité à appliquer à chaque génération avant validation.

---

## Pion — soldat napoléonien au bicorne

- **Personnage repris de la réf** : petit soldat, bicorne noir à galon, moustache, col officier.
- **Silhouette distinctive** : le plus petit gabarit des 6 pièces (cohérent avec sa valeur la plus
  faible), chapeau **bicorne** large et plat en haut = silhouette triangulaire aplatie unique,
  ne se confond avec aucune autre pièce.
- **Palette** : bicorne en noir/Encre (garde son identité même si Encre est aussi la couleur de
  contour — le distinguo se fait par l'aplat plein du chapeau vs le simple trait de contour fin
  du reste du corps), visage/col en Ivoire Bois, boutons dorés `#F4D58D`.
- **Marquage de camp** : le **col/revers de veste** est peint dans la couleur de camp (Bleu
  Poudré ou Corail) + le socle.
- **Badge d'amélioration** : ancré sous le socle, centré (le pion étant petit, prévoir un socle
  légèrement élargi à sa base pour laisser la place à 1-2 badges sans déborder de la case).

## Cavalier — cheval cabré

- **Personnage repris de la réf** : tête de cheval cabrée, crinière en mouvement, encolure
  courbée — on garde la figure animale complète (pas un buste humain), c'est la seule pièce non
  humanoïde du set, ce qui sert déjà sa lisibilité.
- **Silhouette distinctive** : la courbe en « S » du cou + la crinière qui dépasse du contour
  principal = silhouette immédiatement reconnaissable, y compris en noir et blanc.
- **Palette** : robe du cheval en Ivoire Bois (au lieu du marron réaliste de la réf, pour rester
  dans la palette pastel commune), crinière en un ton légèrement plus soutenu de la même famille
  (ex. brun pastel `#C9A87C`, utilisé uniquement ici, propre au cavalier, pas une couleur de camp).
- **Marquage de camp** : le **tissu de selle** (bande sous l'encolure, visible même en buste) est
  peint dans la couleur de camp + le socle.
- **Badge d'amélioration** : ancré sous le socle du cavalier, comme les autres pièces (pas sur la
  crinière, qui reste zone de silhouette pure).

## Fou — bouffon à grelots

- **Personnage repris de la réf** : bonnet de bouffon à trois pointes terminées par des grelots,
  visage souriant, col à crénelures.
- **Silhouette distinctive** : les **trois pointes du bonnet** (silhouette en couronne dentelée
  souple) sont l'élément le plus reconnaissable du set après le Roi — bien distinct de la couronne
  rigide du Roi/de la Dame.
- **Palette** : bonnet en Ivoire Bois avec grelots dorés `#F4D58D` en bout de chaque pointe,
  visage souriant en expression neutre-amicale (cohérent ton « party game »).
- **Marquage de camp** : le **corps du bonnet** (pas les grelots, qui restent dorés neutres) est
  teinté dans la couleur de camp + le socle. Alternative si le bonnet doit rester visuellement
  unique quel que soit le camp : teindre le **col à crénelures** à la place — à trancher au
  moment du dessin selon ce qui reste le plus lisible en test de silhouette.
- **Badge d'amélioration** : sous le socle.

## Tour — donjon à visage

- **Personnage repris de la réf** : bloc de pierre crénelé avec un visage souriant intégré à la
  façade (porte/fenêtre stylisées comme des yeux/bouche).
- **Silhouette distinctive** : seule pièce **non arrondie en haut** — silhouette rectangulaire à
  **créneaux** (petits carrés en haut), immédiatement différente de toutes les autres (qui ont
  toutes une silhouette arrondie en haut : couronne, bonnet, chapeau, tête de cheval).
- **Palette** : pierre en Ivoire Bois avec un très léger quadrillage de blocs (2-3 lignes de
  contour Encre fines pour suggérer la maçonnerie, sans texture réaliste), visage en traits Encre
  simples (yeux + sourire), pas de couleur de peau distincte (c'est un bâtiment, pas un personnage).
- **Marquage de camp** : une **bannière/fanion** plantée au sommet du donjon, entre deux créneaux,
  peinte dans la couleur de camp — plus le socle. C'est le seul cas où l'accent de camp est un
  élément ajouté plutôt qu'une zone du personnage lui-même (cohérent avec le fait que la Tour est
  un bâtiment, pas un costume).
- **Badge d'amélioration** : sous le socle, comme les autres.

## Dame — reine couronnée

- **Personnage repris de la réf** : buste de reine, couronne à pointes surmontées de boules,
  cheveux longs détachés, collier.
- **Silhouette distinctive** : couronne à **pointes multiples + boules** (différente de la couronne
  du Roi, plus large/haute et à croix) + volume de cheveux qui élargit la silhouette en haut —
  la pièce la plus « large en haut » du set après la Tour.
- **Palette** : couronne et bijoux en or pastel `#F4D58D`, cheveux dans une teinte pastel neutre
  propre à la Dame (ex. `#E8D4B0`, distincte de l'Ivoire Bois du visage pour bien séparer
  peau/chevelure), visage en Ivoire Bois.
- **Marquage de camp** : le **liseré/col de la robe** (bande visible sous le buste, juste
  au-dessus du socle) est teinté dans la couleur de camp + le socle.
- **Badge d'amélioration** : sous le socle. Attention particulière ici : la Dame porte
  potentiellement l'amélioration la plus chère du catalogue (Double coup, 15 écus, GDD §6) — le
  socle doit prévoir assez de largeur pour accueillir 2 badges côte à côte sans déborder (plafond
  de 2 améliorations/pièce, GDD §5.3).

## Roi — roi barbu couronné

- **Personnage repris de la réf** : buste de roi, couronne à croix sommitale, grande barbe,
  moustache, cape/col fourré.
- **Silhouette distinctive** : couronne **surmontée d'une croix** (unique dans le set, aucune
  autre pièce n'a d'élément vertical fin qui dépasse ainsi) + masse de barbe qui élargit la base
  du visage — silhouette la plus « imposante » du set, cohérent avec son statut d'enjeu de
  victoire (capture du roi = fin de partie, GDD §8).
- **Palette** : couronne et croix en or pastel `#F4D58D`, barbe dans un gris-beige pastel propre
  au Roi (ex. `#D8CFC0`, ni Ivoire Bois ni or, pour bien la détacher visuellement du visage et de
  la couronne), col/cape en Ivoire Bois.
- **Marquage de camp** : la **doublure intérieure de la cape** (bande visible au col, façon
  fourrure) est teintée dans la couleur de camp + le socle.
- **Badge d'amélioration** : sous le socle. Le Roi peut porter *Garde royale* (livrée au MVP,
  GDD §9) — prévoir que le badge [A] orange (Info Actif) reste bien visible même avec l'anneau de
  blindage cyan existant dans le code (`p.shield`, `render.js`) qui s'affiche autour de la pièce :
  les deux signaux (badge sous le socle, anneau autour du personnage) ne se superposent pas dans
  la mise en page actuelle, donc pas de conflit à anticiper.

---

## Emplacement et style du badge d'amélioration (rappel transverse)

Le code affiche déjà les badges d'amélioration (`dessinePiece()` dans `render.js`) : un ou deux
petits carrés colorés par catégorie, centrés horizontalement, ancrés juste sous le bas de la
pièce. Pour les sprites finaux :
- Garder cette même ancre (bas-centre, sous le socle) pour ne pas casser le code de positionnement
  existant.
- Style final du badge : petit carré à coins légèrement arrondis (~2 px de rayon à l'échelle
  jeu), contour Encre 1-2 px, fond dans la couleur de catégorie pastel (`Info Déplacement` /
  `Info Actif` / `Info Stat`, voir DA §2 et §9).
- Maximum 2 badges par pièce (plafond du GDD §5.3) : prévoir l'espacement pour 2 badges côte à
  côte sans qu'ils débordent de la largeur de case.

## Note de lisibilité — texte intégré aux assets

Aucune pièce ne doit porter de texte intégré à l'image (pas de lettre gravée, pas de chiffre). Le
texte (lettre P/C/F/T/D/R en fallback, coût en écus, noms de carte) reste **toujours du texte
Canvas 2D dessiné par le code** (`ctx.fillText`), jamais cuit dans un sprite — un texte à 12-16 px
intégré dans un PNG de 128×128 px downscalé serait illisible à l'écran. C'est aussi ce qui permet
au fallback lettre (P/C/F/T/D/R) de continuer à fonctionner en superposition légère si jamais un
sprite tarde à arriver pour une pièce donnée (dégradation progressive, jamais de blocage).
