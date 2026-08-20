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

## Garder le projet Supabase actif (anti-pause free tier)

Le plan gratuit Supabase met le projet en pause après **7 jours sans activité** (la pause
coupe l'auth, le Realtime et les RPC PvP jusqu'à ce qu'un joueur le réveille). Un simple
heartbeat la neutralise : un cron cPanel appelle la RPC `heartbeat()` toutes les heures,
chaque appel comptant comme activité API.

1. **Déployer la migration** `supabase/schema-heartbeat.sql` : Dashboard Supabase →
   projet roychec → SQL Editor → coller tout le fichier → RUN (idempotent, comme les
   autres schémas).
2. **cPanel → Cron Jobs** → nouvelle tâche, intervalle « Every 1 hour », commande :
   ```
   /usr/bin/curl -s -o /dev/null -w "%{http_code}\n" -H "apikey: sb_publishable_3wwsNqBwmetZWsKk6KjKWQ_Rr2G7Qv0" -H "Authorization: Bearer sb_publishable_3wwsNqBwmetZWsKk6KjKWQ_Rr2G7Qv0" -H "Content-Type: application/json" -d '{}' "https://hsyfbfotbpzfhgxfdgom.supabase.co/rest/v1/rpc/heartbeat" >> /home/musi8808/supabase-heartbeat.log 2>&1
   ```
   La clé est la **clé anon/publishable** de `game/src/account.js` : publique par
   conception, sans danger dans un cron. Ne jamais y mettre la `service_role` key.
3. **Vérifier** : `tail -f /home/musi8808/supabase-heartbeat.log` → doit afficher `200`
   (ou `204`). Un `404` = la migration n'est pas encore exécutée ; un `401` = mauvaise
   clé.

> Alternative sans migration (secours) : le cron peut pinger
> `https://hsyfbfotbpzfhgxfdgom.supabase.co/auth/v1/health` (GET, 200 sans clé). C'est
> plus simple mais le signal d'activité est moins explicite que la RPC.

## Passer le site en HTTPS (Let's Encrypt)

État actuel : HTTPS échoue parce qu'o2switch sert un certificat **auto-signé** par défaut
(`SSL certificate problem: self-signed certificate`). La procédure :

1. **Installer le certificat gratuit** : cPanel → Sécurité → **Let's Encrypt SSL** →
   « Générer » en face de `roychec.com`. Décocher les domaines `.odns.fr` /
   `.o2switch.net` qui ne pointent pas vers l'hébergement, valider. Le renouvellement
   est automatique (géré par cPanel).
2. **Forcer la redirection HTTP → HTTPS** : déjà en place dans `game/.htaccess`
   (règles officielles o2switch, déployées automatiquement au prochain push).
   ⚠️ **Ordre** : installer le certificat AVANT de pousser ce fichier, sinon `http://`
   redirige vers le certificat auto-signé et le site semble cassé.
3. **Autoriser l'URL dans Supabase** (magic link) : Dashboard Supabase →
   Authentication → URL Configuration → **Redirect URLs** → ajouter
   `https://roychec.com` (le client renvoie `emailRedirectTo: origin`).
4. **Vérifier** : `https://roychec.com` → cadenas vert, puis `http://roychec.com`
   doit répondre en 301 vers HTTPS (rechargement forcé `Cmd+Shift+R`). Le jeu ne
   référence aucune ressource `http://` (contrôlé) : aucun contenu mixte attendu.
5. **HSTS** : l'en-tête `Strict-Transport-Security: max-age=31536000` est déjà posé
   dans `game/.htaccess` (sans `includeSubDomains` : les sous-domaines cPanel n'ont
   pas tous un certificat Let's Encrypt). Vérifier :
   `curl -sI https://roychec.com | grep -i strict-transport` → en-tête présent.

## Référencement (Google — visibilité « roychec »)

État au 20/08/2026 : site **pas encore indexé** (aucune meta, pas de sitemap). Le socle
est dans le repo et se déploie automatiquement :

- `game/index.html` : title descriptif, meta description, canonical, Open Graph / Twitter
  Cards, JSON-LD (schema.org `WebSite` + `VideoGame`) — testé sous la CSP stricte du jeu
  (le JSON-LD inline n'est pas bloqué).
- `game/robots.txt` + `game/sitemap.xml` → déployés à la racine du site.
- `game/assets/og-image.png` (1200×630, généré depuis le favicon).
- `.htaccess` : redirection `www.roychec.com` → `roychec.com` (canonical unique).

Pour passer du « socle » à « visible dans Google » :

1. **Google Search Console** (https://search.google.com/search-console) → « Ajouter une
   propriété » → `https://roychec.com` (ou propriété de **domaine** `roychec.com` via une
   entrée TXT dans les DNS chez o2switch).
2. Vérifier la propriété (fichier HTML à déposer dans `public_html`, ou TXT DNS).
3. **Sitemaps** → soumettre `https://roychec.com/sitemap.xml`.
4. **Inspection d'URL** → `https://roychec.com/` → « Demander l'indexation ».
5. Patienter quelques jours, puis tester « roychec » dans Google.

Notes :

- L'indexation d'un site neuf prend généralement 1 à 2 semaines.
- Le jeu est une application canvas : presque aucun texte crawlable — le
  title/description/JSON-LD portent le SEO. Un vrai texte d'intro visible (hors canvas)
  améliorerait le référencement plus tard (à décider avec le game-designer).

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
