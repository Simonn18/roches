---
description: Lance le game-designer pour (re)produire le Game Design Document
argument-hint: [pitch / axe de conception]
---

Délègue à l'agent **game-designer** la production (ou la mise à jour) du GDD.

Pitch / axe / arguments : $ARGUMENTS

Consignes :
1. Lis `CLAUDE.md` puis `design/gdd.md` s'il existe.
2. Invoque le sous-agent `game-designer`.
3. Livrable : `design/gdd.md` — core loop, mécaniques, contrôles, systèmes, équilibrage chiffré,
   win/lose, scope MVP.
4. Restitue à l'utilisateur la boucle de gameplay et le scope MVP, puis demande validation avant
   de lancer le code.
