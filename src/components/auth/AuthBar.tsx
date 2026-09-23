import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { UNLOCKED_NOTICE } from '../../lib/features';
import { deleteAccount, initAuth, requestPasswordReset, sendMagicLink, signIn, signOut, signUp, updatePassword, type LoginNotice } from '../../scripts/auth';
import { LOGIN_EVENT, OPEN_AUTH_EVENT, RECOVERY_EVENT } from '../../scripts/session';
import { PerkList } from './LockPanel';
import { useAuth } from './useAuth';

const field = 'mt-1 w-full rounded-md border-2 border-line bg-bg px-3 py-2 text-fg';
const primary = 'rounded-md bg-accent px-4 py-2 text-sm text-accent-fg disabled:opacity-40';

/** Header login button, the login dialog and the welcome toast. Mounted once, in the site header. */
export default function AuthBar() {
  const auth = useAuth();
  const [open, setOpen] = useState(false);
  const [menu, setMenu] = useState(false);
  const [notice, setNotice] = useState<LoginNotice | null>(null);
  const [recovery, setRecovery] = useState(false);
  const [changePw, setChangePw] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const opener = useRef<HTMLElement | null>(null);

  useEffect(() => {
    void initAuth();
    const onOpen = () => { opener.current = document.activeElement as HTMLElement | null; setOpen(true); };
    const onLogin = (e: Event) => { setOpen(false); setNotice((e as CustomEvent<LoginNotice>).detail); };
    const onRecovery = () => { setOpen(false); setMenu(false); setRecovery(true); };
    window.addEventListener(OPEN_AUTH_EVENT, onOpen);
    window.addEventListener(LOGIN_EVENT, onLogin);
    window.addEventListener(RECOVERY_EVENT, onRecovery);
    return () => { window.removeEventListener(OPEN_AUTH_EVENT, onOpen); window.removeEventListener(LOGIN_EVENT, onLogin); window.removeEventListener(RECOVERY_EVENT, onRecovery); };
  }, []);

  useEffect(() => {
    if (!notice) return;
    const t = setTimeout(() => setNotice(null), 9000);
    return () => clearTimeout(t);
  }, [notice]);

  const close = useCallback(() => { setOpen(false); opener.current?.focus(); }, []);

  if (auth.mode === 'off' && auth.ready) return null;

  return (
    <>
      {!auth.ready ? (
        <span className="hud inline-block h-7 w-16 rounded-md border-2 border-line" aria-hidden="true" />
      ) : auth.signedIn ? (
        <div className="relative">
          <button type="button" className="hud flex items-center gap-1 rounded-md border-2 border-line bg-surface px-2 py-1 hover:border-accent" aria-expanded={menu} aria-haspopup="true" aria-label={`Account menu for ${auth.email}`} onClick={() => setMenu((m) => !m)}>
            <span aria-hidden="true">👤</span>
            <span className="hidden max-w-[7rem] truncate sm:inline">{auth.email}</span>
          </button>
          {menu && (
            <div role="menu" className="absolute right-0 z-50 mt-2 w-60 rounded-md border-2 border-line bg-surface p-3 text-sm shadow-lg">
              <p className="truncate font-semibold">{auth.email}</p>
              <p className="mt-1 text-xs text-muted" role="status">
                {auth.sync === 'saving' ? 'Saving your progress...' : auth.sync === 'error' ? 'Could not save just now. It will retry.' : 'Progress saved to your account.'}
              </p>
              <button type="button" role="menuitem" className="mt-3 w-full rounded-md border-2 border-line px-3 py-1.5 hover:border-muted" onClick={() => { setMenu(false); void signOut(); }}>Log out</button>
              <p className="mt-2 text-xs text-muted">Logging out clears this browser. Your progress stays on your account.</p>
              {auth.mode === 'supabase' && (
                <>
                  <button type="button" role="menuitem" className="mt-3 w-full rounded-md border-2 border-line px-3 py-1.5 text-left hover:border-muted" onClick={() => { setMenu(false); setChangePw(true); }}>Change password</button>
                  <button type="button" role="menuitem" className="mt-2 w-full rounded-md border-2 border-danger px-3 py-1.5 text-left text-danger hover:bg-danger/10" onClick={() => { setMenu(false); setConfirmDelete(true); }}>Delete account</button>
                </>
              )}
            </div>
          )}
        </div>
      ) : (
        <button type="button" aria-label="Log in" className="hud rounded-md border-2 border-accent bg-surface px-2 py-1 text-accent hover:bg-surface-2" onClick={(e) => { opener.current = e.currentTarget; setOpen(true); }}>
          <span aria-hidden="true" className="sm:hidden">👤</span>
          <span aria-hidden="true" className="hidden sm:inline">LOG IN</span>
        </button>
      )}

      {/* Portalled to <body>: the header uses backdrop-filter, which would otherwise trap position:fixed inside it. */}
      {open && createPortal(<LoginDialog mode={auth.mode} onClose={close} />, document.body)}
      {recovery && createPortal(<SetPasswordDialog title="Set a new password" onClose={() => setRecovery(false)} />, document.body)}
      {changePw && createPortal(<SetPasswordDialog title="Change your password" onClose={() => setChangePw(false)} />, document.body)}
      {confirmDelete && createPortal(<DeleteAccountDialog onClose={() => setConfirmDelete(false)} />, document.body)}

      {notice && createPortal(
        <div role="status" aria-live="polite" className="fixed bottom-4 right-4 z-50 max-w-sm rounded-md border-2 border-accent bg-surface p-4 shadow-lg">
          <p className="pixel text-[0.6rem] text-accent">UNLOCKED</p>
          <p className="mt-2 text-sm font-semibold">{UNLOCKED_NOTICE}</p>
          <p className="mt-1 text-xs text-muted">{notice.merged ? 'We merged the progress from this browser with your account.' : 'The progress you already earned here is now saved.'}</p>
          {notice.badges.length > 0 && (
            <p className="mt-2 text-sm">New badges: <strong>{notice.badges.map((b) => b.name).join(', ')}</strong></p>
          )}
          <button type="button" className="mt-3 text-xs underline" onClick={() => setNotice(null)}>Dismiss</button>
        </div>,
        document.body,
      )}
    </>
  );
}

function LoginDialog({ mode, onClose }: { mode: string; onClose: () => void }) {
  const [tab, setTab] = useState<'in' | 'up'>('in');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const box = useRef<HTMLDivElement>(null);
  const first = useRef<HTMLInputElement>(null);

  useEffect(() => {
    first.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { onClose(); return; }
      if (e.key !== 'Tab' || !box.current) return;
      const items = box.current.querySelectorAll<HTMLElement>('button:not(:disabled), input, a[href]');
      if (!items.length) return;
      const [a, z] = [items[0], items[items.length - 1]];
      if (e.shiftKey && document.activeElement === a) { e.preventDefault(); z.focus(); }
      else if (!e.shiftKey && document.activeElement === z) { e.preventDefault(); a.focus(); }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMsg(null);
    const res = tab === 'in' ? await signIn(email, password) : await signUp(email, password);
    setBusy(false);
    if (!res.ok) setMsg({ ok: false, text: res.message });
    else if (res.message.startsWith('Check your email')) setMsg({ ok: true, text: res.message });
    // on success the login event closes the dialog and shows the welcome toast
  }

  async function link() {
    setBusy(true);
    setMsg(null);
    const res = await sendMagicLink(email);
    setBusy(false);
    setMsg({ ok: res.ok, text: res.message });
  }

  async function reset() {
    setBusy(true);
    setMsg(null);
    const res = await requestPasswordReset(email);
    setBusy(false);
    setMsg({ ok: res.ok, text: res.message });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div ref={box} role="dialog" aria-modal="true" aria-labelledby="auth-h" className="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-lg border-2 border-accent bg-surface p-6 shadow-xl">
        <div className="flex items-start justify-between gap-4">
          <h2 id="auth-h" className="pixel text-sm leading-relaxed">{tab === 'in' ? 'Log in' : 'Create account'}</h2>
          <button type="button" onClick={onClose} aria-label="Close" className="rounded-md px-2 text-xl text-muted hover:text-fg">×</button>
        </div>

        <div role="tablist" aria-label="Login or sign up" className="mt-4 flex gap-2 text-sm">
          {(['in', 'up'] as const).map((t) => (
            <button key={t} role="tab" type="button" aria-selected={tab === t} onClick={() => { setTab(t); setMsg(null); }} className={`rounded-md border-2 px-3 py-1 ${tab === t ? 'border-accent text-accent' : 'border-line text-muted'}`}>
              {t === 'in' ? 'Log in' : 'Sign up'}
            </button>
          ))}
        </div>

        {mode === 'demo' && (
          <p className="mt-4 rounded-md border-2 border-line bg-surface-2 p-2 text-xs">Demo mode (development only): accounts and progress are stored in this browser, not on a server.</p>
        )}

        <form onSubmit={submit} className="mt-4 space-y-3">
          <div>
            <label htmlFor="auth-email" className="text-sm font-semibold">Email</label>
            <input ref={first} id="auth-email" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} className={field} />
          </div>
          <div>
            <label htmlFor="auth-pw" className="text-sm font-semibold">Password</label>
            <input id="auth-pw" type="password" autoComplete={tab === 'in' ? 'current-password' : 'new-password'} required minLength={tab === 'up' ? 8 : undefined} value={password} onChange={(e) => setPassword(e.target.value)} className={field} />
            {tab === 'up' && <p className="mt-1 text-xs text-muted">At least 8 characters.</p>}
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <button type="submit" disabled={busy} className={primary}>{busy ? 'Please wait...' : tab === 'in' ? 'Log in' : 'Create account'}</button>
            {mode === 'supabase' && tab === 'in' && (
              <button type="button" disabled={busy || !email} onClick={link} className="text-sm underline disabled:opacity-40">Email me a login link instead</button>
            )}
          </div>
          {mode === 'supabase' && tab === 'in' && (
            <button type="button" disabled={busy || !email} onClick={reset} className="text-sm text-muted underline disabled:opacity-40">Forgot your password?</button>
          )}
          <p role="status" aria-live="polite" className={`min-h-[1.25rem] text-sm ${msg ? (msg.ok ? 'text-good' : 'text-danger') : ''}`}>{msg?.text}</p>
        </form>

        <div className="mt-2 border-t-2 border-line pt-4">
          <p className="text-sm font-semibold">Logging in unlocks and saves:</p>
          <PerkList />
          <p className="mt-3 text-xs text-muted">Playing without an account still works. Anything you have already earned in this browser is kept when you log in.</p>
        </div>
      </div>
    </div>
  );
}

/** Used both for a fresh password-reset link and for "change password" while already signed in. */
function SetPasswordDialog({ title, onClose }: { title: string; onClose: () => void }) {
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const first = useRef<HTMLInputElement>(null);

  useEffect(() => { first.current?.focus(); }, []);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMsg(null);
    const res = await updatePassword(password);
    setBusy(false);
    setMsg({ ok: res.ok, text: res.message });
    if (res.ok) setTimeout(onClose, 1200);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div role="dialog" aria-modal="true" aria-labelledby="setpw-h" className="w-full max-w-md rounded-lg border-2 border-accent bg-surface p-6 shadow-xl">
        <div className="flex items-start justify-between gap-4">
          <h2 id="setpw-h" className="pixel text-sm leading-relaxed">{title}</h2>
          <button type="button" onClick={onClose} aria-label="Close" className="rounded-md px-2 text-xl text-muted hover:text-fg">×</button>
        </div>
        <form onSubmit={submit} className="mt-4 space-y-3">
          <div>
            <label htmlFor="setpw-pw" className="text-sm font-semibold">New password</label>
            <input ref={first} id="setpw-pw" type="password" autoComplete="new-password" required minLength={8} value={password} onChange={(e) => setPassword(e.target.value)} className={field} />
            <p className="mt-1 text-xs text-muted">At least 8 characters.</p>
          </div>
          <button type="submit" disabled={busy} className={primary}>{busy ? 'Please wait...' : 'Set password'}</button>
          <p role="status" aria-live="polite" className={`min-h-[1.25rem] text-sm ${msg ? (msg.ok ? 'text-good' : 'text-danger') : ''}`}>{msg?.text}</p>
        </form>
      </div>
    </div>
  );
}

function DeleteAccountDialog({ onClose }: { onClose: () => void }) {
  const [typed, setTyped] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const first = useRef<HTMLInputElement>(null);

  useEffect(() => { first.current?.focus(); }, []);

  async function confirm() {
    setBusy(true);
    setMsg(null);
    const res = await deleteAccount();
    setBusy(false);
    if (!res.ok) setMsg({ ok: false, text: res.message });
    // on success signOut() has already run: the header updates and there is nothing left to show
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div role="dialog" aria-modal="true" aria-labelledby="del-h" className="w-full max-w-md rounded-lg border-2 border-danger bg-surface p-6 shadow-xl">
        <div className="flex items-start justify-between gap-4">
          <h2 id="del-h" className="pixel text-sm leading-relaxed text-danger">Delete account</h2>
          <button type="button" onClick={onClose} aria-label="Close" className="rounded-md px-2 text-xl text-muted hover:text-fg">×</button>
        </div>
        <p className="mt-4 text-sm">This permanently deletes your account and everything saved on it (XP, stars, streak, badges, finished lessons). It cannot be undone. Progress kept only in this browser is not affected.</p>
        <label htmlFor="del-confirm" className="mt-4 block text-sm font-semibold">Type DELETE to confirm</label>
        <input ref={first} id="del-confirm" type="text" value={typed} onChange={(e) => setTyped(e.target.value)} className={field} autoComplete="off" />
        <div className="mt-4 flex items-center gap-3">
          <button type="button" disabled={busy || typed !== 'DELETE'} onClick={confirm} className="rounded-md bg-danger px-4 py-2 text-sm text-white disabled:opacity-40">{busy ? 'Deleting...' : 'Permanently delete'}</button>
          <button type="button" onClick={onClose} className="text-sm underline">Cancel</button>
        </div>
        <p role="status" aria-live="polite" className={`mt-2 min-h-[1.25rem] text-sm ${msg ? (msg.ok ? 'text-good' : 'text-danger') : ''}`}>{msg?.text}</p>
      </div>
    </div>
  );
}
