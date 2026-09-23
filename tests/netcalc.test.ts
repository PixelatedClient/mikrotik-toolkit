import { describe, it, expect } from 'vitest';
import {
  bytesInTime, calcIPv6, cidrToMask, classifyIPv6, compressIPv6, convertNumber, expandIPv6, explainSubnet, humanDuration, ipv4Octets, maskToCidr,
  parseIPv6, prefixForHosts, rangeToCidrs, splitIPv6, summarize, transferSeconds, vlsmPlan, wildcardOf,
} from '../src/lib/netcalc';
import { calcSubnet, formatIPv4, parseIPv4 } from '../src/lib/subnet';

const seeded = (seed: number) => () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 2 ** 32);

describe('masks', () => {
  it('converts both ways', () => {
    for (let c = 0; c <= 32; c++) expect(maskToCidr(cidrToMask(c)!)).toBe(c);
    expect(cidrToMask(26)).toBe('255.255.255.192');
    expect(maskToCidr('255.255.255.0')).toBe(24);
  });
  it('rejects masks that are not contiguous', () => {
    for (const m of ['255.0.255.0', '255.255.255.1', '0.255.255.255', '256.0.0.0', 'x']) expect(maskToCidr(m)).toBeNull();
  });
  it('wildcard is the inverse', () => {
    expect(wildcardOf(26)).toBe('0.0.0.63');
    expect(wildcardOf(0)).toBe('255.255.255.255');
    expect(wildcardOf(32)).toBe('0.0.0.0');
    expect(wildcardOf(33)).toBeNull();
  });
});

describe('explainSubnet', () => {
  it('shows the block-size working for the /26 example', () => {
    const w = explainSubnet('192.168.10.73/26')!;
    const text = w.steps.join(' ');
    expect(text).toContain('Block size = 256 - 192 = 64');
    expect(text).toContain('64 to 127');
    expect(text).toContain('Network 192.168.10.64, broadcast 192.168.10.127');
    expect(text).toContain('62');
  });
  it('handles octet boundaries, /31, /32 and /0', () => {
    expect(explainSubnet('10.1.2.3/16')!.steps.join(' ')).toContain('octet boundary');
    expect(explainSubnet('10.0.0.0/31')!.steps.join(' ')).toContain('RFC 3021');
    expect(explainSubnet('10.0.0.1/32')!.steps.join(' ')).toContain('single host');
    expect(explainSubnet('1.2.3.4/0')!.steps.join(' ')).toContain('/0');
  });
  it('the numbers in the working always agree with calcSubnet (2000 random cases)', () => {
    const r = seeded(11);
    for (let i = 0; i < 2000; i++) {
      const ip = [1 + Math.floor(r() * 223), Math.floor(r() * 256), Math.floor(r() * 256), Math.floor(r() * 256)].join('.');
      const c = Math.floor(r() * 33);
      const info = calcSubnet(`${ip}/${c}`)!;
      const text = explainSubnet(`${ip}/${c}`)!.steps.join(' ');
      expect(text).toContain(`Network ${info.network}, broadcast ${info.broadcast}`);
      if (c > 0 && c % 8 !== 0) {
        const k = Math.floor(c / 8), block = 256 - Number(info.mask.split('.')[k]);
        expect(text).toContain(`Block size = ${256 - block} `.replace(String(256 - block), info.mask.split('.')[k]).slice(0, 0) + `Block size = 256 - ${info.mask.split('.')[k]} = ${block}`);
      }
    }
  });
  it('rejects bad input', () => expect(explainSubnet('nope')).toBeNull());
});

describe('rangeToCidrs', () => {
  it('known examples', () => {
    expect(rangeToCidrs('192.168.1.0', '192.168.1.255')).toEqual(['192.168.1.0/24']);
    expect(rangeToCidrs('10.0.0.1', '10.0.0.6')).toEqual(['10.0.0.1/32', '10.0.0.2/31', '10.0.0.4/31', '10.0.0.6/32']);
    expect(rangeToCidrs('0.0.0.0', '255.255.255.255')).toEqual(['0.0.0.0/0']);
    expect(rangeToCidrs('1.1.1.1', '1.1.1.1')).toEqual(['1.1.1.1/32']);
    expect(rangeToCidrs('9.9.9.9', '9.9.9.8')).toBeNull();
  });
  it('500 random ranges are covered exactly, aligned, contiguous and minimal', () => {
    const r = seeded(5);
    for (let t = 0; t < 500; t++) {
      const a = Math.floor(r() * 2 ** 32), span = Math.floor(r() * (r() < 0.5 ? 300 : 2 ** 22));
      const b = Math.min(a + span, 2 ** 32 - 1);
      const list = rangeToCidrs(formatIPv4(a), formatIPv4(b))!;
      let cursor = a;
      for (const c of list) {
        const info = calcSubnet(c)!;
        expect(info.address, `${c} is aligned`).toBe(info.network);
        expect(parseIPv4(info.network), 'contiguous').toBe(cursor);
        cursor = parseIPv4(info.broadcast)! + 1;
      }
      expect(cursor - 1, 'ends at b').toBe(b);
      // minimal: no two neighbours of equal size could be merged into an aligned parent
      for (let i = 0; i + 1 < list.length; i++) {
        const x = calcSubnet(list[i])!, y = calcSubnet(list[i + 1])!;
        if (x.cidr === y.cidr && x.cidr > 0) {
          const parent = calcSubnet(`${x.network}/${x.cidr - 1}`)!;
          expect(parent.network === x.network && parent.broadcast === y.broadcast, `${list[i]} + ${list[i + 1]} should have merged`).toBe(false);
        }
      }
    }
  });
});

describe('summarize', () => {
  it('four consecutive /24s make one exact /22', () => {
    const s = summarize(['192.168.4.0/24', '192.168.5.0/24', '192.168.6.0/24', '192.168.7.0/24'])!;
    expect(s.summary).toBe('192.168.4.0/22');
    expect(s.exact).toBe(true);
    expect(s.minimal).toEqual(['192.168.4.0/22']);
    expect(s.extra).toBe(0);
  });
  it('a gap makes the summary inexact and counts the extra space', () => {
    const s = summarize(['10.0.0.0/24', '10.0.1.0/24', '10.0.3.0/24'])!;
    expect(s.summary).toBe('10.0.0.0/22');
    expect(s.exact).toBe(false);
    expect(s.extra).toBe(256);
    expect(s.minimal).toEqual(['10.0.0.0/23', '10.0.3.0/24']);
  });
  it('order does not matter and overlaps are merged', () => {
    const s = summarize(['10.0.1.0/24', '10.0.0.0/23', '10.0.0.0/24'])!;
    expect(s.minimal).toEqual(['10.0.0.0/23']);
    expect(s.inputAddresses).toBe(512);
  });
  it('distant blocks fall back to a broad summary', () => {
    expect(summarize(['10.0.0.0/8', '192.168.0.0/16'])!.summary).toBe('0.0.0.0/0');
  });
  it('the summary always covers every input (300 random sets)', () => {
    const r = seeded(9);
    for (let t = 0; t < 300; t++) {
      const list = Array.from({ length: 1 + Math.floor(r() * 5) }, () => `10.${Math.floor(r() * 4)}.${Math.floor(r() * 256)}.0/${16 + Math.floor(r() * 9)}`);
      const s = summarize(list)!;
      const sm = calcSubnet(s.summary)!;
      for (const p of list) {
        const i = calcSubnet(p)!;
        expect(parseIPv4(i.network)!).toBeGreaterThanOrEqual(parseIPv4(sm.network)!);
        expect(parseIPv4(i.broadcast)!).toBeLessThanOrEqual(parseIPv4(sm.broadcast)!);
      }
      expect(s.extra).toBe(s.summaryAddresses - s.inputAddresses);
      expect(s.exact).toBe(s.extra === 0);
      // the minimal list covers exactly the input addresses
      expect(s.minimal.reduce((n, c) => n + calcSubnet(c)!.totalAddresses, 0)).toBe(s.inputAddresses);
    }
  });
  it('rejects bad input', () => {
    expect(summarize(['x'])).toBeNull();
    expect(summarize([])).toBeNull();
  });
});

describe('VLSM plan', () => {
  it('the classic 100 / 50 / 25 / 2 example', () => {
    const r = vlsmPlan('192.168.10.0/24', [{ name: 'B', hosts: 50 }, { name: 'A', hosts: 100 }, { name: 'C', hosts: 25 }, { name: 'WAN', hosts: 2 }]);
    if (!r.ok) throw new Error(r.error);
    expect(r.rows.map((x) => `${x.name} ${x.subnet}`)).toEqual(['A 192.168.10.0/25', 'B 192.168.10.128/26', 'C 192.168.10.192/27', 'WAN 192.168.10.224/30']);
    expect(r.rows[0].spare).toBe(26);
    expect(r.free).toEqual(['192.168.10.228/30', '192.168.10.232/29', '192.168.10.240/28']);
    expect(r.freeAddresses).toBe(28);
  });
  it('reports running out of space and bad parents', () => {
    const r = vlsmPlan('10.0.0.0/30', [{ name: 'x', hosts: 10 }]);
    expect(r.ok).toBe(false);
    expect(vlsmPlan('10.0.0.5/24', [{ name: 'x', hosts: 1 }]).ok).toBe(false);
    expect(vlsmPlan('nope', [{ name: 'x', hosts: 1 }]).ok).toBe(false);
    expect(vlsmPlan('10.0.0.0/24', [{ name: 'x', hosts: 0 }]).ok).toBe(false);
  });
  it('random plans never overlap and are always aligned', () => {
    const r = seeded(21);
    for (let t = 0; t < 300; t++) {
      const needs = Array.from({ length: 1 + Math.floor(r() * 6) }, (_, i) => ({ name: `n${i}`, hosts: 1 + Math.floor(r() * 120) }));
      const res = vlsmPlan('172.16.0.0/22', needs);
      if (!res.ok) continue;
      const spans = res.rows.map((x) => [parseIPv4(x.subnet.split('/')[0])!, parseIPv4(x.broadcast)!] as const).sort((a, b) => a[0] - b[0]);
      for (let i = 1; i < spans.length; i++) expect(spans[i][0]).toBeGreaterThan(spans[i - 1][1]);
      for (const row of res.rows) {
        expect(row.spare).toBeGreaterThanOrEqual(0);
        expect(calcSubnet(row.subnet)!.usableHosts).toBeGreaterThanOrEqual(row.hosts);
        expect(prefixForHosts(row.hosts)).toBe(row.cidr);
      }
      expect(res.rows.reduce((n, x) => n + x.size, 0) + res.freeAddresses).toBe(1024);
    }
  });
});

describe('number bases', () => {
  it('converts in every direction', () => {
    expect(convertNumber('255', 10)).toEqual({ dec: '255', bin: '11111111', oct: '377', hex: 'FF' });
    expect(convertNumber('0xFF', 16)!.dec).toBe('255');
    expect(convertNumber('1100 0000', 2)!.dec).toBe('192');
    expect(convertNumber('377', 8)!.hex).toBe('FF');
  });
  it('rejects invalid digits and empties', () => {
    for (const [s, b] of [['2', 2], ['9', 8], ['g', 16], ['', 10], ['-1', 10], ['1.5', 10]] as const) expect(convertNumber(s, b)).toBeNull();
  });
  it('handles values beyond 32 bits', () => expect(convertNumber('ffffffffffffffff', 16)!.dec).toBe('18446744073709551615'));
  it('ipv4Octets', () => {
    expect(ipv4Octets('192.168.1.10')).toEqual(['11000000', '10101000', '00000001', '00001010']);
    expect(ipv4Octets('300.1.1.1')).toBeNull();
  });
});

describe('IPv6 (RFC 5952 canonical form)', () => {
  const canon = (s: string) => compressIPv6(parseIPv6(s)!);
  it('the examples from the RFC', () => {
    expect(canon('2001:0db8::0001')).toBe('2001:db8::1');
    expect(canon('2001:db8:0:0:0:0:2:1')).toBe('2001:db8::2:1');
    expect(canon('2001:db8:0:1:1:1:1:1')).toBe('2001:db8:0:1:1:1:1:1'); // one zero group is not shortened
    expect(canon('2001:db8:0:0:1:0:0:1')).toBe('2001:db8::1:0:0:1'); // first of equal runs
    expect(canon('2001:DB8::A')).toBe('2001:db8::a'); // lowercase
  });
  it('special cases', () => {
    expect(canon('0:0:0:0:0:0:0:0')).toBe('::');
    expect(canon('0:0:0:0:0:0:0:1')).toBe('::1');
    expect(canon('1:0:0:0:0:0:0:0')).toBe('1::');
    expect(canon('::ffff:192.0.2.1')).toBe('::ffff:c000:201');
  });
  it('parsing rejects malformed addresses', () => {
    for (const s of ['', ':::', '1::2::3', '12345::', 'g::1', '1:2:3:4:5:6:7', '1:2:3:4:5:6:7:8:9', '1.2.3.4', '::1.2.3', '2001:db8::1%eth0']) expect(parseIPv6(s), s).toBeNull();
  });
  it('round trips 2000 random addresses through expand and compress', () => {
    const r = seeded(3);
    for (let i = 0; i < 2000; i++) {
      let n = 0n;
      for (let g = 0; g < 8; g++) n = (n << 16n) | BigInt(r() < 0.4 ? 0 : Math.floor(r() * 65536));
      expect(parseIPv6(compressIPv6(n))).toBe(n);
      expect(parseIPv6(expandIPv6(n))).toBe(n);
      const c = compressIPv6(n);
      expect(c).toBe(c.toLowerCase());
      expect(c).not.toMatch(/:::/);
      expect(c.split('::').length).toBeLessThanOrEqual(2);
      expect(c).not.toMatch(/(^|:)0[0-9a-f]/); // no leading zeros
    }
  });
  it('prefix calculations', () => {
    const i = calcIPv6('2001:db8:abcd:12::5/64')!;
    expect(i.network).toBe('2001:db8:abcd:12::');
    expect(i.last).toBe('2001:db8:abcd:12:ffff:ffff:ffff:ffff');
    expect(i.addresses).toBe(2n ** 64n);
    expect(i.subnets64).toBe(1n);
    expect(calcIPv6('2001:db8::/32')!.subnets64).toBe(2n ** 32n);
    expect(calcIPv6('2001:db8::/48')!.subnets64).toBe(65536n);
    expect(calcIPv6('2001:db8::1')!.prefix).toBe(128);
    expect(calcIPv6('2001:db8::/129')).toBeNull();
    expect(calcIPv6('2001:db8::/x')).toBeNull();
  });
  it('classifies the special ranges named in RFC 4291, 4193 and 3849', () => {
    const k = (s: string) => classifyIPv6(parseIPv6(s)!);
    expect(k('::')).toContain('Unspecified');
    expect(k('::1')).toContain('Loopback');
    expect(k('fe80::1')).toContain('Link-local');
    expect(k('febf::1')).toContain('Link-local');
    expect(k('fec0::1')).not.toContain('Link-local'); // outside fe80::/10
    expect(k('fd12:3456::1')).toContain('locally assigned');
    expect(k('fc00::1')).toContain('Unique local');
    expect(k('ff02::1')).toContain('Multicast');
    expect(k('2001:db8::1')).toContain('Documentation');
    expect(k('2606:4700::1111')).toContain('Not one of');
  });
  it('splits a /48 into /64s', () => {
    const s = splitIPv6('2001:db8:1::/48', 64, 4)!;
    expect(s.total).toBe(65536n);
    expect(s.list).toEqual(['2001:db8:1::/64', '2001:db8:1:1::/64', '2001:db8:1:2::/64', '2001:db8:1:3::/64']);
    expect(splitIPv6('2001:db8::/64', 48)).toBeNull();
    expect(splitIPv6('2001:db8::/32', 128)).toBeNull(); // more than 2^64 pieces
  });
});

describe('bandwidth', () => {
  it('transfer time', () => {
    expect(transferSeconds(1, 'GB', 1, 'Gbps')).toBeCloseTo(8, 6);
    expect(transferSeconds(100, 'MB', 100, 'Mbps')).toBeCloseTo(8, 6);
    expect(transferSeconds(1, 'GiB', 1, 'Gbps')).toBeCloseTo(8.589934592, 6);
    expect(transferSeconds(1, 'GB', 1, 'Gbps', 50)).toBeCloseTo(16, 6);
    expect(transferSeconds(1, 'GB', 0, 'Mbps')).toBe(Infinity);
  });
  it('data in a period', () => {
    expect(bytesInTime(8, 'Mbps', 1)).toBe(1e6);
    expect(bytesInTime(1, 'Gbps', 3600) / 1e9).toBeCloseTo(450, 6);
  });
  it('readable durations', () => {
    expect(humanDuration(0.5)).toBe('500 ms');
    expect(humanDuration(8)).toBe('8.00 s');
    expect(humanDuration(3725)).toBe('1 h 2 min 5 s');
    expect(humanDuration(Infinity)).toBe('n/a');
  });
});
