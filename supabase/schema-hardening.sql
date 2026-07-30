-- ============================================================================
-- roychec — HARDENING serveur (audit sécurité 12/07, finding S1) :
--   Rate-limit applicatif sur les RPC publiques de matchmaking (pvp_find_match,
--   pvp_create_private) via BEFORE INSERT/UPDATE trigger sur public.matches.
--   Ref : design/spec-pvp-online.md §10 (W3 et après) + supabase/schema-pvp-variant.sql
--         (dernier état de matches avant cette migration).
--
-- OÙ LE COLLER :
--   Dashboard Supabase → projet roychec → SQL Editor → New query → coller TOUT ce
--   fichier → RUN. Idempotent (create or replace function / create ... if not
--   exists / drop trigger if exists) : relançable sans casse. AUCUN drop de
--   table, AUCUNE perte de données.
--
-- ORDRE : À exécuter APRÈS supabase/schema-pvp-variant.sql (qui est le dernier
--   état de public.matches = +cadence +variant +p1_delta +p2_delta +rematch_of).
--
-- QUOI :
--   1) matches_rate_limit_check() — BEFORE INSERT OR UPDATE trigger qui bloque
--      un auth.uid() qui :
--        - INSERT (création de match) plus de 30 fois par minute
--          → couvre pvp_find_match (étape 3 « créer une attente »),
--            pvp_create_private, et le 1er INSERT d'un pvp_rematch ;
--        - UPDATE en posant son propre p2 plus de 30 fois par minute
--          → couvre pvp_join_code et la branche JOIN de pvp_find_match
--            (UPDATE other row → p2 = me, status = 'ready').
--      Les UPDATE qui NE touchent pas p2 (pvp_report_result set winner /
--      ended_at / deltas) NE sont PAS rate-limit : le rapport final du
--      match reste autorisé en permanence.
--   2) 2 index dédiés à la perf du trigger : matches_rl_p1_idx (INSERT) et
--      matches_rl_p2_idx partial (UPDATE). Sans eux, le SELECT count(*) du
--      trigger Seq Scan la table — fatale à grande échelle.
--
-- MODÈLE DE MENACE — ce que S1 COUVRE / NE COUVERT PAS :
--   ✓ Spam massif qui crée/join des matchs → table filling rapide =
--     denaturation du ladder + charge DB → blocage après 30/min
--     (audit rapport-playtest → 528 comptes potentiels, défense en profondeur).
--   ✓ Brute-force code invite (pvp_join_code brand-testing) — borne à 30 essais/min
--     par joueur, alors qu'il existe 32^6 ≈ 1 Md de codes → mitigation S3
--     (audit) incluse gratuitement (sans modification SQL).
--   ✗ Polling CPU storm pur (pvp_find_match toutes les 2s SANS INSERT/UPDATE) :
--     le trigger ne le bloque PAS : la RPC nettoie ses 'waiting' anciens en
--     début de corps, donc count(*) reste naturellement bas en polling régulier.
--     La charge CPU existe (à surveiller via dashboard Supabase) mais ne corrompt
--     pas l'état — correction de ce flux orthogonal dans une migration suivante
--     si les metrics CPU dépassent les seuils Supabase free tier.
--
-- SÉCURITÉ (model Supabase SECURITY DEFINER) :
--   auth.uid() au sein d'un trigger BEFORE INSERT/UPDATE appelé depuis une
--   fonction SECURITY DEFINER renvoie TOUJOURS le caller JWT (pas le rôle
--   postgres interne) — le GUC request.jwt.claims n'est pas écrasé par le
--   switch de rôle. Le trigger fonctionne sans modifier search_path à auth.
--
-- COMPATIBILITÉ :
--   - AUCUNE RPC modifiée. Trigger ONLY, transparent pour le client (le client
--     reçoit juste une exception 'rate_limited' si spam détecté).
--   - pvp_cancel_wait fait des DELETE, pas INSERT/UPDATE → non touché.
--   - pvp_find_match v cadence (cadence different → purge ancien waiting →
--     nouveau waiting) reste possible : chaque cycle cadence-switch = 1 INSERT
--     côté quotas, donc spam = 30 cadences différentes/minute avant blocage.
--     Largement suffisant comme mitigation.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1) Trigger function : matches_rate_limit_check.
--   SECURITY INVOKER (défaut) : le trigger peut lire auth.uid() et matches
--   depuis le rôle postgres (trigger before-insert/update sur table).
--   Si auth.uid() est NULL (pas de session JWT, e.g. seed/test), laisser
--   passer — la RPC SECURITY DEFINER ne pourra rien faire d'utile de toute
--   façon (les policies RLS refuseront la lecture profiles).
-- ---------------------------------------------------------------------------
create or replace function public.matches_rate_limit_check()
returns trigger
language plpgsql
as $$
declare
  v_uid   uuid := auth.uid();
  v_count int;
  v_max   constant int := 30;
begin
  if v_uid is null then
    -- Pas de session JWT (seed/test) : laisser passer.
    return new;
  end if;

  -- INSERT : limiter la CRÉATION de matchs par cet utilisateur.
  -- On ne déclenche QUE si le caller est le créateur (NEW.p1 = v_uid). Sans
  -- ce filtre, un INSERT distant (e.g. match créé en cascade par un autre
  -- joueur en pvp_rematch_of, où NEW.p1 = ancien.p2 ≠ caller) ne rate-limit
  -- PAS le caller — correct : l'INSERT est imputé à l'autre joueur côté quota.
  if tg_op = 'INSERT' and new.p1 = v_uid then
    select count(*) into v_count
      from public.matches m
     where m.p1 = v_uid
       and m.created_at > now() - interval '1 minute';
    if v_count >= v_max then
      raise exception 'rate_limited'
        using hint = 'Trop de parties créées par minute (max 30)';
    end if;

  -- UPDATE : limiter le JOIN (passage p2 = v_uid). On NE déclenche QUE si
  -- p2 vient d'être posé sur CETTE update (NEW.p2 IS DISTINCT FROM OLD.p2)
  -- ET p2 = v_uid. Le UPDATE de pvp_report_result (set winner, ended_at,
  -- p1_delta, p2_delta) ne pose PAS p2 → non rate-limit (rapport final
  -- autorisé en permanence, même en pleine partie serrée).
  elsif tg_op = 'UPDATE'
    and new.p2 is distinct from old.p2
    and new.p2 = v_uid then
    select count(*) into v_count
      from public.matches m
     where m.p2 = v_uid
       and m.ready_at > now() - interval '1 minute';
    if v_count >= v_max then
      raise exception 'rate_limited'
        using hint = 'Trop de joints par minute (max 30)';
    end if;
  end if;

  return new;
end $$;

-- ---------------------------------------------------------------------------
-- 2) Trigger : drop+create idempotent.
-- ---------------------------------------------------------------------------
drop trigger if exists matches_rate_limit on public.matches;
create trigger matches_rate_limit
  before insert or update on public.matches
  for each row execute function public.matches_rate_limit_check();

-- ---------------------------------------------------------------------------
-- 3) Index dédiés au SELECT count(*) du trigger. Sans eux, le trigger fait
--   un Seq Scan sur matches (acceptable à 1k rows, catastrophique à 100k).
--   Ces index sont DIFFÉRENTS de matches_waiting_idx existant (qui couvre
--   (status, private, created_at)) : le trigger ne filtre pas par status,
--   juste par (p1, created_at) ou (p2, ready_at).
--   Le match_rl_p2_idx est PARTIAL (WHERE p2 IS NOT NULL) car la majorité des
--   'waiting' ont p2 = null et n'intéressent pas le compteur d'UPDATE-join.
-- ---------------------------------------------------------------------------
create index if not exists matches_rl_p1_idx
  on public.matches (p1, created_at desc);

create index if not exists matches_rl_p2_idx
  on public.matches (p2, ready_at desc)
  where p2 is not null;

-- ============================================================================
-- VÉRIFICATION MANUELLE (à coller en SQL Editor séparé APRÈS la migration) :
--
--   -- Test 1 : un joueur spamme des INSERTs. Le 31e doit lever 'rate_limited'.
--   do $$
--     declare i int;
--     begin
--       for i in 1..32 loop
--         begin
--           insert into public.matches(p1, p1_trophies, status, private)
--             values (auth.uid(), 0, 'waiting', false);
--         exception when raise_exception then
--           raise notice 'attempt % bloqué : %', i, sqlerrm;
--         end;
--       end loop;
--       rollback;  -- ne rien laisser en base
--     end $$;
--
--   -- Test 2 : UPDATE pvp_report_result (winner, ended_at, p1_delta, p2_delta)
--   -- d'un match 'ended' → ne devrait JAMAIS être bloqué même après 30 reports/min.
--   -- (à adapter au contexte : cas légitime d'usage intense).
--
--   -- Test 3 : plans EXPLAIN pour confirmer l'usage des index :
--   explain (format text) select count(*) from public.matches m
--     where m.p1 = auth.uid() and m.created_at > now() - interval '1 minute';
--   -- attendu : Index Scan using matches_rl_p1_idx
--
--   explain (format text) select count(*) from public.matches m
--     where m.p2 = auth.uid() and m.ready_at > now() - interval '1 minute';
--   -- attendu : Index Scan using matches_rl_p2_idx
-- ============================================================================
