import type { Lab } from '../../data/labs';
import { findLab } from '../../data/allLabs';
import { Device, Network, parseIPv4, runCommand } from './index';
import { computeNetworkStp } from './l2';
import { inNet, parseCidr } from './ip';

/** A check the simulator can run against the network state (or the learner's command history). */
export type Check =
  | { kind: 'ping'; from: string; to: string; src?: string; expect: 'reply' | 'fail' }
  | { kind: 'tcp'; from: string; to: string; port: number; expect: 'connected' | 'fail' }
  | { kind: 'address'; on: string; iface: string; address: string }
  | { kind: 'pc'; on: string; ip: string; gateway: string }
  | { kind: 'route'; on: string; dst: string; via?: string }
  | { kind: 'ran'; on: string; pattern: string }
  | { kind: 'bridge'; on: string; name: string; vlanFiltering?: boolean; protocolMode?: 'rstp' | 'stp' | 'none'; priority?: number }
  | { kind: 'bridge-port'; on: string; iface: string; pvid?: number; frameTypes?: string }
  | { kind: 'bvlan'; on: string; vlan: number; tagged: string[]; untagged: string[] }
  | { kind: 'pc-in'; on: string; net: string }
  | { kind: 'stp-root'; on: string; bridge: string; expect: boolean }
  | { kind: 'stp-root-port'; on: string; bridge: string; port: string }
  | { kind: 'ospf-neighbors'; on: string; count: number }
  | { kind: 'bgp-sessions'; on: string; count: number };

export interface Solution {
  device: string;
  commands: string[];
}

export interface SimTask {
  id: string;
  title: string;
  detail: string;
  hints: string[];
  /** All of these must hold for the task to count as done. */
  checks: Check[];
  solution: Solution[];
}

export interface SimLab {
  labId: string;
  intro: string;
  /** Commands already applied when the lab starts, so the learner only configures what the lab is about. */
  setup: Solution[];
  tasks: SimTask[];
}

/** Everything the learner typed, in order, so a saved lab can be replayed exactly. */
export type History = { dev: string; line: string }[];

export interface Built {
  net: Network;
  lab: Lab;
  history: History;
  ctx: Record<string, string[]>;
}

/** Highest etherN used by a lab's cables, so every router has enough ports. */
function portsFor(lab: Lab, id: string): number {
  let max = 4;
  for (const l of lab.links) {
    for (const [n, i] of [[l.a, l.ai], [l.b, l.bi]] as const) {
      const m = n === id ? /^ether(\d+)$/.exec(i) : null;
      if (m) max = Math.max(max, Number(m[1]));
    }
  }
  return max;
}

/** Can this lab run in the browser? Only routers and PCs on point-to-point cables are supported. */
export const simulatable = (lab: Lab): boolean => lab.nodes.every((n) => n.kind === 'router' || n.kind === 'switch' || n.kind === 'pc');

export function build(spec: SimLab): Built {
  const lab = findLab(spec.labId);
  if (!lab) throw new Error(`no lab ${spec.labId}`);
  const net = new Network();
  lab.nodes.forEach((n, i) => {
    net.add(new Device(n.id, n.kind === 'pc' ? 'pc' : 'router', i, portsFor(lab, n.id)));
  });
  for (const l of lab.links) net.connect(l.a, l.ai, l.b, l.bi);
  const built: Built = { net, lab, history: [], ctx: {} };
  for (const s of spec.setup) for (const c of s.commands) execute(built, s.device, c, false);
  return built;
}

/** Type a line into a device. `record` keeps it in the learner's history (setup commands are not recorded). */
export function execute(b: Built, deviceId: string, line: string, record = true): string {
  const dev = b.net.device(deviceId);
  const r = runCommand(dev, line, b.ctx[deviceId] ?? []);
  b.ctx[deviceId] = r.ctx;
  if (record && line.trim()) b.history.push({ dev: deviceId, line });
  return r.output;
}

/** `@PC3` means "whatever address PC3 has right now" (it may have come from DHCP). */
function ipOf(b: Built, s: string): number {
  if (s.startsWith('@')) return parseIPv4(b.net.device(s.slice(1)).pc.ip ?? '') ?? 0;
  return parseIPv4(s)!;
}

export function evaluate(b: Built, c: Check): boolean {
  const n = b.net;
  switch (c.kind) {
    case 'ping': {
      const r = n.pingOnce(n.device(c.from), ipOf(b, c.to), { srcAddress: c.src ? ipOf(b, c.src) : null });
      return (r.status === 'reply') === (c.expect === 'reply');
    }
    case 'tcp': return (n.tcpConnect(n.device(c.from), ipOf(b, c.to), c.port) === 'connected') === (c.expect === 'connected');
    case 'address': return n.device(c.on).addrs.some((a) => a.iface === c.iface && a.address === c.address && !a.disabled);
    case 'pc': {
      const p = n.device(c.on).pc;
      return p.ip === c.ip && p.gateway === c.gateway;
    }
    case 'route': return n.device(c.on).routeViews().some((v) => !v.connected && v.active && v.dstText === c.dst && (!c.via || v.gateway === c.via));
    case 'ospf-neighbors': return (n.ospfResult().neighbors.get(c.on)?.length ?? 0) === c.count;
    case 'bgp-sessions': return (n.bgpResult().sessions.get(c.on)?.length ?? 0) === c.count;
    case 'ran': return b.history.some((h) => h.dev === c.on && new RegExp(c.pattern).test(h.line));
    case 'bridge': {
      const br = n.device(c.on).bridge(c.name);
      return !!br && (c.vlanFiltering === undefined || br.vlanFiltering === c.vlanFiltering) && (c.protocolMode === undefined || br.protocolMode === c.protocolMode) && (c.priority === undefined || br.priority === c.priority);
    }
    case 'bridge-port': {
      const p = n.device(c.on).bridgePort(c.iface);
      return !!p && (c.pvid === undefined || p.pvid === c.pvid) && (c.frameTypes === undefined || p.frameTypes === c.frameTypes);
    }
    case 'bvlan': {
      const same = (a: string[], z: string[]) => [...a].sort().join() === [...z].sort().join();
      return n.device(c.on).bvlans.some((v) => v.vlanIds.includes(c.vlan) && same(v.tagged, c.tagged) && same(v.untagged, c.untagged));
    }
    case 'pc-in': {
      const p = n.device(c.on).pc;
      const net = parseCidr(c.net);
      const ip = p.ip ? parseIPv4(p.ip) : null;
      return !!net && ip !== null && inNet(ip, net);
    }
    case 'stp-root': {
      const d = n.device(c.on);
      return d.bridge(c.bridge) ? computeNetworkStp(n).bridge(d, c.bridge).rootBridge === c.expect : false;
    }
    case 'stp-root-port': {
      const d = n.device(c.on);
      return d.bridge(c.bridge) ? computeNetworkStp(n).bridge(d, c.bridge).rootPort === c.port : false;
    }
  }
}

export const taskDone = (b: Built, t: SimTask): boolean => t.checks.every((c) => evaluate(b, c));

/** Apply a task's reference solution (used by the "show solution" button, the tests and the tour). */
export function applySolution(b: Built, t: SimTask): void {
  for (const s of t.solution) for (const c of s.commands) execute(b, s.device, c);
}

/** Rebuild a lab from the commands a learner typed. */
export function replay(spec: SimLab, history: History): Built {
  const b = build(spec);
  for (const h of history) execute(b, h.dev, h.line);
  return b;
}
