# roychec — jeu vidéo 2D web

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

## Marketing
L'équipe marketing NAIOM (lancement du jeu : pitch deck, posts, trailer) vit dans le projet
voisin `../roychec/`.
