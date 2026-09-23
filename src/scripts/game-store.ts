import { awardBadges, emptyState, sanitize, type Badge, type GameState } from '../lib/gamify';
import { isSignedIn, notifyLocalSave } from './session';
import { trackLevelWin, trackBadgeAwarded } from './analytics';

const KEY = 'na-game';
export const EVENT = 'na-game-change';

export function load(): GameState {
  try {
    return sanitize(JSON.parse(localStorage.getItem(KEY) ?? 'null'));
  } catch {
    return emptyState();
  }
}

let memory: GameState | null = null;

export function get(): GameState {
  return (memory ??= load());
}

function store(state: GameState) {
  memory = state;
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
  } catch {
    /* storage blocked: progress lasts for this page only */
  }
  window.dispatchEvent(new CustomEvent(EVENT));
}

/**
 * Apply a change, save, and tell every island on the page. Returns badges earned by this change.
 * Badges are only awarded to logged-in players; guests keep their XP and stars and receive the badges
 * they already qualify for the moment they log in.
 */
export function update(fn: (s: GameState) => GameState): { state: GameState; fresh: Badge[] } {
  const next = fn(load());
  const { state, fresh } = isSignedIn() ? awardBadges(next) : { state: next, fresh: [] as Badge[] };
  store(state);
  notifyLocalSave();
  return { state, fresh };
}

/** Replace local progress with a merged copy from the account. Awards badges but does not trigger another upload. */
export function replaceFromCloud(next: GameState): { state: GameState; fresh: Badge[] } {
  const { state, fresh } = isSignedIn() ? awardBadges(next) : { state: next, fresh: [] as Badge[] };
  store(state);
  return { state, fresh };
}

export function reset() {
  memory = emptyState();
  try { localStorage.removeItem(KEY); } catch { /* ignore */ }
  window.dispatchEvent(new CustomEvent(EVENT));
}

export function subscribe(cb: () => void): () => void {
  const onChange = () => { memory = load(); cb(); };
  window.addEventListener(EVENT, cb);
  window.addEventListener('storage', onChange);
  return () => { window.removeEventListener(EVENT, cb); window.removeEventListener('storage', onChange); };
}
