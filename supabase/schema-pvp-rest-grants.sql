-- ============================================================================
-- roychec — Tier 3 REST bypass (v5.9.11, 2026-07-28)
-- ============================================================================
-- Trigger / contexte : PostgREST `pgrst_db_watch` du projet
--   hsyfbfotbpzfhgxfdgom est dans un état dégradé — NOTIFY + ALTER TABLE + DROP
--   TYPE CASCADE ne forcent plus le reload du cache RPC. Conséquence :
--   `rpc('pvp_find_match', ...)` retourne 400 « structure of query does not
--   match function result type » indéfiniment du côté client (cf.
--   obsidian/Logs/2026-07-28.md [02:30]→[04:30]).
--
-- Solution retenue (user go Tier 3A) : on bypass `pvp_find_match` côté client
-- en utilisant `supabase.from('matches').select/insert/update/delete(...)` REST
-- direct sur la table `matches`. PostgREST utilise un chemin de cache DIFFÉRENT
-- pour les opérations REST sur tables exposées (vs les appels RPC SECURITY
-- DEFINER), donc l'introspection ne se bloque pas sur la même signature
-- cachée cassée.
--
-- Cette migration ajoute 3 RLS policies (insert/update/delete), 1 helper
-- SECURITY DEFINER pour le profil adversaire (puisque profiles RLS interdit au
-- client de lire la ligne d'un autre joueur), et GRANTs table-level.
--
-- Pré-requis (déjà poussés) :
--   * schema-pvp-w1.sql        : table matches + RLS sélectif
--   * schema-pvp-taille.sql    : colonne matches.taille varchar(4) + RPC composite
--   * schema-hardening.sql     : trigger matches_rate_limit_check (30 INSERT/UPDATE par minute)
--
-- Sécurité :
--   * INSERT POLICY : avec CHECK (auth.uid() = p1) — je ne peux créer QUE des
--     matchs où JE suis p1. Impossible d'usurper un autre joueur en créateur.
--   * UPDATE POLICY : USING (status='waiting' AND private=false OR je suis déjà
--     participant) — claim autorisé sur match public OU update légitime de mon
--     propre match. WITH CHECK (auth.uid() = p1 OR auth.uid() = p2 OR p2 IS
--     NULL) — invariant post-update : soit je reste participant, soit p2 reste
--     null (waiting).
--   * DELETE POLICY : USING (auth.uid() = p1 AND status = 'waiting') — je ne
--     peux annuler QUE mes propres matchs jamais rejoints (cancelWait). Pas de
--     delete sur des matchs ready/ended (préserve historique).
--   * Trigger rate-limit (schema-hardening) reste actif — limite à 30 INSERT
--     + 30 UPDATE-pose-p2 par minute par joueur, défense contre le spam.
--
-- Surface d'attaque élargie : oui, un client authenticated peut maintenant
-- INSERT/UPDATE/DELETE sur matches directement (vs uniquement via SECURITY
-- DEFINER). Contrebalancé par :
--   * CHECK constraint taille IN ('std','l15') (matches.taille)
--   * CHECK constraint status IN ('waiting', 'ready', 'playing', 'ended', 'disputed', 'voided')
--   * Rate-limit trigger BEFORE INSERT/UPDATE (30/min)
--   * Channel Realtime fonctionne sans dépendance PostgREST RPC
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. INSERT policy : un match ne peut être créé QUE par son créateur p1.
-- ----------------------------------------------------------------------------
drop policy if exists "matches_insert_own" on public.matches;
create policy "matches_insert_own"
  on public.matches for insert
  with check (auth.uid() = p1);

-- ----------------------------------------------------------------------------
-- 2. UPDATE policy :
--   * USING — je peux claim un match public en attente (status=waiting, private=false)
--     OU je peux modifier mon propre match (auth.uid() = p1 OR = p2).
--   * WITH CHECK — après update : soit je reste participant (p1=moi OU p2=moi),
--     soit je maintiens le match en attente (p2 reste null).
--   Note : on ne restreint pas les colonnes updatables (Postgres RLS ne sait
--   pas faire du column-level). Le trigger rate-limit + les CHECK constraint
--   du schéma servent de garde-fous contre les abus (taille, status, etc.).
-- ----------------------------------------------------------------------------
drop policy if exists "matches_update_claim_or_own" on public.matches;
create policy "matches_update_claim_or_own"
  on public.matches for update
  using (
    (status = 'waiting' and private = false)
    or auth.uid() = p1 or auth.uid() = p2
  )
  with check (
    auth.uid() = p1 or auth.uid() = p2 or p2 is null
  );

-- ----------------------------------------------------------------------------
-- 3. DELETE policy : uniquement mes propres matchs en attente (cancelWait).
-- ----------------------------------------------------------------------------
drop policy if exists "matches_delete_own_waiting" on public.matches;
create policy "matches_delete_own_waiting"
  on public.matches for delete
  using (auth.uid() = p1 and status = 'waiting');

-- ----------------------------------------------------------------------------
-- 4. GRANTs table-level. Les policies ci-dessus filtrent au row level, mais
-- sans GRANT le rôle authenticated ne déclenche même pas l'évaluation RLS.
-- (sélection : déjà couvert par matches_select_involved en w1)
-- ----------------------------------------------------------------------------
grant insert on public.matches to authenticated;
grant update on public.matches to authenticated;
grant delete on public.matches to authenticated;
-- grant select on public.matches to authenticated; -- déjà fait via w1 policy

-- ----------------------------------------------------------------------------
-- 5. Helper SECURITY DEFINER pvp_get_opp_profile — fetch publique du profil
-- adversaire (pseudo + trophées) sans exposer les autres colonnes de la
-- table profiles (RLS profiles interdit la lecture cross-user). SECURITY
-- DEFINER fait passer la lecture comme owner de la fonction, ce qui bypass
-- les policies profiles restrictives. RETURNS TABLE 2-cols simple, pas de
-- composite TYPE exotique → pas de risque Type Mismatch côté cache PostgREST.
-- ----------------------------------------------------------------------------
create or replace function public.pvp_get_opp_profile(p_user_id uuid)
returns table(pseudo text, trophies int)
language sql
stable
security definer
set search_path = public
as $$
  select pseudo, trophies from profiles where id = p_user_id;
$$;

grant execute on function public.pvp_get_opp_profile(uuid) to authenticated;

-- ----------------------------------------------------------------------------
-- 6. Idempotence marker pour ré-application sûre (§8.1 §5).
-- ----------------------------------------------------------------------------
comment on policy "matches_insert_own" on public.matches is
  'v5.9.11 (2026-07-28) — Tier 3 REST bypass. Idempotent.';
comment on policy "matches_update_claim_or_own" on public.matches is
  'v5.9.11 (2026-07-28) — Tier 3 REST bypass. Idempotent.';
comment on policy "matches_delete_own_waiting" on public.matches is
  'v5.9.11 (2026-07-28) — Tier 3 REST bypass. Idempotent.';

-- ----------------------------------------------------------------------------
-- 7. NOTIFY pgrst — force reload schema. Les policies UPDATE/INSERT/DELETE
-- sont prises par le watcher via pg_event_trigger ddl_command_end même si
-- l'introspection RPC est cassée (chemin différent).
-- ----------------------------------------------------------------------------
notify pgrst, 'reload schema';
notify pgrst, 'reload config';

-- ============================================================================
-- FIN schema-pvp-rest-grants.sql
-- ============================================================================
