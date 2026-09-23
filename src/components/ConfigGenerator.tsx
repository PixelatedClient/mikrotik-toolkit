import { useMemo, useRef, useState } from 'react';
import {
  DEFAULT_CONFIG,
  DEVICES,
  deviceById,
  generate,
  type Config,
  type Role,
  type VlanEntry,
} from '../lib/mikrotik';

const ROLES: { id: Role; label: string; hint: string }[] = [
  { id: 'gateway', label: 'Office gateway', hint: 'NAT, DHCP, DNS and a stateful firewall for a small site.' },
  { id: 'isp-edge', label: 'ISP edge router', hint: 'eBGP to one upstream, prefix filters, anti-spoofing.' },
  { id: 'vlan-switch', label: 'VLAN switch', hint: 'Bridge VLAN filtering with a trunk and access ports.' },
];

const field =
  'mt-1 w-full rounded-md border border-line bg-bg px-3 py-2 text-sm text-fg placeholder:text-muted focus:border-accent';
const label = 'block text-sm font-medium text-fg';
const help = 'mt-1 text-xs text-muted';

function Field({ id, title, hint, children }: { id: string; title: string; hint?: string; children: React.ReactNode }) {
  return (
    <div>
      <label htmlFor={id} className={label}>{title}</label>
      {children}
      {hint && <p className={help}>{hint}</p>}
    </div>
  );
}

function VlanRow({ v, onChange, onRemove }: { v: VlanEntry; onChange: (v: VlanEntry) => void; onRemove: () => void }) {
  const [ports, setPorts] = useState(v.ports.join(', '));
  return (
    <div className="grid grid-cols-[5rem_1fr] gap-2 rounded-md border border-line p-3 sm:grid-cols-[5rem_8rem_1fr_auto]">
      <input
        aria-label="VLAN ID"
        type="number"
        min={1}
        max={4094}
        value={v.id}
        onChange={(e) => onChange({ ...v, id: Number(e.target.value) })}
        className={field + ' mt-0'}
      />
      <input
        aria-label="VLAN name"
        value={v.name}
        onChange={(e) => onChange({ ...v, name: e.target.value })}
        className={field + ' mt-0'}
      />
      <input
        aria-label="Access ports, comma separated"
        placeholder="ether1, ether2"
        value={ports}
        onChange={(e) => {
          setPorts(e.target.value);
          onChange({ ...v, ports: e.target.value.split(',').map((s) => s.trim()).filter(Boolean) });
        }}
        className={field + ' mt-0 col-span-2 sm:col-span-1'}
      />
      <button
        type="button"
        onClick={onRemove}
        className="col-span-2 rounded-md border border-line px-3 py-2 text-sm text-muted hover:text-fg sm:col-span-1"
      >
        Remove
      </button>
    </div>
  );
}

export default function ConfigGenerator() {
  const [c, setC] = useState<Config>(DEFAULT_CONFIG);
  const [copied, setCopied] = useState(false);
  // Stable React keys for VLAN rows: index keys would leak each row's local text state on removal.
  const nextKey = useRef(DEFAULT_CONFIG.vlans.length);
  const [rowKeys, setRowKeys] = useState<number[]>(() => DEFAULT_CONFIG.vlans.map((_, i) => i));
  const set = <K extends keyof Config>(k: K, v: Config[K]) => setC((p) => ({ ...p, [k]: v }));

  const device = deviceById(c.deviceId)!;
  const { rsc, errors } = useMemo(() => generate(c), [c]);
  const eligible = DEVICES.filter((d) => c.role === 'vlan-switch' || d.kind === 'router');

  function changeRole(role: Role) {
    setC((p) => {
      let deviceId = p.deviceId;
      if (role === 'vlan-switch') deviceId = 'crs326';
      else if (deviceById(deviceId)?.kind === 'switch') deviceId = role === 'isp-edge' ? 'ccr2004' : 'hex';
      const d = deviceById(deviceId)!;
      return {
        ...p,
        role,
        deviceId,
        wanPort: d.ports[0],
        upstreamPort: d.ports[0],
        trunkPort: d.ports[d.ports.length - 1],
        identity: role === 'isp-edge' ? 'edge-01' : role === 'vlan-switch' ? 'sw-access-01' : 'gw-office-01',
        mgmtCidr: role === 'vlan-switch' ? '10.99.0.2/24' : '192.168.88.0/24',
      };
    });
  }

  function changeDevice(deviceId: string) {
    const d = deviceById(deviceId)!;
    setC((p) => ({
      ...p,
      deviceId,
      wanPort: d.ports[0],
      upstreamPort: d.ports[0],
      trunkPort: d.ports[d.ports.length - 1],
    }));
  }

  async function copy() {
    try {
      await navigator.clipboard.writeText(rsc);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      /* clipboard blocked; user can select the text */
    }
  }

  function download() {
    const url = URL.createObjectURL(new Blob([rsc], { type: 'text/plain' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = `${c.identity}.rsc`;
    a.click();
    URL.revokeObjectURL(url);
  }

  const portSelect = (id: string, value: string, onChange: (v: string) => void) => (
    <select id={id} value={value} onChange={(e) => onChange(e.target.value)} className={field}>
      {device.ports.map((p) => <option key={p}>{p}</option>)}
    </select>
  );

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,26rem)_minmax(0,1fr)]">
      <form className="space-y-5 rounded-xl border border-line bg-surface p-5" onSubmit={(e) => e.preventDefault()}>
        <fieldset>
          <legend className={label}>Role</legend>
          <div className="mt-2 grid gap-2">
            {ROLES.map((r) => (
              <label
                key={r.id}
                className={`cursor-pointer rounded-md border p-3 text-sm ${
                  c.role === r.id ? 'border-accent bg-accent-soft' : 'border-line hover:border-muted'
                }`}
              >
                <input
                  type="radio"
                  name="role"
                  className="sr-only"
                  checked={c.role === r.id}
                  onChange={() => changeRole(r.id)}
                />
                <span className="font-medium">{r.label}</span>
                <span className="block text-xs text-muted">{r.hint}</span>
              </label>
            ))}
          </div>
        </fieldset>

        <Field id="device" title="Device">
          <select id="device" value={c.deviceId} onChange={(e) => changeDevice(e.target.value)} className={field}>
            {eligible.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
          </select>
        </Field>

        <Field id="identity" title="System identity">
          <input id="identity" value={c.identity} onChange={(e) => set('identity', e.target.value)} className={field} />
        </Field>

        {c.role === 'gateway' && (
          <>
            <Field id="wan" title="WAN port" hint="Gets its address from your ISP via DHCP. All other ports become the LAN.">
              {portSelect('wan', c.wanPort, (v) => set('wanPort', v))}
            </Field>
            <Field id="lan" title="LAN address" hint="The router's own address, e.g. 192.168.88.1/24.">
              <input id="lan" value={c.lanCidr} onChange={(e) => set('lanCidr', e.target.value)} className={field + ' font-mono'} />
            </Field>
            <Field id="dns" title="DNS servers">
              <input id="dns" value={c.dnsServers} onChange={(e) => set('dnsServers', e.target.value)} className={field + ' font-mono'} />
            </Field>
          </>
        )}

        {c.role === 'isp-edge' && (
          <>
            <Field id="up" title="Upstream port">
              {portSelect('up', c.upstreamPort, (v) => set('upstreamPort', v))}
            </Field>
            <Field id="ulocal" title="Your side of the link" hint="Address and prefix, e.g. 203.0.113.2/30.">
              <input id="ulocal" value={c.upstreamLocal} onChange={(e) => set('upstreamLocal', e.target.value)} className={field + ' font-mono'} />
            </Field>
            <Field id="upeer" title="Upstream peer address">
              <input id="upeer" value={c.upstreamPeer} onChange={(e) => set('upstreamPeer', e.target.value)} className={field + ' font-mono'} />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field id="las" title="Your ASN">
                <input id="las" type="number" value={c.localAsn} onChange={(e) => set('localAsn', Number(e.target.value))} className={field + ' font-mono'} />
              </Field>
              <Field id="pas" title="Upstream ASN">
                <input id="pas" type="number" value={c.peerAsn} onChange={(e) => set('peerAsn', Number(e.target.value))} className={field + ' font-mono'} />
              </Field>
            </div>
            <Field id="bgpstyle" title="RouterOS version" hint="BGP syntax changed: 7.16 to 7.19 use a template, 7.20 and later use an instance.">
              <select id="bgpstyle" value={c.bgpStyle} onChange={(e) => set('bgpStyle', e.target.value as 'template' | 'instance')} className={field}>
                <option value="template">7.16 to 7.19 (BGP template)</option>
                <option value="instance">7.20 or later (BGP instance)</option>
              </select>
            </Field>
            <Field id="prefix" title="Prefix to announce" hint="Your allocation, /24 or shorter. Customers are numbered from it.">
              <input id="prefix" value={c.announcePrefix} onChange={(e) => set('announcePrefix', e.target.value)} className={field + ' font-mono'} />
            </Field>
            <Field id="mgmt" title="Management subnet" hint="Only this subnet may reach the router's services.">
              <input id="mgmt" value={c.mgmtCidr} onChange={(e) => set('mgmtCidr', e.target.value)} className={field + ' font-mono'} />
            </Field>
          </>
        )}

        {c.role === 'vlan-switch' && (
          <>
            <Field id="trunk" title="Trunk port" hint="Carries all VLANs tagged to your router or upstream switch.">
              {portSelect('trunk', c.trunkPort, (v) => set('trunkPort', v))}
            </Field>
            <div>
              <span className={label}>VLANs</span>
              <p className={help}>ID, name, untagged access ports.</p>
              <div className="mt-2 space-y-2">
                {c.vlans.map((v, i) => (
                  <VlanRow
                    key={rowKeys[i]}
                    v={v}
                    onChange={(nv) => set('vlans', c.vlans.map((x, j) => (j === i ? nv : x)))}
                    onRemove={() => {
                      setRowKeys((k) => k.filter((_, j) => j !== i));
                      set('vlans', c.vlans.filter((_, j) => j !== i));
                    }}
                  />
                ))}
              </div>
              <button
                type="button"
                onClick={() => {
                  setRowKeys((k) => [...k, nextKey.current++]);
                  set('vlans', [...c.vlans, { id: Math.max(0, ...c.vlans.map((v) => v.id)) + 10, name: 'new', ports: [] }]);
                }}
                className="mt-2 rounded-md border border-line px-3 py-1.5 text-sm hover:border-muted"
              >
                + Add VLAN
              </button>
            </div>
            <Field id="mvlan" title="Management VLAN ID">
              <input id="mvlan" type="number" value={c.mgmtVlanId} onChange={(e) => set('mgmtVlanId', Number(e.target.value))} className={field + ' font-mono'} />
            </Field>
            <Field id="maddr" title="Switch management address" hint="e.g. 10.99.0.2/24">
              <input id="maddr" value={c.mgmtCidr} onChange={(e) => set('mgmtCidr', e.target.value)} className={field + ' font-mono'} />
            </Field>
            <Field id="mgw" title="Management gateway (optional)">
              <input id="mgw" value={c.mgmtGateway} onChange={(e) => set('mgmtGateway', e.target.value)} placeholder="10.99.0.1" className={field + ' font-mono'} />
            </Field>
          </>
        )}
      </form>

      <section aria-labelledby="out" className="min-w-0 rounded-xl border border-line bg-surface">
        <div className="flex items-center justify-between gap-2 border-b border-line px-4 py-3">
          <h2 id="out" className="text-sm font-semibold">{c.identity || 'config'}.rsc</h2>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={copy}
              disabled={!rsc}
              className="rounded-md border border-line px-3 py-1.5 text-sm hover:border-muted disabled:opacity-40"
            >
              {copied ? 'Copied' : 'Copy'}
            </button>
            <button
              type="button"
              onClick={download}
              disabled={!rsc}
              className="rounded-md bg-accent px-3 py-1.5 text-sm font-medium text-accent-fg disabled:opacity-40"
            >
              Download .rsc
            </button>
          </div>
        </div>
        {errors.length > 0 ? (
          <ul role="alert" className="list-disc space-y-1 p-5 pl-9 text-sm text-red-600 dark:text-red-400">
            {errors.map((e) => <li key={e}>{e}</li>)}
          </ul>
        ) : (
          <pre className="max-h-[70vh] overflow-auto p-4 font-mono text-xs leading-relaxed" tabIndex={0}>
            <code>{rsc}</code>
          </pre>
        )}
        <p className="border-t border-line px-4 py-3 text-xs text-muted">
          Targets RouterOS v7. Import with <code className="font-mono">/import file-name={c.identity}.rsc</code>. Always
          test in a lab first and keep console access ready.
        </p>
      </section>
    </div>
  );
}
