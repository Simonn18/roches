---
description: Boucle complète sur une feature — design → code → playtest
argument-hint: [feature à ajouter]
---

Orchestre une **feature de bout en bout**. Tu es l'orchestrateur : tu routes, tu ne codes pas
toi-même. Un agent à la fois, validation utilisateur aux étapes critiques.

Feature / arguments : $ARGUMENTS

Déroulé séquentiel :
1. **game-designer** → spec de la feature dans `design/` (mécanique, valeurs, feedback).
   **Demande validation.**
2. **gameplay-dev** → implémente dans `game/`, puis lance le jeu et vérifie que ça tourne.
3. **qa** → playtest réel contre la spec, rapport de bugs dans `qa/`.
4. Si bugs bloquants → retour à gameplay-dev. Sinon, restitue le résultat.

Garde-fous (voir `CLAUDE.md` §7) : GDD d'abord, le jeu doit tourner réellement, séquentiel.
