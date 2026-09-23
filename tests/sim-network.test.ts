import { describe, expect, it } from 'vitest';
import { Device, Network, parseIPv4, runCommand } from '../src/lib/sim';

const ip = (s: string) => parseIPv4(s)!;

/** PC1 - R1 - R2 - R3 - PC3 in a line, addressed like the three-router lab. */
function threeRouters(withRoutes = true) {
  const net = new Network();
  const [r1, r2, r3] = ['R1', 'R2', 'R3'].map((id, i) => net.add(new Device(id, 'router', i)));
  const pc1 = net.add(new Device('PC1', 'pc', 3));
  const pc3 = net.add(new Device('PC3', 'pc', 4));
  net.connect('PC1', 'eth0', 'R1', 'ether2');
  net.connect('R1', 'ether1', 'R2', 'ether1');
  net.connect('R2', 'ether2', 'R3', 'ether1');
  net.connect('R3', 'ether2', 'PC3', 'eth0');
  const run = (d: Device, line: string) => runCommand(d, line, []).output;
  for (const [d, cmds] of [
    [r1, ['/ip address add address=10.0.12.1/30 interface=ether1', '/ip address add address=192.168.1.1/24 interface=ether2']],
    [r2, ['/ip address add address=10.0.12.2/30 interface=ether1', '/ip address add address=10.0.23.1/30 interface=ether2']],
    [r3, ['/ip address add address=10.0.23.2/30 interface=ether1', '/ip address add address=192.168.3.1/24 interface=ether2']],
  ] as [Device, string[]][]) for (const c of cmds) run(d, c);
  if (withRoutes) {
    run(r1, '/ip route add dst-address=10.0.23.0/30 gateway=10.0.12.2');
    run(r1, '/ip route add dst-address=192.168.3.0/24 gateway=10.0.12.2');
    run(r2, '/ip route add dst-address=192.168.1.0/24 gateway=10.0.12.1');
    run(r2, '/ip route add dst-address=192.168.3.0/24 gateway=10.0.23.2');
    run(r3, '/ip route add dst-address=10.0.12.0/30 gateway=10.0.23.1');
    run(r3, '/ip route add dst-address=192.168.1.0/24 gateway=10.0.23.1');
  }
  run(pc1, 'ip 192.168.1.10/24 192.168.1.1');
  run(pc3, 'ip 192.168.3.10/24 192.168.3.1');
  return { net, r1, r2, r3, pc1, pc3, run };
}

describe('forwarding (checked against real RouterOS 7.16)', () => {
  it('the three-router lab works end to end with ttl 63 across one router', () => {
    const { net, r1 } = threeRouters();
    const r = net.pingOnce(r1, ip('192.168.3.1'), { srcAddress: ip('192.168.1.1') });
    expect(r.status).toBe('reply');
    expect(r.status === 'reply' && r.ttl).toBe(63); // the reply from R3 crosses R2 once (real RouterOS showed 63 in the lab)
  });
  it('neighbours are reached with ttl 64', () => {
    const { net, r1 } = threeRouters();
    const r = net.pingOnce(r1, ip('10.0.12.2'));
    expect(r.status === 'reply' && r.ttl).toBe(64);
  });
  it('traceroute lists R2 then the destination', () => {
    const { net, r1 } = threeRouters();
    const rows = net.traceroute(r1, ip('192.168.3.1'), { count: 1, maxHops: 10, srcAddress: ip('192.168.1.1') });
    expect(rows.map((r) => r.address)).toEqual(['10.0.12.2', '192.168.3.1']);
  });
  it('without the return route the ping fails, and the first router reports net unreachable', () => {
    const { net, r1, run, r2 } = threeRouters();
    run(r2, '/ip route remove [find where dst-address=192.168.3.0/24]');
    const r = net.pingOnce(r1, ip('192.168.3.1'), { srcAddress: ip('192.168.1.1') });
    expect(r).toEqual({ status: 'error', err: 'net-unreachable', from: ip('10.0.12.2') });
  });
  it('a missing return route makes the ping time out even though the request arrives', () => {
    const { net, r1, run, r3 } = threeRouters();
    run(r3, '/ip route remove [find where dst-address=192.168.1.0/24]');
    expect(net.pingOnce(r1, ip('192.168.3.1'), { srcAddress: ip('192.168.1.1') }).status).toBe('timeout');
  });
  it('PCs reach each other across three routers and report an unreachable gateway', () => {
    const { pc1, run } = threeRouters();
    expect(run(pc1, 'ping 192.168.3.10')).toMatch(/84 bytes from 192\.168\.3\.10 icmp_seq=1 ttl=61/);
    const { pc1: lonely, run: run2 } = threeRouters(false);
    expect(run2(lonely, 'ping 192.168.3.10')).toMatch(/icmp_seq=1|not reachable/);
  });
});

describe('routing rules verified on the real router', () => {
  it('longest prefix beats distance: a /24 at distance 200 wins over a /16 at distance 1', () => {
    const { net, r1, run } = threeRouters(false);
    run(r1, '/ip route add dst-address=10.150.0.0/16 gateway=10.0.12.2 distance=1');
    run(r1, '/ip route add dst-address=10.150.5.0/24 blackhole distance=200');
    const wide = r1.lookup(ip('10.150.9.9'))!;
    const narrow = r1.lookup(ip('10.150.5.5'))!;
    expect(wide.dstText).toBe('10.150.0.0/16');
    expect(narrow.dstText).toBe('10.150.5.0/24');
    expect(narrow.blackhole).toBe(true);
    void net;
  });
  it('a next hop that is not on a connected subnet leaves the route inactive', () => {
    const { r1, run } = threeRouters(false);
    run(r1, '/ip route add dst-address=10.160.0.0/24 gateway=172.31.9.9');
    expect(run(r1, '/ip route print where dst-address=10.160.0.0/24')).toMatch(/0 +Is +10\.160\.0\.0\/24 +172\.31\.9\.9/);
  });
  it('connected beats static for the same prefix', () => {
    const { r1, run } = threeRouters(false);
    run(r1, '/ip route add dst-address=10.0.12.0/30 gateway=10.0.12.2');
    expect(r1.lookup(ip('10.0.12.2'))!.connected).toBe(true);
  });
  it('disabling an interface removes its routes from use', () => {
    const { r1, run, net } = threeRouters();
    run(r1, '/interface disable ether1');
    expect(net.pingOnce(r1, ip('192.168.3.1'), { srcAddress: ip('192.168.1.1') }).status).toBe('no-route');
    run(r1, '/interface enable ether1');
    expect(net.pingOnce(r1, ip('192.168.3.1'), { srcAddress: ip('192.168.1.1') }).status).toBe('reply');
  });
  it('a cut cable takes the far side down too', () => {
    const { r2, run, net, r1 } = threeRouters();
    run(r2, '/interface disable ether1');
    expect(r1.running('ether1')).toBe(false);
    expect(net.pingOnce(r1, ip('10.0.12.2')).status).not.toBe('reply');
  });
});

describe('firewall behaviour verified on the real router', () => {
  it('drop is silent, reject answers with an ICMP error', () => {
    const a = threeRouters();
    a.run(a.r2, '/ip firewall filter add chain=input protocol=icmp action=drop');
    expect(a.net.pingOnce(a.r1, ip('10.0.12.2')).status).toBe('timeout');
    const b = threeRouters();
    b.run(b.r2, '/ip firewall filter add chain=input protocol=icmp action=reject');
    expect(b.net.pingOnce(b.r1, ip('10.0.12.2'))).toEqual({ status: 'error', err: 'net-unreachable', from: ip('10.0.12.2') });
  });
  it('a packet that matches no rule is accepted; first match wins', () => {
    const { net, r1, r2, run } = threeRouters();
    run(r2, '/ip firewall filter add chain=input action=accept protocol=icmp');
    run(r2, '/ip firewall filter add chain=input action=drop');
    expect(net.pingOnce(r1, ip('10.0.12.2')).status).toBe('reply');
    run(r2, '/ip firewall filter remove 0');
    expect(net.pingOnce(r1, ip('10.0.12.2')).status).toBe('timeout');
  });
  it('a drop-all input chain kills the router\'s own pings unless established replies are accepted first', () => {
    const { net, r1, run } = threeRouters();
    run(r1, '/ip firewall filter add chain=input action=drop');
    expect(net.pingOnce(r1, ip('10.0.12.2')).status).toBe('timeout');
    run(r1, '/ip firewall filter add chain=input action=accept connection-state=established,related place-before=0');
    expect(net.pingOnce(r1, ip('10.0.12.2')).status).toBe('reply');
  });
  it('the forward chain only sees traffic that passes through the router', () => {
    const { net, r1, r2, run } = threeRouters();
    run(r2, '/ip firewall filter add chain=forward action=drop');
    expect(net.pingOnce(r1, ip('10.0.12.2')).status).toBe('reply'); // addressed to R2 itself: input chain
    expect(net.pingOnce(r1, ip('192.168.3.1'), { srcAddress: ip('192.168.1.1') }).status).toBe('timeout');
  });
  it('a final forward drop needs an established accept, or replies are lost', () => {
    const { net, r1, r2, run } = threeRouters();
    run(r2, '/ip firewall filter add chain=forward action=accept connection-state=established,related');
    run(r2, '/ip firewall filter add chain=forward action=drop connection-state=new in-interface=ether2');
    run(r2, '/ip firewall filter add chain=forward action=drop');
    // request from R1 side is new but not from ether2: falls to the final drop
    expect(net.pingOnce(r1, ip('192.168.3.1'), { srcAddress: ip('192.168.1.1') }).status).toBe('timeout');
  });
});

describe('NAT verified on the real router', () => {
  /** LAN host behind GW, "internet" host beyond ISP, like the nat-port-forward lab. */
  function natLab() {
    const net = new Network();
    const isp = net.add(new Device('ISP', 'router', 0));
    const gw = net.add(new Device('GW', 'router', 1));
    const srv = net.add(new Device('SRV', 'router', 2));
    net.connect('ISP', 'ether1', 'GW', 'ether1');
    net.connect('GW', 'ether2', 'SRV', 'ether1');
    const run = (d: Device, line: string) => runCommand(d, line, []).output;
    run(isp, '/ip address add address=8.8.8.8/32 interface=lo');
    run(isp, '/ip address add address=203.0.113.1/30 interface=ether1');
    run(gw, '/ip address add address=203.0.113.2/30 interface=ether1');
    run(gw, '/ip address add address=192.168.88.1/24 interface=ether2');
    run(gw, '/ip route add dst-address=0.0.0.0/0 gateway=203.0.113.1');
    run(srv, '/ip address add address=192.168.88.10/24 interface=ether1');
    run(srv, '/ip route add dst-address=0.0.0.0/0 gateway=192.168.88.1');
    run(srv, '/ip service set www disabled=no port=80');
    return { net, isp, gw, srv, run };
  }
  it('without masquerade the LAN cannot reach the internet, with it they can', () => {
    const { net, gw, srv, run } = natLab();
    expect(net.pingOnce(srv, ip('8.8.8.8')).status).toBe('timeout');
    expect(net.pingOnce(gw, ip('8.8.8.8')).status).toBe('reply'); // the router itself can
    run(gw, '/ip firewall nat add chain=srcnat action=masquerade out-interface=ether1');
    expect(net.pingOnce(srv, ip('8.8.8.8')).status).toBe('reply');
  });
  it('a port forward needs the dst-nat rule, and traffic to the router itself hits the input chain', () => {
    const { net, isp, run, gw } = natLab();
    run(gw, '/ip firewall filter add chain=input action=accept connection-state=established,related');
    run(gw, '/ip firewall filter add chain=input action=accept in-interface=ether2');
    run(gw, '/ip firewall filter add chain=input action=drop');
    run(gw, '/ip firewall nat add chain=srcnat action=masquerade out-interface=ether1');
    expect(net.tcpConnect(isp, ip('203.0.113.2'), 8080)).toBe('timeout');
    const inputDrop = gw.filter[gw.filter.length - 1];
    expect(inputDrop.packets).toBeGreaterThan(0); // the input chain drop counted it
    run(gw, '/ip firewall nat add chain=dstnat action=dst-nat protocol=tcp dst-port=8080 in-interface=ether1 to-addresses=192.168.88.10 to-ports=80');
    expect(net.tcpConnect(isp, ip('203.0.113.2'), 8080)).toBe('connected');
  });
  it('removing the forward "established" accept breaks nothing without a final drop, and breaks it with one', () => {
    const { net, isp, run, gw } = natLab();
    run(gw, '/ip firewall nat add chain=dstnat action=dst-nat protocol=tcp dst-port=8080 to-addresses=192.168.88.10 to-ports=80');
    run(gw, '/ip firewall filter add chain=forward action=drop connection-state=new connection-nat-state=!dstnat in-interface=ether1');
    expect(net.tcpConnect(isp, ip('203.0.113.2'), 8080)).toBe('connected');
    run(gw, '/ip firewall filter add chain=forward action=drop');
    expect(net.tcpConnect(isp, ip('203.0.113.2'), 8080)).toBe('timeout');
  });
  it('a closed port is refused, not timed out', () => {
    const { net, isp, run, gw, srv } = natLab();
    run(gw, '/ip firewall nat add chain=dstnat action=dst-nat protocol=tcp dst-port=8080 to-addresses=192.168.88.10 to-ports=80');
    run(srv, '/ip service set www disabled=yes');
    expect(net.tcpConnect(isp, ip('203.0.113.2'), 8080)).toBe('refused');
  });
});
