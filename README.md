# roychec — jeu vidéo 2D web

Projet de jeu piloté par une **équipe de sous-agents Claude Code**. Voir `CLAUDE.md` pour le
contrat (architecture, roster, garde-fous).

## Lancer le jeu
```bash
python3 -m http.server 8000 --directory game
# → http://localhost:8000
```
Au 12/07/2026 : 15 cartes en jeu, PvP en ligne W1+W2+W3 livrés et validés utilisateur 10-12/07, PvAI 3 niveaux (spec-ia v2 en cours d'impl), compte Supabase magic link + email/password (vendor local + CSP stricte depuis 12/07).

## Workflow
1. `/gdd` — le game-designer définit le jeu (`design/gdd.md`).
2. `/feature <feature>` — boucle design → code → playtest.
3. `/niveau`, `/art`, `/audio`, `/playtest` — au besoin.

## Équipe (`.claude/agents/`)
game-designer · narrative · gameplay-dev · artiste · audio · level-designer · qa

## Statut de la branche (12/07/2026)
- **Working tree** : 2 fichiers non committés (`game/src/tutorial.js` ?v=22 fix TypeError `state.variant` indéfini + `game/src/render.js` bouton « Retour Menu » gameover), en attente de leur propre validation utilisateur.
- **Dernier commit** : `5878d1de` — `fix(auth): vendor local supabase-js esbuild browser platform + 2 bugs histor (URL typo + /node polyfills) + cache-bust ?v=24`.
- **Prochaine priorité** : implémenter `spec-ia v2` (`decideAchats()` + MENACE replafonné), audit cible ≥5 achats/partie niv. 2-3.

## Marketing
L'équipe marketing NAIOM (lancement du jeu : pitch deck, posts, trailer) vit dans le projet
voisin `../roychec/`.
