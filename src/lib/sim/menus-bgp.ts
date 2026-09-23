/**
 * /routing bgp template | connection | session (read only) | advertisements (read only), and /routing filter rule.
 * BGP connection and session always print in the block layout (there is no flat table form), and repeated dotted
 * prefixes collapse to `.suffix` on the second and later property of the same group - both captured from RouterOS 7.16
 * (tools/conformance/scenarios/bgp.json). The BGP engine itself lives in bgp.ts; this file is only the CLI surface.
 */
import { CliError, registerMenu, registerTool, type Entry, type Menu } from './cli';
import { formatIPv4, parseIPv4 } from './ip';
import type { BgpConnection, BgpTemplate } from './bgp';
import { BARE, renderBlocks } from './table';

const YES_NO = ['yes', 'no'] as const;

/** name -> [key, value][], folding a repeated leading "group." prefix down to ".rest". */
function fold(props: [string, string | typeof BARE][]): [string, string][] {
  const out: [string, string][] = [];
  let prevPrefix: string | null = null;
  for (const [key, value] of props) {
    const dot = key.indexOf('.');
    const prefix = dot > 0 ? key.slice(0, dot) : null;
    const shown = prefix && prefix === prevPrefix ? key.slice(dot) : key;
    prevPrefix = prefix;
    out.push([shown, value === BARE ? BARE : (value as string)]);
  }
  return out as [string, string][];
}

const legend = (text: string, rows: unknown[]) => text + (rows.length ? ' ' : '');
const q = (v: string) => `"${v}"`;

/**
 * `/routing bgp connection` and `session` print in fixed property GROUPS (name; remote.*; local.*; the instance
 * fields; output.*; input.*, and for a session two trailing scalar groups) - a new group always starts a fresh line,
 * even when it would fit on the one before, and only wraps by width (80 columns) inside a group. This is specific to
 * these two commands (captured from RouterOS 7.16); everything else in the simulator wraps purely by width.
 */
function renderGrouped(legendText: string, blocks: { index: number; flags: string; groups: [string, string | typeof BARE][][] }[]): string {
  const lines: string[] = legendText.trim() ? [legendText] : [];
  const iw = Math.max(2, ...blocks.map((b) => String(b.index).length));
  const flagW = 1;
  const indent = ' '.repeat(iw + 2 + flagW);
  for (const b of blocks) {
    const head = `${String(b.index).padStart(iw)} ${b.flags.padEnd(flagW)} `;
    const out: string[] = [];
    let first = true;
    for (const group of blocks.indexOf(b) >= 0 ? b.groups : []) {
      if (!group.length) continue;
      let cur = first ? head : indent;
      first = false;
      for (const [k, v] of fold(group)) {
        const piece = v === BARE ? `${k} ` : `${k}=${v} `;
        if (cur.length + piece.length > 80 && cur !== head && cur !== indent) { out.push(cur); cur = indent; }
        cur += piece;
      }
      out.push(cur);
    }
    lines.push(...out, '');
  }
  return lines.join('\n').replace(/\n+$/, '');
}

// ---------- template ----------

const DEFAULT_TEMPLATE: BgpTemplate = { name: 'default', as: 65530, routerId: '', disabled: false };

const templateMenu: Menu = {
  path: ['routing', 'bgp', 'template'],
  fields: [
    { name: 'name', kind: 'string' }, { name: 'as', kind: 'int' }, { name: 'router-id', kind: 'ip' },
    { name: 'comment', kind: 'string' }, { name: 'disabled', kind: 'enum', values: YES_NO },
  ],
  required: ['name'],
  entries: (d) => [DEFAULT_TEMPLATE, ...d.bgp.templates].map((t, n) => ({
    index: n,
    flags: `${t === DEFAULT_TEMPLATE ? '*' : ''}${t.disabled ? 'X' : ''}`,
    props: { name: t.name, 'routing-table': 'main', ...(t.routerId ? { 'router-id': t.routerId } : {}), as: String(t.as) },
    ref: t,
  })),
  add(d, a) {
    if (d.bgp.templates.some((t) => t.name === a.name) || a.name === 'default') throw new CliError('failure: item with such name already exists');
    d.bgp.templates.push({ name: a.name, as: Number(a.as ?? 65530), routerId: a['router-id'] ?? '', disabled: a.disabled === 'yes' });
  },
  remove(d, e) {
    if (e.ref === DEFAULT_TEMPLATE) throw new CliError('failure: cannot remove default template');
    d.bgp.templates = d.bgp.templates.filter((t) => t !== e.ref);
  },
  toggle(_d, e, off) { (e.ref as BgpTemplate).disabled = off; },
  set(_d, e, a) {
    const t = e.ref as BgpTemplate;
    if (a.as) t.as = Number(a.as);
    if (a['router-id']) t.routerId = a['router-id'];
    if (a.disabled) t.disabled = a.disabled === 'yes';
  },
  render: (_d, rows) => renderBlocks(
    legend('Flags: * - default; X - disabled, I - inactive', rows),
    rows.map((e) => ({ index: e.index, flags: e.flags, props: fold(Object.entries(e.props).map(([k, v]) => [k, k === 'name' ? q(v) : v] as [string, string | typeof BARE])) })),
    2,
  ),
  emptyLegend: 'Flags: * - default; X - disabled, I - inactive',
};

// ---------- connection ----------

const connectionMenu: Menu = {
  path: ['routing', 'bgp', 'connection'],
  fields: [
    { name: 'name', kind: 'string' }, { name: 'templates', kind: 'string' },
    { name: 'local.address', kind: 'ip' }, { name: 'local.role', kind: 'enum', values: ['ebgp', 'ibgp'] },
    { name: 'remote.address', kind: 'ip' }, { name: 'remote.as', kind: 'int' },
    { name: 'output.network', kind: 'string' }, { name: 'output.filter-chain', kind: 'string' }, { name: 'input.filter', kind: 'string' },
    { name: 'comment', kind: 'string' }, { name: 'disabled', kind: 'enum', values: YES_NO },
  ],
  required: ['remote.address'],
  entries: (d) => d.bgp.connections.map((c, n) => {
    const t = d.bgp.templates.find((x) => x.name === c.templates);
    return {
      index: n, flags: c.disabled ? 'X' : '',
      props: {
        name: c.name, 'remote.address': c.remoteAddress, 'remote.as': String(c.remoteAs),
        'local.address': c.localAddress, 'local.role': c.localRole,
        'routing-table': 'main', ...(t?.routerId ? { 'router-id': t.routerId } : {}), templates: c.templates, as: String(t?.as ?? ''),
        ...(c.outputFilterChain ? { 'output.filter-chain': c.outputFilterChain } : {}), ...(c.outputNetwork ? { 'output.network': c.outputNetwork } : {}),
        ...(c.inputFilter ? { 'input.filter': c.inputFilter } : {}),
      },
      ref: c,
    };
  }),
  add(d, a) {
    if (a.name && d.bgp.connections.some((c) => c.name === a.name)) throw new CliError('failure: item with such name already exists');
    const c: BgpConnection = {
      name: a.name ?? `conn${d.bgp.connections.length + 1}`, templates: a.templates ?? 'default',
      localAddress: a['local.address'] ?? '', localRole: (a['local.role'] as 'ebgp' | 'ibgp') ?? 'ebgp',
      remoteAddress: a['remote.address'], remoteAs: Number(a['remote.as'] ?? 0),
      outputNetwork: a['output.network'], outputFilterChain: a['output.filter-chain'], inputFilter: a['input.filter'],
      disabled: a.disabled === 'yes',
    };
    d.bgp.connections.push(c);
  },
  remove(d, e) { d.bgp.connections = d.bgp.connections.filter((c) => c !== e.ref); },
  toggle(_d, e, off) { (e.ref as BgpConnection).disabled = off; },
  set(_d, e, a) {
    const c = e.ref as BgpConnection;
    if (a['local.address']) c.localAddress = a['local.address'];
    if (a['local.role']) c.localRole = a['local.role'] as 'ebgp' | 'ibgp';
    if (a['remote.address']) c.remoteAddress = a['remote.address'];
    if (a['remote.as']) c.remoteAs = Number(a['remote.as']);
    if (a['output.network']) c.outputNetwork = a['output.network'];
    if (a['output.filter-chain']) c.outputFilterChain = a['output.filter-chain'];
    if (a['input.filter']) c.inputFilter = a['input.filter'];
    if (a.templates) c.templates = a.templates;
    if (a.disabled) c.disabled = a.disabled === 'yes';
  },
  render: (_d, rows) => renderGrouped(
    legend('Flags: D - dynamic, X - disabled, I - inactive', rows),
    rows.map((e) => {
      const p = e.props as Record<string, string>;
      return {
        index: e.index!, flags: e.flags,
        groups: [
          [['name', q(p.name)]],
          [['remote.address', p['remote.address']], ['remote.as', p['remote.as']]],
          [['local.address', p['local.address']], ['local.role', p['local.role']]],
          [['routing-table', p['routing-table']], ...(p['router-id'] ? [['router-id', p['router-id']]] : []), ['templates', p.templates], ['as', p.as]],
          [...(p['output.filter-chain'] ? [['output.filter-chain', p['output.filter-chain']]] : []), ...(p['output.network'] ? [['output.network', p['output.network']]] : [])],
          [...(p['input.filter'] ? [['input.filter', p['input.filter']]] : [])],
        ] as [string, string][][],
      };
    }),
  ),
  emptyLegend: 'Flags: D - dynamic, X - disabled, I - inactive',
};

// ---------- session (read only) ----------

const sessionMenu: Menu = {
  path: ['routing', 'bgp', 'session'],
  entries(d) {
    const res = d.net?.bgpResult();
    const list = res?.sessions.get(d.id) ?? [];
    const myRoutes = res?.routes.get(d.id) ?? [];
    return list.map((s, n) => ({
      index: n, flags: 'E',
      props: {
        name: `${s.conn.name}-1`,
        'remote.address': s.conn.remoteAddress, 'remote.as': String(s.conn.remoteAs), 'remote.id': s.peerTemplate.routerId,
        'remote.capabilities': 'mp,rr,gr,as4', 'remote.afi': 'ip', 'remote.messages': '2', 'remote.bytes': '67', 'remote.eor': '',
        'local.address': s.conn.localAddress, 'local.as': String(s.template.as), 'local.id': s.template.routerId,
        'local.cluster-id': s.template.routerId, 'local.capabilities': 'mp,rr,gr,as4', 'local.afi': 'ip', 'local.messages': '2', 'local.bytes': '67', 'local.eor': '',
        'output.procid': '20', 'output.filter-chain': s.conn.outputFilterChain ?? '', 'output.network': s.conn.outputNetwork ?? '',
        'input.procid': '20', 'input.filter': s.conn.inputFilter ?? '',
        role: s.conn.localRole,
        'hold-time': '3m', 'keepalive-time': '1m', uptime: '14s930ms', 'last-started': '2026-01-01 00:00:00',
        'prefix-count': String(myRoutes.filter((r) => r.gateway === parseIPv4(s.conn.remoteAddress)).length),
      },
      ref: s,
    }));
  },
  render: (_d, rows) => renderGrouped(
    legend('Flags: E - established', rows),
    rows.map((e) => {
      const p = e.props as Record<string, string>;
      return {
        index: e.index!, flags: e.flags,
        groups: [
          [['name', q(p.name)]],
          [['remote.address', p['remote.address']], ['remote.as', p['remote.as']], ['remote.id', p['remote.id']], ['remote.capabilities', p['remote.capabilities']], ['remote.afi', p['remote.afi']], ['remote.messages', p['remote.messages']], ['remote.bytes', p['remote.bytes']], ['remote.eor', q('')]],
          [['local.address', p['local.address']], ['local.as', p['local.as']], ['local.id', p['local.id']], ['local.cluster-id', p['local.cluster-id']], ['local.capabilities', p['local.capabilities']], ['local.afi', p['local.afi']], ['local.messages', p['local.messages']], ['local.bytes', p['local.bytes']], ['local.eor', q('')]],
          [['output.procid', p['output.procid']], ...(p['output.filter-chain'] ? [['output.filter-chain', p['output.filter-chain']]] : []), ...(p['output.network'] ? [['output.network', p['output.network']]] : [])],
          [['input.procid', p['input.procid']], ...(p['input.filter'] ? [['input.filter', p['input.filter']]] : []), [p.role, BARE]],
          [['hold-time', p['hold-time']], ['keepalive-time', p['keepalive-time']], ['uptime', p.uptime]],
          [['last-started', p['last-started']], ['prefix-count', p['prefix-count']]],
        ] as [string, string | typeof BARE][][],
      };
    }),
  ),
  emptyLegend: 'Flags: E - established',
};

// ---------- advertisements (read only) ----------

registerTool({
  path: ['routing', 'bgp', 'advertisements'],
  run(d) {
    const res = d.net?.bgpResult();
    const out: string[] = [];
    let i = 0;
    for (const [connName, adverts] of res?.advertised.get(d.id) ?? []) {
      for (const a of adverts) {
        out.push(` ${i} peer=${connName} dst=${a.dst.net ? `${formatIPv4(a.dst.net)}/${a.dst.cidr}` : ''} afi=ip nexthop=${formatIPv4(a.nexthop)} origin=0`);
        out.push(`   as-path=${a.asPath.length ? `sequence ${a.asPath.join(',')}` : 'empty'}`);
        i++;
      }
    }
    return out.join('\n');
  },
});

// ---------- /routing filter rule ----------

const filterRuleMenu: Menu = {
  path: ['routing', 'filter', 'rule'],
  fields: [{ name: 'chain', kind: 'string' }, { name: 'rule', kind: 'string' }, { name: 'comment', kind: 'string' }, { name: 'disabled', kind: 'enum', values: YES_NO }, { name: 'place-before', kind: 'int' }],
  required: ['chain', 'rule'],
  entries: (d) => d.bgp.filters.map((r, n) => ({ index: n, flags: r.disabled ? 'X' : '', props: { ...(r.comment ? { comment: r.comment } : {}), chain: r.chain, rule: r.text, disabled: r.disabled ? 'yes' : 'no' }, ref: r })),
  add(d, a, bare) {
    void bare;
    const at = a['place-before'] === undefined ? -1 : Number(a['place-before']);
    const rule = { chain: a.chain, text: a.rule, comment: a.comment, disabled: a.disabled === 'yes' };
    if (at >= 0) d.bgp.filters.splice(at, 0, rule); else d.bgp.filters.push(rule);
  },
  remove(d, e) { d.bgp.filters = d.bgp.filters.filter((r) => r !== e.ref); },
  toggle(_d, e, off) { (e.ref as { disabled: boolean }).disabled = off; },
  set(_d, e, a) {
    const r = e.ref as { chain: string; text: string; comment?: string; disabled: boolean };
    if (a.chain) r.chain = a.chain;
    if (a.rule) r.text = a.rule;
    if ('comment' in a) r.comment = a.comment || undefined;
    if (a.disabled) r.disabled = a.disabled === 'yes';
  },
  render: (_d, rows) => renderBlocks(
    legend('Flags: X - disabled, I - inactive', rows),
    rows.map((e) => ({ index: e.index, flags: e.flags, comment: e.props.comment, props: [['chain', e.props.chain], ['rule', q(e.props.rule)]] })),
    1,
  ),
  emptyLegend: 'Flags: X - disabled, I - inactive',
};

for (const m of [templateMenu, connectionMenu, sessionMenu, filterRuleMenu]) registerMenu(m);
