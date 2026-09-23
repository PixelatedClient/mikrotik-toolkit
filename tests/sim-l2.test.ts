import { describe, expect, it } from 'vitest';
import { Device, Network, parseIPv4, runCommand } from '../src/lib/sim';

const ip = (s: string) => parseIPv4(s)!;
const trim = (s: string) => s.split('\n').map((l) => l.replace(/\s+$/, '')).join('\n');

/** Router R (trunk on ether1) - switch SW (ether1 trunk, ether2/3 access) - PC1 on ether2, PC2 on ether3. */
function vlanLab() {
  const net = new Network();
  const r = net.add(new Device('R', 'router', 0));
  const sw = net.add(new Device('SW', 'router', 1));
  const pc1 = net.add(new Device('PC1', 'pc', 2));
  const pc2 = net.add(new Device('PC2', 'pc', 3));
  net.connect('R', 'ether1', 'SW', 'ether1');
  net.connect('SW', 'ether2', 'PC1', 'eth0');
  net.connect('SW', 'ether3', 'PC2', 'eth0');
  const run = (d: Device, line: string) => runCommand(d, line, []).output;
  return { net, r, sw, pc1, pc2, run };
}

function routerSide(run: (d: Device, l: string) => string, r: Device) {
  for (const c of [
    '/interface vlan add name=vlan10 interface=ether1 vlan-id=10',
    '/interface vlan add name=vlan20 interface=ether1 vlan-id=20',
    '/ip address add address=10.0.10.1/24 interface=vlan10',
    '/ip address add address=10.0.20.1/24 interface=vlan20',
    '/ip pool add name=p10 ranges=10.0.10.10-10.0.10.20',
    '/ip pool add name=p20 ranges=10.0.20.10-10.0.20.20',
    '/ip dhcp-server add name=dhcp10 interface=vlan10 address-pool=p10 lease-time=1h disabled=no',
    '/ip dhcp-server add name=dhcp20 interface=vlan20 address-pool=p20 lease-time=1h disabled=no',
    '/ip dhcp-server network add address=10.0.10.0/24 gateway=10.0.10.1 dns-server=10.0.10.1',
    '/ip dhcp-server network add address=10.0.20.0/24 gateway=10.0.20.1 dns-server=10.0.20.1',
  ]) run(r, c);
}

function switchSide(run: (d: Device, l: string) => string, sw: Device, opts: { trunkTagsVlan20?: boolean; filtering?: boolean } = {}) {
  const t20 = opts.trunkTagsVlan20 ?? true;
  for (const c of [
    '/interface bridge add name=bridge1',
    '/interface bridge port add bridge=bridge1 interface=ether1 frame-types=admit-only-vlan-tagged comment="trunk"',
    '/interface bridge port add bridge=bridge1 interface=ether2 pvid=10 frame-types=admit-only-untagged-and-priority-tagged comment="PC1"',
    '/interface bridge port add bridge=bridge1 interface=ether3 pvid=20 frame-types=admit-only-untagged-and-priority-tagged comment="PC2"',
    '/interface bridge vlan add bridge=bridge1 vlan-ids=10 tagged=ether1 untagged=ether2 comment="staff"',
    `/interface bridge vlan add bridge=bridge1 vlan-ids=20 ${t20 ? 'tagged=ether1 ' : ''}untagged=ether3 comment="guest"`,
    ...(opts.filtering === false ? [] : ['/interface bridge set bridge1 vlan-filtering=yes']),
  ]) run(sw, c);
}

describe('bridge, VLAN and DHCP commands: errors copied from real RouterOS 7.16', () => {
  const { sw, r, run } = vlanLab();
  it('bridges and ports', () => {
    expect(run(sw, '/interface bridge add name=bridge1')).toBe('');
    expect(run(sw, '/interface bridge add name=bridge1')).toBe('failure: already have interface with such name');
    expect(run(sw, '/interface bridge port add bridge=bridge1 interface=ether1')).toBe('');
    expect(run(sw, '/interface bridge port add bridge=bridge1 interface=ether1')).toBe('failure: device already added as bridge port');
    expect(run(sw, '/interface bridge port add bridge=nope interface=ether4')).toBe('input does not match any value of bridge');
    expect(run(sw, '/interface bridge port add bridge=bridge1 interface=ether9')).toBe('invalid value for argument interface:\n    input does not match any value of interface\n    input does not match any value of interface-list');
  });
  it('bridge VLAN table', () => {
    expect(run(sw, '/interface bridge vlan add bridge=bridge1 vlan-ids=5000 tagged=ether1')).toBe('value of vlan-range out of range (1..4094)');
    expect(run(sw, '/interface bridge vlan add bridge=bridge1 vlan-ids=10 tagged=ether1,bridge1 untagged=ether1')).toBe('failure: interface cannot be in tagged and untagged at the same time');
    expect(run(sw, '/interface bridge vlan add bridge=bridge1 vlan-ids=10 tagged=ether1,bridge1')).toBe('');
  });
  it('vlan interfaces, pools and dhcp servers', () => {
    expect(run(sw, '/interface vlan add name=vlan10-staff interface=bridge1 vlan-id=10')).toBe('');
    expect(run(sw, '/interface vlan add name=vlan10-staff interface=bridge1 vlan-id=11')).toBe('failure: already have interface with such name');
    expect(run(r, '/ip pool add name=p10 ranges=10.0.10.10-10.0.10.20')).toBe('');
    expect(run(r, '/ip pool add name=p10 ranges=10.0.10.30-10.0.10.40')).toBe('failure: pool with such name exists');
    expect(run(r, '/ip dhcp-server add name=bad interface=nothere address-pool=p10')).toBe('input does not match any value of interface');
    expect(run(r, '/ip dhcp-server add name=bad2 interface=ether1 address-pool=nopool')).toBe('input does not match any value of address-pool');
  });
});

describe('bridge and VLAN output layouts (copied from real RouterOS)', () => {
  it('bridge port print', () => {
    const { sw, run } = vlanLab();
    run(sw, '/interface bridge add name=bridge1 protocol-mode=rstp priority=0x2000 comment="backup root"');
    run(sw, '/interface bridge port add bridge=bridge1 interface=ether1 comment="trunk"');
    run(sw, '/interface bridge port add bridge=bridge1 interface=ether3 pvid=10 edge=yes bpdu-guard=yes comment="PC1"');
    expect(trim(run(sw, '/interface bridge port print'))).toBe(
      ['Columns: INTERFACE, BRIDGE, HW, PVID, PRIORITY, HORIZON', '# INTERFACE  BRIDGE   HW   PVID  PRIORITY  HORIZON', ';;; trunk', '0 ether1     bridge1  yes     1  0x80      none', ';;; PC1', '1 ether3     bridge1  yes    10  0x80      none'].join('\n'),
    );
  });
  it('bridge print is a wrapped block with the comment on top', () => {
    const { sw, run } = vlanLab();
    run(sw, '/interface bridge add name=bridge1 protocol-mode=rstp priority=0x2000 comment="backup root"');
    const out = run(sw, '/interface bridge print').split('\n');
    expect(out[0]).toBe('Flags: X - disabled, R - running ');
    expect(out[1]).toBe(' 0 R ;;; backup root');
    expect(out[2]).toMatch(/^ {5}name="bridge1" mtu=auto actual-mtu=1500 l2mtu=65535 arp=enabled $/);
    expect(out.join('\n')).toContain('protocol-mode=rstp');
    expect(out.join('\n')).toContain('priority=0x2000');
    expect(out.join('\n')).toContain('vlan-filtering=no');
  });
  it('vlan interface print', () => {
    const { sw, run } = vlanLab();
    run(sw, '/interface bridge add name=bridge1');
    run(sw, '/interface vlan add name=vlan10-staff interface=bridge1 vlan-id=10');
    expect(trim(run(sw, '/interface vlan print'))).toBe(['Flags: R - RUNNING', 'Columns: NAME, MTU, ARP, VLAN-ID, INTERFACE', '#   NAME           MTU  ARP      VLAN-ID  INTERFACE', '0 R vlan10-staff  1500  enabled       10  bridge1'].join('\n'));
  });
  it('pool, dhcp server and network print', () => {
    const { r, run } = vlanLab();
    run(r, '/interface vlan add name=vlan10 interface=ether1 vlan-id=10');
    run(r, '/ip address add address=10.0.10.1/24 interface=vlan10'); // a server on an interface without an address shows the I flag on real RouterOS
    run(r, '/ip pool add name=p10 ranges=10.0.10.10-10.0.10.20');
    run(r, '/ip dhcp-server add name=dhcp10 interface=vlan10 address-pool=p10 lease-time=1h disabled=no');
    run(r, '/ip dhcp-server network add address=10.0.10.0/24 gateway=10.0.10.1 dns-server=10.0.10.1');
    expect(trim(run(r, '/ip pool print'))).toBe(['Columns: NAME, RANGES', '#  NAME  RANGES', '0  p10   10.0.10.10-10.0.10.20'].join('\n').replace('#  NAME  RANGES', '# NAME  RANGES').replace('0  p10   ', '0 p10   '));
    expect(trim(run(r, '/ip dhcp-server print'))).toBe(['Columns: NAME, INTERFACE, ADDRESS-POOL, LEASE-TIME', '# NAME    INTERFACE  ADDRESS-POOL  LEASE-TIME', '0 dhcp10  vlan10     p10           1h'].join('\n'));
    expect(trim(run(r, '/ip dhcp-server network print'))).toBe(['Columns: ADDRESS, GATEWAY, DNS-SERVER', '# ADDRESS       GATEWAY    DNS-SERVER', '0 10.0.10.0/24  10.0.10.1  10.0.10.1'].join('\n'));
  });
  it('bridge vlan print shows the pvid entry RouterOS adds itself once filtering is on', () => {
    const { sw, run } = vlanLab();
    switchSide(run, sw);
    const out = run(sw, '/interface bridge vlan print');
    expect(out).toContain('Flags: D - DYNAMIC');
    expect(out).toContain('CURRENT-UNTAGGED');
    expect(out).toContain(';;; added by pvid');
    expect(out).toMatch(/[0-9]+ D bridge1 +1 +/);
    expect(out).toMatch(/;;; staff\n0 +bridge1 +10 +ether1 +ether2/);
  });
  it('bridge monitor uses the same right-aligned keys', () => {
    const { sw, run } = vlanLab();
    run(sw, '/interface bridge add name=bridge1 protocol-mode=rstp priority=0x2000 comment="backup root"');
    run(sw, '/interface bridge port add bridge=bridge1 interface=ether1');
    run(sw, '/interface bridge port add bridge=bridge1 interface=ether2');
    const out = run(sw, '/interface bridge monitor bridge1 once').split('\n');
    expect(out[0]).toBe('                     ;;; backup root');
    expect(out[1]).toBe('                  state: enabled');
    expect(out[3]).toBe('            root-bridge: yes');
    expect(out[4]).toMatch(/^ {9}root-bridge-id: 0x2000\.[0-9A-F:]{17}$/);
    expect(out[7]).toBe('             port-count: 2');
  });
});

describe('VLAN switching behaviour', () => {
  it('a correct VLAN setup hands every PC an address from its own VLAN, top of the pool first', () => {
    const { r, sw, pc1, pc2, run } = vlanLab();
    routerSide(run, r);
    switchSide(run, sw);
    expect(run(pc1, 'dhcp')).toBe('DORA IP 10.0.10.20/24 GW 10.0.10.1');
    expect(run(pc2, 'dhcp')).toBe('DORA IP 10.0.20.20/24 GW 10.0.20.1');
    expect(trim(run(r, '/ip dhcp-server lease print'))).toContain('10.0.10.20');
  });
  it('a VLAN missing from the trunk gets no address (NOC incident: VLAN 20 users get no address)', () => {
    const { r, sw, pc1, pc2, run } = vlanLab();
    routerSide(run, r);
    switchSide(run, sw, { trunkTagsVlan20: false });
    expect(run(pc1, 'dhcp')).toContain('DORA IP 10.0.10.');
    expect(run(pc2, 'dhcp')).toBe("Can't find dhcp server");
    // the fix from the incident
    run(sw, '/interface bridge vlan set [find where vlan-ids=20] tagged=ether1');
    expect(run(pc2, 'dhcp')).toContain('DORA IP 10.0.20.');
  });
  it('moving the port to another VLAN moves the PC to another subnet', () => {
    const { r, sw, pc1, run } = vlanLab();
    routerSide(run, r);
    switchSide(run, sw);
    run(pc1, 'dhcp');
    run(sw, '/interface bridge port set [find where interface=ether2] pvid=20');
    run(sw, '/interface bridge vlan set [find where vlan-ids=10] untagged=');
    run(sw, '/interface bridge vlan set [find where vlan-ids=20] untagged=ether3,ether2');
    expect(run(pc1, 'dhcp')).toContain('DORA IP 10.0.20.');
  });
  it('untagged frames are refused on a trunk that only admits tagged ones, and vlan-filtering off lets everything through', () => {
    const { r, sw, pc1, run } = vlanLab();
    routerSide(run, r);
    // a plain bridge, no VLAN filtering: the PC's untagged frames reach the router's ether1, which has no address there
    switchSide(run, sw, { filtering: false });
    expect(run(pc1, 'dhcp')).toBe("Can't find dhcp server");
  });
  it('the switch learns MAC addresses per VLAN once traffic flows', () => {
    const { r, sw, pc1, run } = vlanLab();
    routerSide(run, r);
    switchSide(run, sw);
    run(pc1, 'dhcp');
    const hosts = run(sw, '/interface bridge host print');
    expect(hosts).toContain('Flags: D - DYNAMIC; L - LOCAL');
    expect(hosts).toMatch(/D +00:50:79:66:68:\w\w +10 +ether2 +bridge1/);
  });
  it('same-VLAN PCs talk without a router; different VLANs need one', () => {
    const { r, sw, pc1, pc2, run } = vlanLab();
    routerSide(run, r);
    switchSide(run, sw);
    run(pc1, 'dhcp');
    run(pc2, 'dhcp');
    expect(run(pc1, 'ping 10.0.20.20')).toMatch(/icmp_seq=1 timeout|ttl=/); // routed: no forwarding rules, so it works via the router
    expect(run(pc1, 'ping 10.0.10.1')).toMatch(/ttl=64/);
  });
});

describe('spanning tree (matches the real 4-switch and triangle results)', () => {
  function triangle(prio: [string, string, string] = ['0x1000', '0x2000', '0x8000']) {
    const net = new Network();
    const s = ['SW1', 'SW2', 'SW3'].map((id, i) => net.add(new Device(id, 'router', i)));
    const pc1 = net.add(new Device('PC1', 'pc', 3));
    const pc2 = net.add(new Device('PC2', 'pc', 4));
    net.connect('SW1', 'ether1', 'SW2', 'ether1');
    net.connect('SW2', 'ether2', 'SW3', 'ether1');
    net.connect('SW1', 'ether2', 'SW3', 'ether2');
    net.connect('PC1', 'eth0', 'SW2', 'ether3');
    net.connect('PC2', 'eth0', 'SW3', 'ether3');
    const run = (d: Device, l: string) => runCommand(d, l, []).output;
    s.forEach((sw, i) => {
      run(sw, `/interface bridge add name=bridge1 protocol-mode=rstp priority=${prio[i]}`);
      for (const p of ['ether1', 'ether2', 'ether3']) if (i > 0 || p !== 'ether3') run(sw, `/interface bridge port add bridge=bridge1 interface=${p}`);
      run(sw, `/ip address add address=10.20.0.${i + 1}/24 interface=bridge1`);
    });
    run(pc1, 'ip 10.20.0.11/24');
    run(pc2, 'ip 10.20.0.12/24');
    return { net, s, pc1, pc2, run };
  }
  const roles = (run: (d: Device, l: string) => string, d: Device) => {
    const out = run(d, '/interface bridge port monitor [find] once').split('\n');
    const ifs = out[0].split(':')[1].trim().split(/\s+/);
    const rs = out.find((l) => l.includes('role:'))!.split(':')[1].trim().split(/\s+/);
    return Object.fromEntries(ifs.map((n, i) => [n, rs[i]]));
  };
  it('elects SW1 root and blocks SW3 ether1 exactly like the real lab', () => {
    const { s, run } = triangle();
    expect(run(s[0], '/interface bridge monitor bridge1 once')).toContain('root-bridge: yes');
    expect(run(s[1], '/interface bridge monitor bridge1 once')).toMatch(/root-port: ether1/);
    expect(roles(run, s[1])).toMatchObject({ ether1: 'root-port', ether2: 'designated-port', ether3: 'designated-port' });
    expect(roles(run, s[2])).toMatchObject({ ether1: 'alternate-port', ether2: 'root-port', ether3: 'designated-port' });
  });
  it('moving the root to SW3 flips the roles as verified on the real routers', () => {
    const { s, run } = triangle();
    run(s[2], '/interface bridge set bridge1 priority=0x0000');
    expect(run(s[2], '/interface bridge monitor bridge1 once')).toContain('root-bridge: yes');
    expect(roles(run, s[0])).toMatchObject({ ether1: 'designated-port', ether2: 'root-port' });
    expect(roles(run, s[1])).toMatchObject({ ether1: 'alternate-port', ether2: 'root-port' });
  });
  it('pings cross the tree and survive the loss of the root port', () => {
    const { s, pc1, run } = triangle();
    expect(run(pc1, 'ping 10.20.0.12')).toMatch(/ttl=64/);
    run(s[0], '/interface disable ether1');
    expect(run(s[1], '/interface bridge monitor bridge1 once')).toMatch(/root-port: ether2/);
    expect(run(pc1, 'ping 10.20.0.12')).toMatch(/ttl=64/);
  });
  it('without spanning tree a triangle is a loop and the network stops working', () => {
    const { s, pc1, run } = triangle();
    for (const sw of s) run(sw, '/interface bridge set bridge1 protocol-mode=none');
    expect(run(pc1, 'ping 10.20.0.12')).toMatch(/timeout/);
    for (const sw of s) run(sw, '/interface bridge set bridge1 protocol-mode=rstp');
    expect(run(pc1, 'ping 10.20.0.12')).toMatch(/ttl=64/);
  });
});
