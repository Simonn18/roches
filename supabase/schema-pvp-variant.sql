-- ============================================================================
-- roychec — VARIANTE de jeu dans les parties privées (« Jouer avec un ami »).
-- Réf : design/gdd.md §7.2 (amendé v3.1) + design/spec-pvp-online.md §4.2.
--
-- OÙ LE COLLER :
--   Dashboard Supabase → projet roychec → SQL Editor → New query → coller TOUT ce
--   fichier → RUN. Idempotent (add column if not exists / drop function if exists +
--   create) : relançable sans casse. AUCUN drop de table, AUCUNE perte de données.
--
-- ORDRE : À exécuter APRÈS schema-pvp-cadence.sql (reprend la DERNIÈRE version de
--   chaque fonction touchée, qui inclut déjà la cadence).
--
-- QUOI :
--   · matches.variant (text, défaut 'pvp_standard') — id de variante GDD §7.2
--     (3 économies × 2 combats = 6 ids). SEULES les parties privées peuvent porter
--     autre chose que 'pvp_standard' : la file publique n'envoie jamais p_variant
--     (pvp_find_match est INCHANGÉE, l'insert hérite du défaut colonne).
--   · pvp_create_private(p_cadence, p_variant) — le créateur impose la variante.
--   · pvp_join_code   — renvoie en plus la variante du créateur (héritage).
--   · pvp_rematch     — la revanche COPIE la variante du match précédent.
--   · pvp_report_result — RE-CRÉÉE (remplace la version schema-pvp-w3.sql) :
--     les parties PRIVÉES et les parties publiques Plateau bonus ne comptent
--     JAMAIS pour l'Elo (le bonus est une file publique dédiée, hors classement).
--     Le match est bien finalisé (status 'ended',
--     winner) mais deltas = 0 et AUCUNE écriture de profiles.trophies.
--     Conséquence assumée : pvp_rematch crée toujours private=true, donc les
--     REVANCHES sont non classées elles aussi (anti-farming entre amis).
--
-- COMPATIBILITÉ : anciennes signatures DROPPÉES (sinon PostgREST « ambiguous »).
--   p_variant a un défaut : un client ≤ ?v=17 qui n'envoie que p_cadence continue
--   de fonctionner en Standard × Standard.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 0) Colonne variant sur matches + garde-fou de valeurs (ids GDD §7.2).
-- ---------------------------------------------------------------------------
alter table public.matches add column if not exists variant text not null default 'pvp_standard';

do $$ begin
  alter table public.matches add constraint matches_variant_chk check (variant in
    ('pvp_standard', 'pvp_plafond15', 'pvp_illimite',
     'pvp_elimX2', 'pvp_plafond15_x2', 'pvp_illimite_x2'));
exception when duplicate_object then null; end $$;

-- ---------------------------------------------------------------------------
-- 1) pvp_create_private — le créateur impose cadence ET variante.
-- ---------------------------------------------------------------------------
drop function if exists public.pvp_create_private();
drop function if exists public.pvp_create_private(int);
drop function if exists public.pvp_create_private(int, text);

create function public.pvp_create_private(p_cadence int default 300, p_variant text default 'pvp_standard')
returns table(match_id uuid, code text)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_me   uuid := auth.uid();
  v_tr   int;
  v_code text;
  v_id   uuid;
begin
  select trophies into v_tr from profiles where id = v_me;
  if v_tr is null then raise exception 'profile_not_found'; end if;

  delete from matches where p1 = v_me and status = 'waiting';

  v_code := pvp_gen_code();
  insert into matches(p1, p1_trophies, status, private, code, cadence, variant)
    values (v_me, v_tr, 'waiting', true, v_code, p_cadence, p_variant)
    returning id into v_id;
  return query select v_id, v_code;
end $$;

grant execute on function public.pvp_create_private(int, text) to authenticated;

-- ---------------------------------------------------------------------------
-- 2) pvp_join_code — renvoie EN PLUS la variante choisie par le créateur (le
--    rejoignant ne choisit pas : il en hérite). Return type étendu → drop obligatoire.
-- ---------------------------------------------------------------------------
drop function if exists public.pvp_join_code(text);

create function public.pvp_join_code(p_code text)
returns table(match_id uuid, side int, opp_pseudo text, opp_trophies int, cadence int, variant text, taille text)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_me  uuid := auth.uid();
  v_tr  int;
  v_id  uuid;
  v_opp uuid;
  v_cad int;
  v_var text;
begin
  select trophies into v_tr from profiles where id = v_me;
  if v_tr is null then raise exception 'profile_not_found'; end if;

  delete from matches where p1 = v_me and status = 'waiting';

  select m.id, m.p1, m.cadence, m.variant into v_id, v_opp, v_cad, v_var
  from matches m
  where m.code = upper(p_code)
    and m.status = 'waiting'
    and m.private = true
    and m.p1 <> v_me
  for update skip locked
  limit 1;

  if v_id is null then raise exception 'match_not_found'; end if;

  update matches m
     set p2 = v_me, p2_trophies = v_tr, status = 'ready', ready_at = now()
   where m.id = v_id and m.status = 'waiting';
  if not found then raise exception 'match_not_found'; end if;

  return query
    select v_id, 1, pr.pseudo, pr.trophies, v_cad, v_var
    from profiles pr where pr.id = v_opp;
end $$;

grant execute on function public.pvp_join_code(text) to authenticated;

-- ---------------------------------------------------------------------------
-- 3) pvp_rematch — la revanche COPIE cadence ET variante du match précédent
--    (les deux joueurs les avaient acceptées). Return type étendu → drop obligatoire.
--    Base : version schema-pvp-cadence.sql (verrou + rematch_of idempotent).
-- ---------------------------------------------------------------------------
drop function if exists public.pvp_rematch(uuid);

create function public.pvp_rematch(p_prev uuid)
returns table(match_id uuid, side int, opp_pseudo text, opp_trophies int, cadence int, variant text, taille text)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
#variable_conflict use_column
declare
  v_me   uuid := auth.uid();
  v_prev matches%rowtype;
  v_new  uuid;
  v_np1  uuid;   -- nouveau J1 = ancien J2 (couleurs inversées)
  v_np2  uuid;   -- nouveau J2 = ancien J1
  v_tr1  int;
  v_tr2  int;
  v_side int;
  v_opp  uuid;
begin
  if v_me is null then raise exception 'not_authenticated'; end if;
  select * into v_prev from matches m where m.id = p_prev for update;
  if not found then raise exception 'match_not_found'; end if;
  if v_me <> v_prev.p1 and v_me <> v_prev.p2 then raise exception 'not_a_player'; end if;
  if v_prev.p2 is null then raise exception 'no_opponent'; end if;

  v_np1 := v_prev.p2;   -- inversion des couleurs (§9.4)
  v_np2 := v_prev.p1;

  -- Le nouveau match a-t-il déjà été créé par l'autre joueur ?
  select id into v_new from matches m where m.rematch_of = p_prev limit 1;
  if v_new is null then
    select pr.trophies into v_tr1 from profiles pr where pr.id = v_np1;
    select pr.trophies into v_tr2 from profiles pr where pr.id = v_np2;
    insert into matches(p1, p2, p1_trophies, p2_trophies, status, private, rematch_of, ready_at, cadence, variant, taille)
      values (v_np1, v_np2, coalesce(v_tr1, 0), coalesce(v_tr2, 0), 'ready', true, p_prev, now(), v_prev.cadence, v_prev.variant, v_prev.taille)
      returning id into v_new;
  end if;

  if v_me = v_np1 then v_side := 0; v_opp := v_np2; else v_side := 1; v_opp := v_np1; end if;
  return query
    select v_new, v_side, pr.pseudo, pr.trophies, v_prev.cadence, v_prev.variant, v_prev.taille::text
    from profiles pr where pr.id = v_opp;
end $$;

grant execute on function public.pvp_rematch(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 4) pvp_report_result — REMPLACE la version schema-pvp-w3.sql. La signature
DROP FUNCTION IF EXISTS public.pvp_report_result(uuid, text, boolean);
DROP FUNCTION IF EXISTS public.pvp_report_result(uuid, text);
-- historique a trois arguments est supprimee pour eviter tout overload
-- vulnerable avant la recreation durcie a deux arguments. Ajout : les
--    parties PRIVÉES (private = true, donc « Jouer avec un ami » ET revanches)
--    ne comptent JAMAIS pour l'Elo (décision utilisateur 12/07, spec §4.3 v3.3).
--    Le match est finalisé normalement (status 'ended', winner, ended_at) mais
--    p1_delta = p2_delta = 0 et profiles.trophies n'est PAS touché.
--    La signature durcie est explicitement recreee ci-dessous.
-- ---------------------------------------------------------------------------
create function public.pvp_report_result(
  p_match_id uuid,
  p_result text
)
returns table(applied boolean, my_delta int, my_total int, match_status text)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
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
begin
  if p_result not in ('win', 'loss', 'draw') then
    raise exception 'bad_result';
  end if;

  -- Verrou de ligne : sérialise les deux rapports concurrents (le 2e voit le 1er).
  select * into v_m from matches m where m.id = p_match_id for update;
  if not found then raise exception 'match_not_found'; end if;
  if v_me <> v_m.p1 and v_me <> v_m.p2 then raise exception 'not_a_player'; end if;
  v_is_p1 := (v_me = v_m.p1);

  -- Déjà finalisé : renvoyer le delta stocké (anti-double-écriture).
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

  -- Enregistrer MON rapport (met aussi à jour la copie locale v_m).
  if v_is_p1 then
    update matches m set result_p1 = p_result where m.id = p_match_id;
    v_m.result_p1 := p_result;
  else
    update matches m set result_p2 = p_result where m.id = p_match_id;
    v_m.result_p2 := p_result;
  end if;

  -- Peut-on finaliser ?
  if v_m.result_p1 is not null and v_m.result_p2 is not null then
    if v_m.result_p1 = 'win'  and v_m.result_p2 = 'loss' then v_concord := true; v_winner := 0;
    elsif v_m.result_p1 = 'loss' and v_m.result_p2 = 'win'  then v_concord := true; v_winner := 1;
    elsif v_m.result_p1 = 'draw' and v_m.result_p2 = 'draw' then v_concord := true; v_draw := true;
    else v_concord := false;  -- ex. deux « win » → litige
    end if;
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

  -- --- Concordant ---
  if v_m.private or v_m.taille = 'bonus' then
    -- PARTIE PRIVÉE ou PLATEAU BONUS PUBLIC : NON CLASSÉE.
    -- Finalisation normale (winner, ended_at) mais deltas 0 et trophies intouchés.
    v_d1 := 0;
    v_d2 := 0;
  else
    -- File publique : calcul Elo simplifié K=32 (spec §8.1).
    v_tr1  := v_m.p1_trophies;
    v_tr2  := coalesce(v_m.p2_trophies, 0);
    v_exp1 := 1.0 / (1.0 + power(10.0, (v_tr2 - v_tr1)::numeric / 400.0));
    v_score1 := case when v_draw then 0.5 when v_winner = 0 then 1.0 else 0.0 end;
    v_d1 := round(32 * (v_score1 - v_exp1))::int;
    v_d2 := -v_d1;

    -- Habilite l'écriture de trophies pour CETTE transaction uniquement (guard_trophies).
    perform set_config('app.trophies_writer', 'pvp_report_result', true);

    -- Écriture atomique sur les DEUX profils (plancher 0, pas de plafond — spec §8.1).
    update profiles pr set trophies = greatest(0, pr.trophies + v_d1), updated_at = now()
     where pr.id = v_m.p1;
    update profiles pr set trophies = greatest(0, pr.trophies + v_d2), updated_at = now()
     where pr.id = v_m.p2;
  end if;

  update matches m
     set status   = 'ended',
         winner   = case when v_draw then null else v_winner end,
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

grant execute on function public.pvp_report_result(uuid, text) to authenticated;
