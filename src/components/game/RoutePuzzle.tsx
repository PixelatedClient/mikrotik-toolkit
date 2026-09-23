import { useMemo, useState } from 'react';
import { ROUTE_LEVELS } from '../../data/game/routeLevels';
import { knownPrefixes, nextHopChoices, routerOsCommand, sendPacket, withRoutes, type Net, type Outcome, type Route } from '../../lib/game/routing';
import { finishLevel, useGame, type LevelReward } from './useGame';
import { HpBar, LevelHeader, Stars, Terminal, Victory, ghost, panel, primary, sel } from './ui';

/** Lay nodes out in columns by distance from the first node. */
function layout(net: Net) {
  const depth = new Map<string, number>([[net.nodes[0].id, 0]]);
  const queue = [net.nodes[0].id];
  while (queue.length) {
    const id = queue.shift()!;
    for (const l of net.links) {
      const o = l.a === id ? l.b : l.b === id ? l.a : null;
      if (o && !depth.has(o)) { depth.set(o, depth.get(id)! + 1); queue.push(o); }
    }
  }
  const cols = new Map<number, string[]>();
  for (const n of net.nodes) {
    const d = depth.get(n.id) ?? 0;
    cols.set(d, [...(cols.get(d) ?? []), n.id]);
  }
  const maxD = Math.max(...cols.keys());
  const pos = new Map<string, { x: number; y: number }>();
  for (const [d, ids] of cols) ids.forEach((id, k) => pos.set(id, { x: 70 + (d * 460) / Math.max(1, maxD), y: 20 + ((k + 1) * 200) / (ids.length + 1) }));
  return pos;
}

const kindIcon = (k: string) => (k === 'router' ? '#' : k === 'enemy' ? '!' : 'PC');

function Topology({ net, path, dropAt, enemyIds }: { net: Net; path: string[]; dropAt?: string; enemyIds: string[] }) {
  const pos = useMemo(() => layout(net), [net.nodes.length]);
  const reduced = typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const onPath = (a: string, b: string) => { for (let i = 0; i < path.length - 1; i++) if ((path[i] === a && path[i + 1] === b) || (path[i] === b && path[i + 1] === a)) return true; return false; };
  return (
    <svg viewBox="0 0 600 250" className="w-full rounded-md border-2 border-line bg-bg" role="img" aria-label={`Network map: ${net.nodes.map((n) => n.label).join(', ')}`}>
      {net.links.map((l, k) => {
        const a = pos.get(l.a)!, b = pos.get(l.b)!;
        const hot = onPath(l.a, l.b);
        return <line key={k} x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke={!l.up ? 'var(--danger)' : hot ? 'var(--accent)' : 'var(--muted)'} strokeWidth={hot ? 5 : 3} strokeDasharray={l.up ? undefined : '6 6'} />;
      })}
      {net.links.filter((l) => !l.up).map((l, k) => {
        const a = pos.get(l.a)!, b = pos.get(l.b)!;
        return <text key={k} x={(a.x + b.x) / 2} y={(a.y + b.y) / 2 - 6} textAnchor="middle" fontSize="16" fill="var(--danger)">✕ cut</text>;
      })}
      {path.length > 1 && !reduced && (
        <rect key={path.join('>')} width="10" height="10" x="-5" y="-5" fill={dropAt ? 'var(--danger)' : 'var(--accent)'} stroke="var(--accent-edge)" strokeWidth="2">
          <animateMotion dur={`${Math.max(1.2, path.length * 0.6)}s`} repeatCount="indefinite" path={path.map((id, i) => `${i ? 'L' : 'M'}${pos.get(id)!.x},${pos.get(id)!.y}`).join(' ')} />
        </rect>
      )}
      {net.nodes.map((n) => {
        const p = pos.get(n.id)!;
        const lit = path.includes(n.id);
        const enemy = enemyIds.includes(n.id);
        return (
          <g key={n.id} transform={`translate(${p.x},${p.y})`}>
            <rect x="-26" y="-18" width="52" height="36" rx="3" fill={n.id === dropAt ? 'var(--danger)' : enemy ? 'var(--danger)' : lit ? 'var(--accent)' : 'var(--surface)'} stroke={lit ? 'var(--accent-edge)' : 'var(--edge)'} strokeWidth="3" opacity={enemy && !lit ? 0.85 : 1} />
            <text textAnchor="middle" y="5" fontSize="13" fontWeight="700" fill={lit || n.id === dropAt || enemy ? 'var(--accent-fg)' : 'var(--fg)'}>{kindIcon(n.kind === 'host' && enemy ? 'enemy' : n.kind)}</text>
            <text textAnchor="middle" y="34" fontSize="11" fill="var(--fg)">{n.label}</text>
          </g>
        );
      })}
    </svg>
  );
}

export default function RoutePuzzle({ levelId }: { levelId: string }) {
  const level = ROUTE_LEVELS.find((l) => l.id === levelId)!;
  const { state: game } = useGame();
  const [routes, setRoutes] = useState<Record<string, Route[]>>(() => Object.fromEntries(level.editable.map((id) => [id, level.net.nodes.find((n) => n.id === id)!.routes])));
  const [run, setRun] = useState<{ flow: number; outcome: Outcome }[] | null>(null);
  const [reward, setReward] = useState<LevelReward | null>(null);
  const [active, setActive] = useState(0);
  const [tries, setTries] = useState(0);

  const net = useMemo(() => withRoutes(level.net, routes), [level, routes]);
  const prefixes = useMemo(() => { const k = knownPrefixes(level.net); return [...k.slice(0, -1), ...(level.extraPrefixes ?? []), '0.0.0.0/0']; }, [level]);
  const total = Object.values(routes).reduce((n, r) => n + r.length, 0);
  const enemyIds = level.boss ? level.flows.map((f) => level.net.nodes.find((n) => n.ifaces.some((i) => i.ip === f.to))?.id ?? '') : [];
  const commands = level.editable.flatMap((id) => routes[id].length ? [`# ${level.net.nodes.find((n) => n.id === id)!.label}`, ...routes[id].map(routerOsCommand)] : []);

  const edit = (router: string, next: Route[]) => { setRoutes({ ...routes, [router]: next }); setRun(null); };
  const addRoute = (router: string) => {
    const hops = nextHopChoices(level.net, router).filter((h) => h.kind !== 'host');
    edit(router, [...routes[router], { dst: prefixes[0], via: hops[0]?.ip ?? '' }]);
  };

  const send = () => {
    const results = level.flows.map((f, flow) => {
      const o = sendPacket(net, f.from, f.to);
      const bad = o.delivered && f.mustPass && !o.path.includes(f.mustPass);
      return { flow, outcome: bad ? ({ delivered: false, reason: 'no-route', at: o.path[o.path.length - 1], path: o.path, detail: `The packet arrived, but not through the exit you wanted (${f.mustPass}).` } as Outcome) : o };
    });
    setRun(results);
    setTries((t) => t + 1);
    if (results.every((r) => r.outcome.delivered)) {
      const stars = total <= level.par ? 3 : total <= level.par + 2 ? 2 : 1;
      setReward(finishLevel(level.id, stars));
    }
  };

  const restart = () => { setRoutes(Object.fromEntries(level.editable.map((id) => [id, level.net.nodes.find((n) => n.id === id)!.routes]))); setRun(null); setReward(null); setTries(0); };
  const shown = run?.find((r) => r.flow === active) ?? null;
  const delivered = run ? run.filter((r) => r.outcome.delivered).length : 0;
  const hp = level.boss ? Math.round(100 - (delivered / level.flows.length) * 100) : 0;

  return (
    <div className="space-y-5">
      <LevelHeader title={level.title} story={level.story} learn={level.learn} goal={level.goal} boss={level.boss?.name} read={level.read} />
      {level.boss && <HpBar label={level.boss.name} pct={hp} />}

      <Topology net={net} path={shown?.outcome.path ?? []} dropAt={shown && !shown.outcome.delivered ? shown.outcome.at : undefined} enemyIds={enemyIds} />

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <div className="space-y-4">
          {level.editable.map((id) => {
            const node = level.net.nodes.find((n) => n.id === id)!;
            const hops = nextHopChoices(level.net, id).filter((h) => h.kind !== 'host');
            return (
              <fieldset key={id} className={panel}>
                <legend className="px-1 text-sm font-semibold">{node.label} routes</legend>
                {routes[id].length === 0 && <p className="text-sm text-muted">No static routes yet.</p>}
                {routes[id].map((r, k) => (
                  <div key={k} className="mt-2 flex flex-wrap items-center gap-2">
                    <label className="sr-only" htmlFor={`${id}-d-${k}`}>Destination</label>
                    <select id={`${id}-d-${k}`} className={sel} value={r.dst} onChange={(e) => edit(id, routes[id].map((x, j) => (j === k ? { ...x, dst: e.target.value } : x)))}>
                      {prefixes.map((p) => <option key={p} value={p}>{p === '0.0.0.0/0' ? '0.0.0.0/0 (default)' : p}</option>)}
                    </select>
                    <span aria-hidden="true">via</span>
                    <label className="sr-only" htmlFor={`${id}-v-${k}`}>Next hop</label>
                    <select id={`${id}-v-${k}`} className={sel} value={r.via} onChange={(e) => edit(id, routes[id].map((x, j) => (j === k ? { ...x, via: e.target.value } : x)))}>
                      {hops.map((h) => <option key={h.ip} value={h.ip}>{h.label}</option>)}
                    </select>
                    <button type="button" className={ghost} aria-label={`Remove route ${k + 1} on ${node.label}`} onClick={() => edit(id, routes[id].filter((_, j) => j !== k))}>Remove</button>
                  </div>
                ))}
                <button type="button" className={`${ghost} mt-3`} onClick={() => addRoute(id)}>+ Add route</button>
              </fieldset>
            );
          })}
        </div>

        <div className="space-y-3">
          <Terminal lines={commands} empty="Your routes appear here as real RouterOS commands" />
          <div className="flex flex-wrap items-center gap-3">
            <button type="button" className={primary} onClick={send}>{level.boss ? 'Launch attack' : 'Send packets'}</button>
            <span className="text-xs text-muted">Routes: {total} (par {level.par}) · Tries: {tries}</span>
          </div>
          <div role="group" aria-label="Packets to deliver" className="space-y-2">
            {level.flows.map((f, k) => {
              const r = run?.find((x) => x.flow === k);
              return (
                <button key={k} type="button" onClick={() => setActive(k)} aria-pressed={active === k}
                  className={`flex w-full items-center justify-between rounded-md border-2 px-3 py-2 text-left text-sm ${active === k ? 'border-accent' : 'border-line'}`}>
                  <span>{f.label}</span>
                  <span className={r ? (r.outcome.delivered ? 'text-good' : 'text-danger') : 'text-muted'}>{r ? (r.outcome.delivered ? 'Delivered' : 'Dropped') : 'Not sent'}</span>
                </button>
              );
            })}
          </div>
          {shown && (
            <p role="status" className="rounded-md border-2 border-line bg-surface-2 p-3 text-sm">
              {shown.outcome.delivered
                ? `Path: ${shown.outcome.path.map((id) => level.net.nodes.find((n) => n.id === id)!.label).join(' → ')}`
                : shown.outcome.detail}
            </p>
          )}
        </div>
      </div>

      {reward && <Victory levelId={level.id} reward={reward} onRetry={restart} extra={<p className="mt-2 flex items-center justify-center gap-2 text-xs text-muted">{total} route{total === 1 ? '' : 's'} used. Par is {level.par}.</p>} />}
      <p className="flex items-center gap-2 text-xs text-muted">Best so far: <Stars n={game.stars[level.id] ?? 0} size={14} /></p>
    </div>
  );
}
