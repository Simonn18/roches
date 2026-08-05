-- ============================================================================
-- roychec — file publique Plateau bonus hors classement (2026-08-04)
-- ============================================================================
-- À exécuter dans Supabase SQL Editor APRÈS schema-pvp-taille.sql et
-- schema-pvp-variant.sql (ou après les migrations actuellement déployées).
--
-- Le client envoie désormais p_taille=bonus à pvp_find_match. La fonction de
-- matchmaking de schema-pvp-taille.sql apparie déjà strictement par
-- (cadence, variante, taille) : bonus ne peut donc rencontrer que bonus.
-- Cette migration complète le changement côté résultat : une partie publique
-- bonus reste jouable en ligne, mais ne modifie aucun trophée.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.pvp_report_result(
  p_match_id uuid,
  p_result text,
  p_opponent_abandoned boolean DEFAULT false
)
RETURNS TABLE(applied boolean, my_delta int, my_total int, match_status text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
#variable_conflict use_column
declare
  v_me      uuid := auth.uid();
  v_m       matches%rowtype;
  v_is_p1   boolean;
  v_tr1     int;
  v_tr2     int;
  v_exp1    numeric;
  v_score1  numeric;
  v_d1      int;
  v_d2      int;
  v_winner  int;
  v_draw    boolean := false;
  v_concord boolean := false;
  v_unranked boolean := false;
begin
  if p_result not in ('win', 'loss', 'draw') then
    raise exception 'bad_result';
  end if;

  select * into v_m from matches m where m.id = p_match_id for update;
  if not found then raise exception 'match_not_found'; end if;
  if v_me <> v_m.p1 and v_me <> v_m.p2 then raise exception 'not_a_player'; end if;
  v_is_p1 := (v_me = v_m.p1);

  if v_m.status = 'ended' then
    return query
      select true,
             coalesce(case when v_is_p1 then v_m.p1_delta else v_m.p2_delta end, 0),
             (select pr.trophies from profiles pr where pr.id = v_me),
             'ended'::text;
    return;
  end if;
  if v_m.status in ('disputed', 'voided') then
    return query
      select false, 0,
             (select pr.trophies from profiles pr where pr.id = v_me),
             v_m.status;
    return;
  end if;

  if v_is_p1 then
    update matches m set result_p1 = p_result where m.id = p_match_id;
    v_m.result_p1 := p_result;
  else
    update matches m set result_p2 = p_result where m.id = p_match_id;
    v_m.result_p2 := p_result;
  end if;

  if v_m.result_p1 is not null and v_m.result_p2 is not null then
    if v_m.result_p1 = 'win' and v_m.result_p2 = 'loss' then
      v_concord := true; v_winner := 0;
    elsif v_m.result_p1 = 'loss' and v_m.result_p2 = 'win' then
      v_concord := true; v_winner := 1;
    elsif v_m.result_p1 = 'draw' and v_m.result_p2 = 'draw' then
      v_concord := true; v_draw := true;
    end if;
  elsif p_opponent_abandoned and p_result = 'win' then
    v_concord := true;
    v_winner := case when v_is_p1 then 0 else 1 end;
  end if;

  if not v_concord then
    if v_m.result_p1 is not null and v_m.result_p2 is not null then
      update matches m set status = 'disputed', ended_at = now() where m.id = p_match_id;
      return query
        select false, 0,
               (select pr.trophies from profiles pr where pr.id = v_me),
               'disputed'::text;
    else
      return query
        select false, 0,
               (select pr.trophies from profiles pr where pr.id = v_me),
               'playing'::text;
    end if;
    return;
  end if;

  -- Public bonus is a separate casual queue; private matches remain casual too.
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

    perform set_config('app.trophies_writer', 'pvp_report_result', true);
    update profiles pr
       set trophies = greatest(0, pr.trophies + v_d1), updated_at = now()
     where pr.id = v_m.p1;
    update profiles pr
       set trophies = greatest(0, pr.trophies + v_d2), updated_at = now()
     where pr.id = v_m.p2;
  end if;

  update matches m
     set status = 'ended',
         winner = case when v_draw then null else v_winner end,
         p1_delta = v_d1,
         p2_delta = v_d2,
         ended_at = now()
   where m.id = p_match_id;

  return query
    select true,
           case when v_is_p1 then v_d1 else v_d2 end,
           (select pr.trophies from profiles pr where pr.id = v_me),
           'ended'::text;
end $$;

grant execute on function public.pvp_report_result(uuid, text, boolean) to authenticated;

NOTIFY pgrst, 'reload schema';
