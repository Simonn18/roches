---
projet: roychec
agent: game-designer
date: 2026-07-12
version: 3.3
statut: brouillon
---

# Spec — PvP en ligne temps réel (mode `pvw`)

## Journal des versions

- **v3.3 (2026-07-12)** — **Les parties privées ne comptent JAMAIS pour l'Elo** (décision
  utilisateur ferme, tranche le point ouvert de v3.2 en plus large : TOUTES les privées,
  pas seulement celles en variante). La décision v1 de §4.3 (« une partie privée compte
  pour les trophées ») est **renversée** : seule la **file publique** est classée.
  `pvp_report_result` re-créée (section 4 de `supabase/schema-pvp-variant.sql`, remplace
  la version schema-pvp-w3.sql) : si `matches.private`, le match est finalisé normalement
  (status `'ended'`, winner, ended_at — l'écran de fin fonctionne) mais `p1_delta =
  p2_delta = 0` et `profiles.trophies` n'est pas touché. **Conséquence assumée** :
  `pvp_rematch` insère toujours `private = true`, donc les **revanches sont non classées
  elles aussi** — y compris la revanche d'un match public (anti-farming Elo entre deux
  joueurs consentants ; pour re-jouer classé, repasser par la file publique). §4.3 amendé.
- **v3.2 (2026-07-12)** — **Variantes dans les parties privées** (demande utilisateur,
  GDD §7.2 amendé v3.1). Le créateur d'une partie privée choisit une des 6 variantes
  (chips ÉCONOMIE/COMBAT sur l'écran cadence, flux « Jouer avec un ami » uniquement) ;
  l'ami en hérite via `pvp_join_code`, la revanche la copie via `pvp_rematch` — même
  canal serveur-autoritaire que la cadence (`matches.variant`, défaut `'pvp_standard'`,
  contrainte CHECK sur les 6 ids). La **file publique reste Standard × Standard**
  (`pvp_find_match` inchangée). Les deux clients partagent le même id ⇒ mêmes économies
  ⇒ hash lockstep §5.4 valide ; un client ≤ `?v=17` face à un créateur en variante
  divergerait (desync §3.4 votée nulle — assumé, hard reload requis). Migration
  `supabase/schema-pvp-variant.sql` (après schema-pvp-cadence.sql). §4.3 amendé.
  ⚠ Point W3 à trancher : une privée en variante non-standard doit-elle compter pour
  l'Elo (§4.3 dit « compte pour les trophées ») ? Recommandation game-designer :
  `variant ≠ 'pvp_standard'` ⇒ **non classée** dans `pvp_report_result`.
- **v3.1 (2026-07-12)** — **Incrément supprimé** (décision utilisateur, après test en ligne
  des cadences : « il faudrait enlever les +3 secondes par coup joué sinon le timer ne sert
  à rien »). Le temps de chaque joueur est désormais **fixe** : aucune seconde regagnée en
  jouant, quelle que soit la cadence. Conséquences : ligne « Incrément » de §6.1 → **aucun** ;
  règle « 1 seul incrément par chaîne » caduque ; popup « +3 » vert de §9.3 **retiré**
  (livré 12/07 matin, retiré le jour même). Le reste (drapeau, départage, autorité horloge,
  recale par message) est inchangé.
- **v3 (2026-07-12)** — **Cadences au choix** (demande utilisateur) : l'extension « sélecteur »
  que §6.1 v1 gardait pour post-v1 est activée. Quatre cadences : **1 min / 5 min / 1 h /
  1 jour** (temps initial par joueur ; incrément +3 s commun à toutes — **retiré en v3.1**). Le choix
  se fait sur un écran dédié **après** « Lancer une recherche » ou « Jouer avec un ami » et
  **avant tout appel réseau**. Appariement public **par cadence stricte** (`matches.cadence`,
  filtre dans `pvp_find_match`) ; partie privée : le **créateur** impose la cadence, le
  rejoignant en hérite via `pvp_join_code` ; la **revanche** reprend la cadence du match
  précédent (`pvp_rematch`) ; « Nouvelle partie » (écran de fin) relance dans la **même
  cadence** sans re-choix. Serveur autoritaire : la cadence renvoyée par les RPC fait foi.
  Migration `supabase/schema-pvp-cadence.sql`. §4.1 et §6.1 amendés.
- **v2 (2026-07-09)** — **Trophées désormais exclusifs au PvP** (décision utilisateur ferme, même
  jour). Le PvAI ne donne plus aucun trophée (voir `spec-online.md` v3). Conséquences sur cette
  spec : §8 reformulé — `profiles.trophies` devient le **ladder PvP exclusif**, seul
  `pvp_report_result` y écrit ; le point de départ Elo est **0 pour tous** (les trophées PvAI
  n'existent plus, donc aucun héritage à reprendre) ; cohérence du matchmaking par bande vérifiée
  avec ce départ (§4.1 note). §1 (ligne K), §8.1/§8.2 et §14 amendés. Le reste (transport,
  autorité, matchmaking, horloge, robustesse, cycles, QA) est inchangé.
- **v1 (2026-07-09)** — version initiale.

---

## État d'avancement (reprise)

> Doc complet. **Amendement v2 appliqué** (trophées PvP-exclusifs, départ Elo à 0). Prochaine
> action concrète : si validé → `/feature pvp-online` cycle W1 délégué à gameplay-dev, puis QA
> 2 onglets. Décisions verrouillées inchangées depuis v1 (transport Broadcast, lockstep à double
> validation, matchmaking RPC atomique + code ami, horloge 5+3, compte requis, moteur figé +
> `online.js`), **plus** : trophées = ladder PvP exclusif, départ 0.

---

> **Statut** : brouillon game-designer, livré en amont d'un cycle `/feature pvp-online`
> (gameplay-dev → QA) si l'utilisateur tranche d'aller au-delà de la spec.
> **Périmètre** : mode `pvw` (« En ligne »), 2 joueurs humains distants, temps réel, 1 partie.
> C'est la **phase 2 du online** annoncée par `spec-online.md` §4.3 / §9 (là où se règle
> « la vraie intégrité »). **Depuis v2, c'est aussi la SEULE source de trophées du jeu** (le PvAI
> n'en donne plus — `spec-online.md` v3).
> **Hors scope** : spectateur online, chat, classement mondial, mobile, tournois (voir §13).
> **Référence code existant** : `game/src/main.js` (`menuState` L.27, `commencerPartie` L.57,
> `finDeTour` L.265, `planifierCoupIA` L.296, `finPartie` L.172 + `hookTrophees` L.187,
> `actionBouton` L.705, garde `pvw` L.781, `jouerCoup`, exécuteurs de pouvoirs, API
> `window.__roychec` L.939) ; `game/src/board.js` (`creerEtat` L.38, déjà un slot `pvw` via
> `mode`, champs `chain`, `cooldowns`, `shield`, `sacrificeArmed`) ; `game/src/replay.js`
> (format d'événement `move`/`purchase`/`power` en notation algébrique, L.51-100 — **réutilisé
> tel quel comme protocole réseau**) ; `game/src/account.js` (client Supabase, RPC
> `apply_match_result` — **obsolète depuis v3 de spec-online**) ; `game/src/rules.js`
> (`coupsLegaux`, `ciblesRuee`, `ciblesRayon`).
> **Conformité** : GDD v1 (§7 horloges réservées, §8 win/lose + départage, §10 méta trophées),
> spec-online v3 (trophées PvAI supprimés, §9 roadmap), spec-ia v1 (format), DA v2 §11.

---

## 0. Décisions cadre (rappel, non rouvertes)

1. **Backend = Supabase.** Auth magic link + `profiles` + RPC déjà en place (spec-online v2/v3).
2. **Jeu 100 % statique, sans build.** Toute la logique réseau passe par Supabase (Realtime,
   Postgres/RLS/RPC, Edge Functions). `online.js` est le **seul** nouveau module qui connaît
   Realtime, exactement comme `account.js` est le seul à connaître l'auth.
3. **Moteur d'échecs figé.** `rules.js`, `board.js` (hors ajout de champs `pvw` déjà présents),
   `constants.js` ne sont **pas** modifiés. Le PvP réutilise `coupsLegaux`, `jouerCoup`, les
   exécuteurs de pouvoirs et les mêmes points de sérialisation que le replay.
4. **⚠️ Trophées exclusifs au PvP (v2, 2026-07-09).** Le PvAI ne donne plus de trophée
   (`spec-online.md` v3). `profiles.trophies` est **le ladder PvP**, alimenté uniquement par
   `pvp_report_result`. Tous les joueurs démarrent à **0**.

---

## 1. Réponses aux questions à trancher — résumé

| # | Question | Décision |
|---|---|---|
| A | Transport des coups | **Realtime Broadcast** (`<50 ms`, éphémère) sur un canal par match `match:{id}`, pas `postgres_changes` |
| B | Autorité / intégrité | **Lockstep déterministe à double validation** : chaque client rejoue l'action adverse via son propre `rules.js` (rejette l'illégal) ; hash d'état échangé à chaque coup (détection désync) ; **résultat cross-validé serveur** (2 rapports concordants → trophée) |
| C | Matchmaking | **RPC atomique** `pvp_find_match` sur table `matches` ; file FIFO avec **bande de trophées élargissante** (±100 → ±∞ en 20 s) ; + **code d'invitation ami** (`pvp_create_private` / `pvp_join_code`) |
| D | Compte requis | **Oui, PvP en ligne exige un compte connecté** (identité stable, trophées, anti-abus). Le jeu local reste jouable en invité (garde-fou n°2 intact) |
| E | Horloge | **5 min/joueur + incrément 3 s/coup** (Blitz). Active la clause GDD §8 « fin au temps + départage à la valeur ». Le local reste sans horloge |
| F | Format des coups | **Événements replay réutilisés** (`move`/`purchase`/`power` en algébrique) + `seq` + `hash` |
| G | Chaînes (Double coup / Second galop) | Chaque sous-coup = un événement `move` avec `chain:true` ; le tour ne passe qu'à la résolution de la chaîne |
| H | Écus | **Non transmis** (déterministes) ; recalculés localement par `gagnerEcus`, inclus dans le hash de contrôle |
| I | Déconnexion | Presence Realtime ; **absence > 30 s = défaite par abandon** ; fenêtre de reconnexion 30 s avec **resync d'état complet** |
| J | Abandon volontaire | Bouton « Abandonner » = **défaite immédiate** (message `resign` diffusé + rapport serveur) |
| K | Trophées PvP | **Elo simplifié K=32** ; `profiles.trophies` = **ladder PvP exclusif** (le PvAI n'alimente plus rien, v2) ; **départ 0** pour tous ; plancher 0 ; seul `pvp_report_result` y écrit |
| L | Bouton « En ligne » | **Réactivé** ; ouvre l'écran de recherche (exige connexion, sinon renvoie vers CONNEXION) |
| M | Découpage | 3 cycles : **W1 matchmaking/handshake**, **W2 sync des coups + horloge**, **W3 robustesse + trophées** |

---

## 2. A — Architecture réseau

### 2.1 Transport tranché : **Realtime Broadcast** par canal de match

**Décision** : les deux navigateurs échangent leurs coups via un **canal Realtime Broadcast**
nommé `match:{match_id}`. Chaque client `subscribe` au canal, `send` ses propres actions,
reçoit celles de l'adversaire. Le `matches` (table Postgres) sert **uniquement** au
matchmaking, au résultat final et à la reprise (snapshot de resync) — **pas** au relais des
coups en cours.

**Pourquoi Broadcast et pas `postgres_changes`** (vérifié état 2026) :

| Critère | Broadcast | Postgres Changes (INSERT dans `moves`) |
|---|---|---|
| Latence | **< 50 ms** (éphémère) | 50–200 ms (WAL) |
| Écritures DB par coup | **0** | 1 INSERT + réplication |
| Coût quota gratuit | 1 message ∈ 2 M/mois | 1 message + charge DB + WAL |
| Adapté à | **état de jeu, coups, curseurs** (reco officielle Supabase) | données à persister/auditer |
| Débit | scale au nb de messages | scale au **nb d'abonnés × écritures** (200 checks/écriture pour 100 abonnés) |

Un match roychec = **2 abonnés**, ~40-80 coups, chacun un petit message. Broadcast est le choix
canonique de Supabase pour « game state » (< 50 ms, éphémère). On ne persiste pas chaque coup :
c'est inutile pour jouer et ça consomme le quota DB. La persistance d'un historique de partie
est **hors scope** (le replay local `replay.js` couvre déjà le besoin côté client).

### 2.2 Budget quota (plan gratuit, chiffré, état 2026)

| Ressource | Limite plan gratuit | Consommation roychec | Marge |
|---|---|---|---|
| Connexions concurrentes | **200 pics** | 2 par match → **100 matchs simultanés** | Largement au-delà d'un lancement |
| Messages Realtime | **2 M/mois** | ~80 coups + ~20 contrôle = **~100 msg/partie** → 20 000 parties/mois | Confortable |
| Taille max message | **256 KB** | un coup ≈ 200 octets, un snapshot resync ≈ 3-5 KB | Aucun risque |
| Edge Functions | **500 k invocations/mois** | 1 appel/fin de partie (rapport résultat) | Négligeable |

**Conclusion** : le PvP tient **entièrement sur le plan gratuit** pour la phase de lancement.
Le premier mur serait 200 connexions concurrentes (= 100 parties en parallèle) — largement
au-delà de l'audience d'un lancement NAIOM. Si ce mur est atteint, c'est un « bon problème »
qui justifie le plan Pro (500 connexions incluses), pas un blocage de conception.

### 2.3 Isolation module (`game/src/online.js`)

Comme `account.js` pour l'auth, un **unique** module `online.js` encapsule toute la couche
Realtime. Il expose au reste du jeu une API plate (aucune fuite de `supabase-js`) :

```
initOnline(supabaseClient)          // réutilise le client déjà créé par account.js
findMatch({ trophies })  → Promise  // matchmaking file FIFO
createPrivate() → { code }          // partie privée (invitation ami)
joinByCode(code) → Promise          // rejoindre par code
sendAction(action)                  // diffuse une action locale sur le canal
onAction(cb) / onOpponentState(cb) / onPresence(cb) / onEnded(cb)  // callbacks entrants
resign()                            // abandon volontaire
leave()                             // quitte le canal (retour menu)
getOnline() → état plat lisible par le rendu (statut, pseudo adverse, horloges…)
```

`online.js` réutilise **le même client Supabase** que `account.js` (une seule instance ;
`account.js` l'exporte ou le passe à `initOnline`). Aucune seconde dépendance.

---

## 3. B — Autorité et intégrité

### 3.1 Le problème posé par spec-online §4.3

La spec-online assumait un jeu 100 % client falsifiable et **renvoyait explicitement la vraie
parade ici** : « un serveur autoritatif rejouera/arbitrera les coups ». Sur une stack Supabase
sans serveur de jeu dédié, un **serveur autoritatif qui simule roychec** n'existe pas (pas de
process Node persistant ; Postgres ne rejoue pas la logique d'échecs augmentés ; une Edge
Function qui réimplémente tout `rules.js` en Deno serait un doublon coûteux et divergent). Il
faut donc un modèle d'autorité **réaliste pour cette stack**.

### 3.2 Modèle tranché : **lockstep déterministe à double validation**

**Principe** : il n'y a pas d'autorité centrale de coup. À la place, **chaque client est
l'arbitre des coups de l'adversaire**, en les rejouant à travers **son propre moteur `rules.js`
de confiance**. Le réseau ne transporte que des **intentions d'action** (« le cavalier b1 va en
c3 »), jamais un état de jeu que l'on croirait sur parole.

Déroulé pour chaque action reçue de l'adversaire :
1. **Contrôle d'appartenance** : l'action porte-t-elle sur une pièce dont l'`owner` est bien
   l'adversaire ? Sinon → rejet.
2. **Contrôle de tour** : est-ce le tour de l'adversaire (`state.turn`) ? Sinon → rejet.
3. **Contrôle de légalité** : l'action est-elle dans `coupsLegaux(board, piece)` (ou
   `ciblesRuee`/`ciblesRayon`/`ciblesDecret` pour un pouvoir, ou un achat conforme au catalogue
   et au solde recalculé) ? Sinon → rejet.
4. **Application** : si tout passe, on rejoue l'action via **exactement les mêmes fonctions que
   le joueur local** (`jouerCoup`, `acheter`, `executerRuee`, …). L'état résultant est donc
   produit par du code de confiance, pas copié depuis le réseau.
5. **Contrôle d'intégrité** : chaque action embarque le **hash d'état** (`state.hash`, §5.4) que
   l'émetteur avait **après** son action. Le récepteur compare au sien. **Divergence = désync**
   → §3.4.

### 3.3 Ce que ça garantit / ne garantit pas (honnête)

**Garanti** :
- Un client modifié **ne peut pas faire passer un coup illégal** : le récepteur le rejette via
  son propre `rules.js`. Déplacer une pièce qui n'existe pas, bouger la pièce adverse, capturer
  le roi hors de portée, acheter sans solde → **impossible à imposer**.
- Un client modifié **ne peut pas fabriquer un état arbitraire** : l'état n'est jamais transmis
  ni cru ; il est **re-dérivé** de la séquence d'actions par chaque client.
- Le seul « pouvoir » d'un tricheur reste **choisir quel coup légal il joue** — c'est-à-dire
  jouer au jeu. C'est une garantie étonnamment forte pour une stack sans serveur de jeu.

**Non garanti** (limites assumées, documentées comme la spec-online l'exige) :
- **Aide extérieure au choix du coup** (moteur d'échecs qui souffle le meilleur coup légal) :
  indétectable, comme sur tout jeu client. Hors scope anti-triche v1.
- **Rapport de résultat falsifié** : un client déconnecté volontairement puis prétendant avoir
  gagné. → paré par la **cross-validation serveur** (§3.5).
- **Fuite d'information** : les deux clients connaissent tout l'état (jeu à information parfaite,
  comme les échecs). Aucun secret à protéger — non pertinent.

### 3.4 Détection et gestion de désync

Si les hashes divergent après une action, les deux moteurs ont produit des états différents
(bug déterministe ou tentative de triche). **Décision** : la partie est **suspendue**, un
`resync` est demandé (l'émetteur renvoie un **snapshot complet signé de son état**, §7.3), et le
récepteur **recompare** : si le snapshot est cohérent avec la séquence d'actions connue, on
reprend ; sinon la partie est **annulée sans trophée** pour personne, avec log console
`[online] desync`. On ne veut pas qu'une divergence attribue une victoire injuste.

> Le déterminisme est réaliste ici car le moteur **est déjà déterministe** hors IA : `jouerCoup`,
> `gagnerEcus`, les cooldowns et le plafond d'écus ne dépendent d'aucun aléa. Le seul aléa du
> projet est dans `ai.js` (absent du PvP). Le hash couvre `board + ecus + turn + cooldowns +
> shields + flags` (§5.4).

### 3.5 Cross-validation serveur du résultat (la seule écriture autoritaire)

Le seul enjeu d'intégrité qui **modifie une donnée persistée** est l'attribution des trophées.
Décision : à la fin de partie, **chaque client rapporte le résultat** via RPC
`pvp_report_result(match_id, i_won boolean, opp_id)`. Le serveur :
1. stocke le rapport dans la ligne `matches` (`result_p1`, `result_p2`) ;
2. **n'applique les trophées que lorsque les deux rapports concordent** (l'un dit « j'ai gagné »,
   l'autre « j'ai perdu ») → Elo calculé serveur (§8), écrit atomiquement sur les **deux**
   `profiles` ;
3. **incohérence** (les deux se disent gagnants, ou un seul rapporte dans la fenêtre) → aucun
   trophée, `matches.status='disputed'`, log. Un abandon/déco déclenche un rapport automatique
   côté adversaire présent (§7), qui devient concordant après le timeout (le fuyard ne rapporte
   pas, mais son abandon est constaté serveur → §8.3).

Cette RPC est la **transposition PvP** de l'ancienne `apply_match_result` (désormais obsolète,
spec-online v3 §4.3) : le client ne fixe jamais un delta ni un total ; le serveur calcule à
partir des trophées des deux profils et du résultat **concordant**. C'est la « vraie parade »
promise par spec-online §4.3, dans les limites d'une stack serverless : **le résultat n'est écrit
que si les deux parties sont d'accord**, ce qui neutralise le rapport falsifié unilatéral.

---

## 4. C — Matchmaking

### 4.1 File publique — RPC atomique, bande de trophées élargissante

**Décision** : matchmaking **premier arrivé / premier apparié**, avec une bande de trophées qui
**s'élargit dans le temps** pour éviter l'attente infinie sur une petite population.

> **Amendement v3 (cadences)** : l'appariement est **strict par cadence** — `matches.cadence`
> (60/300/3600/86400 s, défaut 300) est filtré dans `pvp_find_match(p_band, p_cadence)` ; la
> bande de trophées ne s'élargit qu'à l'intérieur de la cadence choisie (jamais de match
> cross-cadence). Si le joueur relance une recherche avec une autre cadence, son match
> `waiting` de l'ancienne cadence est purgé serveur. Migration : `schema-pvp-cadence.sql`.

> **Note v2 (départ à 0)** : tous les joueurs démarrent à **0 trophée** (le PvAI n'en donne plus).
> Au lancement, la population est donc **concentrée autour de 0** puis s'étale au fil des parties
> classées. La bande élargissante (ci-dessous) reste pertinente : au début, ±100 apparie
> quasiment tout le monde (tout le monde est proche de 0) ; à mesure que les écarts se creusent,
> la bande fait son travail. **Aucun ajustement nécessaire** — le départ commun à 0 rend même le
> matchmaking initial plus simple qu'avec un héritage de trophées PvAI hétérogène (autre raison
> de fond pour laquelle supprimer les trophées PvAI assainit le ladder).

Table `matches` (schéma esquissé §4.4). RPC atomique `pvp_find_match(p_trophies int)` :

```sql
-- Cherche un match en attente dans la bande de trophées ; sinon en crée un.
-- SELECT ... FOR UPDATE SKIP LOCKED garantit qu'un même match n'est pas pris par deux joueurs.
create or replace function public.pvp_find_match(p_band int default 100)
returns table(match_id uuid, side int, channel text)
language plpgsql security definer set search_path = public as $$
declare
  v_me uuid := auth.uid();
  v_my_tr int;
  v_match uuid;
begin
  select trophies into v_my_tr from profiles where id = v_me;

  -- 1) Tenter de rejoindre un match ouvert compatible (bande de trophées).
  select id into v_match
  from matches
  where status = 'waiting'
    and p1 <> v_me
    and abs(p1_trophies - v_my_tr) <= p_band
  order by created_at
  for update skip locked
  limit 1;

  if v_match is not null then
    update matches
       set p2 = v_me, p2_trophies = v_my_tr, status = 'ready', ready_at = now()
     where id = v_match;
    return query select v_match, 1, 'match:'||v_match::text;  -- rejoignant = side 1 (Joueur 2)
    return;
  end if;

  -- 2) Aucun compatible : créer un match en attente (je suis side 0 / Joueur 1).
  insert into matches(p1, p1_trophies, status)
    values (v_me, v_my_tr, 'waiting')
    returning id into v_match;
  return query select v_match, 0, 'match:'||v_match::text;
end $$;
```

**Bande élargissante** (côté client, sans re-solliciter le serveur en boucle serrée) : le client
appelle `pvp_find_match(band)` avec `band` croissant s'il reste en `waiting` :

| Temps en file | Bande `±trophées` | Rappel |
|---|---|---|
| 0–5 s | **±100** | appariement serré |
| 5–10 s | **±250** | |
| 10–20 s | **±600** | |
| > 20 s | **±∞** (n'importe qui) | garantit une partie sur petite population |

Le client re-`SELECT` son propre match toutes les **2 s** (ou écoute un canal `lobby`) pour
savoir s'il a été rejoint. Dès `status='ready'`, les deux basculent sur `match:{id}`.

**Justification FIFO + bande** : sur une base de joueurs modeste au lancement, un strict « même
niveau » condamne à l'attente. La bande élargissante donne la priorité à un **appariement
équitable** puis privilégie **jouer** sur attendre. Le seuil ±∞ à 20 s garantit qu'on trouve
toujours quelqu'un s'il y a au moins un autre joueur en file.

### 4.2 Annulation de file

Bouton « Annuler » : RPC `pvp_cancel_wait()` → `delete from matches where p1=auth.uid() and
status='waiting'`. Fermeture d'onglet en file : la ligne `waiting` reste ; un balayage
(`status='waiting' and created_at < now()-interval '2 min'` nettoyé à la prochaine requête, ou
Edge Function cron) l'élimine. Un match `waiting` périmé n'est jamais apparié car le rejoignant
tentera d'ouvrir le canal et constatera l'absence (timeout handshake §7.1).

### 4.3 Partie privée (invitation ami) — code aléatoire

**Décision** : en plus de la file publique, **création d'une partie privée avec code**, pour
jouer contre un ami précis (hors matchmaking par trophées).

- `pvp_create_private()` → génère un **code à 6 caractères** (base32 sans ambigus : pas de
  `0/O/1/I`), insère un `matches` `status='waiting', private=true, code=XXXXXX`, renvoie le code.
- L'hôte partage le code (copier-coller) ; l'ami saisit le code → `pvp_join_code('XXXXXX')`
  (même logique atomique que `pvp_find_match` mais ciblée sur le code, **sans** contrainte de
  bande de trophées).
- ~~Une partie privée compte pour les trophées comme une partie publique~~ — **RENVERSÉ
  en v3.3 (décision utilisateur 12/07)** : les parties privées sont des **parties
  amicales, jamais classées**. `pvp_report_result` finalise le match (winner, écran de
  fin) mais n'écrit **aucun trophée** quand `matches.private = true`. Les **revanches**
  (toujours `private = true` techniquement) sont non classées elles aussi. Seule la
  **file publique** alimente l'Elo.
- **Variante (v3.2, GDD §7.2 v3.1)** : le créateur impose une des 6 variantes via
  `pvp_create_private(p_cadence, p_variant)` ; le rejoignant en hérite (`pvp_join_code`
  renvoie `variant`), la revanche la copie (`pvp_rematch`). File publique : toujours
  `'pvp_standard'`. L'interaction trophées est réglée par v3.3 : privée ⇒ non classée,
  variante ou pas.

### 4.4 Schéma `matches` (esquisse)

```sql
create table public.matches (
  id            uuid primary key default gen_random_uuid(),
  p1            uuid not null references profiles(id),
  p2            uuid          references profiles(id),
  p1_trophies   int  not null,
  p2_trophies   int,
  status        text not null default 'waiting',   -- waiting | ready | playing | ended | disputed | voided
  private       boolean not null default false,
  code          text unique,                        -- partie privée
  result_p1     text,   -- 'win'|'loss'|'draw' rapporté par p1
  result_p2     text,
  winner        int,    -- 0|1|null (nulle) — figé serveur quand rapports concordants
  created_at    timestamptz not null default now(),
  ready_at      timestamptz,
  ended_at      timestamptz
);
alter table public.matches enable row level security;
-- Un joueur ne lit/écrit que les matchs où il est p1 ou p2 (ou un match 'waiting' à rejoindre).
create policy "matches_select_involved" on public.matches for select
  using (auth.uid() = p1 or auth.uid() = p2 or status = 'waiting');
-- Les mutations passent par les RPC security definer (find/join/report) : pas d'UPDATE direct.
```

---

## 5. D — Déroulé de partie & protocole

### 5.1 Cycle de vie d'une partie en ligne

```
[menu] → clic « En ligne » → (compte requis : sinon overlay CONNEXION)
       → écran RECHERCHE (pvp_find_match, bande élargissante)
       → status 'ready' des 2 côtés
       → JOIN canal match:{id} + handshake 'hello'/'ready' (§7.1)
       → status 'playing' ; commencerPartie('pvw', { side, matchId, opp })
       → échange de coups en lockstep (§5.3) sous horloge (§6)
       → capture du roi OU chute de drapeau OU abandon/déco
       → finPartie → pvp_report_result → écran de fin + delta trophée + revanche
```

Le **side 0** (créateur / Joueur 1, Bleu Poudré, joue en premier — convention GDD/spec-ia) ;
le **side 1** (rejoignant / Joueur 2, Corail). C'est cohérent avec le placement `board.js` et le
choix PvAI (humain = J1). Pas de tirage de couleur en v1 (le créateur est J1) ; la **revanche**
inverse les rôles (§9.4).

### 5.2 Modèle d'entrée local / réseau (réutilise le gating PvAI)

Le PvP réutilise **exactement** le garde-fou déjà en place pour l'IA : le joueur local ne peut
agir **que quand `state.turn === side_local`**. C'est le même principe que `planifierCoupIA`
qui ne joue que si `state.turn === state.ai.player`. Ici :
- `state.turn === side_local` → **entrées souris/clavier actives** ; à la résolution de chaque
  action locale, on **diffuse** l'action (§5.5).
- `state.turn !== side_local` → **entrées bloquées** ; on **applique** les actions entrantes du
  réseau (une file d'actions consommée dans `loop()`), comme le bot applique son coup.

### 5.3 Format d'un message (réutilise l'événement replay)

Le protocole **réutilise le format d'événement de `replay.js`** (déjà en notation algébrique,
déjà sérialisable), enrichi de champs réseau. Un message Broadcast :

```jsonc
{
  "seq": 42,                 // n° d'action monotone, par match (détecte perte/ordre)
  "turn": 0,                 // owner de l'action (contrôle §3.2)
  "kind": "move",            // "move" | "purchase" | "power" | "resign" | "resync" | "hello" | "ready" | "clock"
  // -- move --
  "piece": "N", "from": "b1", "to": "c3", "chain": false,
  // -- purchase --
  "upgrade": "ruee", "pos": "b1",
  // -- power --
  "power": "Ruée", "target": "e5",
  "hash": "a3f9…",           // état APRÈS application chez l'émetteur (intégrité §5.4)
  "clock": { "0": 297.3, "1": 300.0 }  // horloges restantes (s) au moment de l'envoi
}
```

Correspondance directe avec les hooks existants : `recordMove` → `kind:"move"`,
`recordPurchase` → `kind:"purchase"`, `recordPower` → `kind:"power"`. **Aucune sérialisation
neuve à inventer** — on branche l'émission là où le replay enregistre déjà.

### 5.4 Hash d'état (intégrité déterministe)

`state.hash` = hash 32 bits (djb2/FNV-1a, ~15 lignes, pas de dépendance) sur une **chaîne
canonique** de l'état pertinent :
```
pour chaque case r,c (ordre fixe) : owner|type|shield|sacrificeArmed|decretUsed|
    doubleCoupUsed|rempartGranted|sortedCooldowns|sortedUpgrades
puis : ecus[0]|ecus[1]|turn|chain?piece.id:chainType
```
Exclut tout ce qui est cosmétique (`anim`, `popups`, `flashes`, `_goldT`, `ui`). Deux moteurs
déterministes ayant appliqué la même séquence produisent le **même hash**. Divergence → §3.4.

### 5.5 Achats, écus, pouvoirs et chaînes dans le protocole

- **Écus** : **jamais transmis**. `gagnerEcus` (revenu +2, bonus de capture, plafond 30) est
  déterministe : chaque client recalcule le solde des deux joueurs. Le solde entre dans le hash
  pour détecter toute divergence. Un achat émet `kind:"purchase"` ; le récepteur rejoue
  `acheter(id)` sur la bonne pièce (contrôle solde recalculé + catalogue + plafond 2/pièce).
- **Pouvoirs actifs** (Ruée, Rayon, Décret, Rempart, Sacrifice) : émis en `kind:"power"` avec la
  `target` algébrique. Le récepteur rejoue l'exécuteur correspondant (`executerRuee`, …), qui
  pose le cooldown et consomme le tour comme en local. Le **ciblage** (phases `ruee-target`…)
  reste **purement local à l'émetteur** : on ne diffuse que l'action résolue (pièce + cible),
  pas les états transitoires de visée.
- **Chaînes** (`state.chain` : Double coup / Second galop) : point délicat car un tour peut
  contenir **2 mouvements de la même pièce sans changer `state.turn`**. Décision : chaque
  sous-coup est diffusé comme un **`move` distinct avec `chain:true`** ; le récepteur les applique
  dans l'ordre `seq`, et **le tour ne passe à l'adversaire qu'au sous-coup qui résout la chaîne**
  (celui après lequel `state.chain` redevient `null` chez l'émetteur). L'émetteur peut aussi
  **décliner** l'enchaînement (`endChain`) : diffusé comme `kind:"move"` neutre de fin de tour ou
  un `kind:"clock"` de passe — plus simple : un flag `endChain:true` sur le dernier message. Le
  récepteur, en rejouant, obtient naturellement le même `state.chain` (déterministe) et sait donc
  quand la chaîne se termine **sans même lire le flag** ; le flag n'est qu'une sécurité.

  > **Attention `state.chain`** (signalé à gameplay-dev) : ne jamais passer le tour côté réseau
  > sur un `finDeTour()` local tant que `state.chain !== null`. La bascule de `state.turn` est
  > déterministe et déjà gérée par `finDeTour` ; le réseau ne fait que **rejouer les mêmes
  > appels** — il ne doit pas dupliquer la logique de fin de tour.

### 5.6 Ordonnancement et fiabilité

Broadcast n'est **pas** garanti ordonné/fiable à 100 %. Mitigations :
- **`seq` monotone par match** : le récepteur applique dans l'ordre ; un `seq` manquant → il
  attend 500 ms puis demande un `resync` (§7.3). Un `seq` déjà vu → ignoré (idempotence).
- **ACK implicite par le hash** : le prochain message adverse contient le hash post-son-coup ;
  s'il correspond au mien, le lockstep est confirmé. Pas d'ACK explicite (économie de messages).
- **File d'application** : les messages entrants sont mis en file et consommés dans `loop()`
  quand `state.phase` le permet (pas pendant une animation), comme les coups IA.

---

## 6. E — Horloge de partie

### 6.1 Décision : cadence au choix, temps fixe (active la clause GDD réservée)

> **Amendement v3.1 (2026-07-12)** : **l'incrément +3 s est supprimé** (décision utilisateur
> après test réel — il vidait le timer de son sens). Temps fixe par joueur, aucune seconde
> regagnée en jouant. La ligne « Incrément » du tableau ci-dessous et la règle « 1 seul
> incrément par chaîne » sont caduques.
>
> **Amendement v3 (2026-07-12)** : la cadence unique 5+3 devient un **choix parmi quatre**
> — ⚡ 1 min (bullet) / 🔥 5 min (blitz, défaut) / 🕐 1 h (longue) / 📅 1 jour (lente) —
> sélectionné sur l'écran « CADENCE DE JEU » après « Lancer une recherche » ou « Jouer avec
> un ami ». Toutes les règles ci-dessous (achats, drapeau,
> départage §6.3) restent identiques quelle que soit la cadence. Affichage horloge ≥ 1 h :
> format `5h32` (les secondes ne sont plus affichées à cette échelle). Limite assumée v1 :
> la cadence 1 jour reste soumise à la fenêtre de reconnexion 30 s (§7.2) — c'est une partie
> LONGUE à onglet ouvert, pas du jeu par correspondance asynchrone (hors-périmètre §13).

Le jeu **local** est sans horloge (GDD §9). Le **online** est précisément le contexte où le GDD
§7 réservait les timers et où GDD §8 prévoit la **fin au temps + départage à la valeur**. Sans
horloge, une partie en ligne est otage d'un joueur qui ne joue plus (rage-park). Décision :

| Paramètre | Valeur | Note |
|---|---|---|
| Budget par joueur | **5 min (300 s)** | Blitz, une seule cadence en v1 (pas de sélecteur) |
| Incrément par coup | **aucun** (v3.1) | ~~+3 s anti-zeitnot~~ — retiré : le temps est un budget fixe, jouer ne le regonfle pas |
| Chute de drapeau | **défaite au temps** | Sauf départage GDD §8 : voir §6.3 |
| Chaînes | l'horloge du joueur actif tourne pendant toute sa chaîne | (règle « 1 seul incrément » caduque en v3.1) |
| Achat/ciblage | comptent dans le temps du joueur actif | L'intendance fait partie du tour |

**Justification 5+3** : assez court pour une partie casual (< 12 min), assez long pour réfléchir
et gérer l'économie d'écus. Cadence unique en v1 = un seul comportement à tester ; le sélecteur
(1/3/10 min du GDD §7) est une extension triviale post-v1.

### 6.2 Autorité de l'horloge : locale, réconciliée par message

Chaque client décompte **sa propre horloge et celle estimée de l'adversaire** localement. Chaque
message porte `clock:{0,1}` (temps restants au moment de l'envoi) → le récepteur **recale**
l'horloge adverse sur cette valeur de vérité (compense la latence/dérive). Une divergence
d'horloge n'est pas critique (pas de trophée en jeu sur le tic exact), donc pas besoin d'un
serveur de temps. La chute de drapeau est **déclarée par le joueur qui la constate** (le sien =
défaite, celle de l'adversaire = réclamation) et validée par concordance des rapports (§3.5).

### 6.3 Chute de drapeau + départage (GDD §8)

Quand un drapeau tombe : on applique la **condition secondaire GDD §8** — comparaison de la
**valeur totale des pièces capturées** (Pion 1, Cav/Fou 3, Tour 5, Dame 9, + cartes [S] Vétéran
/Forteresse). Total supérieur = victoire ; **égalité = nulle** (delta trophée 0, §8). Cette
valeur est **déterministe et déjà connue des deux clients** (recalculable depuis le board /
captures), donc pas de litige. C'est la première activation réelle de la clause de départage que
le GDD gardait « pour le futur online ».

---

## 7. F — Abandon / déconnexion / reconnexion

### 7.1 Handshake d'ouverture (anti-fantôme)

Au JOIN du canal `match:{id}`, chaque client envoie `hello` puis attend le `hello` adverse.
Si pas de `hello` adverse sous **10 s** → l'adversaire ne s'est jamais connecté (onglet fermé en
file, match `waiting` périmé) → retour écran recherche avec message « adversaire introuvable, on
relance la recherche ». Les deux `hello` reçus → chacun envoie `ready` → `status='playing'`,
le side 0 a le trait.

### 7.2 Détection de déconnexion : Presence Realtime + heartbeat

On active **Presence** sur le canal (`track` à la connexion). Un `leave` de Presence, ou l'absence
de heartbeat (message `clock` léger toutes les **10 s** pendant son tour, sinon un ping passif),
signale que l'adversaire a disparu.

| Événement | Fenêtre | Conséquence |
|---|---|---|
| Adversaire perd la connexion (Presence `leave`) | ouvre la **fenêtre de reconnexion 30 s** ; UI « Adversaire déconnecté — 30 s… » | — |
| Reconnexion sous 30 s | `hello` de reprise → **resync complet** (§7.3) → reprise ; les horloges ont continué à courir | Partie reprend |
| Pas de reconnexion à 30 s | rapport auto « je gagne » du présent → `pvp_report_result` | **Victoire par abandon** |
| Chute d'horloge pendant l'absence | le drapeau tombe normalement | Défaite au temps (prioritaire sur les 30 s si l'horloge tombe avant) |

**Justification 30 s** : couvre une coupure wifi/tunnel courte ou un changement de réseau mobile,
sans immobiliser trop longtemps le joueur resté. Au-delà, l'attente pénalise le présent → on
tranche en sa faveur.

### 7.3 Reconnexion & resync d'état complet

À la reprise, le client absent a **perdu son état** (rechargement possible). Décision : **resync
d'état complet** émis par le client présent. Message `kind:"resync"` avec un **snapshot sérialisé
canonique** (le même contenu que le hash §5.4, mais valeurs complètes : positions, upgrades,
cooldowns, shields, flags, écus, turn, horloges, seq courant). Le revenant **reconstruit `state`
depuis le snapshot** (pas depuis le rejeu de tous les coups — plus simple et robuste), vérifie
le hash, puis reprend le lockstep au `seq` courant. Snapshot ≈ 3-5 KB, très en-dessous des
256 KB max.

> Si les **deux** joueurs disparaissent (aucun présent pour émettre le snapshot) → la partie est
> **annulée** (`status='voided'`), aucun trophée. Rare et acceptable.

### 7.4 Abandon volontaire

Bouton « Abandonner » (déjà présent dans `actionBouton` case `'abandonner'`, réutilisé) → diffuse
`kind:"resign"`, appelle `finPartie(adversaire)` localement, et rapporte `i_won=false`. **Défaite
immédiate**, trophées appliqués (l'adversaire rapportera `i_won=true`, concordance → Elo écrit).

### 7.5 Anti-rage-quit (vrai adversaire, cette fois)

Contrairement au PvAI (spec-online §3.2 : recharger n'avait aucun effet, toléré), **ici recharger
pour éviter une défaite = perdre quand même** : la déconnexion ouvre la fenêtre 30 s, puis
victoire par abandon pour l'adversaire → trophées perdus pour le fuyard (rapport auto du présent).
C'est exactement la « vraie parade » que spec-online §3.2/§4.3 renvoyait à cette phase. Un
fuyard récurrent perd donc des trophées à chaque fuite — dissuasif suffisant en v1 (pas de
pénalité additionnelle type ban, hors scope).

---

## 8. G — Trophées PvP (source **unique** des trophées depuis v2)

### 8.1 Décision : Elo simplifié K=32, ladder PvP exclusif, départ 0

**Décision (v2)** : le PvP utilise un **Elo simplifié** et est **la seule chose qui écrit** dans
`profiles.trophies`. Depuis la suppression des trophées PvAI (`spec-online.md` v3), il n'y a plus
qu'**un seul ladder, purement PvP**. GDD §10 en fait l'échelle de matchmaking unique, ce qui est
désormais parfaitement cohérent : les trophées **reflètent uniquement des résultats contre de
vrais adversaires**, jamais du farm contre l'IA.

**Point de départ : 0 pour tous.** Il n'y a **aucun héritage** de trophées PvAI à reprendre
(ils n'existent plus). Un compte tout neuf, ou un compte qui n'avait accumulé que des trophées
PvAI en v1/v2, démarre le ladder PvP à **0**. Justification : (a) simplicité et équité — tout le
monde part au même point ; (b) l'ancien total PvAI était farmable donc non fiable comme niveau
de départ ; (c) la remise à 0 (à faire côté migration, `update profiles set trophies = 0`) purge
le ladder pollué qui a motivé la décision v2.

Formule (calculée **serveur**, RPC `pvp_report_result` §3.5) :
```
attendu_A = 1 / (1 + 10^((trophies_B - trophies_A) / 400))
delta_A   = round(32 * (score_A - attendu_A))      // score = 1 victoire, 0.5 nulle, 0 défaite
delta_B   = round(32 * (score_B - attendu_B))       // ≈ -delta_A
trophies_A = max(0, trophies_A + delta_A)
trophies_B = max(0, trophies_B + delta_B)
```

| Situation | Gain vainqueur | Perte perdant |
|---|---|---|
| Niveaux égaux | **+16** | **−16** |
| Vainqueur largement mieux classé (favori) | **+4 à +10** | **−4 à −10** |
| Vainqueur largement moins bien classé (outsider) | **+22 à +30** | **−22 à −30** |
| **Nulle** (départage égal §6.3) | delta selon écart (± petit) | idem opposé |

**Plancher : 0.** Pas de plafond.

**Justification Elo vs barème fixe** :
1. **Cohérence matchmaking** : la bande de trophées (§4.1) suppose que les trophées reflètent le
   niveau. L'Elo est précisément conçu pour ça — bien mieux qu'un ±fixe qui gonfle indéfiniment.
2. **Zéro-somme (≈)** : le PvP est compétitif ; ce qu'un joueur gagne, l'autre le perd. Un ladder
   sain n'inflate pas (contrairement à l'ancien barème PvAI à espérance positive, supprimé v2).
3. **Anti-farm d'écart** : battre beaucoup plus faible que soi rapporte peu (+4) ; battre plus
   fort rapporte gros (+30). On ne monte pas en tapant des débutants.

### 8.2 Un seul compteur, une seule RPC autorisée (v2)

`profiles.trophies` a **une seule source d'écriture** : `pvp_report_result` (`security definer`).
- L'ancienne RPC PvAI `apply_match_result` est **obsolète** (spec-online v3 §4.3) : à **révoquer**
  (`revoke execute`) ou supprimer lors du déploiement du PvP, pour fermer le dernier vecteur de
  farm.
- Le trigger `guard_trophies` (verrou : `trophies` en lecture seule hors RPC habilitée, défini
  spec-online §4.3) **reste** ; il doit désormais habiliter `pvp_report_result` comme **unique**
  fonction autorisée à écrire `trophies`. Signalé à gameplay-dev : mettre à jour la liste des
  fonctions habilitées (retirer `apply_match_result`, ajouter `pvp_report_result`).

> **Il n'y a plus de « second compteur / progression solo séparée »** : l'option a été
> explicitement écartée par l'utilisateur (2026-07-09). Un seul nombre, un seul ladder, PvP.

### 8.3 Cas déconnexion/abandon dans le calcul

Abandon/déco = **défaite pleine** pour le fuyard (score 0), victoire pleine pour le présent
(score 1) : même Elo que si le roi avait été capturé. Le rapport unilatéral du présent suffit à
constater l'abandon **si** le serveur voit que l'autre n'a pas rapporté dans la fenêtre (60 s) et
que le match était `playing` : `pvp_report_result` du présent avec `opponent_abandoned=true` est
accepté seul après ce délai (unique exception à la règle « 2 rapports concordants », justifiée
par l'impossibilité pour un fuyard de rapporter). Un `disputed` ne survient que si **les deux**
rapportent une victoire.

---

## 9. H — UI / UX

Tout au style DA v2 (helper `bouton()`, chips pastel, palette ambre/terracotta/sauge), overlay
canvas comme le menu et l'écran de victoire existants. Aucune nouvelle convention visuelle.

### 9.1 Réactivation du bouton « En ligne » (`pvw`)

`render.js` L.951-955 grise actuellement le bouton (« bientôt »). Décision : le **réactiver**
(`enabled:true`, sous-titre retiré). Au clic `pickMode/pvw` (la garde L.781 est levée) :
- **Non connecté** → au lieu de lancer, ouvrir l'overlay CONNEXION (`startAuth()`) avec un
  sous-titre « Connecte-toi pour jouer en ligne ». Le PvP exige un compte (§ décision D).
- **Connecté** → passer à l'écran RECHERCHE (nouvel état `phase:'matchmaking'`).

### 9.2 Écrans nouveaux (états de `phase`)

| Écran | `phase` | Contenu | Actions |
|---|---|---|---|
| Recherche | `matchmaking` | Spinner « Recherche d'un adversaire… », temps écoulé, bande courante (« niveau ±250 ») ; + bouton « Jouer avec un ami » (code) | Annuler → menu |
| Ami (créer) | `matchmaking` | Code à 6 car. en gros + « Copier », « En attente… » | Annuler |
| Ami (rejoindre) | `matchmaking` | `<input>` DOM code + « Rejoindre » | Annuler |
| Match trouvé | `matchmaking` | `♟ {moi} 🏆{tr}` vs `♟ {adversaire} 🏆{tr}` + compte à rebours 3 s | (auto) |
| En partie | `play` (mode `pvw`) | Plateau + HUD habituel + **2 horloges** (haut = adversaire, bas = moi) + pseudo adverse + bouton « Abandonner » | jouer / abandonner |
| Adversaire déconnecté | overlay sur `play` | « {adversaire} déconnecté — reconnexion 28 s… » (barre qui descend) | Attendre / (auto victoire) |
| Fin de partie | `gameover` | « Roi capturé » / « Victoire au temps » / « Abandon » + `+N🏆 / −N🏆` (Elo, animé 600 ms — composant delta réaffecté depuis l'écran PvAI, spec-online v3 §3.3) + nouveau total | **Revanche** / Menu |

### 9.3 Horloges à l'écran

Deux pastilles `mm:ss` (réutilisent la zone HUD, style chip). Celle du joueur actif **pulse
doucement** (cohérent avec l'anneau de ciblage existant). Sous 30 s → passe en `C_TERRACOTTA`.
~~L'incrément +3 s fait un petit « +3 » vert~~ — **retiré en v3.1** avec l'incrément lui-même
(le popup avait été livré 12/07 matin puis retiré le jour même, décision utilisateur).

### 9.4 Revanche

Bouton « REVANCHE » sur l'écran de fin : diffuse `rematch?` sur le canal (encore ouvert 20 s
après la fin). Si l'adversaire accepte (`rematch!`) → nouveau `matches` privé instantané entre
les deux mêmes, **couleurs inversées** (l'ex-J2 crée, devient J1). Si l'adversaire a quitté ou
refuse sous 20 s → bouton grisé « Adversaire parti », retour menu. Pas de revanche = comportement
par défaut (retour menu). Justification couleurs inversées : équité (l'avantage du trait tourne).

### 9.5 Affichage du pseudo adverse

Le pseudo adverse (lu depuis `matches.p2`/`p1` → `profiles.pseudo`, jointure côté RPC de
matchmaking qui renvoie `opp_pseudo, opp_trophies`) s'affiche : à l'écran match trouvé, dans le
HUD en partie (au-dessus du plateau, côté Corail), et à l'écran de fin. Jamais l'email.

---

## 10. I — Découpage en cycles (livrables/testables isolément)

Calqué sur A/B/C de spec-online et cycle 1/2 de spec-ia. Chaque cycle a son critère « le jeu
tourne » vérifiable en **2 onglets navigateur**.

### Cycle W1 — Matchmaking & handshake (aucune synchro de coups)
- SQL : table `matches`, RLS, RPC `pvp_find_match` / `pvp_cancel_wait` / `pvp_create_private` /
  `pvp_join_code`. **Remise à 0 des trophées** (`update profiles set trophies = 0`) — purge du
  ladder pollué par le farm PvAI (v2). Module `online.js` (init Realtime, JOIN canal, Presence,
  `hello`/`ready`).
- UI : réactiver `pvw`, écran RECHERCHE + ami (code) + MATCH TROUVÉ. **Pas encore de partie** :
  au `ready`, on affiche « connecté à {adversaire} » puis on pose le plateau initial figé.
- **Critère « le jeu tourne »** : dans 2 onglets (2 comptes), les deux se trouvent, voient le
  pseudo/trophées de l'autre, le canal est ouvert (Presence à 2). Le jeu local (PvP/PvAI/invité)
  **inchangé**. Fermer un onglet → l'autre voit « déconnecté ».

### Cycle W2 — Synchro des coups + horloge (partie jouable de bout en bout)
- `online.js` : `sendAction`/`onAction`, file d'application, hash §5.4, horloges 5+3 (§6).
- Accroches `main.js` (§11) : branche `pvw` dans `commencerPartie` ; gating d'entrée par
  `state.turn === side` ; émission aux points `recordMove/recordPurchase/recordPower` ;
  application des actions entrantes via `jouerCoup`/`acheter`/exécuteurs ; horloges.
- **Critère** : une partie complète se joue à 2 onglets — coups, captures, achats d'améliorations,
  pouvoirs actifs (Ruée/Rayon/Décret/Rempart/Sacrifice), **chaînes** (Double coup, Second galop),
  jusqu'à capture du roi ou chute de drapeau + départage. Hash concordant à chaque coup (0 désync
  sur une partie normale). Le moteur `rules.js`/`board.js` **non modifié**.

### Cycle W3 — Robustesse & trophées
- Reconnexion/resync (§7.3), timeouts (handshake 10 s, abandon 30 s), abandon volontaire,
  détection désync + annulation, gestion `seq` manquant.
- RPC `pvp_report_result` (Elo K=32, cross-validation, exception abandon), **révocation de
  `apply_match_result`**, mise à jour de `guard_trophies` (habiliter `pvp_report_result`), écran
  de fin avec delta trophée, **revanche**.
- Messages d'erreur (adversaire introuvable, réseau, canal perdu), incitation, cas limites.
- **Critère** : les scénarios QA-PVW-01..18 (§12) passent ; **0 régression** sur QA local
  (spec-online §6, spec-ia §7, QA04 moteur).

**Pourquoi ce découpage** : W1 isole toute la plomberie matchmaking/Realtime **sans toucher au
gameplay** (risque nul sur le moteur) ; W2 concentre la synchro sur les mêmes points d'accroche
déterministes que le replay ; W3 ajoute la résilience et la seule écriture persistée (trophées).
Si QA casse, on sait quel cycle l'a introduit.

---

## 11. Points d'accroche dans `main.js` (moteur figé — justifié point par point)

`rules.js` et `board.js` **ne changent pas** (hormis le slot `pvw` déjà présent dans
`creerEtat`). Tout passe par un module neuf `online.js` + accroches additives dans `main.js`,
sur les mêmes call-sites que le replay et l'IA.

| # | Point | Nature de l'accroche | Pourquoi ici / pourquoi sûr |
|---|---|---|---|
| 1 | `commencerPartie('pvw', …)` L.57 | branche `pvw` : `creerEtat({mode:'pvw'})` (slot déjà prévu), stocke `side`/`matchId`/`opp`, `initOnline`, JOIN canal | Symétrique au `if (mode==='spectator')` déjà présent L.63 |
| 2 | Gating d'entrée (souris/clavier) | garde `if (state.mode==='pvw' && state.turn!==side) return;` dans les handlers de clic/touche | **Réutilise le pattern PvAI** (`state.turn!==ai.player`) déjà éprouvé — le mode PvP est ainsi structurellement incapable de laisser jouer hors de son tour |
| 3 | Émission des actions locales | appeler `online.sendAction(evt)` **exactement où** `recordMove`/`recordPurchase`/`recordPower` sont déjà appelés (L.455, dans `acheter`, dans les `executer*`) | Ces call-sites sont **déjà** les points de sérialisation déterministe du replay : zéro nouvelle logique, même `evt` |
| 4 | Application des actions entrantes | file consommée dans `loop()` (ou callback `onAction`) qui rejoue via `jouerCoup`/`acheter`/`executerRuee`… **quand ce n'est pas mon tour** | Miroir de `planifierCoupIA` (le réseau remplace le bot comme source du coup adverse) ; passe par le moteur de confiance (§3.2) |
| 5 | `finPartie` L.172 / horloge | remplacer le `hookTrophees` (PvAI, désormais neutralisé — spec-online v3) : si `mode==='pvw'` → `online.report(result)` (RPC `pvp_report_result`) ; démarrage/arrêt des horloges au changement de tour dans `finDeTour` | `finPartie` est **déjà** le point unique de fin ; le hook trophée y est désormais **PvP** (le PvAI n'en a plus) |

Aucune modification de `rules.js`, `board.js` (hors slot `pvw`), `constants.js`, `ai.js`,
`replay.js`. `index.html` : rien de neuf (le client Supabase et l'overlay DOM existent déjà ;
`online.js` réutilise le client de `account.js`).

---

## 12. J — Scénarios QA (navigateur réel, 2 onglets)

Deux onglets = deux comptes distincts (2 emails magic link), sauf mention.

| # | Scénario | Résultat attendu |
|---|---|---|
| QA-PVW-01 | **Compte requis** : invité clique « En ligne » | Overlay CONNEXION s'ouvre ; aucune recherche lancée ; le jeu local reste jouable |
| QA-PVW-02 | **Appariement file** : 2 comptes cliquent « En ligne » à ~5 s d'écart | Les deux passent en MATCH TROUVÉ, voient pseudo+trophées de l'autre, partie démarre |
| QA-PVW-03 | **Bande élargissante** : 2 comptes à ~500 trophées d'écart | Non appariés à ±100/±250 ; appariés après 10-20 s (±600 ou ±∞) |
| QA-PVW-04 | **Partie privée** : A crée un code, B le saisit | Les deux entrent en partie ; l'écart de trophées n'empêche pas l'appariement |
| QA-PVW-05 | **Trait & couleurs** : le créateur/1er arrivé joue en premier | Side 0 = Bleu = trait ; side 1 = Corail |
| QA-PVW-06 | **Coup simple synchronisé** : A joue e2-e4 | B voit le coup apparaître (< ~200 ms), son tour s'active, celui de A se bloque |
| QA-PVW-07 | **Capture + écus** : A capture un pion | Les deux affichent le même solde d'écus recalculé (déterministe), flash de capture des 2 côtés |
| QA-PVW-08 | **Achat d'amélioration** : A achète Ruée sur un cavalier | B voit le badge d'amélioration sur la pièce ; solde de A cohérent des 2 côtés |
| QA-PVW-09 | **Pouvoir actif ciblé** : A active Ruée et capture à distance | B voit la capture à distance + cooldown posé ; tour passé correctement |
| QA-PVW-10 | **Chaîne Double coup** : A joue Double coup (2 coups même dame) | Le tour ne passe à B **qu'après** le 2e coup ; hash concordant ; `state.chain` géré |
| QA-PVW-11 | **Chaîne Second galop** : A enchaîne un 2e saut de cavalier | Idem : un seul passage de tour à la fin de la chaîne |
| QA-PVW-12 | **Victoire capture du roi** : A capture le roi de B | Écran de fin des 2 côtés ; A `+N🏆`, B `−N🏆` (Elo) ; totaux DB cohérents et opposés |
| QA-PVW-13 | **Horloge / chute de drapeau** : B laisse filer son temps | Drapeau tombe ; départage à la valeur (GDD §8) ; vainqueur correct ; trophées appliqués |
| QA-PVW-14 | **Abandon volontaire** : A clique « Abandonner » | A perd immédiatement, B gagne ; trophées Elo appliqués aux deux |
| QA-PVW-15 | **Déconnexion + reconnexion** : B ferme l'onglet puis rouvre < 30 s | UI « déconnecté » chez A ; B revient, resync complet, partie reprend au bon état/horloge |
| QA-PVW-16 | **Abandon par déco** : B ferme l'onglet et ne revient pas | À 30 s, A gagne par abandon ; trophées appliqués ; B a perdu ses trophées au retour |
| QA-PVW-17 | **Intégrité coup illégal** : injecter via console un `move` illégal pour A | B **rejette** l'action (log `[online] illegal`) ; l'état ne bouge pas ; pas de désync exploitable |
| QA-PVW-18 | **Non-régression local** : PvP hot-seat, PvAI (3 niveaux), invité, tutoriel, replay | Tous inchangés ; **une partie PvAI n'écrit aucun trophée** (spec-online v3) ; QA spec-online §6 + spec-ia §7 + QA04 restent PASS |

**Critères PASS globaux** : 0 désync sur une partie normale complète ; le jeu **local** reste
100 % jouable même si Realtime est injoignable (le bouton « En ligne » échoue proprement en
message d'erreur, jamais en crash — garde-fou n°2) ; trophées PvP écrits **uniquement** sur
rapports concordants ou abandon constaté ; **le PvAI n'écrit jamais de trophée**.

---

## 13. Hors-périmètre v1 (roadmap explicite)

- **Spectateur en ligne** (regarder une partie de deux tiers en direct) — le mode `spectator`
  local existe déjà mais sa version réseau est hors scope.
- **Chat / emotes** en partie.
- **Classement mondial / leaderboard public** (nécessite une policy `select` publique + vue,
  déjà pré-cadré spec-online §9).
- **Cadences multiples** (1/3/10 min, 24 h du GDD §7) et sélecteur d'horloge — v1 fige 5+3.
- **Saisons / reset de ladder / ligues** (paliers Clash Royale du GDD §10 avec skins).
- **Mobile / tactile** — v1 vise desktop navigateur.
- **Reconnexion longue** (> 30 s), reprise après crash serveur Realtime, régions multiples.
- **Anti-triche avancé** (détection de moteur d'aide, comportement) — au-delà du lockstep validé.
- **Tournois, parties classées vs amicales séparées, matchmaking par MMR caché** distinct des
  trophées visibles.
- **Persistance de l'historique des parties online** (table `moves`) — le replay local suffit.

---

## 14. Tranchés — résumé

| Sujet | Décision |
|---|---|
| Transport | Realtime **Broadcast** sur `match:{id}` (< 50 ms, éphémère), pas de coups en DB |
| Autorité | **Lockstep déterministe à double validation** (chaque client rejoue l'action adverse via `rules.js`) + hash d'état par coup |
| Intégrité résultat | RPC `pvp_report_result` : trophées écrits **uniquement si les 2 rapports concordent** (ou abandon constaté) — la « vraie parade » promise par spec-online §4.3 |
| Matchmaking | RPC atomique `pvp_find_match`, FIFO, **bande de trophées élargissante** (±100 → ±∞ en 20 s) |
| Partie privée | Code à 6 caractères (`pvp_create_private`/`pvp_join_code`), compte pour les trophées |
| Compte | **Obligatoire** pour le PvP online (jeu local reste jouable en invité) |
| Protocole | Événements **replay réutilisés** (move/purchase/power, algébrique) + `seq` + `hash` + `clock` |
| Écus / chaînes | Écus déterministes non transmis ; chaîne = sous-coups `move` `chain:true`, tour passé à la résolution |
| Horloge | **5 min + incrément 3 s** ; chute de drapeau → départage à la valeur (GDD §8) |
| Déconnexion | Presence + heartbeat ; fenêtre **30 s** de reconnexion (resync snapshot complet) sinon défaite par abandon |
| Abandon | Bouton = défaite immédiate ; anti-rage-quit réel (fuite = trophées perdus) |
| **Trophées** | **Elo simplifié K=32** ; `profiles.trophies` = **ladder PvP EXCLUSIF** (le PvAI n'alimente plus rien, v2) ; **départ 0 pour tous** (remise à 0 en migration) ; plancher 0 ; seul `pvp_report_result` écrit |
| RPC obsolète | `apply_match_result` (PvAI) **révoquée** ; `guard_trophies` habilite désormais `pvp_report_result` seul |
| UI | Bouton « En ligne » réactivé ; écrans recherche/ami/match trouvé/en partie/déconnexion/fin + revanche (couleurs inversées) |
| Code | Moteur figé ; nouveau `online.js` (isole Realtime, réutilise le client Supabase) + 5 accroches additives dans `main.js` |
| Cycles | W1 matchmaking/handshake · W2 synchro coups + horloge · W3 robustesse + trophées |
| Quota | Tient sur le **plan gratuit** (200 conn. = 100 matchs, 2 M msg/mois, 500 k Edge Fn) |

**Prochaine étape (si l'utilisateur le décide)** : `/feature pvp-online` déléguant à gameplay-dev
les cycles W1→W3 (SQL `matches` + RPC + remise à 0 des trophées ; `online.js` ; 5 accroches
`main.js` ; UI des 7 écrans), puis QA navigateur 2 onglets pour valider QA-PVW-01..18.

---

### Sources (vérification capacités Supabase 2026)

- [Realtime Limits | Supabase Docs](https://supabase.com/docs/guides/realtime/limits)
- [Broadcast | Supabase Docs](https://supabase.com/docs/guides/realtime/broadcast)
- [Realtime: Broadcast from Database | Supabase](https://supabase.com/blog/realtime-broadcast-from-database)
- [Supabase Free Tier Limits: What You Actually Get In 2026](https://aiagencyplus.com/supabase-free-tier-limits/)
- [Edge Functions Limits | Supabase Docs](https://supabase.com/docs/guides/functions/limits)
