import { useState } from 'react';
import { FW_LEVELS } from '../../data/game/firewallLevels';
import { describeRule, score, toRouterOs, type Action, type Chain, type ConnState, type Proto, type Rule, type Score, type Zone } from '../../lib/game/firewall';
import { calcSubnet } from '../../lib/subnet';
import { finishLevel, useGame, type LevelReward } from './useGame';
import { HpBar, LevelHeader, Stars, Terminal, Victory, ghost, panel, primary, sel } from './ui';

const STATES: ConnState[] = ['new', 'established', 'related', 'invalid'];

export default function FirewallDefense({ levelId }: { levelId: string }) {
  const level = FW_LEVELS.find((l) => l.id === levelId)!;
  const { state: game } = useGame();
  const has = (f: string) => (level.fields as string[]).includes(f);
  const defaultChain: Chain = level.packets[0].chain;

  const [rules, setRules] = useState<Rule[]>(level.initial ?? []);
  const [chain, setChain] = useState<Chain>(defaultChain);
  const [action, setAction] = useState<Action>('drop');
  const [proto, setProto] = useState<'' | Proto>('');
  const [ports, setPorts] = useState('');
  const [src, setSrc] = useState('');
  const [dst, setDst] = useState('');
  const [states, setStates] = useState<ConnState[]>([]);
  const [iface, setIface] = useState<'' | Zone>('');
  const [error, setError] = useState('');
  const [result, setResult] = useState<Score | null>(null);
  const [reward, setReward] = useState<LevelReward | null>(null);

  const build = (): Rule | string => {
    const r: Rule = { chain, action };
    if (proto) r.proto = proto;
    if (ports.trim()) {
      if (proto !== 'tcp' && proto !== 'udp') return 'Ports only work with TCP or UDP. Pick a protocol first.';
      const list = ports.split(/[,\s]+/).filter(Boolean).map(Number);
      if (list.some((p) => !Number.isInteger(p) || p < 1 || p > 65535)) return 'Ports must be whole numbers from 1 to 65535, separated by commas.';
      r.dstPort = list;
    }
    for (const [key, v] of [['src', src], ['dst', dst]] as const) {
      if (!v.trim()) continue;
      const withLen = v.includes('/') ? v.trim() : `${v.trim()}/32`;
      if (!calcSubnet(withLen)) return `"${v}" is not a valid address. Use a network like 10.10.0.0/24.`;
      r[key] = withLen;
    }
    if (states.length) r.state = states;
    if (iface) r.iface = iface;
    return r;
  };

  const add = () => {
    const r = build();
    if (typeof r === 'string') { setError(r); return; }
    setError('');
    setRules([...rules, r]);
    setResult(null);
  };
  const move = (i: number, d: -1 | 1) => {
    const j = i + d;
    if (j < 0 || j >= rules.length) return;
    const next = [...rules];
    [next[i], next[j]] = [next[j], next[i]];
    setRules(next);
    setResult(null);
  };
  const test = () => {
    const s = score(rules, level.packets);
    setResult(s);
    if (s.perfect) {
      const extra = rules.length - level.par;
      setReward(finishLevel(level.id, extra <= 0 ? 3 : extra === 1 ? 2 : 1));
    }
  };
  const restart = () => { setRules(level.initial ?? []); setResult(null); setReward(null); setError(''); };

  const hp = result ? Math.round(100 - (result.evilBlocked / Math.max(1, result.evilTotal)) * 100) : 100;

  return (
    <div className="space-y-5">
      <LevelHeader title={level.title} story={level.story} learn={level.learn} goal={level.goal} boss={level.boss} read={level.read} />
      {level.boss && <HpBar label={level.boss} pct={hp} />}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <section className={panel} aria-labelledby="traffic-h">
          <h2 id="traffic-h" className="text-sm font-semibold">Incoming traffic</h2>
          <ul className="mt-2 space-y-1.5">
            {level.packets.map((p) => {
              const r = result?.results.find((x) => x.packet.id === p.id);
              return (
                <li key={p.id} className={`rounded-md border-2 px-2.5 py-1.5 text-xs ${r ? (r.ok ? 'border-good' : 'border-danger') : 'border-line'}`}>
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span><strong>{p.label}</strong>{' '}<span className="text-muted">{p.evil ? '(hostile)' : '(friendly)'}</span></span>
                    <span className="font-mono text-muted">{p.iface.toUpperCase()} {p.src} → {p.proto.toUpperCase()}{p.dstPort ? `/${p.dstPort}` : ''} · {p.chain} · {p.state}</span>
                  </div>
                  {r && (
                    <p className={r.ok ? 'mt-1 text-good' : 'mt-1 text-danger'}>
                      {r.blocked ? 'Blocked' : 'Allowed'}{r.verdict.rule !== null ? ` by rule ${r.verdict.rule + 1}` : ' (no rule matched, so it is accepted)'}. {r.ok ? '' : p.evil ? 'This attacker got in. ' : 'A friendly packet was stopped. '}{r.ok ? '' : p.why}
                    </p>
                  )}
                </li>
              );
            })}
          </ul>
        </section>

        <section className={panel} aria-labelledby="rules-h">
          <h2 id="rules-h" className="text-sm font-semibold">Your rules (top to bottom, first match wins)</h2>
          <ol className="mt-2 space-y-1.5">
            {rules.length === 0 && <li className="text-sm text-muted">No rules yet. With no rules, everything is accepted.</li>}
            {rules.map((r, i) => (
              <li key={i} className="flex items-start justify-between gap-2 rounded-md border-2 border-line bg-bg px-2.5 py-1.5 text-xs">
                <span><span className="font-mono text-muted">{i + 1}.</span> {describeRule(r)}</span>
                <span className="flex shrink-0 gap-1">
                  <button type="button" className={ghost} aria-label={`Move rule ${i + 1} up`} onClick={() => move(i, -1)} disabled={i === 0}>↑</button>
                  <button type="button" className={ghost} aria-label={`Move rule ${i + 1} down`} onClick={() => move(i, 1)} disabled={i === rules.length - 1}>↓</button>
                  <button type="button" className={ghost} aria-label={`Delete rule ${i + 1}`} onClick={() => { setRules(rules.filter((_, j) => j !== i)); setResult(null); }}>✕</button>
                </span>
              </li>
            ))}
          </ol>
        </section>
      </div>

      <fieldset className={panel}>
        <legend className="px-1 text-sm font-semibold">New rule</legend>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {has('chain') && (
            <label className="text-xs">Chain
              <select className={`${sel} mt-1 w-full`} value={chain} onChange={(e) => setChain(e.target.value as Chain)}>
                <option value="input">input (to the router)</option>
                <option value="forward">forward (through it)</option>
              </select>
            </label>
          )}
          <label className="text-xs">Action
            <select className={`${sel} mt-1 w-full`} value={action} onChange={(e) => setAction(e.target.value as Action)}>
              <option value="accept">accept</option>
              <option value="drop">drop</option>
            </select>
          </label>
          {has('proto') && (
            <label className="text-xs">Protocol
              <select className={`${sel} mt-1 w-full`} value={proto} onChange={(e) => setProto(e.target.value as '' | Proto)}>
                <option value="">any</option><option value="tcp">tcp</option><option value="udp">udp</option><option value="icmp">icmp</option>
              </select>
            </label>
          )}
          {has('port') && (
            <label className="text-xs">Dst port(s)
              <input className={`${sel} mt-1 w-full`} value={ports} onChange={(e) => setPorts(e.target.value)} placeholder="e.g. 80,443" inputMode="numeric" />
            </label>
          )}
          {has('src') && (
            <label className="text-xs">Source address
              <input className={`${sel} mt-1 w-full`} value={src} onChange={(e) => setSrc(e.target.value)} placeholder="10.10.0.0/24" />
            </label>
          )}
          {has('dst') && (
            <label className="text-xs">Destination address
              <input className={`${sel} mt-1 w-full`} value={dst} onChange={(e) => setDst(e.target.value)} placeholder="192.168.88.10" />
            </label>
          )}
          {has('iface') && (
            <label className="text-xs">Arrives from
              <select className={`${sel} mt-1 w-full`} value={iface} onChange={(e) => setIface(e.target.value as '' | Zone)}>
                <option value="">anywhere</option><option value="wan">WAN (internet)</option><option value="lan">LAN (inside)</option>
              </select>
            </label>
          )}
          {has('state') && (
            <div className="text-xs sm:col-span-2">
              <span id="state-l">Connection state</span>
              <div className="mt-1 flex flex-wrap gap-2" role="group" aria-labelledby="state-l">
                {STATES.map((s) => (
                  <label key={s} className="flex items-center gap-1 rounded-md border-2 border-line px-2 py-1">
                    <input type="checkbox" checked={states.includes(s)} onChange={(e) => setStates(e.target.checked ? [...states, s] : states.filter((x) => x !== s))} />{s}
                  </label>
                ))}
              </div>
            </div>
          )}
        </div>
        {error && <p role="alert" className="mt-2 text-xs text-danger">{error}</p>}
        <div className="mt-3 flex flex-wrap gap-3">
          <button type="button" className={primary} onClick={add}>Add rule</button>
          <button type="button" className={primary} onClick={test}>{level.boss ? 'Face the dragon' : 'Test firewall'}</button>
          <button type="button" className={ghost} onClick={restart}>Reset</button>
        </div>
      </fieldset>

      <Terminal lines={rules.map(toRouterOs)} empty="Your rules appear here as real RouterOS commands" />

      {result && !result.perfect && (
        <p role="status" className="rounded-md border-2 border-line bg-surface-2 p-3 text-sm">
          Blocked {result.evilBlocked} of {result.evilTotal} attackers, allowed {result.goodAllowed} of {result.goodTotal} friendly packets. Check the red rows for hints.
        </p>
      )}
      {reward && <Victory levelId={level.id} reward={reward} onRetry={restart} extra={<p className="mt-2 text-xs text-muted">{rules.length} rules used. Par is {level.par}.</p>} />}
      <p className="flex items-center gap-2 text-xs text-muted">Best so far: <Stars n={game.stars[level.id] ?? 0} size={14} /></p>
    </div>
  );
}
