/**
 * `/export`: prints the configuration the way RouterOS 7.16 does (captured from real CHR routers).
 * Sections come in a fixed order, properties are sorted alphabetically, default values are left out,
 * and lines wrap with a trailing backslash. `terse` prints one full command per line instead.
 */
import type { Device } from './device';

type Entry = Record<string, string | undefined>;
interface Section {
  path: string;
  /** "add" entries by default; `set` sections carry their own command text. */
  lines: { cmd: 'add' | 'set'; target?: string; props: Entry }[];
}

const BS = String.fromCharCode(92);

const quote = (v: string) => (/[\s"=;$\[\]()]/.test(v) || v === '' ? `"${v.replace(/["$\\]/g, (c) => BS + c)}"` : v);

const hex = (n: number) => `0x${n.toString(16)}`;

/** Sections in the order RouterOS prints them. Only what the simulator can configure. */
function sections(d: Device): Section[] {
  const out: Section[] = [];
  const add = (path: string, rows: Entry[]) => { if (rows.length) out.push({ path, lines: rows.map((props) => ({ cmd: 'add', props })) }); };
  const dis = (x: { disabled: boolean }) => (x.disabled ? 'yes' : undefined);

  add('/interface bridge', d.bridges.map((b) => ({
    name: b.name,
    comment: b.comment,
    'vlan-filtering': b.vlanFiltering ? 'yes' : undefined,
    'protocol-mode': b.protocolMode !== 'rstp' ? b.protocolMode : undefined,
    priority: b.priority !== 0x8000 ? hex(b.priority) : undefined,
  })));
  out.push({
    path: '/interface ethernet',
    lines: d.ifaces.filter((i) => i.type === 'ether').map((i) => ({
      cmd: 'set', target: `[ find default-name=${i.name} ]`,
      props: { 'disable-running-check': 'no', disabled: dis(i), comment: i.comment },
    })),
  });
  add('/interface wireguard', d.ifaces.filter((i) => i.type === 'wireguard').map((i) => ({ name: i.name, 'listen-port': i.wgListenPort, mtu: i.wgMtu, comment: i.comment, disabled: dis(i) })));
  add('/interface vlan', d.ifaces.filter((i) => i.type === 'vlan').map((i) => ({ name: i.name, interface: i.parent, 'vlan-id': String(i.vlanId), comment: i.comment, disabled: dis(i) })));
  add('/interface list', d.ifLists.map((l) => ({ name: l.name, comment: l.comment })));
  add('/ip pool', d.pools.map((p) => ({ name: p.name, ranges: p.ranges })));
  out.push({ path: '/port', lines: [{ cmd: 'set', target: '0', props: { name: 'serial0' } }] });
  add('/routing bgp template', d.bgp.templates.map((t) => ({ name: t.name, as: t.as !== 65530 ? String(t.as) : undefined, 'router-id': t.routerId, disabled: dis(t) })));
  add('/interface bridge port', d.bports.map((p) => ({
    bridge: p.bridge, interface: p.iface,
    pvid: p.pvid !== 1 ? String(p.pvid) : undefined,
    'frame-types': p.frameTypes !== 'admit-all' ? p.frameTypes : undefined,
    'bpdu-guard': p.bpduGuard ? 'yes' : undefined,
    edge: p.edge !== 'auto' ? p.edge : undefined,
    disabled: dis(p),
  })));
  add('/routing ospf instance', d.ospf.instances.map((i) => ({ name: i.name, 'router-id': i.routerId, version: i.version !== 2 ? String(i.version) : undefined, disabled: i.disabled ? 'yes' : 'no' })));
  add('/routing ospf area', d.ospf.areas.map((x) => ({ name: x.name, instance: x.instance, 'area-id': x.areaId !== '0.0.0.0' ? x.areaId : undefined, disabled: x.disabled ? 'yes' : 'no' })));
  out.push({ path: '/ip neighbor discovery-settings', lines: [{ cmd: 'set', props: { 'discover-interface-list': 'all' } }] });
  add('/interface list member', d.ifListMembers.map((m) => ({ interface: m.interface, list: m.list, disabled: dis(m) })));
  add('/interface bridge vlan', d.bvlans.map((v) => ({
    bridge: v.bridge, 'vlan-ids': v.vlanIds.join(','),
    tagged: v.tagged.length ? v.tagged.join(',') : undefined,
    untagged: v.untagged.length ? v.untagged.join(',') : undefined,
    comment: v.comment,
  })));
  add('/interface wireguard peers', d.wgPeers.map((p) => ({ interface: p.interface, name: p.name, 'public-key': p.publicKey, 'endpoint-address': p.endpointAddress, 'endpoint-port': p.endpointPort, 'allowed-address': p.allowedAddress, disabled: dis(p) })));
  add('/ip address', d.addrs.map((a) => {
    const [ip, len] = a.address.split('/');
    const o = ip.split('.').map(Number);
    const bits = Number(len);
    const mask = bits === 0 ? 0 : (0xffffffff << (32 - bits)) >>> 0;
    const net = (((o[0] << 24) | (o[1] << 16) | (o[2] << 8) | o[3]) & mask) >>> 0;
    const network = [net >>> 24, (net >>> 16) & 255, (net >>> 8) & 255, net & 255].join('.');
    return { address: a.address.endsWith('/32') ? ip : a.address, interface: a.iface, network, comment: a.comment, disabled: dis(a) };
  }));
  add('/ip dhcp-server', d.dhcpServers.map((s) => ({ name: s.name, interface: s.iface, 'address-pool': s.pool, 'lease-time': s.leaseTime !== '30m' ? s.leaseTime : undefined, disabled: dis(s) })));
  add('/ip dhcp-server network', d.dhcpNetworks.map((n) => ({ address: n.address, gateway: n.gateway, 'dns-server': n.dns })));
  if (d.dns.servers || d.dns.allowRemoteRequests) out.push({ path: '/ip dns', lines: [{ cmd: 'set', props: { servers: d.dns.servers, 'allow-remote-requests': d.dns.allowRemoteRequests ? 'yes' : undefined } }] });
  add('/ip firewall address-list', d.addressLists.filter((e) => !e.timeout).map((e) => ({ address: e.address, list: e.list, comment: e.comment, disabled: dis(e) })));
  add('/ip firewall filter', d.filter.map((r) => ({ ...r.props, action: r.action, chain: r.chain, comment: r.comment, disabled: dis(r) })));
  add('/ip firewall nat', d.natRules.map((r) => ({ ...r.props, action: r.action, chain: r.chain, comment: r.comment, disabled: dis(r) })));
  add('/ip route', d.routes.map((r) => ({
    'dst-address': r.dst, gateway: r.gateway, blackhole: r.blackhole ? '' : undefined,
    distance: r.distance !== 1 ? String(r.distance) : undefined, comment: r.comment, disabled: dis(r),
  })));
  const defaults: Record<string, boolean> = { 'www-ssl': true };
  const svc = Object.entries(d.services).filter(([n, s]) => s.disabled !== !!defaults[n]);
  if (svc.length) out.push({ path: '/ip service', lines: svc.map(([n, s]) => ({ cmd: 'set', target: n, props: { disabled: s.disabled ? 'yes' : 'no' } })) });
  add('/routing bgp connection', d.bgp.connections.map((c) => ({
    name: c.name, templates: c.templates, 'local.address': c.localAddress, 'local.role': c.localRole,
    'remote.address': c.remoteAddress, 'remote.as': String(c.remoteAs),
    'output.network': c.outputNetwork, 'output.filter-chain': c.outputFilterChain, 'input.filter': c.inputFilter,
    disabled: dis(c),
  })));
  add('/routing filter rule', d.bgp.filters.map((r) => ({ chain: r.chain, rule: r.text, comment: r.comment, disabled: dis(r) })));
  add('/routing ospf interface-template', d.ospf.templates.map((t) => ({
    area: t.area, networks: t.networks, cost: t.cost !== undefined && t.cost !== 1 ? String(t.cost) : undefined,
    type: t.type !== 'broadcast' ? t.type : undefined, passive: t.passive ? '' : undefined,
    priority: t.priority !== 128 ? String(t.priority) : undefined, 'use-bfd': t.useBfd ? 'yes' : undefined, disabled: t.disabled ? 'yes' : 'no',
  })));
  if (d.identity !== 'MikroTik') out.push({ path: '/system identity', lines: [{ cmd: 'set', props: { name: d.identity } }] });
  out.push({ path: '/system note', lines: [{ cmd: 'set', props: { 'show-at-login': 'no' } }] });
  return out;
}

const propTokens = (p: Entry): string[] => {
  const keys = Object.keys(p).filter((k) => p[k] !== undefined && (p[k] !== '' || k === 'blackhole' || k === 'passive')).sort();
  let prevPrefix: string | null = null;
  return keys.map((k) => {
    const dot = k.indexOf('.');
    const prefix = dot > 0 ? k.slice(0, dot) : null;
    const shown = prefix && prefix === prevPrefix ? k.slice(dot) : k;
    prevPrefix = prefix;
    return p[k] === '' ? shown : `${shown}=${quote(p[k]!)}`;
  });
};

/** Wrap like RouterOS: lines stay within 77 columns, or 78 when the break falls just after "name=". */
function wrap(head: string, tokens: string[]): string[] {
  const lines: string[] = [];
  let line = head;
  for (const tok of tokens) {
    if (line.length + 1 + tok.length <= 77) { line += ' ' + tok; continue; }
    const eq = tok.indexOf('=');
    if (eq > 0 && !tok.startsWith('"')) {
      const key = tok.slice(0, eq + 1);
      if (line.length + 1 + key.length + 1 <= 78) {
        lines.push(line + ' ' + key + BS);
        line = '    ' + tok.slice(eq + 1);
        continue;
      }
    }
    lines.push(line + ' ' + BS);
    line = '    ' + tok;
  }
  lines.push(line);
  return lines;
}

const pad = (n: number) => String(n).padStart(2, '0');
function stamp(): string {
  const t = new Date();
  return `${t.getFullYear()}-${pad(t.getMonth() + 1)}-${pad(t.getDate())} ${pad(t.getHours())}:${pad(t.getMinutes())}:${pad(t.getSeconds())}`;
}

/** `scope` is the menu the export was typed in ([] for the whole router). */
export function exportConfig(d: Device, scope: string[] = [], terse = false): string {
  const prefix = scope.length ? '/' + scope.join(' ') : '';
  const out: string[] = [`# ${stamp()} by RouterOS 7.16`, '# software id = ', '#'];
  for (const s of sections(d)) {
    if (prefix && s.path !== prefix && !s.path.startsWith(prefix + ' ')) continue;
    if (!terse) out.push(s.path);
    for (const l of s.lines) {
      const head = (terse ? s.path + ' ' : '') + l.cmd + (l.target ? ' ' + l.target : '');
      const toks = propTokens(l.props);
      if (terse) out.push([head, ...toks].join(' '));
      else out.push(...wrap(head, toks));
    }
  }
  return out.join('\n') + '\n';
}
