/**
 * /ip firewall address-list, /interface list (+ member) and /interface ethernet.
 * Layouts and behaviour captured from RouterOS 7.16 (tools/conformance/scenarios/fwprops.json, survey.json).
 */
import { CliError, registerMenu, type Menu } from './cli';
import type { Device } from './device';
import { renderTable, renderTerse, type FlagDef, type Row } from './table';

const stamp = (): string => {
  const t = new Date();
  const p = (n: number) => String(n).padStart(2, '0');
  return `${t.getFullYear()}-${p(t.getMonth() + 1)}-${p(t.getDate())} ${p(t.getHours())}:${p(t.getMinutes())}:${p(t.getSeconds())}`;
};

const BUILTIN_LISTS = [
  { name: 'all', comment: 'contains all interfaces' },
  { name: 'none', comment: 'contains no interfaces' },
  { name: 'dynamic', comment: 'contains dynamic interfaces' },
  { name: 'static', comment: 'contains static interfaces' },
];

const YES_NO = ['yes', 'no'] as const;

// ---------- /ip firewall address-list ----------

const ADDR_FLAGS: FlagDef[] = [{ letter: 'X', name: 'DISABLED', group: 0 }, { letter: 'D', name: 'DYNAMIC', group: 0 }];

const addressListMenu: Menu = {
  path: ['ip', 'firewall', 'address-list'],
  fields: [
    { name: 'list', kind: 'string' }, { name: 'address', kind: 'string' }, { name: 'comment', kind: 'string' },
    { name: 'timeout', kind: 'string' }, { name: 'disabled', kind: 'enum', values: YES_NO },
  ],
  required: ['list', 'address'],
  entries: (d) => d.addressLists.map((e, i) => ({
    index: i,
    flags: `${e.disabled ? 'X' : ''}${e.timeout ? 'D' : ''}`,
    props: {
      ...(e.comment ? { comment: e.comment } : {}),
      list: e.list, address: e.address, 'creation-time': stamp(), ...(e.timeout ? { timeout: e.timeout } : {}), dynamic: e.timeout ? 'yes' : 'no',
      disabled: e.disabled ? 'yes' : 'no',
    },
    ref: e,
  })),
  add(d, a) {
    d.addressLists.push({ list: a.list, address: a.address, comment: a.comment, disabled: a.disabled === 'yes', timeout: a.timeout, created: 0 });
  },
  remove(d, e) { d.addressLists.splice(d.addressLists.indexOf(e.ref as never), 1); },
  toggle(_d, e, off) { (e.ref as { disabled: boolean }).disabled = off; },
  set(_d, e, a) {
    const r = e.ref as { list: string; address: string; comment?: string; disabled: boolean; timeout?: string };
    if (a.list) r.list = a.list;
    if (a.address) r.address = a.address;
    if ('comment' in a) r.comment = a.comment || undefined;
    if (a.timeout) r.timeout = a.timeout;
    if (a.disabled) r.disabled = a.disabled === 'yes';
  },
  render(_d, rows, mode) {
    if (mode === 'terse') return renderTerse(rows.map((e) => ({ index: e.index, flags: e.flags, props: Object.entries(e.props).filter(([k]) => k !== 'disabled') as [string, string][] })));
    const t: Row[] = rows.map((e) => ({ index: e.index, flags: e.flags, comment: e.props.comment, cells: [e.props.list, e.props.address, e.props['creation-time']] }));
    return renderTable([{ title: 'LIST' }, { title: 'ADDRESS' }, { title: 'CREATION-TIME' }], t, ADDR_FLAGS);
  },
  detail: {
    legend: 'Flags: X - disabled, D - dynamic',
    flagW: 1,
    props: (e) => Object.entries(e.props).filter(([k]) => !['comment', 'disabled'].includes(k)) as [string, string][],
  },
};

// ---------- /interface list ----------

const LIST_FLAGS: FlagDef[] = [{ letter: '*', name: 'BUILTIN', group: 0 }];

const interfaceListMenu: Menu = {
  path: ['interface', 'list'],
  fields: [{ name: 'name', kind: 'string' }, { name: 'comment', kind: 'string' }],
  required: ['name'],
  entries: (d) => [
    ...BUILTIN_LISTS.map((l, i) => ({ index: i, flags: '*', props: { comment: l.comment, name: l.name, builtin: 'yes' }, ref: { builtin: true, name: l.name } })),
    ...d.ifLists.map((l, i) => ({ index: BUILTIN_LISTS.length + i, flags: '', props: { ...(l.comment ? { comment: l.comment } : {}), name: l.name, builtin: 'no' }, ref: l })),
  ],
  add(d, a) {
    if (BUILTIN_LISTS.some((l) => l.name === a.name) || d.ifLists.some((l) => l.name === a.name)) throw new CliError('failure: list with such name already exists');
    d.ifLists.push({ name: a.name, comment: a.comment });
  },
  remove(d, e) {
    const r = e.ref as { builtin?: boolean; name: string };
    if (r.builtin) throw new CliError('failure: cannot remove builtin list');
    d.ifLists = d.ifLists.filter((l) => l !== e.ref);
    d.ifListMembers = d.ifListMembers.filter((m) => m.list !== r.name);
  },
  set(_d, e, a) {
    const r = e.ref as { name: string; comment?: string };
    if (a.name) r.name = a.name;
    if ('comment' in a) r.comment = a.comment || undefined;
  },
  render(_d, rows, mode) {
    if (mode === 'terse') return renderTerse(rows.map((e) => ({ index: e.index, flags: e.flags, props: [['name', e.props.name]] as [string, string][] })));
    const t: Row[] = rows.map((e) => ({ index: e.index, flags: e.flags, comment: e.props.comment, cells: [e.props.name] }));
    return renderTable([{ title: 'NAME' }], t, LIST_FLAGS);
  },
};

const memberMenu: Menu = {
  path: ['interface', 'list', 'member'],
  fields: [{ name: 'list', kind: 'string' }, { name: 'interface', kind: 'string' }, { name: 'disabled', kind: 'enum', values: YES_NO }],
  required: ['list', 'interface'],
  entries: (d) => d.ifListMembers.map((m, i) => ({ index: i, flags: m.disabled ? 'X' : '', props: { list: m.list, interface: m.interface, dynamic: 'no', disabled: m.disabled ? 'yes' : 'no' }, ref: m })),
  add(d, a) {
    if (!BUILTIN_LISTS.some((l) => l.name === a.list) && !d.ifLists.some((l) => l.name === a.list)) throw new CliError('input does not match any value of list');
    if (!d.iface(a.interface)) throw new CliError('input does not match any value of interface');
    d.ifListMembers.push({ list: a.list, interface: a.interface, disabled: a.disabled === 'yes' });
  },
  remove(d, e) { d.ifListMembers = d.ifListMembers.filter((m) => m !== e.ref); },
  toggle(_d, e, off) { (e.ref as { disabled: boolean }).disabled = off; },
  render(_d, rows, mode) {
    if (mode === 'terse') return renderTerse(rows.map((e) => ({ index: e.index, flags: e.flags, props: [['list', e.props.list], ['interface', e.props.interface], ['dynamic', 'no']] as [string, string][] })));
    const t: Row[] = rows.map((e) => ({ index: e.index, flags: e.flags, cells: [e.props.list, e.props.interface] }));
    return renderTable([{ title: 'LIST' }, { title: 'INTERFACE' }], t, [{ letter: 'X', name: 'DISABLED', group: 0 }, { letter: 'D', name: 'DYNAMIC', group: 0 }]);
  },
  detail: {
    legend: 'Flags: X - disabled, D - dynamic',
    flagW: 1,
    props: (e) => [['list', e.props.list], ['interface', e.props.interface], ['dynamic', 'no']],
  },
};

// ---------- /interface ethernet ----------

const ethernetMenu: Menu = {
  path: ['interface', 'ethernet'],
  entries: (d: Device) => d.ifaces.filter((i) => i.type === 'ether').map((i, n) => ({
    index: n,
    flags: i.disabled ? 'X' : d.running(i.name) ? 'R' : '',
    props: { name: i.name, mtu: '1500', 'mac-address': d.macOf(i.name), arp: 'enabled', 'default-name': i.name },
    ref: i,
  })),
  toggle(_d, e, off) { (e.ref as { disabled: boolean }).disabled = off; },
  render(_d, rows, mode) {
    if (mode === 'terse') return renderTerse(rows.map((e) => ({ index: e.index, flags: e.flags, props: Object.entries(e.props) as [string, string][] })));
    const t: Row[] = rows.map((e) => ({ index: e.index, flags: e.flags, cells: [e.props.name, e.props.mtu, e.props['mac-address'], e.props.arp] }));
    return renderTable([{ title: 'NAME' }, { title: 'MTU', align: 'right' }, { title: 'MAC-ADDRESS' }, { title: 'ARP' }], t, [{ letter: 'X', name: 'DISABLED', group: 0 }, { letter: 'R', name: 'RUNNING', group: 0 }]);
  },
};

for (const m of [addressListMenu, interfaceListMenu, memberMenu, ethernetMenu]) registerMenu(m);
