-- ============================================================================
-- roychec — Schéma Supabase, CYCLE W1 (PvP en ligne : matchmaking & handshake)
-- Réf : design/spec-pvp-online.md §4 (matchmaking), §4.4 (table + RLS), §8.1
--       (remise à 0 des trophées), §10 « Cycle W1 ».
--
-- OÙ LE COLLER :
--   Dashboard Supabase → projet roychec → SQL Editor → New query → coller TOUT ce
--   fichier → RUN. Idempotent (create ... if not exists / create or replace /
--   drop policy if exists) : relançable sans casse.
--
-- ORDRE : À exécuter APRÈS supabase/schema.sql (cycle A) et, si présent,
--   supabase/schema-cycle-b.sql (cycle B). Ce fichier suppose que public.profiles
--   existe (colonnes id, pseudo, trophies).
--
-- PÉRIMÈTRE W1 (spec §10) — matchmaking + handshake UNIQUEMENT :
--   - table public.matches + RLS ;
--   - RPC pvp_find_match / pvp_cancel_wait / pvp_create_private / pvp_join_code ;
--   - remise à 0 des trophées (purge du ladder pollué par le farm PvAI, v2).
--   PAS ENCORE : pvp_report_result (Elo), révocation de apply_match_result, mise à
--   jour de guard_trophies → ce sera le CYCLE W3 (autre fichier).
--
-- CONFIG DASHBOARD À FAIRE EN PLUS (hors SQL) :
--   Realtime doit être activé (il l'est par défaut). Le transport des coups (W2) et
--   le handshake (W1) passent par Realtime BROADCAST sur un canal éphémère
--   « match:{id} » — AUCUNE publication postgres_changes n'est nécessaire sur
--   public.matches (spec §2.1). Rien à cocher côté Replication.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 0) Table matches (spec §4.4). Sert au matchmaking, au statut de partie et (W3)
--    au résultat. Les COUPS ne transitent JAMAIS par cette table (Broadcast, §2.1).
-- ---------------------------------------------------------------------------
create table if not exists public.matches (
  id            uuid primary key default gen_random_uuid(),
  p1            uuid not null references public.profiles(id) on delete cascade,
  p2            uuid          references public.profiles(id) on delete cascade,
  p1_trophies   int  not null,
  p2_trophies   int,
  status        text not null default 'waiting',   -- waiting | ready | playing | ended | disputed | voided
  private       boolean not null default false,
  code          text unique,                        -- code d'invitation (partie privée)
  result_p1     text,   -- 'win'|'loss'|'draw' rapporté par p1 (W3)
  result_p2     text,
  winner        int,    -- 0|1|null — figé serveur au W3 (rapports concordants)
  created_at    timestamptz not null default now(),
  ready_at      timestamptz,
  ended_at      timestamptz
);


-- Index d'appariement : les scans de matchmaking filtrent status='waiting'.
create index if not exists matches_waiting_idx
  on public.matches (status, private, created_at);

-- ---------------------------------------------------------------------------
-- 1) RLS (spec §4.4). Un joueur ne LIT que les matchs où il est impliqué, PLUS les
--    matchs 'waiting' (pour connaître ceux à rejoindre). Toutes les MUTATIONS
--    passent par les RPC security definer ci-dessous : aucune policy insert/update/
--    delete n'est exposée au client.
-- ---------------------------------------------------------------------------
alter table public.matches enable row level security;

drop policy if exists "matches_select_involved" on public.matches;
create policy "matches_select_involved"
  on public.matches for select
  using (auth.uid() = p1 or auth.uid() = p2 or status = 'waiting');

-- ---------------------------------------------------------------------------
-- 2) RPC pvp_find_match (spec §4.1) — matchmaking public, FIFO, bande élargissante.
--    ATOMIQUE : SELECT ... FOR UPDATE SKIP LOCKED empêche qu'un même match soit
--    pris par deux joueurs. IDEMPOTENT pour le créateur : rappelé toutes les 2 s
--    avec une bande croissante, il ne crée PAS de doublon (il renvoie son match en
--    attente existant). Renvoie aussi opp_pseudo/opp_trophies (spec §9.5) via une
--    jointure profiles franchie grâce au security definer (la RLS profiles interdit
--    au client de lire la ligne de l'adversaire).
-- ---------------------------------------------------------------------------
create or replace function public.pvp_find_match(p_band int default 100)
returns table(match_id uuid, side int, status text, opp_pseudo text, opp_trophies int)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_me  uuid := auth.uid();
  v_tr  int;
  v_id  uuid;
  v_opp uuid;
begin
  select trophies into v_tr from profiles where id = v_me;
  if v_tr is null then raise exception 'profile_not_found'; end if;

  -- 1) Rejoindre un match public ouvert compatible (bande de trophées).
  select id, p1 into v_id, v_opp
  from matches
  where status = 'waiting'
    and private = false
    and p1 <> v_me
    and abs(p1_trophies - v_tr) <= p_band
  order by created_at
  for update skip locked
  limit 1;

  if v_id is not null then
    -- Verrou re-vérifié : l'UPDATE n'aboutit que si le match est TOUJOURS 'waiting'.
    update matches
       set p2 = v_me, p2_trophies = v_tr, status = 'ready', ready_at = now()
     where id = v_id and status = 'waiting';
    if found then
      -- Anti-orphelin : si j'avais moi-même un match public en attente, je le supprime.
      delete from matches
       where p1 = v_me and status = 'waiting' and private = false and id <> v_id;
      return query
        select v_id, 1, 'ready'::text, pr.pseudo, pr.trophies
        from profiles pr where pr.id = v_opp;
      return;
    end if;
  end if;

  -- 2) J'ai déjà un match public en attente → le renvoyer (pas de doublon).
  select id into v_id
  from matches
  where p1 = v_me and status = 'waiting' and private = false
  limit 1;
  if v_id is not null then
    return query select v_id, 0, 'waiting'::text, null::text, null::int;
    return;
  end if;

  -- 3) Aucun compatible : créer un match en attente (je suis side 0 / Joueur 1).
  insert into matches(p1, p1_trophies, status)
    values (v_me, v_tr, 'waiting')
    returning id into v_id;
  return query select v_id, 0, 'waiting'::text, null::text, null::int;
end $$;

grant execute on function public.pvp_find_match(int) to authenticated;

-- ---------------------------------------------------------------------------
-- 3) RPC pvp_cancel_wait (spec §4.2) — quitter la file : supprime MES matchs en
--    attente (publics ou privés jamais rejoints). Un match déjà 'ready' n'est pas
--    touché (l'adversaire est déjà entré).
-- ---------------------------------------------------------------------------
create or replace function public.pvp_cancel_wait()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  delete from matches where p1 = auth.uid() and status = 'waiting';
end $$;

grant execute on function public.pvp_cancel_wait() to authenticated;

-- ---------------------------------------------------------------------------
-- 4) Génération de code d'invitation (spec §4.3) — 6 caractères en base32 SANS
--    ambigus (pas de 0/O/1/I). Boucle jusqu'à obtenir un code non collidant.
-- ---------------------------------------------------------------------------
create or replace function public.pvp_gen_code()
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_alpha constant text := '23456789ABCDEFGHJKLMNPQRSTUVWXYZ'; -- 32 symboles, sans 0/O/1/I
  v_code text;
  v_i int;
begin
  loop
    v_code := '';
    for v_i in 1..6 loop
      v_code := v_code || substr(v_alpha, 1 + floor(random() * 32)::int, 1);
    end loop;
    -- Unicité : on ne réutilise pas un code encore actif.
    exit when not exists (select 1 from matches where code = v_code and status in ('waiting','ready','playing'));
  end loop;
  return v_code;
end $$;

-- ---------------------------------------------------------------------------
-- 5) RPC pvp_create_private (spec §4.3) — crée une partie privée avec code.
--    Le créateur est side 0 (Joueur 1). Nettoie d'abord un éventuel match public
--    en attente du même joueur (il quitte la file publique pour la privée).
-- ---------------------------------------------------------------------------
create or replace function public.pvp_create_private()
returns table(match_id uuid, code text)
language plpgsql
security definer
set search_path = public
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
  insert into matches(p1, p1_trophies, status, private, code)
    values (v_me, v_tr, 'waiting', true, v_code)
    returning id into v_id;
  return query select v_id, v_code;
end $$;

grant execute on function public.pvp_create_private() to authenticated;

-- ---------------------------------------------------------------------------
-- 6) RPC pvp_join_code (spec §4.3) — rejoindre une partie privée par code, SANS
--    contrainte de bande de trophées. Même atomicité que pvp_find_match.
-- ---------------------------------------------------------------------------
create or replace function public.pvp_join_code(p_code text)
returns table(match_id uuid, side int, opp_pseudo text, opp_trophies int)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_me  uuid := auth.uid();
  v_tr  int;
  v_id  uuid;
  v_opp uuid;
begin
  select trophies into v_tr from profiles where id = v_me;
  if v_tr is null then raise exception 'profile_not_found'; end if;

  delete from matches where p1 = v_me and status = 'waiting';

  select id, p1 into v_id, v_opp
  from matches
  where code = upper(p_code)
    and status = 'waiting'
    and private = true
    and p1 <> v_me
  for update skip locked
  limit 1;

  if v_id is null then raise exception 'match_not_found'; end if;

  update matches
     set p2 = v_me, p2_trophies = v_tr, status = 'ready', ready_at = now()
   where id = v_id and status = 'waiting';
  if not found then raise exception 'match_not_found'; end if;

  return query
    select v_id, 1, pr.pseudo, pr.trophies
    from profiles pr where pr.id = v_opp;
end $$;

grant execute on function public.pvp_join_code(text) to authenticated;

-- ---------------------------------------------------------------------------
-- 7) Remise à 0 des trophées (spec §8.1) — purge du ladder pollué par le farm
--    PvAI. Tous les joueurs repartent de 0 pour le ladder PvP exclusif.
--    NOTE : si le trigger de garde guard_trophies (cycle B) existe, il interdit
--    toute écriture directe de trophies ; on le DÉSACTIVE le temps de la purge puis
--    on le réactive. S'il n'existe pas encore, on écrit directement.
-- ---------------------------------------------------------------------------
do $$
begin
  if exists (select 1 from pg_trigger where tgname = 'profiles_guard_trophies') then
    execute 'alter table public.profiles disable trigger profiles_guard_trophies';
    update public.profiles set trophies = 0, updated_at = now();
    execute 'alter table public.profiles enable trigger profiles_guard_trophies';
  else
    update public.profiles set trophies = 0, updated_at = now();
  end if;
end $$;
