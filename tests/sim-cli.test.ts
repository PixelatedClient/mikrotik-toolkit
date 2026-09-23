import { describe, expect, it } from 'vitest';
import { Device, Network, runCommand } from '../src/lib/sim';

/** Two routers cabled ether2 <-> ether2, like the capture on real RouterOS 7.16. */
function pair() {
  const net = new Network();
  const r1 = net.add(new Device('R1', 'router', 0));
  const r2 = net.add(new Device('R2', 'router', 1));
  net.connect('R1', 'ether2', 'R2', 'ether2');
  const run = (d: Device, line: string) => runCommand(d, line, []).output;
  return { net, r1, r2, run };
}

describe('command line: errors copied from real RouterOS 7.16', () => {
  const { r1, run } = pair();
  it('unknown command words report their column', () => {
    expect(run(r1, '/ip address foo')).toBe('bad command name foo (line 1 column 13)');
    expect(run(r1, '/ip foo print')).toBe('bad command name foo (line 1 column 5)');
  });
  it('bad values', () => {
    expect(run(r1, '/ip address add address=192.168.1.99/24 interface=ether9')).toBe('input does not match any value of interface');
    expect(run(r1, '/ip address add address=300.1.1.1/24 interface=ether3')).toBe('invalid value for argument address');
    expect(run(r1, '/ip firewall filter add chain=input action=bogus')).toBe('syntax error (line 1 column 44)');
  });
  it('unknown argument names point at the equals sign', () => {
    expect(run(r1, '/routing bgp vpnv4-route print')).toBe('bad command name vpnv4-route (line 1 column 14)');
    expect(run(r1, '/ip address add address=10.1.1.1/24 interface=ether1 passive=yes')).toBe('expected end of command (line 1 column 61)');
  });
  it('missing required arguments', () => {
    expect(run(r1, '/ip address add address=1.1.1.1/24')).toBe('Script Error: missing value(s) of argument(s) interface');
  });
  it('items that do not exist', () => {
    expect(run(r1, '/ip route remove 99')).toBe('no such item');
    expect(run(r1, '/ip address remove 99')).toBe('no such item');
  });
  it('accepts unambiguous abbreviations of arguments, like the real router', () => {
    expect(run(r1, '/ip address add addres=1.1.1.1/24 interface=ether3')).toBe('');
    expect(run(r1, '/ip addr pr')).toContain('1.1.1.1/24');
  });
});

describe('/ip address', () => {
  it('prints the layout real RouterOS uses, with comments above the row', () => {
    const { r1, run } = pair();
    run(r1, '/ip address add address=10.0.12.1/30 interface=ether2 comment="to R2"');
    expect(run(r1, '/ip address print')).toBe(['Columns: ADDRESS, NETWORK, INTERFACE', '# ADDRESS       NETWORK    INTERFACE', ';;; to R2', '0 10.0.12.1/30  10.0.12.0  ether2'].join('\n'));
  });
  it('a bare address becomes a /32 and duplicates are refused', () => {
    const { r1, run } = pair();
    expect(run(r1, '/ip address add address=10.9.9.9 interface=ether3')).toBe('');
    expect(run(r1, '/ip address print terse')).toBe('0 address=10.9.9.9/32 network=10.9.9.9 interface=ether3 actual-interface=ether3');
    expect(run(r1, '/ip address add address=10.9.9.9/32 interface=ether3')).toBe('failure: already have such address');
  });
  it('a disabled address shows the X flag', () => {
    const { r1, run } = pair();
    run(r1, '/ip address add address=192.168.1.1/24 interface=ether3');
    run(r1, '/ip address disable [find where interface=ether3]');
    expect(run(r1, '/ip address print')).toBe(['Flags: X - DISABLED', 'Columns: ADDRESS, NETWORK, INTERFACE', '#   ADDRESS         NETWORK      INTERFACE', '0 X 192.168.1.1/24  192.168.1.0  ether3'].join('\n'));
    run(r1, '/ip address enable 0');
    expect(run(r1, '/ip address print count-only')).toBe('1');
  });
});

describe('/ip route', () => {
  it('prints connected, active, inactive and dynamic routes with the real flags and columns', () => {
    const { r1, run } = pair();
    run(r1, '/ip address add address=10.0.12.1/30 interface=ether2');
    run(r1, '/ip address add address=192.168.1.1/24 interface=ether3'); // ether3 has no cable
    run(r1, '/ip route add dst-address=10.0.23.0/30 gateway=10.0.12.2 comment="R2-R3 link"');
    run(r1, '/ip route add dst-address=10.5.5.0/24 gateway=172.16.0.1'); // not on a connected subnet
    run(r1, '/ip route add dst-address=192.168.3.0/24 gateway=10.0.12.2');
    expect(run(r1, '/ip route print')).toBe(
      [
        'Flags: D - DYNAMIC; I - INACTIVE, A - ACTIVE; c - CONNECT, s - STATIC',
        'Columns: DST-ADDRESS, GATEWAY, DISTANCE',
        '#     DST-ADDRESS     GATEWAY     DISTANCE',
        '  DAc 10.0.12.0/30    ether2             0',
        ';;; R2-R3 link',
        '0  As 10.0.23.0/30    10.0.12.2          1',
        '1  Is 10.5.5.0/24     172.16.0.1         1',
        '  DIc 192.168.1.0/24  ether3             0',
        '2  As 192.168.3.0/24  10.0.12.2          1',
      ].join('\n'),
    );
  });
  it('removing by number and by [find] works', () => {
    const { r1, run } = pair();
    run(r1, '/ip address add address=10.0.12.1/30 interface=ether2');
    run(r1, '/ip route add dst-address=10.0.23.0/30 gateway=10.0.12.2');
    run(r1, '/ip route add dst-address=192.168.3.0/24 gateway=10.0.12.2');
    run(r1, '/ip route remove [find where dst-address=10.0.23.0/30]');
    expect(run(r1, '/ip route print count-only where dst-address=192.168.3.0/24')).toBe('1');
    run(r1, '/ip route remove 0');
    expect(run(r1, '/ip route print count-only')).toBe('1'); // only the connected route is left
  });
  it('where supports or (and binds tighter than or, like RouterOS)', () => {
    const { r1, run } = pair();
    run(r1, '/ip address add address=10.0.12.1/30 interface=ether2');
    run(r1, '/ip route add dst-address=10.0.23.0/30 gateway=10.0.12.2');
    run(r1, '/ip route add dst-address=192.168.3.0/24 gateway=10.0.12.2');
    run(r1, '/ip route add dst-address=192.168.4.0/24 gateway=10.0.12.2');
    // matches either alternative
    expect(run(r1, '/ip route print count-only where dst-address=10.0.23.0/30 or dst-address=192.168.3.0/24')).toBe('2');
    // an empty where (no clause at all) still matches everything
    expect(run(r1, '/ip route print count-only')).toBe('4'); // 3 static + 1 connected
    run(r1, '/ip route remove [find where dst-address=10.0.23.0/30 or dst-address=192.168.4.0/24]');
    expect(run(r1, '/ip route print count-only')).toBe('2'); // 1 static left + 1 connected
  });
  it('move reorders firewall rules (verified on real RouterOS 7.16)', () => {
    const { r1, run } = pair();
    run(r1, '/ip firewall filter add chain=input action=accept comment=a');
    run(r1, '/ip firewall filter add chain=input action=accept comment=b');
    run(r1, '/ip firewall filter add chain=input action=accept comment=c');
    run(r1, '/ip firewall filter move 2 destination=0'); // pull "c" to the front
    expect(run(r1, '/ip firewall filter print terse')).toBe('0 comment=c chain=input action=accept\n1 comment=a chain=input action=accept\n2 comment=b chain=input action=accept');
    run(r1, '/ip firewall filter move 0 destination=0'); // moving something to in front of itself is a no-op
    expect(run(r1, '/ip firewall filter print terse')).toBe('0 comment=c chain=input action=accept\n1 comment=a chain=input action=accept\n2 comment=b chain=input action=accept');
  });
  it('comment sets the comment either as comment=text or bare text (verified on real RouterOS 7.16)', () => {
    const { r1, run } = pair();
    run(r1, '/ip firewall filter add chain=input action=drop');
    run(r1, '/ip firewall filter comment 0 comment=hello');
    expect(run(r1, '/ip firewall filter print terse')).toBe('0 comment=hello chain=input action=drop');
    run(r1, '/ip firewall filter comment 0 "bye now"');
    expect(run(r1, '/ip firewall filter print terse')).toBe('0 comment=bye now chain=input action=drop');
  });
  it('the prompt context works like RouterOS menus', () => {
    const { r1 } = pair();
    const a = runCommand(r1, '/ip address', []);
    expect(a.ctx).toEqual(['ip', 'address']);
    const b = runCommand(r1, 'add address=10.0.0.1/24 interface=ether1', a.ctx);
    expect(b.output).toBe('');
    expect(runCommand(r1, '/ip address print count-only', b.ctx).output).toBe('1');
    expect(runCommand(r1, '..', a.ctx).ctx).toEqual(['ip']);
  });
});

describe('/ping and /tool traceroute output layout (copied from real RouterOS)', () => {
  it('an unconfigured neighbour times out', () => {
    const { r1, run } = pair();
    run(r1, '/ip address add address=10.0.12.1/30 interface=ether2');
    expect(run(r1, '/ping 10.0.12.2 count=2')).toBe(
      [
        '  SEQ HOST                                     SIZE TTL TIME       STATUS      ',
        '    0 10.0.12.2                                                    timeout     ',
        '    1 10.0.12.2                                                    timeout     ',
        '    sent=2 received=0 packet-loss=100%',
      ].join('\n'),
    );
  });
  it('no route to the destination', () => {
    const { r1, run } = pair();
    run(r1, '/ip address add address=10.0.12.1/30 interface=ether2');
    expect(run(r1, '/ping 172.31.0.1 count=2')).toBe(
      [
        '  SEQ HOST                                     SIZE TTL TIME       STATUS      ',
        '    0                                                              no route ...',
        '    1                                                              no route ...',
        '    sent=2 received=0 packet-loss=100%',
      ].join('\n'),
    );
  });
  it('a reply shows size, ttl and time and a summary', () => {
    const { r1, r2, run } = pair();
    run(r1, '/ip address add address=10.0.12.1/30 interface=ether2');
    run(r2, '/ip address add address=10.0.12.2/30 interface=ether2');
    const out = run(r1, '/ping 10.0.12.2 count=2').split('\n');
    expect(out[0]).toBe('  SEQ HOST                                     SIZE TTL TIME       STATUS      ');
    expect(out[1]).toMatch(/^    0 10\.0\.12\.2 {34}56  64 \d+(ms\d+)?us +$/);
    expect(out[3]).toMatch(/^ {4}sent=2 received=2 packet-loss=0% min-rtt=/);
  });
  it('pinging your own address never leaves the router and keeps ttl 64', () => {
    const { r1, run } = pair();
    run(r1, '/ip address add address=10.0.12.1/30 interface=ether2');
    expect(run(r1, '/ping 10.0.12.1 count=1')).toMatch(/56 {2}64 \d+us/);
  });
  it('a hostname gets the same complaint as on the real router', () => {
    const { r1, run } = pair();
    expect(run(r1, '/ping foo count=1')).toBe('invalid value for argument address:\n    invalid value of mac-address, mac address required\n    invalid value for argument ipv6-address\n    failure: dns name exists, but no appropriate record');
  });
  it('traceroute prints the final table', () => {
    const { r1, r2, run } = pair();
    run(r1, '/ip address add address=10.0.12.1/30 interface=ether2');
    run(r2, '/ip address add address=10.0.12.2/30 interface=ether2');
    const out = run(r1, '/tool traceroute 10.0.12.2 count=1').split('\n');
    expect(out[0]).toBe('Columns: ADDRESS, LOSS, SENT, LAST, AVG, BEST, WORST, STD-DEV');
    expect(out[1]).toMatch(/^#  ADDRESS +LOSS +SENT +LAST +AVG +BEST +WORST +STD-DEV$/);
    expect(out[2]).toMatch(/^1  10\.0\.12\.2 +0% +1 +\d\.\dms/);
  });
});

describe('/system identity, /interface and /export', () => {
  it('identity', () => {
    const { r1, run } = pair();
    expect(run(r1, '/system identity print')).toBe('  name: MikroTik');
    run(r1, '/system identity set name=R1');
    expect(run(r1, '/system identity print')).toBe('  name: R1');
  });
  it('interfaces show running, disabled and the loopback', () => {
    const { r1, run } = pair();
    run(r1, '/interface disable ether3');
    const out = run(r1, '/interface print');
    expect(out).toContain('Flags: X - DISABLED, R - RUNNING');
    expect(out).toMatch(/1 R ether2 +ether +1500/);
    expect(out).toMatch(/2 X ether3/);
    expect(run(r1, '/interface print terse where name=ether3')).toMatch(/^2 X name=ether3 default-name=ether3 type=ether mtu=1500 actual-mtu=1500 mac-address=/);
  });
  it('export lists what was configured, with properties in alphabetical order like RouterOS', () => {
    const { r1, run } = pair();
    run(r1, '/system identity set name=R1');
    run(r1, '/ip address add address=10.0.12.1/30 interface=ether2 comment="to R2"');
    run(r1, '/ip route add dst-address=192.168.3.0/24 gateway=10.0.12.2');
    const out = run(r1, '/export').replace(/^# \d{4}-\d\d-\d\d \d\d:\d\d:\d\d by/, '# <date> by');
    expect(out.split('\n').slice(0, 3)).toEqual(['# <date> by RouterOS 7.16', '# software id = ', '#']);
    expect(out).toContain('/ip address\nadd address=10.0.12.1/30 comment="to R2" interface=ether2 network=10.0.12.0\n');
    expect(out).toContain('/ip route\nadd dst-address=192.168.3.0/24 gateway=10.0.12.2\n');
    expect(out).toContain('/system identity\nset name=R1\n');
    expect(run(r1, '/ip address export terse')).toContain('/ip address add address=10.0.12.1/30 comment="to R2" interface=ether2 network=10.0.12.0');
  });
});
