-- ============================================================================
-- supabase/schema-pvp-join-fix.sql (2026-07-16)
-- Fix « Returned type character varying(4) does not match expected type text in
-- column 7 » sur la RPC pvp_join_code.
--
-- OÙ LE COLLER :
--   Dashboard Supabase → projet roychec → SQL Editor → New query → coller TOUT ce
--   fichier → RUN. Idempotent : drop+create function, relançable sans casse.
--   AUCUNE perte de données (les matchs en cours ne sont pas touchés).
--
-- ROOT CAUSE (analysé 2026-07-16) :
--   La migration schema-pvp-taille.sql ajoute `matches.taille varchar(4)` (PAR
--   RAPPORT à la contrainte CHECK sur 'std'|'l15' qui tient en 4 chars) et
--   `pvp_join_code` RETURNS TABLE(... taille text ...) sélectionne
--   `v_match.taille` directement. PostgreSQL devrait faire un cast implicite
--   varchar(4)→text au runtime, MAIS PostgREST valide STRICTEMENT sur le cache
--   pg_proc.prorettype ; il a cache la signature avec `text`, mais à l'appel
--   rpc('pvp_join_code', ...) il voit la valeur réelle retournée `varchar(4)`
--   → PGRST erreur 42804 « structure of query does not match function result
--   type ».
--
-- FIX :
--   - CAST EXPLICITE côté SQL : `v_match.cadence::int`, `v_match.variant::text`,
--     `v_match.taille::text`. Élimine l'ambiguïté type, PostgREST ne peut plus
--     confondre.
--   - NOTIFY pgrst, 'reload config' + 'reload schema' : force PostgREST à
--     invalider son cache immédiatement (sinon il faut attendre ~60 s ou un
--     re-trigger pour rafraichir).
--
-- COMPATIBILITÉ :
--   - DROP FUNCTION IF EXISTS public.pvp_join_code(text) : sans casse si absente
--     (loose).
--   - CREATE OR REPLACE FUNCTION : signature identique `pvp_join_code(p_code
--     text)` qu'on a déjà déployé (Phase A.2/A.3/A.3d).
--   - Grant EXECUTE TO authenticated : standard.
--   - Le code JS online.js appelle cette RPC sans changement (le retour reste
--     `match_id, side, opp_pseudo, opp_trophies, cadence, variant, taille` —
--     mêmes colonnes, même ordre, mêmes types côté PostgREST après le reload).
-- ============================================================================

-- ----------------------------------------------------------------------------
-- Drop + recreate pvp_join_code avec CAST EXPLICITES
-- ----------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.pvp_join_code(text);

CREATE OR REPLACE FUNCTION public.pvp_join_code(p_code text)
RETURNS TABLE (
  match_id uuid,
  side int,
  opp_pseudo text,
  opp_trophies int,
  cadence int,
  variant text,
  taille text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
declare
  v_me     uuid := auth.uid();
  v_tr     int;
  v_match  record;
begin
  select trophies into v_tr from profiles where id = v_me;
  if v_tr is null then raise exception 'profile_not_found'; end if;

  -- Purge des MES matchs en attente avant de tester le code (sinon un match waiting
  -- blockerait la jonction côté joignant).
  delete from matches where p1 = v_me and status = 'waiting';

  -- Anti-blocage : si je tente de rejoindre MON propre code, on renvoie mon match
  -- (status='waiting') — permet à l'UI de détecter que je suis le créateur et
  -- afficher l'input code comme « vous êtes le créateur ».
  select * into v_match from matches
   where code = upper(p_code) and status = 'waiting' and private = true
   limit 1;
  if v_match.id is null then raise exception 'match_not_found'; end if;

  -- Idempotent : si je suis déjà p1 (rejoin de mon propre code), no-op + retour.
  if v_match.p1 = v_me then
    return query
      select
        v_match.id,
        0::int,
        null::text,
        null::int,
        v_match.cadence::int,           -- EXPLICIT cast : int déclaré, matches.cadence int
        v_match.variant::text,          -- EXPLICIT cast : variante peut être NULL ou text
        v_match.taille::text;           -- ← FIX : cast varchar(4)→text explicite (sinon PGRST erreur col 7)
    return;
  end if;

  update matches
     set p2 = v_me, status = 'playing',
         p2_trophies = v_tr
   where id = v_match.id and status = 'waiting';
  if not found then raise exception 'match_raced'; end if;

  return query
    select
      v_match.id,
      1::int,
      (select pseudo from profiles where id = v_match.p1)::text,  -- cast explicite aussi
      v_match.p1_trophies::int,                                    -- profil.trophies int → cast no-op mais explicite
      v_match.cadence::int,
      v_match.variant::text,
      v_match.taille::text                                       -- ← FIX v5.6.4 cast varchar(4)→text
    ;
end $$;

GRANT EXECUTE ON FUNCTION public.pvp_join_code(text) TO authenticated;

-- ----------------------------------------------------------------------------
-- PostgREST cache flush immédiat (sinon attendre ~60 s pour invalidation).
-- NOTIFY pgrst trigger le rechargement du pg_catalog dans le cache HTTP.
-- ----------------------------------------------------------------------------
NOTIFY pgrst, 'reload config';
NOTIFY pgrst, 'reload schema';

-- ============================================================================
-- FIN schema-pvp-join-fix.sql
-- ============================================================================
