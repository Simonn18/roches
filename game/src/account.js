// roychec — CYCLE A v2 (design/spec-online.md §2) : compte joueur via Supabase.
// Auth par MAGIC LINK ou EMAIL + MOT DE PASSE + session persistante + pseudo.
//
// POURQUOI MAGIC LINK ET PAS OTP 6 CHIFFRES : le dashboard Supabase verrouille
// l'édition du template email (affichage du code {{ .Token }}) tant qu'aucun SMTP
// custom n'est configuré ; le template par défaut n'envoie qu'un LIEN. On bascule
// donc sur le magic link pour le v1 (le code OTP redeviendra possible plus tard avec
// un SMTP custom). Flux : signInWithOtp({ email, options.emailRedirectTo }) envoie un
// lien ; l'utilisateur clique, revient sur le jeu avec la session dans l'URL, que
// supabase-js détecte (detectSessionInUrl, défaut true) → événement SIGNED_IN.
//
// EMAIL + MOT DE PASSE (ajouté 2026-07-09) : alternative pour les utilisateurs qui
// préfèrent un mot de passe. signInWithPassword pour la connexion, signUp pour
// l'inscription (envoie un email de confirmation Supabase). Le magic link reste
// disponible via un toggle dans l'overlay.
//
import { appliquerTraductions, lireLangue, onLangueChange, traduire } from './i18n.js?v=10';

// ISOLATION (garde-fou CLAUDE.md §7.3) : c'est le SEUL module du projet qui connaît
// Supabase. Le reste du jeu ne voit qu'un objet d'état plat (getAccount()) et trois
// fonctions (initAccount / startAuth / logout). supabase-js est chargé en import
// DYNAMIQUE depuis un CDN : aucune requête réseau au chargement du module.
//
// DÉGRADATION GRACIEUSE (garde-fou CLAUDE.md §7.2, spec §7) : si le CDN ou Supabase
// est injoignable, TOUTE erreur retombe silencieusement en mode invité. Le jeu doit
// rester 100 % jouable sans compte et sans réseau.

const SUPABASE_URL = 'https://hsyfbfotbpzfhgxfdgom.supabase.co';
// Clé « publishable » publique : sa présence en clair côté client est l'usage prévu ;
// la sécurité repose sur la RLS Postgres (spec §7), jamais sur le secret de la clé.
const SUPABASE_KEY = 'sb_publishable_3wwsNqBwmetZWsKk6KjKWQ_Rr2G7Qv0';

// État compte lisible par le reste du jeu (plain object, réf. vivante).
//   status : 'guest'      = invité (défaut, jeu 100 % jouable)
//            'pseudo'     = session valide mais pseudo pas encore posé (overlay pseudo ouvert)
//            'connected'  = compte prêt (pseudo affiché au menu)
const account = {
  status: 'guest',
  id: null,
  pseudo: null,
  trophies: 0, // non utilisé au cycle A (persistance des trophées = cycle B)
  email: null,
};

/** Renvoie l'état compte (référence vivante lue par le rendu du menu). */
export function getAccount() { return account; }

// Partage du client Supabase avec online.js (spec-pvp-online §2.3 : une seule
// instance supabase-js dans tout le projet, créée ici, réutilisée par le PvP).
// Renvoie null tant que le CDN n'a pas chargé (import dynamique) ou s'il est
// injoignable — online.js gère ce null en dégradation gracieuse (garde-fou n°2).
export function getSupabaseClient() { return supabase; }

// Barème de trophées par difficulté IA (spec-online §3.1). MIROIR CLIENT du barème
// serveur (schema-cycle-b.sql) : sert au calcul du delta invité (RAM) et au FALLBACK
// d'affichage si le RPC échoue. La source de vérité pour l'ÉCRITURE persistée reste
// le serveur (RPC apply_match_result), le client ne fixe jamais un total arbitraire.
const BAREME = {
  1: { win: 10, lose: -8 },  // Débutant
  2: { win: 18, lose: -5 },  // Intermédiaire
  3: { win: 28, lose: -3 },  // Avancé
};

// Applique le résultat d'une partie PvAI (spec-online §3). Retourne le delta et le
// nouveau total pour l'affichage, sans jamais rejeter (dégradation gracieuse).
//  - connecté  : appel RPC serveur (calcul + écriture côté Postgres). Si le RPC est
//                absent (SQL pas collé) ou réseau KO → fallback compteur RAM + flag error.
//  - invité    : compteur RAM éphémère (remis à 0 au reload), même barème.
export async function applyMatchResult(difficulty, won) {
  const b = BAREME[difficulty] || BAREME[1];
  const delta = won ? b.win : b.lose;
  const avant = account.trophies;
  if (account.status === 'connected' && supabase) {
    try {
      const { data, error } = await supabase.rpc('apply_match_result', {
        p_difficulty: difficulty, p_won: won,
      });
      if (error) throw error;
      account.trophies = typeof data === 'number' ? data : Math.max(0, avant + delta);
      return { delta, total: account.trophies, persisted: true, ephemeral: false, error: false };
    } catch (e) {
      // RPC manquant (function not found) / rate_limited / réseau : on n'échoue pas.
      console.warn('[account] RPC apply_match_result indisponible — total de session (RAM)', e.message || e);
      account.trophies = Math.max(0, avant + delta);
      return { delta, total: account.trophies, persisted: false, ephemeral: false, error: true };
    }
  }
  // Invité : total en RAM, non persisté (spec §2.4).
  account.trophies = Math.max(0, avant + delta);
  return { delta, total: account.trophies, persisted: false, ephemeral: true, error: false };
}

let supabase = null;      // client Supabase, null tant que non chargé / si CDN KO
let pendingEmail = null;  // email en cours de vérification OTP
let resendTimer = null;   // interval du compte à rebours « Renvoyer »
let passwordTab = 'login';// onglet de l'écran mot de passe : 'login' (connexion) | 'signup' (inscription)
let  sentFrom = 'magic';   // écran qui a mené à 'sent' : 'magic' | 'password' | 'reset'
let pendingMfaUser = null;
let pendingMfaFactorId = null;
let pendingMfaChallengeId = null;

// Rate limiting UX local, en complément des limites serveur natives de Supabase Auth.
// Ces compteurs ne sont pas une autorisation (un script peut les contourner) : la
// protection réelle contre le brute-force reste celle de l'API Auth Supabase.
const AUTH_RATE_LIMITS = {
  login: { max: 5, windowMs: 5 * 60 * 1000, lockMs: 5 * 60 * 1000 },
  reset: { max: 3, windowMs: 15 * 60 * 1000, lockMs: 15 * 60 * 1000 },
};
const AUTH_RATE_STORAGE = 'roychec-auth-rate-v1';
let rateTimer = null;
let rateTimerButton = null;
let rateTimerLabel = '';

function rateIdentity(email) { return (email || '').trim().toLowerCase(); }
function lireRateState(kind, email) {
  const identity = rateIdentity(email);
  const empty = { attempts: [], lockedUntil: 0 };
  if (!identity || !AUTH_RATE_LIMITS[kind]) return empty;
  const now = Date.now();
  try {
    const all = JSON.parse(localStorage.getItem(AUTH_RATE_STORAGE) || '{}');
    const raw = all[`${kind}:${identity}`] || empty;
    const attempts = Array.isArray(raw.attempts)
      ? raw.attempts.filter((t) => Number.isFinite(t) && now - t < AUTH_RATE_LIMITS[kind].windowMs)
      : [];
    const state = { attempts, lockedUntil: Number(raw.lockedUntil) > now ? Number(raw.lockedUntil) : 0 };
    if (!state.lockedUntil && !attempts.length) {
      delete all[`${kind}:${identity}`];
      localStorage.setItem(AUTH_RATE_STORAGE, JSON.stringify(all));
    }
    return state;
  } catch (_) { return empty; }
}
function ecrireRateState(kind, email, state) {
  const identity = rateIdentity(email);
  if (!identity) return;
  try {
    const all = JSON.parse(localStorage.getItem(AUTH_RATE_STORAGE) || '{}');
    all[`${kind}:${identity}`] = state;
    localStorage.setItem(AUTH_RATE_STORAGE, JSON.stringify(all));
  } catch (_) { /* localStorage indisponible : Supabase protège toujours côté serveur */ }
}
function effacerRateState(kind, email) {
  const identity = rateIdentity(email);
  if (!identity) return;
  try {
    const all = JSON.parse(localStorage.getItem(AUTH_RATE_STORAGE) || '{}');
    delete all[`${kind}:${identity}`];
    localStorage.setItem(AUTH_RATE_STORAGE, JSON.stringify(all));
  } catch (_) { /* non bloquant */ }
}
function formatCooldown(ms) {
  const total = Math.max(0, Math.ceil(ms / 1000));
  const min = Math.floor(total / 60);
  return `${min}:${String(total % 60).padStart(2, '0')}`;
}
function uiText(value) { return traduire(value, lireLangue()); }
function setUiText(node, value) { if (node) node.textContent = uiText(value); }
function clearRateTimer(restore = true) {
  if (rateTimer) clearInterval(rateTimer);
  rateTimer = null;
  if (restore && rateTimerButton) {
    rateTimerButton.disabled = false;
    setUiText(rateTimerButton, rateTimerLabel);
  }
  rateTimerButton = null;
  rateTimerLabel = '';
}
function demarrerVerrou(kind, email, button, label) {
  const cfg = AUTH_RATE_LIMITS[kind];
  if (!cfg || !button) return;
  const state = lireRateState(kind, email);
  state.lockedUntil = Math.max(state.lockedUntil, Date.now() + cfg.lockMs);
  ecrireRateState(kind, email, state);
  clearRateTimer();
  rateTimerButton = button;
  rateTimerLabel = label;
  const tick = () => {
    const remaining = state.lockedUntil - Date.now();
    if (remaining <= 0) {
      clearRateTimer(false);
      effacerRateState(kind, email);
      button.disabled = false;
      setUiText(button, label);
      return;
    }
    button.disabled = true;
    setUiText(button, `${uiText('BLOQUÉ')} (${formatCooldown(remaining)})`);
  };
  tick();
  rateTimer = setInterval(tick, 1000);
}
function verrouEncoreActif(kind, email, button, label) {
  const state = lireRateState(kind, email);
  if (state.lockedUntil > Date.now()) {
    demarrerVerrou(kind, email, button, label);
    message(`Trop de tentatives. Réessaie dans ${formatCooldown(state.lockedUntil - Date.now())}.`, true);
    return true;
  }
  return false;
}
function enregistrerEchec(kind, email) {
  const cfg = AUTH_RATE_LIMITS[kind];
  const state = lireRateState(kind, email);
  state.attempts.push(Date.now());
  if (state.attempts.length >= cfg.max) state.lockedUntil = Date.now() + cfg.lockMs;
  ecrireRateState(kind, email, state);
  return state;
}
function enregistrerTentative(kind, email) {
  // Pour le reset, chaque demande compte : même une adresse inexistante ne doit
  // pas permettre de spammer l'endpoint d'envoi d'emails.
  return enregistrerEchec(kind, email);
}
function erreurRateLimit(error) {
  const m = (error && error.message ? error.message : '').toLowerCase();
  return !!(error && (error.status === 429 || m.includes('rate') || m.includes('limit')));
}

// ---------- Initialisation ----------
// Appelée une fois au démarrage. Câble l'overlay DOM puis tente de charger Supabase
// et de restaurer une session existante (auto-login silencieux, spec §2.3).
export async function initAccount() {
  cacheDom();
  wireDom();
  appliquerTraductions(el.overlay, lireLangue());
  onLangueChange((lang) => {
    appliquerTraductions(el.overlay, lang);
    const sentScreen = el.screens && el.screens.find((screen) => screen.dataset.screen === 'sent');
    if (sentScreen && !sentScreen.hidden) {
      mettreAJourEcranSent();
      if (el.emailRappel) el.emailRappel.textContent = pendingEmail || '';
    }
  });
  try {
    // Import dynamique via CDN — première (et unique) dépendance externe (spec §7).
    // VENDOR LOCAL (M2+ soldé 2026-07-12 ~21:00) : supabase-js@2.110.2 importé
    // depuis `game/assets/lib/supabase.min.js?v=24` (~210 KB unique, ESM bundle
    // produit via `npx esbuild --bundle --platform=browser --format=esm --minify`
    // depuis le package npm officiel `@supabase/supabase-js@2.110.2` — sha256
    // `4048c4229b35263f565647960802bff649ae04238f392d4a710f1e0724bed3f8` figé pour
    // audit M2+ ; script reproductible cf. Logs/2026-07-12.md ~21:00). Le `?v=24`
    // sur l'import force le browser à re-fecther le vendor (le path du fichier
    // n'a pas changé, sans le query le browser pourrait servir l'ancienne version
    // cassée depuis le cache HTTP — extension §8.1 §5 du pattern cache-bust aux
    // dynamic imports).
    //
    // BUG HISTORIQUE (URL typo `[email protected]`) FIXÉ à 20:30 : l'URL originelle
    // `https://esm.sh/@supabase/[email protected]?bundle-deps&minify` était syntaxiquement INCORRECT
    // (esm.sh attend `@scope/name@version`). Régression introduite par le commit
    // `2b4d3b4` 17:00 et détectée via DevTools console (`account.js:117 [account]
    // Supabase injoignable (CDN) — mode invité TypeError: Failed to fetch dynamically
    // imported module`).
    //
    // BUG HISTORIQUE (polyfills `__Process$`/`__Buffer$`) FIXÉ à 21:00 : le bundle
    // esm.sh brut contenait 2 imports absolus à `/node/process.mjs` et `/node/buffer.mjs`
    // (polyfills esm.sh) → 404 en local (`http://localhost:8000/node/process.mjs`).
    // Fix : bascule sur esbuild `--platform=browser` qui honore le champ `browser`
    // du package.json de supabase-js et strippe ces imports Node-isms (cf. Logs).
    //
    // Le try/catch reste pour la dégradation gracieuse (serveur KO, offline, fichier
    // vendor corrompu — le jeu reste 100% jouable en invité en cas d'échec).
    const mod = await import('../assets/lib/supabase.min.js?v=24');
    supabase = mod.createClient(SUPABASE_URL, SUPABASE_KEY);
  } catch (e) {
    // CDN injoignable : on reste invité, le jeu tourne normalement.
    console.warn('[account] Supabase injoignable (CDN) — mode invité', e);
    return;
  }
  try {
    // onAuthStateChange couvre trois cas d'un seul point d'entrée :
    //  - INITIAL_SESSION : session restaurée du localStorage (auto-login, spec §2.3) ;
    //  - SIGNED_IN       : retour du magic link (session posée depuis l'URL) ;
    //  - SIGNED_OUT / null : déconnexion ou absence de session → mode invité.
    // Sur registration, l'événement INITIAL_SESSION est émis immédiatement avec la
    // session courante (ou null), donc pas besoin d'un getSession() séparé.
    supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'SIGNED_OUT' || !session) { setGuest(); nettoyerUrl(); return; }
      // PASSWORD_RECOVERY ouvre l'écran de nouveau mot de passe, sans charger le profil
      // avant que l'utilisateur ait remplacé son secret.
      if (event === 'PASSWORD_RECOVERY') {
        ouvrirNouveauMotDePasse();
        nettoyerUrl();
        return;
      }
      // SIGNED_IN / INITIAL_SESSION / TOKEN_REFRESHED avec une session valide.
      nettoyerUrl(); // retire le token du magic link de la barre d'adresse
      gererSessionAuthentifiee(session);
    });
  } catch (e) {
    console.warn('[account] restauration de session impossible — mode invité', e);
  }
  // Défense : si le hash ne contient que des erreurs (pas d'access_token),
  // detectSessionInUrl peut ne pas émettre d'événement. Un nettoyage inconditionnel
  // évite de garder #error=… dans la barre d'adresse indéfiniment.
  nettoyerUrl();
}

// Retire le fragment/paramètres du magic link (#access_token=…, ?code=…, ?token_hash=…)
// de l'URL après connexion, sans recharger la page (history.replaceState).
// location.hash est truthy pour TOUT hash, y compris les erreurs (#error=access_denied…).
// location.search couvre les query params résiduels (?code=…, ?token_hash=…).
function nettoyerUrl() {
  try {
    if (typeof location === 'undefined' || typeof history === 'undefined') return;
    const searchSale = /[?&](code|token_hash|error|error_description)=/.test(location.search);
    if (location.hash || searchSale) {
      history.replaceState(null, document.title, location.pathname);
    }
  } catch (_) { /* non bloquant */ }
}

// ---------- Actions exposées au jeu ----------

/** Ouvre l'overlay d'authentification (déclenché par le bouton « CONNEXION » du menu). */
export function startAuth() {
  if (account.status === 'connected') return;
  if (account.status === 'pseudo') { ouvrirPseudo(); return; }
  // Toujours (re)partir de l'écran de CHOIX de méthode (spec UX v3).
  montrerChoix();
  ouvrirOverlay();
}

/** Déconnexion (bouton « DÉCONNEXION » du menu). Retombe en mode invité. */
export async function logout() {
  if (supabase) { try { await supabase.auth.signOut(); } catch (_) { /* ignore */ } }
  setGuest();
}

// ---------- Navigation entre écrans (refonte UX v3) ----------

// Écran de CHOIX : point d'entrée. Les 3 méthodes sont des gros boutons distincts.
function montrerChoix() {
  montrerEcran('choice');
  message('', false);
  clearResend();
  if (el.methods && el.methods[0]) el.methods[0].focus();
}

// Dispatch depuis un bouton de méthode (data-method).
function choisirMethode(method) {
  message('', false);
  if (method === 'guest') { fermerOverlay(); return; }   // même effet que l'ancien « Annuler »
  if (method === 'magic') { ouvrirMagic(); return; }
  if (method === 'password') { ouvrirPassword('login'); return; }
}

// Écran LIEN MAGIQUE dédié : champ email + « Recevoir le lien ».
function ouvrirMagic() {
  montrerEcran('magic');
  message('', false);
  el.magicSend.disabled = false;
  setUiText(el.magicSend, 'Recevoir le lien');
  if (el.magicEmail) el.magicEmail.focus();
}

// Écran MOT DE PASSE dédié : onglets connexion / inscription.
function ouvrirPassword(tab) {
  montrerEcran('password');
  message('', false);
  changerTab(tab || 'login');
  if (el.pwdEmail) el.pwdEmail.focus();
  if (passwordTab === 'login' && el.pwdEmail.value) {
    verrouEncoreActif('login', el.pwdEmail.value, el.pwdSubmit, labelPwd());
  }
}

function ouvrirReset() {
  montrerEcran('reset');
  message('', false);
  if (el.resetSubmit) {
    el.resetSubmit.disabled = false;
    setUiText(el.resetSubmit, 'Envoyer le lien');
  }
  if (el.resetEmail) el.resetEmail.focus();
  if (el.resetEmail && el.resetEmail.value) {
    verrouEncoreActif('reset', el.resetEmail.value, el.resetSubmit, 'Envoyer le lien');
  }
}

function ouvrirNouveauMotDePasse() {
  montrerEcran('new-password');
  ouvrirOverlay();
  message('', false);
  if (el.newPassword) el.newPassword.focus();
  if (el.newPasswordSubmit) {
    el.newPasswordSubmit.disabled = false;
    setUiText(el.newPasswordSubmit, 'Enregistrer');
  }
}

// Bascule d'onglet : adapte champ (autocomplete), indice « 6 car. » et libellé du bouton.
function changerTab(tab) {
  passwordTab = (tab === 'signup') ? 'signup' : 'login';
  const login = passwordTab === 'login';
  el.tabLogin.classList.toggle('is-active', login);
  el.tabSignup.classList.toggle('is-active', !login);
  el.tabLogin.setAttribute('aria-selected', login ? 'true' : 'false');
  el.tabSignup.setAttribute('aria-selected', login ? 'false' : 'true');
  if (el.pwdHint) el.pwdHint.hidden = login;               // indice 6 car. → inscription seulement
  if (el.forgot) el.forgot.hidden = !login;
  el.pwdPassword.setAttribute('autocomplete', login ? 'current-password' : 'new-password');
  el.pwdSubmit.disabled = false;
  setUiText(el.pwdSubmit, login ? 'Se connecter' : 'Créer un compte');
  message('', false);
  appliquerTraductions(el.overlay, lireLangue());
}
function labelPwd() { return passwordTab === 'signup' ? 'Créer un compte' : 'Se connecter'; }

// Soumission de l'écran mot de passe selon l'onglet actif.
function soumettrePassword() {
  if (passwordTab === 'signup') inscriptionPassword();
  else connexionPassword();
}

// ---------- Flux Supabase ----------

// Envoi du lien magique par email. Le retour de connexion est géré
// par onAuthStateChange (SIGNED_IN), pas par une saisie de code.
async function envoyerCode() {
  const email = (el.magicEmail.value || '').trim();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) { message('Adresse email invalide.', true); return; }
  if (!supabase) { message('Service indisponible, réessaie plus tard.', true); return; }
  el.magicSend.disabled = true; setUiText(el.magicSend, 'ENVOI…');
  try {
    const origin = window.location.origin;
    console.log('[account] emailRedirectTo =', origin);
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { shouldCreateUser: true, emailRedirectTo: origin },
    });
    if (error) {
      message(traduireErreurEnvoi(error), true);
      el.magicSend.disabled = false; setUiText(el.magicSend, 'Recevoir le lien');
      return;
    }
    pendingEmail = email;
    sentFrom = 'magic';
    mettreAJourEcranSent();
    if (el.emailRappel) el.emailRappel.textContent = email;
    montrerEcran('sent');      message('Email envoyé ✓', false);

    demarrerResend();
  } catch (e) {
    console.warn('[account] signInWithOtp', e);
    message('Connexion impossible, réessaie.', true);
    el.magicSend.disabled = false; setUiText(el.magicSend, 'Recevoir le lien');
  }
}

// Connexion par email + mot de passe (compte existant).
async function connexionPassword() {
  const email = (el.pwdEmail.value || '').trim();
  const pwd = el.pwdPassword.value || '';
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) { message('Adresse email invalide.', true); return; }
  if (!pwd) { message('Entre ton mot de passe.', true); return; }
  if (!supabase) { message('Service indisponible.', true); return; }
  if (verrouEncoreActif('login', email, el.pwdSubmit, labelPwd())) return;
  el.pwdSubmit.disabled = true; setUiText(el.pwdSubmit, 'CONNEXION…');
  try {
    const { error } = await supabase.auth.signInWithPassword({ email, password: pwd });
      if (error) {
      const state = erreurRateLimit(error)
        ? { lockedUntil: Date.now() + AUTH_RATE_LIMITS.login.lockMs, attempts: [] }
        : erreurIdentifiants(error)
          ? enregistrerEchec('login', email)
          : { lockedUntil: 0, attempts: [] };
      if (erreurRateLimit(error)) ecrireRateState('login', email, state);
      if (state.lockedUntil > Date.now()) demarrerVerrou('login', email, el.pwdSubmit, labelPwd());
      else { el.pwdSubmit.disabled = false; setUiText(el.pwdSubmit, labelPwd()); }
      message(traduireErreurPassword(error), true);
      return;
    }
    // Connexion réussie : le callback onAuthStateChange (SIGNED_IN) va charger le profil.
    // Le compteur local de cette adresse est réinitialisé.
    clearRateTimer();
    effacerRateState('login', email);
  } catch (e) {
    console.warn('[account] signInWithPassword', e);
    if (erreurRateLimit(e)) {
      demarrerVerrou('login', email, el.pwdSubmit, labelPwd());
    } else {
      el.pwdSubmit.disabled = false; setUiText(el.pwdSubmit, labelPwd());
    }
    message(traduireErreurPassword(e), true);
  }
}

// Demande de lien de réinitialisation. Le message de succès reste volontairement
// générique afin de ne pas révéler si l'adresse possède un compte.
async function envoyerReset() {
  const email = (el.resetEmail.value || '').trim();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) { message('Adresse email invalide.', true); return; }
  if (!supabase) { message('Service indisponible.', true); return; }
  if (verrouEncoreActif('reset', email, el.resetSubmit, 'Envoyer le lien')) return;
  const state = enregistrerTentative('reset', email);
  el.resetSubmit.disabled = true;
  setUiText(el.resetSubmit, 'ENVOI…');
  // Le troisième essai est envoyé puis verrouille immédiatement les suivants.
  if (state.lockedUntil > Date.now()) demarrerVerrou('reset', email, el.resetSubmit, 'Envoyer le lien');
  try {
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: window.location.origin,
    });
    if (error) {
      if (erreurRateLimit(error)) demarrerVerrou('reset', email, el.resetSubmit, 'Envoyer le lien');
      else { el.resetSubmit.disabled = false; setUiText(el.resetSubmit, 'Envoyer le lien'); }
      message(traduireErreurEnvoi(error), true);
      return;
    }
    pendingEmail = email;
    sentFrom = 'reset';
    mettreAJourEcranSent();
    if (el.emailRappel) el.emailRappel.textContent = email;
    montrerEcran('sent');
    message('Si cette adresse est associée à un compte, un lien a été envoyé ✓', false);
    demarrerResend();
  } catch (e) {
    console.warn('[account] resetPasswordForEmail', e);
    if (erreurRateLimit(e)) demarrerVerrou('reset', email, el.resetSubmit, 'Envoyer le lien');
    else { el.resetSubmit.disabled = false; setUiText(el.resetSubmit, 'Envoyer le lien'); }
    message('Impossible d’envoyer le lien pour le moment.', true);
  }
}

// Inscription par email + mot de passe (nouveau compte).
async function mettreAJourMotDePasse() {
  const pwd = el.newPassword.value || '';
  if (pwd.length < 6) { message('Le mot de passe doit faire au moins 6 caractères.', true); return; }
  if (!supabase) { message('Service indisponible.', true); return; }
  el.newPasswordSubmit.disabled = true;
  setUiText(el.newPasswordSubmit, 'ENREGISTREMENT…');
  try {
    const { error } = await supabase.auth.updateUser({ password: pwd });
    if (error) throw error;
    el.newPassword.value = '';
    message('Mot de passe mis à jour ✓', false);
    await chargerProfil((await supabase.auth.getUser()).data.user);
  } catch (e) {
    console.warn('[account] updateUser password', e);
    el.newPasswordSubmit.disabled = false;
    setUiText(el.newPasswordSubmit, 'Enregistrer');
    message('Impossible de mettre à jour le mot de passe.', true);
  }
}

function emailConfirme(user) {
  // Supabase renseigne email_confirmed_at après le clic sur le lien. On refuse
  // volontairement toute session email/password sans cette date ; le verrou serveur
  // doit aussi être activé dans Dashboard > Authentication > Providers > Email.
  return !!(user && user.email && user.email_confirmed_at);
}

function afficherConfirmationEmail(email) {
  pendingEmail = email;
  sentFrom = 'password';
  mettreAJourEcranSent();
  if (el.emailRappel) el.emailRappel.textContent = email;
  montrerEcran('sent');
  ouvrirOverlay();
  message('Confirme ton adresse email avant de jouer.', true);
  demarrerResend();
}

function mfaDisponible() {
  const mfa = supabase && supabase.auth && supabase.auth.mfa;
  return !!(mfa && typeof mfa.enroll === 'function' && typeof mfa.challenge === 'function'
    && typeof mfa.verify === 'function');
}

async function gererSessionAuthentifiee(session) {
  const user = session && session.user;
  if (!emailConfirme(user)) {
    await supabase.auth.signOut().catch(() => {});
    afficherConfirmationEmail(user && user.email);
    return;
  }
  // La validation 2FA obligatoire est temporairement désactivée.
  // L'enrôlement volontaire reste disponible depuis l'écran de compte.
  chargerProfil(user);
}

async function ouvrirDefiMfaSiNecessaire(user) {
  if (!mfaDisponible()) return false;
  try {
    const { data, error } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
    if (error || !data || data.currentLevel !== 'aal1' || data.nextLevel !== 'aal2') return false;
    const factors = await supabase.auth.mfa.listFactors();
    const verified = (factors.data && factors.data.totp || []).find((factor) => factor.status === 'verified');
    if (!verified) return false;
    const challenge = await supabase.auth.mfa.challenge({ factorId: verified.id });
    if (challenge.error) throw challenge.error;
    pendingMfaUser = user;
    pendingMfaFactorId = verified.id;
    pendingMfaChallengeId = challenge.data.id;
    montrerEcran('mfa-challenge');
    ouvrirOverlay();
    message('Entre le code à 6 chiffres de ton application d’authentification.', false);
    el.mfaChallengeCode.value = '';
    el.mfaChallengeCode.focus();
    return true;
  } catch (e) {
    console.warn('[account] MFA challenge indisponible', e);
    await supabase.auth.signOut().catch(() => {});
    setGuest();
    message('Vérification 2FA impossible. Réessaie plus tard.', true);
    ouvrirOverlay();
    montrerEcran('choice');
    return true;
  }
}

/** Ouvre l'écran d'activation 2FA depuis le menu, à la demande du joueur. */
export async function ouvrirActivationMfa() {
  if (account.status !== 'connected') {
    startAuth();
    return;
  }
  montrerEcran('mfa-prompt');
  ouvrirOverlay();
  // Bloque les doubles clics pendant la lecture des facteurs Supabase.
  el.mfaEnable.disabled = true;
  setUiText(el.mfaEnable, 'Vérification…');
  message('', false);
  if (!mfaDisponible()) {
    setUiText(el.mfaEnable, 'Activer la 2FA');
    message('La double authentification n’est pas disponible.', true);
    return;
  }
  try {
    const { data, error } = await supabase.auth.mfa.listFactors();
    if (error) throw error;
    const verified = (data && data.totp || []).some((factor) => factor.status === 'verified');
    if (verified) {
      setUiText(el.mfaEnable, '2FA déjà activée');
      message('La double authentification est déjà activée.', false);
    } else {
      el.mfaEnable.disabled = false;
      setUiText(el.mfaEnable, 'Activer la 2FA');
    }
  } catch (e) {
    console.warn('[account] MFA factors', e);
    el.mfaEnable.disabled = false;
    setUiText(el.mfaEnable, 'Activer la 2FA');
    message('Impossible de vérifier le statut de la double authentification.', true);
  }
}

async function commencerActivationMfa() {
  if (!mfaDisponible()) { message('La double authentification n’est pas disponible.', true); return; }
  el.mfaEnable.disabled = true;
  el.mfaQr.hidden = true;
  let nouveauFacteurId = null;
  try {
    let resultat = await supabase.auth.mfa.enroll({
      factorType: 'totp', friendlyName: 'Roychec',
    });

    // Une tentative abandonnée peut laisser un facteur « unverified ». On ne les
    // supprime que si Supabase refuse réellement le nouvel enrôlement pour cette
    // raison, afin de ne pas invalider une tentative ouverte dans un autre onglet.
    if (resultat.error && estErreurFacteurMfa(resultat.error)) {
      await nettoyerFacteursMfaEnAttente();
      resultat = await supabase.auth.mfa.enroll({
        factorType: 'totp', friendlyName: 'Roychec',
      });
    }
    if (resultat.error) throw resultat.error;

    const { data } = resultat;
    nouveauFacteurId = data && data.id;
    if (!data || !data.id || !data.totp || !data.totp.qr_code) {
      throw new Error('Réponse MFA invalide.');
    }
    pendingMfaFactorId = data.id;
    // Supabase renvoie normalement une data-URI complète (data:image/svg+xml...).
    // Ne pas l'encoder une seconde fois : cela rendrait le SVG illisible par le navigateur.
    const qrCode = normaliserQrCode(data.totp.qr_code);
    if (!qrCode) throw new Error('QR code MFA vide.');
    el.mfaQr.onerror = () => {
      el.mfaQr.hidden = true;
      message('QR code impossible à afficher. Réessaie.', true);
    };
    el.mfaQr.onload = () => { el.mfaQr.hidden = false; };
    el.mfaQr.hidden = true;
    el.mfaQr.src = qrCode;
    el.mfaSetupCode.value = '';
    montrerEcran('mfa-setup');
    message('Scanne le QR code, puis saisis le code généré.', false);
    el.mfaSetupCode.focus();
  } catch (e) {
    console.warn('[account] MFA enroll', e);
    // Si Supabase a créé le facteur mais renvoyé une réponse inutilisable, on
    // retire uniquement celui créé par cette tentative, jamais les facteurs vérifiés.
    if (nouveauFacteurId && supabase.auth.mfa.unenroll) {
      await supabase.auth.mfa.unenroll({ factorId: nouveauFacteurId }).catch(() => {});
    }
    pendingMfaFactorId = null;
    el.mfaQr.removeAttribute('src');
    el.mfaQr.hidden = true;
    el.mfaEnable.disabled = false;
    message(traduireErreurMfa(e), true);
  }
}

function normaliserQrCode(value) {
  const qrCode = String(value || '').trim();
  if (!qrCode) return null;
  if (/^data:image\/svg\+xml(?:;|,)/i.test(qrCode)) return qrCode;
  if (/^(?:<\?xml[^>]*>\s*)?<svg[\s>]/i.test(qrCode)) {
    return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(qrCode)}`;
  }
  // Les formats non-SVG ne sont pas des QR TOTP valides pour cet écran.
  return null;
}

function estErreurFacteurMfa(error) {
  const m = String(error && error.message || '').toLowerCase();
  return m.includes('factor') && (
    m.includes('limit') || m.includes('maximum') || m.includes('already') || m.includes('exist')
  );
}

async function nettoyerFacteursMfaEnAttente() {
  const facteurs = await supabase.auth.mfa.listFactors();
  if (facteurs.error) throw facteurs.error;
  const enAttente = (facteurs.data && facteurs.data.totp || [])
    .filter((factor) => factor.status === 'unverified');
  for (const factor of enAttente) {
    const { error } = await supabase.auth.mfa.unenroll({ factorId: factor.id });
    if (error) throw error;
  }
}

async function verifierActivationMfa() {
  const code = (el.mfaSetupCode.value || '').trim();
  if (!/^\d{6}$/.test(code) || !pendingMfaFactorId) {
    message('Entre un code à 6 chiffres.', true); return;
  }
  el.mfaSetupVerify.disabled = true;
  try {
    const challenge = await supabase.auth.mfa.challenge({ factorId: pendingMfaFactorId });
    if (challenge.error) throw challenge.error;
    const { error } = await supabase.auth.mfa.verify({
      factorId: pendingMfaFactorId, challengeId: challenge.data.id, code,
    });
    if (error) throw error;
    pendingMfaFactorId = null;
    el.mfaSetupCode.value = '';
    fermerOverlay();
  } catch (e) {
    console.warn('[account] MFA verify enrollment', e);
    el.mfaSetupVerify.disabled = false;
    message('Code invalide ou expiré. Réessaie.', true);
  }
}

async function verifierDefiMfa() {
  const code = (el.mfaChallengeCode.value || '').trim();
  if (!/^\d{6}$/.test(code) || !pendingMfaFactorId || !pendingMfaChallengeId) {
    message('Entre un code à 6 chiffres.', true); return;
  }
  el.mfaChallengeSubmit.disabled = true;
  try {
    const { error } = await supabase.auth.mfa.verify({
      factorId: pendingMfaFactorId, challengeId: pendingMfaChallengeId, code,
    });
    if (error) throw error;
    const user = pendingMfaUser;
    pendingMfaUser = null;
    pendingMfaFactorId = null;
    pendingMfaChallengeId = null;
    el.mfaChallengeCode.value = '';
    el.mfaChallengeSubmit.disabled = false;
    chargerProfil(user);
  } catch (e) {
    console.warn('[account] MFA verify challenge', e);
    el.mfaChallengeSubmit.disabled = false;
    message('Code 2FA invalide ou expiré.', true);
  }
}

async function inscriptionPassword() {
  const email = (el.pwdEmail.value || '').trim();
  const pwd = el.pwdPassword.value || '';
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) { message('Adresse email invalide.', true); return; }
  if (pwd.length < 6) { message('Le mot de passe doit faire au moins 6 caractères.', true); return; }
  if (!supabase) { message('Service indisponible.', true); return; }
  el.pwdSubmit.disabled = true; setUiText(el.pwdSubmit, 'INSCRIPTION…');
  try {
    const origin = window.location.origin;
    const { data, error } = await supabase.auth.signUp({
      email,
      password: pwd,
      options: { emailRedirectTo: origin },
    });
    if (error) {
      message(traduireErreurPassword(error), true);
      el.pwdSubmit.disabled = false; setUiText(el.pwdSubmit, labelPwd());
      return;
    }
    // Même si le projet renvoie exceptionnellement une session immédiatement,
    // l'inscription reste bloquée tant que Supabase n'a pas confirmé l'adresse.
    if (data.user && !emailConfirme(data.user)) {
      if (data.session) await supabase.auth.signOut().catch(() => {});
      afficherConfirmationEmail(email);
    } else if (!data.session && data.user) {
      afficherConfirmationEmail(email);
    }
  } catch (e) {
    console.warn('[account] signUp', e);
    message('Inscription impossible, réessaie.', true);
    el.pwdSubmit.disabled = false; setUiText(el.pwdSubmit, labelPwd());
  }
}

// Étape 2 : pose du pseudo (première connexion, spec §2.2).
async function confirmerPseudo() {
  const pseudo = (el.pseudo.value || '').trim();
  // 3-16 caractères : lettres, chiffres, espace, tiret, underscore (flag u).
  if (!/^[\p{L}\p{N} _-]{3,16}$/u.test(pseudo)) {
    message('3 à 16 caractères : lettres, chiffres, espace, - ou _.', true); return;
  }
  if (!supabase) { message('Service indisponible.', true); return; }
  el.pseudoBtn.disabled = true; setUiText(el.pseudoBtn, 'ENVOI…');
  try {
    const { data: u } = await supabase.auth.getUser();
    if (!u || !u.user) { message('Session expirée, reconnecte-toi.', true); resetPseudoBtn(); return; }
    // INSERT direct de sa propre ligne (spec §4.4). L'unicité insensible à la casse est
    // garantie par un index DB (schema.sql) — pas de pré-vérification (course possible).
    const { error } = await supabase.from('profiles').insert({ id: u.user.id, pseudo });
    resetPseudoBtn();
    if (error) { message(traduireErreurPseudo(error), true); return; }
    account.status = 'connected';
    account.pseudo = pseudo;
    account.trophies = 0;
    fermerOverlay();

  } catch (e) {
    console.warn('[account] insert profil', e);
    resetPseudoBtn();
    message('Connexion impossible, réessaie.', true);
  }
}

// Charge le profil de l'utilisateur connecté (spec §2.3). Cas limites gérés :
//  - session valide SANS ligne profiles (pseudo jamais posé) → écran pseudo.
//  - table profiles ABSENTE (schema.sql pas encore exécuté) → écran pseudo + message clair
//    à l'INSERT. Le code ne doit jamais bloquer sur l'absence de la table.
async function chargerProfil(user) {
  account.id = user && user.id ? user.id : null;
  account.email = user && user.email ? user.email : null;
  try {
    const { data, error } = await supabase
      .from('profiles').select('pseudo, trophies').eq('id', user.id).maybeSingle();
    if (error) {
      // Table manquante ou autre erreur de lecture : on laisse le joueur poser un pseudo,
      // l'INSERT renverra un message explicite si la base n'est pas initialisée.
      console.warn('[account] lecture profil impossible', error.message || error);
      ouvrirPseudo();
      return;
    }
    if (!data) { ouvrirPseudo(); return; } // pas encore de pseudo
    account.status = 'connected';
    account.pseudo = data.pseudo;
    account.trophies = data.trophies || 0;
    fermerOverlay();

  } catch (e) {
    console.warn('[account] chargerProfil', e);
    ouvrirPseudo();
  }
}

function setGuest() {
  account.status = 'guest';
  account.id = null;
  account.pseudo = null;
  account.trophies = 0;
  account.email = null;
  pendingEmail = null;
  fermerOverlay();
}

// Traductions d'erreurs Supabase en messages joueur (spec §5.1 feedbacks).
function traduireErreurMfa(error) {
  const raw = String(error && error.message || '').trim();
  const m = raw.toLowerCase();
  if (m.includes('rate') || m.includes('limit') || (error && error.status === 429)) {
    return 'Trop de tentatives 2FA. Patiente un instant puis réessaie.';
  }
  if (m.includes('not enabled') || m.includes('disabled')) {
    return 'La 2FA TOTP n’est pas activée sur le projet Supabase.';
  }
  if (m.includes('aal') || m.includes('assurance') || m.includes('unauthorized')) {
    return 'Reconnecte-toi avant d’activer la double authentification.';
  }
  // Le détail reste dans la console pour le diagnostic, jamais dans l’interface :
  // une erreur serveur peut contenir des informations internes.
  return 'Impossible de préparer la double authentification.';
}
function traduireErreurEnvoi(error) {
  const m = (error && error.message ? error.message : '').toLowerCase();
  if (m.includes('rate') || m.includes('limit') || (error && error.status === 429)) {
    return 'Trop de tentatives, patiente un instant avant de réessayer.';
  }
  return 'Envoi impossible pour le moment, réessaie.';
}
function erreurIdentifiants(error) {
  const m = (error && error.message ? error.message : '').toLowerCase();
  return m.includes('invalid login') || m.includes('invalid credentials');
}
function traduireErreurPassword(error) {
  const m = (error && error.message ? error.message : '').toLowerCase();
  if (m.includes('invalid login') || m.includes('invalid credentials')) {
    return 'Email ou mot de passe incorrect.';
  }
  if (m.includes('email not confirmed')) {
    return 'Email non confirmé — vérifie ta boîte mail.';
  }
  if (m.includes('already registered') || m.includes('already exists') || m.includes('unique')) {
    return 'Un compte existe déjà avec cet email. Connecte-toi.';
  }
  if (m.includes('rate') || m.includes('limit') || (error && error.status === 429)) {
    return 'Trop de tentatives, patiente un instant.';
  }
  return 'Connexion impossible, réessaie.';
}
function traduireErreurPseudo(error) {
  if (error && error.code === '23505') return 'Ce pseudo est déjà pris, essaie-en un autre.';
  if (error && error.code === '42P01') return 'Base non initialisée : exécute d\'abord supabase/schema.sql.';
  return (error && error.message) || 'Impossible d\'enregistrer le pseudo.';
}

// ---------- Overlay DOM (spec §5.1 : saisie texte via <input> superposés au canvas) ----------
const el = {};                       // cache des nœuds du DOM
function q(id) { return document.getElementById(id); }

function cacheDom() {
  el.overlay = q('auth-overlay');
  // Écran choix : boutons de méthode.
  el.methods = el.overlay ? Array.from(el.overlay.querySelectorAll('.auth-method')) : [];
  el.backs = el.overlay ? Array.from(el.overlay.querySelectorAll('[data-back]')) : [];
  // Écran magic.
  el.magicEmail = q('auth-magic-email');
  el.magicSend = q('auth-magic-send');
  // Écran password.
  el.pwdEmail = q('auth-pwd-email');
  el.pwdPassword = q('auth-pwd-password');
  el.pwdSubmit = q('auth-pwd-submit');
  el.forgot = q('auth-forgot');
  // Écran mot de passe oublié.
  el.resetEmail = q('auth-reset-email');
  el.resetSubmit = q('auth-reset-submit');
  el.resetBack = q('auth-reset-back');
  // Écran nouveau mot de passe (après le lien de récupération).
  el.newPassword = q('auth-new-password');
  el.newPasswordSubmit = q('auth-new-password-submit');
  // Écrans MFA TOTP.
  el.mfaEnable = q('auth-mfa-enable');
  el.mfaLater = q('auth-mfa-later');
  el.mfaQr = q('auth-mfa-qr');
  el.mfaSetupCode = q('auth-mfa-setup-code');
  el.mfaSetupVerify = q('auth-mfa-setup-verify');
  el.mfaSetupBack = q('auth-mfa-setup-back');
  el.mfaChallengeCode = q('auth-mfa-challenge-code');
  el.mfaChallengeSubmit = q('auth-mfa-challenge-submit');
  el.mfaChallengeBack = q('auth-mfa-challenge-back');
  el.pwdHint = q('auth-pwd-hint');
  el.tabLogin = q('auth-tab-login');
  el.tabSignup = q('auth-tab-signup');
  // Écran sent.
  el.resend = q('auth-resend');
  el.changeEmail = q('auth-change-email');
  el.emailRappel = q('auth-email-rappel');
  el.sentDesc = q('auth-sent-desc');
  // Écran pseudo.
  el.pseudo = q('auth-pseudo');
  el.pseudoBtn = q('auth-pseudo-btn');
  el.pseudoCount = q('auth-pseudo-count');
  // Communs.
  el.msg = q('auth-msg');
  el.close = q('auth-close');
  el.screens = el.overlay ? Array.from(el.overlay.querySelectorAll('[data-screen]')) : [];
}

function wireDom() {
  if (!el.overlay) return;
  // Écran choix : chaque bouton de méthode.
  for (const b of el.methods) {
    b.addEventListener('click', () => choisirMethode(b.dataset.method));
  }
  // Boutons retour (←) : reviennent à l'écran de choix.
  for (const b of el.backs) b.addEventListener('click', montrerChoix);
  // Écran magic.
  el.magicSend.addEventListener('click', envoyerCode);
  el.magicEmail.addEventListener('keydown', (e) => { if (e.key === 'Enter') envoyerCode(); });
  // Écran password.
  el.pwdSubmit.addEventListener('click', soumettrePassword);
  q('auth-forgot').addEventListener('click', ouvrirReset);
  el.tabLogin.addEventListener('click', () => changerTab('login'));
  el.tabSignup.addEventListener('click', () => changerTab('signup'));
  el.pwdEmail.addEventListener('keydown', (e) => { if (e.key === 'Enter') soumettrePassword(); });
  el.pwdPassword.addEventListener('keydown', (e) => { if (e.key === 'Enter') soumettrePassword(); });
  el.resetBack.addEventListener('click', () => ouvrirPassword('login'));
  el.resetSubmit.addEventListener('click', envoyerReset);
  el.resetEmail.addEventListener('keydown', (e) => { if (e.key === 'Enter') envoyerReset(); });
  el.newPasswordSubmit.addEventListener('click', mettreAJourMotDePasse);
  el.newPassword.addEventListener('keydown', (e) => { if (e.key === 'Enter') mettreAJourMotDePasse(); });
  el.mfaEnable.addEventListener('click', commencerActivationMfa);
  el.mfaLater.addEventListener('click', fermerOverlay);
  el.mfaSetupVerify.addEventListener('click', verifierActivationMfa);
  el.mfaSetupCode.addEventListener('keydown', (e) => { if (e.key === 'Enter') verifierActivationMfa(); });
  el.mfaSetupBack.addEventListener('click', async () => {
    if (pendingMfaFactorId && supabase && supabase.auth.mfa.unenroll) {
      await supabase.auth.mfa.unenroll({ factorId: pendingMfaFactorId }).catch(() => {});
    }
    pendingMfaFactorId = null;
    montrerEcran('mfa-prompt');
  });
  el.mfaChallengeSubmit.addEventListener('click', verifierDefiMfa);
  el.mfaChallengeCode.addEventListener('keydown', (e) => { if (e.key === 'Enter') verifierDefiMfa(); });
  el.mfaChallengeBack.addEventListener('click', async () => {
    pendingMfaUser = null;
    await supabase.auth.signOut().catch(() => {});
    setGuest(); montrerChoix(); ouvrirOverlay();
  });
  // Écran sent.
  el.resend.addEventListener('click', renvoyer);
  el.changeEmail.addEventListener('click', changerEmail);
  // Écran pseudo.
  el.pseudoBtn.addEventListener('click', confirmerPseudo);
  el.pseudo.addEventListener('keydown', (e) => { if (e.key === 'Enter') confirmerPseudo(); });
  // Fermer (croix).
  el.close.addEventListener('click', annulerAuthDepuisOverlay);
  // Compteur live du pseudo (3-16).
  el.pseudo.addEventListener('input', () => {
    if (el.pseudoCount) el.pseudoCount.textContent = `${el.pseudo.value.trim().length}/16`;
  });
}

function montrerEcran(name) {
  for (const s of el.screens) s.hidden = s.dataset.screen !== name;
  appliquerTraductions(el.overlay, lireLangue());
}
function ouvrirOverlay() { if (el.overlay) el.overlay.hidden = false; }
function fermerOverlay() { if (el.overlay) el.overlay.hidden = true; clearResend(); }
async function annulerAuthDepuisOverlay() {
  // Pendant le défi de connexion, pendingMfaFactorId désigne un facteur déjà
  // vérifié : le fermer ne doit surtout pas le supprimer. Seul l’écran
  // d’enrôlement possède un facteur temporaire à annuler.
  const setup = el.screens && el.screens.find((screen) => screen.dataset.screen === 'mfa-setup');
  if (setup && !setup.hidden && pendingMfaFactorId && supabase && supabase.auth.mfa.unenroll) {
    await supabase.auth.mfa.unenroll({ factorId: pendingMfaFactorId }).catch(() => {});
    pendingMfaFactorId = null;
  }
  fermerOverlay();
}
function resetPseudoBtn() { if (el.pseudoBtn) { el.pseudoBtn.disabled = false; el.pseudoBtn.textContent = traduire('Confirmer', lireLangue()); } }

function ouvrirPseudo() {
  account.status = 'pseudo';
  montrerEcran('pseudo');
  message('Choisis ton pseudo de joueur.', false);
  resetPseudoBtn();
  ouvrirOverlay();
  if (el.pseudo) el.pseudo.focus();
}

function message(text, isError) {
  if (!el.msg) return;
  el.msg.textContent = traduire(text || '', lireLangue());
  el.msg.style.color = isError ? 'var(--ui-danger)' : 'var(--ui-primary)';
}

// Met à jour le texte de l'écran "sent" selon qu'on vient du magic link ou de l'inscription password.
function mettreAJourEcranSent() {
  if (!el.sentDesc) return;
  // Repart toujours des clés françaises : ainsi le changement EN → FR ne
  // mémorise jamais le texte déjà traduit comme nouvelle source.
  if (sentFrom === 'reset') {
    el.sentDesc.innerHTML = `${uiText('Si cette adresse est associée à un compte, un lien de réinitialisation a été envoyé à')} <strong id="auth-email-rappel"></strong>. ${uiText('Vérifie ta boîte mail.')}`;
    el.emailRappel = q('auth-email-rappel');
  } else if (sentFrom === 'password') {
    el.sentDesc.innerHTML = `${uiText('Un email de confirmation a été envoyé à')} <strong id="auth-email-rappel"></strong>. ${uiText('Clique le lien dans ta boîte mail pour activer ton compte.')}`;
    // Re-cache emailRappel car le innerHTML a recréé l'élément.
    el.emailRappel = q('auth-email-rappel');
  } else {
    el.sentDesc.innerHTML = `${uiText('On a envoyé un lien de connexion à')} <strong id="auth-email-rappel"></strong>. ${uiText('Clique le lien dans ta boîte mail : tu reviendras ici connecté.')}`;
    el.emailRappel = q('auth-email-rappel');
  }
}

// « Changer d'email » depuis l'écran 'sent' : revient à l'écran d'origine pour ré-éditer
// l'adresse. Distinct du bouton retour ← (qui remonte au choix de méthode).
function changerEmail() {
  clearResend();
  message('', false);
  if (sentFrom === 'password') {
    // Seule l'inscription mène à 'sent' côté password → on rouvre l'onglet inscription.
    ouvrirPassword('signup');
  } else if (sentFrom === 'reset') {
    ouvrirReset();
  } else {
    ouvrirMagic();
  }
}

// Renvoi selon le mode : magic link ou confirmation d'inscription.
async function renvoyer() {
  if (sentFrom === 'reset') {
    await envoyerReset();
  } else if (sentFrom === 'password') {
    // Renvoi de l'email de confirmation (supabase.auth.resend).
    if (!supabase || !pendingEmail) return;
    try {
      const { error } = await supabase.auth.resend({ type: 'signup', email: pendingEmail });
      if (error) {
        message('Impossible de renvoyer l\'email. Réessaie plus tard.', true);
        return;
      }
      message('Email de confirmation renvoyé ✓', false);
      demarrerResend();
    } catch (e) {
      console.warn('[account] resend signup', e);
      message('Impossible de renvoyer l\'email.', true);
    }
  } else {
    // Magic link : ré-envoi du lien.
    await envoyerCode();
  }
}

// Compte à rebours anti-spam de 30 s sur « Renvoyer » (spec §2.1).
function demarrerResend() {
  clearResend();
  let s = 30;
  if (!el.resend) return;
  el.resend.disabled = true;
  const label = sentFrom === 'password'
    ? 'Renvoyer la confirmation'
    : (sentFrom === 'reset' ? 'Renvoyer le lien de réinitialisation' : 'Renvoyer le lien');
  el.resend.textContent = `${uiText(label)} (${s})`;
  resendTimer = setInterval(() => {
    s -= 1;
    if (s <= 0) { clearResend(); el.resend.disabled = false; setUiText(el.resend, label); }
    else el.resend.textContent = `${uiText(label)} (${s})`;
  }, 1000);
}
function clearResend() { if (resendTimer) { clearInterval(resendTimer); resendTimer = null; } }
