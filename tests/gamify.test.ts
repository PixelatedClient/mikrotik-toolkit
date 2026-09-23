import { describe, it, expect } from 'vitest';
import {
  BADGES, awardBadges, emptyState, levelInfo, recordAnswer, recordLevel, sanitize, today, totalStars, touchDay, xpForLevel,
} from '../src/lib/gamify';

describe('levels', () => {
  it('thresholds grow', () => {
    expect([1, 2, 3, 4, 5].map(xpForLevel)).toEqual([0, 100, 300, 600, 1000]);
  });
  it('level and progress', () => {
    expect(levelInfo(0)).toMatchObject({ level: 1, into: 0, need: 100, pct: 0 });
    expect(levelInfo(99).level).toBe(1);
    expect(levelInfo(100)).toMatchObject({ level: 2, into: 0, need: 200 });
    expect(levelInfo(250)).toMatchObject({ level: 2, into: 150, pct: 75 });
    expect(levelInfo(1000).level).toBe(5);
  });
});

describe('streaks', () => {
  it('extends on consecutive days, resets after a gap, ignores the same day', () => {
    let s = touchDay(emptyState(), '2026-09-01');
    expect(s.streakDays).toBe(1);
    s = touchDay(s, '2026-09-01');
    expect(s.streakDays).toBe(1);
    s = touchDay(s, '2026-09-02');
    s = touchDay(s, '2026-09-03');
    expect(s.streakDays).toBe(3);
    s = touchDay(s, '2026-09-05');
    expect(s.streakDays).toBe(1);
  });
  it('works across month and year boundaries', () => {
    expect(touchDay(touchDay(emptyState(), '2026-12-31'), '2027-01-01').streakDays).toBe(2);
    expect(touchDay(touchDay(emptyState(), '2026-02-28'), '2026-03-01').streakDays).toBe(2);
  });
  it('today() is a local YYYY-MM-DD', () => expect(today(new Date(2026, 8, 5))).toBe('2026-09-05'));
});

describe('answers', () => {
  it('pays 10 xp and a growing bonus for a run', () => {
    let s = emptyState();
    const xps: number[] = [];
    for (let i = 0; i < 8; i++) { const r = recordAnswer(s, 'subnetting', true, '2026-09-01'); s = r.state; xps.push(r.xp); }
    expect(xps).toEqual([10, 12, 14, 16, 18, 20, 20, 20]);
    expect(s.run).toBe(8);
    expect(s.bestRun).toBe(8);
  });
  it('a wrong answer pays nothing and breaks the run, but keeps the best run', () => {
    let s = emptyState();
    for (let i = 0; i < 3; i++) s = recordAnswer(s, 'ipv6', true, '2026-09-01').state;
    const r = recordAnswer(s, 'ipv6', false, '2026-09-01');
    expect(r.xp).toBe(0);
    expect(r.state.run).toBe(0);
    expect(r.state.bestRun).toBe(3);
    expect(r.state.topics.ipv6).toEqual({ answered: 4, correct: 3 });
  });
});

describe('levels cleared', () => {
  it('pays for new stars only, so replaying cannot farm xp', () => {
    let r = recordLevel(emptyState(), 'subnet-1', 2, '2026-09-01');
    expect(r).toMatchObject({ xp: 80, improved: true });
    r = recordLevel(r.state, 'subnet-1', 2, '2026-09-01');
    expect(r).toMatchObject({ xp: 0, improved: false });
    r = recordLevel(r.state, 'subnet-1', 1, '2026-09-01');
    expect(r.state.stars['subnet-1']).toBe(2);
    r = recordLevel(r.state, 'subnet-1', 3, '2026-09-01');
    expect(r).toMatchObject({ xp: 40, improved: true });
    expect(r.state.xp).toBe(120);
  });
  it('clamps stars to 0-3', () => {
    expect(recordLevel(emptyState(), 'x', 9, '2026-09-01').state.stars.x).toBe(3);
    expect(recordLevel(emptyState(), 'y', 0, '2026-09-01').improved).toBe(false);
  });
  it('totals stars by region', () => {
    let s = recordLevel(emptyState(), 'subnet-1', 3, '2026-09-01').state;
    s = recordLevel(s, 'route-1', 2, '2026-09-01').state;
    expect(totalStars(s, 'subnet-')).toBe(3);
    expect(totalStars(s)).toBe(5);
  });
});

describe('badges', () => {
  it('are earned once', () => {
    let s = emptyState();
    for (let i = 0; i < 10; i++) s = recordAnswer(s, 'subnetting', true, '2026-09-01').state;
    const a = awardBadges(s);
    expect(a.fresh.map((b) => b.id).sort()).toEqual(['first-steps', 'sharp']);
    expect(awardBadges(a.state).fresh).toEqual([]);
  });
  it('region badges need three cleared levels', () => {
    let s = emptyState();
    for (const id of ['fw-1', 'fw-2']) s = recordLevel(s, id, 1, '2026-09-01').state;
    expect(awardBadges(s).fresh.map((b) => b.id)).not.toContain('wall-builder');
    s = recordLevel(s, 'fw-3', 3, '2026-09-01').state;
    expect(awardBadges(s).fresh.map((b) => b.id)).toEqual(expect.arrayContaining(['wall-builder', 'three-stars']));
  });
  it('every badge has a name, description and a rule that is false for a new player', () => {
    for (const b of BADGES) { expect(b.name && b.desc).toBeTruthy(); expect(b.earned(emptyState())).toBe(false); }
    expect(new Set(BADGES.map((b) => b.id)).size).toBe(BADGES.length);
  });
});

describe('sanitize', () => {
  it('survives garbage', () => {
    for (const bad of [null, undefined, 5, 'x', [], { xp: 'lots', stars: { a: 99, b: 2 }, badges: [1, 'ok'], lastDay: 'yesterday' }]) {
      const s = sanitize(bad);
      expect(Number.isFinite(s.xp)).toBe(true);
      expect(Object.values(s.stars).every((v) => v >= 1 && v <= 3)).toBe(true);
    }
    expect(sanitize({ stars: { a: 99, b: 2 }, badges: [1, 'ok'] })).toMatchObject({ stars: { b: 2 }, badges: ['ok'], lastDay: null });
  });
  it('round trips a real state', () => {
    let s = recordAnswer(emptyState(), 'x', true, '2026-09-01').state;
    s = recordLevel(s, 'subnet-2', 3, '2026-09-01').state;
    expect(sanitize(JSON.parse(JSON.stringify(s)))).toEqual(s);
  });
});
