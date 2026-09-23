import { calcSubnet, parseIPv4 } from '../subnet';

export interface Iface {
  name: string;
  ip: string;
  cidr: number;
}

export interface Route {
  /** Destination prefix, e.g. 10.0.2.0/24 or 0.0.0.0/0. */
  dst: string;
  /** Next-hop IP address, which must sit on a directly connected subnet. */
  via: string;
}

export interface RNode {
  id: string;
  label: string;
  kind: 'host' | 'router' | 'enemy';
  ifaces: Iface[];
  /** Hosts send everything that is not on their own subnet here. */
  gateway?: string;
  routes: Route[];
}

export interface Link {
  a: string;
  ai: string;
  b: string;
  bi: string;
  up: boolean;
}

export interface Net {
  nodes: RNode[];
  links: Link[];
}

export type DropReason = 'no-route' | 'ttl' | 'link-down' | 'next-hop-not-on-link' | 'host-unreachable' | 'no-gateway';

export type Outcome =
  | { delivered: true; path: string[] }
  | { delivered: false; reason: DropReason; at: string; path: string[]; detail: string };

const inSubnet = (ip: string, cidrText: string) => {
  const info = calcSubnet(cidrText);
  const n = parseIPv4(ip);
  return !!info && n !== null && n >= parseIPv4(info.network)! && n <= parseIPv4(info.broadcast)!;
};

const ifaceNet = (i: Iface) => `${i.ip}/${i.cidr}`;
const prefixLen = (dst: string) => Number(dst.split('/')[1]);

/** The interface's far end: the node on the other side of its link. */
function peer(net: Net, nodeId: string, ifName: string): { link: Link; node: RNode; iface: string } | null {
  for (const l of net.links) {
    if (l.a === nodeId && l.ai === ifName) return { link: l, node: net.nodes.find((n) => n.id === l.b)!, iface: l.bi };
    if (l.b === nodeId && l.bi === ifName) return { link: l, node: net.nodes.find((n) => n.id === l.a)!, iface: l.ai };
  }
  return null;
}

const owns = (n: RNode, ip: string) => n.ifaces.some((i) => i.ip === ip);

/**
 * Send one packet from a host to a destination address and follow it hop by hop.
 * Routers pick the most specific matching route (longest prefix); a connected network beats a static route of the same length.
 */
export function sendPacket(net: Net, srcId: string, dstIp: string, ttl = 16): Outcome {
  const path: string[] = [];
  let cur = net.nodes.find((n) => n.id === srcId)!;
  const drop = (reason: DropReason, detail: string): Outcome => ({ delivered: false, reason, at: cur.id, path, detail });
  path.push(cur.id);

  for (let hop = 0; hop < 64; hop++) {
    if (owns(cur, dstIp)) return { delivered: true, path };
    if (ttl <= 0) return drop('ttl', `TTL expired at ${cur.label}. The packet was going round in circles.`);

    // choose the outgoing interface and the next-hop address
    let out: Iface | undefined;
    let nextHop = dstIp;

    if (cur.kind === 'host') {
      if (cur.ifaces.length > 0 && inSubnet(dstIp, ifaceNet(cur.ifaces[0]))) out = cur.ifaces[0];
      else if (!cur.gateway) return drop('no-gateway', `${cur.label} has no gateway, so it cannot send outside its own subnet.`);
      else {
        nextHop = cur.gateway;
        out = cur.ifaces.find((i) => inSubnet(cur.gateway!, ifaceNet(i)));
        if (!out) return drop('next-hop-not-on-link', `${cur.label}'s gateway ${cur.gateway} is not on its own subnet.`);
      }
    } else {
      type Cand = { len: number; distance: number; iface?: Iface; via: string };
      const cands: Cand[] = [];
      for (const i of cur.ifaces) if (inSubnet(dstIp, ifaceNet(i))) cands.push({ len: i.cidr, distance: 0, iface: i, via: dstIp });
      for (const r of cur.routes) if (inSubnet(dstIp, r.dst)) cands.push({ len: prefixLen(r.dst), distance: 1, via: r.via });
      cands.sort((x, y) => y.len - x.len || x.distance - y.distance);
      const best = cands[0];
      if (!best) return drop('no-route', `${cur.label} has no route to ${dstIp}.`);
      nextHop = best.via;
      out = best.iface ?? cur.ifaces.find((i) => inSubnet(best.via, ifaceNet(i)));
      if (!out) return drop('next-hop-not-on-link', `${cur.label} has a route via ${best.via}, but that address is not on any network ${cur.label} is connected to.`);
      ttl--; // routers decrement TTL when they forward
    }

    const p = peer(net, cur.id, out.name);
    if (!p) return drop('host-unreachable', `${cur.label}'s interface ${out.name} is not connected to anything.`);
    if (!p.link.up) return drop('link-down', `The link from ${cur.label} to ${p.node.label} is down.`);
    if (!owns(p.node, nextHop)) return drop('next-hop-not-on-link', `${cur.label} sent the packet towards ${nextHop}, but ${p.node.label} does not own that address.`);
    cur = p.node;
    path.push(cur.id);
  }
  return drop('ttl', 'Too many hops.');
}

/** Every distinct network in the topology, plus the default route, for the route editor's drop-downs. */
export function knownPrefixes(net: Net): string[] {
  const set = new Set<string>();
  for (const n of net.nodes) for (const i of n.ifaces) set.add(`${calcSubnet(ifaceNet(i))!.network}/${i.cidr}`);
  return [...[...set].sort((a, b) => parseIPv4(a.split('/')[0])! - parseIPv4(b.split('/')[0])!), '0.0.0.0/0'];
}

/** Addresses of the neighbours a router could use as a next hop. */
export function nextHopChoices(net: Net, nodeId: string): { ip: string; label: string; kind: RNode['kind'] }[] {
  const node = net.nodes.find((n) => n.id === nodeId)!;
  const out: { ip: string; label: string; kind: RNode['kind'] }[] = [];
  for (const i of node.ifaces) {
    const p = peer(net, nodeId, i.name);
    if (!p) continue;
    for (const pi of p.node.ifaces) if (pi.name === p.iface) out.push({ ip: pi.ip, label: `${p.node.label} (${pi.ip})`, kind: p.node.kind });
  }
  return out;
}

export const withRoutes = (net: Net, routes: Record<string, Route[]>): Net => ({
  ...net,
  nodes: net.nodes.map((n) => ({ ...n, routes: routes[n.id] ?? n.routes })),
});

export const routerOsCommand = (r: Route) => `/ip route add dst-address=${r.dst} gateway=${r.via}`;
