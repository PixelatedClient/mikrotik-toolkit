import { useState } from 'react';
import { BREACH_LEVELS } from '../../data/game/firewallLevels';
import { describeRule, evaluate, type Packet, type Proto, type Zone } from '../../lib/game/firewall';
import { finishLevel, useGame, type LevelReward } from './useGame';
import { LevelHeader, Stars, Terminal, Victory, ghost, panel, primary, sel } from './ui';
import { toRouterOs } from '../../lib/game/firewall';

export default function BreachAttack({ levelId }: { levelId: string }) {
  const level = BREACH_LEVELS.find((l) => l.id === levelId)!;
  const { state: game } = useGame();
  const [zone, setZone] = useState<Zone>(level.zones[0]);
  const [src, setSrc] = useState(level.sources[0].ip);
  const [proto, setProto] = useState<Proto>('tcp');
  const [port, setPort] = useState('');
  const [attempts, setAttempts] = useState(0);
  const [log, setLog] = useState<string[]>([]);
  const [reward, setReward] = useState<LevelReward | null>(null);

  const fire = () => {
    const dstPort = port.trim() ? Number(port) : undefined;
    if (proto !== 'icmp' && (dstPort === undefined || !Number.isInteger(dstPort) || dstPort < 1 || dstPort > 65535)) {
      setLog(['Enter a port from 1 to 65535.', ...log]);
      return;
    }
    const pkt: Packet = { id: 'atk', label: 'Your packet', chain: level.chain, iface: zone, src, dst: '192.168.88.10', proto, dstPort: proto === 'icmp' ? undefined : dstPort, state: 'new', evil: true, why: '' };
    const v = evaluate(level.enemyRules, pkt);
    const n = attempts + 1;
    setAttempts(n);
    const hitObjective = v.action === 'accept' && proto === level.objective.proto && (level.objective.port === undefined || dstPort === level.objective.port);
    const line = `${zone.toUpperCase()} ${src} → ${proto.toUpperCase()}${pkt.dstPort ? `/${pkt.dstPort}` : ''}: ${v.action === 'accept' ? 'ACCEPTED' : 'DROPPED'}${v.rule !== null ? ` by rule ${v.rule + 1}` : ' (no rule matched)'}`;
    if (hitObjective) {
      setLog([`${line}. Breach!`, ...log]);
      setReward(finishLevel(level.id, n <= 1 ? 3 : n <= 3 ? 2 : 1));
    } else if (v.action === 'accept') {
      setLog([`${line}. It got through, but it is not what you need for the objective.`, ...log]);
    } else setLog([`${line}.`, ...log]);
  };

  const restart = () => { setAttempts(0); setLog([]); setReward(null); };

  return (
    <div className="space-y-5">
      <LevelHeader title={level.title} story={level.story} learn={level.learn} goal={level.goal} read={level.read} />
      <p className="text-sm"><span className="pixel text-[0.55rem] text-danger">OBJECTIVE</span> {level.objective.label}</p>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <section className={panel} aria-labelledby="enemy-h">
          <h2 id="enemy-h" className="text-sm font-semibold">Enemy firewall (you found this config)</h2>
          <ol className="mt-2 space-y-1.5">
            {level.enemyRules.map((r, i) => <li key={i} className="rounded-md border-2 border-line bg-bg px-2.5 py-1.5 text-xs"><span className="font-mono text-muted">{i + 1}.</span> {describeRule(r)}</li>)}
          </ol>
          <div className="mt-3"><Terminal lines={level.enemyRules.map(toRouterOs)} empty="" /></div>
        </section>

        <fieldset className={panel}>
          <legend className="px-1 text-sm font-semibold">Craft your packet</legend>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="text-xs">Send from
              <select className={`${sel} mt-1 w-full`} value={zone} onChange={(e) => setZone(e.target.value as Zone)}>
                {level.zones.map((z) => <option key={z} value={z}>{z === 'wan' ? 'The internet (WAN)' : 'Inside the network (LAN)'}</option>)}
              </select>
            </label>
            <label className="text-xs">Source address
              <select className={`${sel} mt-1 w-full`} value={src} onChange={(e) => setSrc(e.target.value)}>
                {level.sources.map((s) => <option key={s.ip} value={s.ip}>{s.label}</option>)}
              </select>
            </label>
            <label className="text-xs">Protocol
              <select className={`${sel} mt-1 w-full`} value={proto} onChange={(e) => setProto(e.target.value as Proto)}>
                <option value="tcp">tcp</option><option value="udp">udp</option><option value="icmp">icmp</option>
              </select>
            </label>
            <label className="text-xs">Destination port
              <input className={`${sel} mt-1 w-full`} value={port} onChange={(e) => setPort(e.target.value)} inputMode="numeric" placeholder="e.g. 443" disabled={proto === 'icmp'} />
            </label>
          </div>
          <div className="mt-3 flex items-center gap-3">
            <button type="button" className={primary} onClick={fire}>Send packet</button>
            <span className="text-xs text-muted">Attempts: {attempts}</span>
          </div>
        </fieldset>
      </div>

      <ul aria-live="polite" aria-label="Attack log" className="space-y-1 text-xs">
        {log.map((l, i) => <li key={i} className="rounded-md border-2 border-line bg-surface-2 px-2.5 py-1.5 font-mono">{l}</li>)}
      </ul>

      {reward && <Victory levelId={level.id} reward={reward} onRetry={restart} extra={<p className="mt-2 text-xs text-muted">{attempts} attempt{attempts === 1 ? '' : 's'}. Fewer attempts earn more stars.</p>} />}
      <p className="flex items-center gap-2 text-xs text-muted">Best so far: <Stars n={game.stars[level.id] ?? 0} size={14} /> {reward ? '' : <button type="button" onClick={restart} className={ghost}>Clear log</button>}</p>
    </div>
  );
}
