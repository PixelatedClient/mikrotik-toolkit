import { describe, it, expect } from 'vitest';
import { TOPICS, dailyChallenge, makeQuestion, seeded } from '../src/lib/practice';
import { calcSubnet } from '../src/lib/subnet';
import { cidrToMask } from '../src/lib/netcalc';

describe('practice questions', () => {
  for (const t of TOPICS) {
    it(`${t.id}: 500 random questions are well formed`, () => {
      const r = seeded(42);
      for (let i = 0; i < 500; i++) {
        const q = makeQuestion(t.id, r);
        expect(q.options).toContain(q.answer);
        expect(new Set(q.options).size).toBe(q.options.length);
        expect(q.options.length).toBeGreaterThanOrEqual(2);
        expect(q.why.length).toBeGreaterThan(5);
      }
    });
  }
  it('subnetting answers agree with the engine', () => {
    const r = seeded(7);
    for (let i = 0; i < 400; i++) {
      const q = makeQuestion('subnetting', r);
      const m = q.prompt.match(/(\d+\.\d+\.\d+\.\d+\/\d+)/)!;
      const info = calcSubnet(m[1])!;
      if (q.prompt.startsWith('What is the network')) expect(q.answer).toBe(info.network);
      else if (q.prompt.startsWith('What is the broadcast')) expect(q.answer).toBe(info.broadcast);
      else expect(q.answer).toBe(String(info.usableHosts));
    }
  });
  it('mask answers agree with the engine', () => {
    const r = seeded(9);
    for (let i = 0; i < 300; i++) {
      const q = makeQuestion('masks', r);
      const m = q.prompt.match(/\/(\d+) written/);
      if (m) expect(q.answer).toBe(cidrToMask(Number(m[1])));
      else expect(cidrToMask(Number(q.answer.slice(1)))).toBe(q.prompt.match(/mask ([\d.]+)\?/)![1]);
    }
  });
  it('routing longest-prefix answers really are the longest match', () => {
    const r = seeded(11);
    for (let i = 0; i < 300; i++) {
      const q = makeQuestion('routing', r);
      if (!q.prompt.startsWith('Routes:')) continue;
      const dest = q.prompt.match(/to ([\d.]+) go/)![1];
      const routes = [...q.prompt.matchAll(/([\d.]+\/\d+) via (ISP-\w)/g)].map((m) => ({ p: m[1], hop: m[2] }));
      const best = routes.filter((x) => calcSubnetContains(x.p, dest)).sort((a, b) => Number(b.p.split('/')[1]) - Number(a.p.split('/')[1]))[0];
      expect(q.answer).toBe(best.hop);
    }
  });
  it('the daily challenge is the same for the same day and differs across days', () => {
    expect(dailyChallenge('2026-09-21')).toEqual(dailyChallenge('2026-09-21'));
    expect(dailyChallenge('2026-09-21')).not.toEqual(dailyChallenge('2026-09-22'));
  });
});

function calcSubnetContains(cidr: string, ip: string) {
  const [net, len] = cidr.split('/');
  if (net === '0.0.0.0') return true;
  const info = calcSubnet(`${ip}/${len}`)!;
  return info.network === net;
}
