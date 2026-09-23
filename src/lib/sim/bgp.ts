/**
 * A small BGP model for the simulator: templates, connections, which sessions come up, and the routes every router
 * learns (best path = highest local-pref, then shortest AS path). It converges instantly; real RouterOS took a few
 * seconds. Formats and defaults follow output captured from RouterOS 7.16 (tools/conformance/scenarios/bgp.json).
 */
import { formatIPv4, netText, parseCidr, parseIPv4, type Cidr } from './ip';
import type { Device } from './device';
import type { Network } from './network';
import { runChain, type FilterCtx } from './bgpFilter';

export interface BgpTemplate { name: string; as: number; routerId: string; disabled: boolean }
export interface FilterRule { chain: string; text: string; comment?: string; disabled: boolean }
export interface BgpConnection {
  name: string;
  templates: string;
  localAddress: string;
  localRole: 'ebgp' | 'ibgp';
  remoteAddress: string;
  remoteAs: number;
  outputNetwork?: string;
  outputFilterChain?: string;
  inputFilter?: string;
  disabled: boolean;
}
export interface BgpConfig { templates: BgpTemplate[]; connections: BgpConnection[]; filters: FilterRule[] }
export const emptyBgp = (): BgpConfig => ({ templates: [], connections: [], filters: [] });

export interface BgpSession {
  conn: BgpConnection;
  template: BgpTemplate;
  peerDev: Device;
  peerConn: BgpConnection;
  peerTemplate: BgpTemplate;
  established: boolean;
}

export interface BgpAdvertisement { dst: Cidr; nexthop: number; asPath: number[] }
export interface BgpRoute { dst: Cidr; gateway: number; iface: string | null; localPref: number; asPathLen: number; distance: number }

export interface BgpResult {
  sessions: Map<string, BgpSession[]>;
  /** What each router announces on each session, after the sender's output chain and prepend. */
  advertised: Map<string, Map<string, BgpAdvertisement[]>>; // device -> session name -> adverts
  routes: Map<string, BgpRoute[]>;
}

const templateFor = (cfg: BgpConfig, conn: BgpConnection) => cfg.templates.find((t) => t.name === conn.templates && !t.disabled);

function sessionKey(a: string, ac: string, b: string, bc: string) { return [a + '/' + ac, b + '/' + bc].sort().join('~'); }

export function computeBgp(net: Network): BgpResult {
  const routers = [...net.devices.values()].filter((d) => d.kind === 'router');
  const sessions = new Map<string, BgpSession[]>();
  const seen = new Set<string>();
  for (const dev of routers) sessions.set(dev.id, []);

  for (const dev of routers) {
    for (const conn of dev.bgp.connections) {
      if (conn.disabled) continue;
      const tpl = templateFor(dev.bgp, conn);
      if (!tpl) continue;
      const myIp = parseIPv4(conn.localAddress);
      const peerIp = parseIPv4(conn.remoteAddress);
      if (myIp === null || peerIp === null) continue;
      for (const other of routers) {
        if (other.id === dev.id) continue;
        for (const oc of other.bgp.connections) {
          if (oc.disabled) continue;
          const otpl = templateFor(other.bgp, oc);
          if (!otpl) continue;
          if (parseIPv4(oc.localAddress) !== peerIp || parseIPv4(oc.remoteAddress) !== myIp) continue;
          if (otpl.as !== conn.remoteAs || tpl.as !== oc.remoteAs) continue;
          const key = sessionKey(dev.id, conn.name, other.id, oc.name);
          if (seen.has(key)) continue;
          seen.add(key);
          sessions.get(dev.id)!.push({ conn, template: tpl, peerDev: other, peerConn: oc, peerTemplate: otpl, established: true });
          sessions.get(other.id)!.push({ conn: oc, template: otpl, peerDev: dev, peerConn: conn, peerTemplate: tpl, established: true });
        }
      }
    }
  }

  // ----- what each router originates: the members of its output.network address-list -----
  const originated = (dev: Device): Cidr[] =>
    (dev.addressLists ?? []).filter((e) => !e.disabled && dev.bgp.connections.some((c) => c.outputNetwork === e.list)).map((e) => parseCidr(e.address.includes('/') ? e.address : e.address + '/32')).filter((c): c is Cidr => !!c);

  // ----- iterate a few rounds so routes learned from one peer can be re-advertised to another (small networks converge fast) -----
  const bestByDev = new Map<string, Map<string, { dst: Cidr; localPref: number; asPath: number[]; from: BgpSession }>>();
  for (const dev of routers) bestByDev.set(dev.id, new Map());
  const advertised = new Map<string, Map<string, BgpAdvertisement[]>>();
  for (const dev of routers) advertised.set(dev.id, new Map());

  const originatedByDev = new Map<string, Cidr[]>();
  for (const dev of routers) originatedByDev.set(dev.id, originated(dev));

  for (let round = 0; round < 4; round++) {
    for (const dev of routers) {
      const mine = originatedByDev.get(dev.id)!.map((dst) => ({ dst, localPref: 100, asPath: [] as number[] }));
      const learned = [...bestByDev.get(dev.id)!.values()].map((r) => ({ dst: r.dst, localPref: r.localPref, asPath: r.asPath }));
      const candidates = [...mine, ...learned];
      for (const sess of sessions.get(dev.id) ?? []) {
        const chain = sess.conn.outputFilterChain;
        const rules = dev.bgp.filters;
        const adverts: BgpAdvertisement[] = [];
        for (const c of candidates) {
          if (c.asPath.includes(sess.peerTemplate.as)) continue; // no route back to where it came from
          const ctx: FilterCtx = { dst: c.dst, communities: [], attrs: { prepend: 0, communities: [] } };
          const verdict = chain ? runChain(rules, chain, ctx) : 'accept';
          if (verdict !== 'accept') continue;
          const asPath = [...Array(ctx.attrs.prepend + 1).fill(sess.template.as), ...c.asPath];
          adverts.push({ dst: c.dst, nexthop: parseIPv4(sess.conn.localAddress)!, asPath });
        }
        advertised.get(dev.id)!.set(sess.conn.name + '-1', adverts);
      }
    }
    for (const dev of routers) {
      const best = bestByDev.get(dev.id)!;
      for (const sess of sessions.get(dev.id) ?? []) {
        const inbound = advertised.get(sess.peerDev.id)?.get(sess.peerConn.name + '-1') ?? [];
        for (const adv of inbound) {
          const ctx: FilterCtx = { dst: adv.dst, communities: [], attrs: { localPref: 100, prepend: 0, communities: [] } };
          const chain = sess.conn.inputFilter;
          const verdict = chain ? runChain(dev.bgp.filters, chain, ctx) : 'accept';
          if (verdict !== 'accept') continue;
          const key = netText(adv.dst);
          const have = best.get(key);
          const cand = { dst: adv.dst, localPref: ctx.attrs.localPref ?? 100, asPath: adv.asPath, from: sess };
          if (!have || cand.localPref > have.localPref || (cand.localPref === have.localPref && cand.asPath.length < have.asPath.length)) best.set(key, cand);
        }
      }
    }
  }

  const routes = new Map<string, BgpRoute[]>();
  for (const dev of routers) {
    const mine = originatedByDev.get(dev.id)!;
    const out: BgpRoute[] = [];
    for (const r of bestByDev.get(dev.id)!.values()) {
      if (mine.some((m) => netText(m) === netText(r.dst))) continue; // connected/originated wins over a learned copy
      out.push({
        dst: r.dst, gateway: parseIPv4(r.from.conn.remoteAddress)!,
        iface: dev.activeAddrs().find((a) => a.cidr.ip === parseIPv4(r.from.conn.localAddress))?.iface ?? null,
        localPref: r.localPref, asPathLen: r.asPath.length, distance: r.from.template.as === r.from.peerTemplate.as ? 200 : 20,
      });
    }
    routes.set(dev.id, out);
  }
  return { sessions, advertised, routes };
}

export const bgpDistance = (localRole: 'ebgp' | 'ibgp') => (localRole === 'ibgp' ? 200 : 20);
void formatIPv4;
