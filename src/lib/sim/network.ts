import { Device, type RouteView } from './device';
import { filterVerdict, firstNat, type Ctx } from './firewall';
import { fmtTime, formatIPv4, inNet, parseCidr, parseIPv4, rng } from './ip';
import { segment } from './l2';
import { computeOspf, type OspfResult } from './ospf';
import { computeBgp, type BgpResult } from './bgp';

export type ErrorKind = 'net-unreachable' | 'host-unreachable' | 'ttl-exceeded' | 'admin-prohibited';

export interface Flow {
  id: number;
  snat?: { dev: string; origSrc: number; newSrc: number };
  dnat?: { dev: string; origDst: number; newDst: number; origPort?: number; newPort?: number };
}

export interface Packet {
  src: number;
  dst: number;
  proto: 'icmp' | 'tcp' | 'udp';
  type: 'echo' | 'echo-reply' | 'error' | 'syn' | 'synack';
  ttl: number;
  size: number;
  sport?: number;
  dport?: number;
  state: 'new' | 'established' | 'related' | 'invalid';
  reply: boolean;
  flow: Flow;
  err?: ErrorKind;
}

export type Outcome =
  | { kind: 'delivered'; dev: Device; pkt: Packet; hops: number }
  | { kind: 'error'; err: ErrorKind; fromIp: number; hops: number }
  | { kind: 'lost'; why: string; at: string; hops: number }
  | { kind: 'no-route' };

export interface Cable {
  a: { dev: string; iface: string };
  b: { dev: string; iface: string };
}

export type PingReply =
  | { status: 'reply'; host: number; ttl: number; us: number; size: number }
  | { status: 'timeout' }
  | { status: 'no-route' }
  | { status: 'error'; err: ErrorKind; from: number };

export interface TraceRow {
  address: string | null;
  loss: number;
  sent: number;
  us: number[];
}

const MAX_STEPS = 64;

export class Network {
  devices = new Map<string, Device>();
  /** Bumped whenever a command or a cable can change the topology; the OSPF result is cached per epoch. */
  epoch = 0;
  private ospfCache: { epoch: number; result: OspfResult } | null = null;
  private bgpCache: { epoch: number; result: BgpResult } | null = null;

  ospfResult(): OspfResult {
    if (!this.ospfCache || this.ospfCache.epoch !== this.epoch) this.ospfCache = { epoch: this.epoch, result: computeOspf(this) };
    return this.ospfCache.result;
  }

  bgpResult(): BgpResult {
    if (!this.bgpCache || this.bgpCache.epoch !== this.epoch) this.bgpCache = { epoch: this.epoch, result: computeBgp(this) };
    return this.bgpCache.result;
  }
  cables: Cable[] = [];
  private flowId = 1;
  private rand = rng(7);

  add(dev: Device): Device {
    dev.net = this;
    this.devices.set(dev.id, dev);
    return dev;
  }

  device(id: string): Device {
    const d = this.devices.get(id);
    if (!d) throw new Error(`unknown device ${id}`);
    return d;
  }

  connect(a: string, ai: string, b: string, bi: string): void {
    this.epoch++;
    this.cables.push({ a: { dev: a, iface: ai }, b: { dev: b, iface: bi } });
  }

  peer(dev: string, iface: string): { dev: Device; iface: NonNullable<Device['ifaces'][number]>; ifaceName: string } | null {
    for (const c of this.cables) {
      const [me, other] = c.a.dev === dev && c.a.iface === iface ? [c.a, c.b] : c.b.dev === dev && c.b.iface === iface ? [c.b, c.a] : [null, null];
      if (!me || !other) continue;
      const d = this.devices.get(other.dev);
      const i = d?.iface(other.iface);
      return d && i ? { dev: d, iface: i, ifaceName: other.iface } : null;
    }
    const me = this.devices.get(dev);
    if (me?.iface(iface)?.type === 'wireguard') return this.wireguardPeer(me, iface);
    return null;
  }

  /**
   * A WireGuard tunnel is not a cable: it rides on top of whatever reaches the peer's endpoint address. The simulator
   * does not model the handshake, so two wg interfaces are "connected" whenever each one's peer names an address the
   * other device actually owns - which is exactly the case a correctly configured tunnel is meant to cover.
   */
  private wireguardPeer(dev: Device, ifaceName: string): { dev: Device; iface: NonNullable<Device['ifaces'][number]>; ifaceName: string } | null {
    const myPeer = dev.wgPeers.find((p) => p.interface === ifaceName && !p.disabled);
    if (!myPeer?.endpointAddress) return null;
    const endpointIp = parseIPv4(myPeer.endpointAddress);
    if (endpointIp === null) return null;
    for (const other of this.devices.values()) {
      if (other === dev || !other.activeAddrs().some((a) => a.cidr.ip === endpointIp)) continue;
      for (const oi of other.ifaces.filter((i) => i.type === 'wireguard')) {
        const theirPeer = other.wgPeers.find((p) => p.interface === oi.name && !p.disabled);
        if (!theirPeer?.endpointAddress) continue;
        const myUnderlying = parseIPv4(theirPeer.endpointAddress);
        if (myUnderlying !== null && dev.activeAddrs().some((a) => a.cidr.ip === myUnderlying)) return { dev: other, iface: oi, ifaceName: oi.name };
      }
    }
    return null;
  }

  private newFlow(): Flow {
    return { id: this.flowId++ };
  }

  private packet(src: number, dst: number, over: Partial<Packet> & Pick<Packet, 'proto' | 'type'>): Packet {
    return { src, dst, ttl: 64, size: 56, state: 'new', reply: false, flow: this.newFlow(), ...over };
  }

  /** Choose where a locally generated packet leaves. PCs use their subnet or their gateway; routers use the routing table. */
  private originate(dev: Device, dst: number): { egress: string; nextIp: number; route: RouteView | null; srcIp: number } | { fail: 'no-route' | 'blackhole' } {
    if (dev.kind === 'pc') {
      const a = dev.activeAddrs()[0];
      if (!a) return { fail: 'no-route' };
      if (inNet(dst, a.cidr)) return { egress: 'eth0', nextIp: dst, route: null, srcIp: a.cidr.ip };
      const gw = dev.pc.gateway ? parseIPv4(dev.pc.gateway) : null;
      if (gw === null || !inNet(gw, a.cidr)) return { fail: 'no-route' };
      return { egress: 'eth0', nextIp: gw, route: null, srcIp: a.cidr.ip };
    }
    const r = dev.lookup(dst);
    if (!r) return { fail: 'no-route' };
    if (r.blackhole) return { fail: 'blackhole' };
    const srcIp = dev.sourceFor(r, dst);
    if (srcIp === null || !r.iface) return { fail: 'no-route' };
    return { egress: r.iface, nextIp: r.connected ? dst : (parseIPv4(r.gateway) as number), route: r, srcIp };
  }

  /** Address of the interface a router received a packet on, used as the source of ICMP errors. */
  private ingressAddr(dev: Device, iface: string | null, toward: number): number | null {
    const own = dev.activeAddrs();
    return (own.find((a) => a.iface === iface) ?? own.find((a) => inNet(toward, a.cidr)) ?? own[0])?.cidr.ip ?? null;
  }

  private errorPacket(at: Device, ingress: string | null, orig: Packet, err: ErrorKind): Packet | null {
    const from = this.ingressAddr(at, ingress, orig.src);
    if (from === null) return null;
    return this.packet(from, orig.src, { proto: 'icmp', type: 'error', err, state: 'related', size: 56, flow: this.newFlow() });
  }

  /**
   * Carry a packet hop by hop. `start` is where it was created (inIface null) or where it just arrived.
   * Applies, in RouterOS order: un-NAT of replies, dst-nat, local delivery (input chain), TTL, routing, forward/output chain, src-nat.
   */
  walk(start: Device, first: Packet, inIface: string | null): Outcome {
    let dev = start;
    let ingress = inIface;
    let pkt = first;
    let hops = 0;
    const fromWire = () => ingress !== null;

    for (let step = 0; step < MAX_STEPS; step++) {
      // 1. replies to NATed connections get their addresses restored before anything else
      if (pkt.reply) {
        if (pkt.flow.snat?.dev === dev.id && pkt.dst === pkt.flow.snat.newSrc) pkt = { ...pkt, dst: pkt.flow.snat.origSrc };
        if (pkt.flow.dnat?.dev === dev.id && pkt.src === pkt.flow.dnat.newDst) pkt = { ...pkt, src: pkt.flow.dnat.origDst, sport: pkt.flow.dnat.origPort ?? pkt.sport };
      }

      // 2. dst-nat happens before routing, on new packets arriving from the wire
      if (fromWire() && pkt.state === 'new' && !pkt.reply) {
        const rule = firstNat(dev, { chain: 'dstnat', pkt, inIface: ingress, outIface: null });
        if (rule?.action === 'dst-nat' && rule.props['to-addresses']) {
          const newDst = parseIPv4(rule.props['to-addresses']);
          if (newDst !== null) {
            const newPort = rule.props['to-ports'] ? Number(rule.props['to-ports']) : pkt.dport;
            pkt = { ...pkt, dst: newDst, dport: newPort, flow: { ...pkt.flow, dnat: { dev: dev.id, origDst: pkt.dst, newDst, origPort: pkt.dport, newPort } } };
          }
        }
      }

      // 3. local delivery
      if (dev.ownsLocal(pkt.dst)) {
        if (fromWire()) {
          const v = filterVerdict(dev, { chain: 'input', pkt, inIface: ingress, outIface: null });
          if (v.action !== 'accept') return this.refuse(dev, ingress, pkt, v.action, hops, v.rule?.props['reject-with']);
        }
        if (pkt.type === 'error') return { kind: 'error', err: pkt.err!, fromIp: pkt.src, hops };
        return { kind: 'delivered', dev, pkt, hops };
      }

      if (dev.kind === 'pc' && fromWire()) return { kind: 'lost', why: 'a host does not forward', at: dev.id, hops };

      // 4. TTL applies to packets that are being forwarded
      if (fromWire()) {
        if (pkt.ttl <= 1) return this.bounce(dev, ingress, pkt, 'ttl-exceeded', hops);
        pkt = { ...pkt, ttl: pkt.ttl - 1 };
      }

      // 5. routing
      const o = this.originate(dev, pkt.dst);
      if ('fail' in o) {
        if (!fromWire()) return o.fail === 'no-route' ? { kind: 'no-route' } : { kind: 'lost', why: 'blackhole route', at: dev.id, hops };
        return o.fail === 'no-route' ? this.bounce(dev, ingress, pkt, 'net-unreachable', hops) : { kind: 'lost', why: 'blackhole route', at: dev.id, hops };
      }

      // 6. forward (or output) chain
      const ctx: Ctx = { chain: fromWire() ? 'forward' : 'output', pkt, inIface: ingress, outIface: o.egress };
      const v = filterVerdict(dev, ctx);
      if (v.action !== 'accept') return this.refuse(dev, ingress, pkt, v.action, hops, v.rule?.props['reject-with']);

      // 7. src-nat on the way out, for new connections
      if (pkt.state === 'new' && !pkt.reply) {
        const rule = firstNat(dev, { chain: 'srcnat', pkt, inIface: ingress, outIface: o.egress });
        if (rule && (rule.action === 'masquerade' || rule.action === 'src-nat')) {
          const out = dev.activeAddrs().find((a) => a.iface === o.egress);
          const newSrc = rule.action === 'src-nat' && rule.props['to-addresses'] ? parseIPv4(rule.props['to-addresses']) : out?.cidr.ip ?? null;
          if (newSrc !== null && newSrc !== pkt.src) pkt = { ...pkt, src: newSrc, flow: { ...pkt.flow, snat: { dev: dev.id, origSrc: pkt.src, newSrc } } };
        }
      }

      // 8. the frame goes out on this broadcast domain (through any switches); whoever owns the next-hop address answers
      const seg = segment(this, dev, o.egress, dev.macOf(o.egress));
      if (seg.loop) return { kind: 'lost', why: 'broadcast storm', at: dev.id, hops };
      const target = seg.endpoints.find((e) => e.dev.ownsIp(o.nextIp, e.iface));
      if (!target) return { kind: 'lost', why: seg.endpoints.length ? 'nobody answers ARP' : 'link is down', at: dev.id, hops };
      hops++;
      dev = target.dev;
      ingress = target.iface;
    }
    return { kind: 'lost', why: 'loop', at: dev.id, hops };
  }

  private refuse(dev: Device, ingress: string | null, pkt: Packet, action: 'drop' | 'reject', hops: number, rejectWith?: string): Outcome {
    // real 7.16: plain reject answers "net unreachable"; reject-with picks the ICMP code
    const kinds: Record<string, ErrorKind> = {
      'icmp-net-unreachable': 'net-unreachable', 'icmp-network-unreachable': 'net-unreachable',
      'icmp-host-unreachable': 'host-unreachable', 'icmp-admin-prohibited': 'admin-prohibited',
    };
    if (action === 'reject' && pkt.type !== 'error') return this.bounce(dev, ingress, pkt, (rejectWith && kinds[rejectWith]) || 'net-unreachable', hops);
    return { kind: 'lost', why: 'dropped by firewall', at: dev.id, hops };
  }

  /** A router sends an ICMP error back; it only counts if it makes it home. */
  private bounce(at: Device, ingress: string | null, orig: Packet, err: ErrorKind, hops: number): Outcome {
    if (orig.type === 'error') return { kind: 'lost', why: 'no error about an error', at: at.id, hops };
    const e = this.errorPacket(at, ingress, orig, err);
    if (!e) return { kind: 'lost', why: 'no source address for the error', at: at.id, hops };
    const back = this.walk(at, e, null);
    if (back.kind === 'error') return { kind: 'error', err, fromIp: e.src, hops: hops + back.hops };
    return { kind: 'lost', why: 'error did not come back', at: at.id, hops };
  }

  private jitter(legs: number): number {
    let us = 0;
    for (let i = 0; i < legs; i++) us += 260 + Math.floor(this.rand() * 640);
    return us;
  }

  /** One echo request and its reply. */
  pingOnce(src: Device, dst: number, opts: { srcAddress?: number | null; ttl?: number; size?: number } = {}): PingReply {
    // pinging one of your own addresses never leaves the box
    if (src.ownsIp(dst)) return { status: 'reply', host: dst, ttl: 64, us: 20 + Math.floor(this.rand() * 90), size: opts.size ?? 56 };
    const o = this.originate(src, dst);
    if ('fail' in o) return o.fail === 'no-route' ? { status: 'no-route' } : { status: 'timeout' };
    const srcIp = opts.srcAddress ?? o.srcIp;
    if (opts.srcAddress != null && !src.ownsIp(opts.srcAddress)) return { status: 'no-route' };
    const req = this.packet(srcIp, dst, { proto: 'icmp', type: 'echo', ttl: opts.ttl ?? 64, size: opts.size ?? 56 });
    const fwd = this.walk(src, req, null);
    if (fwd.kind === 'error') return { status: 'error', err: fwd.err, from: fwd.fromIp };
    if (fwd.kind === 'no-route') return { status: 'no-route' };
    if (fwd.kind !== 'delivered') return { status: 'timeout' };
    const rep = this.packet(fwd.pkt.dst, fwd.pkt.src, { proto: 'icmp', type: 'echo-reply', state: 'established', reply: true, flow: fwd.pkt.flow, size: req.size });
    const back = this.walk(fwd.dev, rep, null);
    if (back.kind !== 'delivered' || back.dev !== src) return { status: 'timeout' };
    return { status: 'reply', host: dst, ttl: back.pkt.ttl, us: this.jitter(fwd.hops + back.hops + 1), size: req.size };
  }

  /** One TCP connection attempt, as `/tool fetch` makes it. */
  tcpConnect(src: Device, dst: number, port: number): 'connected' | 'refused' | 'timeout' | 'no-route' {
    const o = this.originate(src, dst);
    if ('fail' in o) return o.fail === 'no-route' ? 'no-route' : 'timeout';
    const syn = this.packet(o.srcIp, dst, { proto: 'tcp', type: 'syn', dport: port, sport: 40000 + Math.floor(this.rand() * 20000), size: 60 });
    const fwd = this.walk(src, syn, null);
    if (fwd.kind === 'no-route') return 'no-route';
    if (fwd.kind !== 'delivered') return 'timeout';
    const svc = Object.values(fwd.dev.services).find((s) => !s.disabled && s.port === fwd.pkt.dport);
    const rep = this.packet(fwd.pkt.dst, fwd.pkt.src, { proto: 'tcp', type: 'synack', state: 'established', reply: true, flow: fwd.pkt.flow, sport: fwd.pkt.dport, dport: fwd.pkt.sport, size: 60 });
    const back = this.walk(fwd.dev, rep, null);
    if (back.kind !== 'delivered' || back.dev !== src) return 'timeout';
    return svc ? 'connected' : 'refused';
  }

  /** A PC asks for an address: the first DHCP server on its broadcast domain answers, handing out the highest free address like RouterOS does. */
  dhcpDiscover(client: Device): { ip: string; cidr: number; gateway: string | null } | null {
    const mac = client.macOf('eth0');
    const seg = segment(this, client, 'eth0', mac);
    for (const e of seg.endpoints) {
      const srv = e.dev.dhcpServers.find((s) => !s.disabled && s.iface === e.iface);
      const pool = srv && e.dev.pools.find((p) => p.name === srv.pool);
      if (!srv || !pool) continue;
      const own = e.dev.addrs.find((a) => a.iface === e.iface && !a.disabled);
      const ownC = own ? parseCidr(own.address) : null;
      const netw = e.dev.dhcpNetworks.find((n) => { const c = parseCidr(n.address); return !!c && !!ownC && (ownC.ip & c.mask) >>> 0 === c.net; });
      if (!ownC || !netw) continue;
      const used = new Set(e.dev.leases.filter((l) => l.server === srv.name).map((l) => parseIPv4(l.address)!));
      used.add(ownC.ip);
      let ip: number | null = null;
      const existing = e.dev.leases.find((l) => l.server === srv.name && l.mac === mac);
      if (existing) ip = parseIPv4(existing.address);
      else {
        const ranges = pool.ranges.split(',').map((r) => r.trim().split('-')).map(([a, b]) => [parseIPv4(a), parseIPv4(b ?? a)] as const).filter(([a, b]) => a !== null && b !== null) as [number, number][];
        outer: for (const [lo, hi] of [...ranges].reverse()) for (let x = hi; x >= lo; x--) if (!used.has(x)) { ip = x; break outer; }
        if (ip === null) return null;
        e.dev.leases.push({ address: formatIPv4(ip), mac, server: srv.name, hostName: client.id, born: 0 });
      }
      return { ip: formatIPv4(ip as number), cidr: parseCidr(netw.address)!.cidr, gateway: netw.gateway ?? null };
    }
    return null;
  }

  /** `/tool traceroute`: probes with rising TTL. */
  traceroute(src: Device, dst: number, opts: { count: number; maxHops: number; srcAddress?: number | null }): TraceRow[] {
    const rows: TraceRow[] = [];
    const o = this.originate(src, dst);
    if ('fail' in o) return rows;
    const srcIp = opts.srcAddress ?? o.srcIp;
    for (let ttl = 1; ttl <= opts.maxHops; ttl++) {
      const us: number[] = [];
      let addr: number | null = null;
      let reached = false;
      for (let n = 0; n < opts.count; n++) {
        const req = this.packet(srcIp, dst, { proto: 'icmp', type: 'echo', ttl });
        const fwd = this.walk(src, req, null);
        if (fwd.kind === 'error' && fwd.err === 'ttl-exceeded') { addr = fwd.fromIp; us.push(this.jitter(fwd.hops + 1)); }
        else if (fwd.kind === 'delivered') {
          const rep = this.packet(fwd.pkt.dst, fwd.pkt.src, { proto: 'icmp', type: 'echo-reply', state: 'established', reply: true, flow: fwd.pkt.flow });
          const back = this.walk(fwd.dev, rep, null);
          if (back.kind === 'delivered' && back.dev === src) { addr = dst; reached = true; us.push(this.jitter(fwd.hops + back.hops + 1)); }
        }
      }
      rows.push({ address: addr === null ? null : formatIPv4(addr), loss: Math.round(((opts.count - us.length) / opts.count) * 100), sent: opts.count, us });
      if (reached) break;
    }
    return rows;
  }
}

export { fmtTime };
