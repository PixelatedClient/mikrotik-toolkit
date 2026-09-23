import { calcSubnet, parseIPv4 } from '../subnet';

/**
 * A small model of the RouterOS filter firewall (per MikroTik's Firewall documentation):
 * rules in a chain run top to bottom, the first match decides, and a packet that matches no rule is accepted.
 */

export type Chain = 'input' | 'forward';
export type Proto = 'tcp' | 'udp' | 'icmp';
export type ConnState = 'new' | 'established' | 'related' | 'invalid';
export type Action = 'accept' | 'drop' | 'reject';
export type Zone = 'wan' | 'lan';

export interface Packet {
  id: string;
  label: string;
  chain: Chain;
  /** Which side the packet arrives from. */
  iface: Zone;
  src: string;
  dst?: string;
  proto: Proto;
  dstPort?: number;
  /** Connection state as the router's connection tracking would see it. */
  state: 'new' | 'established' | 'invalid';
  /** True for attack traffic that the player should stop. */
  evil: boolean;
  why: string;
}

export interface Rule {
  chain: Chain;
  action: Action;
  proto?: Proto;
  src?: string;
  dst?: string;
  dstPort?: number[];
  state?: ConnState[];
  iface?: Zone;
}

const inCidr = (ip: string, cidr: string) => {
  const info = calcSubnet(cidr);
  const n = parseIPv4(ip);
  return !!info && n !== null && n >= parseIPv4(info.network)! && n <= parseIPv4(info.broadcast)!;
};

export function matches(rule: Rule, p: Packet): boolean {
  if (rule.chain !== p.chain) return false;
  if (rule.iface && rule.iface !== p.iface) return false;
  if (rule.proto && rule.proto !== p.proto) return false;
  if (rule.src && !inCidr(p.src, rule.src)) return false;
  if (rule.dst && (!p.dst || !inCidr(p.dst, rule.dst))) return false;
  if (rule.dstPort && rule.dstPort.length > 0) {
    if (p.proto === 'icmp' || p.dstPort === undefined || !rule.dstPort.includes(p.dstPort)) return false;
  }
  if (rule.state && rule.state.length > 0 && !rule.state.includes(p.state)) return false;
  return true;
}

export interface Verdict {
  action: Action;
  /** Index of the rule that decided, or null when no rule matched. */
  rule: number | null;
}

export function evaluate(rules: Rule[], p: Packet): Verdict {
  for (let i = 0; i < rules.length; i++) if (matches(rules[i], p)) return { action: rules[i].action, rule: i };
  return { action: 'accept', rule: null }; // no rule matched: accepted
}

export interface PacketResult {
  packet: Packet;
  verdict: Verdict;
  blocked: boolean;
  /** True when the packet met the player's goal for it. */
  ok: boolean;
}

export interface Score {
  results: PacketResult[];
  evilBlocked: number;
  evilTotal: number;
  goodAllowed: number;
  goodTotal: number;
  perfect: boolean;
  /** Attack traffic that got through. */
  leaked: PacketResult[];
  /** Legitimate traffic that was wrongly stopped. */
  collateral: PacketResult[];
}

export function score(rules: Rule[], packets: Packet[]): Score {
  const results = packets.map((packet) => {
    const verdict = evaluate(rules, packet);
    const blocked = verdict.action !== 'accept';
    return { packet, verdict, blocked, ok: packet.evil ? blocked : !blocked };
  });
  const evil = results.filter((r) => r.packet.evil);
  const good = results.filter((r) => !r.packet.evil);
  return {
    results,
    evilBlocked: evil.filter((r) => r.blocked).length,
    evilTotal: evil.length,
    goodAllowed: good.filter((r) => !r.blocked).length,
    goodTotal: good.length,
    perfect: results.every((r) => r.ok),
    leaked: evil.filter((r) => !r.blocked),
    collateral: good.filter((r) => r.blocked),
  };
}

/** The real RouterOS command for a rule. */
export function toRouterOs(r: Rule): string {
  const parts = [`chain=${r.chain}`, `action=${r.action}`];
  if (r.state && r.state.length) parts.push(`connection-state=${r.state.join(',')}`);
  if (r.proto) parts.push(`protocol=${r.proto}`);
  if (r.src) parts.push(`src-address=${r.src}`);
  if (r.dst) parts.push(`dst-address=${r.dst}`);
  if (r.dstPort && r.dstPort.length) parts.push(`dst-port=${r.dstPort.join(',')}`);
  if (r.iface) parts.push(`in-interface-list=${r.iface.toUpperCase()}`);
  return `/ip firewall filter add ${parts.join(' ')}`;
}

/** A plain-English reading of a rule, for the rule list. */
export function describeRule(r: Rule): string {
  const what = [
    r.state?.length ? `${r.state.join('/')} connections` : 'traffic',
    r.proto ? `using ${r.proto.toUpperCase()}` : '',
    r.dstPort?.length ? `to port ${r.dstPort.join(', ')}` : '',
    r.src ? `from ${r.src}` : '',
    r.dst ? `to ${r.dst}` : '',
    r.iface ? `arriving from the ${r.iface.toUpperCase()}` : '',
  ].filter(Boolean).join(' ');
  return `${r.action === 'accept' ? 'Allow' : r.action === 'drop' ? 'Drop' : 'Reject'} ${what} (${r.chain} chain)`;
}

export const emptyRule = (chain: Chain = 'input'): Rule => ({ chain, action: 'drop' });
