-- ============================================================================
-- roychec — HEARTBEAT anti-pause (plan gratuit Supabase).
-- Réf : https://supabase.com/docs/guides/platform/going-into-prod
--       (« We may pause applications on the Free Plan that exhibit low activity
--        in a 7-day period »).
--
-- OÙ LE COLLER :
--   Dashboard Supabase → projet roychec → SQL Editor → New query → coller TOUT ce
--   fichier → RUN. Idempotent (create or replace / grant), relançable sans casse.
--   AUCUN drop de table, AUCUNE perte de données, rien à re-exécuter après.
--
-- POURQUOI :
--   Le plan gratuit met le projet en pause après 7 jours sans activité, ce qui
--   coupe l'auth, le Realtime et les RPC PvP jusqu'à ce qu'un joueur réveille le
--   projet. Un cron cPanel (o2switch, voir DEPLOYMENT.md §anti-pause) appelle
--   cette RPC toutes les heures : chaque appel HTTP compte comme activité API,
--   donc pas de pause.
--
-- SÉCURITÉ :
--   - `security invoker` + un simple `select now()` : aucun accès aux données,
--     aucune écriture. Exécutable sans danger par la clé anon (publique par
--     conception — c'est la même clé embarquée dans game/src/account.js).
--   - Pas de table, pas de trigger, pas de donnée persistée. Renvoie l'heure
--     serveur : pratique pour vérifier la bonne exécution dans le SQL Editor.
-- ============================================================================

-- RPC heartbeat : renvoyée via POST /rest/v1/rpc/heartbeat (headers apikey +
-- Authorization: Bearer <clé anon>, body {}).
create or replace function public.heartbeat()
returns timestamptz
language sql
security invoker
set search_path = public
as $$
  select now();
$$;

-- La clé anon (utilisée par le cron et par le jeu) doit pouvoir l'appeler.
-- `authenticated` par cohérence avec le reste du schéma.
grant execute on function public.heartbeat() to anon, authenticated;

-- Force le rechargement du cache schéma PostgREST : sans ça, le cron peut recevoir
-- un 404 PGRST202 pendant plusieurs minutes après le RUN (déjà rencontré sur les
-- RPC PvP, cf. scripts/diag-v6-pvp-overloads.mjs).
notify pgrst, 'reload schema';
