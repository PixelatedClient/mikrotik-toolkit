import { describe, it, expect } from 'vitest';
import { knownPrefixes, nextHopChoices, routerOsCommand, sendPacket, withRoutes, type Net } from '../src/lib/game/routing';

/** PC1 -- R1 -- R2 -- PC2, like the three-router lab. */
const line = (): Net => ({
  nodes: [
    { id: 'pc1', label: 'PC1', kind: 'host', ifaces: [{ name: 'e0', ip: '192.168.1.10', cidr: 24 }], gateway: '192.168.1.1', routes: [] },
    { id: 'r1', label: 'R1', kind: 'router', ifaces: [{ name: 'e1', ip: '192.168.1.1', cidr: 24 }, { name: 'e2', ip: '10.0.0.1', cidr: 30 }], routes: [] },
    { id: 'r2', label: 'R2', kind: 'router', ifaces: [{ name: 'e1', ip: '10.0.0.2', cidr: 30 }, { name: 'e2', ip: '192.168.2.1', cidr: 24 }], routes: [] },
    { id: 'pc2', label: 'PC2', kind: 'host', ifaces: [{ name: 'e0', ip: '192.168.2.10', cidr: 24 }], gateway: '192.168.2.1', routes: [] },
  ],
  links: [
    { a: 'pc1', ai: 'e0', b: 'r1', bi: 'e1', up: true },
    { a: 'r1', ai: 'e2', b: 'r2', bi: 'e1', up: true },
    { a: 'r2', ai: 'e2', b: 'pc2', bi: 'e0', up: true },
  ],
});

const fixed = () => withRoutes(line(), {
  r1: [{ dst: '192.168.2.0/24', via: '10.0.0.2' }],
  r2: [{ dst: '192.168.1.0/24', via: '10.0.0.1' }],
});

describe('forwarding', () => {
  it('delivers along a working path and records it', () => {
    const o = sendPacket(fixed(), 'pc1', '192.168.2.10');
    expect(o).toEqual({ delivered: true, path: ['pc1', 'r1', 'r2', 'pc2'] });
  });
  it('drops with no route when the router has none', () => {
    const o = sendPacket(line(), 'pc1', '192.168.2.10');
    expect(o).toMatchObject({ delivered: false, reason: 'no-route', at: 'r1' });
  });
  it('the reply needs a return route too', () => {
    const half = withRoutes(line(), { r1: [{ dst: '192.168.2.0/24', via: '10.0.0.2' }] });
    expect(sendPacket(half, 'pc1', '192.168.2.10').delivered).toBe(true);
    expect(sendPacket(half, 'pc2', '192.168.1.10')).toMatchObject({ delivered: false, reason: 'no-route', at: 'r2' });
  });
  it('reaches a router-owned address and connected hosts', () => {
    expect(sendPacket(line(), 'pc1', '192.168.1.1').delivered).toBe(true);
    expect(sendPacket(line(), 'r1', '10.0.0.2').delivered).toBe(true);
  });
  it('a default route catches everything else', () => {
    const n = withRoutes(line(), { r1: [{ dst: '0.0.0.0/0', via: '10.0.0.2' }] });
    expect(sendPacket(n, 'pc1', '192.168.2.10').delivered).toBe(true);
  });
  it('a host without a gateway cannot leave its subnet', () => {
    const n = line();
    delete n.nodes[0].gateway;
    expect(sendPacket(n, 'pc1', '192.168.2.10')).toMatchObject({ delivered: false, reason: 'no-gateway' });
  });
});

describe('longest prefix match', () => {
  const twoExits = (): Net => ({
    nodes: [
      { id: 'a', label: 'A', kind: 'host', ifaces: [{ name: 'e0', ip: '10.9.0.10', cidr: 24 }], gateway: '10.9.0.1', routes: [] },
      { id: 'r', label: 'R', kind: 'router', ifaces: [{ name: 'e0', ip: '10.9.0.1', cidr: 24 }, { name: 'e1', ip: '172.16.0.1', cidr: 30 }, { name: 'e2', ip: '172.16.1.1', cidr: 30 }],
        routes: [{ dst: '0.0.0.0/0', via: '172.16.0.2' }, { dst: '8.8.8.0/24', via: '172.16.1.2' }] },
      { id: 'isp1', label: 'ISP1', kind: 'router', ifaces: [{ name: 'e0', ip: '172.16.0.2', cidr: 30 }, { name: 'e1', ip: '9.9.9.9', cidr: 32 }], routes: [] },
      { id: 'isp2', label: 'ISP2', kind: 'router', ifaces: [{ name: 'e0', ip: '172.16.1.2', cidr: 30 }, { name: 'e1', ip: '8.8.8.8', cidr: 32 }], routes: [] },
    ],
    links: [
      { a: 'a', ai: 'e0', b: 'r', bi: 'e0', up: true },
      { a: 'r', ai: 'e1', b: 'isp1', bi: 'e0', up: true },
      { a: 'r', ai: 'e2', b: 'isp2', bi: 'e0', up: true },
    ],
  });
  it('the more specific /24 wins over the default route', () => {
    expect(sendPacket(twoExits(), 'a', '8.8.8.8')).toEqual({ delivered: true, path: ['a', 'r', 'isp2'] });
  });
  it('everything else follows the default route', () => {
    expect(sendPacket(twoExits(), 'a', '9.9.9.9')).toEqual({ delivered: true, path: ['a', 'r', 'isp1'] });
  });
  it('a connected network beats a static route of equal length', () => {
    const n = twoExits();
    n.nodes[1].routes.push({ dst: '10.9.0.0/24', via: '172.16.0.2' });
    expect(sendPacket(n, 'a', '10.9.0.1').delivered).toBe(true);
  });
});

describe('failures', () => {
  it('a loop runs out of TTL', () => {
    const n = withRoutes(line(), {
      r1: [{ dst: '192.168.2.0/24', via: '10.0.0.2' }],
      r2: [{ dst: '192.168.2.0/24', via: '10.0.0.1' }], // R2 sends it straight back
    });
    // give R2 no connected path to 192.168.2.0/24 by removing the LAN interface address ownership
    n.nodes[2].ifaces[1] = { name: 'e2', ip: '192.168.3.1', cidr: 24 };
    expect(sendPacket(n, 'pc1', '192.168.2.10')).toMatchObject({ delivered: false, reason: 'ttl' });
  });
  it('a dead link drops the packet', () => {
    const n = fixed();
    n.links[1].up = false;
    expect(sendPacket(n, 'pc1', '192.168.2.10')).toMatchObject({ delivered: false, reason: 'link-down', at: 'r1' });
  });
  it('a next hop that is not on a connected subnet is refused', () => {
    const n = withRoutes(line(), { r1: [{ dst: '192.168.2.0/24', via: '10.0.5.2' }] });
    expect(sendPacket(n, 'pc1', '192.168.2.10')).toMatchObject({ delivered: false, reason: 'next-hop-not-on-link' });
  });
  it('a next hop that lands on the wrong neighbour is refused', () => {
    const n = withRoutes(line(), { r1: [{ dst: '192.168.2.0/24', via: '10.0.0.3' }] });
    expect(sendPacket(n, 'pc1', '192.168.2.10')).toMatchObject({ delivered: false, reason: 'next-hop-not-on-link' });
  });
  it('a wrong gateway on a host is caught', () => {
    const n = fixed();
    n.nodes[0].gateway = '192.168.1.99';
    expect(sendPacket(n, 'pc1', '192.168.2.10').delivered).toBe(false);
  });
});

describe('editor helpers', () => {
  it('lists every network once, with the default route last', () => {
    expect(knownPrefixes(line())).toEqual(['10.0.0.0/30', '192.168.1.0/24', '192.168.2.0/24', '0.0.0.0/0']);
  });
  it('offers the neighbours as next hops', () => {
    expect(nextHopChoices(line(), 'r1').map((c) => c.ip).sort()).toEqual(['10.0.0.2', '192.168.1.10']);
  });
  it('writes real RouterOS commands', () => {
    expect(routerOsCommand({ dst: '192.168.2.0/24', via: '10.0.0.2' })).toBe('/ip route add dst-address=192.168.2.0/24 gateway=10.0.0.2');
  });
});
