---
description: Lance level-designer pour créer/équilibrer un niveau
argument-hint: [numéro / intention du niveau]
---

Délègue à l'agent **level-designer** la création d'un niveau.

Niveau / arguments : $ARGUMENTS

Consignes :
1. Lis `CLAUDE.md`, `design/gdd.md` (mécaniques disponibles) et le format de données de niveau
   attendu par `game/src/`.
2. Invoque le sous-agent `level-designer`.
3. Livrables : `levels/{n}-{nom}.md` (intention + équilibrage) + les données chargeables
   (`levels/{n}-{nom}.json` ou format du code).
4. Rappel : un niveau enseigne/teste une seule chose nouvelle, difficulté juste.
