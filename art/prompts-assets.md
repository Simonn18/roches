---
projet: roychec
agent: artiste
date: 2026-07-04
version: 1
statut: brouillon
---

# Prompts d'assets — roychec (lot 1 : les 12 pièces)

> Complète `art/direction-artistique.md` et `art/pieces-spec.md`. Prompts prêts à coller dans
> Midjourney / Gemini (Nano Banana / Imagen) / Ideogram. Toujours utiliser le **préfixe de style
> commun** ci-dessous devant chaque prompt spécifique, mot pour mot, pour garantir la cohérence
> visuelle entre les 12 sprites (même style, même épaisseur de trait, même ambiance).

## Préfixe de style commun (à coller devant chaque prompt)

```
Flat vector illustration, thick clean black outlines, bold cel-shaded flat colors, no gradients,
no realistic shading, no drop shadow, cute friendly modern board-game app icon style, chibi
proportions, front-facing character bust on a simple round pedestal base, centered composition,
square canvas, transparent background, soft pastel color palette (lavender-grey, plum-mauve,
ivory-cream, sage-green, powder-blue, coral), thick black outline around every shape including
the pedestal, warm ivory-beige skin/material tone (#F0DFC0), gold pastel accents (#F4D58D) for
crowns/jewelry only, clean simple shapes, readable silhouette at small size, no text, no
lettering, no watermark, high resolution, 1:1 aspect ratio
```

Paramètres suggérés :
- **Midjourney** : ajouter `--ar 1:1 --stylize 150 --no realistic, wood texture, 3d render,
  photorealistic, gradient, drop shadow, text, watermark`.
- **Ideogram** : mode « Design » ou « Illustration », fond transparent activé, ratio 1:1.
- **Gemini (Imagen / Nano Banana)** : préciser explicitement `transparent PNG background` dans le
  prompt (Gemini ignore parfois `--no background` façon Midjourney), et demander `flat 2D vector
  illustration, no photorealism` en toutes lettres comme ici.

Négatifs à répéter si le générateur le permet : `wood texture, 3d render, photorealistic render,
gradient shading, drop shadow, realistic lighting, embedded text, watermark, extra limbs,
asymmetry`.

---

## Camp 1 — Bleu Poudré (`#7FA6D9`)

### Pion — soldat napoléonien (Camp Bleu Poudré)
```
[préfixe de style commun]. Subject: small napoleonic soldier bust, black bicorne hat with gold
trim, thin mustache, high collar jacket. Team color (powder blue #7FA6D9) applied to the jacket
collar/lapels and to the round pedestal base only; keep the bicorne hat black and the face ivory-
beige. Smallest and simplest silhouette of a 6-character chess-piece set (pawn), flat triangular
hat silhouette clearly readable at small size.
```

### Cavalier — cheval cabré (Camp Bleu Poudré)
```
[préfixe de style commun]. Subject: rearing horse head and neck only (no human rider), flowing
mane, curved "S" neck silhouette, ivory-beige coat, mane in a soft warm brown pastel (#C9A87C).
Team color (powder blue #7FA6D9) applied to a saddle-cloth band under the neck and to the round
pedestal base only. No human bust, animal figure only, on a round pedestal base like the other
pieces in the set.
```

### Fou — bouffon à grelots (Camp Bleu Poudré)
```
[préfixe de style commun]. Subject: jester bust, three-pointed jester hat each tip ending in a
small gold bell (#F4D58D), friendly smiling face, scalloped collar. Team color (powder blue
#7FA6D9) applied to the body of the jester hat (not the bells, which stay gold) and to the round
pedestal base only. Distinct silhouette from the queen's rigid crown: soft floppy three-point hat
shape.
```

### Tour — donjon à visage (Camp Bleu Poudré)
```
[préfixe de style commun]. Subject: small stone castle tower/keep with a friendly cartoon face
built into the facade (simple door/window as eyes and mouth), crenellated flat top (small square
merlons), ivory-beige stone with a few thin black outline lines suggesting brick blocks (no
realistic texture). Team color (powder blue #7FA6D9) applied to a small flag/banner planted
between two merlons at the top, and to the round pedestal base only. Only piece in the set with a
flat-topped, non-rounded silhouette.
```

### Dame — reine couronnée (Camp Bleu Poudré)
```
[préfixe de style commun]. Subject: queen bust, pointed crown topped with small gold balls
(#F4D58D), long flowing hair in warm pastel tone (#E8D4B0), simple necklace, ivory-beige face.
Team color (powder blue #7FA6D9) applied to the dress collar/trim just above the pedestal, and to
the round pedestal base only. Wide silhouette at the top from crown and hair volume, distinct from
the king's crown (no cross on top).
```

### Roi — roi barbu couronné (Camp Bleu Poudré)
```
[préfixe de style commun]. Subject: king bust, crown topped with a small gold cross (#F4D58D),
large full beard and mustache in soft grey-beige pastel (#D8CFC0), fur-trimmed collar/cape, ivory-
beige face. Team color (powder blue #7FA6D9) applied to the inner lining of the cape collar (the
fur-trim band), and to the round pedestal base only. Tallest, most imposing silhouette of the set,
crown with a thin vertical cross unique to this piece.
```

---

## Camp 2 — Corail (`#E08A6E`)

Mêmes 6 prompts, en remplaçant uniquement la mention de couleur d'équipe. Exemple pour le pion,
puis liste condensée pour les 5 autres (même structure, ne changer que la teinte d'équipe) :

### Pion — soldat napoléonien (Camp Corail)
```
[préfixe de style commun]. Subject: small napoleonic soldier bust, black bicorne hat with gold
trim, thin mustache, high collar jacket. Team color (coral #E08A6E) applied to the jacket
collar/lapels and to the round pedestal base only; keep the bicorne hat black and the face ivory-
beige. Smallest and simplest silhouette of a 6-character chess-piece set (pawn), flat triangular
hat silhouette clearly readable at small size.
```

### Cavalier — cheval cabré (Camp Corail)
```
Identique au prompt Cavalier Bleu Poudré ci-dessus, remplacer "Team color (powder blue #7FA6D9)"
par "Team color (coral #E08A6E)".
```

### Fou — bouffon à grelots (Camp Corail)
```
Identique au prompt Fou Bleu Poudré ci-dessus, remplacer "Team color (powder blue #7FA6D9)" par
"Team color (coral #E08A6E)".
```

### Tour — donjon à visage (Camp Corail)
```
Identique au prompt Tour Bleu Poudré ci-dessus, remplacer "Team color (powder blue #7FA6D9)" par
"Team color (coral #E08A6E)".
```

### Dame — reine couronnée (Camp Corail)
```
Identique au prompt Dame Bleu Poudré ci-dessus, remplacer "Team color (powder blue #7FA6D9)" par
"Team color (coral #E08A6E)".
```

### Roi — roi barbu couronné (Camp Corail)
```
Identique au prompt Roi Bleu Poudré ci-dessus, remplacer "Team color (powder blue #7FA6D9)" par
"Team color (coral #E08A6E)".
```

> Astuce pratique : générer d'abord les 6 pièces du Camp Bleu Poudré, les valider (silhouette +
> cohérence de style), puis ne relancer que le mot de couleur d'équipe pour le Camp Corail — les
> générateurs conservent souvent mieux la cohérence de style en variante de couleur qu'en
> génération indépendante. Si le générateur supports image-to-image / character reference (ex.
> `--cref` Midjourney, image de référence Ideogram), utiliser le sprite Bleu Poudré validé comme
> référence pour générer la variante Corail — bien meilleure cohérence que deux prompts textuels
> indépendants.

---

## Export après génération

1. Recadrer/nettoyer chaque sprite sur un canvas carré transparent.
2. Vérifier que le personnage est bien centré et laisse ~10% de marge de chaque côté (pour la
   marge de case + débord de couronne/chapeau, voir DA §8).
3. Exporter le maître en **1024×1024 PNG-24 alpha**, puis downscaler en **256×256** (@2x, fichier
   livré dans `game/assets/pieces/`) et en **128×128** (@1x, référence de contrôle).
4. Nommer : `game/assets/pieces/bleu-pion.png`, `game/assets/pieces/corail-cavalier.png`, etc.
   (préfixe camp = `bleu` / `corail`, suffixe type = `pion`/`cavalier`/`fou`/`tour`/`dame`/`roi`).
5. Test de silhouette : désaturer chaque export en niveaux de gris et vérifier que les 6 types
   restent distinguables entre eux sans couleur (voir critère DA/pieces-spec).

---

## Lot 2 (optionnel, non prioritaire) — icônes UI

À produire seulement une fois les 12 pièces validées. Même préfixe de style commun, sujets courts :
- **Icône Écu** : `Subject: single round gold coin with a simple crown emboss, no text, flat
  vector coin icon` — maître 512×512, export 128×128.
- **Icônes de pouvoir actif** (Ruée, Garde royale, Double coup, Forteresse, Marche arrière, Pas de
  côté) : une forme simple et symbolique par pouvoir (ex. bouclier pour Garde royale, éclair pour
  Ruée, double flèche pour Double coup), mêmes contraintes de style, maître 512×512, export
  96×96. À écrire en détail lot par lot quand gameplay-dev en aura besoin — non bloquant pour le
  MVP (les boutons texte actuels du HUD suffisent en attendant, voir DA §10).
