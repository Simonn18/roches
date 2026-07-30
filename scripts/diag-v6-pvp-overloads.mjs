// roychec — diagnostic v6.0 15×8 public TYPE MISMATCH (2026-07-27 UNRESOLVED).
//
// Symptôme : en recherche publique avec taille=15×8 (GDD §7.2 v3.5 = hors-compétition,
// publié 16/07 schema-pvp-taille.sql), le client reçoit immédiatement un 400 PostgREST
// « structure of query does not match function result type » — log client : TYPE MISMATCH.
//
// Hypothèses L1 (cf. obsidian/Logs/2026-07-27.md) :
//   (1) Multi-overload drift — DROP FUNCTION IF EXISTS ne couvre que la signature EXACTE
//       `(int, int, text, text)`. Une surcharge résiduelle avec `(int, int, text, varchar)`
//       ou `(int, int, text)` NON droppée crée un OVERLOAD sur lequel PostgREST résout
//       l'appel 4-args et qui peut avoir un RETURNS TABLE column `taille` d'un type
//       incompatible avec matches.taille (varchar(4)).
//   (3) Cache PostgREST stale — malgré NOTIFY pgrst, le cache peut mettre 60s+ à
//       recharger ; symptom rare mais documenté.
//   (4) Push SQL pré-v5.7b — la fonction live est encore text au lieu de varchar(4).
//
// Strat de diagnostic : tester le TIER MATRIX côté supabase-js. Le RESOLUTION d'overload
// Postgres renvoie des erreurs caractéristiques selon l'état du catalogue :
//   - "Could not find the function" → overload ABSENTE pour cette signature
//   - "structure of query does not match" → overload PRÉSENTE mais RETURNS divergent
//   - OK avec 0 row ou row vide → overload CORRECTE
//
// Pattern : ce script est idempotent et sans effet de bord côté DB (les params par défaut
// ne créent pas de match — la fonction retourne 'waiting' ou null sans INSERT lorsque
// la sous-file cible n'a personne, mais il faut que le supabase user auth.uid() soit
// valide). Pour éviter le INSERT accidentel dans matches, requiert une session valide.
//
// Run : SUPABASE_URL=https://hsyfbfotbpzfhgxfdgom.supabase.co \
//       SUPABASE_ANON_KEY=eyJ... \
//       node scripts/diag-v6-pvp-overloads.mjs
//
// Note d'import : le projet roychec vendor localement supabase-js en browser-IIFE
// (game/assets/lib/supabase.min.js?v=24), pas un package npm. Le bundle expose
// `window.supabase` côté browser et N'EST PAS direct-importable en Node ESM.
// Solution : dynamic import depuis esm.sh (déjà allow-listé CSP `connect-src`
// du projet, version pinned 2.110.2 dans repo).
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY;

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  console.error('╔════════════════════════════════════════════════════════════╗');
  console.error('║ Erreur : variables d\'environnement manquantes            ║');
  console.error('╚════════════════════════════════════════════════════════════╝');
  console.error('');
  console.error('Ce script requiert Supabase URL + anon key pour interroger le RPC');
  console.error('matchant le projet roychec. Lancer avec :');
  console.error('');
  console.error('  export SUPABASE_URL=https://hsyfbfotbpzfhgxfdgom.supabase.co');
  console.error('  export SUPABASE_ANON_KEY=eyJ...');
  console.error('  node scripts/diag-v6-pvp-overloads.mjs');
  console.error('');
  console.error('(Pour un compte déjà connecté, signer dans devtools F12, puis :');
  console.error('  localStorage.getItem(\'sb-hsyfbfotbpzfhgxfdgom-auth-token\')');
  console.error('  → copier l\'access_token JWT, c\'est la anon key équivalente per-session.)');
  process.exit(2);
}

// Dynamic import de supabase-js v2.110.2 depuis esm.sh (compatible Node ESM asynchrone,
// pinned-version identique au projet). Le vendor local (game/assets/lib/supabase.min.js?v=24)
// est un bundle IIFE browser-only ; dynamic-import depuis Node ESM ne marche pas.
let supabase;
try {
  // (Low #3) Hard-stop 15s ceiling sur le dynamic-import pour éviter hang si esm.sh down.
  // Le .catch(() => {}) sur l'import neutralise l'UnhandledPromiseRejection si l'import
  // répond APRÈS que le timeout ait gagné la race (Promise.race n'annule pas l'import).
  const TIMEOUT_MS = 15000;
  const importP = import('https://esm.sh/@supabase/supabase-js@2.110.2').catch(() => {});
  const mod = await Promise.race([
    importP,
    new Promise((_, rej) => setTimeout(() => rej(new Error(`esm.sh timeout ${TIMEOUT_MS / 1000}s`)), TIMEOUT_MS)),
  ]);
  // (High #1) Defensive: esm.sh wraps parfois le bundle UMD-style sous `default`. Couvre
  // 3 shapes (named export / default export / default-as-function) + sanity-check rpc().
  if (!mod) throw new Error('shape_unexpected: import a retourné undefined (DNS failure / fetch 404 / parse error / réponse ESM vide — retry, ou paste SQL Étape A direct dans Supabase)');
  const createClient =
    mod.createClient
    ?? mod.default?.createClient
    ?? (typeof mod.default === 'function' ? mod.default : null);
  if (typeof createClient !== 'function') {
    throw new Error('shape_unexpected: createClient introuvable dans mod importé (vérifier version esm.sh / pin 2.110.2)');
  }
  supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  if (typeof supabase.rpc !== 'function') {
    throw new Error('shape_unexpected: supabase.rpc() absente après init');
  }
} catch (e) {
  console.error('╔════════════════════════════════════════════════════════════╗');
  console.error('║ Erreur : impossible d\'importer @supabase/supabase-js@2.110.2║');
  console.error('║ depuis https://esm.sh (CDN réseau requis)                  ║');
  console.error('╚════════════════════════════════════════════════════════════╝');
  console.error('');
  console.error('Le script requiert un accès RÉSEAU vers esm.sh.');
  console.error('Si tu es offline : ');
  console.error('  ① Installe la dépendance : npm install @supabase/supabase-js@2.110.2');
  console.error('     puis reset l\'import à :  import { createClient } from \'@supabase/supabase-js\'; ');
  console.error('  ② Ou colle la SQL Étape A directement dans Supabase SQL editor');
  console.error('     (cf. fond de ce script ou obsidian/Logs/2026-07-28.md).');
  console.error('');
  console.error('Erreur brute :', e.message || e);
  process.exit(3);
}

// Tier matrix pour pvp_find_match — chaque tier représente une overload attendue
// selon l'historique des migrations. Si une tier succeed, l'overload correspondante
// existe ; si "structure of query does not match" ou code PGRST202, le diagnostic
// pointe vers la cause précise.
const TIERS = [
  { id: 'T1', name: '4-args (Phase A.3d taille propagée)',
    args: { p_band: 100, p_cadence: 300, p_variant: 'pvp_standard', p_taille: 'std' } },
  { id: 'T1b', name: '4-args taille=l15 (15×8 public path)',
    args: { p_band: 100, p_cadence: 300, p_variant: 'pvp_standard', p_taille: 'l15' } },
  { id: 'T2', name: '3-args (Phase A.3 sans taille)',
    args: { p_band: 100, p_cadence: 300, p_variant: 'pvp_standard' } },
  { id: 'T3', name: '2-args (Phase A.2 band+cadence only)',
    args: { p_band: 100, p_cadence: 300 } },
  { id: 'T0', name: '1-args (legacy schema-pvp-w1.sql)',
    args: { p_band: 100 } },
];

const FN = 'pvp_find_match';

function truncate(s, n) {
  if (!s) return '';
  return s.length > n ? s.slice(0, n) + '…' : s;
}

async function testTier(t, fn) {
  const t0 = Date.now();
  try {
    const res = await supabase.rpc(fn, t.args);
    const elapsed = Date.now() - t0;
    if (res.error) {
      const e = res.error;
      // Classification grossière — l'overload existe-t-elle ? quel type d'erreur ?
      let bucket = 'OTHER';
      const blob = ((e.message || '') + ' ' + (e.details || '') + ' ' + (e.hint || '')).toLowerCase();
      if (/pgrst202|could not find the function|schema cache/i.test(blob)) bucket = 'PGRST202 (overload absente)';
      else if (/structure of query does not match|character varying|expected type/i.test(blob)) bucket = 'TYPE MISMATCH (overload présente, RETURNS diverge)';
      else if (/permission denied|insufficient_privilege/i.test(blob)) bucket = 'PERMISSION DENIED (auth/grant KO)';
      else if (/invalid input syntax|taille invalide|cadence/i.test(blob)) bucket = 'RAISE EXCEPTION (validation server-side)';
      return {
        tier: t.id, name: t.name, status: 'ERROR', elapsedMs: elapsed, bucket,
        code: e.code || '', message: e.message || '', details: e.details || '', hint: e.hint || '',
      };
    }
    // Success — data est un TABLEAU (RETURNS TABLE → array de rows). Une row peut
    // contenir {match_id, side, status, opp_pseudo, opp_trophies, cadence, variant, taille}.
    const row = Array.isArray(res.data) ? res.data[0] : res.data;
    return {
      tier: t.id, name: t.name, status: 'OK', elapsedMs: elapsed,
      rowCount: Array.isArray(res.data) ? res.data.length : (res.data == null ? 0 : 1),
      sample: row ? {
        status: row.status, side: row.side,
        match_id_present: !!row.match_id,
        cadence: row.cadence, variant: row.variant, taille: row.taille,
      } : null,
    };
  } catch (e) {
    return {
      tier: t.id, name: t.name, status: 'EXCEPTION', elapsedMs: Date.now() - t0,
      error: e.message || String(e),
    };
  }
}

async function main() {
  console.log('═══════════════════════════════════════════════════════════════');
  console.log(' v6.0 PvP overloads diagnostic — pvp_find_match Tier matrix');
  console.log('═══════════════════════════════════════════════════════════════');
  console.log(`URL         : ${SUPABASE_URL}`);
  console.log(`Anon key    : ${SUPABASE_ANON_KEY.slice(0, 12)}…${SUPABASE_ANON_KEY.slice(-6)}`);
  console.log(`Timestamp   : ${new Date().toISOString()}`);
  console.log('');

  // (Med #2) AVERTISSEMENT side-effect : pvp_find_match avec auth valide INSERT dans
  // matches (cf. schema-pvp-taille.sql L96-97 "Aucun compatible : créer un match en
  // attente"). 5 Tier calls = jusqu'à 5 INSERTs phantom. Cleanup INLINÉ ci-dessous.
  console.log('⚠ AVERTISSEMENT side-effect : pvp_find_match peut INSERT des matches waiting.');
  console.log('  Cleanup post-run (à coller dans SQL editor après le test) :');
  console.log('');
  console.log('    DELETE FROM matches');
  console.log('    WHERE p1 = auth.uid()');
  console.log('      AND created_at > NOW() - INTERVAL \'5 minutes\'');
  console.log('      AND status = \'waiting\';');
  console.log('');
  console.log('  OU utiliser un compte de test jetable dès le départ (évite pollution matches).');
  console.log('');

  // Étape A — Tier matrix
  console.log('▋ ÉTAPE A : Tier matrix pvp_find_match');
  console.log('');
  const results = [];
  for (const t of TIERS) {
    process.stdout.write(`  ${t.id} (${t.name}) … `);
    const r = await testTier(t, FN);
    results.push(r);
    if (r.status === 'OK') {
      console.log(`OK (${r.elapsedMs} ms, rows=${r.rowCount}${r.sample ? `, status='${r.sample.status}', taille='${r.sample.taille}'` : ''})`);
    } else if (r.status === 'ERROR') {
      console.log(`ERROR (${r.elapsedMs} ms)`);
      console.log(`    bucket : ${r.bucket}`);
      console.log(`    code   : ${r.code || '(none)'}`);
      console.log(`    message: ${truncate(r.message, 220)}`);
      if (r.details) console.log(`    details: ${truncate(r.details, 220)}`);
      if (r.hint)    console.log(`    hint   : ${truncate(r.hint, 220)}`);
    } else {
      console.log(`EXCEPTION (${r.elapsedMs} ms) — ${truncate(r.error, 200)}`);
    }
  }

  // Synthèse
  console.log('');
  console.log('═══════════════════════════════════════════════════════════════');
  console.log(' SYNTHÈSE — corrélation avec les hypothèses L1');
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('');

  const t1  = results.find((r) => r.tier === 'T1');
  const t1b = results.find((r) => r.tier === 'T1b');
  const t2  = results.find((r) => r.tier === 'T2');
  const t3  = results.find((r) => r.tier === 'T3');
  const t0  = results.find((r) => r.tier === 'T0');

  const isOK = (r) => r.status === 'OK';
  const isBug = (r, kind) => r.status === 'ERROR' && (kind === 'any' || r.bucket.startsWith(kind));
  const isMiss = (r, kind) => r.status === 'ERROR' && r.bucket.startsWith(kind);

  // Diagnostic tree
  if (isOK(t1) && isOK(t1b)) {
    console.log('✅ Hypothèse CLEAN STATE : les deux overloads 4-args passent en std et l15.');
    console.log('   Si le client échoue quand même : le bug est purement CLIENT-side ou cache');
    console.log('   PostgREST refresh côté Supabase serveur (cause #3 deeper).');
  } else if (t1?.bucket?.startsWith('TYPE MISMATCH') && (isOK(t2) || isOK(t3))) {
    console.log('🔴 Hypothèse #1 (multi-overload drift) CONFIRMED :');
    console.log('   - Tier 1 (4-args) renvoie « structure of query does not match »');
    console.log('     → l\'overload 4-args existe mais son RETURNS TABLE column taille');
    console.log('       diverge du type matches.taille (varchar(4)).');
    console.log('   - Tier 2 ou 3 succeed : une surcharge 3-args ou 2-args existe avec');
    console.log('     RETURNS TABLE correct — c\'est elle que PostgREST résoudrait en fallback');
    console.log('     si le pattern PGRST202 matchait (mais TYPE MISMATCH ne matche pas le');
    console.log('     regex `isPgrst` côté online.js → pas de fallback effectué).');
    console.log('');
    console.log('   FIX proposé : Étape D cleanup (DO $$ DROP FUNCTION loop) puis re-push');
    console.log('   supabase/schema-pvp-taille.sql + NOTIFY pgrst + hard reload.');
  } else if (t1?.bucket?.startsWith('PGRST202') && (isOK(t2) || isOK(t3))) {
    console.log('🟡 Hypothèse #3 (cache stale AVANT reload) : l\'overload 4-args est');
    console.log('   ABSENTE côté serveur live — schema-pvp-taille.sql n\'a probablement');
    console.log('   pas été complètement pushed (le DROP 4-args du schema-pvp-taille.sql');
    console.log('   rate de silence si la 4-args "text" n\'existait pas, mais la CREATE');
    console.log('   rate en double-name PGRST202 côté reverse-lookup).');
    console.log('');
    console.log('   TODO : pousser le schema complet (cadence + public-variant + taille)');
    console.log('   en séquence pour garantir la chaîne complète.');
  } else if (results.every((r) => r.status === 'ERROR') && results[0].bucket?.startsWith('PERMISSION DENIED')) {
    console.log('🔴 Anon key KO : permissions RLS bloquent l\'accès. Vérifier que');
    console.log('   SUPABASE_ANON_KEY est bien l\'anon key (pas une service_role_key hash).');
    console.log('');
    console.log('   NOTE : pvp_find_match utilise `auth.uid()` côté serveur → il faut');
    console.log('   une session valide (signInWithPassword préalable) pour que la fonction');
    console.log('   ne lève pas profile_not_found côté PL/pgSQL.');
  } else if (results.every((r) => !isOK(r))) {
    console.log('⚠ TOUTES les Tiers échouent également. Vérifier :');
    console.log('   (a) URL Supabase correcte (pas de typo)');
    console.log('   (b) ANON_KEY fraîche (pas expirée)');
    console.log('   (c) Project supabase actif (pas paused)');
  } else {
    console.log('🔎 Pattern mixte détecté — diagnostic plus fin nécessaire.');
    console.log('   Recommencer dans 60s après NOTIFY pgrst (cache peut avoir été');
    console.log('   en cours de reload pendant les Tiers ci-dessus).');
  }

  console.log('');
  console.log('═══════════════════════════════════════════════════════════════');
  console.log(' PROCHAINES ÉTAPES (selector-driven)');
  console.log('═══════════════════════════════════════════════════════════════');

  if (isOK(t1) || isOK(t1b)) {
    console.log('   ✅ Hypothèse CLEAN : ouvrir un issue GitHub contre le dashboard Supabase');
    console.log('      (cache reload forcé via bouton « Reload Schema Cache »).');
  } else {
    console.log('   ① Étape B (optionnel) — vérification colonne matches.taille :');
    console.log('');
    console.log('     SELECT column_name, data_type, character_maximum_length');
    console.log('     FROM information_schema.columns');
    console.log('     WHERE table_name=\'matches\' AND column_name=\'taille\';');
    console.log('');
    console.log('   ② Étape A renforcée (Hg L1 cause #1) — listage exhaustif pg_proc :');
    console.log('');
    console.log('     SELECT p.proname,');
    console.log('            pg_get_function_arguments(p.oid) AS args_signature,');
    console.log('            pg_get_function_result(p.oid)   AS returns_signature');
    console.log('     FROM   pg_proc p');
    console.log('     JOIN   pg_namespace n ON n.oid = p.pronamespace');
    console.log('     WHERE  p.proname = \'pvp_find_match\'');
    console.log('       AND  n.nspname = \'public\'');
    console.log('     ORDER BY p.oid;');
    console.log('');
    console.log('   ③ Étape D — cleanup overload drift si >1 row :');
    console.log('');
    console.log('     DO $$');
    console.log('     DECLARE r record;');
    console.log('     BEGIN');
    console.log('       FOR r IN SELECT p.oid');
    console.log('                FROM   pg_proc p');
    console.log('                JOIN   pg_namespace n ON n.oid = p.pronamespace');
    console.log('                WHERE  p.proname IN (\'pvp_find_match\',\'pvp_create_private\',\'pvp_join_code\')');
    console.log('                  AND  n.nspname = \'public\'');
    console.log('       LOOP');
    console.log('         EXECUTE \'DROP FUNCTION public.\' || pg_get_function_identity_arguments(r.oid) || \';\';');
    console.log('       END LOOP;');
    console.log('     END $$;');
    console.log('');
    console.log('     Puis re-pousser supabase/schema-pvp-taille.sql + NOTIFY pgrst.');
  }

  console.log('');
  console.log('═══════════════════════════════════════════════════════════════');
  console.log(' Dump brut (pour archivage / grep)');
  console.log('═══════════════════════════════════════════════════════════════');
  console.log(JSON.stringify(results, null, 2));
}

main().catch((e) => {
  console.error('FATAL', e);
  process.exit(1);
});
