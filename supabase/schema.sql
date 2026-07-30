-- ============================================================================
-- roychec — Schéma Supabase, CYCLE A (compte & session)
-- Réf : design/spec-online.md §4 (portion nécessaire au cycle A).
--
-- OÙ LE COLLER :
--   Dashboard Supabase → projet roychec → SQL Editor → New query → coller tout ce
--   fichier → RUN. À exécuter UNE fois. Idempotent (IF NOT EXISTS / OR REPLACE),
--   on peut le relancer sans casse.
--
-- ORDRE : ce fichier est le CYCLE A. Le cycle B (trophées : fonction RPC
--   apply_match_result + trigger guard_trophies) sera ajouté PLUS TARD, dans un
--   second fichier, une fois le cycle A validé par QA. Ne rien coller d'autre ici.
--
-- CONFIG DASHBOARD À FAIRE EN PLUS (hors SQL) :
--   Auth v2 = MAGIC LINK (le template OTP {{ .Token }} est verrouillé sans SMTP custom,
--   cf. commit aed3c3c0). On garde donc le TEMPLATE EMAIL PAR DÉFAUT INTACT (lien).
--   Authentication → Providers → Email : activé.
--   Authentication → URL Configuration → Site URL : http://localhost:8000
--   Authentication → URL Configuration → Redirect URLs : ajouter http://localhost:8000
--     (et http://localhost:8000/**) — emailRedirectTo doit matcher une URL autorisée.
--   Le SMTP intégré de Supabase a un faible quota d'emails/heure (rate limit) : pour un
--     usage réel, configurer un SMTP custom. Pour tester, quelques envois suffisent.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- Table profiles : une ligne par utilisateur (spec §4.1).
-- La colonne trophies est créée dès maintenant (défaut 0) pour que le cycle B n'ait
-- pas à modifier la table ; au cycle A le client n'écrit que id + pseudo.
-- ---------------------------------------------------------------------------
create table if not exists public.profiles (
  id            uuid primary key references auth.users(id) on delete cascade,
  pseudo        text not null,
  trophies      integer not null default 0 check (trophies >= 0),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  last_match_at timestamptz            -- utilisé par l'anti-spam RPC du cycle B
);

-- Unicité du pseudo INSENSIBLE À LA CASSE (spec §2.2) : « Roi » == « roi ».
create unique index if not exists profiles_pseudo_lower_uidx
  on public.profiles (lower(pseudo));

-- ---------------------------------------------------------------------------
-- Row Level Security : chacun ne voit et n'écrit QUE sa propre ligne (spec §4.2).
-- Pas de leaderboard public en v1 → pas de policy select publique.
-- ---------------------------------------------------------------------------
alter table public.profiles enable row level security;

-- Lecture de sa propre ligne.
drop policy if exists "profiles_select_own" on public.profiles;
create policy "profiles_select_own"
  on public.profiles for select
  using (auth.uid() = id);

-- Création de sa propre ligne (pose du pseudo, spec §4.4).
drop policy if exists "profiles_insert_own" on public.profiles;
create policy "profiles_insert_own"
  on public.profiles for insert
  with check (auth.uid() = id);

-- Mise à jour de sa propre ligne. NOTE : au cycle A, le client n'update rien.
-- La protection de la colonne trophies (trigger guard_trophies) arrive au CYCLE B ;
-- tant qu'aucun code client n'écrit trophies, il n'y a rien à durcir ici.
drop policy if exists "profiles_update_own" on public.profiles;
create policy "profiles_update_own"
  on public.profiles for update
  using (auth.uid() = id)
  with check (auth.uid() = id);
