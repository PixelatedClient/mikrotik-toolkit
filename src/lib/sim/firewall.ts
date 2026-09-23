import type { Device, FwRule } from './device';
import { inNet, parseCidr, parseIPv4 } from './ip';
import type { Packet } from './network';

export const FILTER_CHAINS = ['input', 'forward', 'output'] as const;
export const NAT_CHAINS = ['srcnat', 'dstnat'] as const;
export const FILTER_ACTIONS = ['accept', 'add-dst-to-address-list', 'add-src-to-address-list', 'drop', 'fasttrack-connection', 'jump', 'log', 'passthrough', 'reject', 'return', 'tarpit'] as const;
export const NAT_ACTIONS = ['accept', 'add-dst-to-address-list', 'add-src-to-address-list', 'dst-nat', 'jump', 'log', 'masquerade', 'netmap', 'passthrough', 'redirect', 'return', 'same', 'src-nat'] as const;

/** Parameters of the action; printed right after `action=` (order captured from RouterOS 7.16). */
export const ACTION_PROPS = ['jump-target', 'reject-with', 'to-addresses', 'to-ports', 'address-list', 'address-list-timeout', 'hw-offload'] as const;

/** Match conditions, in the order print shows them (captured from RouterOS 7.16). */
export const MATCH_PROPS = [
  'tcp-flags', 'connection-state', 'connection-nat-state', 'connection-limit', 'protocol', 'src-address', 'dst-address', 'fragment', 'psd',
  'ipv4-options', 'src-address-type', 'dst-address-type', 'src-address-list', 'dst-address-list', 'hotspot', 'ttl', 'connection-mark',
  'routing-mark', 'in-interface', 'out-interface', 'in-interface-list', 'out-interface-list', 'in-bridge-port', 'out-bridge-port',
  'packet-mark', 'src-port', 'dst-port', 'port', 'icmp-options', 'src-mac-address', 'content', 'ingress-priority', 'dscp', 'limit',
  'dst-limit', 'time', 'random', 'nth', 'per-connection-classifier', 'packet-size', 'log', 'log-prefix', 'ipsec-policy',
] as const;

/** Every property a rule can carry, in print order. */
export const RULE_PROPS = [...ACTION_PROPS, ...MATCH_PROPS] as const;

const neg = (v: string): [boolean, string] => (v.startsWith('!') ? [true, v.slice(1)] : [false, v]);

function portMatch(spec: string, port: number | undefined): boolean {
  if (port === undefined) return false;
  const [n, body] = neg(spec);
  const hit = body.split(',').some((part) => {
    const [a, b] = part.split('-').map(Number);
    return b === undefined ? port === a : port >= a && port <= b;
  });
  return n ? !hit : hit;
}

function addrMatch(spec: string, ip: number): boolean {
  const [n, body] = neg(spec);
  const c = parseCidr(body);
  if (!c) return false;
  const hit = inNet(ip, c);
  return n ? !hit : hit;
}

/** src/dst-address-list: the address must be in one of the (non-disabled) entries of the named list. */
function listMatch(dev: Device | undefined, spec: string, ip: number): boolean {
  if (!dev) return false;
  const [n, name] = neg(spec);
  const hit = dev.addressLists.some((e) => e.list === name && !e.disabled && (() => { const c = parseCidr(e.address.includes('/') ? e.address : e.address + '/32'); return !!c && inNet(ip, c); })());
  return n ? !hit : hit;
}

/** in/out-interface-list: the interface must be a member of the list; the built-in lists are all, none, dynamic, static. */
function ifListMatch(dev: Device | undefined, spec: string, iface: string | null): boolean {
  if (!dev) return false;
  const [n, name] = neg(spec);
  let hit = false;
  if (iface !== null) {
    if (name === 'all') hit = true;
    else if (name === 'static') hit = dev.iface(iface)?.type === 'ether' || dev.iface(iface)?.type === 'bridge' || dev.iface(iface)?.type === 'vlan';
    else hit = dev.ifListMembers.some((m) => m.list === name && m.interface === iface && !m.disabled);
  }
  return n ? !hit : hit;
}

export interface Ctx {
  chain: string;
  pkt: Packet;
  inIface: string | null;
  outIface: string | null;
}

export function ruleMatches(rule: FwRule, ctx: Ctx, dev?: Device): boolean {
  if (rule.disabled || rule.chain !== ctx.chain) return false;
  const { pkt } = ctx;
  for (const [k, v] of Object.entries(rule.props)) {
    switch (k) {
      case 'protocol': { const [n, b] = neg(v); if ((pkt.proto === b) === n) return false; break; }
      case 'src-address': if (!addrMatch(v, pkt.src)) return false; break;
      case 'dst-address': if (!addrMatch(v, pkt.dst)) return false; break;
      case 'src-port': if (!portMatch(v, pkt.sport)) return false; break;
      case 'dst-port': if (!portMatch(v, pkt.dport)) return false; break;
      case 'in-interface': { const [n, b] = neg(v); if ((ctx.inIface === b) === n) return false; break; }
      case 'out-interface': { const [n, b] = neg(v); if ((ctx.outIface === b) === n) return false; break; }
      case 'connection-state': { const [n, b] = neg(v); const has = b.split(',').includes(pkt.state); if (has === n) return false; break; }
      case 'connection-nat-state': {
        const [n, b] = neg(v);
        const states: string[] = [];
        if (pkt.flow.dnat) states.push('dstnat');
        if (pkt.flow.snat) states.push('srcnat');
        const has = b.split(',').some((s) => states.includes(s));
        if (has === n) return false;
        break;
      }
      case 'src-address-list': if (!listMatch(dev, v, pkt.src)) return false; break;
      case 'dst-address-list': if (!listMatch(dev, v, pkt.dst)) return false; break;
      case 'in-interface-list': if (!ifListMatch(dev, v, ctx.inIface)) return false; break;
      case 'out-interface-list': if (!ifListMatch(dev, v, ctx.outIface)) return false; break;
      default: break; // action parameters and conditions the simulator does not model are ignored
    }
  }
  return true;
}

export type Verdict = { action: 'accept' | 'drop' | 'reject'; rule: FwRule | null };

/** First matching rule decides; a packet that matches nothing is accepted. */
export function filterVerdict(dev: Device, ctx: Ctx): Verdict {
  for (const r of dev.filter) {
    if (!ruleMatches(r, ctx, dev)) continue;
    r.packets++;
    r.bytes += pkt_size(ctx.pkt);
    if (r.action === 'accept' || r.action === 'drop' || r.action === 'reject') return { action: r.action, rule: r };
    // passthrough and log keep going
  }
  return { action: 'accept', rule: null };
}

const pkt_size = (p: Packet) => p.size;

export function firstNat(dev: Device, ctx: Ctx): FwRule | null {
  for (const r of dev.natRules) {
    if (!ruleMatches(r, ctx, dev)) continue;
    r.packets++;
    r.bytes += pkt_size(ctx.pkt);
    if (r.action === 'passthrough' || r.action === 'log') continue;
    return r;
  }
  return null;
}

export const isIp = (s: string) => parseIPv4(s) !== null;
