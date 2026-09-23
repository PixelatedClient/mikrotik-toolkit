import type { Lab } from '../../data/labs';
import type { Network } from '../../lib/sim';
import { computeNetworkStp } from '../../lib/sim/l2';

const short = (i: string) => i.replace(/^ether/, 'e');

/** Clickable version of the lab diagram. Cables turn green when both ends are up and red when they are not. */
export default function Topology({ lab, net, selected, onSelect }: { lab: Lab; net: Network; selected: string; onSelect: (id: string) => void }) {
  const at = (id: string) => lab.nodes.find((n) => n.id === id)!;
  const stp = computeNetworkStp(net);
  /** A cable is blocked when spanning tree keeps either end from forwarding. */
  const blocked = (dev: string, iface: string) => {
    const d = net.device(dev);
    const p = d.bridgePort(iface);
    return !!p && !stp.port(d, p.bridge, iface).forwarding && d.running(iface);
  };
  const toward = (from: { x: number; y: number }, to: { x: number; y: number }, d: number) => {
    const dx = to.x - from.x, dy = to.y - from.y, len = Math.hypot(dx, dy) || 1;
    return { x: from.x + (dx / len) * d, y: from.y + (dy / len) * d };
  };
  return (
    <svg viewBox="0 0 640 260" className="h-auto w-full" role="group" aria-label={`Interactive topology of ${lab.title}. Select a device to open its terminal.`}>
      {lab.links.map((l) => {
        const a = at(l.a), b = at(l.b);
        const up = net.device(l.a).running(l.ai) && net.device(l.b).running(l.bi);
        const stopped = up && (blocked(l.a, l.ai) || blocked(l.b, l.bi));
        const colour = !up ? 'var(--danger)' : stopped ? '#f0a020' : 'var(--good)';
        const ma = toward(a, b, 42), mb = toward(b, a, 42);
        return (
          <g key={`${l.a}${l.ai}${l.b}${l.bi}`}>
            <line x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke={colour} strokeWidth={3} strokeDasharray={up && !stopped ? undefined : '6 5'} />
            <text x={ma.x} y={ma.y} textAnchor="middle" dominantBaseline="middle" className="fill-muted text-[10px]" paintOrder="stroke" stroke="var(--surface)" strokeWidth={4}>{short(l.ai)}</text>
            <text x={mb.x} y={mb.y} textAnchor="middle" dominantBaseline="middle" className="fill-muted text-[10px]" paintOrder="stroke" stroke="var(--surface)" strokeWidth={4}>{short(l.bi)}</text>
          </g>
        );
      })}
      {lab.nodes.map((n) => {
        const d = net.device(n.id);
        const active = selected === n.id;
        // the node keeps its lab name; a router's own /system identity shows underneath once the learner sets one
        const label = n.label;
        const sub = d.kind === 'pc' ? d.pc.ip ?? '' : d.identity !== 'MikroTik' && d.identity !== n.label ? d.identity : '';
        return (
          <g key={n.id} role="button" tabIndex={0} aria-label={`Open terminal for ${n.label}`} aria-pressed={active} className="cursor-pointer" onClick={() => onSelect(n.id)} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onSelect(n.id); } }}>
            {n.kind === 'router'
              ? <circle cx={n.x} cy={n.y} r={26} fill="var(--accent-soft)" stroke="var(--accent)" strokeWidth={active ? 5 : 2.5} />
              : n.kind === 'switch'
                ? <rect x={n.x - 30} y={n.y - 20} width={60} height={40} fill="var(--accent-soft)" stroke="var(--accent)" strokeWidth={active ? 5 : 2.5} />
                : <rect x={n.x - 24} y={n.y - 16} width={48} height={32} fill="var(--surface-2)" stroke="var(--accent)" strokeWidth={active ? 4 : 2} />}
            <text x={n.x} y={n.y} textAnchor="middle" dominantBaseline="middle" className={`fill-fg font-semibold ${label.length > 6 ? 'text-[9px]' : 'text-[12px]'}`}>{label}</text>
            {sub && <text x={n.x} y={n.y + (n.y > 160 ? -26 : 34)} textAnchor="middle" className="fill-muted text-[9px]" paintOrder="stroke" stroke="var(--surface)" strokeWidth={3}>{sub}</text>}
          </g>
        );
      })}
      <g className="text-[9px]" aria-hidden="true">
        <line x1={12} y1={246} x2={30} y2={246} stroke="var(--good)" strokeWidth={3} /><text x={34} y={249} className="fill-muted">up</text>
        <line x1={62} y1={246} x2={80} y2={246} stroke="var(--danger)" strokeWidth={3} strokeDasharray="6 5" /><text x={84} y={249} className="fill-muted">down</text>
        <line x1={122} y1={246} x2={140} y2={246} stroke="#f0a020" strokeWidth={3} strokeDasharray="6 5" /><text x={144} y={249} className="fill-muted">blocked by spanning tree</text>
      </g>
    </svg>
  );
}
