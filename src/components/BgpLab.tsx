import { useEffect, useMemo, useRef, useState } from 'react';
import { MISSIONS, asPath, initialRoutes, selectBest, type Route } from '../lib/bgp';

const STORE = 'na-bgp-missions';

const LINKS: Record<string, { d: string; onward: string[] }> = {
  A1: { d: 'M110,158 Q190,84 252,54', onward: ['A-D'] },
  A2: { d: 'M110,170 Q200,128 252,72', onward: ['A-D'] },
  B: { d: 'M110,182 L252,170', onward: ['B-T', 'T-D'] },
  IX: { d: 'M110,194 Q190,268 252,280', onward: ['IX-D'] },
};
const ONWARD: Record<string, string> = {
  'A-D': 'M308,58 Q460,40 544,156',
  'B-T': 'M308,170 L378,170',
  'T-D': 'M422,170 L540,170',
  'IX-D': 'M308,282 Q460,300 544,184',
};

const num = (v: string, min: number, max: number) => Math.min(max, Math.max(min, Number.isFinite(+v) ? Math.round(+v) : min));

function loadDone(): string[] {
  try {
    const v = JSON.parse(localStorage.getItem(STORE) ?? '[]');
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
}

export default function BgpLab({ compact = false }: { compact?: boolean }) {
  const [routes, setRoutes] = useState<Route[]>(initialRoutes);
  const [done, setDone] = useState<string[]>([]);
  const [toast, setToast] = useState('');
  const [hint, setHint] = useState<string | null>(null);
  const touched = useRef(false);

  useEffect(() => setDone(loadDone()), []);

  const sel = useMemo(() => selectBest(routes), [routes]);
  const bestId = sel.best?.id ?? null;

  useEffect(() => {
    if (!touched.current) return;
    for (const m of MISSIONS) {
      if (!done.includes(m.id) && m.done(routes, sel.best)) {
        const next = [...done, m.id];
        setDone(next);
        setToast(`Mission complete: ${m.title}`);
        setHint(null);
        try {
          localStorage.setItem(STORE, JSON.stringify(next));
        } catch {
          /* progress just isn't saved */
        }
      }
    }
  }, [routes, sel.best, done]);

  const update = (id: string, patch: Partial<Route>) => {
    touched.current = true;
    setRoutes((rs) => rs.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  };
  const reset = () => {
    touched.current = false;
    setRoutes(initialRoutes());
    setToast('');
  };

  const activeSegs = new Set(bestId ? LINKS[bestId].onward : []);
  const input = 'w-16 rounded-md border border-line bg-bg px-2 py-1 font-mono text-sm text-fg';
  const nextMission = MISSIONS.find((m) => !done.includes(m.id));

  return (
    <div className="not-prose my-8 space-y-4">
      {!compact && (
        <section aria-labelledby="missions" className="rounded-xl border border-line bg-surface p-4">
          <div className="flex items-center justify-between">
            <h2 id="missions" className="font-semibold">Missions</h2>
            <span className="text-sm text-muted">{done.length}/{MISSIONS.length} complete</span>
          </div>
          <div className="mt-2 h-2 overflow-hidden rounded-full bg-surface-2" role="progressbar" aria-valuenow={done.length} aria-valuemin={0} aria-valuemax={MISSIONS.length} aria-label="Missions complete">
            <div className="h-full bg-accent transition-all" style={{ width: `${(done.length / MISSIONS.length) * 100}%` }} />
          </div>
          <ol className="mt-3 grid gap-2 sm:grid-cols-2">
            {MISSIONS.map((m) => {
              const ok = done.includes(m.id);
              return (
                <li key={m.id} className={`rounded-lg border p-3 text-sm ${ok ? 'border-accent bg-accent-soft' : 'border-line'}`}>
                  <p className="font-medium">{ok ? '✓ ' : ''}{m.title}</p>
                  <p className="text-muted">{m.brief}</p>
                  {!ok && (
                    <button type="button" onClick={() => setHint(hint === m.id ? null : m.id)} className="mt-1 text-xs text-accent underline">
                      {hint === m.id ? 'Hide hint' : 'Hint'}
                    </button>
                  )}
                  {hint === m.id && <p className="mt-1 text-xs">{m.hint}</p>}
                </li>
              );
            })}
          </ol>
          <p role="status" aria-live="polite" className="mt-3 min-h-5 text-sm font-medium text-accent">
            {toast || (nextMission ? `Next: ${nextMission.title}` : 'All missions complete. You can read a BGP table.')}
          </p>
        </section>
      )}

      <section aria-label="Network diagram" className="rounded-xl border border-line bg-surface p-3">
        <svg viewBox="0 0 640 340" role="img" aria-label={bestId ? `Traffic currently leaves via ${sel.best!.name}` : 'No route: traffic is dropped'} className="h-auto w-full">
          {Object.entries(ONWARD).map(([k, d]) => (
            <path key={k} d={d} fill="none" strokeWidth={activeSegs.has(k) ? 4 : 2} className={activeSegs.has(k) ? 'flow stroke-accent' : 'stroke-line'} strokeDasharray={activeSegs.has(k) ? '8 6' : undefined} />
          ))}
          {routes.map((r) => {
            const l = LINKS[r.id];
            const best = r.id === bestId;
            return (
              <g key={r.id}>
                <path d={l.d} fill="none" strokeWidth={best ? 4 : 2.5} strokeDasharray={!r.up ? '4 6' : best ? '8 6' : undefined}
                  className={!r.up ? 'stroke-red-500' : best ? 'flow stroke-accent' : 'stroke-muted'} />
                <path d={l.d} fill="none" stroke="transparent" strokeWidth={22} className="cursor-pointer"
                  onClick={() => update(r.id, { up: !r.up })}>
                  <title>{`${r.name}: ${r.up ? 'up (click to cut)' : 'down (click to restore)'}`}</title>
                </path>
              </g>
            );
          })}
          {[['A', 280, 60, 'AS 64500'], ['B', 280, 170, 'AS 64501'], ['IX', 280, 282, 'AS 64510']].map(([k, x, y, as]) => (
            <g key={k as string}>
              <circle cx={x as number} cy={y as number} r={28} className="fill-surface-2 stroke-line" strokeWidth={2} />
              <text x={x as number} y={(y as number) - 2} textAnchor="middle" className="fill-fg text-[13px] font-semibold">{k}</text>
              <text x={x as number} y={(y as number) + 13} textAnchor="middle" className="fill-muted text-[9px]">{as}</text>
            </g>
          ))}
          <circle cx={400} cy={170} r={22} className="fill-surface-2 stroke-line" strokeWidth={2} />
          <text x={400} y={166} textAnchor="middle" className="fill-muted text-[9px]">transit</text>
          <text x={400} y={178} textAnchor="middle" className="fill-muted text-[9px]">AS 64520</text>
          <rect x={30} y={140} width={80} height={60} rx={10} className="fill-accent" />
          <text x={70} y={166} textAnchor="middle" className="fill-accent-fg text-[13px] font-bold">You</text>
          <text x={70} y={182} textAnchor="middle" className="fill-accent-fg text-[10px]">AS 64512</text>
          <circle cx={570} cy={170} r={32} className="fill-surface-2 stroke-fg" strokeWidth={2} />
          <text x={570} y={166} textAnchor="middle" className="fill-fg text-[11px] font-semibold">Dest</text>
          <text x={570} y={180} textAnchor="middle" className="fill-muted text-[9px]">AS 64999</text>
          {!bestId && <text x={320} y={330} textAnchor="middle" className="fill-red-500 text-[14px] font-semibold">No route: traffic is dropped</text>}
        </svg>
        <p className="px-2 text-xs text-muted">Click a link to cut it. The green animated path is where your traffic goes.</p>
      </section>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)]">
        <section aria-labelledby="table" className="rounded-xl border border-line bg-surface p-4">
          <h2 id="table" className="font-semibold">Routes to 203.0.113.0/24</h2>
          <div className="mt-3 space-y-3">
            {routes.map((r) => {
              const best = r.id === bestId;
              return (
                <div key={r.id} className={`rounded-lg border p-3 ${best ? 'border-accent bg-accent-soft' : 'border-line'} ${r.up ? '' : 'opacity-60'}`}>
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="text-sm font-medium">{r.name}</p>
                    <span className={`rounded-full px-2 py-0.5 text-xs ${best ? 'bg-accent text-accent-fg' : 'bg-surface-2 text-muted'}`}>
                      {!r.up ? 'link down' : best ? 'BEST' : 'not selected'}
                    </span>
                  </div>
                  <p className="mt-1 font-mono text-xs text-muted">AS_PATH: {asPath(r).join(' ')}</p>
                  <div className="mt-2 flex flex-wrap items-end gap-3 text-xs">
                    <label className="block">LOCAL_PREF
                      <input className={`${input} mt-0.5 block`} type="number" min={0} max={1000} value={r.localPref} onChange={(e) => update(r.id, { localPref: num(e.target.value, 0, 1000) })} />
                    </label>
                    <label className="block">Prepend
                      <input className={`${input} mt-0.5 block`} type="number" min={0} max={6} value={r.prepend} onChange={(e) => update(r.id, { prepend: num(e.target.value, 0, 6) })} />
                    </label>
                    <label className="block">MED
                      <input className={`${input} mt-0.5 block`} type="number" min={0} max={1000} value={r.med} onChange={(e) => update(r.id, { med: num(e.target.value, 0, 1000) })} />
                    </label>
                    <label className="flex items-center gap-1.5 pb-1">
                      <input type="checkbox" checked={r.up} onChange={(e) => update(r.id, { up: e.target.checked })} />
                      Link up
                    </label>
                  </div>
                  {!best && r.up && sel.lostTo[r.id] && <p className="mt-2 text-xs text-muted">Lost at: {sel.lostTo[r.id]}</p>}
                </div>
              );
            })}
          </div>
          <button type="button" onClick={reset} className="mt-3 rounded-md border border-line px-3 py-1.5 text-sm hover:border-muted">Reset lab</button>
        </section>

        <section aria-labelledby="why" className="rounded-xl border border-line bg-surface p-4">
          <h2 id="why" className="font-semibold">Why this path?</h2>
          {!sel.best ? (
            <p className="mt-2 text-sm">All links are down, so BGP has no route. Traffic to 203.0.113.0/24 is dropped.</p>
          ) : (
            <>
              <p className="mt-2 text-sm">BGP compares routes with one rule at a time and stops as soon as one route is left:</p>
              <ol className="mt-3 space-y-2 text-sm">
                {sel.steps.map((s, i) => (
                  <li key={s.rule} className="rounded-lg border border-line p-2.5">
                    <p className="font-medium"><span className="mr-1.5 font-mono text-xs text-accent">{i + 1}</span>{s.rule}</p>
                    {s.eliminated.length > 0 ? (
                      <p className="text-xs text-muted">Removes {s.eliminated.map((e) => e.id).join(', ')}. Left: {s.survivors.join(', ')}</p>
                    ) : (
                      <p className="text-xs text-muted">Tie: nothing removed.</p>
                    )}
                  </li>
                ))}
                {sel.steps.length === 0 && <li className="text-muted">Only one route is available.</li>}
              </ol>
              <p className="mt-3 text-sm font-medium text-accent">Winner: {sel.best.name}</p>
            </>
          )}
        </section>
      </div>
    </div>
  );
}
