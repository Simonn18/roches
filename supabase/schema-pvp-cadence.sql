-- ============================================================================
-- roychec — CADENCES PvP en ligne (1 min / 5 min / 1 h / 1 jour).
-- Réf : design/spec-pvp-online.md §6 (horloge) + §4 (matchmaking par cadence).
--
-- OÙ LE COLLER :
--   Dashboard Supabase → projet roychec → SQL Editor → New query → coller TOUT ce
--   fichier → RUN. Idempotent (add column if not exists / drop function if exists +
--   create) : relançable sans casse. AUCUN drop de table, AUCUNE perte de données.
--
-- ORDRE : À exécuter APRÈS schema-pvp-w1.sql, schema-pvp-w1-fix.sql et
--   schema-pvp-w3.sql. Reprend la DERNIÈRE version de chaque fonction touchée
--   (pvp_find_match = version w1-fix avec l'étape 0 « créateur notifié »).
--
-- QUOI :
--   · matches.cadence (int, secondes, défaut 300) — temps initial par joueur.
--     Valeurs client : 60 / 300 / 3600 / 86400. L'incrément (+3 s/tour) reste
--     côté client, commun à toutes les cadences.
--   · pvp_find_match(p_band, p_cadence)   — n'apparie que deux joueurs de MÊME
--     cadence ; renvoie la cadence (serveur autoritaire).
--   · pvp_create_private(p_cadence)       — le créateur impose la cadence.
--   · pvp_join_code                       — renvoie en plus la cadence du créateur.
--   · pvp_rematch                         — la revanche COPIE la cadence du match
--     précédent et la renvoie.
--
-- COMPATIBILITÉ : les anciennes signatures sont DROPPÉES (sinon PostgREST voit
--   deux overloads et renvoie une erreur 300 « ambiguous »). p_cadence a un défaut
--   (300) : un client ?v=12 qui n'envoie que p_band continue de fonctionner en 5 min.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 0) Colonne cadence sur matches. Les matchs existants héritent de 300 s (blitz 5 min).
-- ---------------------------------------------------------------------------
alter table public.matches add column if not exists cadence int not null default 300;

-- ---------------------------------------------------------------------------
-- 1) pvp_find_match — appariement PAR CADENCE. Base : version w1-fix (alias m. +
--    #variable_conflict + étape 0). Ajouts : filtre m.cadence = p_cadence à l'étape 1,
--    purge de MES matchs en attente d'une AUTRE cadence (changement de choix sans
--    passer par Annuler), cadence insérée à la création, cadence renvoyée partout.
-- ---------------------------------------------------------------------------
drop function if exists public.pvp_find_match(int);
drop function if exists public.pvp_find_match(int, int);

create function public.pvp_find_match(p_band int default 100, p_cadence int default 300)
returns table(match_id uuid, side int, status text, opp_pseudo text, opp_trophies int, cadence int)
language plpgsql
security definer
set search_path = public
as $$
#variable_conflict use_column
declare
  v_me  uuid := auth.uid();
  v_tr  int;
  v_id  uuid;
  v_opp uuid;
  v_cad int;
begin
  select pr.trophies into v_tr from profiles pr where pr.id = v_me;
  if v_tr is null then raise exception 'profile_not_found'; end if;

  -- Purge : si j'attendais dans la file avec une AUTRE cadence, cette attente est
  -- caduque (le client n'a qu'une recherche à la fois).
  delete from matches m
   where m.p1 = v_me and m.status = 'waiting' and m.private = false
     and m.cadence <> p_cadence;

  -- 0) Quelqu'un a-t-il rejoint MON match public en attente ? (fix w1-fix, BUG 2)
  select m.id, m.p2, m.cadence into v_id, v_opp, v_cad
  from matches m
  where m.p1 = v_me
    and m.status = 'ready'
    and m.private = false
    and m.p2 is not null
    and m.ready_at > now() - interval '5 minutes'
  order by m.ready_at desc
  limit 1;
  if v_id is not null then
    return query
      select v_id, 0, 'ready'::text, pr.pseudo, pr.trophies, v_cad
      from profiles pr where pr.id = v_opp;
    return;
  end if;

  -- 1) Rejoindre un match public ouvert compatible (bande de trophées + MÊME cadence).
  select m.id, m.p1 into v_id, v_opp
  from matches m
  where m.status = 'waiting'
    and m.private = false
    and m.p1 <> v_me
    and m.cadence = p_cadence
    and abs(m.p1_trophies - v_tr) <= p_band
  order by m.created_at
  for update skip locked
  limit 1;

  if v_id is not null then
    -- Verrou re-vérifié : l'UPDATE n'aboutit que si le match est TOUJOURS 'waiting'.
    update matches m
       set p2 = v_me, p2_trophies = v_tr, status = 'ready', ready_at = now()
     where m.id = v_id and m.status = 'waiting';
    if found then
      -- Anti-orphelin : si j'avais moi-même un match public en attente, je le supprime.
      delete from matches m
       where m.p1 = v_me and m.status = 'waiting' and m.private = false and m.id <> v_id;
      return query
        select v_id, 1, 'ready'::text, pr.pseudo, pr.trophies, p_cadence
        from profiles pr where pr.id = v_opp;
      return;
    end if;
  end if;

  -- 2) J'ai déjà un match public en attente (même cadence, cf. purge) → le renvoyer.
  select m.id into v_id
  from matches m
  where m.p1 = v_me and m.status = 'waiting' and m.private = false
  limit 1;
  if v_id is not null then
    return query select v_id, 0, 'waiting'::text, null::text, null::int, p_cadence;
    return;
  end if;

  -- 3) Aucun compatible : créer un match en attente à MA cadence (side 0 / Joueur 1).
  insert into matches(p1, p1_trophies, status, cadence)
    values (v_me, v_tr, 'waiting', p_cadence)
    returning id into v_id;
  return query select v_id, 0, 'waiting'::text, null::text, null::int, p_cadence;
end $$;

grant execute on function public.pvp_find_match(int, int) to authenticated;

-- ---------------------------------------------------------------------------
-- 2) pvp_create_private — le créateur choisit la cadence de la partie privée.
-- ---------------------------------------------------------------------------
drop function if exists public.pvp_create_private();
drop function if exists public.pvp_create_private(int);

create function public.pvp_create_private(p_cadence int default 300)
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
  insert into matches(p1, p1_trophies, status, private, code, cadence)
    values (v_me, v_tr, 'waiting', true, v_code, p_cadence)
    returning id into v_id;
  return query select v_id, v_code;
end $$;

grant execute on function public.pvp_create_private(int) to authenticated;

-- ---------------------------------------------------------------------------
-- 3) pvp_join_code — renvoie EN PLUS la cadence choisie par le créateur (le
--    rejoignant ne choisit pas : il en hérite). Return type étendu → drop obligatoire.
-- ---------------------------------------------------------------------------
drop function if exists public.pvp_join_code(text);

create function public.pvp_join_code(p_code text)
returns table(match_id uuid, side int, opp_pseudo text, opp_trophies int, cadence int)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_me  uuid := auth.uid();
  v_tr  int;
  v_id  uuid;
  v_opp uuid;
  v_cad int;
begin
  select trophies into v_tr from profiles where id = v_me;
  if v_tr is null then raise exception 'profile_not_found'; end if;

  delete from matches where p1 = v_me and status = 'waiting';

  select m.id, m.p1, m.cadence into v_id, v_opp, v_cad
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
    select v_id, 1, pr.pseudo, pr.trophies, v_cad
    from profiles pr where pr.id = v_opp;
end $$;

grant execute on function public.pvp_join_code(text) to authenticated;

-- ---------------------------------------------------------------------------
-- 4) pvp_rematch — la revanche COPIE la cadence du match précédent (les deux
--    joueurs avaient accepté cette cadence). Return type étendu → drop obligatoire.
--    Base : version schema-pvp-w3.sql (verrou + rematch_of idempotent).
-- ---------------------------------------------------------------------------
drop function if exists public.pvp_rematch(uuid);

create function public.pvp_rematch(p_prev uuid)
returns table(match_id uuid, side int, opp_pseudo text, opp_trophies int, cadence int)
language plpgsql
security definer
set search_path = public
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
    insert into matches(p1, p2, p1_trophies, p2_trophies, status, private, rematch_of, ready_at, cadence)
      values (v_np1, v_np2, coalesce(v_tr1, 0), coalesce(v_tr2, 0), 'ready', true, p_prev, now(), v_prev.cadence)
      returning id into v_new;
  end if;

  if v_me = v_np1 then v_side := 0; v_opp := v_np2; else v_side := 1; v_opp := v_np1; end if;
  return query
    select v_new, v_side, pr.pseudo, pr.trophies, v_prev.cadence
    from profiles pr where pr.id = v_opp;
end $$;

grant execute on function public.pvp_rematch(uuid) to authenticated;
