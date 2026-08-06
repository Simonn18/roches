-- ============================================================================
-- ROYCHEC — HARDENING SECURITE AUTORISATIONS (2026-08-06)
-- ============================================================================
-- A EXECUTER EN DERNIER, APRES LES MIGRATIONS schema-pvp-*.sql actuellement
-- deployees (notamment schema-pvp-variant.sql, schema-pvp-taille.sql,
-- schema-pvp-w3.sql et schema-pvp-bonus-public-fix.sql).
--
-- AUDIT :
--   - Aucun role admin ni privilege special n'est expose par le front actuel.
--   - Les controles UI de main.js (compte connecte, mode en ligne) sont UX ;
--     ils ne constituent pas une autorisation.
--   - schema-pvp-rest-grants.sql ouvrait des INSERT/UPDATE/DELETE directs sur
--     matches au role authenticated. Ces mutations contournaient les RPC.
--   - pvp_report_result acceptait p_opponent_abandoned depuis le navigateur et
--     pouvait donc finaliser un gain unilateral sans preuve serveur.
--
-- OBJECTIF : toute action sensible passe par les RPC SECURITY DEFINER qui
-- verifient auth.uid(), les contraintes de la partie et, pour les trophees,
-- les rapports concordants des deux joueurs.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1) Garantir le verrou serveur des trophees, meme si cette migration est
--    executee apres schema.sql mais avant une ancienne version W3.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.guard_trophies()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NEW.trophies IS DISTINCT FROM OLD.trophies
     AND coalesce(current_setting('app.trophies_writer', true), '') <> 'pvp_report_result' THEN
    RAISE EXCEPTION 'trophies is read-only (use pvp_report_result)';
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS profiles_guard_trophies ON public.profiles;
CREATE TRIGGER profiles_guard_trophies
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.guard_trophies();

-- ---------------------------------------------------------------------------
-- 2) Fermer le bypass REST direct sur matches.
--    Les RPC de matchmaking/resultat restent executables par authenticated et
--    s'executent avec les droits du proprietaire de la fonction.
-- ---------------------------------------------------------------------------
REVOKE INSERT, UPDATE, DELETE ON public.matches FROM PUBLIC, anon, authenticated;

-- Policies creees uniquement pour le bypass REST historique : sans grants elles
-- ne sont deja plus exploitables ; on les retire pour eviter toute reactivation
-- accidentelle lors d'un audit futur.
DROP POLICY IF EXISTS "matches_insert_own" ON public.matches;
DROP POLICY IF EXISTS "matches_update_claim_or_own" ON public.matches;
DROP POLICY IF EXISTS "matches_delete_own_waiting" ON public.matches;

-- ---------------------------------------------------------------------------
-- 3) Retirer les fonctions internes de la surface API publique.
-- ---------------------------------------------------------------------------
REVOKE EXECUTE ON FUNCTION public.pvp_gen_code() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.matches_rate_limit_check() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.guard_trophies() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.pvp_get_opp_profile(uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.pvp_cancel_wait() FROM PUBLIC, anon;

-- ---------------------------------------------------------------------------
-- 4) Supprimer la signature vulnerable pvp_report_result(uuid,text,boolean)
--    et la remplacer par une signature sans drapeau fourni par le client.
--    Un abandon unilateral n'accorde plus de trophees : il faut deux rapports
--    coherents. Cela evite qu'un joueur fabrique p_opponent_abandoned=true.
-- ---------------------------------------------------------------------------
REVOKE EXECUTE ON FUNCTION public.pvp_report_result(uuid, text, boolean)
  FROM PUBLIC, anon, authenticated;
DROP FUNCTION IF EXISTS public.pvp_report_result(uuid, text, boolean);
DROP FUNCTION IF EXISTS public.pvp_report_result(uuid, text);

CREATE FUNCTION public.pvp_report_result(
  p_match_id uuid,
  p_result text
)
RETURNS TABLE(applied boolean, my_delta int, my_total int, match_status text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
#variable_conflict use_column
declare
  v_me       uuid := auth.uid();
  v_m        matches%rowtype;
  v_is_p1    boolean;
  v_tr1      int;
  v_tr2      int;
  v_exp1     numeric;
  v_score1   numeric;
  v_d1       int;
  v_d2       int;
  v_winner   int;
  v_draw     boolean := false;
  v_concord  boolean := false;
  v_unranked boolean := false;
begin
  if v_me is null then raise exception 'not_authenticated'; end if;
  if p_result not in ('win', 'loss', 'draw') then raise exception 'bad_result'; end if;

  -- Verrou de ligne : les deux rapports concurrents sont serialises.
  select * into v_m from public.matches m where m.id = p_match_id for update;
  if not found then raise exception 'match_not_found'; end if;
  if v_me <> v_m.p1 and v_me <> v_m.p2 then raise exception 'not_a_player'; end if;
  v_is_p1 := (v_me = v_m.p1);

  -- Un resultat ne peut concerner qu'une partie effectivement rejointe.
  if v_m.status = 'ended' then
    return query
      select true,
             coalesce(case when v_is_p1 then v_m.p1_delta else v_m.p2_delta end, 0),
             (select pr.trophies from public.profiles pr where pr.id = v_me),
             'ended'::text;
    return;
  end if;
  if v_m.status in ('disputed', 'voided') then
    return query
      select false, 0,
             (select pr.trophies from public.profiles pr where pr.id = v_me),
             v_m.status;
    return;
  end if;
  if v_m.p2 is null or v_m.status not in ('ready', 'playing') then
    raise exception 'match_not_playing';
  end if;

  -- Enregistrer uniquement le rapport du joueur authentifie.
  if v_is_p1 then
    update public.matches m set result_p1 = p_result where m.id = p_match_id;
    v_m.result_p1 := p_result;
  else
    update public.matches m set result_p2 = p_result where m.id = p_match_id;
    v_m.result_p2 := p_result;
  end if;

  -- Finalisation uniquement si les deux joueurs ont rapporte un resultat
  -- mathematiquement coherent.
  if v_m.result_p1 is not null and v_m.result_p2 is not null then
    if v_m.result_p1 = 'win' and v_m.result_p2 = 'loss' then
      v_concord := true; v_winner := 0;
    elsif v_m.result_p1 = 'loss' and v_m.result_p2 = 'win' then
      v_concord := true; v_winner := 1;
    elsif v_m.result_p1 = 'draw' and v_m.result_p2 = 'draw' then
      v_concord := true; v_draw := true;
    end if;
  end if;

  if not v_concord then
    if v_m.result_p1 is not null and v_m.result_p2 is not null then
      update public.matches m
         set status = 'disputed', ended_at = now()
       where m.id = p_match_id;
      return query
        select false, 0,
               (select pr.trophies from public.profiles pr where pr.id = v_me),
               'disputed'::text;
    else
      return query
        select false, 0,
               (select pr.trophies from public.profiles pr where pr.id = v_me),
               'playing'::text;
    end if;
    return;
  end if;

  -- Partie privee et Bonus : resultat enregistre mais jamais classe.
  v_unranked := coalesce(v_m.private, false) or v_m.taille = 'bonus';
  if v_unranked then
    v_d1 := 0;
    v_d2 := 0;
  else
    v_tr1 := v_m.p1_trophies;
    v_tr2 := coalesce(v_m.p2_trophies, 0);
    v_exp1 := 1.0 / (1.0 + power(10.0, (v_tr2 - v_tr1)::numeric / 400.0));
    v_score1 := case when v_draw then 0.5 when v_winner = 0 then 1.0 else 0.0 end;
    v_d1 := round(32 * (v_score1 - v_exp1))::int;
    v_d2 := -v_d1;

    -- Le trigger guard_trophies n'autorise cette ecriture que dans cette RPC.
    perform set_config('app.trophies_writer', 'pvp_report_result', true);
    update public.profiles pr
       set trophies = greatest(0, pr.trophies + v_d1), updated_at = now()
     where pr.id = v_m.p1;
    update public.profiles pr
       set trophies = greatest(0, pr.trophies + v_d2), updated_at = now()
     where pr.id = v_m.p2;
  end if;

  update public.matches m
     set status = 'ended',
         winner = case when v_draw then null else v_winner end,
         p1_delta = v_d1,
         p2_delta = v_d2,
         ended_at = now()
   where m.id = p_match_id;

  return query
    select true,
           case when v_is_p1 then v_d1 else v_d2 end,
           (select pr.trophies from public.profiles pr where pr.id = v_me),
           'ended'::text;
end $$;

REVOKE EXECUTE ON FUNCTION public.pvp_report_result(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.pvp_report_result(uuid, text) TO authenticated;

-- Fonctions publiques sensibles : pas d'appel anonyme, uniquement un JWT
-- Supabase valide. Les verifications d'identite restent dans chaque RPC via
-- auth.uid(), jamais dans le front.
REVOKE EXECUTE ON FUNCTION public.pvp_find_match(int, int, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.pvp_find_match(int, int, text, text) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.pvp_create_private(int, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.pvp_create_private(int, text, text) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.pvp_join_code(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.pvp_join_code(text) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.pvp_rematch(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.pvp_rematch(uuid) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.pvp_cancel_wait() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.pvp_cancel_wait() TO authenticated;

-- ---------------------------------------------------------------------------
-- 5) Realtime : limiter les canaux prives aux participants du match.
--    Cela protege l'abonnement et l'emission sur match:<uuid>. RLS ne valide
--    pas le JSON du broadcast ; la legalite des coups doit donc rester cote
--    serveur/RPC ou Edge Function. Le serveur ne doit jamais attribuer de
--    resultat sur la seule base d'un message Realtime client.
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "match participants can receive realtime" ON realtime.messages;
CREATE POLICY "match participants can receive realtime"
  ON realtime.messages
  FOR SELECT
  TO authenticated
  USING (
    realtime.messages.extension IN ('broadcast', 'presence')
    AND EXISTS (
      SELECT 1
      FROM public.matches m
      WHERE realtime.topic() = 'match:' || m.id::text
        AND (m.p1 = (SELECT auth.uid()) OR m.p2 = (SELECT auth.uid()))
    )
  );

DROP POLICY IF EXISTS "match participants can send realtime" ON realtime.messages;
CREATE POLICY "match participants can send realtime"
  ON realtime.messages
  FOR INSERT
  TO authenticated
  WITH CHECK (
    realtime.messages.extension IN ('broadcast', 'presence')
    AND EXISTS (
      SELECT 1
      FROM public.matches m
      WHERE realtime.topic() = 'match:' || m.id::text
        AND (m.p1 = (SELECT auth.uid()) OR m.p2 = (SELECT auth.uid()))
    )
  );

NOTIFY pgrst, 'reload schema';
NOTIFY pgrst, 'reload config';

-- VERIFICATIONS MANUELLES APRES DEPLOIEMENT :
--   1) SELECT has_table_privilege('authenticated','public.matches','INSERT');
--      attendu : false (idem UPDATE/DELETE).
--   2) Un appel a pvp_report_result(..., 'win', true) doit echouer car la
--      signature a trois arguments n'existe plus.
--   3) Un seul rapport doit retourner match_status='playing'; aucun trophee
--      ne doit bouger avant le rapport coherent de l'autre joueur.
--   4) Deux rapports contradictoires doivent produire 'disputed' et zero trophee.
-- ============================================================================
