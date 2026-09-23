/**
 * A RouterOS-flavoured command line for the simulator.
 *
 * Behaviour (abbreviations, error texts, column positions, table layouts) follows output captured from RouterOS 7.16.
 * Only the commands listed in SUPPORTED are implemented; anything else answers "bad command name".
 */
import { Device, type FwRule } from './device';
import { exportConfig } from './export';
import { FILTER_ACTIONS, NAT_ACTIONS, RULE_PROPS } from './firewall';
import { fmtTime, formatIPv4, netText, parseCidr, parseIPv4 } from './ip';
import { BARE, renderBlocks, renderTable, renderTerse, type FlagDef, type Row } from './table';

export interface ExecResult {
  output: string;
  /** Menu the terminal is "in" after the command, e.g. ['ip', 'address']. */
  ctx: string[];
}

interface Token {
  text: string;
  start: number;
}

function tokenize(line: string): Token[] {
  const out: Token[] = [];
  let i = 0;
  while (i < line.length) {
    while (i < line.length && /\s/.test(line[i])) i++;
    if (i >= line.length) break;
    const start = i;
    let depth = 0;
    let quote = false;
    let text = '';
    while (i < line.length) {
      const ch = line[i];
      if (ch === '"' && line[i - 1] !== '\\') quote = !quote;
      else if (!quote && ch === '[') depth++;
      else if (!quote && ch === ']') depth--;
      else if (!quote && depth === 0 && /\s/.test(ch)) break;
      text += ch;
      i++;
    }
    out.push({ text, start });
  }
  return out;
}

const unquote = (s: string) => (s.startsWith('"') && s.endsWith('"') && s.length >= 2 ? s.slice(1, -1).replace(/\\"/g, '"') : s);

/** Unique-prefix matching, which RouterOS allows for commands, arguments and values. */
function abbrev(word: string, options: readonly string[]): string | 'ambiguous' | null {
  if (options.includes(word)) return word;
  const hits = options.filter((o) => o.startsWith(word));
  return hits.length === 1 ? hits[0] : hits.length > 1 ? 'ambiguous' : null;
}

class CliError extends Error {}

// ---------- items and filters ----------

interface Entry {
  index: number | null;
  flags: string;
  props: Record<string, string>;
  ref: unknown;
}

interface Cond {
  /** A flag word such as `ospf` has key '@flag' and the letter to look for in the value. */
  key: string;
  op: '=' | '!=' | '~';
  value: string;
}

/** `and` binds tighter than `or` (matches RouterOS): the result is a list of AND-groups, any one of which matching is a hit. */
function parseConds(tokens: Token[]): Cond[][] {
  const groups: Cond[][] = [[]];
  for (const t of tokens) {
    if (t.text === 'and') continue;
    if (t.text === 'or') { groups.push([]); continue; }
    const flagWord = FLAG_WORDS[t.text.replace(/^!/, '')];
    if (flagWord && !/[=~]/.test(t.text)) { groups[groups.length - 1].push({ key: '@flag', op: t.text.startsWith('!') ? '!=' : '=', value: flagWord }); continue; }
    const m = /^([a-z-]+)(!=|=|~)(.*)$/.exec(t.text);
    if (!m) throw new CliError('syntax error');
    groups[groups.length - 1].push({ key: m[1], op: m[2] as '=' | '!=' | '~', value: unquote(m[3]) });
  }
  return groups;
}

const FLAG_WORDS: Record<string, string> = { ospf: 'o', static: 's', connect: 'c', dynamic: 'D', active: 'A', inactive: 'I', disabled: 'X', bgp: 'b', rip: 'r' };

const condHit = (e: Entry, c: Cond): boolean => {
  if (c.key === '@flag') return e.flags.includes(c.value) === (c.op === '=');
  const v = e.props[c.key] ?? '';
  if (c.op === '~') {
    try { return new RegExp(c.value).test(v); } catch { throw new CliError('syntax error'); }
  }
  return (v === c.value) === (c.op === '=');
};

/** A row matches when any one AND-group (the `or` alternatives) matches in full. */
const whereHit = (e: Entry, groups: Cond[][]): boolean => groups.some((g) => g.every((c) => condHit(e, c)));

// ---------- menu definitions ----------

interface FieldDef {
  name: string;
  kind: 'string' | 'ip' | 'cidr' | 'iface' | 'int' | 'enum' | 'gateway' | 'protocol' | 'ports' | 'addr';
  values?: readonly string[];
}

export interface DetailSpec {
  /** Legend lines printed first ("" for none). */
  legend: string;
  /** Width of the flag column (RouterOS pads it differently per menu). */
  flagW: number;
  /** Properties to print, in order; values are printed as-is unless listed in `quote`. */
  props: (e: Entry) => [string, string][];
  /** Property names whose values are shown in quotes. */
  quote?: string[];
  /** Flag letters rewritten for this menu, e.g. interfaces place R in the third slot. */
  flags?: (e: Entry) => string;
  /** No flag column at all (/ip pool). */
  noFlags?: boolean;
}

interface Menu {
  path: string[];
  fields?: FieldDef[];
  required?: string[];
  flagDefs?: FlagDef[];
  entries?: (d: Device) => Entry[];
  add?: (d: Device, a: Record<string, string>, bare: string[]) => void;
  remove?: (d: Device, e: Entry) => void;
  toggle?: (d: Device, e: Entry, disabled: boolean) => void;
  set?: (d: Device, e: Entry, a: Record<string, string>, bare?: string[]) => void;
  /** RouterOS `move [numbers] destination=N`: reorder the targets to just before the entry currently at index N (menus where order matters, e.g. firewall rules). */
  move?: (d: Device, targets: Entry[], destIndex: number) => void;
  render?: (d: Device, rows: Entry[], mode: 'table' | 'terse' | 'stats') => string;
  /** Commands that are not lists (ping, traceroute, identity, export). */
  run?: (d: Device, action: string, args: Args, line: string) => string;
  actions?: string[];
  /** Real RouterOS applies set/remove to the explicit entries, then reports "no such item (4)" when the selection also held a dynamic entry that vanished. */
  skipDynamic?: boolean;
  /** What an empty `print` shows (the legend line), when the menu shows one. */
  emptyLegend?: string;
  /** `print detail`: one block per item with every property (layouts captured from RouterOS 7.16). */
  detail?: DetailSpec;
  /** Extra actions on a list menu, such as `monitor`. */
  extra?: Record<string, (d: Device, args: Args) => string>;
}

interface Args {
  named: Record<string, { value: string; col: number }>;
  bare: Token[];
  where: Cond[][];
  flags: Set<string>;
  tokens: Token[];
}

const ADDRESS_FLAGS: FlagDef[] = [{ letter: 'X', name: 'DISABLED', group: 1 }, { letter: 'I', name: 'INVALID', group: 1 }, { letter: 'D', name: 'DYNAMIC', group: 0 }];
const ROUTE_FLAGS: FlagDef[] = [
  { letter: 'D', name: 'DYNAMIC', group: 0 },
  { letter: 'X', name: 'DISABLED', group: 1 },
  { letter: 'I', name: 'INACTIVE', group: 1 },
  { letter: 'A', name: 'ACTIVE', group: 1 },
  { letter: 'c', name: 'CONNECT', group: 2 },
  { letter: 's', name: 'STATIC', group: 2 },
  { letter: 'o', name: 'OSPF', group: 2 },
  { letter: 'b', name: 'BGP', group: 2 },
];

// ----- /ip address -----

function addressEntries(d: Device): Entry[] {
  return d.addrs.map((a, i) => {
    const c = parseCidr(a.address)!;
    return {
      index: i,
      flags: a.disabled ? 'X' : '',
      props: { ...(a.comment ? { comment: a.comment } : {}), address: a.address, network: formatIPv4(c.net), interface: a.iface, 'actual-interface': a.iface, disabled: a.disabled ? 'yes' : 'no' },
      ref: a,
    };
  });
}

const addressMenu: Menu = {
  path: ['ip', 'address'],
  fields: [
    { name: 'address', kind: 'cidr' },
    { name: 'interface', kind: 'iface' },
    { name: 'comment', kind: 'string' },
    { name: 'disabled', kind: 'enum', values: ['yes', 'no'] },
  ],
  required: ['address', 'interface'],
  flagDefs: ADDRESS_FLAGS,
  entries: addressEntries,
  add(d, a) {
    const c = parseCidr(a.address)!;
    const norm = `${formatIPv4(c.ip)}/${c.cidr}`;
    if (d.addrs.some((x) => x.address === norm && x.iface === a.interface)) throw new CliError('failure: already have such address');
    d.addrs.push({ address: norm, iface: a.interface, comment: a.comment, disabled: a.disabled === 'yes' });
  },
  remove(d, e) { d.addrs.splice(d.addrs.indexOf(e.ref as never), 1); },
  toggle(_d, e, off) { (e.ref as { disabled: boolean }).disabled = off; },
  set(d, e, a) {
    const r = e.ref as { address: string; iface: string; comment?: string; disabled: boolean };
    if (a.address) { const c = parseCidr(a.address)!; r.address = `${formatIPv4(c.ip)}/${c.cidr}`; }
    if (a.interface) r.iface = a.interface;
    if ('comment' in a) r.comment = a.comment || undefined;
    if (a.disabled) r.disabled = a.disabled === 'yes';
    void d;
  },
  render(_d, rows, mode) {
    if (mode === 'terse') return renderTerse(rows.map((e) => ({ index: e.index, flags: e.flags, props: Object.entries(e.props).filter(([k]) => k !== 'disabled') as [string, string][] })));
    const t: Row[] = rows.map((e) => ({ index: e.index, flags: e.flags, comment: e.props.comment, cells: [e.props.address, e.props.network, e.props.interface] }));
    return renderTable([{ title: 'ADDRESS' }, { title: 'NETWORK' }, { title: 'INTERFACE' }], t, ADDRESS_FLAGS);
  },
};

// ----- /ip route -----

/** Marks a property that prints as a bare word (blackhole). */
function routeEntries(d: Device): Entry[] {
  return d.routeViews().map((v) => {
    const flags = `${v.dynamic ? 'D' : ''}${v.disabled ? 'X' : v.active ? 'A' : 'I'}${v.connected ? 'c' : v.ospf ? 'o' : v.bgp ? 'b' : 's'}`;
    return {
      index: v.staticIndex,
      flags,
      props: {
        ...(v.comment ? { comment: v.comment } : {}),
        'dst-address': v.dstText,
        'routing-table': 'main',
        ...(v.blackhole ? { blackhole: BARE } : { gateway: v.gwShown ?? v.gateway }),
        'immediate-gw': v.connected ? v.gateway : v.active && v.iface && !v.blackhole ? (v.gateway.includes('.') ? `${v.gateway}%${v.iface}` : v.gateway) : '',
        distance: String(v.distance),
        scope: v.connected ? '10' : v.ospf ? '20' : v.bgp ? '40' : '30',
        ...(v.blackhole ? {} : { 'target-scope': v.connected ? '5' : '10' }),
        ...(v.connected && v.localAddr ? { 'local-address': `${v.localAddr}%${v.gateway}` } : {}),
        active: v.active ? 'yes' : 'no',
        disabled: v.disabled ? 'yes' : 'no',
      },
      ref: v.staticIndex === null ? null : d.routes[v.staticIndex],
    };
  });
}

const routeMenu: Menu = {
  path: ['ip', 'route'],
  fields: [
    { name: 'dst-address', kind: 'cidr' },
    { name: 'gateway', kind: 'gateway' },
    { name: 'distance', kind: 'int' },
    { name: 'comment', kind: 'string' },
    { name: 'disabled', kind: 'enum', values: ['yes', 'no'] },
  ],
  required: ['dst-address'],
  flagDefs: ROUTE_FLAGS,
  entries: routeEntries,
  add(d, a, bare) {
    const blackhole = bare.some((b) => 'blackhole'.startsWith(b) && b.length >= 1);
    if (!a.gateway && !blackhole) throw new CliError('failure: gateway required');
    const c = parseCidr(a['dst-address'])!;
    d.routes.push({ dst: netText(c), gateway: a.gateway, blackhole, distance: a.distance ? Number(a.distance) : 1, comment: a.comment, disabled: a.disabled === 'yes' });
  },
  remove(d, e) {
    if (!e.ref) throw new CliError('failure: cannot remove dynamic route');
    d.routes.splice(d.routes.indexOf(e.ref as never), 1);
  },
  toggle(_d, e, off) {
    if (!e.ref) throw new CliError('failure: cannot disable dynamic route');
    (e.ref as { disabled: boolean }).disabled = off;
  },
  set(_d, e, a) {
    if (!e.ref) throw new CliError('failure: cannot change dynamic route');
    const r = e.ref as { dst: string; gateway?: string; distance: number; comment?: string; disabled: boolean };
    if (a['dst-address']) r.dst = netText(parseCidr(a['dst-address'])!);
    if (a.gateway) r.gateway = a.gateway;
    if (a.distance) r.distance = Number(a.distance);
    if ('comment' in a) r.comment = a.comment || undefined;
    if (a.disabled) r.disabled = a.disabled === 'yes';
  },
  render(_d, rows, mode) {
    if (mode === 'terse') return renderTerse(rows.map((e) => ({ index: e.index, flags: e.flags, props: Object.entries(e.props).filter(([k]) => !['active', 'disabled'].includes(k)) as [string, string][] })));
    const t: Row[] = rows.map((e) => ({ index: e.index, flags: e.flags, comment: e.props.comment, cells: [e.props['dst-address'], e.props.gateway ?? 'blackhole', e.props.distance] }));
    return renderTable([{ title: 'DST-ADDRESS' }, { title: 'GATEWAY' }, { title: 'DISTANCE', align: 'right' }], t, ROUTE_FLAGS);
  },
};

// ----- /ip firewall filter | nat -----

function ruleEntries(list: (d: Device) => FwRule[]) {
  return (d: Device): Entry[] =>
    list(d).map((r, i) => {
      const ordered: [string, string][] = [['chain', r.chain], ['action', r.action]];
      for (const k of RULE_PROPS) if (r.props[k] !== undefined) ordered.push([k, r.props[k]]);
      return {
        index: i,
        flags: r.disabled ? 'X' : '',
        props: { ...(r.comment ? { comment: r.comment } : {}), ...Object.fromEntries(ordered), bytes: String(r.bytes), packets: String(r.packets), disabled: r.disabled ? 'yes' : 'no' },
        ref: r,
      };
    });
}

const PORT_PROPS = ['src-port', 'dst-port', 'port'];
const ADDR_PROPS = ['src-address', 'dst-address'];

function ruleFields(actions: readonly string[]): FieldDef[] {
  return [
    { name: 'chain', kind: 'string' },
    { name: 'action', kind: 'enum', values: actions },
    ...RULE_PROPS.map((n) => ({
      name: n,
      kind: (n === 'in-interface' || n === 'out-interface' ? 'iface' : n === 'protocol' ? 'protocol' : PORT_PROPS.includes(n) ? 'ports' : ADDR_PROPS.includes(n) ? 'addr' : 'string') as FieldDef['kind'],
    })),
    { name: 'comment', kind: 'string' },
    { name: 'disabled', kind: 'enum', values: ['yes', 'no'] },
    { name: 'place-before', kind: 'int' },
    { name: 'destination', kind: 'int' },
  ];
}

/** Checks that involve several properties (real RouterOS words them as "failure: ..."). */
function checkRule(props: Record<string, string | undefined>): void {
  const proto = (props.protocol ?? '').replace(/^!/, '');
  const withPorts = ['tcp', 'udp', 'udp-lite', 'dccp', 'sctp'].includes(proto);
  if (PORT_PROPS.some((k) => props[k] !== undefined) && !withPorts) throw new CliError('failure: ports can be specified if proto is tcp,udp,udp-lite,dccp,sctp');
  if (props['tcp-flags'] !== undefined && proto !== 'tcp') throw new CliError('failure: tcp-flags works only with tcp');
  if (props['icmp-options'] !== undefined && proto !== 'icmp') throw new CliError('failure: icmp-options can be specified if proto is icmp');
}

function ruleMenu(path: string[], list: (d: Device) => FwRule[], actions: readonly string[]): Menu {
  return {
    path,
    fields: ruleFields(actions),
    required: ['chain'],
    entries: ruleEntries(list),
    add(d, a) {
      const props: Record<string, string> = {};
      for (const k of RULE_PROPS) if (a[k] !== undefined) props[k] = a[k];
      checkRule(props);
      if (a.action === 'fasttrack-connection') props['hw-offload'] = 'yes';
      const rule: FwRule = { chain: a.chain, action: a.action ?? 'accept', props, comment: a.comment, disabled: a.disabled === 'yes', packets: 0, bytes: 0 };
      const at = a['place-before'] === undefined ? -1 : Number(a['place-before']);
      if (at >= list(d).length) throw new CliError('failure: item referred by \'place-before\' does not exist');
      if (at >= 0) list(d).splice(at, 0, rule); else list(d).push(rule);
    },
    remove(d, e) { const l = list(d); l.splice(l.indexOf(e.ref as FwRule), 1); },
    toggle(_d, e, off) { (e.ref as FwRule).disabled = off; },
    /** RouterOS `move [numbers] destination=N`: pull the targets out (in their current relative order), then reinsert them just before what is currently index N. */
    move(d, targets, dest) {
      const l = list(d);
      const rules = targets.map((t) => t.ref as FwRule);
      const destRule = l[dest] as FwRule | undefined;
      const remaining = l.filter((r) => !rules.includes(r));
      // moving a rule to in front of itself (or another rule also being moved) is a no-op: keep its original relative slot
      const at = destRule && !rules.includes(destRule) ? remaining.indexOf(destRule) : Math.min(dest, remaining.length);
      remaining.splice(at, 0, ...rules);
      l.length = 0;
      l.push(...remaining);
    },
    set(_d, e, a) {
      const r = e.ref as FwRule;
      if (a.chain) r.chain = a.chain;
      if (a.action) r.action = a.action;
      const next = { ...r.props };
      for (const k of RULE_PROPS) if (a[k] !== undefined) next[k] = a[k];
      checkRule(next);
      r.props = next;
      if ('comment' in a) r.comment = a.comment || undefined;
      if (a.disabled) r.disabled = a.disabled === 'yes';
    },
    render(_d, rows, mode) {
      if (mode === 'stats') {
        const t: Row[] = rows.map((e) => ({ index: e.index, flags: e.flags, comment: e.props.comment, cells: [e.props.chain, e.props.action, spaced(e.props.bytes), spaced(e.props.packets)] }));
        return renderTable([{ title: 'CHAIN' }, { title: 'ACTION' }, { title: 'BYTES', align: 'right' }, { title: 'PACKETS', align: 'right' }], t, [{ letter: 'X', name: 'DISABLED', group: 0 }, { letter: 'I', name: 'INVALID', group: 0 }]);
      }
      if (mode === 'terse') return renderTerse(rows.map((e) => ({ index: e.index, flags: e.flags, props: Object.entries(e.props).filter(([k]) => !['bytes', 'packets', 'disabled'].includes(k)) as [string, string][] })));
      return renderBlocks(
        `Flags: X - disabled, I - invalid; D - dynamic${rows.length ? ' ' : ''}`,
        rows.map((e) => ({ index: e.index ?? 0, flags: e.flags, comment: e.props.comment, props: Object.entries(e.props).filter(([k]) => !['comment', 'bytes', 'packets', 'disabled'].includes(k)).map(([k, v]) => [k, k === 'log-prefix' ? `"${v}"` : v] as [string, string]) })),
      );
    },
  };
}

/** RouterOS groups big numbers with a space: 3 403 866. */
const spaced = (n: string) => n.replace(/\B(?=(\d{3})+(?!\d))/g, ' ');

// ----- /interface -----


// ---------- argument parsing ----------

function parseArgs(tokens: Token[], m: Menu, line: string, printing = false): Args {
  const args: Args = { named: {}, bare: [], where: [[]], flags: new Set(), tokens };
  const names = (m.fields ?? []).map((f) => f.name);
  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i];
    if (t.text === 'where') { args.where = parseConds(tokens.slice(i + 1)); break; }
    const eq = t.text.indexOf('=');
    if (eq > 0 && !t.text.startsWith('[')) {
      const rawName = t.text.slice(0, eq);
      const full = m.fields ? abbrev(rawName, names) : rawName;
      if (full === null || full === 'ambiguous') {
        // real 7.16: print points at the name; add points at the name when it starts like a known property, else at the equals sign
        const like = names.some((n) => n[0] === rawName[0]);
        throw new CliError(`expected end of command (line 1 column ${printing || like ? t.start + 1 : t.start + eq + 1})`);
      }
      args.named[full] = { value: unquote(t.text.slice(eq + 1)), col: t.start + eq + 2 };
    } else if (['terse', 'stats', 'detail', 'count-only', 'without-paging', 'as-value', 'value-list', 'brief', 'once'].includes(t.text)) args.flags.add(t.text);
    else args.bare.push(t);
  }
  void line;
  return args;
}

const PROTOCOLS = ['tcp', 'udp', 'icmp', 'ipv6-icmp', 'gre', 'ipsec-esp', 'ipsec-ah', 'ospf', 'vrrp', 'igmp', 'ggp', 'egp', 'pup', 'idrp-cmtp', 'rdp', 'ipip', 'sctp', 'dccp', 'udp-lite', 'ip-encap', 'etherip', 'eigrp', 'l2tp', 'pim', 'ipv6-encap', 'ipv6-frag', 'ipv6-nonxt', 'ipv6-opts', 'ipv6-route', 'st', 'xtp', 'iso-tp4', 'xns-idp', 'rspf', 'vmtp', 'ddp', 'encap', 'hmp', 'idpr-cmtp', 'ipcomp', 'ipv6', 'iso-ip', 'rsvp', 'tp++', 'all'];

function checkField(f: FieldDef, value: string, col: number, d: Device): string {
  switch (f.kind) {
    case 'cidr': {
      if (!parseCidr(value)) {
        const m = /^([^/]+)\/(\d+)$/.exec(value);
        if (m && parseIPv4(m[1]) !== null && Number(m[2]) > 32) throw new CliError('value of netmask out of range (0..32)');
        throw new CliError(`invalid value for argument ${f.name}`);
      }
      return value;
    }
    case 'protocol': {
      const b = value.replace(/^!/, '');
      if (!(/^\d+$/.test(b) ? Number(b) <= 255 : PROTOCOLS.includes(b))) throw new CliError(`syntax error (line 1 column ${col})`);
      return value;
    }
    case 'ports': {
      for (const part of value.replace(/^!/, '').split(',')) {
        const m = /^(\d+)(?:-(\d+))?$/.exec(part);
        if (!m) throw new CliError(`syntax error (line 1 column ${col})`);
        if (Number(m[1]) > 65535 || Number(m[2] ?? 0) > 65535) throw new CliError('value of range out of range (0..65535)');
      }
      return value;
    }
    case 'addr': {
      for (const part of value.replace(/^!/, '').split(',')) {
        const [lo, hi] = part.split('-');
        const ok = (x: string) => parseCidr(x.includes('/') ? x : x + '/32') !== null;
        if (!ok(lo) || (hi !== undefined && !ok(hi))) throw new CliError('value of range expects range of ip addresses');
      }
      return value;
    }
    case 'ip': if (parseIPv4(value) === null) throw new CliError(`invalid value for argument ${f.name}`); return value;
    case 'gateway': {
      if (parseIPv4(value) === null && !d.iface(value)) throw new CliError(`invalid value for argument ${f.name}`);
      return value;
    }
    case 'iface': {
      if (!d.iface(value)) throw new CliError(`input does not match any value of ${f.name}`);
      return value;
    }
    case 'int': if (!/^\d+$/.test(value)) throw new CliError(`invalid value for argument ${f.name}`); return value;
    case 'enum': {
      const v = abbrev(value, f.values ?? []);
      if (v === null || v === 'ambiguous') throw new CliError(`syntax error (line 1 column ${col})`);
      return v;
    }
    default: return value;
  }
}

/** Pick items by number ("0", "0,2"), by name, or by [find where ...]. */
function select(entries: Entry[], sel: Token | undefined, d: Device, m: Menu): Entry[] {
  if (!sel) throw new CliError('missing value(s) of argument(s) numbers');
  const t = sel.text;
  if (t.startsWith('[')) {
    const inner = tokenize(t.slice(1, -1));
    if (!inner.length || inner[0].text !== 'find') throw new CliError('syntax error');
    let rest = inner.slice(1);
    if (rest[0]?.text === 'where') rest = rest.slice(1);
    const conds = parseConds(rest);
    return entries.filter((e) => whereHit(e, conds));
  }
  const out: Entry[] = [];
  for (const part of t.split(',')) {
    const byName = entries.find((e) => e.props.name !== undefined && e.props.name === part);
    const idx = /^\d+$/.test(part) ? Number(part) : null;
    const hit = byName ?? (idx !== null ? entries.find((e) => e.index === idx) : undefined);
    if (!hit) throw new CliError('no such item');
    out.push(hit);
  }
  void d;
  return out;
}

// ---------- command tree ----------

const identityMenu: Menu = {
  path: ['system', 'identity'],
  actions: ['print', 'set'],
  run(d, action, a) {
    if (action === 'print') return `  name: ${d.identity}`;
    const n = a.named.name;
    if (!n) throw new CliError('missing value(s) of argument(s) name');
    d.identity = n.value;
    return '';
  },
};

// ----- /ip service -----

function serviceEntries(d: Device): Entry[] {
  return Object.entries(d.services).map(([name, s], i) => ({
    index: i,
    flags: s.disabled ? 'X' : '',
    props: {
      name, port: String(s.port), address: '',
      ...(name.endsWith('ssl') ? { certificate: 'none', 'tls-version': 'any' } : {}),
      ...(name === 'ftp' ? {} : { vrf: 'main' }),
      'max-sessions': '20', disabled: s.disabled ? 'yes' : 'no',
    },
    ref: { name, s },
  }));
}

const serviceMenu: Menu = {
  path: ['ip', 'service'],
  fields: [{ name: 'port', kind: 'int' }, { name: 'disabled', kind: 'enum', values: ['yes', 'no'] }],
  entries: serviceEntries,
  toggle(_d, e, off) { (e.ref as { s: { disabled: boolean } }).s.disabled = off; },
  set(_d, e, a) {
    const s = (e.ref as { s: { port: number; disabled: boolean } }).s;
    if (a.port) s.port = Number(a.port);
    if (a.disabled) s.disabled = a.disabled === 'yes';
  },
  render(_d, rows, mode) {
    if (mode === 'terse') return renderTerse(rows.map((e) => ({ index: e.index, flags: e.flags, props: Object.entries(e.props).filter(([k]) => k !== 'disabled') as [string, string][] })));
    const all = [
      { title: 'NAME', key: 'name' }, { title: 'PORT', key: 'port', align: 'right' as const }, { title: 'CERTIFICATE', key: 'certificate' },
      { title: 'VRF', key: 'vrf' }, { title: 'MAX-SESSIONS', key: 'max-sessions', align: 'right' as const },
    ];
    // columns with nothing in them are left out, like real RouterOS does
    const cols = all.filter((c) => rows.some((e) => e.props[c.key]));
    const t: Row[] = rows.map((e) => ({ index: e.index, flags: e.flags, cells: cols.map((c) => e.props[c.key] ?? '') }));
    return renderTable(cols.map((c) => ({ title: c.title, align: c.align })), t, [{ letter: 'X', name: 'DISABLED', group: 0 }, { letter: 'I', name: 'INVALID', group: 0 }]);
  },
};

const MENUS: Menu[] = [
  addressMenu,
  serviceMenu,
  routeMenu,
  ruleMenu(['ip', 'firewall', 'filter'], (d) => d.filter, FILTER_ACTIONS),
  ruleMenu(['ip', 'firewall', 'nat'], (d) => d.natRules, NAT_ACTIONS),
  identityMenu,
];

/** Menus defined in other files (bridges, VLANs, DHCP) add themselves here. */
export const registerMenu = (m: Menu): void => { MENUS.push(m); };

/** Commands implemented outside this file (ping, traceroute, export): registered by sim/commands.ts. */
export interface ToolMenu {
  path: string[];
  run: (d: Device, args: Args, line: string) => string;
}
const TOOLS: ToolMenu[] = [];
export const registerTool = (t: ToolMenu) => { TOOLS.push(t); };
export type { Args, Token, Menu, Entry, FieldDef, Cond };
export const menuFor = (path: string[]): Menu | undefined => menuAt(path);
export { parseArgs, tokenize, unquote, CliError, fmtTime, abbrev, select, condHit, checkField, spaced };

const ALL_PATHS = (): string[][] => [...MENUS.map((m) => m.path), ...TOOLS.map((t) => t.path)];
const LIST_ACTIONS = ['print', 'get', 'add', 'remove', 'set', 'enable', 'disable', 'move', 'comment'];

function children(prefix: string[]): string[] {
  const out = new Set<string>();
  for (const p of ALL_PATHS()) if (p.length > prefix.length && prefix.every((s, i) => p[i] === s)) out.add(p[prefix.length]);
  return [...out];
}

const menuAt = (path: string[]): Menu | undefined => MENUS.find((m) => m.path.join('/') === path.join('/'));
const toolAt = (path: string[]): ToolMenu | undefined => TOOLS.find((t) => t.path.join('/') === path.join('/'));

/** All words that could come next after what has been typed, for tab completion. */
export function completions(line: string, ctx: string[]): string[] {
  const toks = tokenize(line);
  const trailing = /\s$/.test(line) || line === '';
  const words = toks.map((t) => t.text);
  let cur = line.trimStart().startsWith('/') ? [] : [...ctx];
  const done = trailing ? words : words.slice(0, -1);
  const partial = trailing ? '' : words[words.length - 1] ?? '';
  for (let w of done) {
    w = w.replace(/^\//, '');
    for (const seg of w.split('/').filter(Boolean)) {
      const next = abbrev(seg, children(cur));
      if (next && next !== 'ambiguous') cur = [...cur, next]; else return [];
    }
  }
  const pool = [...children(cur), ...(menuAt(cur) ? LIST_ACTIONS.filter((a) => menuAt(cur)!.entries || menuAt(cur)!.actions?.includes(a)) : []), ...(menuAt(cur)?.actions ?? []), ...Object.keys(menuAt(cur)?.extra ?? {})];
  const p = partial.replace(/^\//, '');
  return [...new Set(pool)].filter((w) => w.startsWith(p)).sort();
}

// ---------- executing a line ----------

export function execLine(dev: Device, rawLine: string, ctxIn: string[]): ExecResult {
  let ctx = [...ctxIn];
  const outputs: string[] = [];
  for (const line of splitCommands(rawLine)) {
    try {
      const r = execOne(dev, line, ctx);
      ctx = r.ctx;
      if (r.output) outputs.push(r.output);
    } catch (e) {
      if (e instanceof CliError) { outputs.push(e.message); break; }
      throw e;
    }
  }
  return { output: outputs.join('\n'), ctx };
}

function splitCommands(line: string): string[] {
  const out: string[] = [];
  let cur = '';
  let q = false;
  let depth = 0;
  for (const ch of line) {
    if (ch === '"') q = !q;
    if (!q && ch === '[') depth++;
    if (!q && ch === ']') depth--;
    if (!q && depth === 0 && ch === ';') { out.push(cur); cur = ''; } else cur += ch;
  }
  out.push(cur);
  return out.filter((s) => s.trim());
}

/** `/ip/address/print` is one token that means three words: split it, keeping each word's column. */
function expandPath(toks: Token[]): Token[] {
  const first = toks[0];
  if (!first || !first.text.startsWith('/') || first.text.includes('=') || !first.text.slice(1).includes('/')) return toks;
  const out: Token[] = [];
  let pos = 0;
  for (const part of first.text.split('/')) {
    if (part) out.push({ text: (pos === 0 ? '/' : '') + part, start: first.start + pos + (pos === 0 ? 0 : 0) });
    pos += part.length + 1;
  }
  if (out[0] && !out[0].text.startsWith('/')) out[0] = { ...out[0], text: '/' + out[0].text };
  return [...out, ...toks.slice(1)];
}

function execOne(dev: Device, line: string, ctx: string[]): ExecResult {
  const toks = expandPath(tokenize(line));
  if (!toks.length || toks[0].text.startsWith('#')) return { output: '', ctx };
  if (toks[0].text === ':put') return { output: unquote(toks.slice(1).map((t) => t.text).join(' ')), ctx };
  if (toks[0].text.startsWith(':')) throw new CliError(`bad command name ${toks[0].text.slice(1)} (line 1 column ${toks[0].start + 2})`);
  if (toks[0].text === '..') return { output: '', ctx: ctx.slice(0, -1) };

  let cur = toks[0].text.startsWith('/') ? [] : [...ctx];
  let i = 0;
  // consume path words; a token with "/" inside may carry several
  outer: while (i < toks.length) {
    const t = toks[i];
    if (t.text.includes('=') || t.text.startsWith('[')) break;
    const isAbs = t.text.startsWith('/');
    const segs = t.text.replace(/^\//, '').split('/');
    let consumed = 0;
    for (const seg of segs) {
      if (seg === '') continue;
      const next = abbrev(seg, children(cur));
      if (next === 'ambiguous') throw new CliError(`ambiguous command name ${seg} (line 1 column ${t.start + (isAbs ? 2 : 1)})`);
      if (next === null) {
        // not a submenu: maybe an action of the menu we are in
        if (consumed === 0 && !(isAbs && segs.length > 1)) break outer;
        break outer;
      }
      cur = [...cur, next];
      consumed++;
    }
    i++;
  }

  const rest = toks.slice(i);
  const tool = toolAt(cur);
  const menu = menuAt(cur);

  if (!tool && !menu && cur.length && rest[0]?.text === 'export') return { output: exportConfig(dev, cur, rest.some((t) => t.text === 'terse')), ctx };

  if (!tool && !menu) {
    if (i === toks.length) {
      if (children(cur).length === 0 && cur.length === 0) throw new CliError(`bad command name ${toks[0].text.replace(/^\//, '')} (line 1 column ${toks[0].start + 1 + (toks[0].text.startsWith('/') ? 1 : 0)})`);
      return { output: '', ctx: cur };
    }
    const bad = toks[i];
    const slash = bad.text.startsWith('/') ? 1 : 0;
    throw new CliError(`bad command name ${bad.text.slice(slash)} (line 1 column ${bad.start + 1 + slash})`);
  }

  if (tool) return { output: tool.run(dev, parseArgs(rest, { path: [] } as Menu, line), line), ctx: ctx };

  const m = menu!;
  if (!rest.length) return { output: '', ctx: cur };

  const actionTok = rest[0];
  if (actionTok.text === 'export') return { output: exportConfig(dev, cur, rest.some((t) => t.text === 'terse')), ctx };
  const base = m.actions ?? (m.entries ? LIST_ACTIONS.filter((a) => a === 'print' || a === 'get' || (a === 'add' && m.add) || (a === 'remove' && m.remove) || (a === 'set' && m.set) || ((a === 'enable' || a === 'disable') && m.toggle) || (a === 'move' && m.move) || (a === 'comment' && m.set)) : []);
  const actions = [...base, ...Object.keys(m.extra ?? {})];
  const action = abbrev(actionTok.text, actions);
  if (action === null || action === 'ambiguous') throw new CliError(`bad command name ${actionTok.text} (line 1 column ${actionTok.start + 1})`);
  const args = parseArgs(rest.slice(1), m, line, action === 'print');

  if (m.extra?.[action]) return { output: m.extra[action](dev, args), ctx };
  if (m.run) return { output: m.run(dev, action, args, line), ctx: ctx };

  const entries = m.entries!(dev);

  if (action === 'print') {
    let rows = entries.filter((e) => whereHit(e, args.where));
    if (args.flags.has('count-only')) return { output: String(rows.length), ctx };
    if (!rows.length && m.path[0] !== 'ip' && !m.emptyLegend) return { output: '', ctx };
    if (args.bare.length) rows = select(entries, args.bare[0], dev, m);

    // Handle value-list format: property names right-aligned to 16 chars, then ": " and value
    if (args.flags.has('value-list')) {
      const lines: string[] = [];
      for (const e of rows) {
        if (e.props.comment) lines.push(`${' '.repeat(16)};;; ${e.props.comment}`);
        for (const [k, v] of Object.entries(e.props)) {
          if (k !== 'comment' && k !== 'disabled') {
            lines.push(`${k.padStart(16)}: ${v}`);
          }
        }
        // Add flags field at the end
        lines.push(`${'flags'.padStart(16)}: ${e.flags}`);
        lines.push('');
      }
      return { output: lines.join('\n'), ctx };
    }

    // as-value format: currently returns empty per RouterOS 7.16 behavior
    if (args.flags.has('as-value')) return { output: '', ctx };

    const mode = args.flags.has('terse') ? 'terse' : args.flags.has('stats') ? 'stats' : 'table';
    if (args.flags.has('detail') && !args.flags.has('terse') && m.detail && rows.length) {
      const sp = m.detail;
      return { output: renderBlocks(sp.legend.split(String.fromCharCode(10)).map((l) => (l ? l + ' ' : l)).join(String.fromCharCode(10)), rows.map((e) => ({
        index: e.index,
        flags: sp.flags ? sp.flags(e) : e.flags,
        comment: e.props.comment,
        props: sp.props(e).map(([k, v]) => [k, v === BARE ? v : sp.quote?.includes(k) || v === '' ? `"${v}"` : v] as [string, string]),
      })), sp.flagW, sp.noFlags), ctx };
    }
    if (!rows.length) return { output: mode === 'table' && m.emptyLegend ? m.emptyLegend : mode === 'table' && m.path[1] === 'firewall' ? `Flags: X - disabled, I - invalid; D - dynamic` : '', ctx };
    return { output: m.render!(dev, rows, mode), ctx };
  }

  if (action === 'get') {
    const targets = select(entries, args.bare[0], dev, m);
    if (!targets.length) throw new CliError('no such item');
    // RouterOS 7.16 returns empty for get with property names in this context
    return { output: '', ctx };
  }

  if (action === 'add') {
    const named: Record<string, string> = {};
    for (const f of m.fields ?? []) {
      const a = args.named[f.name];
      if (a) named[f.name] = checkField(f, a.value, a.col, dev);
    }
    const missing = (m.required ?? []).filter((r) => named[r] === undefined);
    if (missing.length) throw new CliError(`Script Error: missing value(s) of argument(s) ${missing.join(' ')}`);
    m.add!(dev, named, args.bare.map((b) => b.text));
    return { output: '', ctx };
  }

  const targets = select(entries, args.bare[0], dev, m);
  const dynamicHit = !!m.skipDynamic && targets.some((t) => t.ref === null);
  const live = m.skipDynamic ? targets.filter((t) => t.ref !== null) : targets;
  if (action === 'remove') { for (const t of [...live].reverse()) m.remove!(dev, t); if (dynamicHit) throw new CliError('no such item (4)'); return { output: '', ctx }; }
  if (action === 'enable' || action === 'disable') { for (const t of live) m.toggle!(dev, t, action === 'disable'); return { output: '', ctx }; }
  if (action === 'move') {
    const destArg = args.named.destination;
    if (!destArg) throw new CliError('missing value(s) of argument(s) destination');
    const dest = Number(destArg.value);
    if (!Number.isInteger(dest) || dest < 0) throw new CliError('invalid value for argument destination');
    m.move!(dev, live, dest);
    if (dynamicHit) throw new CliError('no such item (4)');
    return { output: '', ctx };
  }
  if (action === 'comment') {
    // real RouterOS 7.16 accepts either `comment <numbers> comment=text` or the bare positional form `comment <numbers> text`
    const text = args.named.comment ? args.named.comment.value : args.bare[1] ? unquote(args.bare[1].text) : '';
    for (const t of live) m.set!(dev, t, { comment: text });
    if (dynamicHit) throw new CliError('no such item (4)');
    return { output: '', ctx };
  }
  if (action === 'set') {
    const named: Record<string, string> = {};
    for (const f of m.fields ?? []) {
      const a = args.named[f.name];
      if (a) named[f.name] = checkField(f, a.value, a.col, dev);
    }
    for (const t of live) m.set!(dev, t, named, args.bare.slice(1).map((b) => b.text));
    if (dynamicHit) throw new CliError('no such item (4)');
    return { output: '', ctx };
  }
  return { output: '', ctx };
}

export const SUPPORTED = [
  '/system identity print|set',
  '/interface print|enable|disable',
  '/interface bridge print|add|set|remove|monitor',
  '/interface bridge port print|add|set|remove|monitor',
  '/interface bridge vlan print|add|set|remove',
  '/interface bridge host print',
  '/interface vlan print|add|set|remove',
  '/ip pool print|add|remove',
  '/ip dhcp-server print|add|set|remove, and its network and lease menus',
  '/ip address print|add|set|remove|enable|disable',
  '/ip route print|add|set|remove|enable|disable',
  '/ip firewall filter print|add|set|remove|enable|disable|move|comment',
  '/ip firewall nat print|add|set|remove|enable|disable|move|comment',
  '/ip service print|set|enable|disable',
  '/tool fetch url=http://a.b.c.d[:port]/',
  '/ping',
  '/tool traceroute',
  '/routing ospf instance|area|interface-template print|add|set|remove|enable|disable, and neighbor and interface print',
  '/routing bgp template|connection print|add|set|remove|enable|disable, and session and advertisements print',
  '/routing filter rule print|add|set|remove|enable|disable',
  '/interface wireguard print|add|set|remove|enable|disable, and peers print|add|set|remove|enable|disable',
  '/export',
];
