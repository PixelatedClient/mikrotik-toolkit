import { formatIPv4, inNet, netText, parseCidr, parseIPv4, type Cidr } from './ip';
import type { Network } from './network';
import type { OspfConfig } from './ospf';
import type { BgpConfig } from './bgp';
import { emptyBgp } from './bgp';

export type DevKind = 'router' | 'pc';
export type IfaceType = 'ether' | 'loopback' | 'bridge' | 'vlan' | 'wireguard';

export interface Iface {
  name: string;
  mac: string;
  disabled: boolean;
  type: IfaceType;
  /** Kept for older code: true for the loopback. */
  loopback?: boolean;
  comment?: string;
  /** vlan interfaces */
  vlanId?: number;
  parent?: string;
  /** wireguard interfaces */
  wgListenPort?: string;
  wgMtu?: string;
  wgPrivateKey?: string;
  wgPublicKey?: string;
}

export interface Addr {
  address: string;
  iface: string;
  comment?: string;
  disabled: boolean;
}

export interface StaticRoute {
  dst: string;
  gateway?: string;
  blackhole?: boolean;
  distance: number;
  comment?: string;
  disabled: boolean;
}

export interface FwRule {
  chain: string;
  action: string;
  props: Record<string, string>;
  comment?: string;
  disabled: boolean;
  packets: number;
  bytes: number;
}

export interface Bridge {
  name: string;
  protocolMode: 'rstp' | 'stp' | 'none';
  /** 0..61440, multiple of 4096. Lower wins the root election. */
  priority: number;
  vlanFiltering: boolean;
  pvid: number;
  comment?: string;
}

export type FrameTypes = 'admit-all' | 'admit-only-vlan-tagged' | 'admit-only-untagged-and-priority-tagged';

export interface BridgePort {
  bridge: string;
  iface: string;
  pvid: number;
  frameTypes: FrameTypes;
  ingressFiltering: boolean;
  edge: 'auto' | 'yes' | 'no';
  bpduGuard: boolean;
  disabled: boolean;
  comment?: string;
}

export interface BridgeVlan {
  bridge: string;
  vlanIds: number[];
  tagged: string[];
  untagged: string[];
  comment?: string;
}

export interface Pool {
  name: string;
  ranges: string;
}

export interface DhcpServer {
  name: string;
  iface: string;
  pool: string;
  leaseTime: string;
  disabled: boolean;
}

export interface DhcpNetwork {
  address: string;
  gateway?: string;
  dns?: string;
}

export interface Lease {
  address: string;
  mac: string;
  server: string;
  hostName: string;
  /** Simulated seconds since it was handed out. */
  born: number;
}

export interface Host {
  mac: string;
  vid: number | null;
  port: string;
  bridge: string;
}

/** A learned next-hop mapping, the same idea as `/ip arp`. Only entries the router actually needed to resolve (to
 *  send a packet somewhere) are recorded — real RouterOS also picks up neighbours from other traffic it merely
 *  overhears, which this simulator does not model (see the "Known differences" note in CLAUDE.md). */
export interface Arp {
  address: string;
  mac: string;
  iface: string;
  dynamic: boolean;
  complete: boolean;
  published: boolean;
  /** Real RouterOS cycles a dynamic entry through reachable/stale/delay/probe over time; the simulator always
   *  shows a freshly-resolved entry as "reachable" (times are simulated everywhere else in this engine too). */
  status: 'reachable' | 'stale' | 'delay' | 'probe';
}

/** One line of `/ip route print`, computed from addresses and static routes the way RouterOS does. */
export interface RouteView {
  dst: Cidr;
  dstText: string;
  /** Next-hop address, or the interface name for connected routes. */
  gateway: string;
  iface: string | null;
  distance: number;
  dynamic: boolean;
  connected: boolean;
  blackhole: boolean;
  disabled: boolean;
  active: boolean;
  comment?: string;
  /** Learned from OSPF (a dynamic route with administrative distance 110). */
  ospf?: boolean;
  /** Learned from BGP (distance 20 for eBGP, 200 for iBGP). */
  bgp?: boolean;
  /** How the gateway is shown: RouterOS prints OSPF gateways as 10.1.1.2%ether1. */
  gwShown?: string;
  /** Connected routes: the interface's own address (real RouterOS prints local-address). */
  localAddr?: string;
  /** Position among the static routes (what `remove 0` refers to), or null for connected routes. */
  staticIndex: number | null;
}

export interface Service {
  port: number;
  disabled: boolean;
}

const hex2 = (n: number) => (n & 255).toString(16).toUpperCase().padStart(2, '0');

export class Device {
  net: Network | null = null;
  identity: string;
  ifaces: Iface[] = [];
  addrs: Addr[] = [];
  routes: StaticRoute[] = [];
  filter: FwRule[] = [];
  natRules: FwRule[] = [];
  bridges: Bridge[] = [];
  bports: BridgePort[] = [];
  bvlans: BridgeVlan[] = [];
  pools: Pool[] = [];
  dhcpServers: DhcpServer[] = [];
  dhcpNetworks: DhcpNetwork[] = [];
  leases: Lease[] = [];
  arps: Arp[] = [];
  /** MAC addresses this device's bridges have learned: bridge -> entries. */
  hosts: Host[] = [];
  /** RouterOS 7 defaults. */
  services: Record<string, Service> = {
    telnet: { port: 23, disabled: false },
    ftp: { port: 21, disabled: false },
    www: { port: 80, disabled: false },
    ssh: { port: 22, disabled: false },
    'www-ssl': { port: 443, disabled: true },
    api: { port: 8728, disabled: false },
    winbox: { port: 8291, disabled: false },
    'api-ssl': { port: 8729, disabled: false },
  };
  dns = { servers: '', allowRemoteRequests: false };
  ospf: OspfConfig = { instances: [], areas: [], templates: [] };
  bgp: BgpConfig = emptyBgp();
  addressLists: { list: string; address: string; comment?: string; disabled: boolean; timeout?: string; created: number }[] = [];
  wgPeers: { interface: string; name: string; publicKey: string; endpointAddress?: string; endpointPort?: string; allowedAddress: string; disabled: boolean }[] = [];
  /** Interface lists besides the built-in all, none, dynamic and static. */
  ifLists: { name: string; comment?: string }[] = [];
  ifListMembers: { list: string; interface: string; disabled: boolean }[] = [];
  /** VPCS style host settings, for kind === 'pc'. */
  pc: { ip: string | null; cidr: number; gateway: string | null } = { ip: null, cidr: 24, gateway: null };

  constructor(public id: string, public kind: DevKind, public index: number, ports = 4) {
    this.identity = kind === 'router' ? 'MikroTik' : id;
    const base = `0C:${hex2(0x10 + index * 0x11)}:${hex2(0x40 + index * 7)}:${hex2(0x90 - index * 3)}:00`;
    if (kind === 'router') {
      for (let i = 1; i <= ports; i++) this.ifaces.push({ name: `ether${i}`, mac: `${base}:${hex2(i - 1)}`, disabled: false, type: 'ether' });
      this.ifaces.push({ name: 'lo', mac: '00:00:00:00:00:00', disabled: false, type: 'loopback', loopback: true });
    } else {
      this.ifaces.push({ name: 'eth0', mac: `00:50:79:66:68:${hex2(index * 16 + 1)}`, disabled: false, type: 'ether' });
    }
  }

  iface(name: string): Iface | undefined {
    return this.ifaces.find((i) => i.name === name);
  }

  bridge(name: string): Bridge | undefined {
    return this.bridges.find((b) => b.name === name);
  }

  bridgePort(iface: string): BridgePort | undefined {
    return this.bports.find((p) => p.iface === iface);
  }

  /** Record (or refresh) a resolved next hop, the way a real router's ARP cache picks one up when it needs to send somewhere. */
  learnArp(address: string, mac: string, iface: string): void {
    const existing = this.arps.find((a) => a.address === address && a.iface === iface);
    if (existing) { existing.mac = mac; existing.status = 'reachable'; return; }
    this.arps.push({ address, mac, iface, dynamic: true, complete: true, published: false, status: 'reachable' });
  }

  /** 1-based number of a port within its bridge, in the order ports were added. */
  portNumber(p: BridgePort): number {
    return this.bports.filter((x) => x.bridge === p.bridge).indexOf(p) + 1;
  }

  /** Ports that belong to a bridge cannot carry addresses; RouterOS marks them SLAVE. */
  isSlave(name: string): boolean {
    return !!this.bridgePort(name);
  }

  /** MAC address as RouterOS shows it: a bridge takes the lowest MAC of its ports, a VLAN takes its parent's. */
  macOf(name: string): string {
    const i = this.iface(name);
    if (!i) return '00:00:00:00:00:00';
    if (i.type === 'vlan') return i.parent ? this.macOf(i.parent) : i.mac;
    if (i.type === 'bridge') {
      const macs = this.bports.filter((p) => p.bridge === name).map((p) => this.iface(p.iface)?.mac).filter((m): m is string => !!m).sort();
      return macs[0] ?? i.mac;
    }
    return i.mac;
  }

  /** An interface is running when it is enabled and, for a real port, cabled to an enabled interface. */
  running(name: string): boolean {
    const i = this.iface(name);
    if (!i || i.disabled) return false;
    switch (i.type) {
      case 'loopback':
      case 'bridge':
      case 'wireguard':
        return true;
      case 'vlan':
        return !!i.parent && this.running(i.parent);
      default: {
        const p = this.net?.peer(this.id, name);
        return !!p && !p.iface.disabled;
      }
    }
  }

  /** Addresses that are usable right now. */
  activeAddrs(): { cidr: Cidr; iface: string; text: string }[] {
    if (this.kind === 'pc') {
      if (!this.pc.ip) return [];
      const c = parseCidr(`${this.pc.ip}/${this.pc.cidr}`);
      return c && this.running('eth0') ? [{ cidr: c, iface: 'eth0', text: `${this.pc.ip}/${this.pc.cidr}` }] : [];
    }
    const out: { cidr: Cidr; iface: string; text: string }[] = [];
    for (const a of this.addrs) {
      if (a.disabled || this.isSlave(a.iface) || !this.running(a.iface)) continue;
      const c = parseCidr(a.address);
      if (c) out.push({ cidr: c, iface: a.iface, text: a.address });
    }
    return out;
  }

  /** Local delivery: an address stays local while its interface is merely unplugged (only disable or slave status removes it). */
  ownsLocal(ip: number): boolean {
    if (this.kind === 'pc') return this.ownsIp(ip);
    return this.addrs.some((a) => {
      if (a.disabled || this.isSlave(a.iface)) return false;
      const c = parseCidr(a.address);
      return c?.ip === ip && !this.iface(a.iface)?.disabled;
    });
  }

  ownsIp(ip: number, onIface?: string): boolean {
    return this.activeAddrs().some((a) => a.cidr.ip === ip && (!onIface || a.iface === onIface));
  }

  /** Routing table: connected routes from addresses plus static routes, sorted like RouterOS prints them. */
  routeViews(): RouteView[] {
    const views: RouteView[] = [];
    const seen = new Set<string>();
    if (this.kind === 'pc') return views;
    for (const a of this.addrs) {
      if (a.disabled) continue;
      const c = parseCidr(a.address);
      if (!c) continue;
      const key = `${c.net}/${c.cidr}/${a.iface}`;
      if (seen.has(key)) continue;
      seen.add(key);
      views.push({ dst: { ...c, ip: c.net }, dstText: netText(c), gateway: a.iface, iface: a.iface, distance: 0, dynamic: true, connected: true, blackhole: false, disabled: false, active: !this.isSlave(a.iface) && this.running(a.iface), staticIndex: null, localAddr: c.ip === undefined ? undefined : formatIPv4(c.ip) });
    }
    const connectedActive = views.filter((v) => v.active);
    this.routes.forEach((r, i) => {
      const c = parseCidr(r.dst);
      if (!c) return;
      let active = false;
      let iface: string | null = null;
      if (!r.disabled) {
        if (r.blackhole) active = true;
        else if (r.gateway) {
          const gw = parseIPv4(r.gateway);
          if (gw !== null) {
            const via = connectedActive.find((v) => inNet(gw, v.dst));
            if (via) { active = true; iface = via.iface; }
          } else if (this.iface(r.gateway)) {
            active = this.running(r.gateway);
            iface = r.gateway;
          }
        }
      }
      views.push({ dst: c, dstText: netText(c), gateway: r.blackhole ? 'blackhole' : r.gateway ?? '', iface, distance: r.distance, dynamic: false, connected: false, blackhole: !!r.blackhole, disabled: r.disabled, active, comment: r.comment, staticIndex: i });
    });
    // routes learned from OSPF: dynamic, distance 110, active unless a route with a lower distance already covers the same network
    const learned = this.net?.ospfResult().routes.get(this.id) ?? [];
    for (const r of learned) {
      const dstText = netText(r.dst);
      const beaten = views.some((v) => v.active && v.dstText === dstText && v.distance < 110);
      views.push({
        dst: r.dst, dstText, gateway: formatIPv4(r.gateway), gwShown: `${formatIPv4(r.gateway)}%${r.iface}`, iface: r.iface, distance: 110,
        dynamic: true, connected: false, blackhole: false, disabled: false, active: !beaten && this.running(r.iface), ospf: true, staticIndex: null,
      });
    }
    // routes learned from BGP: dynamic, distance 20 (eBGP) or 200 (iBGP)
    const bgpLearned = this.net?.bgpResult().routes.get(this.id) ?? [];
    for (const r of bgpLearned) {
      const dstText = netText(r.dst);
      const beaten = views.some((v) => v.active && v.dstText === dstText && v.distance < r.distance);
      views.push({
        dst: r.dst, dstText, gateway: formatIPv4(r.gateway), iface: r.iface, distance: r.distance,
        dynamic: true, connected: false, blackhole: false, disabled: false, active: !beaten && (!r.iface || this.running(r.iface)), bgp: true, staticIndex: null,
      });
    }
    return views.sort((a, b) => a.dst.net - b.dst.net || a.dst.cidr - b.dst.cidr || a.distance - b.distance);
  }

  /** Longest prefix wins, then the lowest distance. */
  lookup(dstIp: number): RouteView | null {
    let best: RouteView | null = null;
    for (const v of this.routeViews()) {
      if (!v.active || !inNet(dstIp, v.dst)) continue;
      if (!best || v.dst.cidr > best.dst.cidr || (v.dst.cidr === best.dst.cidr && v.distance < best.distance)) best = v;
    }
    return best;
  }

  /** The address this device would use as the source when sending through a route. */
  sourceFor(route: RouteView, dstIp: number): number | null {
    const target = route.connected ? dstIp : parseIPv4(route.gateway);
    const via = this.activeAddrs().find((a) => a.iface === route.iface && (target !== null ? inNet(target, a.cidr) : true));
    return via ? via.cidr.ip : null;
  }
}

export const ipText = formatIPv4;
