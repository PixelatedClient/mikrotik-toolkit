import { ALL_LEVELS, REGIONS, levelOpen, regionOpen } from '../../data/game/world';
import { BADGES, levelInfo } from '../../lib/gamify';
import { featureInfo, featureLocked, regionFeature } from '../../lib/features';
import { openAuthDialog } from '../../scripts/session';
import { reset } from '../../scripts/game-store';
import { useAuth } from '../auth/useAuth';
import { useGame } from './useGame';
import { Stars, ghost } from './ui';
import RegionArt from './RegionArt';

const kindLabel = { subnet: 'Puzzle', route: 'Routing', defend: 'Defend', breach: 'Attack' } as const;

export default function WorldMap() {
  const { state, ready } = useGame();
  const auth = useAuth();
  const canLogin = auth.mode !== 'off';
  const info = levelInfo(state.xp);
  const total = ALL_LEVELS.length * 3;
  const stars = ALL_LEVELS.reduce((n, l) => n + (state.stars[l.id] ?? 0), 0);

  return (
    <div className="space-y-8">
      <section aria-label="Your progress" className="grid gap-3 rounded-xl border bg-surface p-4 sm:grid-cols-4">
        <div><p className="pixel text-[0.55rem] text-accent">LEVEL</p><p className="mt-1 text-2xl font-bold">{ready ? info.level : 1}</p></div>
        <div><p className="pixel text-[0.55rem] text-accent">XP</p><p className="mt-1 text-2xl font-bold">{state.xp}</p><p className="text-xs text-muted">{info.need - info.into} to next level</p></div>
        <div><p className="pixel text-[0.55rem] text-accent">STARS</p><p className="mt-1 text-2xl font-bold">{stars}<span className="text-sm text-muted"> / {total}</span></p></div>
        <div><p className="pixel text-[0.55rem] text-accent">STREAK</p><p className="mt-1 text-2xl font-bold">{state.streakDays}<span className="text-sm text-muted"> day{state.streakDays === 1 ? '' : 's'}</span></p></div>
      </section>

      {REGIONS.map((region) => {
        const gate = regionFeature(region.id);
        const loginLocked = !!gate && auth.ready && featureLocked(gate, auth.signedIn);
        const open = regionOpen(region, state.stars) && !loginLocked;
        const req = region.requires ? REGIONS.find((r) => r.id === region.requires!.region)! : null;
        return (
          <section key={region.id} aria-labelledby={`r-${region.id}`}>
            <h2 id={`r-${region.id}`} className="pixel text-sm leading-relaxed">{region.name}</h2>
            <RegionArt region={region.id} />
            <p className="mt-2 text-sm text-muted">{region.blurb}</p>
            {loginLocked && (
              <div className="mt-2 rounded-md border-2 border-dashed border-accent bg-surface p-3 text-sm">
                <p className="font-semibold"><span aria-hidden="true">🔒 </span>{featureInfo(gate!).name} needs a login.</p>
                <p className="mt-1 text-muted">{featureInfo(gate!).perk} Log in to unlock every feature; the stars you have already earned come with you.</p>
                {canLogin
                  ? <button type="button" onClick={openAuthDialog} className="mt-2 rounded-md bg-accent px-3 py-2 text-accent-fg md:py-1.5 min-h-11 md:min-h-auto">Log in or create an account</button>
                  : <p className="mt-1 text-xs text-muted">Accounts are not enabled on this site yet.</p>}
              </div>
            )}
            {!loginLocked && !open && req && <p className="mt-2 text-sm font-semibold text-danger">Locked: clear {region.requires!.levels} levels in {req.name} to enter.</p>}
            <ol className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {region.levels.map((l, i) => {
                const unlocked = levelOpen(l.id, state.stars) && !loginLocked;
                const s = state.stars[l.id] ?? 0;
                const body = (
                  <>
                    <div className="flex items-center justify-between">
                      <span className="pixel text-[0.55rem] text-muted">{l.boss ? 'BOSS' : `${kindLabel[l.kind].toUpperCase()} ${i + 1}`}</span>
                      {unlocked ? <Stars n={s} size={16} /> : <span aria-label="Locked" className="text-xs text-muted">🔒 locked</span>}
                    </div>
                    <p className="mt-2 font-semibold">{l.title}</p>
                  </>
                );
                return (
                  <li key={l.id}>
                    {unlocked ? (
                      <a href={`/play/${l.id}`} className={`block rounded-xl border bg-surface p-4 ${l.boss ? 'border-danger' : ''}`}>{body}</a>
                    ) : (
                      <div className="rounded-xl border bg-surface p-4 opacity-60">{body}</div>
                    )}
                  </li>
                );
              })}
            </ol>
          </section>
        );
      })}

      <section aria-labelledby="more-h">
        <h2 id="more-h" className="pixel text-sm">More ways to play</h2>
        <div className="mt-4 grid gap-3 sm:grid-cols-3">
          <a href="/reference" className="rounded-xl border bg-surface p-4"><p className="font-semibold">Reference</p><p className="text-xs text-muted">Checked commands and ports, with quizzes.</p></a>
          <a href="/practice" className="rounded-xl border bg-surface p-4"><p className="font-semibold">Practice</p><p className="text-xs text-muted">Quick rounds for XP and streaks, plus a daily challenge.</p></a>
          <a href="/learn" className="rounded-xl border bg-surface p-4"><p className="font-semibold">Troubleshooting tickets</p><p className="text-xs text-muted">Diagnose 12 faults with real-style commands.</p></a>
        </div>
      </section>

      <section aria-labelledby="badges-h">
        <h2 id="badges-h" className="pixel text-sm">Badges</h2>
        {auth.ready && !auth.signedIn && (
          <p className="mt-2 text-sm text-muted"><span aria-hidden="true">🔒 </span>Badges are for logged-in players.{canLogin ? ' Log in and any badge you already qualify for is awarded straight away.' : ''}{canLogin && <button type="button" onClick={openAuthDialog} className="ml-2 underline">Log in</button>}</p>
        )}
        <ul className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {BADGES.map((b) => {
            const has = auth.signedIn && state.badges.includes(b.id);
            return (
              <li key={b.id} className={`rounded-xl border bg-surface p-3 text-sm ${has ? '' : 'opacity-60'}`}>
                <p className="font-semibold">{has ? '★ ' : ''}{b.name}</p>
                <p className="text-xs text-muted">{b.desc}{has ? ' (earned)' : ''}</p>
              </li>
            );
          })}
        </ul>
      </section>

      <p className="text-xs text-muted">
        {auth.signedIn ? 'Your progress is saved to your account and follows you to any device.' : (
          <>Progress is saved only in this browser until you log in.{' '}
            <button type="button" className={ghost} onClick={() => { if (window.confirm('Erase all game progress in this browser?')) reset(); }}>Reset progress</button></>
        )}
      </p>
    </div>
  );
}
