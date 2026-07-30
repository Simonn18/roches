-- ============================================================================
-- roychec — CORRECTIF du CYCLE W1 (matchmaking public).
--
-- QUOI COLLER : tout ce fichier. OÙ : Dashboard Supabase → projet roychec →
--   SQL Editor → New query → coller → RUN. À exécuter APRÈS supabase/schema-pvp-w1.sql.
--   Idempotent : uniquement des CREATE OR REPLACE FUNCTION. AUCUN drop de table,
--   AUCUNE perte de données, relançable sans casse.
--
-- POURQUOI : deux comptes réels ne s'apparient jamais via la file PUBLIQUE. Le
--   client (écran de recherche) affiche désormais l'erreur serveur remontée en
--   boucle :  « Le serveur de jeu ne répond pas (column reference "status" is
--   ambiguous). Nouvelle tentative… »  → confirme que la RPC pvp_find_match plante
--   côté Postgres à CHAQUE appel. Ce fichier corrige DEUX bugs de pvp_find_match.
--   Les parties PRIVÉES (create/join par code) marchaient déjà (voir audit en bas).
--
-- ----------------------------------------------------------------------------
-- BUG 1 — « column reference "status" is ambiguous » (la RPC échoue TOUJOURS).
--   pvp_find_match est déclarée RETURNS TABLE(..., status text, ...). En PL/pgSQL,
--   CHAQUE colonne d'un RETURNS TABLE devient une VARIABLE DE SORTIE du même nom :
--   il existe donc une variable `status` dans la fonction. Le corps écrit ensuite
--   `where status = 'waiting'` SANS qualifier la table → PostgreSQL ne sait pas si
--   `status` désigne la variable OUT ou la colonne matches.status. Sous le réglage
--   par défaut (plpgsql.variable_conflict = error), il lève une exception à chaque
--   appel. Non vu par le QA W1 : le client Supabase était mocké, aucun appel réel
--   n'atteignait Postgres.
--   FIX : on qualifie TOUTES les références de colonnes via un alias de table
--   (`matches m` → `m.status`, `m.private`, …). Plus aucun nom nu ne peut entrer en
--   collision avec une variable OUT, indépendamment du réglage variable_conflict.
--   Ceinture + bretelles : on ajoute aussi la directive `#variable_conflict
--   use_column` en tête de fonction.
--
-- BUG 2 — le CRÉATEUR d'un match public n'est JAMAIS notifié de l'appariement.
--   (Masqué tant que BUG 1 fait tout planter ; il mordrait juste après le fix.)
--   Flux : A appelle find_match → crée un match 'waiting' (side 0) et continue de
--   poller. B appelle find_match → rejoint le match de A (status → 'ready'). Mais
--   aux polls SUIVANTS de A :
--     · étape 1 (rejoindre un autre)      : ignore son propre match (p1 = moi) ;
--     · étape 2 (mon match en attente)    : filtre status='waiting' → il est passé
--                                           'ready' → introuvable ;
--     · étape 3                           : A CRÉE UN NOUVEAU match 'waiting'.
--   → A ne reçoit jamais 'ready', ne rejoint jamais le canal Realtime match:{id}
--   de B (il migre même vers un nouveau matchId) : les deux joueurs restent sur des
--   canaux différents, le handshake n'a jamais lieu.
--   FIX : nouvelle ÉTAPE 0 — « quelqu'un a-t-il rejoint MON match public ? »
--   (p1 = moi, status = 'ready', récent) → renvoyer ce match en 'ready' side 0 avec
--   les infos de l'adversaire (p2). Le client s'arrête de poller et lance le
--   handshake. Idempotent : renvoyer 'ready' plusieurs fois est sans effet (le
--   client fait clearPoll au 1er 'ready').
-- ============================================================================

create or replace function public.pvp_find_match(p_band int default 100)
returns table(match_id uuid, side int, status text, opp_pseudo text, opp_trophies int)
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
begin
  select pr.trophies into v_tr from profiles pr where pr.id = v_me;
  if v_tr is null then raise exception 'profile_not_found'; end if;

  -- 0) BUG 2 : quelqu'un a-t-il rejoint MON match public en attente ? Il est passé
  --    'ready' → je le récupère côté créateur (side 0). Borné aux matchs prêts
  --    récemment (5 min) pour ne pas ressusciter un vieux match resté 'ready'
  --    (W1 ne repasse pas encore les matchs à 'ended' — ce sera W3).
  select m.id, m.p2 into v_id, v_opp
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
      select v_id, 0, 'ready'::text, pr.pseudo, pr.trophies
      from profiles pr where pr.id = v_opp;
    return;
  end if;

  -- 1) Rejoindre un match public ouvert compatible (bande de trophées).
  select m.id, m.p1 into v_id, v_opp
  from matches m
  where m.status = 'waiting'
    and m.private = false
    and m.p1 <> v_me
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
        select v_id, 1, 'ready'::text, pr.pseudo, pr.trophies
        from profiles pr where pr.id = v_opp;
      return;
    end if;
  end if;

  -- 2) J'ai déjà un match public en attente → le renvoyer (pas de doublon).
  select m.id into v_id
  from matches m
  where m.p1 = v_me and m.status = 'waiting' and m.private = false
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

-- ============================================================================
-- AUDIT des 5 fonctions (piège RETURNS TABLE → 1 variable OUT par colonne de sortie).
-- Noms de sortie passés au crible : status, code, side, match_id, opp_pseudo,
-- opp_trophies. Seule pvp_find_match était réellement cassée.
--
--   · pvp_find_match  → OUT {match_id, side, status, opp_pseudo, opp_trophies}.
--       CASSÉE : OUT `status` entre en collision avec matches.status dans les
--       `where status=...`. `side`/`match_id` n'ont pas de colonne homonyme dans
--       matches ; `opp_pseudo`/`opp_trophies` diffèrent de profiles.pseudo/trophies
--       et sont qualifiés `pr.`. → CORRIGÉE ci-dessus (alias m. + directive).
--
--   · pvp_join_code   → OUT {match_id, side, opp_pseudo, opp_trophies}. AUCUN OUT
--       nommé `status`, donc `where status='waiting'` N'EST PAS ambigu → marche
--       déjà. (C'est pourquoi les parties privées fonctionnaient.) `code` y est un
--       paramètre `p_code` + la colonne, pas un OUT → pas de collision. RAS.
--
--   · pvp_create_private → OUT {match_id, code}. AUCUN OUT `status` : le
--       `delete ... where status='waiting'` vise la seule colonne. `code` en OUT
--       n'est jamais lu nu dans un WHERE ; dans `insert into matches(...,code,...)`
--       la liste de colonnes d'un INSERT n'est jamais soumise à la substitution de
--       variables (identifiants = colonnes cibles) ; la valeur insérée est le local
--       `v_code`. RAS.
--
--   · pvp_cancel_wait → returns void, aucun RETURNS TABLE donc aucune variable OUT.
--       `where ... status='waiting'` = colonne seule. RAS.
--
--   · pvp_gen_code    → returns text, aucune variable OUT. `where code=v_code` :
--       colonne vs local préfixé. RAS.
--
-- RLS : les mutations passent par des fonctions security definer (bypass RLS) et le
--   client ne fait que des RPC (aucun SELECT direct sur matches) → la RLS ne bloque
--   pas l'appariement. RAS.
-- ============================================================================
