// Per-browser lesson progress stored in localStorage. Safe if storage is unavailable.
// When the visitor is logged in, changes are also saved to their account (see auth.ts).
import { notifyLocalSave } from './session';
import { trackLessonCompletion } from './analytics';

const KEY = 'na-progress';
const LAST = 'na-last';

export function getDone(): string[] {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) ?? '[]');
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
}

export function setDone(id: string, done: boolean): void {
  try {
    const set = new Set(getDone());
    done ? set.add(id) : set.delete(id);
    localStorage.setItem(KEY, JSON.stringify([...set]));
  } catch {
    /* storage blocked: progress simply isn't saved */
  }
  notifyLocalSave();

  // Track lesson completion to analytics
  if (done) {
    trackLessonCompletion(id);
  }
}

export function setLast(id: string): void {
  try {
    localStorage.setItem(LAST, id);
  } catch {
    /* ignore */
  }
}

export function getLast(): string | null {
  try {
    return localStorage.getItem(LAST);
  } catch {
    return null;
  }
}

/** Overwrite local lesson progress with a merged copy from the account (does not trigger another upload). */
export function replaceLessons(done: string[], last: string | null): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(done));
    if (last) localStorage.setItem(LAST, last);
  } catch {
    /* ignore */
  }
}

/** Clear lesson progress from this browser (used when logging out on a shared computer). */
export function clearLessons(): void {
  try {
    localStorage.removeItem(KEY);
    localStorage.removeItem(LAST);
  } catch {
    /* ignore */
  }
}
