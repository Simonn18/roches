# Déploiement — roychec.com

Le site est servi depuis le `public_html/` du compte cPanel `musi8808` (domaine `roychec.com`).

## Principe

```
git push (GitHub)  →  cron cPanel (toutes les 5 min)  →  pull + deploy  →  public_html
```

On n'utilise **pas** le push SSH direct vers cPanel (port 22 bloqué sur l'hébergeur).
Le déploiement passe par GitHub + une tâche cron côté cPanel.

## Workflow quotidien (mettre le site à jour)

1. Modifie le code dans `game/`.
2. Commit et push :
   ```bash
   git add .
   git commit -m "description du changement"
   git push origin main
   ```
3. Attends ~5 minutes (le cron cPanel pull + deploy tout seul).
4. Vérifie https://roychec.com (rechargement forcé : `Cmd+Shift+R`).

## Comment ça marche

- **`.cpanel.yml`** (racine du dépôt) : copie le contenu de `game/` vers `$HOME/public_html/`.
- **Dépôt cPanel** : un *clone* de GitHub (`git@github.com:Simonn18/roches.git`, branche `main`),
  avec une « Remote URL » pointant vers GitHub.
- **Cron cPanel** : toutes les 5 minutes, il exécute :
  ```
  /usr/bin/uapi VersionControl update repository_root=/home/musi8808/repositories/roychec branch=main && /usr/bin/uapi VersionControlDeployment create repository_root=/home/musi8808/repositories/roychec
  ```
  - `VersionControl update` → tire les nouveaux commits depuis GitHub.
  - `VersionControlDeployment create` → exécute le `.cpanel.yml` (déploiement).
  - Si le serveur est en CloudLinux, remplacer `/usr/bin/uapi` par `/usr/local/cpanel/bin/uapi`.

## Reconfigurer de zéro (si le serveur ou le repo change)

1. **cPanel → Git™ Version Control → Create** → activer « Clone a Repository »
   → URL `git@github.com:Simonn18/roches.git`.
2. Vérifier que `.cpanel.yml` est présent et commité (racine du dépôt).
3. **cPanel → Cron Jobs** → nouvelle tâche, intervalle « Every 5 minutes », commande ci-dessus
   (adapter `repository_root` à la valeur « Repository Path » affichée dans cPanel).
4. Tester : pousser un commit → attendre ~5 min → vérifier le site.

## Dépannage

| Symptôme | Cause probable |
|---|---|
| Rien ne change après 5-10 min | Vérifier l'email du cron (les erreurs y sont envoyées) ; mauvais `repository_root` ; le repo cPanel n'est pas un clone de GitHub |
| Erreur `VersionControl update` | Ajouter `name=roychec` à la première commande |
| Un fichier supprimé/renommé reste en ligne | `cp -R` ne supprime pas : voir la section suivante |

## À savoir

- Le `.cpanel.yml` fait un `cp -R game/.` : les fichiers **supprimés ou renommés** peuvent
  rester sur le serveur. À corriger plus tard avec `rsync --delete` si nécessaire.
- Le dépôt local n'a qu'un seul remote (`origin` = GitHub). Aucun remote cPanel.
