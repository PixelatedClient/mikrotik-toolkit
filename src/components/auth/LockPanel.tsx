import { FEATURES, LOGIN_PROMPT, featureInfo, featureLocked, type FeatureId } from '../../lib/features';
import { openAuthDialog } from '../../scripts/session';
import { useAuth } from './useAuth';

/** Shown in place of locked content. Tells the visitor what they get and how to unlock it. */
export function LockPanel({ feature }: { feature: FeatureId }) {
  const { mode } = useAuth();
  const info = featureInfo(feature);
  return (
    <section aria-labelledby="lock-h" className="rounded-xl border-2 border-dashed border-accent bg-surface p-6">
      <p className="pixel text-[0.6rem] text-accent" aria-hidden="true">LOCKED</p>
      <h2 id="lock-h" className="mt-3 text-lg font-bold">{info.name} is for logged-in players</h2>
      <p className="mt-2 text-muted">{info.perk}</p>
      {mode === 'off' ? (
        <p className="mt-4 rounded-md border-2 border-line bg-surface-2 p-3 text-sm">Accounts are not switched on for this site yet, so this part is not available. Lessons, tools, labs and the first game region are always free.</p>
      ) : (
        <>
          <p className="mt-4 font-semibold">{LOGIN_PROMPT}</p>
          <p className="mt-1 text-sm text-muted">Once you log in, everything unlocks and the XP and stars you have already earned come with you.</p>
          <button type="button" onClick={openAuthDialog} className="mt-4 rounded-md bg-accent px-4 py-2 text-sm text-accent-fg">Log in or create an account</button>
        </>
      )}
      <p className="mt-4 text-xs text-muted">Always free: lessons, calculators and tools, labs, the reference, Subnet Valley, easy NOC incidents and practice rounds.</p>
    </section>
  );
}

/** Small inline marker for lists: only appears for guests. */
export function LockChip({ feature }: { feature: FeatureId }) {
  const { ready, signedIn, mode } = useAuth();
  if (!ready || mode === 'off' || !featureLocked(feature, signedIn)) return null;
  return <span className="pixel ml-2 inline-block rounded-sm border-2 border-line bg-surface-2 px-1.5 py-0.5 text-[0.5rem] text-muted"><span aria-hidden="true">🔒 </span>LOG IN</span>;
}

/** Everything that logging in adds, for the login dialog. */
export function PerkList() {
  return (
    <ul className="mt-2 space-y-1 text-sm text-muted">
      {FEATURES.map((f) => (
        <li key={f.id}><span aria-hidden="true">✔ </span>{f.name}</li>
      ))}
    </ul>
  );
}
