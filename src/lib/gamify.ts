/** Player progress. Pure functions so the rules can be tested; storage lives elsewhere. */

export interface GameState {
  xp: number;
  answered: number;
  correct: number;
  /** Longest run of correct answers in a row. */
  bestRun: number;
  run: number;
  streakDays: number;
  /** Last day (YYYY-MM-DD) the player did something. */
  lastDay: string | null;
  /** Best stars (1-3) earned per level id. */
  stars: Record<string, number>;
  /** Correct answers per practice topic. */
  topics: Record<string, { answered: number; correct: number }>;
  badges: string[];
}

export const emptyState = (): GameState => ({
  xp: 0, answered: 0, correct: 0, bestRun: 0, run: 0, streakDays: 0, lastDay: null, stars: {}, topics: {}, badges: [],
});

/** XP needed to reach level n: 0, 100, 300, 600, 1000, ... */
export const xpForLevel = (n: number) => 50 * (n - 1) * n;

export function levelInfo(xp: number) {
  let level = 1;
  while (xp >= xpForLevel(level + 1)) level++;
  const floor = xpForLevel(level);
  const next = xpForLevel(level + 1);
  return { level, into: xp - floor, need: next - floor, pct: Math.round(((xp - floor) / (next - floor)) * 100) };
}

const dayNumber = (d: string) => Math.floor(Date.parse(`${d}T00:00:00Z`) / 86400000);

/** Count a day of play. Consecutive days extend the streak, a gap resets it to 1. */
export function touchDay(s: GameState, day: string): GameState {
  if (s.lastDay === day) return s;
  const consecutive = s.lastDay !== null && dayNumber(day) - dayNumber(s.lastDay) === 1;
  return { ...s, lastDay: day, streakDays: consecutive ? s.streakDays + 1 : 1 };
}

/** Points for one practice answer: 10, plus a bonus that grows with the current run (capped). */
export const answerXp = (runBefore: number) => 10 + Math.min(runBefore, 5) * 2;

export function recordAnswer(s: GameState, topic: string, correct: boolean, day: string): { state: GameState; xp: number } {
  let st = touchDay(s, day);
  const t = st.topics[topic] ?? { answered: 0, correct: 0 };
  const xp = correct ? answerXp(st.run) : 0;
  const run = correct ? st.run + 1 : 0;
  st = {
    ...st,
    xp: st.xp + xp,
    answered: st.answered + 1,
    correct: st.correct + (correct ? 1 : 0),
    run,
    bestRun: Math.max(st.bestRun, run),
    topics: { ...st.topics, [topic]: { answered: t.answered + 1, correct: t.correct + (correct ? 1 : 0) } },
  };
  return { state: st, xp };
}

export const STAR_XP = 40;

/** Finish a level. XP is only paid for stars beyond the best you already have, so replaying cannot farm XP. */
export function recordLevel(s: GameState, levelId: string, stars: number, day: string): { state: GameState; xp: number; improved: boolean } {
  const st = touchDay(s, day);
  const s3 = Math.max(0, Math.min(3, Math.round(stars)));
  const best = st.stars[levelId] ?? 0;
  if (s3 <= best) return { state: st, xp: 0, improved: false };
  const xp = (s3 - best) * STAR_XP;
  return { state: { ...st, xp: st.xp + xp, stars: { ...st.stars, [levelId]: s3 } }, xp, improved: true };
}

export const totalStars = (s: GameState, prefix = '') =>
  Object.entries(s.stars).filter(([id]) => id.startsWith(prefix)).reduce((n, [, v]) => n + v, 0);

export interface Badge {
  id: string;
  name: string;
  desc: string;
  earned: (s: GameState) => boolean;
}

const topicCorrect = (s: GameState, t: string) => s.topics[t]?.correct ?? 0;

export const BADGES: Badge[] = [
  { id: 'first-steps', name: 'First Steps', desc: 'Answer 10 questions', earned: (s) => s.answered >= 10 },
  { id: 'sharp', name: 'Sharp Shooter', desc: '10 correct answers in a row', earned: (s) => s.bestRun >= 10 },
  { id: 'subnet-master', name: 'Subnet Master', desc: '50 correct subnetting answers', earned: (s) => topicCorrect(s, 'subnetting') >= 50 },
  { id: 'gate-keeper', name: 'Gate Keeper', desc: 'Clear 3 Subnet Valley levels', earned: (s) => Object.keys(s.stars).filter((k) => k.startsWith('subnet-')).length >= 3 },
  { id: 'path-finder', name: 'Path Finder', desc: 'Clear 3 Route Ridge levels', earned: (s) => Object.keys(s.stars).filter((k) => k.startsWith('route-')).length >= 3 },
  { id: 'wall-builder', name: 'Wall Builder', desc: 'Clear 3 Firewall Fortress levels', earned: (s) => Object.keys(s.stars).filter((k) => k.startsWith('fw-')).length >= 3 },
  { id: 'on-call', name: 'On Call', desc: 'Resolve 3 NOC incidents', earned: (s) => Object.keys(s.stars).filter((k) => k.startsWith('noc-')).length >= 3 },
  { id: 'three-stars', name: 'Perfectionist', desc: 'Earn 3 stars on any level', earned: (s) => Object.values(s.stars).some((v) => v >= 3) },
  { id: 'week', name: '7-Day Engineer', desc: 'Play 7 days in a row', earned: (s) => s.streakDays >= 7 },
  { id: 'level-5', name: 'Rising Admin', desc: 'Reach level 5', earned: (s) => levelInfo(s.xp).level >= 5 },
  { id: 'lab-rat', name: 'Lab Rat', desc: 'Finish 5 tasks in the browser labs', earned: (s) => Object.keys(s.stars).filter((k) => k.startsWith('lab-')).length >= 5 },
];

/** Adds any newly earned badges to the state and returns them. */
export function awardBadges(s: GameState): { state: GameState; fresh: Badge[] } {
  const fresh = BADGES.filter((b) => !s.badges.includes(b.id) && b.earned(s));
  return { state: fresh.length ? { ...s, badges: [...s.badges, ...fresh.map((b) => b.id)] } : s, fresh };
}

/** Local calendar day, so streaks follow the player's own midnight. */
export const today = (d = new Date()) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

/** Merge stored data with defaults, ignoring anything malformed. */
export function sanitize(raw: unknown): GameState {
  const base = emptyState();
  if (!raw || typeof raw !== 'object') return base;
  const r = raw as Partial<GameState>;
  const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) && v >= 0 ? v : 0);
  return {
    xp: num(r.xp), answered: num(r.answered), correct: num(r.correct), bestRun: num(r.bestRun), run: num(r.run), streakDays: num(r.streakDays),
    lastDay: typeof r.lastDay === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(r.lastDay) ? r.lastDay : null,
    stars: r.stars && typeof r.stars === 'object' ? Object.fromEntries(Object.entries(r.stars).filter(([, v]) => typeof v === 'number' && v >= 1 && v <= 3)) : {},
    topics: r.topics && typeof r.topics === 'object' ? Object.fromEntries(Object.entries(r.topics).filter(([, v]) => v && typeof (v as any).answered === 'number' && typeof (v as any).correct === 'number')) as GameState['topics'] : {},
    badges: Array.isArray(r.badges) ? r.badges.filter((b) => typeof b === 'string') : [],
  };
}
