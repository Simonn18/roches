-- ============================================================================
-- roychec — Schéma Supabase, CYCLE W3 (PvP en ligne : robustesse & TROPHÉES).
-- Réf : design/spec-pvp-online.md §3.5 (cross-validation du résultat), §8 (Elo K=32,
--       ladder PvP exclusif, une seule RPC habilitée), §8.3 (exception abandon), §10 W3.
--
-- OÙ LE COLLER :
--   Dashboard Supabase → projet roychec → SQL Editor → New query → coller TOUT ce
--   fichier → RUN. Idempotent (alter ... if not exists / create or replace /
--   drop ... if exists) : relançable sans casse, aucune perte de données.
--
-- ORDRE : à exécuter APRÈS supabase/schema.sql (cycle A), schema-cycle-b.sql (cycle B),
--   schema-pvp-w1.sql ET schema-pvp-w1-fix.sql (cycle W1). Ce fichier suppose que
--   public.profiles (id, pseudo, trophies) et public.matches existent.
--
-- CE QUE CE FICHIER FAIT (spec §10 « Cycle W3 ») :
--   1. Ajoute les colonnes de résultat manquantes sur matches (deltas Elo par joueur).
--   2. Crée la RPC pvp_report_result : chaque client rapporte le résultat en fin de
--      partie ; les trophées Elo (K=32, plancher 0) ne sont écrits QUE si les DEUX
--      rapports concordent (l'un « win », l'autre « loss » — ou les deux « draw »),
--      Aucun gain unilateral n'est accepte : un rapport coherent des deux joueurs
--      est requis pour attribuer des trophees.
--      Anti-double-écriture : un match ne « paie » qu'une fois (verrou FOR UPDATE +
--      garde status='ended').
--   3. RÉVOQUE et SUPPRIME apply_match_result (PvAI) — dernier vecteur de farm fermé.
--   4. Reforge guard_trophies : trophies devient écrivable UNIQUEMENT par
--      pvp_report_result (détectée via un flag de session posé par la RPC).
--
-- APPLICATION DES LEÇONS DU JOUR :
--   · Piège RETURNS TABLE → une variable OUT par colonne : toutes les références de
--     colonnes de tables sont qualifiées par alias (m., pr.) + directive
--     #variable_conflict use_column en tête de fonction.
--   · Côté client, PostgREST sérialise ce RETURNS TABLE en TABLEAU d'une ligne :
--     online.js fait `const row = Array.isArray(data) ? data[0] : data;`.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 0) Colonnes de résultat (spec §4.4). result_p1/result_p2/winner/ended_at existent
--    déjà (schema-pvp-w1.sql). On ajoute les deltas Elo figés par joueur, pour qu'un
--    rapport tardif (le 1er rapporteur qui re-poll après finalisation) puisse relire
--    SON delta sans le recalculer (anti-double-écriture).
-- ---------------------------------------------------------------------------
alter table public.matches add column if not exists p1_delta int;
alter table public.matches add column if not exists p2_delta int;
-- Lien de revanche (§9.4) : un match rematch pointe vers le match précédent. UNIQUE →
-- les DEUX joueurs appelant pvp_rematch(prev) obtiennent le MÊME nouveau match (idempotent).
alter table public.matches add column if not exists rematch_of uuid;
create unique index if not exists matches_rematch_of_uidx
  on public.matches (rematch_of) where rematch_of is not null;

-- ---------------------------------------------------------------------------
-- 1) guard_trophies — trophies en LECTURE SEULE hors pvp_report_result (spec §8.2).
--    La RPC pose un flag de session local à la transaction
--    (set_config('app.trophies_writer', 'pvp_report_result', true)) ; le trigger
--    n'autorise l'écriture QUE si ce flag est présent. Un UPDATE direct depuis le
--    client (même sur sa propre ligne, même via une autre RPC) est rejeté.
--    NB : security definer ne suffit PAS à contourner un trigger — d'où le flag.
-- ---------------------------------------------------------------------------
create or replace function public.guard_trophies()
returns trigger
language plpgsql
as $$
begin
  if new.trophies is distinct from old.trophies then
    if coalesce(current_setting('app.trophies_writer', true), '') <> 'pvp_report_result' then
      raise exception 'trophies is read-only (use pvp_report_result)';
    end if;
  end if;
  return new;
end $$;

drop trigger if exists profiles_guard_trophies on public.profiles;
create trigger profiles_guard_trophies
  before update on public.profiles
  for each row execute function public.guard_trophies();

-- ---------------------------------------------------------------------------
-- 2) RPC pvp_report_result (spec §3.5 / §8) — LA SEULE écriture autoritaire de trophies.
-- La signature historique a trois arguments : on la supprime avant de recréer
-- la version durcie à deux arguments, pour éviter un overload vulnérable.
DROP FUNCTION IF EXISTS public.pvp_report_result(uuid, text, boolean);
DROP FUNCTION IF EXISTS public.pvp_report_result(uuid, text);
--    p_result           : 'win' | 'loss' | 'draw' du point de vue de l'APPELANT.
--    Un abandon ou une deconnexion ne suffit pas a attribuer un gain unilateral :
--    le serveur attend les deux rapports coherents.
--    Retour (RETURNS TABLE → tableau d'1 ligne côté PostgREST) :
--      applied      : true si les trophées ont été écrits (ou l'étaient déjà) ;
--      my_delta     : delta Elo de l'appelant (0 tant que non appliqué) ;
--      my_total     : total de trophées de l'appelant (à jour si appliqué) ;
--      match_status : 'ended' | 'disputed' | 'voided' | 'playing' (en attente).
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

  -- Déjà finalisé : renvoyer le delta stocké (ANTI-DOUBLE-ÉCRITURE — le 1er rapporteur
  -- qui re-poll après finalisation par l'adversaire relit simplement son delta).
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
    -- Deux rapports présents → concordance stricte.
    if v_m.result_p1 = 'win'  and v_m.result_p2 = 'loss' then v_concord := true; v_winner := 0;
    elsif v_m.result_p1 = 'loss' and v_m.result_p2 = 'win'  then v_concord := true; v_winner := 1;
    elsif v_m.result_p1 = 'draw' and v_m.result_p2 = 'draw' then v_concord := true; v_draw := true;
    else v_concord := false;  -- ex. deux « win » → litige
    end if;
  end if;

  if not v_concord then
    -- Deux rapports mais divergents → litige (aucun trophée). Sinon simple attente.
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

  -- --- Concordant : calcul Elo simplifié K=32 (spec §8.1) ---
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

-- ---------------------------------------------------------------------------
-- 2bis) RPC pvp_rematch (spec §9.4) — revanche entre les deux mêmes joueurs, COULEURS
--    INVERSÉES (l'ex-J2 devient J1). Idempotente : verrou sur le match précédent +
--    contrainte unique rematch_of → un seul nouveau match, quel que soit l'ordre des
--    deux appels. Compte pour les trophées comme toute partie privée (§4.3).
-- ---------------------------------------------------------------------------
create or replace function public.pvp_rematch(p_prev uuid)
returns table(match_id uuid, side int, opp_pseudo text, opp_trophies int)
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
  select * into v_prev from matches m where m.id = p_prev for update;
  if v_me is null then raise exception 'not_authenticated'; end if;
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
    insert into matches(p1, p2, p1_trophies, p2_trophies, status, private, rematch_of, ready_at)
      values (v_np1, v_np2, coalesce(v_tr1, 0), coalesce(v_tr2, 0), 'ready', true, p_prev, now())
      returning id into v_new;
  end if;

  if v_me = v_np1 then v_side := 0; v_opp := v_np2; else v_side := 1; v_opp := v_np1; end if;
  return query
    select v_new, v_side, pr.pseudo, pr.trophies
    from profiles pr where pr.id = v_opp;
end $$;

grant execute on function public.pvp_rematch(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 3) Révocation + suppression de apply_match_result (PvAI) — spec §8.2.
--    Les trophées PvAI sont supprimés (décision v2) : cette RPC est le dernier
--    vecteur de farm. On la révoque PUIS on la supprime. Le client ne l'appelle
--    plus (hookTrophees débranché) : aucune régression fonctionnelle.
-- ---------------------------------------------------------------------------
do $$
begin
  if exists (
    select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'apply_match_result'
  ) then
    revoke execute on function public.apply_match_result(int, boolean) from authenticated;
  end if;
end $$;

drop function if exists public.apply_match_result(int, boolean);

-- ============================================================================
-- VÉRIFICATION MANUELLE (facultatif, à lancer séparément) :
--   -- Un joueur ne peut PAS écrire trophies directement (doit lever une exception) :
--   update public.profiles set trophies = trophies + 999 where id = auth.uid();
--   -- La seule voie légitime est pvp_report_result, appelée à la fin d'un match par
--   -- les DEUX clients (concordance) ou par le survivant d'un abandon.
-- ============================================================================
