---
description: Lance l'agent audio pour un brief SFX / musique
argument-hint: [contexte : sfx gameplay / musique menu…]
---

Délègue à l'agent **audio** un brief de sound design ou de musique.

Contexte / arguments : $ARGUMENTS

Consignes :
1. Lis `CLAUDE.md`, `design/gdd.md` (mécaniques à sonoriser) et `art/` (ambiance).
2. Invoque le sous-agent `audio`.
3. Livrables : `audio/sound-design.md` (mapping événement→SFX) et/ou `audio/musique-{contexte}.md`.
4. Rappel : chaque SFX est relié à un déclencheur du GDD ; le jeu doit tourner même sans asset audio.
