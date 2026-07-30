-- ============================================================================
-- roychec — Schéma Supabase, CYCLE B (trophées)
-- Réf : design/spec-online.md §3 (barème) et §4.3 (RPC + trigger + anti-spam).
--
-- OÙ LE COLLER :
--   Dashboard Supabase → projet roychec → SQL Editor → New query → coller tout ce
--   fichier → RUN. Idempotent (OR REPLACE / DROP IF EXISTS), relançable sans casse.
--
-- ORDRE : À exécuter APRÈS supabase/schema.sql (cycle A). Ce fichier suppose que la
--   table public.profiles existe déjà (colonnes trophies, last_match_at incluses).
--
-- CE QUE ÇA GARANTIT (spec §4.3) :
--   - Le client n'écrit JAMAIS trophies directement : la colonne est en lecture seule
--     hors de la fonction apply_match_result (trigger guard_trophies).
--   - Le delta n'est jamais fourni par le client : il est dérivé côté serveur du couple
--     (difficulté, résultat) selon le barème figé — impossible de réclamer +9999.
--   - Anti-spam : un appel toutes les 15 s maximum par joueur.
--   Limite assumée : un joueur déterminé peut appeler la RPC (1/15 s) sans vraiment
--   gagner (jeu 100 % client). La vraie parade = phase PvP en ligne (serveur autoritatif).
-- ============================================================================

-- ---------------------------------------------------------------------------
-- RPC : applique le résultat d'une partie et renvoie le NOUVEAU total de trophées.
-- security definer : s'exécute avec les droits du propriétaire pour pouvoir écrire
-- trophies malgré le trigger de garde (qui n'autorise l'écriture que via cette voie).
-- ---------------------------------------------------------------------------
create or replace function public.apply_match_result(p_difficulty int, p_won boolean)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_delta int;
  v_new   int;
  v_last  timestamptz;
begin
  -- Barème serveur (miroir de spec §3.1). SOURCE DE VÉRITÉ pour l'écriture.
  v_delta := case p_difficulty
    when 1 then case when p_won then 10 else -8 end   -- Débutant
    when 2 then case when p_won then 18 else -5 end   -- Intermédiaire
    when 3 then case when p_won then 28 else -3 end   -- Avancé
    else 0 end;

  -- Anti-spam : refuse un appel si le dernier date de moins de 15 s.
  select last_match_at into v_last from profiles where id = auth.uid();
  if v_last is not null and now() - v_last < interval '15 seconds' then
    raise exception 'rate_limited';
  end if;

  update profiles
     set trophies = greatest(0, trophies + v_delta),   -- plancher 0 (spec §3.1)
         last_match_at = now(),
         updated_at = now()
   where id = auth.uid()
   returning trophies into v_new;

  if v_new is null then
    raise exception 'profile_not_found';  -- pseudo pas encore posé
  end if;

  return v_new;
end $$;

-- Autorise l'appel de la RPC par les utilisateurs authentifiés.
grant execute on function public.apply_match_result(int, boolean) to authenticated;

-- ---------------------------------------------------------------------------
-- Trigger de garde : interdit TOUTE modification directe de trophies hors RPC.
-- La RPC (security definer) contourne ce verrou car elle écrit en tant que propriétaire ;
-- un UPDATE direct depuis le client (même sur sa propre ligne) est rejeté.
-- ---------------------------------------------------------------------------
create or replace function public.guard_trophies()
returns trigger
language plpgsql
as $$
begin
  if new.trophies <> old.trophies then
    raise exception 'trophies is read-only (use apply_match_result)';
  end if;
  return new;
end $$;

drop trigger if exists profiles_guard_trophies on public.profiles;
create trigger profiles_guard_trophies
  before update on public.profiles
  for each row execute function public.guard_trophies();
