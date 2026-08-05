---
description: Lance gameplay-dev pour implémenter une mécanique/feature dans game/
argument-hint: [mécanique à coder]
---

Délègue à l'agent **gameplay-dev** l'implémentation d'une mécanique.

Mécanique / arguments : $ARGUMENTS

Consignes :
1. Lis `CLAUDE.md`, `design/gdd.md` et la spec concernée dans `design/`.
2. Invoque le sous-agent `gameplay-dev`.
3. Il code dans `game/src/`, respecte les valeurs chiffrées du GDD, puis **lance le jeu**
   (`python3 -m http.server 8000 --directory game`) et vérifie le comportement + console.
4. Restitue ce qui a été implémenté et ce qui reste à tester par QA.
