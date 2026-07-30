---
projet: roychec
agent: game-designer
date: 2026-07-07
version: 3
statut: brouillon
---

# Spec — Compte joueur + Trophées (persistance en ligne)

> **Statut** : brouillon game-designer, livré en amont d'un cycle `/feature compte-trophees`
> (gameplay-dev → QA) si l'utilisateur tranche d'aller au-delà de la spec.
> **Périmètre v1 (encore valide)** : compte email + pseudo, session persistante, mode invité.
> **⚠️ CADUC depuis v3 (2026-07-09)** : les trophées gagnés/perdus **contre l'IA** (PvAI). Le PvAI
> ne donne plus **aucun** trophée. Voir la note de décision en tête de §3. Les trophées sont
> désormais **exclusifs au PvP en ligne** (`design/spec-pvp-online.md`).
> **Hors scope v1** (à documenter comme extensions) : voie des trophées à paliers/récompenses,
> classement mondial, skins débloquables (GDD §10).
> **Référence code existant** : menu d'accueil `phase: 'menu'` (`game/src/main.js`
> `menuState()` L.22, `commencerPartie()` L.48, `retourMenu()` L.54, `actionBouton()` L.470) ;
> rendu du menu `dessineMenu()` (`game/src/render.js` L.745) ; écran de victoire L.695-715 ;
> helper `bouton()` L.146 (boutons 320×52, hit-test via `state.ui.buttons`).
> **Conformité** : GDD v1 (`design/gdd.md` §10), spec-ia v1, DA v2 (`art/direction-artistique.md` §11).

---

## Journal des versions

- **v3 (2026-07-09)** — **Trophées exclusifs au PvP en ligne ; le PvAI ne donne plus RIEN.**
  Décision utilisateur ferme. **Motif** : le barème PvAI (§3.1) était farmable (espérance nette
  positive + RPC `apply_match_result` appelable en boucle, cf. limite §4.3) → ladder pollué et
  **matchmaking PvP par bande de trophées faussé**. L'option « progression solo séparée » (second
  compteur) a été **explicitement écartée**. Sections rendues **caduques** (marquées, non
  supprimées, historique conservé) : §0 point 2, §1 (B1/B2/B3), **§3 entière**, §4.3
  (`apply_match_result`), le hook trophées du cycle B (§5.2/§5.3/§8), QA-ON-04..08 et QA-ON-12
  (§6), lignes correspondantes du résumé §10. **Restent valides** : compte/auth magic link (§2),
  session, mode invité, table `profiles`, RLS, bandeau compte/pseudo, `<input>` DOM. Le compteur
  `trophies` de `profiles` demeure mais n'est plus alimenté que par le PvP (`pvp_report_result`,
  `spec-pvp-online.md` §8).
- **v2 (2026-07-09)** — **Auth : OTP 6 chiffres → magic link.** La v1 (§2.1) spécifiait un code
  OTP à 6 chiffres saisi dans l'onglet. À l'implémentation (cycle A v2, commit `aed3c3c0`), le
  dashboard Supabase **verrouille l'édition du template email affichant le code (`{{ .Token }}`)
  tant qu'aucun SMTP custom n'est configuré** : le template par défaut n'envoie qu'un **lien**.
  Décision utilisateur du **2026-07-07** : basculer sur le **magic link** pour le v1. Sections
  amendées : §1 (A1), §2.1, §5.1, §6 (QA-ON-01), §10 (Auth).
- **v1 (2026-07-07)** — version initiale (auth OTP 6 chiffres + trophées PvAI).

---

## 0. Décisions déjà tranchées par l'utilisateur (rappel, non rouvertes)

1. **Compteur de trophées simple.** Pas de voie à paliers/récompenses en v1 (→ extension v2, §9).
2. **⚠️ CADUC (v3, 2026-07-09).** ~~Les trophées se gagnent contre l'IA (PvAI).~~ **Décision
   inversée** : les trophées ne se gagnent **plus** contre l'IA. Ils sont désormais **exclusifs
   au PvP en ligne** (`design/spec-pvp-online.md`). Le PvAI est un mode d'entraînement **sans
   enjeu de trophée**.
3. **Backend : Supabase** (auth email + Postgres). `supabase-js` importé en ES module via CDN
   (le jeu reste statique, sans build). **Première dépendance externe du projet**, justifiée :
   auth + persistance sont impossibles en statique pur.

---

## 1. Réponses aux questions à trancher — résumé

| # | Question | Décision |
|---|---|---|
| A1 | Méthode d'auth email | **Magic link par email** (`signInWithOtp` avec `emailRedirectTo`, sans code saisi dans l'onglet). *v1 spécifiait un OTP 6 chiffres, remplacé le 2026-07-07 — template email verrouillé sans SMTP custom (voir §2.1).* Pas de mot de passe |
| A2 | Pseudo | Demandé **après la 1re connexion** si absent ; 3-16 car., unique (insensible à la casse) |
| A3 | Session | **Auto-login silencieux** via session Supabase stockée (`getSession()` au chargement) |
| A4 | Mode invité | **Obligatoire et par défaut** ; jeu 100 % jouable sans compte ; trophées **non persistés** |
| ~~B1~~ | ~~Gain/perte trophées PvAI~~ | **⚠️ CADUC v3** — ~~Débutant +10/−8, Interm. +18/−5, Avancé +28/−3~~. **Le PvAI ne donne plus aucun trophée** (voir §3) |
| ~~B2~~ | ~~Abandon / reload PvAI~~ | **⚠️ CADUC v3** — sans objet (aucun trophée PvAI). Renvoyé au PvP (`spec-pvp-online.md` §7) |
| ~~B3~~ | ~~Affichage delta PvAI~~ | **⚠️ CADUC v3** — plus de ligne trophée sur l'écran de victoire PvAI. Le delta ±N ne s'affiche qu'en **PvP** (`spec-pvp-online.md` §9) |
| C1 | Modèle de données | Table `profiles` (id, pseudo, trophies, created_at, updated_at, last_match_at) — **valide** (`trophies` alimenté par le PvP) |
| C2 | RLS | Lecture/écriture **de sa propre ligne uniquement** ; trophées modifiables **via RPC seulement** — **valide** |
| ~~C3~~ | ~~Intégrité delta PvAI~~ | **⚠️ CADUC v3** — la mitigation RPC PvAI n'a plus d'objet ; l'intégrité se traite en PvP (`spec-pvp-online.md` §3) |
| D1 | Flux UI | Bandeau compte sur le menu (Connexion / pseudo+trophées+Déconnexion) ; formulaires via `<input>` DOM |
| D2 | Séquençage | Cycle A (auth) **valide** ; ~~B (trophées PvAI)~~ **caduc v3** ; C (durcissement) allégé — voir §5.3 |

---

## 2. A — Compte & session

### 2.1 Auth — **Magic link par email** (tranché v2)

> **Note historique** : la **v1 spécifiait un OTP à 6 chiffres** saisi dans l'onglet. Il a été
> **remplacé par le magic link le 2026-07-07** (décision utilisateur, implémenté cycle A v2,
> commit `aed3c3c0`) parce que le **dashboard Supabase verrouille l'édition du template email
> qui afficherait le code (`{{ .Token }}`) tant qu'aucun SMTP custom n'est configuré** : le
> template par défaut n'envoie qu'un **lien**. On ne voulait pas bloquer le cycle A sur la mise
> en place d'un SMTP custom. Le code OTP en-onglet **redeviendra une option** dès qu'un SMTP
> custom sera branché (extension, §9).

**Décision (v2)** : connexion par **lien magique envoyé par email**, via
`supabase.auth.signInWithOtp({ email, options: { shouldCreateUser: true, emailRedirectTo: origin } })`.
L'utilisateur reçoit un email contenant un **lien** ; il clique, revient sur le jeu avec la
session dans l'URL, que `supabase-js` détecte (`detectSessionInUrl`, défaut `true`) → événement
`SIGNED_IN`. **Pas de mot de passe, pas de code à recopier.**

**Justification (friction pour un jeu casual)** :
- L'**email + mot de passe** ajoute : champ mot de passe, règles de robustesse, écran « mot de
  passe oublié », stockage mental d'un secret pour un jeu qu'on ouvre une fois par semaine. Trop
  de friction pour l'enjeu — écarté dès la v1.
- L'**OTP 6 chiffres** (choix v1) gardait le joueur dans l'onglet mais **exige un template email
  custom affichant le code**, impossible sans SMTP custom sur le plan Supabase utilisé. Reporté.
- Le **magic link** fonctionne avec le **template Supabase par défaut** (zéro config email),
  donc **débloquable immédiatement**. Coût : le joueur quitte l'onglet pour cliquer le lien puis
  revient (une redirection). Acceptable pour une connexion occasionnelle. La session est ensuite
  persistée (§2.3), donc ce détour n'a lieu qu'une fois par appareil.

**Contrepartie assumée & mitigation** : le magic link ouvre le jeu via `emailRedirectTo = origin`.
Le token de session arrive dans l'URL ; `account.js` le **nettoie** immédiatement
(`history.replaceState`, cf. `nettoyerUrl`) pour ne pas laisser de token dans la barre d'adresse.
L'`origin` du lien dépend du port servi (8000, 5500…) et **doit figurer dans les Redirect URLs**
du dashboard Supabase (à noter dans le ticket d'implémentation).

**Paramètres chiffrés** :
| Paramètre | Valeur | Note |
|---|---|---|
| Validité du lien | 60 min (défaut Supabase) | On garde le défaut |
| Renvoi du lien | bouton « Renvoyer » actif après **30 s** | Anti-spam, évite le double envoi accidentel |
| Champs du formulaire | 1 (email) | Puis écran « email envoyé, va cliquer le lien » (pas de champ code) |
| Retour de connexion | via `onAuthStateChange('SIGNED_IN')` | Déclenché quand le lien ramène la session |

> Config Supabase requise (dashboard, hors code) : template email **« Magic Link » par défaut**
> (aucune édition nécessaire) ; ajouter chaque `origin` servi aux **Redirect URLs**. Le passage à
> l'OTP en-onglet nécessitera un **SMTP custom** + édition du template `{{ .Token }}` (extension).

### 2.2 Pseudo — demandé après la 1re connexion (tranché)

**Décision** : le pseudo n'est **pas** demandé sur l'écran email (on veut le moins de friction
possible pour authentifier). Il est demandé **une seule fois**, juste après la première
connexion réussie (retour du magic link), **si** le profil n'a pas encore de pseudo.

**Contraintes** :
| Règle | Valeur | Justification |
|---|---|---|
| Longueur | **3 à 16 caractères** | Lisible dans le HUD/menu sans déborder les 320 px de bouton |
| Caractères autorisés | lettres, chiffres, espace, `-`, `_` | Regex `^[\p{L}\p{N} _-]{3,16}$` (flag `u`) |
| Unicité | **oui, insensible à la casse** | « Roi » et « roi » sont le même pseudo (index unique sur `lower(pseudo)`) |
| Casse conservée | oui à l'affichage | On stocke tel que saisi, l'unicité se teste en minuscules |
| Modifiable | **non en v1** | Simplicité ; le renommage est une extension v2 (§9) |

**Comportement en cas de collision** : l'`INSERT` échoue (contrainte unique DB) → message
« Ce pseudo est déjà pris, essayez-en un autre. » et le champ reste ouvert. On ne fait **pas** de
pré-vérification par requête (une requête `SELECT` avant `INSERT` serait sujette à une course ;
la contrainte DB est la seule source de vérité).

> **Note v3** : le pseudo devient **d'autant plus central** qu'il identifie le joueur dans le PvP
> en ligne (affiché à l'adversaire, `spec-pvp-online.md` §9.5) et sur le futur leaderboard. Rien à
> changer côté v1.

### 2.3 Session persistante — auto-login silencieux (tranché)

**Décision** : `supabase-js` persiste la session dans `localStorage` par défaut. Au **chargement
de la page**, on écoute `supabase.auth.onAuthStateChange` (l'événement `INITIAL_SESSION` couvre la
restauration depuis `localStorage`, `SIGNED_IN` le retour du magic link) :
1. **Session valide** → récupérer le profil (`select` sur `profiles` où `id = user.id`) →
   passer en **état connecté** (le menu affiche pseudo + trophées). Aucune action utilisateur.
   - Cas limite : session valide mais **pas de ligne `profiles`** (compte créé, pseudo jamais
     posé) → ouvrir directement l'écran « choisis un pseudo ».
2. **Pas de session** (`SIGNED_OUT` / `null`) → **état invité** (§2.4).

Le rafraîchissement du token est géré par `supabase-js` (autoRefreshToken). Aucun code à écrire.
`onAuthStateChange(...)` met à jour l'état UI (connecté/invité) de façon réactive, et le token du
magic link est retiré de l'URL après connexion (`nettoyerUrl`).

### 2.4 Mode invité — obligatoire et par défaut (tranché, garde-fou n°2 du contrat)

**Décision** : **le jeu doit rester 100 % jouable sans compte.** L'état par défaut au premier
chargement (aucune session) est **invité**. Un invité peut :
- Choisir un mode (PvP hot-seat, PvAI toutes difficultés) et jouer une partie complète.
- Gagner/perdre normalement, voir l'écran de victoire.

**Ce qui est perdu en invité** (v3) :
| Fonction | Invité | Connecté |
|---|---|---|
| Jouer PvP hot-seat / PvAI | ✅ | ✅ |
| **Jouer PvP en ligne** (`spec-pvp-online.md`) | ❌ (compte requis) | ✅ |
| Trophées **persistés** (via PvP en ligne) | ❌ | ✅ (table `profiles`) |
| Pseudo affiché | ❌ (libellé « Invité ») | ✅ |

> **⚠️ Changement v3** : en v1/v2 l'invité voyait un delta de trophée **éphémère** après une
> victoire PvAI. **Supprimé** : le PvAI ne produit plus de trophée (pour personne, invité ou
> connecté). L'invité n'a donc plus aucune notion de trophée tant qu'il ne se connecte pas et ne
> joue pas en ligne.

**Incitation douce (pas un mur)** : sur l'écran de victoire d'un invité, un lien discret
« Connecte-toi pour jouer en ligne et gagner des trophées » (bouton texte, pas d'overlay
bloquant). Aucune fonctionnalité de jeu local n'est jamais verrouillée derrière le compte.

---

## 3. B — Trophées ⚠️ SECTION CADUQUE (v3, 2026-07-09)

> **NOTE DE DÉCISION (2026-07-09, ferme, ne pas rouvrir)** : toute cette section décrivait
> l'attribution de trophées **contre l'IA (PvAI)**. Elle est **entièrement caduque**. **Le PvAI
> ne donne, ni ne retire, aucun trophée.** Motif : le barème ci-dessous (espérance nette positive)
> couplé à une RPC appelable en boucle rendait le farm trivial → ladder pollué et **matchmaking
> PvP par bande de trophées faussé** (`spec-pvp-online.md` §4.1). L'attribution de trophées est
> **transférée intégralement au PvP en ligne** (Elo simplifié, cross-validation serveur,
> `spec-pvp-online.md` §8). Le contenu est **conservé barré** pour l'historique, pas pour
> implémentation. Côté code, `hookTrophees()` (main.js) est neutralisé en parallèle par
> gameplay-dev.

### ~~3.1 Formule de gain/perte (PvAI)~~ — CADUC

~~Les trophées ne bougent que sur une partie PvAI terminée par capture du roi.~~

| ~~Difficulté IA~~ | ~~Victoire humain~~ | ~~Défaite humain~~ |
|---|---|---|
| ~~Débutant (1)~~ | ~~+10~~ | ~~−8~~ |
| ~~Intermédiaire (2)~~ | ~~+18~~ | ~~−5~~ |
| ~~Avancé (3)~~ | ~~+28~~ | ~~−3~~ |

~~Plancher 0. Espérance nette positive pour inciter à rejouer.~~ **→ C'est précisément cette
espérance positive farmable qui a motivé la suppression (v3).**

### ~~3.2 Abandon / rechargement en cours de partie~~ — CADUC

~~Recharger n'avait aucun effet ; seul le gameover mettait à jour.~~ Sans objet : plus de mise à
jour PvAI. L'anti-abandon **réel** vit désormais en PvP (`spec-pvp-online.md` §7 : recharger =
perdre par abandon face à un vrai adversaire).

### ~~3.3 Affichage (delta ±N PvAI sur l'écran de victoire)~~ — CADUC

~~Ligne animée +N/−N 🏆 sous « Roi capturé » en PvAI.~~ **Supprimée.** L'écran de victoire **PvAI**
n'affiche plus aucune ligne trophée. Le HUD/menu continue d'afficher le total `profiles.trophies`
(désormais alimenté uniquement par le PvP). Le delta ±N animé (600 ms) est **conservé comme
composant** mais réaffecté à l'écran de fin **PvP** (`spec-pvp-online.md` §9.2).

---

## 4. C — Données & intégrité

### 4.1 Modèle de données minimal — **valide**

Table unique `public.profiles` (inchangée ; `trophies` reste, alimenté par le PvP) :

```sql
create table public.profiles (
  id          uuid primary key references auth.users(id) on delete cascade,
  pseudo      text not null,
  trophies    integer not null default 0 check (trophies >= 0),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  last_match_at timestamptz            -- anti-spam RPC (voir note v3 §4.3)
);

-- Unicité du pseudo insensible à la casse.
create unique index profiles_pseudo_lower_uidx on public.profiles (lower(pseudo));
```

`updated_at` (hygiène) et `last_match_at` restent utiles pour l'anti-spam des RPC de résultat
(PvP). La table `matches` du PvP en ligne est définie dans `design/spec-pvp-online.md` §4.4.

### 4.2 Row Level Security — **valide**

```sql
alter table public.profiles enable row level security;

create policy "profiles_select_own"
  on public.profiles for select
  using (auth.uid() = id);

create policy "profiles_insert_own"
  on public.profiles for insert
  with check (auth.uid() = id);

create policy "profiles_update_own"
  on public.profiles for update
  using (auth.uid() = id)
  with check (auth.uid() = id);
```

Lecture de sa propre ligne uniquement (pas de leaderboard public en v1). Le leaderboard (v2)
ajoutera une policy `select` publique restreinte à `pseudo, trophies` via une vue.

### 4.3 Intégrité — ⚠️ RPC PvAI CADUQUE (v3)

> **NOTE v3 (2026-07-09)** : la RPC `apply_match_result(p_difficulty, p_won)` ci-dessous
> **devient obsolète** avec la suppression des trophées PvAI. Elle n'est **plus appelée** (le hook
> PvAI est neutralisé) et sera **remplacée à terme par `pvp_report_result`**
> (`spec-pvp-online.md` §3.5/§8), qui calcule l'Elo serveur et n'écrit qu'après **rapports
> concordants** des deux joueurs. Le **trigger `guard_trophies`** (verrou lecture seule de
> `trophies` hors RPC habilitée) **reste pertinent et valide** : il protégera désormais le
> compteur au profit de `pvp_report_result`. On conserve le code barré pour l'historique.

**Limite d'origine (v1)** : jeu 100 % client → total falsifiable. La mitigation v1 déléguait le
calcul du delta au serveur via RPC. Ce mécanisme est aujourd'hui **repris et durci** en PvP
(lockstep déterministe + cross-validation), pas en PvAI.

```sql
-- ⚠️ CADUC v3 — n'est plus appelée (trophées PvAI supprimés). Remplacée par pvp_report_result.
create or replace function public.apply_match_result(p_difficulty int, p_won boolean)
returns integer
language plpgsql security definer set search_path = public as $$
declare v_delta int; v_new int; v_last timestamptz;
begin
  v_delta := case p_difficulty
    when 1 then case when p_won then 10 else -8 end
    when 2 then case when p_won then 18 else -5 end
    when 3 then case when p_won then 28 else -3 end
    else 0 end;
  select last_match_at into v_last from profiles where id = auth.uid();
  if v_last is not null and now() - v_last < interval '15 seconds' then
    raise exception 'rate_limited';
  end if;
  update profiles set trophies = greatest(0, trophies + v_delta),
         last_match_at = now(), updated_at = now()
   where id = auth.uid() returning trophies into v_new;
  return v_new;
end $$;

-- ✅ VALIDE — verrou conservé : interdit toute écriture directe de trophies hors RPC habilitée.
-- (En v3, la RPC habilitée devient pvp_report_result ; apply_match_result peut être révoquée.)
create or replace function public.guard_trophies() returns trigger
language plpgsql as $$
begin
  if new.trophies <> old.trophies then
    raise exception 'trophies is read-only (use the result RPC)';
  end if;
  return new;
end $$;
create trigger profiles_guard_trophies
  before update on public.profiles
  for each row execute function public.guard_trophies();
```

**Cadrage v3** : côté migration Supabase, `apply_match_result` peut être **laissée en place mais
non appelée** (aucun risque, le hook est coupé) ou **`revoke execute` / `drop`** au moment où
`pvp_report_result` la remplace. Recommandation : la **révoquer** dès la phase PvP pour fermer le
dernier vecteur de farm résiduel décrit ci-dessous.

**Ce que l'ancienne mitigation ne garantissait pas** (et qui a motivé v3) : un joueur pouvait
appeler `apply_match_result(3, true)` en boucle (1 / 15 s) **sans jouer**, gonflant son total.
C'est exactement le trou que la suppression des trophées PvAI ferme.

### 4.4 Création de la ligne profil — **valide**

À la pose du pseudo (§2.2), le client fait un `INSERT` (`id = auth.uid()`, `pseudo`,
`trophies = 0`). Le trigger `guard_trophies` ne bloque que `trophies`, pas `pseudo`. **Tranché :
`INSERT` direct par le client.**

---

## 5. D — Flux UI

### 5.1 Écrans / états nouveaux

Tous rendus dans le style existant (overlay canvas + boutons 320×52 via `bouton()`, chips pastel).
**Exception assumée** : la **saisie de texte** (email, pseudo) se fait avec de **vrais
`<input>` DOM** superposés au canvas.

**États du bandeau compte (menu)** — **valide** :
| État | Affichage menu | Action |
|---|---|---|
| Invité | Bouton « CONNEXION » (secondaire, coin haut) | → ouvre l'overlay email |
| Connecté | `♟ {pseudo}   🏆 {trophies}` + « DÉCONNEXION » | Déconnexion → `signOut()` → invité |

> Le `🏆 {trophies}` du bandeau reste affiché : c'est le total ladder du joueur, désormais nourri
> par le PvP. Il vaut 0 tant que le joueur n'a pas joué en ligne.

**Sous-écrans de l'overlay auth** (v2 magic link, **valide**) :
1. **Email** : champ email + « RECEVOIR LE LIEN » + « Annuler ».
2. **Lien envoyé** (`sent`, pas de champ code) : rappel de l'email + « Ouvre ton email et clique le
   lien » + « Renvoyer le lien » (grisé 30 s) + « Changer d'email ».
3. **Pseudo** (si profil sans pseudo, au retour du lien) : champ + « CONFIRMER » + validation live.
4. Succès → overlay fermé, retour menu **connecté**.

**Feedbacks** : « ENVOI… » → « EMAIL ENVOYÉ ✓ » ; retour du lien → `SIGNED_IN` + nettoyage URL ;
erreurs d'envoi/réseau en terracotta ; l'échec d'auth ne casse jamais le mode invité.

### 5.2 Impact sur le code existant — à signaler à gameplay-dev

- **Bouton « En ligne » (`mode: 'pvw'`)** : désactivé en v1 (garde `if (action.mode === 'pvw')
  return;`). **Réactivé en phase 2 PvP** (`spec-pvp-online.md` §9.1, cycle W1).
- **⚠️ Hook trophées PvAI (`hookTrophees()`, main.js L.187) — v3 : NEUTRALISÉ.** Ne plus appeler
  `applyMatchResult` au `gameover`. gameplay-dev retire (ou court-circuite) le hook et la ligne
  trophée de l'écran de victoire PvAI (render.js). `finPartie` reste le point unique de fin (il
  sert au replay et servira au rapport de résultat **PvP** — `spec-pvp-online.md` §11 point 5).
- Le reste du moteur (`board.js`, `rules.js`, `ai.js`) **n'est pas touché**.

### 5.3 Séquençage — v3

- **Cycle A — Auth & session** : **VALIDE, livré** (magic link, session, pseudo, mode invité,
  bandeau compte). Rien à défaire.
- **~~Cycle B — Trophées PvAI~~** : **CADUC v3.** Le hook `gameover` PvAI est **retiré** au lieu
  d'être enrichi. L'attribution de trophées est reportée **en bloc** au PvP en ligne
  (`spec-pvp-online.md`, cycles W1→W3).
- **Cycle C — Durcissement (allégé)** : messages d'erreur réseau auth, cas limites (session sans
  profil, pseudo pris, lien expiré, offline), incitation invité « joue en ligne ». **Ne concerne
  plus les trophées.**

---

## 6. E — Scénarios de test (QA navigateur réel)

| # | Scénario | Résultat attendu |
|---|---|---|
| QA-ON-01 | **Création de compte** : menu invité → CONNEXION → email → **lien reçu → cliqué → retour jeu** → pseudo « Roi_2026 » → confirmé | Bandeau « Roi_2026 · 🏆 0 » ; ligne `profiles` créée (trophies=0) ; token retiré de l'URL |
| QA-ON-02 | **Reconnexion après reload** : connecté, F5 | Auto-login silencieux, retour état connecté sans re-cliquer le lien |
| QA-ON-03 | **Mode invité jouable** : sans compte, lancer PvP puis PvAI, partie complète | Les deux modes fonctionnent ; menu affiche « CONNEXION » |
| ~~QA-ON-04~~ | ~~Gain trophées PvAI Intermédiaire~~ | **⚠️ CADUC v3** — aucun trophée en PvAI. Remplacé par QA-PVW-12 (`spec-pvp-online.md`) |
| ~~QA-ON-05~~ | ~~Perte trophées PvAI~~ | **⚠️ CADUC v3** — sans objet |
| ~~QA-ON-06~~ | ~~Plancher 0 (perte PvAI)~~ | **⚠️ CADUC v3** — le plancher 0 se teste désormais en PvP |
| ~~QA-ON-07~~ | ~~Modulation par difficulté~~ | **⚠️ CADUC v3** — sans objet |
| ~~QA-ON-08~~ | ~~Invité éphémère (delta PvAI RAM)~~ | **⚠️ CADUC v3** — plus de delta PvAI, même éphémère |
| QA-ON-09 | **Reload en cours de partie** : connecté, rafraîchir avant `gameover` PvAI | Aucun effet (déjà le cas ; désormais trivial : le PvAI ne touche jamais aux trophées) |
| QA-ON-10 | **Non-régression PvP hot-seat** : partie complète, connecté | Aucune ligne trophée ; DB inchangée |
| QA-ON-11 | **Non-régression PvAI (jeu)** : QA-IA de spec-ia §7 restent PASS ; **de plus, aucun appel RPC trophée au gameover PvAI** | 0 régression moteur/IA ; `profiles.trophies` inchangé après une partie PvAI |
| ~~QA-ON-12~~ | ~~Intégrité `apply_match_result` (rate-limit)~~ | **⚠️ CADUC v3** — RPC non appelée ; l'intégrité se teste en PvP (QA-PVW-17). Le verrou `guard_trophies` reste testé via le PvP |

Critères PASS globaux (v3) :
- **0 régression** sur les scénarios QA04 (moteur) et QA-IA (spec-ia §7).
- Une partie **PvAI** laisse `profiles.trophies` **strictement inchangé** (aucune écriture).
- Le mode **invité** reste pleinement jouable même si Supabase est injoignable (garde-fou n°2).

---

## 7. Dépendance externe — cadrage stack

- **Import** : `supabase-js` v2 en ES module via CDN (`esm.sh/@supabase/supabase-js@2`). Épingler
  la version majeure. Pas de bundler (CLAUDE.md §1).
- **Clés** : `SUPABASE_URL` + clé anon/publishable publique en clair (usage prévu ; sécurité par
  RLS). `service_role` jamais côté client.
- **Isolation** : dépendance confinée à `game/src/account.js` (et bientôt `online.js` pour le PvP,
  qui réutilise le même client).
- **Dégradation gracieuse** : CDN/Supabase injoignable → mode invité silencieux, le jeu tourne.

---

## 8. Compatibilité moteur — récap points d'accroche (v3)

| Point | Nature | Statut v3 |
|---|---|---|
| `index.html` | + import `supabase-js`, + `<div id="auth-overlay">`, + `<script account.js>` | ✅ livré |
| `game/src/account.js` | Client Supabase, auth magic link, pseudo, état compte | ✅ livré (la fonction `applyMatchResult` devient morte — à retirer/ignorer) |
| `render.js` `dessineMenu()` | + bandeau compte ; bouton `pvw` (réactivé phase 2) | ✅ livré |
| `render.js` écran victoire | ~~+ ligne delta ±N trophée PvAI~~ | **⚠️ à RETIRER (v3)** — plus de trophée PvAI |
| `main.js` `actionBouton()` | + actions `login` / `logout` ; garde `pvw` | ✅ livré |
| `main.js` `hookTrophees()` au `gameover` | ~~`if (mode==='pvai')` → RPC / RAM~~ | **⚠️ NEUTRALISÉ (v3)** — plus d'appel trophée en PvAI |

Aucune modification de `board.js`, `rules.js`, `constants.js`, ni de l'IA. La refonte v3 est
**soustractive** côté jeu (on retire le hook et l'affichage PvAI), pas additive.

---

## 9. Hors-périmètre v1 → extensions v2+ (roadmap)

- **OTP 6 chiffres en-onglet** : redevient possible dès qu'un **SMTP custom** est branché sur
  Supabase (déverrouille l'édition du template `{{ .Token }}`).
- **Trophées PvP en ligne** : **désormais la SEULE source de trophées**, spécifiée dans
  `design/spec-pvp-online.md` (Elo simplifié, cross-validation serveur, matchmaking par bande).
- **Voie des trophées à paliers/récompenses** (GDD §10) : paliers → bouts de skins. Hors scope.
- **Classement mondial / leaderboard** : policy `select` publique + vue restreinte
  (`pseudo, trophies`).
- **Renommer son pseudo**, avatar, historique de parties (table `matches`), OAuth.
- **Révocation de `apply_match_result`** : à effectuer quand `pvp_report_result` est déployée.

---

## 10. Tranchés — résumé (v3)

| Sujet | Décision |
|---|---|
| Auth | **Magic link par email** (v2 ; v1 = OTP 6 chiffres, remplacé le 2026-07-07), pas de mot de passe |
| Pseudo | 3-16 car., unique insensible à la casse, demandé après 1re connexion, non renommable v1 |
| Session | Auto-login silencieux (`onAuthStateChange`), persistée par `supabase-js` |
| Invité | Défaut, jeu **local** 100 % jouable ; **PvP en ligne = compte requis** ; plus aucun trophée éphémère |
| **Trophées PvAI** | **⚠️ SUPPRIMÉS (v3, 2026-07-09)** — le PvAI ne donne/retire plus rien. Motif : farm trivial → ladder pollué |
| **Source des trophées** | **PvP en ligne exclusivement** (`spec-pvp-online.md` §8 : Elo K=32, `pvp_report_result`) |
| Affichage trophée | Menu : total `🏆` (nourri par le PvP) ; **plus de delta ±N sur l'écran PvAI** (réaffecté au PvP) |
| Données | Table `profiles` (+ `last_match_at`) **valide** ; `trophies` conservé, alimenté par le PvP |
| RLS | Lecture/écriture de sa propre ligne ; `trophies` en lecture seule hors RPC habilitée (verrou conservé) |
| RPC PvAI | `apply_match_result` **obsolète** (non appelée) → remplacée par `pvp_report_result` ; à révoquer en phase PvP |
| Intégrité | Traitée **en PvP** (lockstep + cross-validation serveur, `spec-pvp-online.md` §3), plus en PvAI |
| UI saisie | `<input>` DOM superposé (overlay), reste du menu au canvas |
| Séquençage | Cycle A auth **livré** ; ~~B trophées PvAI~~ **caduc** ; C durcissement auth allégé |

**Prochaine étape** : côté online, l'attribution des trophées est portée par le **PvP en ligne**
(`design/spec-pvp-online.md`, cycles W1→W3). Côté cette spec, il reste à **retirer** le hook et
l'affichage trophée PvAI (v3, soustractif — pris en charge en parallèle par gameplay-dev).
