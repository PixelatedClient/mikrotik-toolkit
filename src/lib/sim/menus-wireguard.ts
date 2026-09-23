/**
 * /interface wireguard and /interface wireguard peers. Layouts, the default MTU (1420) and the peer fields were
 * captured from RouterOS 7.16 (tools/conformance/scenarios/wireguard.json). Connectivity itself needs no special
 * engine: once addressed, a wg interface works like any other (running() treats it as always "up"), which is exactly
 * what real RouterOS gives you once a peer's handshake is up. Key pairs are fake but stable per device.
 */
import { CliError, registerMenu, type Menu } from './cli';
import type { Iface } from './device';
import { renderBlocks, renderTable, renderTerse, type Row } from './table';

const YES_NO = ['yes', 'no'] as const;
const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

/** A stable, fake-looking base64 key so the same interface always shows the same "key pair". */
function fakeKey(seed: string): string {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) { h ^= seed.charCodeAt(i); h = Math.imul(h, 16777619); }
  let s = '';
  for (let i = 0; i < 43; i++) { h = Math.imul(h ^ (h >>> 15), 2246822519) >>> 0; s += B64[h % 64]; }
  return s + '=';
}

const wireguardMenu: Menu = {
  path: ['interface', 'wireguard'],
  fields: [{ name: 'name', kind: 'string' }, { name: 'listen-port', kind: 'int' }, { name: 'mtu', kind: 'int' }, { name: 'comment', kind: 'string' }, { name: 'disabled', kind: 'enum', values: YES_NO }],
  required: ['name'],
  entries: (d) => d.ifaces.filter((i) => i.type === 'wireguard').map((i, n) => ({
    index: n, flags: i.disabled ? 'X' : d.running(i.name) ? 'R' : '',
    props: {
      ...(i.comment ? { comment: i.comment } : {}), name: i.name, mtu: i.wgMtu ?? '1420', 'listen-port': i.wgListenPort ?? '13231',
      'private-key': i.wgPrivateKey ?? '', 'public-key': i.wgPublicKey ?? '', disabled: i.disabled ? 'yes' : 'no',
    },
    ref: i,
  })),
  add(d, a) {
    if (d.iface(a.name)) throw new CliError('failure: already have interface with such name');
    const iface: Iface = {
      name: a.name, mac: '00:00:00:00:00:00', disabled: a.disabled === 'yes', type: 'wireguard', comment: a.comment,
      wgListenPort: a['listen-port'] ?? '13231', wgMtu: a.mtu ?? '1420', wgPrivateKey: fakeKey(`${d.id}/${a.name}/priv`), wgPublicKey: fakeKey(`${d.id}/${a.name}/pub`),
    };
    d.ifaces.push(iface);
  },
  remove(d, e) {
    const i = e.ref as Iface;
    d.wgPeers = d.wgPeers.filter((p) => p.interface !== i.name);
    d.addrs = d.addrs.filter((a) => a.iface !== i.name);
    d.ifaces = d.ifaces.filter((x) => x !== i);
  },
  toggle(_d, e, off) { (e.ref as Iface).disabled = off; },
  set(_d, e, a) {
    const i = e.ref as Iface;
    if (a['listen-port']) i.wgListenPort = a['listen-port'];
    if (a.mtu) i.wgMtu = a.mtu;
    if ('comment' in a) i.comment = a.comment || undefined;
    if (a.disabled) i.disabled = a.disabled === 'yes';
  },
  render(_d, rows, mode) {
    if (mode === 'terse') return renderTerse(rows.map((e) => ({ index: e.index, flags: e.flags, props: Object.entries(e.props).filter(([k]) => k !== 'disabled') as [string, string][] })));
    // even a plain `print` uses the block layout for this menu, same as detail (captured from RouterOS 7.16)
    return renderBlocks('Flags: X - disabled; R - running' + (rows.length ? ' ' : ''), rows.map((e) => ({
      index: e.index, flags: e.flags,
      props: Object.entries(e.props).filter(([k]) => !['comment', 'disabled'].includes(k)).map(([k, v]) => [k, ['name', 'private-key', 'public-key'].includes(k) ? `"${v}"` : v] as [string, string]),
    })), 1);
  },
  emptyLegend: 'Flags: X - disabled; R - running',
};

let peerCounter = 0;

const peerMenu: Menu = {
  path: ['interface', 'wireguard', 'peers'],
  fields: [
    { name: 'interface', kind: 'iface' }, { name: 'public-key', kind: 'string' }, { name: 'endpoint-address', kind: 'string' },
    { name: 'endpoint-port', kind: 'int' }, { name: 'allowed-address', kind: 'string' }, { name: 'comment', kind: 'string' }, { name: 'disabled', kind: 'enum', values: YES_NO },
  ],
  required: ['interface', 'public-key'],
  entries: (d) => d.wgPeers.map((p, n) => ({
    index: n, flags: p.disabled ? 'X' : 'D',
    props: {
      interface: p.interface, name: p.name, 'public-key': p.publicKey, 'private-key': '',
      'endpoint-address': p.endpointAddress ?? '', 'endpoint-port': p.endpointPort ?? '', 'current-endpoint-address': p.endpointAddress ?? '', 'current-endpoint-port': p.endpointPort ?? '',
      'allowed-address': p.allowedAddress, 'preshared-key': '', 'client-endpoint': '', rx: '0', tx: '0',
    },
    ref: p,
  })),
  add(d, a) {
    if (!d.iface(a.interface) || d.iface(a.interface)?.type !== 'wireguard') throw new CliError('input does not match any value of interface');
    peerCounter++;
    d.wgPeers.push({
      interface: a.interface, name: `peer${peerCounter}`, publicKey: a['public-key'], endpointAddress: a['endpoint-address'], endpointPort: a['endpoint-port'],
      allowedAddress: a['allowed-address'] ?? '0.0.0.0/0', disabled: a.disabled === 'yes',
    });
  },
  remove(d, e) { d.wgPeers = d.wgPeers.filter((p) => p !== e.ref); },
  toggle(_d, e, off) { (e.ref as { disabled: boolean }).disabled = off; },
  set(_d, e, a) {
    const p = e.ref as { interface: string; publicKey: string; endpointAddress?: string; endpointPort?: string; allowedAddress: string; disabled: boolean };
    if (a['public-key']) p.publicKey = a['public-key'];
    if (a['endpoint-address']) p.endpointAddress = a['endpoint-address'];
    if (a['endpoint-port']) p.endpointPort = a['endpoint-port'];
    if (a['allowed-address']) p.allowedAddress = a['allowed-address'];
    if (a.disabled) p.disabled = a.disabled === 'yes';
  },
  render(_d, rows, mode) {
    if (mode === 'terse') return renderTerse(rows.map((e) => ({ index: e.index, flags: e.flags, props: [['interface', e.props.interface], ['public-key', e.props['public-key']], ['endpoint-address', e.props['endpoint-address']], ['endpoint-port', e.props['endpoint-port']]] as [string, string][] })));
    // the flat print (not detail) shows no Flags legend and no per-row flag letter, even for a dynamic peer (captured behaviour)
    const t: Row[] = rows.map((e) => ({ index: e.index, flags: '', cells: [e.props.interface, e.props['public-key'], e.props['endpoint-address'], e.props['endpoint-port']] }));
    return renderTable([{ title: 'INTERFACE' }, { title: 'PUBLIC-KEY' }, { title: 'ENDPOINT-ADDRESS' }, { title: 'ENDPOINT-PORT', align: 'right' }], t, []);
  },
  emptyLegend: '',
  detail: {
    legend: 'Flags: X - disabled; D - dynamic',
    flagW: 1,
    quote: ['name', 'public-key', 'private-key', 'preshared-key', 'client-endpoint'],
    props: (e) => [
      ['interface', e.props.interface], ['name', e.props.name], ['public-key', e.props['public-key']], ['private-key', e.props['private-key']],
      ...(e.props['endpoint-address'] ? ([['endpoint-address', e.props['endpoint-address']], ['endpoint-port', e.props['endpoint-port']]] as [string, string][]) : []),
      ...(e.props['current-endpoint-address'] ? ([['current-endpoint-address', e.props['current-endpoint-address']], ['current-endpoint-port', e.props['current-endpoint-port']]] as [string, string][]) : []),
      ['allowed-address', e.props['allowed-address']], ['preshared-key', e.props['preshared-key']], ['client-endpoint', e.props['client-endpoint']],
      ['rx', e.props.rx], ['tx', e.props.tx],
    ],
  },
};

for (const m of [wireguardMenu, peerMenu]) registerMenu(m);
