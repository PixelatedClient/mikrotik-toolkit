// Accounts: log in, log out, and keep progress in sync with the account.
//
// Two backends behind one API:
//   - supabase: real accounts. Needs PUBLIC_SUPABASE_URL and PUBLIC_SUPABASE_ANON_KEY at build time.
//   - demo:     development only (astro dev) when those variables are missing. Accounts live in this browser, so the
//               whole flow (locks, unlocking, merging progress) can be tried without a server. Never shipped to production.
// With neither, accounts are off and every visitor is a guest.
import { awardBadges, BADGES, type Badge, type GameState } from '../lib/gamify';
import { mergePayload, parsePayload, samePayload, type CloudPayload } from '../lib/sync';
import { load as loadGame, replaceFromCloud, reset as resetGame } from './game-store';
import { clearLessons, getDone, getLast, replaceLessons } from './progress';
import { LOGIN_EVENT, RECOVERY_EVENT, getSession, onLocalSave, setSession, type AuthMode } from './session';

const URL_ = import.meta.env.PUBLIC_SUPABASE_URL as string | undefined;
const KEY_ = import.meta.env.PUBLIC_SUPABASE_ANON_KEY as string | undefined;

/** A literal in the build, so every branch guarded by it is removed from production bundles. */
const DEMO: boolean = import.meta.env.DEV;

export const authMode = (): AuthMode => (URL_ && KEY_ ? 'supabase' : DEMO ? 'demo' : 'off');

export interface LoginNotice {
  email: string;
  /** Badges the player already qualified for that were awarded on login. */
  badges: Badge[];
  /** True when progress already stored on the account was merged with this browser's progress. */
  merged: boolean;
}

export interface Result {
  ok: boolean;
  message: string;
}

interface Cloud {
  read(uid: string): Promise<CloudPayload | null>;
  write(uid: string, p: CloudPayload): Promise<void>;
}

const localPayload = (): CloudPayload => ({ game: loadGame(), lessons: getDone(), last: getLast() });

function applyPayload(p: CloudPayload): void {
  replaceFromCloud(p.game);
  replaceLessons(p.lessons, p.last);
}

const badgesById = (ids: string[]): Badge[] => BADGES.filter((b) => ids.includes(b.id));

// ---------- backends ----------

let sb: any = null;
async function supabase() {
  if (sb) return sb;
  const { createClient } = await import('@supabase/supabase-js');
  sb = createClient(URL_!, KEY_!, { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true } });
  return sb;
}

const supabaseCloud: Cloud = {
  async read(uid) {
    const c = await supabase();
    const { data, error } = await c.from('progress').select('game,lessons,last').eq('user_id', uid).maybeSingle();
    if (error) throw error;
    return data ? parsePayload(data) : null;
  },
  async write(uid, p) {
    const c = await supabase();
    const { error } = await c.from('progress').upsert({ user_id: uid, game: p.game, lessons: p.lessons, last: p.last, updated_at: new Date().toISOString() });
    if (error) throw error;
  },
};

const DEMO_USERS = 'na-demo-users';
const DEMO_SESSION = 'na-demo-session';
const demoCloudKey = (uid: string) => `na-demo-cloud:${uid}`;
const readJson = <T>(k: string, fallback: T): T => { try { return JSON.parse(localStorage.getItem(k) ?? 'null') ?? fallback; } catch { return fallback; } };

const demoCloud: Cloud = {
  async read(uid) {
    const raw = readJson<unknown>(demoCloudKey(uid), null);
    return raw ? parsePayload(raw) : null;
  },
  async write(uid, p) {
    localStorage.setItem(demoCloudKey(uid), JSON.stringify(p));
  },
};

const cloud = (): Cloud => (DEMO && authMode() === 'demo' ? demoCloud : supabaseCloud);

// ---------- sync ----------

let userId: string | null = null;
let timer: ReturnType<typeof setTimeout> | null = null;
let syncing: Promise<void> = Promise.resolve();

/** Merge this browser with the account, apply the result locally, and upload if the account was behind. */
async function syncNow(): Promise<{ merged: boolean; badges: Badge[] }> {
  if (!userId) return { merged: false, badges: [] };
  setSession({ sync: 'saving' });
  try {
    const remote = await cloud().read(userId);
    const local = localPayload();
    const merged = remote ? mergePayload(local, remote) : local;
    // badges the player already qualifies for are awarded now that they are logged in
    const withBadges: CloudPayload = { ...merged, game: awardBadges(merged.game).state };
    const changedLocally = !samePayload(local, withBadges);
    const before = new Set(local.game.badges);
    if (changedLocally) applyPayload(withBadges);
    if (!remote || !samePayload(remote, withBadges)) await cloud().write(userId, withBadges);
    setSession({ sync: 'saved' });
    const fresh = withBadges.game.badges.filter((b) => !before.has(b));
    return { merged: !!remote, badges: badgesById(fresh) };
  } catch {
    setSession({ sync: 'error' });
    return { merged: false, badges: [] };
  }
}

function schedulePush() {
  if (!userId) return;
  if (timer) clearTimeout(timer);
  timer = setTimeout(() => { syncing = syncing.then(() => syncNow().then(() => undefined)); }, 1500);
}

async function flush() {
  if (timer) { clearTimeout(timer); timer = null; }
  await syncing;
  if (userId) await syncNow();
}

async function enter(id: string, email: string, announce: boolean) {
  userId = id;
  setSession({ status: 'signedIn', email, sync: 'idle' });
  onLocalSave(schedulePush);
  const res = await syncNow();
  if (announce) window.dispatchEvent(new CustomEvent<LoginNotice>(LOGIN_EVENT, { detail: { email, badges: res.badges, merged: res.merged } }));
}

function leave() {
  userId = null;
  if (timer) { clearTimeout(timer); timer = null; }
  onLocalSave(null);
  setSession({ status: 'guest', email: null, sync: 'idle' });
}

// ---------- public API ----------

let started = false;

/** Call once when the header mounts. Restores a saved login, or settles as guest. */
export async function initAuth(): Promise<void> {
  if (started) return;
  started = true;
  const mode = authMode();
  setSession({ mode });
  if (mode === 'off') { setSession({ status: 'guest' }); return; }

  if (DEMO && mode === 'demo') {
    const email = localStorage.getItem(DEMO_SESSION);
    if (email) await enter(email, email, false); else leave();
    return;
  }

  try {
    const c = await supabase();
    c.auth.onAuthStateChange((event: string, session: any) => {
      if (event === 'SIGNED_OUT') { leave(); return; }
      if (event === 'PASSWORD_RECOVERY') { window.dispatchEvent(new CustomEvent(RECOVERY_EVENT)); return; }
      if (session?.user && getSession().status !== 'signedIn') {
        void enter(session.user.id, session.user.email ?? 'your account', event === 'SIGNED_IN');
      }
    });
    const { data } = await c.auth.getSession();
    if (data.session?.user) { if (getSession().status !== 'signedIn') await enter(data.session.user.id, data.session.user.email ?? 'your account', false); }
    else if (getSession().status === 'loading') leave();
  } catch {
    leave();
  }
}

const validEmail = (e: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e);
const MIN_PASSWORD = 8;

function check(email: string, password?: string): Result | null {
  if (!validEmail(email)) return { ok: false, message: 'Enter a valid email address.' };
  if (password !== undefined && password.length < MIN_PASSWORD) return { ok: false, message: `Use at least ${MIN_PASSWORD} characters for the password.` };
  return null;
}

export async function signUp(email: string, password: string): Promise<Result> {
  email = email.trim().toLowerCase();
  const bad = check(email, password);
  if (bad) return bad;
  const mode = authMode();
  if (mode === 'off') return { ok: false, message: 'Accounts are not enabled on this site yet.' };
  if (DEMO && mode === 'demo') {
    const users = readJson<Record<string, string>>(DEMO_USERS, {});
    if (users[email]) return { ok: false, message: 'That email already has an account. Log in instead.' };
    users[email] = password;
    localStorage.setItem(DEMO_USERS, JSON.stringify(users));
    localStorage.setItem(DEMO_SESSION, email);
    await enter(email, email, true);
    return { ok: true, message: 'Account created.' };
  }
  try {
    const c = await supabase();
    const { data, error } = await c.auth.signUp({ email, password, options: { emailRedirectTo: window.location.origin } });
    if (error) return { ok: false, message: error.message };
    if (!data.session) return { ok: true, message: 'Check your email and click the confirmation link to finish creating your account.' };
    return { ok: true, message: 'Account created.' };
  } catch {
    return { ok: false, message: 'Could not reach the login service. Try again in a moment.' };
  }
}

export async function signIn(email: string, password: string): Promise<Result> {
  email = email.trim().toLowerCase();
  const bad = check(email);
  if (bad) return bad;
  if (!password) return { ok: false, message: 'Enter your password.' };
  const mode = authMode();
  if (mode === 'off') return { ok: false, message: 'Accounts are not enabled on this site yet.' };
  if (DEMO && mode === 'demo') {
    const users = readJson<Record<string, string>>(DEMO_USERS, {});
    if (users[email] !== password) return { ok: false, message: 'Wrong email or password.' };
    localStorage.setItem(DEMO_SESSION, email);
    await enter(email, email, true);
    return { ok: true, message: 'Logged in.' };
  }
  try {
    const c = await supabase();
    const { error } = await c.auth.signInWithPassword({ email, password });
    if (error) return { ok: false, message: error.message };
    return { ok: true, message: 'Logged in.' };
  } catch {
    return { ok: false, message: 'Could not reach the login service. Try again in a moment.' };
  }
}

export async function sendMagicLink(email: string): Promise<Result> {
  email = email.trim().toLowerCase();
  const bad = check(email);
  if (bad) return bad;
  if (authMode() !== 'supabase') return { ok: false, message: 'Email links need the live login service, which is not enabled here.' };
  try {
    const c = await supabase();
    const { error } = await c.auth.signInWithOtp({ email, options: { emailRedirectTo: window.location.origin } });
    if (error) return { ok: false, message: error.message };
    return { ok: true, message: 'Check your email for a login link.' };
  } catch {
    return { ok: false, message: 'Could not reach the login service. Try again in a moment.' };
  }
}

/** Send a password reset email. The link brings the visitor back here with a recovery session; see RECOVERY_EVENT. */
export async function requestPasswordReset(email: string): Promise<Result> {
  email = email.trim().toLowerCase();
  const bad = check(email);
  if (bad) return bad;
  if (authMode() !== 'supabase') return { ok: false, message: 'Password reset needs the live login service, which is not enabled here.' };
  try {
    const c = await supabase();
    const { error } = await c.auth.resetPasswordForEmail(email, { redirectTo: window.location.origin });
    if (error) return { ok: false, message: error.message };
    return { ok: true, message: 'Check your email for a link to set a new password.' };
  } catch {
    return { ok: false, message: 'Could not reach the login service. Try again in a moment.' };
  }
}

/** Set a new password. Works either from a fresh password-reset link (a recovery session) or while already signed in. */
export async function updatePassword(password: string): Promise<Result> {
  if (password.length < MIN_PASSWORD) return { ok: false, message: `Use at least ${MIN_PASSWORD} characters for the password.` };
  if (authMode() !== 'supabase') return { ok: false, message: 'Accounts are not enabled on this site yet.' };
  try {
    const c = await supabase();
    const { data, error } = await c.auth.updateUser({ password });
    if (error) return { ok: false, message: error.message };
    if (data.user && getSession().status !== 'signedIn') await enter(data.user.id, data.user.email ?? 'your account', true);
    return { ok: true, message: 'Password updated.' };
  } catch {
    return { ok: false, message: 'Could not reach the login service. Try again in a moment.' };
  }
}

/**
 * Permanently delete the signed-in visitor's own account. Calls a `security definer` Postgres function
 * (supabase/schema.sql) that only ever deletes `auth.uid()`, so it cannot reach anyone else's account.
 * The progress row cascades away with it (see the foreign key in schema.sql). Irreversible.
 */
export async function deleteAccount(): Promise<Result> {
  const mode = authMode();
  if (mode === 'off') return { ok: false, message: 'Accounts are not enabled on this site yet.' };
  if (DEMO && mode === 'demo') {
    const email = localStorage.getItem(DEMO_SESSION);
    if (email) {
      const users = readJson<Record<string, string>>(DEMO_USERS, {});
      delete users[email];
      localStorage.setItem(DEMO_USERS, JSON.stringify(users));
      localStorage.removeItem(demoCloudKey(email));
    }
    localStorage.removeItem(DEMO_SESSION);
    leave();
    resetGame();
    clearLessons();
    return { ok: true, message: 'Account deleted.' };
  }
  try {
    if (timer) { clearTimeout(timer); timer = null; } // a pending save would now fail (the account row is about to be gone) and is no longer wanted anyway
    const c = await supabase();
    const { error } = await c.rpc('delete_own_account');
    if (error) return { ok: false, message: error.message };
    try { await c.auth.signOut(); } catch { /* the account is already gone server-side */ }
    leave();
    resetGame();
    clearLessons();
    return { ok: true, message: 'Account deleted.' };
  } catch {
    return { ok: false, message: 'Could not reach the login service. Try again in a moment.' };
  }
}

/** Log out. Progress stays on the account; it is cleared from this browser so a shared computer is left clean. */
export async function signOut(): Promise<void> {
  await flush();
  if (authMode() === 'supabase') { try { await (await supabase()).auth.signOut(); } catch { /* fall through and clear locally */ } }
  else if (DEMO) localStorage.removeItem(DEMO_SESSION);
  leave();
  resetGame();
  clearLessons();
}

export type { GameState };
