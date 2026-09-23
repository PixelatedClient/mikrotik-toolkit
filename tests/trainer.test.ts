import { describe, it, expect } from 'vitest';
import { isCorrect, makeQuestion, type Level } from '../src/lib/trainer';
import { calcSubnet, parseIPv4 } from '../src/lib/subnet';

/** Small deterministic PRNG so failures are reproducible. */
const seeded = (seed: number) => () => {
  seed = (seed * 1664525 + 1013904223) >>> 0;
  return seed / 2 ** 32;
};

describe('question generator', () => {
  for (const level of [1, 2, 3] as Level[]) {
    it(`level ${level}: 2000 questions are well formed and self-consistent`, () => {
      const rng = seeded(level * 7919);
      for (let i = 0; i < 2000; i++) {
        const q = makeQuestion(level, rng);
        expect(q.prompt.length).toBeGreaterThan(10);
        expect(q.answer).toBeTruthy();
        expect(q.working).toBeTruthy();
        expect(isCorrect(q, q.answer)).toBe(true);
        expect(q.answer).not.toMatch(/NaN|undefined/);
        expect(q.prompt).not.toMatch(/NaN|undefined/);

        // Independently recompute address answers from the prompt.
        const m = q.prompt.match(/of (\d+\.\d+\.\d+\.\d+)\/(\d+)\?/);
        if (m) {
          const info = calcSubnet(`${m[1]}/${m[2]}`)!;
          const expected = q.prompt.includes('network address') ? info.network
            : q.prompt.includes('broadcast') ? info.broadcast
            : q.prompt.includes('first usable') ? info.firstHost : info.lastHost;
          expect(q.answer).toBe(expected);
          expect(parseIPv4(q.answer)).not.toBeNull();
        }
      }
    });
  }

  it('accepts sloppy formatting but not wrong answers', () => {
    const q = { kind: 'x', prompt: '', answer: '/26', working: '' };
    expect(isCorrect(q, ' /26 ')).toBe(true);
    expect(isCorrect(q, '/25')).toBe(false);
    expect(isCorrect(q, '')).toBe(false);
  });

  it('hosts-need answers really are the smallest fitting subnet', () => {
    const rng = seeded(42);
    let checked = 0;
    for (let i = 0; i < 3000 && checked < 50; i++) {
      const q = makeQuestion(2, rng);
      const m = q.prompt.match(/fits (\d+) hosts/);
      if (!m) continue;
      const need = Number(m[1]);
      const p = Number(q.answer.slice(1));
      expect(2 ** (32 - p) - 2).toBeGreaterThanOrEqual(need);
      expect(2 ** (31 - p) - 2).toBeLessThan(need);
      checked++;
    }
    expect(checked).toBeGreaterThan(10);
  });

  it('same-subnet questions cover both yes and no', () => {
    const rng = seeded(7);
    const answers = new Set<string>();
    for (let i = 0; i < 3000; i++) {
      const q = makeQuestion(3, rng);
      if (q.kind === 'same-subnet') answers.add(q.answer);
    }
    expect(answers).toEqual(new Set(['yes', 'no']));
  });
});
