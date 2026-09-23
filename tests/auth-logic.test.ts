import { describe, expect, it } from 'vitest';
import { FEATURES, featureLocked, nocFeature, practiceFeature, regionFeature } from '../src/lib/features';
import { mergeGame, mergeLessons, mergePayload, parsePayload, samePayload } from '../src/lib/sync';
import { awardBadges, emptyState, recordLevel, type GameState } from '../src/lib/gamify';
import { INCIDENTS } from '../src/data/game/nocIncidents';
import { REGIONS } from '../src/data/game/world';
import { TOPICS } from '../src/lib/practice';

describe('feature locks', () => {
  it('locks every listed feature for guests and none for signed-in users', () => {
    for (const f of FEATURES) {
      expect(featureLocked(f.id, false)).toBe(true);
      expect(featureLocked(f.id, true)).toBe(false);
    }
  });

  it('keeps the core learning content free', () => {
    expect(regionFeature('subnet')).toBeNull();
    expect(nocFeature(1)).toBeNull();
    for (const t of TOPICS) expect(practiceFeature(t.id)).toBeNull();
    expect(practiceFeature('mixed')).toBeNull();
  });

  it('gates the later regions, harder incidents and the daily challenge', () => {
    expect(regionFeature('route')).toBe('route-ridge');
    expect(regionFeature('fw')).toBe('firewall-fortress');
    expect(nocFeature(2)).toBe('noc-advanced');
    expect(nocFeature(3)).toBe('noc-advanced');
    expect(practiceFeature('daily')).toBe('daily-challenge');
  });

  it('every game region and incident maps to a known feature or to free content', () => {
    const ids = new Set(FEATURES.map((f) => f.id as string));
    for (const r of REGIONS) {
      const f = regionFeature(r.id);
      if (f) expect(ids.has(f)).toBe(true);
    }
    for (const i of INCIDENTS) {
      const f = nocFeature(i.level);
      if (f) expect(ids.has(f)).toBe(true);
    }
    // there is still free NOC content for guests
    expect(INCIDENTS.some((i) => nocFeature(i.level) === null)).toBe(true);
  });
});

const sample = (over: Partial<GameState>): GameState => ({ ...emptyState(), ...over });

describe('progress merge', () => {
  const a = sample({ xp: 300, answered: 40, correct: 30, bestRun: 6, run: 2, streakDays: 3, lastDay: '2026-09-20', stars: { 'subnet-1': 3, 'subnet-2': 1 }, topics: { subnetting: { answered: 40, correct: 30 } }, badges: ['first-steps'] });
  const b = sample({ xp: 500, answered: 25, correct: 25, bestRun: 25, run: 0, streakDays: 1, lastDay: '2026-09-21', stars: { 'subnet-2': 3, 'route-1': 2 }, topics: { subnetting: { answered: 10, correct: 10 }, vlsm: { answered: 15, correct: 15 } }, badges: ['sharp'] });

  it('keeps the better value for every field', () => {
    const m = mergeGame(a, b);
    expect(m.xp).toBe(500);
    expect(m.bestRun).toBe(25);
    expect(m.stars).toEqual({ 'subnet-1': 3, 'subnet-2': 3, 'route-1': 2 });
    expect(m.topics.subnetting).toEqual({ answered: 40, correct: 30 });
    expect(m.topics.vlsm).toEqual({ answered: 15, correct: 15 });
    expect([...m.badges].sort()).toEqual(['first-steps', 'sharp']);
  });

  it('takes the streak from whichever side played most recently', () => {
    const m = mergeGame(a, b);
    expect(m.lastDay).toBe('2026-09-21');
    expect(m.streakDays).toBe(1);
    expect(mergeGame(b, a).streakDays).toBe(1);
    expect(mergeGame(a, { ...b, lastDay: '2026-09-20', streakDays: 5 }).streakDays).toBe(5);
  });

  it('is repeat-safe and order-independent', () => {
    const once = mergeGame(a, b);
    const twice = mergeGame(once, b);
    const swapped = mergeGame(b, a);
    const norm = (s: GameState) => ({ ...s, badges: [...s.badges].sort() });
    expect(norm(twice)).toEqual(norm(once));
    expect(norm(swapped)).toEqual(norm(once));
    expect(norm(mergeGame(a, a))).toEqual(norm(a));
  });

  it('never loses progress from either side', () => {
    const m = mergeGame(a, b);
    for (const [id, v] of Object.entries(a.stars)) expect(m.stars[id]).toBeGreaterThanOrEqual(v);
    for (const [id, v] of Object.entries(b.stars)) expect(m.stars[id]).toBeGreaterThanOrEqual(v);
    for (const badge of [...a.badges, ...b.badges]) expect(m.badges).toContain(badge);
  });

  it('merges finished lessons as a set', () => {
    expect(mergeLessons(['a/1', 'b/2'], ['b/2', 'c/3'])).toEqual(['a/1', 'b/2', 'c/3']);
    expect(mergeLessons([], [])).toEqual([]);
  });

  it('a guest who played then logs in keeps their progress and can earn badges retroactively', () => {
    let guest = emptyState();
    for (const id of ['subnet-1', 'subnet-2', 'subnet-3']) guest = recordLevel(guest, id, 3, '2026-09-21').state;
    expect(guest.badges).toEqual([]); // nothing awarded while logged out
    const merged = mergeGame(guest, emptyState());
    const { state, fresh } = awardBadges(merged);
    expect(fresh.map((x) => x.id)).toEqual(expect.arrayContaining(['gate-keeper', 'three-stars']));
    expect(state.stars).toEqual(guest.stars);
  });

  it('parses server data defensively', () => {
    const p = parsePayload({ game: { xp: 'lots', stars: { x: 99 } }, lessons: ['a/1', 7, null], last: 5 });
    expect(p.game.xp).toBe(0);
    expect(p.game.stars).toEqual({});
    expect(p.lessons).toEqual(['a/1']);
    expect(p.last).toBeNull();
    expect(parsePayload(null).lessons).toEqual([]);
  });

  it('detects when an upload would change nothing', () => {
    const p = { game: a, lessons: ['x/1'], last: 'x/1' };
    expect(samePayload(p, { ...p, lessons: ['x/1'] })).toBe(true);
    expect(samePayload(p, { ...p, lessons: ['x/1', 'y/2'] })).toBe(false);
    expect(samePayload(mergePayload(p, p), p)).toBe(true);
  });
});
