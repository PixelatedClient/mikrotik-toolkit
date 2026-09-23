import { useEffect, useMemo, useRef, useState } from 'react';
import {
  MISSIONS, bridgeIdText, computeStp, initialBridges, initialLinks, pathCost, type Bridge, type Link, type Port,
} from '../lib/stp';

const STORE = 'na-stp-missions';
const POS: Record<string, { x: number; y: number }> = { A: { x: 110, y: 60 }, B: { x: 470, y: 60 }, C: { x: 470, y: 210 }, D: { x: 110, y: 210 } };
const SPEEDS = [10, 100, 1000, 10000];
const speedLabel = (s: number) => (s >= 1000 ? `${s / 1000} Gbps` : `${s} Mbps`);
const hex = (n: number) => `0x${n.toString(16).toUpperCase().padStart(4, '0')}`;
const ROLE_WORD = { root: 'root', designated: 'designated', alternate: 'blocked' } as const;
const ROLE_LETTER = { root: 'R', designated: 'D', alternate: 'X' } as const;

function loadDone(): string[] {
  try {
    const v = JSON.parse(localStorage.getItem(STORE) ?? '[]');
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
}

/** A point `d` px from `from` along the line towards `to`. */
const toward = (from: { x: number; y: number }, to: { x: number; y: number }, d: number) => {
  const dx = to.x - from.x, dy = to.y - from.y, len = Math.hypot(dx, dy) || 1;
  return { x: from.x + (dx / len) * d, y: from.y + (dy / len) * d };
};

export default function StpLab({ compact = false }: { compact?: boolean }) {
  const [bridges, setBridges] = useState<Bridge[]>(initialBridges);
  const [links, setLinks] = useState<Link[]>(initialLinks);
  const [done, setDone] = useState<string[]>([]);
  const [toast, setToast] = useState('');
  const [hint, setHint] = useState<string | null>(null);
  const touched = useRef(false);
  const initial = useMemo(() => computeStp(initialBridges(), initialLinks()), []);

  useEffect(() => setDone(loadDone()), []);
  const res = useMemo(() => computeStp(bridges, links), [bridges, links]);

  useEffect(() => {
    if (!touched.current) return;
    for (const m of MISSIONS) {
      if (!done.includes(m.id) && m.done(bridges, links, res, initial)) {
        const next = [...done, m.id];
        setDone(next);
        setToast(`Mission complete: ${m.title}`);
        setHint(null);
        try {
          localStorage.setItem(STORE, JSON.stringify(next));
        } catch {
          /* not saved */
        }
      }
    }
  }, [bridges, links, res, initial, done]);

  const setPriority = (id: string, priority: number) => {
    touched.current = true;
    setBridges((bs) => bs.map((b) => (b.id === id ? { ...b, priority } : b)));
  };
  const setLink = (id: string, patch: Partial<Link>) => {
    touched.current = true;
    setLinks((ls) => ls.map((l) => (l.id === id ? { ...l, ...patch } : l)));
  };
  const reset = () => {
    touched.current = false;
    setBridges(initialBridges());
    setLinks(initialLinks());
    setToast('');
  };

  const portOf = (bridge: string, link: string): Port | undefined => res.ports.find((p) => p.bridge === bridge && p.link === link);
  const name = (l: Link) => `${l.a}–${l.b}`;
  const nextMission = MISSIONS.find((m) => !done.includes(m.id));
  const sortedBridges = [...bridges].sort((a, b) => a.priority - b.priority || a.mac.localeCompare(b.mac));
  const select = 'rounded-md border border-line bg-bg px-2 py-1 text-sm text-fg';

  return (
    <div className="not-prose my-8 space-y-4">
      {!compact && (
        <section aria-labelledby="stp-missions" className="rounded-xl border border-line bg-surface p-4">
          <div className="flex items-center justify-between">
            <h2 id="stp-missions" className="font-semibold">Missions</h2>
            <span className="text-sm text-muted">{done.length}/{MISSIONS.length} complete</span>
          </div>
          <div className="mt-2 h-2 overflow-hidden rounded-full bg-surface-2" role="progressbar" aria-label="Missions complete" aria-valuemin={0} aria-valuemax={MISSIONS.length} aria-valuenow={done.length}>
            <div className="h-full bg-accent transition-all" style={{ width: `${(done.length / MISSIONS.length) * 100}%` }} />
          </div>
          <ol className="mt-3 grid gap-2 sm:grid-cols-2">
            {MISSIONS.map((m) => {
              const ok = done.includes(m.id);
              return (
                <li key={m.id} className={`rounded-lg border p-3 text-sm ${ok ? 'border-accent bg-accent-soft' : 'border-line'}`}>
                  <p className="font-medium">{ok ? '✓ ' : ''}{m.title}</p>
                  <p className="text-muted">{m.brief}</p>
                  {!ok && <button type="button" onClick={() => setHint(hint === m.id ? null : m.id)} className="mt-1 text-xs text-accent underline">{hint === m.id ? 'Hide hint' : 'Hint'}</button>}
                  {hint === m.id && <p className="mt-1 text-xs">{m.hint}</p>}
                </li>
              );
            })}
          </ol>
          <p role="status" aria-live="polite" className="mt-3 min-h-5 text-sm font-medium text-accent">
            {toast || (nextMission ? `Next: ${nextMission.title}` : 'All missions complete. You can read a spanning tree.')}
          </p>
        </section>
      )}

      <section aria-label="Network diagram" className="rounded-xl border border-line bg-surface p-3">
        <svg viewBox="0 0 580 270" role="img" aria-label={`Spanning tree: root bridge ${res.roots.join(' and ')}`} className="h-auto w-full">
          {links.map((l) => {
            const a = POS[l.a], b = POS[l.b];
            const active = res.activeLinks.includes(l.id);
            const blocked = res.blockedLinks.includes(l.id);
            const cls = !l.up ? 'stroke-red-500' : active ? 'flow stroke-accent' : 'stroke-amber-500';
            const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
            return (
              <g key={l.id}>
                <line x1={a.x} y1={a.y} x2={b.x} y2={b.y} strokeWidth={active ? 4 : 3} strokeDasharray={!l.up ? '3 7' : blocked ? '10 7' : '8 6'} className={cls} />
                <line x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke="transparent" strokeWidth={22} className="cursor-pointer" onClick={() => setLink(l.id, { up: !l.up })}>
                  <title>{`${name(l)} (${speedLabel(l.speedMbps)}): ${l.up ? 'up, click to cut' : 'down, click to restore'}`}</title>
                </line>
                <text x={mid.x} y={mid.y - 8} textAnchor="middle" className="fill-fg text-[10px]" paintOrder="stroke" stroke="var(--surface)" strokeWidth={4}>
                  {speedLabel(l.speedMbps)}{!l.up ? ' · down' : ''}
                </text>
              </g>
            );
          })}
          {links.filter((l) => l.up).flatMap((l) =>
            [l.a, l.b].map((end) => {
              const p = portOf(end, l.id);
              if (!p) return null;
              const from = POS[end], to = POS[end === l.a ? l.b : l.a];
              const pt = toward(from, to, 44);
              const fill = p.role === 'root' ? 'fill-accent' : p.role === 'designated' ? 'fill-sky-500' : 'fill-amber-500';
              return (
                <g key={`${l.id}-${end}`}>
                  <circle cx={pt.x} cy={pt.y} r={9} className={fill} />
                  <text x={pt.x} y={pt.y + 3.5} textAnchor="middle" className="fill-white text-[10px] font-bold">{ROLE_LETTER[p.role]}</text>
                </g>
              );
            }),
          )}
          {bridges.map((b) => {
            const p = POS[b.id];
            const root = res.roots.includes(b.id);
            return (
              <g key={b.id}>
                <rect x={p.x - 34} y={p.y - 24} width={68} height={48} rx={10} className={root ? 'fill-accent-soft stroke-accent' : 'fill-surface-2 stroke-line'} strokeWidth={root ? 3 : 2} />
                <text x={p.x} y={p.y - 3} textAnchor="middle" className="fill-fg text-[15px] font-bold">{b.id}</text>
                <text x={p.x} y={p.y + 13} textAnchor="middle" className="fill-muted text-[9px]">{root ? 'ROOT' : hex(b.priority)}</text>
              </g>
            );
          })}
        </svg>
        <p className="px-2 text-xs text-muted">Click a link to cut it. Green animated links carry traffic. Amber dashed links are blocked. Port badges: R = root port, D = designated port, X = blocked.</p>
      </section>

      <div className="grid gap-4 lg:grid-cols-2">
        <section aria-labelledby="stp-controls" className="rounded-xl border border-line bg-surface p-4">
          <h2 id="stp-controls" className="font-semibold">Settings</h2>
          <div className="mt-3 space-y-2">
            {bridges.map((b) => (
              <div key={b.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-line p-2.5 text-sm">
                <span className="font-medium">Bridge {b.id} <span className="font-mono text-xs text-muted">{b.mac.slice(-5)}</span></span>
                <label className="flex items-center gap-2">
                  <span className="text-xs text-muted">Priority</span>
                  <select aria-label={`Bridge ${b.id} priority`} className={select} value={b.priority} onChange={(e) => setPriority(b.id, Number(e.target.value))}>
                    {Array.from({ length: 16 }, (_, i) => i * 4096).map((v) => <option key={v} value={v}>{hex(v)}{v === 32768 ? ' (default)' : ''}</option>)}
                  </select>
                </label>
              </div>
            ))}
            {links.map((l) => (
              <div key={l.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-line p-2.5 text-sm">
                <span className="font-medium">Link {name(l)}</span>
                <span className="flex items-center gap-3">
                  <label className="flex items-center gap-1.5">
                    <span className="sr-only">Link {name(l)} speed</span>
                    <select className={select} value={l.speedMbps} onChange={(e) => setLink(l.id, { speedMbps: Number(e.target.value) })}>
                      {SPEEDS.map((s) => <option key={s} value={s}>{speedLabel(s)} (cost {pathCost(s).toLocaleString()})</option>)}
                    </select>
                  </label>
                  <label className="flex items-center gap-1.5"><input type="checkbox" checked={l.up} onChange={(e) => setLink(l.id, { up: e.target.checked })} /> Up</label>
                </span>
              </div>
            ))}
          </div>
          <button type="button" onClick={reset} className="mt-3 rounded-md border border-line px-3 py-1.5 text-sm hover:border-muted">Reset lab</button>
        </section>

        <section aria-labelledby="stp-why" className="rounded-xl border border-line bg-surface p-4">
          <h2 id="stp-why" className="font-semibold">Why this tree?</h2>
          <h3 className="mt-3 text-sm font-medium">1. Root election</h3>
          <ol className="mt-1 space-y-1 text-sm">
            {sortedBridges.map((b, i) => (
              <li key={b.id} className="font-mono text-xs">
                <span className={res.roots.includes(b.id) ? 'font-semibold text-accent' : ''}>{i + 1}. {b.id} {bridgeIdText(b)}</span>
              </li>
            ))}
          </ol>
          <p className="mt-1 text-xs text-muted">The lowest bridge ID (priority first, then MAC) wins. {res.roots.length > 1 ? `The network is split, so each part elected its own root: ${res.roots.join(', ')}.` : `Root: ${res.roots[0]}.`}</p>

          <h3 className="mt-4 text-sm font-medium">2. Each other bridge picks its root port</h3>
          <ul className="mt-1 space-y-1 text-sm">
            {bridges.filter((b) => !res.roots.includes(b.id)).map((b) => {
              const rp = res.ports.find((p) => p.bridge === b.id && p.role === 'root');
              const l = rp && links.find((x) => x.id === rp.link);
              return <li key={b.id} className="text-xs">{b.id}: {rp && l ? <>root port on link {name(l)}, root path cost <span className="font-mono">{res.rootPathCost[b.id].toLocaleString()}</span></> : 'no path to a root'}</li>;
            })}
          </ul>

          <h3 className="mt-4 text-sm font-medium">3. One designated port per link</h3>
          <ul className="mt-1 space-y-1 text-xs">
            {links.filter((l) => l.up).map((l) => {
              const pa = portOf(l.a, l.id)!, pb = portOf(l.b, l.id)!;
              const blocked = res.blockedLinks.includes(l.id);
              const blockedEnd = pa.role === 'alternate' ? l.a : pb.role === 'alternate' ? l.b : null;
              const other = blockedEnd === l.a ? l.b : l.a;
              return (
                <li key={l.id}>
                  <span className="font-medium">{name(l)}:</span>{' '}
                  {blocked && blockedEnd ? <>{other} offers the better path to the root (cost {res.rootPathCost[other].toLocaleString()} against {res.rootPathCost[blockedEnd].toLocaleString()}, or a lower bridge ID on a tie), so it is designated. {blockedEnd}'s port is <strong>blocked</strong>.</> : <>in the tree: {l.a} {ROLE_WORD[pa.role]}, {l.b} {ROLE_WORD[pb.role]}.</>}
                </li>
              );
            })}
            {links.filter((l) => !l.up).map((l) => <li key={l.id}><span className="font-medium">{name(l)}:</span> down, ignored.</li>)}
          </ul>
          <p className="mt-4 rounded-lg bg-surface-2 p-2.5 text-xs text-muted">
            Recovery time depends on the protocol. Classic 802.1D STP waits for timers: about 30 seconds after a direct failure and up to about 50 seconds after an indirect one (with default timers). RSTP negotiates with its neighbours and typically recovers in well under a second.
          </p>
        </section>
      </div>
    </div>
  );
}
