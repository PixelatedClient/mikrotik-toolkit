/**
 * Layer 2: bridges, VLANs and spanning tree.
 *
 * `segment()` answers "which devices would receive a broadcast frame sent out of this interface?", following the frame across
 * cables and through bridges the way RouterOS does: pvid and frame-types on the way in, the bridge VLAN table when vlan-filtering is
 * on, tagged or untagged on the way out, and blocked (alternate) ports left out when spanning tree runs.
 * A router then delivers a packet to whichever endpoint owns the next-hop address, which is what ARP would find.
 */
import { bridgeIdText, computeStp, type Bridge as StpBridge, type Link as StpLink, type Role } from '../stp';
import type { Device, Bridge, BridgePort } from './device';
import type { Network } from './network';

export interface Endpoint {
  dev: Device;
  iface: string;
}

export interface PortState {
  role: Role | 'disabled';
  forwarding: boolean;
  cost: number;
  /** True when the port faces another (R)STP bridge; ports facing routers and PCs are edge ports. */
  linked: boolean;
}

export interface BridgeState {
  rootBridge: boolean;
  rootId: string;
  rootCost: number;
  rootPort: string | null;
  ports: number;
  designated: number;
}

export interface Stp {
  port(dev: Device, bridge: string, iface: string): PortState;
  bridge(dev: Device, bridge: string): BridgeState;
}

const key = (dev: Device, bridge: string) => `${dev.id}|${bridge}`;

/** Spanning tree over every bridge in the network that runs (R)STP. Ports facing routers and PCs are always designated. */
export function computeNetworkStp(net: Network): Stp {
  const bridges: StpBridge[] = [];
  const owner = new Map<string, { dev: Device; bridge: Bridge }>();
  for (const dev of net.devices.values()) {
    for (const b of dev.bridges) {
      if (b.protocolMode === 'none') continue;
      const id = key(dev, b.name);
      bridges.push({ id, priority: b.priority, mac: dev.macOf(b.name) });
      owner.set(id, { dev, bridge: b });
    }
  }
  const links: StpLink[] = [];
  for (const c of net.cables) {
    const da = net.devices.get(c.a.dev);
    const db = net.devices.get(c.b.dev);
    if (!da || !db) continue;
    const pa = da.bridgePort(c.a.iface);
    const pb = db.bridgePort(c.b.iface);
    if (!pa || !pb || pa.disabled || pb.disabled) continue;
    const ba = key(da, pa.bridge);
    const bb = key(db, pb.bridge);
    if (!owner.has(ba) || !owner.has(bb)) continue;
    if (!da.running(c.a.iface) || !db.running(c.b.iface)) continue;
    links.push({ id: `${ba}:${pa.iface}~${bb}:${pb.iface}`, a: ba, b: bb, aPort: da.portNumber(pa), bPort: db.portNumber(pb), speedMbps: 1000, up: true });
  }
  const res = computeStp(bridges, links);
  const ports = new Map<string, PortState>();
  for (const p of res.ports) ports.set(`${p.bridge}#${p.port}`, { role: p.role, forwarding: p.forwarding, cost: p.cost, linked: true });

  return {
    port(dev, bridge, iface) {
      const bp = dev.bridgePort(iface);
      const br = dev.bridge(bridge);
      if (!bp || !br) return { role: 'disabled', forwarding: false, cost: 20000, linked: false };
      if (bp.disabled || !dev.running(iface)) return { role: 'disabled', forwarding: false, cost: 20000, linked: false };
      if (br.protocolMode === 'none') return { role: 'designated', forwarding: true, cost: 20000, linked: false };
      return ports.get(`${key(dev, bridge)}#${dev.portNumber(bp)}`) ?? { role: 'designated', forwarding: true, cost: 20000, linked: false };
    },
    bridge(dev, bridge) {
      const br = dev.bridge(bridge)!;
      const mine = dev.bports.filter((p) => p.bridge === bridge);
      const own = { priority: br.priority, mac: dev.macOf(bridge) };
      if (br.protocolMode === 'none') return { rootBridge: true, rootId: `0x${bridgeIdText({ id: '', ...own })}`, rootCost: 0, rootPort: null, ports: mine.length, designated: mine.length };
      const id = key(dev, bridge);
      const rootIdKey = res.rootOf[id];
      const rootBr = bridges.find((b) => b.id === rootIdKey) ?? bridges.find((b) => b.id === id)!;
      const states = mine.map((p) => ({ p, s: ports.get(`${id}#${dev.portNumber(p)}`) }));
      const rootPort = states.find((x) => x.s?.role === 'root')?.p.iface ?? null;
      return {
        rootBridge: res.roots.includes(id),
        rootId: `0x${bridgeIdText(rootBr)}`,
        rootCost: res.rootPathCost[id] ?? 0,
        rootPort,
        ports: mine.length,
        designated: states.filter((x) => !x.s || x.s.role === 'designated').length,
      };
    },
  };
}

// ---------- frame traversal ----------

const memberVlan = (dev: Device, bridge: string, name: string, vid: number): { tagged: boolean; untagged: boolean } => {
  let tagged = false;
  let untagged = false;
  for (const v of dev.bvlans) {
    if (v.bridge !== bridge || !v.vlanIds.includes(vid)) continue;
    if (v.tagged.includes(name)) tagged = true;
    if (v.untagged.includes(name)) untagged = true;
  }
  return { tagged, untagged };
};

/** With vlan-filtering, a port also belongs untagged to the VLAN of its pvid (RouterOS adds that entry itself). */
function portMembership(dev: Device, br: Bridge, port: BridgePort, vid: number) {
  const m = memberVlan(dev, br.name, port.iface, vid);
  if (port.pvid === vid && !m.tagged) m.untagged = true;
  return m;
}

/** The bridge itself (its CPU port) as a member of a VLAN. VLAN 1 is untagged on the bridge by default. */
function bridgeMembership(dev: Device, br: Bridge, vid: number) {
  const m = memberVlan(dev, br.name, br.name, vid);
  if (vid === br.pvid && !m.tagged) m.untagged = true;
  return m;
}

export interface Segment {
  endpoints: Endpoint[];
  /** True when a frame came back around a loop: with no spanning tree that is a broadcast storm. */
  loop: boolean;
}

export function segment(net: Network, origin: Device, ifaceName: string, srcMac: string | null): Segment {
  const stp = computeNetworkStp(net);
  const endpoints: Endpoint[] = [];
  const seen = new Set<string>();
  let loop = false;

  const emit = (dev: Device, port: string, tag: number | null) => {
    if (!dev.running(port)) return;
    const p = net.peer(dev.id, port);
    if (!p || p.iface.disabled) return;
    receive(p.dev, p.ifaceName, tag);
  };

  const learn = (dev: Device, bridge: string, vid: number | null, port: string) => {
    if (!srcMac) return;
    if (dev.hosts.some((h) => h.mac === srcMac && h.vid === vid && h.bridge === bridge && h.port === port)) return;
    dev.hosts = dev.hosts.filter((h) => !(h.mac === srcMac && h.vid === vid && h.bridge === bridge));
    dev.hosts.push({ mac: srcMac, vid, port, bridge });
  };

  /** Send a frame out of the other ports of a bridge, applying the egress VLAN rules. */
  const flood = (dev: Device, br: Bridge, exceptPort: string | null, vid: number | null) => {
    for (const q of dev.bports.filter((x) => x.bridge === br.name && x.iface !== exceptPort && !x.disabled)) {
      if (!stp.port(dev, br.name, q.iface).forwarding) continue;
      if (br.vlanFiltering) {
        const m = portMembership(dev, br, q, vid as number);
        if (m.tagged) emit(dev, q.iface, vid);
        else if (m.untagged) emit(dev, q.iface, null);
      } else emit(dev, q.iface, vid);
    }
  };

  const toBridgeCpu = (dev: Device, br: Bridge, vid: number | null, tagIn: number | null) => {
    if (br.vlanFiltering) {
      const m = bridgeMembership(dev, br, vid as number);
      if (m.untagged) endpoints.push({ dev, iface: br.name });
      else if (m.tagged) {
        const v = dev.ifaces.find((i) => i.type === 'vlan' && i.parent === br.name && i.vlanId === vid && !i.disabled);
        if (v) endpoints.push({ dev, iface: v.name });
      }
    } else if (tagIn === null) endpoints.push({ dev, iface: br.name });
    else {
      const v = dev.ifaces.find((i) => i.type === 'vlan' && i.parent === br.name && i.vlanId === tagIn && !i.disabled);
      if (v) endpoints.push({ dev, iface: v.name });
    }
  };

  const receive = (dev: Device, port: string, tag: number | null) => {
    const k = `${dev.id}|${port}|${tag}`;
    if (seen.has(k)) { loop = true; return; }
    seen.add(k);
    const bp = dev.bridgePort(port);
    if (!bp) {
      if (tag === null) { if (['ether', 'wireguard'].includes(dev.iface(port)?.type ?? '')) endpoints.push({ dev, iface: port }); return; }
      const v = dev.ifaces.find((i) => i.type === 'vlan' && i.parent === port && i.vlanId === tag && !i.disabled);
      if (v) endpoints.push({ dev, iface: v.name });
      return;
    }
    const br = dev.bridge(bp.bridge);
    if (!br || bp.disabled) return;
    if (!stp.port(dev, br.name, port).forwarding) return;

    let vid: number | null;
    if (br.vlanFiltering) {
      if (tag !== null) {
        if (bp.frameTypes === 'admit-only-untagged-and-priority-tagged') return;
        vid = tag;
      } else {
        if (bp.frameTypes === 'admit-only-vlan-tagged') return;
        vid = bp.pvid;
      }
      if (bp.ingressFiltering) {
        const m = portMembership(dev, br, bp, vid);
        if (!m.tagged && !m.untagged) return;
      }
    } else vid = tag;

    learn(dev, br.name, vid, port);
    toBridgeCpu(dev, br, vid, tag);
    flood(dev, br, port, vid);
  };

  // where does the frame start?
  const i = origin.iface(ifaceName);
  if (i) {
    if ((i.type === 'ether' || i.type === 'wireguard') && !origin.isSlave(ifaceName)) emit(origin, ifaceName, null);
    else if (i.type === 'vlan' && i.parent) {
      const parent = origin.iface(i.parent);
      if (parent?.type === 'ether' && !origin.isSlave(parent.name)) emit(origin, parent.name, i.vlanId ?? null);
      else if (parent?.type === 'bridge') inject(origin, parent.name, i.vlanId ?? null);
    } else if (i.type === 'bridge') inject(origin, i.name, null);
  }

  function inject(dev: Device, bridgeName: string, tag: number | null) {
    const br = dev.bridge(bridgeName);
    if (!br) return;
    const vid = br.vlanFiltering ? (tag ?? br.pvid) : tag;
    if (br.vlanFiltering) {
      const m = bridgeMembership(dev, br, vid as number);
      if (!m.tagged && !m.untagged) return;
    }
    flood(dev, br, null, vid);
  }

  return { endpoints: endpoints.filter((e) => !(e.dev === origin && e.iface === ifaceName)), loop };
}

/** Local entries the bridge shows in its host table. */
export function localHosts(dev: Device, br: Bridge): { mac: string; vid: number | null; port: string; local: true }[] {
  const mac = dev.macOf(br.name);
  const out: { mac: string; vid: number | null; port: string; local: true }[] = [{ mac, vid: null, port: br.name, local: true }];
  if (br.vlanFiltering) {
    const ids = new Set<number>([br.pvid]);
    for (const v of dev.bvlans) if (v.bridge === br.name) for (const id of v.vlanIds) ids.add(id);
    for (const id of [...ids].sort((a, b) => a - b)) out.push({ mac, vid: id, port: br.name, local: true });
  }
  return out;
}
