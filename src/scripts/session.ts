// Login state shared by every island on the page, plus a hook that tells the sync code when local progress changed.
// Kept separate from auth.ts so the game and lesson stores can use it without loading any login code.

export type AuthStatus = 'loading' | 'guest' | 'signedIn';
export type AuthMode = 'supabase' | 'demo' | 'off';

export type SyncStatus = 'idle' | 'saving' | 'saved' | 'error';

export interface Session {
  status: AuthStatus;
  email: string | null;
  mode: AuthMode;
  sync: SyncStatus;
}

export const SESSION_EVENT = 'na-session-change';
/** Fired once when a visitor logs in (not when a saved session is restored). Detail: LoginNotice. */
export const LOGIN_EVENT = 'na-login-success';
/** Ask the header to open the login dialog from anywhere on the page. */
export const OPEN_AUTH_EVENT = 'na-open-auth';
/** Fired when the visitor arrived via a password-reset email link, so the header can open the "set a new password" form. */
export const RECOVERY_EVENT = 'na-password-recovery';

let current: Session = { status: 'loading', email: null, mode: 'off', sync: 'idle' };

export const getSession = (): Session => current;
export const isSignedIn = (): boolean => current.status === 'signedIn';

export function setSession(next: Partial<Session>): void {
  current = { ...current, ...next };
  if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent(SESSION_EVENT));
}

export function subscribeSession(cb: () => void): () => void {
  window.addEventListener(SESSION_EVENT, cb);
  return () => window.removeEventListener(SESSION_EVENT, cb);
}

export function openAuthDialog(): void {
  window.dispatchEvent(new CustomEvent(OPEN_AUTH_EVENT));
}

let saveHook: (() => void) | null = null;
export const onLocalSave = (fn: (() => void) | null): void => { saveHook = fn; };
/** Called by the stores after they save something the player did. */
export const notifyLocalSave = (): void => { try { saveHook?.(); } catch { /* syncing must never break play */ } };
