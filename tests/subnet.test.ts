import { describe, it, expect } from 'vitest';
import { calcSubnet, splitSubnet, vlsm } from '../src/lib/subnet';

describe('calcSubnet', () => {
  it('/24', () => {
    const r = calcSubnet('192.168.1.10/24')!;
    expect(r.network).toBe('192.168.1.0');
    expect(r.broadcast).toBe('192.168.1.255');
    expect(r.mask).toBe('255.255.255.0');
    expect(r.wildcard).toBe('0.0.0.255');
    expect(r.usableHosts).toBe(254);
    expect(r.firstHost).toBe('192.168.1.1');
    expect(r.lastHost).toBe('192.168.1.254');
  });
  it('/30', () => expect(calcSubnet('10.0.0.1/30')!.usableHosts).toBe(2));
  it('/31 point-to-point', () => {
    const r = calcSubnet('10.0.0.0/31')!;
    expect(r.usableHosts).toBe(2);
    expect(r.firstHost).toBe('10.0.0.0');
    expect(r.lastHost).toBe('10.0.0.1');
  });
  it('/32', () => expect(calcSubnet('1.2.3.4/32')!.usableHosts).toBe(1));
  it('/0', () => {
    const r = calcSubnet('8.8.8.8/0')!;
    expect(r.network).toBe('0.0.0.0');
    expect(r.broadcast).toBe('255.255.255.255');
    expect(r.totalAddresses).toBe(2 ** 32);
  });
  it('rejects invalid', () => {
    for (const s of ['', '1.2.3/24', '256.1.1.1/24', '1.1.1.1/33', '1.1.1.1', 'a.b.c.d/8'])
      expect(calcSubnet(s)).toBeNull();
  });
});

describe('splitSubnet', () => {
  it('splits /24 into 4 x /26', () =>
    expect(splitSubnet('192.168.1.0/24', 26)).toEqual([
      '192.168.1.0/26', '192.168.1.64/26', '192.168.1.128/26', '192.168.1.192/26',
    ]));
  it('rejects bigger prefix', () => expect(splitSubnet('10.0.0.0/24', 16)).toBeNull());
});

describe('vlsm', () => {
  it('allocates largest first', () =>
    expect(
      vlsm('192.168.0.0/24', [
        { name: 'B', hosts: 50 },
        { name: 'A', hosts: 100 },
        { name: 'WAN', hosts: 2 },
      ]),
    ).toEqual([
      { name: 'A', hosts: 100, subnet: '192.168.0.0/25', cidr: 25 },
      { name: 'B', hosts: 50, subnet: '192.168.0.128/26', cidr: 26 },
      { name: 'WAN', hosts: 2, subnet: '192.168.0.192/30', cidr: 30 },
    ]));
  it('returns null when it does not fit', () =>
    expect(vlsm('10.0.0.0/30', [{ name: 'x', hosts: 10 }])).toBeNull());
});
