-- ============================================================================
-- supabase/schema-pvp-taille.sql — v5.10 (2026-07-29) [patched Phase A.5 v2 Phase 5.A] — base Phase A.3d (2026-07-16)
-- ============================================================================
-- Étend la table `matches` et les RPC PvP V2 avec la dimension du plateau
-- (8×8 'std' / 15×8 'l15'). Verrou GDD §7.2 v3.5 : la file publique en ligne
-- reste 8×8 strict (Elo + hors-compétition) ; le 15×8 est autorisé uniquement
-- en PvP PRIVÉ (créateur impose, rejoignant hérite via pvp_join_code).
--
-- Migration par défaut 'std' : aucun match existant n'est impacté, l'ancien
-- UI continue de fonctionner sans toucher au RPC tant que l'option l15
-- n'est pas activée côté client.
--
-- Pré-requis :
--   * schema-pvp-w1.sql (table matches)
--   * schema-pvp-cadence.sql (RPC pvp_find_match avec cadence)
--   * schema-pvp-public-variant.sql (RPC pvp_find_match avec variant)
--   * schema-pvp-variant.sql (RPC pvp_create_private / pvp_join_code V2)
--   * schema-pvp-w3.sql (RPC pvp_apply_match_result, trophées)
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Extension de la table `matches`
-- ----------------------------------------------------------------------------
ALTER TABLE public.matches
  ADD COLUMN IF NOT EXISTS taille varchar(4) NOT NULL DEFAULT 'std'
    CHECK (taille IN ('std', 'l15'));

CREATE INDEX IF NOT EXISTS idx_active_variant_taille_status
  ON public.matches (variant, taille, status)
  WHERE status = 'waiting';

-- Self-doc : v5.10 Phase 5.A — commentaire sur la colonne pour outils d'audit
-- (admin SQL, dashboard Supabase, vault reviewer).
COMMENT ON COLUMN public.matches.taille IS
  'v5.10 (2026-07-29) Phase A.5 v2 Phase 5.A — dimension du plateau (std=8x8 | l15=8x15). '
  'PRIVÉ accepte l15 (créateur impose via pvp_create_private(p_taille), rejoignant '
  'hérite via pvp_join_code retourne row.taille) ; PUBLIC forcée std (GDD §7.2 '
  'v3.5 lock strict Elo, online.js findMatch force online.taille=std). '
  'Default std → backward-compat avec tous les matchs existants pré-Phase 5.A.';

-- ----------------------------------------------------------------------------
-- 2. RPC V2 : pair-finding tenant compte de la taille
-- ----------------------------------------------------------------------------
-- SUB-FILE KEY = (variant, taille, cadence). Deux clients avec la même
-- cadence/variant/taille sont appariés ; toute mixité 8×8↔15×8 est rejetée
-- côté serveur. Default 'std' partout → aucun match existant ne casse.
--
-- IMPORTANT (Phase A.3d fix client→server mismatch) : la fonction exposée
-- au client s'appelle `pvp_find_match` (cf. game/src/online.js L231). On
-- DROP ici la version 2-args `pvp_find_match(int,int)` (créée par
-- schema-pvp-cadence.sql) ET la version 3-args `pvp_find_match(int,int,text)`
-- (créée par schema-pvp-public-variant.sql) avant de recréer la version
-- 4-args étendue. PostgREST « ambiguous » entre overloads → drop obligatoire.
DROP FUNCTION IF EXISTS public.pvp_find_match(int);
DROP FUNCTION IF EXISTS public.pvp_find_match(int, int);
DROP FUNCTION IF EXISTS public.pvp_find_match(int, int, text);
-- v5.7c (2026-07-16) — DROP de la version 4-args precedente (taille=text) avant
-- recreation en varchar(4). Sans ça PostgreSQL refuse le CREATE OR REPLACE
-- (42P13 cannot change return type) parce que la signature match exactement.
DROP FUNCTION IF EXISTS public.pvp_find_match(int, int, text, text);
-- v5.7d (2026-07-28, hot-fix gemini valider) — TYPE composite EXPLICITE
-- `public.pvp_find_match_result` au lieu de `RETURNS TABLE(...)` (qui est
-- sucre syntaxique pour `RETURNS SETOF record` → PostgREST voit le pseudo-type
-- `prorettype=record, typtype='p'` plutôt qu'un composite type, source du 400
-- « structure of query does not match function result type » intermittent
-- après la cascade migrations schema-pvp-cadence / -public-variant / -taille
-- Schema Cache TTL 60s+ amplifie l'instabilité). Le TYPE nommé est stable,
-- introspectable par PostgREST, et ELIMINE le desync table-pseudo.
-- Idempotent : DROP TYPE IF EXISTS avant CREATE (composite type droppé en
-- cascade avec la fonction si schema-pvp-taille.sql est re-poussé un jour).
DROP TYPE IF EXISTS public.pvp_find_match_result CASCADE;
CREATE TYPE public.pvp_find_match_result AS (
  match_id uuid,
  side int,
  status text,
  opp_pseudo text,
  opp_trophies int,
  cadence int,
  variant text,
  taille varchar(4)
);
CREATE OR REPLACE FUNCTION public.pvp_find_match(
  p_band int DEFAULT 100,
  p_cadence int DEFAULT 300,
  p_variant text DEFAULT 'pvp_standard',
  p_taille text DEFAULT 'std'
)
RETURNS SETOF public.pvp_find_match_result
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
#variable_conflict use_column
declare
  v_me  uuid := auth.uid();
  v_tr  int;
  v_id  uuid;
  v_opp uuid;
  v_cad int;
  v_var text;
  v_tai text;
begin
  IF p_taille NOT IN ('std','l15') THEN
    RAISE EXCEPTION 'taille invalide: %, attendu std|l15', p_taille;
  END IF;

  select pr.trophies into v_tr from profiles pr where pr.id = v_me;
  if v_tr is null then raise exception 'profile_not_found'; end if;

  -- Purge : si j'attendais dans la file avec une AUTRE taille, cette attente
  -- est caduque (le client n'a qu'une recherche à la fois). Le 15×8 reste
  -- autorisé uniquement en PvP PRIVÉ (file publique reste 'std' forcée par
  -- online.js findMatch côté client) — ce purge est défensif au cas où.
  delete from matches m
   where m.p1 = v_me and m.status = 'waiting' and m.private = false
     and (m.taille <> p_taille or m.variant <> p_variant);

  -- 0) Quelqu'un a-t-il rejoint MON match public en attente ?
  select m.id, m.p2, m.cadence, m.variant, m.taille
    into v_id, v_opp, v_cad, v_var, v_tai
  from matches m
  where m.p1 = v_me
    and m.status = 'ready'
    and m.private = false
    and m.p2 is not null
    and m.variant = p_variant
    and m.taille  = p_taille
    and m.ready_at > now() - interval '5 minutes'
  order by m.ready_at desc
  limit 1;
  if v_id is not null then
    return query
      select v_id, 0, 'ready'::text, pr.pseudo, pr.trophies,v_cad, v_var, v_tai::varchar(4)
      from profiles pr where pr.id = v_opp;
    return;
  end if;

  -- 1) Rejoindre un match public ouvert compatible (MÊME cadence + MÊME
    --    variante + MÊME taille). Note : on conserve la sémantique « side=1 /
  --    rejoignant » lorsque le match passe en ready, identique à
  --    schema-pvp-public-variant.sql — le verrouiller avec p_taille dans la
  --    chaîne WHERE garantit qu'un match 8×8 n'est jamais apparié avec un
  --    match 15×8 (GDD §7.2 v3.5 strict côté file publique).
  select m.id, m.p1 into v_id, v_opp
  from matches m
  where m.status = 'waiting'
    and m.private = false
    and m.p1 <> v_me
    and m.cadence = p_cadence
    and m.variant = p_variant
    and m.taille  = p_taille
    and abs(m.p1_trophies - v_tr) <= p_band
  order by m.created_at
  for update skip locked
  limit 1;

  if v_id is not null then
    update matches m
       set p2 = v_me, p2_trophies = v_tr, status = 'ready', ready_at = now()
     where m.id = v_id and m.status = 'waiting';
    if found then
      delete from matches m
       where m.p1 = v_me and m.status = 'waiting' and m.private = false and m.id <> v_id;
      return query
        select v_id, 1, 'ready'::text, pr.pseudo, pr.trophies, p_cadence, p_variant, p_taille::varchar(4)
        from profiles pr where pr.id = v_opp;
      return;
    end if;
  end if;

  -- 2) J'ai déjà un match public en attente → le renvoyer.
  select m.id into v_id
  from matches m
  where m.p1 = v_me and m.status = 'waiting' and m.private = false
  limit 1;
  if v_id is not null then
    return query select v_id, 0, 'waiting'::text, null::text, null::int, p_cadence, p_variant, p_taille::varchar(4);
    return;
  end if;

  -- 3) Aucun compatible : créer un match en attente (side 0 / J1).
  insert into matches(p1, p1_trophies, status, cadence, variant, taille)
    values (v_me, v_tr, 'waiting', p_cadence, p_variant, p_taille)
    returning id into v_id;
  return query select v_id, 0, 'waiting'::text, null::text, null::int, p_cadence, p_variant, p_taille::varchar(4);
end $$;

GRANT EXECUTE ON FUNCTION public.pvp_find_match(int, int, text, text) TO authenticated;

-- ----------------------------------------------------------------------------
-- 3. RPC V2 : pvp_create_privateV2 — le créateur impose la taille
-- ----------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.pvp_create_private(int, text, text);
CREATE OR REPLACE FUNCTION public.pvp_create_private(
  p_cadence int DEFAULT 300,
  p_variant text DEFAULT 'pvp_standard',
  p_taille text DEFAULT 'std'
)
RETURNS TABLE (
  match_id uuid,
  code text
)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
declare
  v_me uuid := auth.uid();
  v_tr int;
  v_code text;
  v_id uuid;
begin
  IF p_taille NOT IN ('std','l15') THEN
    RAISE EXCEPTION 'taille invalide: %, attendu std|l15', p_taille;
  END IF;

  SELECT trophies INTO v_tr FROM public.profiles WHERE id = v_me;

  -- Nettoie mes anciennes attentes (privé + public).
  DELETE FROM public.matches
   WHERE p1 = v_me AND status = 'waiting';

  v_code := public.pvp_gen_code();
  v_id := gen_random_uuid();

  INSERT INTO public.matches (id, p1, p1_trophies, status, private, code, cadence, variant, taille)
    VALUES (v_id, v_me, v_tr, 'waiting', true, v_code, p_cadence, p_variant, p_taille);

  RETURN QUERY SELECT v_id, v_code;
END;
$$;

GRANT EXECUTE ON FUNCTION public.pvp_create_private(int, text, text) TO authenticated;

-- ----------------------------------------------------------------------------
-- 4. RPC V2 : pvp_join_codeV2 — le rejoignant HÉRITE de la taille
-- ----------------------------------------------------------------------------
-- Lecture de la taille via le code : le serveur impose la même taille au
-- rejoignant (pas d'override client possible). Garantit que le lockstep
-- §5.4 reste cohérent (les deux clients jouent sur le même plateau).
DROP FUNCTION IF EXISTS public.pvp_join_code(text);
-- v5.7b (2026-07-16, hot-fix) — RETURNS TABLE column `taille` doit être `varchar(4)`
-- pour matcher EXACTEMENT le type de la colonne matches.taille. L'ancien `text` lève
-- PostgREST 400 « structure of query does not match function result type » sur
-- column 7 (cf. logs 16/07). 3 lignes parallèles : find_match aussi bite si jamais appelé.
CREATE OR REPLACE FUNCTION public.pvp_join_code(p_code text)
RETURNS TABLE (
  match_id uuid, side int, opp_pseudo text, opp_trophies int, cadence int, variant text, taille varchar(4)
)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
declare
  v_me uuid := auth.uid();
  v_match record;
begin
  -- v5.7 (2026-07-16) — Round 2 error differentiation : 'match_not_found' vs.
  -- 'match_full' vs 'match_expired' pour diagnostic user clair (sans DevTools).
  -- Ancien message 'code introuvable ou partie non disponible' masquait la
  -- distinction « partie déjà complète » et « partie expirée / annulée ».
  SELECT * INTO v_match FROM public.matches
   WHERE code = UPPER(p_code) AND private = true
   FOR UPDATE;

  IF v_match.id IS NULL THEN
    RAISE EXCEPTION 'match_not_found';        -- code inconnu OU match clôturé
  END IF;

  IF v_match.status = 'playing' OR v_match.p2 IS NOT NULL THEN
    RAISE EXCEPTION 'match_full';              -- match déjà rejoint (par moi ou un tiers)
  END IF;

  IF v_match.status NOT IN ('waiting') THEN
    RAISE EXCEPTION 'match_expired';           -- match annulé/terminé par créateur
  END IF;

  -- Idempotent : si je suis déjà p1 (rejoindre mon propre code), no-op.
  IF v_match.p1 = v_me THEN
    RETURN QUERY SELECT
      v_match.id, 0::int, NULL::text, NULL::int, v_match.cadence, v_match.variant, v_match.taille;
    RETURN;
  END IF;

  UPDATE public.matches
     SET p2 = v_me, status = 'playing',
         p2_trophies = (SELECT trophies FROM public.profiles WHERE id = v_me)
   WHERE id = v_match.id;

  RETURN QUERY SELECT
    v_match.id, 1::int,
    (SELECT pseudo FROM public.profiles WHERE id = v_match.p1),
    v_match.p1_trophies,
    v_match.cadence,
    v_match.variant,
    v_match.taille;
END;
$$;

GRANT EXECUTE ON FUNCTION public.pvp_join_code(text) TO authenticated;

-- ============================================================================
-- FIN schema-pvp-taille.sql
-- ============================================================================

-- v5.7b — Force reload du cache PostgREST (sinon l'ancien RETURNS TABLE reste
-- en cache 60s+ après le push SQL). Sans ça, le client online.js catch le
-- 400 'structure of query does not match' pendant ~60s après le push.
NOTIFY pgrst, 'reload schema';
