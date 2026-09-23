import { useMemo, useState } from 'react';
import { vlsmPlan } from '../../lib/netcalc';
import { CopyButton, Field, Message, Steps, btn, card, input } from './shared';

interface Need {
  key: number;
  name: string;
  hosts: string;
}

const PRESETS: Record<string, { parent: string; needs: [string, number][] }> = {
  'Small office': { parent: '192.168.10.0/24', needs: [['Staff', 100], ['Servers', 50], ['Guest', 25], ['WAN link', 2]] },
  'Branch network': { parent: '10.20.0.0/22', needs: [['Users', 400], ['Voice', 120], ['Cameras', 60], ['Management', 20], ['Router link A', 2], ['Router link B', 2]] },
};

let nextKey = 100;

export default function VlsmCalculator() {
  const [parent, setParent] = useState('192.168.10.0/24');
  const [needs, setNeeds] = useState<Need[]>(() => PRESETS['Small office'].needs.map(([name, hosts], i) => ({ key: i, name, hosts: String(hosts) })));

  const result = useMemo(() => vlsmPlan(parent, needs.map((n) => ({ name: n.name.trim() || 'Subnet', hosts: Number(n.hosts) }))), [parent, needs]);
  const update = (key: number, patch: Partial<Need>) => setNeeds((ns) => ns.map((n) => (n.key === key ? { ...n, ...patch } : n)));
  const csv = result.ok ? ['Name,Hosts,Subnet,Mask,First,Last,Broadcast', ...result.rows.map((r) => [r.name, r.hosts, r.subnet, r.mask, r.first, r.last, r.broadcast].join(','))].join('\n') : '';

  return (
    <div className={card}>
      <div className="flex flex-wrap items-end gap-3">
        <div className="w-56"><Field id="vlsm-parent" label="Parent network"><input id="vlsm-parent" className={input} value={parent} onChange={(e) => setParent(e.target.value)} spellCheck={false} /></Field></div>
        <div className="flex flex-wrap gap-2" aria-label="Examples">
          {Object.entries(PRESETS).map(([label, p]) => (
            <button key={label} type="button" className={btn} onClick={() => { setParent(p.parent); setNeeds(p.needs.map(([name, hosts]) => ({ key: nextKey++, name, hosts: String(hosts) }))); }}>{label}</button>
          ))}
        </div>
      </div>

      <h2 className="mt-6 text-sm font-semibold">What each subnet needs</h2>
      <div className="mt-2 space-y-2">
        {needs.map((n, i) => (
          <div key={n.key} className="flex flex-wrap items-center gap-2">
            <input aria-label={`Subnet ${i + 1} name`} className={`${input} !w-44`} value={n.name} onChange={(e) => update(n.key, { name: e.target.value })} />
            <input aria-label={`Subnet ${i + 1} hosts`} className={`${input} !w-28`} inputMode="numeric" value={n.hosts} onChange={(e) => update(n.key, { hosts: e.target.value })} />
            <span className="text-xs text-muted">hosts</span>
            <button type="button" className={btn} onClick={() => setNeeds((ns) => ns.filter((x) => x.key !== n.key))} aria-label={`Remove subnet ${i + 1}`}>Remove</button>
          </div>
        ))}
      </div>
      <button type="button" className={`${btn} mt-2`} onClick={() => setNeeds((ns) => [...ns, { key: nextKey++, name: `Subnet ${ns.length + 1}`, hosts: '10' }])}>+ Add subnet</button>

      <Message>{!result.ok && result.error}</Message>
      {result.ok && (
        <>
          <div className="mt-4 overflow-x-auto rounded-lg border border-line">
            <table className="min-w-full text-sm">
              <caption className="sr-only">VLSM allocation</caption>
              <thead className="bg-surface-2 text-left text-xs text-muted">
                <tr>{['Name', 'Hosts', 'Subnet', 'Mask', 'Usable range', 'Spare'].map((h) => <th key={h} scope="col" className="px-3 py-2">{h}</th>)}</tr>
              </thead>
              <tbody className="font-mono text-xs">
                {result.rows.map((r) => (
                  <tr key={r.subnet} className="border-t border-line">
                    <th scope="row" className="px-3 py-1.5 text-left font-sans text-sm font-medium">{r.name}</th>
                    <td className="px-3 py-1.5">{r.hosts}</td>
                    <td className="px-3 py-1.5 font-semibold">{r.subnet}</td>
                    <td className="px-3 py-1.5">{r.mask}</td>
                    <td className="px-3 py-1.5">{r.first} – {r.last}</td>
                    <td className="px-3 py-1.5">{r.spare}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="mt-3 text-sm">
            {result.freeAddresses > 0 ? <>Still free: <span className="font-mono">{result.free.join(', ')}</span> ({result.freeAddresses.toLocaleString()} addresses).</> : 'The parent network is completely used.'}
          </p>
          <div className="mt-3"><CopyButton text={csv} label="Copy as CSV" /></div>
          <Steps steps={result.steps} />
        </>
      )}
    </div>
  );
}
