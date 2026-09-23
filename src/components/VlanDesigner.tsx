import { useMemo, useState } from 'react';
import {
  SWITCH_PORTS, defaultDesign, generateRouter, generateSwitch, pairKey, subnetOf, trace, validateDesign,
  type Design,
} from '../lib/vlan';

const hue = (id: number) => `hsl(${(id * 47) % 360} 65% 48%)`;
const field = 'rounded-md border border-line bg-bg px-2 py-1.5 text-sm text-fg focus:border-accent';

/** Commits on blur or Enter, so half-typed IDs never rewire the design. */
function IdField({ value, onCommit, label }: { value: number; onCommit: (n: number) => string | null; label: string }) {
  const [text, setText] = useState(String(value));
  const [err, setErr] = useState<string | null>(null);
  const commit = () => {
    const n = Number(text);
    const e = Number.isInteger(n) ? onCommit(n) : 'Whole number, 1-4094.';
    setErr(e);
    if (e) setText(String(value));
  };
  return (
    <div>
      <input
        aria-label={label}
        aria-invalid={!!err}
        inputMode="numeric"
        value={text}
        onChange={(e) => setText(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => e.key === 'Enter' && commit()}
        className={`${field} w-20 font-mono`}
      />
      {err && <p role="alert" className="mt-0.5 text-xs text-red-600 dark:text-red-400">{err}</p>}
    </div>
  );
}

export default function VlanDesigner() {
  const [d, setD] = useState<Design>(defaultDesign);
  const [tab, setTab] = useState<'switch' | 'router'>('switch');
  const [from, setFrom] = useState('ether1');
  const [to, setTo] = useState<string>('ether9');
  const [copied, setCopied] = useState(false);

  const errors = useMemo(() => validateDesign(d), [d]);
  const out = useMemo(() => (tab === 'switch' ? generateSwitch(d) : generateRouter(d)), [d, tab]);
  const result = useMemo(() => (errors.length ? null : trace(d, from, to as string)), [d, errors, from, to]);

  const setVlan = (i: number, patch: Partial<Design['vlans'][number]>) =>
    setD((p) => ({ ...p, vlans: p.vlans.map((v, j) => (j === i ? { ...v, ...patch } : v)) }));

  function changeId(oldId: number, newId: number): string | null {
    if (newId < 1 || newId > 4094) return 'VLAN IDs run from 1 to 4094.';
    if (newId === oldId) return null;
    if (d.vlans.some((v) => v.id === newId)) return `VLAN ${newId} already exists.`;
    setD((p) => ({
      ...p,
      vlans: p.vlans.map((v) => (v.id === oldId ? { ...v, id: newId } : v)),
      access: Object.fromEntries(Object.entries(p.access).map(([k, v]) => [k, v === oldId ? newId : v])),
      allow: Object.fromEntries(
        Object.entries(p.allow).map(([k, v]) => {
          const [a, b] = k.split('>').map(Number);
          return [pairKey(a === oldId ? newId : a, b === oldId ? newId : b), v];
        }),
      ),
      mgmtVlan: p.mgmtVlan === oldId ? newId : p.mgmtVlan,
    }));
    return null;
  }

  function addVlan() {
    setD((p) => {
      let id = 10;
      while (p.vlans.some((v) => v.id === id)) id += 10;
      return { ...p, vlans: [...p.vlans, { id, name: `vlan${id}`, internet: false }] };
    });
  }

  function removeVlan(id: number) {
    setD((p) => {
      const vlans = p.vlans.filter((v) => v.id !== id);
      return {
        ...p,
        vlans,
        access: Object.fromEntries(Object.entries(p.access).map(([k, v]) => [k, v === id ? null : v])),
        allow: Object.fromEntries(Object.entries(p.allow).filter(([k]) => !k.split('>').map(Number).includes(id))),
        mgmtVlan: p.mgmtVlan === id ? (vlans[0]?.id ?? 0) : p.mgmtVlan,
      };
    });
  }

  async function copy() {
    try {
      await navigator.clipboard.writeText(out.rsc);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      /* clipboard blocked */
    }
  }
  function download() {
    const url = URL.createObjectURL(new Blob([out.rsc], { type: 'text/plain' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = tab === 'switch' ? 'sw-access-01.rsc' : 'r1.rsc';
    a.click();
    URL.revokeObjectURL(url);
  }

  const card = 'rounded-xl border border-line bg-surface p-4';
  const h2 = 'text-lg font-semibold';

  return (
    <div className="not-prose space-y-5">
      <section className={card} aria-labelledby="vl">
        <h2 id="vl" className={h2}>1. Define your VLANs</h2>
        <p className="text-sm text-muted">Each VLAN gets its own subnet, DHCP server and a place in the policy below. The management VLAN reaches the router and switch.</p>
        <div className="mt-3 space-y-2">
          {d.vlans.map((v, i) => (
            <div key={i} className="flex flex-wrap items-start gap-3 rounded-lg border border-line p-2.5">
              <span aria-hidden className="mt-2 h-3 w-3 rounded-full" style={{ background: hue(v.id) }} />
              <IdField key={v.id} label={`VLAN ${v.name} ID`} value={v.id} onCommit={(n) => changeId(v.id, n)} />
              <input aria-label={`VLAN ${v.id} name`} value={v.name} onChange={(e) => setVlan(i, { name: e.target.value })} className={`${field} w-32`} />
              <span className="mt-2 font-mono text-xs text-muted">{subnetOf(v.id)}</span>
              <label className="mt-1.5 flex items-center gap-1.5 text-sm">
                <input type="checkbox" checked={v.internet} onChange={(e) => setVlan(i, { internet: e.target.checked })} /> Internet
              </label>
              <label className="mt-1.5 flex items-center gap-1.5 text-sm">
                <input type="radio" name="mgmt" checked={d.mgmtVlan === v.id} onChange={() => setD((p) => ({ ...p, mgmtVlan: v.id }))} /> Management
              </label>
              <button type="button" onClick={() => removeVlan(v.id)} className="ml-auto rounded-md border border-line px-2.5 py-1 text-sm text-muted hover:text-fg">Remove</button>
            </div>
          ))}
        </div>
        <div className="mt-3 flex gap-2">
          <button type="button" onClick={addVlan} className="rounded-md border border-line px-3 py-1.5 text-sm hover:border-muted">+ Add VLAN</button>
          <button type="button" onClick={() => setD(defaultDesign())} className="rounded-md border border-line px-3 py-1.5 text-sm hover:border-muted">Reset design</button>
        </div>
        {errors.length > 0 && (
          <ul role="alert" className="mt-3 list-disc space-y-0.5 pl-5 text-sm text-red-600 dark:text-red-400">
            {errors.map((e) => <li key={e}>{e}</li>)}
          </ul>
        )}
      </section>

      <section className={card} aria-labelledby="pt">
        <h2 id="pt" className={h2}>2. Assign switch ports</h2>
        <p className="text-sm text-muted">Sixteen access ports. The uplink (sfp-sfpplus1) is a trunk carrying every VLAN to the router.</p>
        <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
          {SWITCH_PORTS.map((p) => {
            const id = d.access[p];
            return (
              <label key={p} className="block rounded-lg border border-line p-2 text-xs" style={{ borderLeft: `4px solid ${id ? hue(id) : 'transparent'}` }}>
                <span className="font-mono text-muted">{p}</span>
                <select
                  value={id ?? ''}
                  onChange={(e) => setD((s) => ({ ...s, access: { ...s.access, [p]: e.target.value === '' ? null : Number(e.target.value) } }))}
                  className={`${field} mt-1 block w-full`}
                >
                  <option value="">unused</option>
                  {d.vlans.map((v) => <option key={v.id} value={v.id}>{v.id} {v.name}</option>)}
                  {id !== null && !d.vlans.some((v) => v.id === id) && <option value={id}>{id} (missing)</option>}
                </select>
              </label>
            );
          })}
        </div>
      </section>

      <section className={card} aria-labelledby="pm">
        <h2 id="pm" className={h2}>3. Who may talk to whom?</h2>
        <p className="text-sm text-muted">Read across: the row VLAN may start connections to the column VLAN. Replies are always allowed. Anything not ticked is dropped by the router.</p>
        <div className="mt-3 overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead>
              <tr>
                <th scope="col" className="px-2 py-1 text-left text-xs font-normal text-muted">from ↓ &nbsp; to →</th>
                {d.vlans.map((b) => <th key={b.id} scope="col" className="px-2 py-1 text-xs font-medium"><span aria-hidden className="mr-1 inline-block h-2 w-2 rounded-full" style={{ background: hue(b.id) }} />{b.name}</th>)}
              </tr>
            </thead>
            <tbody>
              {d.vlans.map((a) => (
                <tr key={a.id} className="border-t border-line">
                  <th scope="row" className="px-2 py-1.5 text-left text-xs font-medium"><span aria-hidden className="mr-1 inline-block h-2 w-2 rounded-full" style={{ background: hue(a.id) }} />{a.name}</th>
                  {d.vlans.map((b) => (
                    <td key={b.id} className="px-2 py-1.5 text-center">
                      {a.id === b.id ? <span className="text-muted" aria-label="same VLAN">·</span> : (
                        <input
                          type="checkbox"
                          aria-label={`${a.name} may reach ${b.name}`}
                          checked={!!d.allow[pairKey(a.id, b.id)]}
                          onChange={(e) => setD((p) => ({ ...p, allow: { ...p.allow, [pairKey(a.id, b.id)]: e.target.checked } }))}
                        />
                      )}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className={card} aria-labelledby="tt">
        <h2 id="tt" className={h2}>4. Test it: send a ping</h2>
        <div className="mt-3 flex flex-wrap items-end gap-3">
          <label className="text-sm">From port
            <select value={from} onChange={(e) => setFrom(e.target.value)} className={`${field} mt-1 block`}>
              {SWITCH_PORTS.map((p) => <option key={p}>{p}</option>)}
            </select>
          </label>
          <label className="text-sm">To
            <select value={to} onChange={(e) => setTo(e.target.value)} className={`${field} mt-1 block`}>
              {SWITCH_PORTS.map((p) => <option key={p}>{p}</option>)}
              <option value="internet">the internet</option>
            </select>
          </label>
        </div>
        <div role="status" aria-live="polite" className="mt-3 min-h-16 rounded-lg border border-line p-3 text-sm">
          {result ? (
            <>
              <p className={`font-semibold ${result.ok ? 'text-accent' : 'text-red-600 dark:text-red-400'}`}>{result.ok ? '✓ Ping succeeds' : '✗ Ping fails'}</p>
              <ol className="mt-1 list-decimal space-y-0.5 pl-5 text-muted">
                {result.steps.map((s) => <li key={s}>{s}</li>)}
              </ol>
            </>
          ) : <p className="text-muted">Fix the errors above to run a test.</p>}
        </div>
      </section>

      <section className={card} aria-labelledby="ot">
        <h2 id="ot" className={h2}>5. Get the configuration</h2>
        <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
          <div role="tablist" aria-label="Device" className="flex gap-1">
            {(['switch', 'router'] as const).map((t) => (
              <button key={t} role="tab" aria-selected={tab === t} type="button" onClick={() => setTab(t)}
                className={`rounded-md border px-3 py-1.5 text-sm ${tab === t ? 'border-accent bg-accent-soft' : 'border-line hover:border-muted'}`}>
                {t === 'switch' ? 'Switch (CRS326)' : 'Router'}
              </button>
            ))}
          </div>
          <div className="flex gap-2">
            <button type="button" onClick={copy} disabled={!out.rsc} className="rounded-md border border-line px-3 py-1.5 text-sm hover:border-muted disabled:opacity-40">{copied ? 'Copied' : 'Copy'}</button>
            <button type="button" onClick={download} disabled={!out.rsc} className="rounded-md bg-accent px-3 py-1.5 text-sm font-medium text-accent-fg disabled:opacity-40">Download .rsc</button>
          </div>
        </div>
        {out.errors.length ? (
          <p className="mt-3 text-sm text-red-600 dark:text-red-400">Fix the errors above to generate a script.</p>
        ) : (
          <pre role="tabpanel" tabIndex={0} className="mt-3 max-h-[60vh] overflow-auto rounded-lg border border-line bg-bg p-3 font-mono text-xs leading-relaxed"><code>{out.rsc}</code></pre>
        )}
        <p className="mt-2 text-xs text-muted">
          The router gets one VLAN interface per VLAN on ether2 (cabled to the switch trunk) and uses ether1 as WAN. Apply the switch script from a port in the management VLAN, and test in a lab first.
        </p>
      </section>
    </div>
  );
}
