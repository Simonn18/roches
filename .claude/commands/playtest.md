---
description: Lance QA pour tester le jeu et remonter les bugs
argument-hint: [périmètre à tester]
---

Délègue à l'agent **qa** un playtest du jeu.

Périmètre / arguments : $ARGUMENTS

Consignes :
1. Lis `CLAUDE.md` et `design/gdd.md` (référence de conformité).
2. Invoque le sous-agent `qa`.
3. Il **lance réellement le jeu** (`python3 -m http.server 8000 --directory game`), joue,
   observe la console, et vérifie le jeu contre le GDD.
4. Livrables : `qa/plan-playtest.md`, `qa/bugs-{date}.md` (repro, attendu vs observé, sévérité).
5. Restitue les bugs bloquants/majeurs en priorité et propose de renvoyer à gameplay-dev.
