/**
 * /routing ospf instance | area | interface-template | neighbor | interface.
 * Layouts, defaults and property order were captured from RouterOS 7.16 (tools/conformance/scenarios/ospf.json).
 */
import { CliError, registerMenu, type Entry, type Menu } from './cli';
import { formatIPv4, parseCidr, parseIPv4 } from './ip';
import type { OspfTemplate } from './ospf';
import { BARE, renderBlocks, renderTerse } from './table';

const YES_NO = ['yes', 'no'] as const;
const TYPES = ['broadcast', 'ptp', 'ptmp', 'nbma', 'ptp-unnumbered', 'virtual-link'] as const;

const legend = (text: string, rows: unknown[]) => text + (rows.length ? ' ' : '');
const blocks = (text: string, rows: Entry[], flagW: number, quote = /^name$/, hide: string[] = ['comment', 'disabled']) =>
  renderBlocks(legend(text, rows), rows.map((e) => ({
    index: e.index ?? 0,
    flags: e.flags,
    comment: e.props.comment,
    props: Object.entries(e.props).filter(([k]) => !hide.includes(k)).map(([k, v]) => [k, quote.test(k) ? `"${v}"` : v] as [string, string]),
  })), flagW);
const terse = (rows: Entry[]) => renderTerse(rows.map((e) => ({ index: e.index, flags: e.flags, props: Object.entries(e.props).filter(([k]) => k !== 'disabled').map(([k, v]) => [k, v] as [string, string]) })));

// ---------- instance ----------

const instanceMenu: Menu = {
  path: ['routing', 'ospf', 'instance'],
  fields: [
    { name: 'name', kind: 'string' }, { name: 'version', kind: 'enum', values: ['2', '3'] }, { name: 'router-id', kind: 'ip' },
    { name: 'vrf', kind: 'string' }, { name: 'comment', kind: 'string' }, { name: 'disabled', kind: 'enum', values: YES_NO },
  ],
  required: ['name'],
  entries: (d) => d.ospf.instances.map((i, n) => ({
    index: n, flags: i.disabled ? 'X' : '',
    props: { name: i.name, version: String(i.version), vrf: 'main', 'router-id': i.routerId, disabled: i.disabled ? 'yes' : 'no' },
    ref: i,
  })),
  add(d, a) {
    if (d.ospf.instances.some((i) => i.name === a.name)) throw new CliError('failure: item with such name already exists');
    d.ospf.instances.push({ name: a.name, version: Number(a.version ?? 2), routerId: a['router-id'] ?? '0.0.0.0', disabled: a.disabled === 'yes' });
  },
  remove(d, e) { d.ospf.instances = d.ospf.instances.filter((i) => i !== e.ref); },
  toggle(_d, e, off) { (e.ref as { disabled: boolean }).disabled = off; },
  set(_d, e, a) {
    const i = e.ref as { name: string; version: number; routerId: string; disabled: boolean };
    if (a.name) i.name = a.name;
    if (a.version) i.version = Number(a.version);
    if (a['router-id']) i.routerId = a['router-id'];
    if (a.disabled) i.disabled = a.disabled === 'yes';
  },
  render: (_d, rows, mode) => (mode === 'terse' ? terse(rows) : blocks('Flags: X - disabled, I - inactive', rows, 1)),
  emptyLegend: 'Flags: X - disabled, I - inactive',
};

// ---------- area ----------

const areaMenu: Menu = {
  path: ['routing', 'ospf', 'area'],
  fields: [
    { name: 'name', kind: 'string' }, { name: 'area-id', kind: 'ip' }, { name: 'instance', kind: 'string' },
    { name: 'type', kind: 'enum', values: ['default', 'stub', 'nssa'] }, { name: 'disabled', kind: 'enum', values: YES_NO },
  ],
  required: ['name', 'instance'],
  entries: (d) => d.ospf.areas.map((a, n) => ({
    index: n, flags: a.disabled ? 'X' : '',
    props: { name: a.name, instance: a.instance, 'area-id': a.areaId, type: 'default', disabled: a.disabled ? 'yes' : 'no' },
    ref: a,
  })),
  add(d, a) {
    if (!d.ospf.instances.some((i) => i.name === a.instance)) throw new CliError('input does not match any value of instance');
    if (d.ospf.areas.some((x) => x.name === a.name)) throw new CliError('failure: item with such name already exists');
    d.ospf.areas.push({ name: a.name, areaId: a['area-id'] ?? '0.0.0.0', instance: a.instance, disabled: a.disabled === 'yes' });
  },
  remove(d, e) { d.ospf.areas = d.ospf.areas.filter((x) => x !== e.ref); },
  toggle(_d, e, off) { (e.ref as { disabled: boolean }).disabled = off; },
  set(_d, e, a) {
    const x = e.ref as { name: string; areaId: string; instance: string; disabled: boolean };
    if (a.name) x.name = a.name;
    if (a['area-id']) x.areaId = a['area-id'];
    if (a.instance) x.instance = a.instance;
    if (a.disabled) x.disabled = a.disabled === 'yes';
  },
  render: (_d, rows, mode) => (mode === 'terse' ? terse(rows) : blocks('Flags: X - disabled, I - inactive, D - dynamic; T - transit-capable', rows, 2)),
  emptyLegend: 'Flags: X - disabled, I - inactive, D - dynamic; T - transit-capable',
};

// ---------- interface-template ----------

const templateMenu: Menu = {
  path: ['routing', 'ospf', 'interface-template'],
  fields: [
    { name: 'area', kind: 'string' }, { name: 'networks', kind: 'string' }, { name: 'cost', kind: 'int' },
    { name: 'type', kind: 'enum', values: TYPES }, { name: 'hello-interval', kind: 'string' }, { name: 'dead-interval', kind: 'string' },
    { name: 'priority', kind: 'int' }, { name: 'use-bfd', kind: 'enum', values: YES_NO }, { name: 'comment', kind: 'string' },
    { name: 'disabled', kind: 'enum', values: YES_NO },
  ],
  required: ['area'],
  entries: (d) => d.ospf.templates.map((t, n) => ({
    index: n, flags: t.disabled ? 'X' : '',
    props: {
      area: t.area, 'instance-id': '0', networks: t.networks, type: t.type, 'retransmit-interval': '5s', 'transmit-delay': '1s',
      'hello-interval': t.helloInterval, 'dead-interval': t.deadInterval, priority: String(t.priority), cost: String(t.cost ?? 1),
      ...(t.useBfd ? { 'use-bfd': 'yes' } : {}), ...(t.passive ? { passive: BARE } : {}), disabled: t.disabled ? 'yes' : 'no',
    },
    ref: t,
  })),
  add(d, a, bare) {
    if (!d.ospf.areas.some((x) => x.name === a.area)) throw new CliError('input does not match any value of area');
    if (a.networks) for (const n of a.networks.split(',')) if (!parseCidr(n.trim())) throw new CliError('invalid value for argument networks');
    const t: OspfTemplate = {
      area: a.area, networks: a.networks ?? '0.0.0.0/0', cost: a.cost !== undefined ? Number(a.cost) : undefined,
      type: (a.type as OspfTemplate['type']) ?? 'broadcast', passive: bare.some((b) => b === 'passive'), useBfd: a['use-bfd'] === 'yes',
      disabled: a.disabled === 'yes', priority: Number(a.priority ?? 128), helloInterval: a['hello-interval'] ?? '10s', deadInterval: a['dead-interval'] ?? '40s',
    };
    d.ospf.templates.push(t);
  },
  remove(d, e) { d.ospf.templates = d.ospf.templates.filter((t) => t !== e.ref); },
  toggle(_d, e, off) { (e.ref as { disabled: boolean }).disabled = off; },
  set(_d, e, a, bare = []) {
    const t = e.ref as OspfTemplate;
    if (a.area) t.area = a.area;
    if (a.networks) t.networks = a.networks;
    if (a.cost !== undefined) t.cost = Number(a.cost);
    if (a.type) t.type = a.type as OspfTemplate['type'];
    if (a.priority) t.priority = Number(a.priority);
    if (a['hello-interval']) t.helloInterval = a['hello-interval'];
    if (a['dead-interval']) t.deadInterval = a['dead-interval'];
    if (a['use-bfd']) t.useBfd = a['use-bfd'] === 'yes';
    if (a.disabled) t.disabled = a.disabled === 'yes';
    if (bare.includes('passive')) t.passive = true;
    if (bare.includes('!passive')) t.passive = false;
  },
  render: (_d, rows, mode) => (mode === 'terse' ? terse(rows) : blocks('Flags: X - disabled, I - inactive', rows, 1)),
  emptyLegend: 'Flags: X - disabled, I - inactive',
};

// ---------- neighbor (read only) ----------

const neighborMenu: Menu = {
  path: ['routing', 'ospf', 'neighbor'],
  entries(d) {
    const list = d.net?.ospfResult().neighbors.get(d.id) ?? [];
    return list.map((nb, n) => {
      const broadcast = nb.local.type === 'broadcast';
      return {
        index: n, flags: ' D',
        props: {
          instance: d.ospf.instances.find((i) => !i.disabled)?.name ?? '', area: nb.local.area, address: nb.address,
          ...(broadcast ? { priority: '128' } : {}), 'router-id': nb.routerId,
          ...(broadcast ? { dr: nb.dr, bdr: nb.bdr } : {}), state: 'Full', 'state-changes': '5', adjacency: '18s', timeout: '35s',
        },
        ref: nb,
      };
    });
  },
  render: (_d, rows, mode) => (mode === 'terse' ? terse(rows) : blocks('Flags: V - virtual; D - dynamic', rows, 2, /^(name|state)$/)),
  emptyLegend: 'Flags: V - virtual; D - dynamic',
};

// ---------- interface (read only) ----------

const interfaceMenu: Menu = {
  path: ['routing', 'ospf', 'interface'],
  entries(d) {
    const res = d.net?.ospfResult();
    const list = res?.ifaces.get(d.id) ?? [];
    return list.map((i, n) => {
      const broadcast = i.type === 'broadcast';
      const nbs = res?.neighbors.get(d.id)?.filter((x) => x.local === i) ?? [];
      const state = i.passive ? 'passive' : broadcast ? (nbs.length ? (nbs[0].dr === formatIPv4(i.ip) ? 'DR' : nbs[0].bdr === formatIPv4(i.ip) ? 'BDR' : 'DROther') : 'DR') : i.type;
      return {
        index: n, flags: 'D',
        props: {
          address: `${formatIPv4(i.ip)}%${i.iface}`, area: i.area, state, 'network-type': i.type, cost: String(i.cost),
          ...(broadcast ? { priority: String(i.template.priority) } : {}), 'use-bfd': i.template.useBfd ? 'yes' : 'no',
          'retransmit-interval': '5s', 'transmit-delay': '1s', 'hello-interval': i.template.helloInterval, 'dead-interval': i.template.deadInterval,
        },
        ref: i,
      };
    });
  },
  render: (_d, rows, mode) => (mode === 'terse' ? terse(rows) : blocks('Flags: D - dynamic', rows, 1)),
  emptyLegend: 'Flags: D - dynamic',
};

void parseIPv4;
for (const m of [instanceMenu, areaMenu, templateMenu, neighborMenu, interfaceMenu]) registerMenu(m);
