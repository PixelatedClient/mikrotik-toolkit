import { describe, it, expect } from 'vitest';
import { SUBNET_LEVELS, starsForMistakes, type Round } from '../src/data/game/subnetLevels';
import { calcSubnet, parseIPv4 } from '../src/lib/subnet';
import { prefixForHosts } from '../src/lib/netcalc';

const bare = (ip: string) => ip.split('/')[0];
const truth = (r: Round): string => {
  switch (r.kind) {
    case 'same-subnet': {
      for (let c = 27; c >= 24; c--) if (calcSubnet(`${r.a}/${c}`)!.network === calcSubnet(`${r.b}/${c}`)!.network) return `/${c}`;
      return '?';
    }
    case 'network': return calcSubnet(r.a!)!.network;
    case 'broadcast': return calcSubnet(r.a!)!.broadcast;
    case 'prefix-for-hosts': return `/${prefixForHosts(r.hosts!)}`;
    case 'usable-count': return String(2 ** (32 - r.cidr!) - 2);
    case 'gateway': {
      const info = calcSubnet(r.a!)!;
      const ok = r.options.filter((o) => parseIPv4(o)! > parseIPv4(info.network)! && parseIPv4(o)! < parseIPv4(info.broadcast)!);
      return ok.length === 1 ? ok[0] : `ambiguous:${ok.join(',')}`;
    }
  }
};

describe('subnet levels', () => {
  for (const lv of SUBNET_LEVELS) {
    it(`${lv.id}: every answer is verified by the engine and is one of the options`, () => {
      for (const r of lv.rounds) {
        expect(r.options).toContain(r.answer);
        expect(new Set(r.options).size).toBe(r.options.length);
        expect(truth(r), r.prompt).toBe(r.answer);
      }
    });
    it(`${lv.id}: has a lesson and a story`, () => {
      expect(lv.learn.length).toBeGreaterThan(20);
      expect(lv.rounds.length).toBeGreaterThanOrEqual(4);
    });
  }
  it('bare() sanity', () => expect(bare('1.2.3.4/24')).toBe('1.2.3.4'));
  it('stars by mistakes', () => {
    expect(starsForMistakes(0, 2)).toBe(3);
    expect(starsForMistakes(1, 2)).toBe(2);
    expect(starsForMistakes(2, 2)).toBe(1);
    expect(starsForMistakes(3, 2)).toBe(0);
  });
});
