-- ============================================================================
-- roychec — fix RPC partie privée Plateau bonus (2026-08-04)
-- ============================================================================
-- À exécuter dans Supabase SQL Editor APRÈS les schémas de base.
-- Corrige le 400 sur pvp_create_private quand le client envoie p_taille=bonus.
-- Aucun match existant n'est supprimé ; seuls les anciens overloads RPC sont
-- retirés pour éviter l'ambiguïté PostgREST.
-- ============================================================================

ALTER TABLE public.matches
  ADD COLUMN IF NOT EXISTS taille varchar(5) NOT NULL DEFAULT 'std';
ALTER TABLE public.matches
  ALTER COLUMN taille TYPE varchar(5);

DO $$
DECLARE
  r record;
BEGIN
  -- La contrainte historique peut avoir un nom différent selon la migration.
  FOR r IN
    SELECT conname
    FROM pg_constraint
    WHERE conrelid = 'public.matches'::regclass
      AND contype = 'c'
      AND pg_get_constraintdef(oid) ILIKE '%taille%'
  LOOP
    EXECUTE format('ALTER TABLE public.matches DROP CONSTRAINT %I', r.conname);
  END LOOP;
END $$;

ALTER TABLE public.matches
  ADD CONSTRAINT matches_taille_check
  CHECK (taille IN ('std', 'l15', 'bonus'));

DROP FUNCTION IF EXISTS public.pvp_create_private();
DROP FUNCTION IF EXISTS public.pvp_create_private(int);
DROP FUNCTION IF EXISTS public.pvp_create_private(int, text);
DROP FUNCTION IF EXISTS public.pvp_create_private(int, text, text);

CREATE FUNCTION public.pvp_create_private(
  p_cadence int DEFAULT 300,
  p_variant text DEFAULT 'pvp_standard',
  p_taille text DEFAULT 'std'
)
RETURNS TABLE(match_id uuid, code text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_me uuid := auth.uid();
  v_tr int;
  v_code text;
  v_id uuid;
BEGIN
  IF p_taille NOT IN ('std', 'l15', 'bonus') THEN
    RAISE EXCEPTION 'taille invalide: %, attendu std|l15|bonus', p_taille;
  END IF;

  SELECT trophies INTO v_tr FROM public.profiles WHERE id = v_me;
  IF v_tr IS NULL THEN
    RAISE EXCEPTION 'profile_not_found';
  END IF;

  DELETE FROM public.matches
   WHERE p1 = v_me AND status = 'waiting';

  v_code := public.pvp_gen_code();
  v_id := gen_random_uuid();

  INSERT INTO public.matches
    (id, p1, p1_trophies, status, private, code, cadence, variant, taille)
  VALUES
    (v_id, v_me, v_tr, 'waiting', true, v_code, p_cadence, p_variant, p_taille);

  RETURN QUERY SELECT v_id, v_code;
END;
$$;

GRANT EXECUTE ON FUNCTION public.pvp_create_private(int, text, text)
  TO authenticated;

-- Le créateur et le rejoignant doivent recevoir la même taille. Cette définition
-- garantit que `row.taille` existe aussi sur une base partiellement migrée.
DROP FUNCTION IF EXISTS public.pvp_join_code(text);
CREATE FUNCTION public.pvp_join_code(p_code text)
RETURNS TABLE(
  match_id uuid, side int, opp_pseudo text, opp_trophies int,
  cadence int, variant text, taille varchar(5)
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_me uuid := auth.uid();
  v_match record;
BEGIN
  SELECT * INTO v_match
    FROM public.matches
   WHERE code = upper(p_code) AND private = true
   FOR UPDATE;

  IF v_match.id IS NULL THEN
    RAISE EXCEPTION 'match_not_found';
  END IF;
  IF v_match.status <> 'waiting' OR v_match.p2 IS NOT NULL THEN
    RAISE EXCEPTION 'match_full';
  END IF;

  UPDATE public.matches
     SET p2 = v_me,
         status = 'playing',
         p2_trophies = (SELECT trophies FROM public.profiles WHERE id = v_me)
   WHERE id = v_match.id AND status = 'waiting';
  IF NOT FOUND THEN
    RAISE EXCEPTION 'match_full';
  END IF;

  RETURN QUERY SELECT
    v_match.id,
    1::int,
    (SELECT pseudo FROM public.profiles WHERE id = v_match.p1)::text,
    v_match.p1_trophies::int,
    v_match.cadence::int,
    v_match.variant::text,
    v_match.taille::varchar(5);
END;
$$;

GRANT EXECUTE ON FUNCTION public.pvp_join_code(text) TO authenticated;

NOTIFY pgrst, 'reload config';
NOTIFY pgrst, 'reload schema';

-- ============================================================================
-- FIN migration
-- ============================================================================
