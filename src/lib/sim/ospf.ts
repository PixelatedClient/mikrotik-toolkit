/**
 * A small OSPF (v2) model for the simulator: which interfaces run OSPF, which routers become neighbours, and the routes
 * every router learns (shortest path over interface costs). It converges instantly; real RouterOS needs seconds (and up to
 * 40 s of "waiting" on broadcast interfaces). Formats and defaults follow output captured from RouterOS 7.16.
 */
import { inNet, netText, parseCidr, parseIPv4, formatIPv4, type Cidr } from './ip';
import type { Device } from './device';
import type { Network } from './network';
import { segment } from './l2';

export interface OspfInstance { name: string; version: number; routerId: string; disabled: boolean }
export interface OspfArea { name: string; areaId: string; instance: string; disabled: boolean }
export interface OspfTemplate {
  area: string;
  networks: string;
  cost?: number;
  type: 'broadcast' | 'ptp' | 'ptmp' | 'nbma' | 'ptp-unnumbered' | 'virtual-link';
  passive: boolean;
  useBfd: boolean;
  disabled: boolean;
  priority: number;
  helloInterval: string;
  deadInterval: string;
}

export interface OspfConfig { instances: OspfInstance[]; areas: OspfArea[]; templates: OspfTemplate[] }
export const emptyOspf = (): OspfConfig => ({ instances: [], areas: [], templates: [] });

/** An interface that runs OSPF. */
export interface OspfIface {
  dev: Device;
  iface: string;
  address: string;
  ip: number;
  cidr: Cidr;
  area: string;
  areaId: string;
  cost: number;
  type: OspfTemplate['type'];
  passive: boolean;
  template: OspfTemplate;
  routerId: string;
}

export interface OspfNeighbor {
  local: OspfIface;
  address: string;
  routerId: string;
  peerIp: number;
  peerDev: Device;
  /** The address of the elected designated router / backup on this link (broadcast networks only). */
  dr: string;
  bdr: string;
}

export interface OspfRoute { dst: Cidr; gateway: number; iface: string; metric: number }

export interface OspfResult {
  ifaces: Map<string, OspfIface[]>;
  neighbors: Map<string, OspfNeighbor[]>;
  routes: Map<string, OspfRoute[]>;
}

/** Interfaces of one router that run OSPF (an address inside a template's `networks`). */
function participating(dev: Device): OspfIface[] {
  const cfg = dev.ospf;
  const inst = cfg.instances.find((i) => !i.disabled);
  if (!inst) return [];
  const out: OspfIface[] = [];
  for (const a of dev.activeAddrs()) {
    for (const t of cfg.templates) {
      if (t.disabled) continue;
      const area = cfg.areas.find((x) => x.name === t.area && x.instance === inst.name && !x.disabled);
      if (!area) continue;
      const net = parseCidr(t.networks);
      if (!net || !inNet(a.cidr.ip, net)) continue;
      out.push({
        dev, iface: a.iface, address: a.text, ip: a.cidr.ip, cidr: a.cidr, area: area.name, areaId: area.areaId,
        cost: t.cost ?? 1, type: t.type, passive: t.passive, template: t, routerId: inst.routerId,
      });
      break;
    }
  }
  return out.sort((a, b) => dev.ifaces.findIndex((i) => i.name === a.iface) - dev.ifaces.findIndex((i) => i.name === b.iface));
}

export function computeOspf(net: Network): OspfResult {
  const ifaces = new Map<string, OspfIface[]>();
  for (const dev of net.devices.values()) if (dev.kind === 'router') ifaces.set(dev.id, participating(dev));

  // ----- neighbours: same segment, same area, same subnet, neither side passive -----
  const neighbors = new Map<string, OspfNeighbor[]>();
  for (const [id, list] of ifaces) {
    const found: OspfNeighbor[] = [];
    for (const me of list) {
      if (me.passive || !me.dev.running(me.iface)) continue;
      const seg = segment(net, me.dev, me.iface, null);
      for (const ep of seg.endpoints) {
        if (ep.dev.id === id) continue;
        const theirs = ifaces.get(ep.dev.id)?.find((o) => o.iface === ep.iface && !o.passive);
        if (!theirs || theirs.areaId !== me.areaId || theirs.type !== me.type) continue;
        if (!inNet(theirs.ip, me.cidr)) continue;
        // on broadcast links the DR is the highest priority, then the highest router id; the BDR the next one
        let dr = '0.0.0.0', bdr = '0.0.0.0';
        if (me.type === 'broadcast') {
          const cands = [me, theirs].sort((x, y) => (y.template.priority - x.template.priority) || (parseIPv4(y.routerId)! - parseIPv4(x.routerId)!));
          dr = formatIPv4(cands[0].ip);
          bdr = formatIPv4(cands[1].ip);
        }
        found.push({ local: me, address: formatIPv4(theirs.ip), routerId: theirs.routerId, peerIp: theirs.ip, peerDev: ep.dev, dr, bdr });
      }
    }
    neighbors.set(id, found.sort((a, b) => a.peerIp - b.peerIp));
  }

  // ----- what every router advertises: the network of each OSPF interface at that interface's cost -----
  const stubs = new Map<string, { dst: Cidr; cost: number }[]>();
  for (const [id, list] of ifaces) stubs.set(id, list.map((i) => ({ dst: { ...i.cidr, ip: i.cidr.net }, cost: i.cost })));

  // ----- shortest paths (Dijkstra over routers) and the routes each router learns -----
  const routes = new Map<string, OspfRoute[]>();
  for (const dev of net.devices.values()) {
    if (dev.kind !== 'router' || !ifaces.get(dev.id)?.length) continue;
    const dist = new Map<string, number>([[dev.id, 0]]);
    const first = new Map<string, OspfNeighbor>(); // first hop towards each router
    const todo = new Set<string>([dev.id]);
    const done = new Set<string>();
    while (todo.size) {
      let cur = '';
      for (const id of todo) if (cur === '' || dist.get(id)! < dist.get(cur)!) cur = id;
      todo.delete(cur);
      if (done.has(cur)) continue;
      done.add(cur);
      for (const nb of neighbors.get(cur) ?? []) {
        const id = nb.peerDev.id;
        const d = dist.get(cur)! + nb.local.cost;
        if (d < (dist.get(id) ?? Infinity)) {
          dist.set(id, d);
          first.set(id, cur === dev.id ? nb : first.get(cur)!);
          todo.add(id);
        }
      }
    }
    const best = new Map<string, OspfRoute>();
    const mine = dev.activeAddrs();
    for (const [rid, d] of dist) {
      if (rid === dev.id) continue;
      const hop = first.get(rid);
      if (!hop) continue;
      for (const s of stubs.get(rid) ?? []) {
        if (mine.some((a) => a.cidr.net === s.dst.net && a.cidr.cidr === s.dst.cidr)) continue; // connected wins
        const key = netText(s.dst);
        const metric = d + s.cost;
        const have = best.get(key);
        if (!have || metric < have.metric) best.set(key, { dst: s.dst, gateway: hop.peerIp, iface: hop.local.iface, metric });
      }
    }
    routes.set(dev.id, [...best.values()]);
  }
  return { ifaces, neighbors, routes };
}
