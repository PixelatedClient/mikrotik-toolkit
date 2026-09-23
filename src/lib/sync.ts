import { sanitize, type GameState } from './gamify';

/** What is stored per account. One row, one JSON blob for the game and a list of finished lessons. */
export interface CloudPayload {
  game: GameState;
  lessons: string[];
  last: string | null;
}

const later = (a: string | null, b: string | null) => (a === null ? b : b === null ? a : a >= b ? a : b);

/**
 * Merge two copies of a player's game state (this device and the account).
 * Every rule is "keep the better value", so merging is safe to repeat, order does not matter,
 * and progress made while logged out is never lost or double counted.
 */
export function mergeGame(a: GameState, b: GameState): GameState {
  const stars: Record<string, number> = { ...a.stars };
  for (const [id, v] of Object.entries(b.stars)) stars[id] = Math.max(stars[id] ?? 0, v);

  const topics: GameState['topics'] = { ...a.topics };
  for (const [id, t] of Object.entries(b.topics)) {
    const cur = topics[id];
    topics[id] = !cur || t.answered > cur.answered || (t.answered === cur.answered && t.correct > cur.correct) ? t : cur;
  }

  const lastDay = later(a.lastDay, b.lastDay);
  const streakDays = a.lastDay === b.lastDay ? Math.max(a.streakDays, b.streakDays) : lastDay === a.lastDay ? a.streakDays : b.streakDays;

  return {
    xp: Math.max(a.xp, b.xp),
    answered: Math.max(a.answered, b.answered),
    correct: Math.max(a.correct, b.correct),
    bestRun: Math.max(a.bestRun, b.bestRun),
    run: Math.max(a.run, b.run),
    streakDays,
    lastDay,
    stars,
    topics,
    badges: [...new Set([...a.badges, ...b.badges])],
  };
}

export const mergeLessons = (a: string[], b: string[]): string[] => [...new Set([...a, ...b])].sort();

export function mergePayload(a: CloudPayload, b: CloudPayload): CloudPayload {
  return { game: mergeGame(a.game, b.game), lessons: mergeLessons(a.lessons, b.lessons), last: a.last ?? b.last };
}

/** Read whatever the server returned, ignoring anything malformed. */
export function parsePayload(raw: unknown): CloudPayload {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const lessons = Array.isArray(r.lessons) ? r.lessons.filter((x): x is string => typeof x === 'string') : [];
  return { game: sanitize(r.game), lessons, last: typeof r.last === 'string' ? r.last : null };
}

const stable = (v: unknown): string =>
  JSON.stringify(v, (_k, x) => (x && typeof x === 'object' && !Array.isArray(x) ? Object.fromEntries(Object.entries(x).sort(([p], [q]) => (p < q ? -1 : 1))) : x));

/** True when two payloads hold the same data, so an upload would change nothing. */
export const samePayload = (a: CloudPayload, b: CloudPayload): boolean =>
  stable({ ...a, game: { ...a.game, badges: [...a.game.badges].sort() }, lessons: [...a.lessons].sort() }) ===
  stable({ ...b, game: { ...b.game, badges: [...b.game.badges].sort() }, lessons: [...b.lessons].sort() });
