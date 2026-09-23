/**
 * Switching and addressing menus: /interface (with bridge and vlan types), /interface bridge (+ port, vlan, host, monitor),
 * /interface vlan, /ip pool and /ip dhcp-server (+ network, lease).
 * Layouts and error texts follow output captured from RouterOS 7.16.
 */
import { CliError, abbrev, registerMenu, type Args, type Entry, type FieldDef, type Menu } from './cli';
import type { Bridge, BridgePort, BridgeVlan, Device, FrameTypes } from './device';
import { computeNetworkStp, localHosts } from './l2';
import { formatIPv4, parseCidr, parseIPv4 } from './ip';
import { renderBlocks, renderTable, renderTerse, type FlagDef, type Row } from './table';

const YES_NO = ['yes', 'no'] as const;

const IFACE_FLAGS: FlagDef[] = [
  { letter: 'X', name: 'DISABLED', group: 0 },
  { letter: 'R', name: 'RUNNING', group: 0 },
  { letter: 'S', name: 'SLAVE', group: 1 },
];

// ---------- helpers ----------

const hexPriority = (n: number) => `0x${n.toString(16)}`;

function parsePriority(v: string): number {
  const n = /^0x[0-9a-f]+$/i.test(v) ? parseInt(v, 16) : /^\d+$/.test(v) ? Number(v) : NaN;
  if (Number.isNaN(n) || n < 0 || n > 61440 || n % 4096 !== 0) throw new CliError('invalid value for argument priority');
  return n;
}

/** "10", "10,20", "100-110" -> [10, 20, ...]. Real RouterOS rejects anything outside 1..4094. */
function parseVlanIds(v: string): number[] {
  const out: number[] = [];
  for (const part of v.split(',')) {
    const m = /^(\d+)(?:-(\d+))?$/.exec(part.trim());
    if (!m) throw new CliError('invalid value for argument vlan-ids');
    const a = Number(m[1]);
    const b = m[2] === undefined ? a : Number(m[2]);
    if (a < 1 || b > 4094 || a > b) throw new CliError('value of vlan-range out of range (1..4094)');
    for (let i = a; i <= b; i++) out.push(i);
  }
  return [...new Set(out)].sort((x, y) => x - y);
}

/** 10,11,12,20 -> "10-12,20" */
function idText(ids: number[]): string {
  const parts: string[] = [];
  for (let i = 0; i < ids.length; ) {
    let j = i;
    while (ids[j + 1] === ids[j] + 1) j++;
    parts.push(j > i ? `${ids[i]}-${ids[j]}` : String(ids[i]));
    i = j + 1;
  }
  return parts.join(',');
}

function ifaceList(d: Device, v: string, field: string): string[] {
  const names = v === '' ? [] : v.split(',').map((s) => s.trim());
  for (const n of names) if (!d.iface(n)) throw new CliError(`input does not match any value of ${field}`);
  return names;
}

const findBridge = (d: Device, name: string): Bridge => {
  const b = d.bridge(name);
  if (!b) throw new CliError('input does not match any value of bridge');
  return b;
};

// ---------- /interface ----------

const interfaceMenu: Menu = {
  path: ['interface'],
  entries(d) {
    return d.ifaces.map((i, n) => ({
      index: n,
      flags: `${i.disabled ? 'X' : d.running(i.name) ? 'R' : ''}${d.isSlave(i.name) ? 'S' : ''}`,
      props: {
        ...(i.comment ? { comment: i.comment } : {}),
        name: i.name,
        ...(i.type === 'ether' || i.type === 'loopback' ? { 'default-name': i.name } : {}),
        type: i.type,
        mtu: i.type === 'bridge' ? 'auto' : i.type === 'loopback' ? '65536' : '1500',
        'actual-mtu': i.type === 'loopback' ? '65536' : '1500',
        ...(i.type === 'bridge' ? { l2mtu: '65535' } : i.type === 'vlan' ? { l2mtu: '65531' } : {}),
        'mac-address': d.macOf(i.name),
        'link-downs': '0',
        disabled: i.disabled ? 'yes' : 'no',
      },
      ref: i,
    }));
  },
  toggle(_d, e, off) { (e.ref as { disabled: boolean }).disabled = off; },
  render(_d, rows, mode) {
    if (mode === 'terse') return renderTerse(rows.map((e) => ({ index: e.index, flags: e.flags, props: Object.entries(e.props).filter(([k]) => k !== 'disabled') as [string, string][] })));
    const withL2 = rows.some((e) => e.props.l2mtu);
    const cols = [{ title: 'NAME' }, { title: 'TYPE' }, { title: 'ACTUAL-MTU', align: 'right' as const }, ...(withL2 ? [{ title: 'L2MTU', align: 'right' as const }] : []), { title: 'MAC-ADDRESS' }];
    const t: Row[] = rows.map((e) => ({ index: e.index, flags: e.flags, comment: e.props.comment, cells: [e.props.name, e.props.type, e.props['actual-mtu'], ...(withL2 ? [e.props.l2mtu ?? ''] : []), e.props['mac-address']] }));
    return renderTable(cols, t, IFACE_FLAGS);
  },
};

// ---------- /interface bridge ----------

function bridgeEntries(d: Device): Entry[] {
  return d.bridges.map((b, i) => ({
    index: i,
    flags: `R`,
    props: {
      ...(b.comment ? { comment: b.comment } : {}),
      name: b.name,
      mtu: 'auto',
      'actual-mtu': '1500',
      l2mtu: '65535',
      arp: 'enabled',
      'arp-timeout': 'auto',
      'mac-address': d.macOf(b.name),
      'protocol-mode': b.protocolMode,
      'fast-forward': 'yes',
      'igmp-snooping': 'no',
      'auto-mac': 'yes',
      'ageing-time': '5m',
      priority: hexPriority(b.priority),
      'max-message-age': '20s',
      'forward-delay': '15s',
      'transmit-hold-count': '6',
      'vlan-filtering': b.vlanFiltering ? 'yes' : 'no',
      ...(b.vlanFiltering ? { 'ether-type': '0x8100', pvid: String(b.pvid), 'frame-types': 'admit-all', 'ingress-filtering': 'yes' } : {}),
      'dhcp-snooping': 'no',
      'port-cost-mode': 'long',
      mvrp: 'no',
      'max-learned-entries': 'auto',
    },
    ref: b,
  }));
}

const bridgeFields: FieldDef[] = [
  { name: 'name', kind: 'string' },
  { name: 'protocol-mode', kind: 'enum', values: ['rstp', 'stp', 'none'] },
  { name: 'priority', kind: 'string' },
  { name: 'vlan-filtering', kind: 'enum', values: YES_NO },
  { name: 'comment', kind: 'string' },
];

const bridgeMenu: Menu = {
  path: ['interface', 'bridge'],
  fields: bridgeFields,
  required: ['name'],
  entries: bridgeEntries,
  add(d, a) {
    if (d.iface(a.name)) throw new CliError('failure: already have interface with such name');
    const prio = a.priority !== undefined ? parsePriority(a.priority) : 0x8000;
    d.bridges.push({ name: a.name, protocolMode: (a['protocol-mode'] as Bridge['protocolMode']) ?? 'rstp', priority: prio, vlanFiltering: a['vlan-filtering'] === 'yes', pvid: 1, comment: a.comment });
    d.ifaces.push({ name: a.name, mac: `DA:75:10:88:${(0x40 + d.index).toString(16).toUpperCase()}:${(0x5b + d.bridges.length).toString(16).toUpperCase().padStart(2, '0')}`, disabled: false, type: 'bridge', comment: a.comment });
  },
  remove(d, e) {
    const b = e.ref as Bridge;
    d.bports = d.bports.filter((p) => p.bridge !== b.name);
    d.bvlans = d.bvlans.filter((v) => v.bridge !== b.name);
    const gone = new Set([b.name, ...d.ifaces.filter((i) => i.type === 'vlan' && i.parent === b.name).map((i) => i.name)]);
    d.addrs = d.addrs.filter((a) => !gone.has(a.iface));
    d.ifaces = d.ifaces.filter((i) => !gone.has(i.name));
    d.bridges = d.bridges.filter((x) => x !== b);
  },
  set(d, e, a) {
    const b = e.ref as Bridge;
    if (a['protocol-mode']) b.protocolMode = a['protocol-mode'] as Bridge['protocolMode'];
    if (a.priority !== undefined) b.priority = parsePriority(a.priority);
    if (a['vlan-filtering']) b.vlanFiltering = a['vlan-filtering'] === 'yes';
    if ('comment' in a) { b.comment = a.comment || undefined; const i = d.iface(b.name); if (i) i.comment = b.comment; }
  },
  render(_d, rows, mode) {
    if (mode === 'terse') return renderTerse(rows.map((e) => ({ index: e.index, flags: e.flags, props: Object.entries(e.props) as [string, string][] })));
    return renderBlocks(`Flags: X - disabled, R - running${rows.length ? ' ' : ''}`, rows.map((e) => ({ index: e.index ?? 0, flags: e.flags, comment: e.props.comment, props: Object.entries(e.props).filter(([k]) => k !== 'comment').map(([k, v]) => [k, k === 'name' ? `"${v}"` : v] as [string, string]) })), 1);
  },
  extra: {
    monitor(d, a) {
      const sel = a.bare[0]?.text;
      const b = (sel ? d.bridges.find((x) => x.name === sel) ?? d.bridges[Number(sel)] : d.bridges[0]) as Bridge | undefined;
      if (!b) throw new CliError('no such item');
      const st = computeNetworkStp(d.net!).bridge(d, b.name);
      const lines: [string, string][] = [
        ['state', 'enabled'],
        ['current-mac-address', d.macOf(b.name)],
        ['root-bridge', st.rootBridge ? 'yes' : 'no'],
        ['root-bridge-id', st.rootId],
        ['root-path-cost', String(st.rootCost)],
        ['root-port', st.rootPort ?? 'none'],
        ['port-count', String(st.ports)],
        ['designated-port-count', String(st.designated)],
        ['fast-forward', 'no'],
      ];
      return [...(b.comment ? [`${' '.repeat(21)};;; ${b.comment}`] : []), ...lines.map(([k, v]) => `${k.padStart(23)}: ${v}`)].join('\n');
    },
  },
};

// ---------- /interface bridge port ----------

const FRAME_TYPES: readonly FrameTypes[] = ['admit-all', 'admit-only-vlan-tagged', 'admit-only-untagged-and-priority-tagged'];

function portEntries(d: Device): Entry[] {
  return d.bports.map((p, i) => ({
    index: i,
    flags: p.disabled ? 'X' : d.running(p.iface) ? '' : 'I',
    props: {
      ...(p.comment ? { comment: p.comment } : {}),
      interface: p.iface,
      bridge: p.bridge,
      priority: '0x80',
      edge: p.edge,
      'point-to-point': 'auto',
      learn: 'auto',
      horizon: 'none',
      hw: 'yes',
      'auto-isolate': 'no',
      'restricted-role': 'no',
      'restricted-tcn': 'no',
      pvid: String(p.pvid),
      'frame-types': p.frameTypes,
      'ingress-filtering': p.ingressFiltering ? 'yes' : 'no',
      'unknown-unicast-flood': 'yes',
      'unknown-multicast-flood': 'yes',
      'broadcast-flood': 'yes',
      'tag-stacking': 'no',
      'bpdu-guard': p.bpduGuard ? 'yes' : 'no',
      trusted: 'no',
      'mvrp-registrar-state': 'normal',
      'mvrp-applicant-state': 'normal-participant',
      'multicast-router': 'temporary-query',
      'fast-leave': 'no',
      disabled: p.disabled ? 'yes' : 'no',
    },
    ref: p,
  }));
}

const portMenu: Menu = {
  path: ['interface', 'bridge', 'port'],
  fields: [
    { name: 'bridge', kind: 'string' },
    { name: 'interface', kind: 'string' },
    { name: 'pvid', kind: 'int' },
    { name: 'frame-types', kind: 'enum', values: FRAME_TYPES },
    { name: 'ingress-filtering', kind: 'enum', values: YES_NO },
    { name: 'edge', kind: 'enum', values: ['auto', 'yes', 'no'] },
    { name: 'bpdu-guard', kind: 'enum', values: YES_NO },
    { name: 'comment', kind: 'string' },
    { name: 'disabled', kind: 'enum', values: YES_NO },
  ],
  required: ['bridge', 'interface'],
  entries: portEntries,
  add(d, a) {
    findBridge(d, a.bridge);
    const i = d.iface(a.interface);
    if (!i || i.type === 'bridge' || i.type === 'loopback') throw new CliError('invalid value for argument interface:\n    input does not match any value of interface\n    input does not match any value of interface-list');
    if (d.bridgePort(a.interface)) throw new CliError('failure: device already added as bridge port');
    const pvid = a.pvid !== undefined ? Number(a.pvid) : 1;
    if (pvid < 1 || pvid > 4094) throw new CliError('value of pvid out of range (1..4094)');
    d.bports.push({ bridge: a.bridge, iface: a.interface, pvid, frameTypes: (a['frame-types'] as FrameTypes) ?? 'admit-all', ingressFiltering: a['ingress-filtering'] !== 'no', edge: (a.edge as BridgePort['edge']) ?? 'auto', bpduGuard: a['bpdu-guard'] === 'yes', disabled: a.disabled === 'yes', comment: a.comment });
  },
  remove(d, e) { d.bports = d.bports.filter((p) => p !== e.ref); },
  toggle(_d, e, off) { (e.ref as BridgePort).disabled = off; },
  set(_d, e, a) {
    const p = e.ref as BridgePort;
    if (a.pvid !== undefined) { const n = Number(a.pvid); if (n < 1 || n > 4094) throw new CliError('value of pvid out of range (1..4094)'); p.pvid = n; }
    if (a['frame-types']) p.frameTypes = a['frame-types'] as FrameTypes;
    if (a['ingress-filtering']) p.ingressFiltering = a['ingress-filtering'] === 'yes';
    if (a.edge) p.edge = a.edge as BridgePort['edge'];
    if (a['bpdu-guard']) p.bpduGuard = a['bpdu-guard'] === 'yes';
    if ('comment' in a) p.comment = a.comment || undefined;
    if (a.disabled) p.disabled = a.disabled === 'yes';
  },
  render(_d, rows, mode) {
    if (mode === 'terse') return renderTerse(rows.map((e) => ({ index: e.index, flags: e.flags, props: Object.entries(e.props).filter(([k]) => k !== 'disabled') as [string, string][] })));
    const t: Row[] = rows.map((e) => ({ index: e.index, flags: e.flags, comment: e.props.comment, cells: [e.props.interface, e.props.bridge, e.props.hw, e.props.pvid, e.props.priority, e.props.horizon] }));
    return renderTable([{ title: 'INTERFACE' }, { title: 'BRIDGE' }, { title: 'HW' }, { title: 'PVID', align: 'right' }, { title: 'PRIORITY' }, { title: 'HORIZON' }], t, [{ letter: 'X', name: 'DISABLED', group: 0 }, { letter: 'I', name: 'INACTIVE', group: 0 }, { letter: 'D', name: 'DYNAMIC', group: 0 }]);
  },
  extra: {
    monitor(d, a) {
      const all = d.bports;
      const sel = a.bare.find((t) => t.text.startsWith('['))?.text;
      let ports = all;
      if (!sel) {
        const named = a.bare.filter((t) => t.text !== 'once').map((t) => t.text);
        if (named.length) ports = all.filter((p, i) => named.includes(p.iface) || named.includes(String(i)));
      }
      if (!ports.length) throw new CliError('no such item');
      const stp = computeNetworkStp(d.net!);
      const rows: [string, string[]][] = [
        ['interface', []], ['status', []], ['port-number', []], ['role', []], ['edge-port', []], ['edge-port-discovery', []], ['point-to-point-port', []],
        ['external-fdb', []], ['sending-rstp', []], ['learning', []], ['forwarding', []], ['actual-path-cost', []],
      ];
      const put = (k: string, v: string) => rows.find(([n]) => n === k)![1].push(v);
      for (const p of ports) {
        const s = stp.port(d, p.bridge, p.iface);
        const up = d.running(p.iface) && !p.disabled;
        put('interface', p.iface);
        put('status', up ? 'in-bridge' : 'inactive');
        put('port-number', up ? String(d.portNumber(p)) : '');
        put('role', up ? `${s.role === 'disabled' ? 'disabled' : s.role}-port` : '');
        const edge = p.edge === 'yes' || (p.edge === 'auto' && !s.linked);
        put('edge-port', up ? (edge ? 'yes' : 'no') : '');
        put('edge-port-discovery', up ? (p.edge === 'auto' ? 'yes' : 'no') : '');
        put('point-to-point-port', up ? 'yes' : '');
        put('external-fdb', up ? 'no' : '');
        put('sending-rstp', up ? (p.edge === 'yes' ? 'yes' : 'yes') : '');
        put('learning', up ? (s.forwarding ? 'yes' : 'no') : '');
        put('forwarding', up ? (s.forwarding ? 'yes' : 'no') : '');
        put('actual-path-cost', up ? String(s.cost) : '');
      }
      const widths = ports.map((_, i) => Math.max(...rows.map(([, v]) => v[i].length)) + 1);
      return rows.map(([k, v]) => `${k.padStart(23)}: ${v.map((x, i) => x.padEnd(widths[i])).join('')}`.replace(/\s+$/, '')).join('\n');
    },
  },
};

// ---------- /interface bridge vlan ----------

interface VlanRow { bridge: string; ids: number[]; tagged: string[]; untagged: string[]; comment?: string; dynamic: boolean; ref: BridgeVlan | null }

function vlanRows(d: Device): VlanRow[] {
  const rows: VlanRow[] = d.bvlans.map((v) => ({ bridge: v.bridge, ids: v.vlanIds, tagged: v.tagged, untagged: v.untagged, comment: v.comment, dynamic: false, ref: v }));
  for (const b of d.bridges) {
    if (!b.vlanFiltering) continue;
    const dyn = new Map<number, string[]>();
    const explicitUntagged = (id: number, name: string) => d.bvlans.some((v) => v.bridge === b.name && v.vlanIds.includes(id) && (v.untagged.includes(name) || v.tagged.includes(name)));
    for (const p of d.bports.filter((x) => x.bridge === b.name)) if (!explicitUntagged(p.pvid, p.iface)) dyn.set(p.pvid, [...(dyn.get(p.pvid) ?? []), p.iface]);
    if (!explicitUntagged(b.pvid, b.name)) dyn.set(b.pvid, [...(dyn.get(b.pvid) ?? []), b.name]);
    for (const [id, names] of [...dyn.entries()].sort((x, y) => x[0] - y[0])) rows.push({ bridge: b.name, ids: [id], tagged: [], untagged: names, comment: 'added by pvid', dynamic: true, ref: null });
  }
  return rows;
}

const vlanTableMenu: Menu = {
  path: ['interface', 'bridge', 'vlan'],
  skipDynamic: true,
  fields: [
    { name: 'bridge', kind: 'string' },
    { name: 'vlan-ids', kind: 'string' },
    { name: 'tagged', kind: 'string' },
    { name: 'untagged', kind: 'string' },
    { name: 'comment', kind: 'string' },
  ],
  required: ['bridge', 'vlan-ids'],
  entries(d) {
    return vlanRows(d).map((r, i) => ({
      index: i,
      flags: r.dynamic ? 'D' : '',
      props: {
        ...(r.comment ? { comment: r.comment } : {}),
        bridge: r.bridge,
        'vlan-ids': idText(r.ids),
        tagged: r.tagged.join(','),
        untagged: r.untagged.join(','),
        dynamic: r.dynamic ? 'yes' : 'no',
        'mvrp-forbidden': '',
        'current-tagged': d.bridge(r.bridge)?.vlanFiltering ? r.tagged.join(',') : '',
        'current-untagged': d.bridge(r.bridge)?.vlanFiltering ? r.untagged.join(',') : '',
      },
      ref: r.ref,
    }));
  },
  add(d, a) {
    findBridge(d, a.bridge);
    const ids = parseVlanIds(a['vlan-ids']);
    const tagged = ifaceList(d, a.tagged ?? '', 'tagged');
    const untagged = ifaceList(d, a.untagged ?? '', 'untagged');
    if (tagged.some((n) => untagged.includes(n))) throw new CliError('failure: interface cannot be in tagged and untagged at the same time');
    d.bvlans.push({ bridge: a.bridge, vlanIds: ids, tagged, untagged, comment: a.comment });
  },
  remove(d, e) {
    d.bvlans = d.bvlans.filter((v) => v !== e.ref);
  },
  set(d, e, a) {
    const v = e.ref as BridgeVlan;
    const tagged = a.tagged !== undefined ? ifaceList(d, a.tagged, 'tagged') : v.tagged;
    const untagged = a.untagged !== undefined ? ifaceList(d, a.untagged, 'untagged') : v.untagged;
    if (tagged.some((n) => untagged.includes(n))) throw new CliError('failure: interface cannot be in tagged and untagged at the same time');
    if (a['vlan-ids'] !== undefined) v.vlanIds = parseVlanIds(a['vlan-ids']);
    v.tagged = tagged;
    v.untagged = untagged;
    if ('comment' in a) v.comment = a.comment || undefined;
  },
  render(_d, rows, mode) {
    if (mode === 'terse') return renderTerse(rows.map((e) => ({ index: e.index, flags: e.flags, props: Object.entries(e.props).filter(([k]) => k !== 'dynamic') as [string, string][] })));
    const showTagged = rows.some((e) => e.props['current-tagged']);
    const showUntagged = rows.some((e) => e.props['current-untagged']);
    const cols = [{ title: 'BRIDGE' }, { title: 'VLAN-IDS', align: 'right' as const }, ...(showTagged ? [{ title: 'CURRENT-TAGGED' }] : []), ...(showUntagged ? [{ title: 'CURRENT-UNTAGGED' }] : [])];
    const t: Row[] = rows.map((e) => ({
      index: e.index,
      flags: e.flags,
      comment: e.props.comment,
      cells: [e.props.bridge, e.props['vlan-ids'], ...(showTagged ? [e.props['current-tagged'].split(',').join('\n')] : []), ...(showUntagged ? [e.props['current-untagged'].split(',').join('\n')] : [])],
    }));
    return renderTable(cols, t, [{ letter: 'D', name: 'DYNAMIC', group: 0 }]);
  },
};

// ---------- /interface bridge host ----------

const hostMenu: Menu = {
  path: ['interface', 'bridge', 'host'],
  entries(d) {
    const rows: Entry[] = [];
    for (const b of d.bridges) {
      for (const h of localHosts(d, b)) rows.push({ index: rows.length, flags: 'DL', props: { 'mac-address': h.mac, ...(h.vid === null ? {} : { vid: String(h.vid) }), interface: h.port, bridge: b.name, 'on-interface': h.port }, ref: h });
      for (const h of d.hosts.filter((x) => x.bridge === b.name)) rows.push({ index: rows.length, flags: 'D', props: { 'mac-address': h.mac, ...(h.vid === null ? {} : { vid: String(h.vid) }), interface: h.port, bridge: b.name, 'on-interface': h.port }, ref: h });
    }
    return rows;
  },
  render(_d, rows, mode) {
    if (mode === 'terse') return renderTerse(rows.map((e) => ({ index: e.index, flags: e.flags, props: Object.entries(e.props) as [string, string][] })));
    const t: Row[] = rows.map((e) => ({ index: e.index, flags: e.flags, cells: [e.props['mac-address'], e.props.vid ?? '', e.props['on-interface'], e.props.bridge] }));
    return renderTable([{ title: 'MAC-ADDRESS' }, { title: 'VID', align: 'right' }, { title: 'ON-INTERFACE' }, { title: 'BRIDGE' }], t, [{ letter: 'D', name: 'DYNAMIC', group: 0 }, { letter: 'L', name: 'LOCAL', group: 1 }]);
  },
};

// ---------- /interface vlan ----------

const vlanIfaceMenu: Menu = {
  path: ['interface', 'vlan'],
  fields: [
    { name: 'name', kind: 'string' },
    { name: 'vlan-id', kind: 'int' },
    { name: 'interface', kind: 'string' },
    { name: 'comment', kind: 'string' },
    { name: 'disabled', kind: 'enum', values: YES_NO },
  ],
  required: ['name', 'vlan-id', 'interface'],
  entries(d) {
    return d.ifaces.filter((i) => i.type === 'vlan').map((i, n) => ({
      index: n,
      flags: i.disabled ? 'X' : d.running(i.name) ? 'R' : '',
      props: {
        ...(i.comment ? { comment: i.comment } : {}),
        name: i.name, mtu: '1500', l2mtu: '65531', 'mac-address': d.macOf(i.name), arp: 'enabled', 'arp-timeout': 'auto',
        'loop-protect': 'default', 'loop-protect-status': 'off', 'loop-protect-send-interval': '5s', 'loop-protect-disable-time': '5m',
        'vlan-id': String(i.vlanId), interface: i.parent ?? '', 'use-service-tag': 'no', mvrp: 'no', disabled: i.disabled ? 'yes' : 'no',
      },
      ref: i,
    }));
  },
  add(d, a) {
    const id = Number(a['vlan-id']);
    if (id < 1 || id > 4094) throw new CliError('value of vlan-id out of range (1..4094)');
    const parent = d.iface(a.interface);
    if (!parent || parent.type === 'loopback' || parent.type === 'vlan') throw new CliError('input does not match any value of interface');
    if (d.iface(a.name)) throw new CliError('failure: already have interface with such name');
    d.ifaces.push({ name: a.name, mac: parent.mac, disabled: a.disabled === 'yes', type: 'vlan', vlanId: id, parent: a.interface, comment: a.comment });
  },
  remove(d, e) {
    const i = e.ref as { name: string };
    d.addrs = d.addrs.filter((a) => a.iface !== i.name);
    d.ifaces = d.ifaces.filter((x) => x !== e.ref);
  },
  toggle(_d, e, off) { (e.ref as { disabled: boolean }).disabled = off; },
  set(d, e, a) {
    const i = e.ref as { name: string; vlanId?: number; comment?: string };
    if (a['vlan-id']) i.vlanId = Number(a['vlan-id']);
    if ('comment' in a) i.comment = a.comment || undefined;
    void d;
  },
  render(_d, rows, mode) {
    if (mode === 'terse') return renderTerse(rows.map((e) => ({ index: e.index, flags: e.flags, props: Object.entries(e.props).filter(([k]) => k !== 'disabled') as [string, string][] })));
    const t: Row[] = rows.map((e) => ({ index: e.index, flags: e.flags, comment: e.props.comment, cells: [e.props.name, e.props.mtu, e.props.arp, e.props['vlan-id'], e.props.interface] }));
    return renderTable([{ title: 'NAME' }, { title: 'MTU', align: 'right' }, { title: 'ARP' }, { title: 'VLAN-ID', align: 'right' }, { title: 'INTERFACE' }], t, [{ letter: 'R', name: 'RUNNING', group: 0 }, { letter: 'X', name: 'DISABLED', group: 0 }]);
  },
  detail: {
    legend: 'Flags: X - disabled, R - running',
    flagW: 1,
    quote: ['name'],
    props: (e) => [
      ['name', e.props.name],
      ['mtu', e.props.mtu],
      ['l2mtu', e.props.l2mtu],
      ['mac-address', e.props['mac-address']],
      ['arp', e.props.arp],
      ['arp-timeout', e.props['arp-timeout']],
      ['loop-protect', e.props['loop-protect']],
      ['loop-protect-status', e.props['loop-protect-status']],
      ['loop-protect-send-interval', e.props['loop-protect-send-interval']],
      ['loop-protect-disable-time', e.props['loop-protect-disable-time']],
      ['vlan-id', e.props['vlan-id']],
      ['interface', e.props.interface],
      ['use-service-tag', e.props['use-service-tag']],
      ['mvrp', e.props.mvrp],
    ],
  },
};

// ---------- DHCP ----------

const poolMenu: Menu = {
  path: ['ip', 'pool'],
  fields: [{ name: 'name', kind: 'string' }, { name: 'ranges', kind: 'string' }],
  required: ['name', 'ranges'],
  entries: (d) => d.pools.map((p, i) => ({ index: i, flags: '', props: { name: p.name, ranges: p.ranges }, ref: p })),
  add(d, a) {
    if (d.pools.some((p) => p.name === a.name)) throw new CliError('failure: pool with such name exists');
    for (const r of a.ranges.split(',')) {
      const [lo, hi] = r.trim().split('-');
      if (parseIPv4(lo) === null || (hi !== undefined && parseIPv4(hi) === null)) throw new CliError('invalid value for argument ranges');
    }
    d.pools.push({ name: a.name, ranges: a.ranges });
  },
  remove(d, e) { d.pools = d.pools.filter((p) => p !== e.ref); },
  set(_d, e, a) { const p = e.ref as { name: string; ranges: string }; if (a.ranges) p.ranges = a.ranges; if (a.name) p.name = a.name; },
  render(_d, rows, mode) {
    if (mode === 'terse') return renderTerse(rows.map((e) => ({ index: e.index, flags: e.flags, props: Object.entries(e.props) as [string, string][] })));
    const t: Row[] = rows.map((e) => ({ index: e.index, flags: '', cells: [e.props.name, e.props.ranges] }));
    return renderTable([{ title: 'NAME' }, { title: 'RANGES' }], t, []);
  },
  detail: {
    legend: '',
    flagW: 0,
    noFlags: true,
    quote: ['name'],
    props: (e) => [['name', e.props.name], ['ranges', e.props.ranges]],
  },
};

const dhcpServerMenu: Menu = {
  path: ['ip', 'dhcp-server'],
  fields: [
    { name: 'name', kind: 'string' },
    { name: 'interface', kind: 'iface' },
    { name: 'address-pool', kind: 'string' },
    { name: 'lease-time', kind: 'string' },
    { name: 'disabled', kind: 'enum', values: YES_NO },
  ],
  required: ['name', 'interface'],
  entries: (d) => d.dhcpServers.map((s, i) => ({ index: i, flags: s.disabled ? 'X' : d.activeAddrs().some((a) => a.iface === s.iface) ? '' : 'I', props: { name: s.name, interface: s.iface, 'lease-time': s.leaseTime, 'address-pool': s.pool, 'use-radius': 'no', 'lease-script': '', disabled: s.disabled ? 'yes' : 'no' }, ref: s })),
  add(d, a) {
    const pool = a['address-pool'] ?? 'static-only';
    if (pool !== 'static-only' && !d.pools.some((p) => p.name === pool)) throw new CliError('input does not match any value of address-pool');
    d.dhcpServers.push({ name: a.name, iface: a.interface, pool, leaseTime: a['lease-time'] ?? '30m', disabled: a.disabled === 'yes' });
  },
  remove(d, e) { d.dhcpServers = d.dhcpServers.filter((s) => s !== e.ref); },
  toggle(_d, e, off) { (e.ref as { disabled: boolean }).disabled = off; },
  set(d, e, a) {
    const s = e.ref as { pool: string; leaseTime: string; iface: string };
    if (a['address-pool']) { if (!d.pools.some((p) => p.name === a['address-pool'])) throw new CliError('input does not match any value of address-pool'); s.pool = a['address-pool']; }
    if (a['lease-time']) s.leaseTime = a['lease-time'];
    if (a.interface) s.iface = a.interface;
  },
  render(_d, rows, mode) {
    if (mode === 'terse') return renderTerse(rows.map((e) => ({ index: e.index, flags: e.flags, props: Object.entries(e.props).filter(([k]) => k !== 'disabled') as [string, string][] })));
    const t: Row[] = rows.map((e) => ({ index: e.index, flags: e.flags, cells: [e.props.name, e.props.interface, e.props['address-pool'], e.props['lease-time']] }));
    return renderTable([{ title: 'NAME' }, { title: 'INTERFACE' }, { title: 'ADDRESS-POOL' }, { title: 'LEASE-TIME' }], t, [{ letter: 'X', name: 'DISABLED', group: 0 }, { letter: 'I', name: 'INVALID', group: 0 }]);
  },
  detail: {
    legend: 'Flags: D - dynamic; X - disabled, I - invalid',
    flagW: 2,
    quote: ['name'],
    props: (e) => [
      ['name', e.props.name],
      ['interface', e.props.interface],
      ['lease-time', e.props['lease-time']],
      ['address-pool', e.props['address-pool']],
      ['use-radius', e.props['use-radius']],
      ['lease-script', e.props['lease-script']],
    ],
  },
};

const dhcpNetworkMenu: Menu = {
  path: ['ip', 'dhcp-server', 'network'],
  fields: [{ name: 'address', kind: 'cidr' }, { name: 'gateway', kind: 'ip' }, { name: 'dns-server', kind: 'string' }],
  required: ['address'],
  entries: (d) => d.dhcpNetworks.map((n, i) => ({ index: i, flags: '', props: { address: n.address, ...(n.gateway ? { gateway: n.gateway } : {}), ...(n.dns ? { 'dns-server': n.dns } : {}) }, ref: n })),
  add(d, a) {
    const c = parseCidr(a.address)!;
    d.dhcpNetworks.push({ address: `${formatIPv4(c.net)}/${c.cidr}`, gateway: a.gateway, dns: a['dns-server'] });
  },
  remove(d, e) { d.dhcpNetworks = d.dhcpNetworks.filter((n) => n !== e.ref); },
  set(_d, e, a) { const n = e.ref as { gateway?: string; dns?: string }; if (a.gateway) n.gateway = a.gateway; if (a['dns-server']) n.dns = a['dns-server']; },
  render(_d, rows, mode) {
    if (mode === 'terse') return renderTerse(rows.map((e) => ({ index: e.index, flags: e.flags, props: Object.entries(e.props) as [string, string][] })));
    const t: Row[] = rows.map((e) => ({ index: e.index, flags: '', cells: [e.props.address, e.props.gateway ?? '', e.props['dns-server'] ?? ''] }));
    return renderTable([{ title: 'ADDRESS' }, { title: 'GATEWAY' }, { title: 'DNS-SERVER' }], t, []);
  },
  detail: {
    legend: 'Flags: D - dynamic',
    flagW: 1,
    quote: [],
    props: (e) => [
      ['address', e.props.address],
      ['gateway', e.props.gateway ?? ''],
      ['dns-server', e.props['dns-server'] ?? ''],
      ['wins-server', ''],
      ['ntp-server', ''],
      ['caps-manager', ''],
      ['dhcp-option', ''],
    ],
  },
};

const leaseMenu: Menu = {
  path: ['ip', 'dhcp-server', 'lease'],
  entries: (d) => d.leases.map((l, i) => ({ index: i, flags: 'D', props: { address: l.address, 'mac-address': l.mac, 'host-name': l.hostName, server: l.server, status: 'bound', 'last-seen': '2s' }, ref: l })),
  remove(d, e) { d.leases = d.leases.filter((l) => l !== e.ref); },
  render(_d, rows, mode) {
    if (mode === 'terse') return renderTerse(rows.map((e) => ({ index: e.index, flags: e.flags, props: Object.entries(e.props) as [string, string][] })));
    const t: Row[] = rows.map((e) => ({ index: e.index, flags: e.flags, cells: [e.props.address, e.props['mac-address'], e.props['host-name'], e.props.server, e.props.status, e.props['last-seen']] }));
    return renderTable([{ title: 'ADDRESS' }, { title: 'MAC-ADDRESS' }, { title: 'HOST-NAME' }, { title: 'SERVER' }, { title: 'STATUS' }, { title: 'LAST-SEEN' }], t, [{ letter: 'D', name: 'DYNAMIC', group: 0 }]);
  },
};

for (const m of [interfaceMenu, bridgeMenu, portMenu, vlanTableMenu, hostMenu, vlanIfaceMenu, poolMenu, dhcpServerMenu, dhcpNetworkMenu, leaseMenu]) registerMenu(m);

export type { Args };
export { abbrev };
