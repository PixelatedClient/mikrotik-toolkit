import { REFERENCE, type RefEntry } from '../data/reference';
import { PORTS, type PortEntry } from '../data/ports';
import type { Rng } from './practice';

const pick = <T,>(r: Rng, xs: T[]) => xs[Math.floor(r() * xs.length)];
function shuffle<T>(r: Rng, xs: T[]): T[] {
  const a = [...xs];
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}

export interface ExplainQ { entry: RefEntry; prompt: string; options: string[]; answer: string }

/** "What does this command do?" One correct description and three from other commands. */
export function explainQuestion(r: Rng = Math.random): ExplainQ {
  const entry = pick(r, REFERENCE);
  const others = shuffle(r, REFERENCE.filter((e) => e.what !== entry.what && e.title !== entry.title)).slice(0, 3).map((e) => e.what);
  return { entry, prompt: entry.cmd, answer: entry.what, options: shuffle(r, [entry.what, ...others]) };
}

export interface BuildQ { entry: RefEntry; prompt: string; tokens: string[]; answer: string[] }

/** "Build the command": put the pieces in order. A few pieces from other commands are mixed in. */
export function buildQuestion(r: Rng = Math.random): BuildQ {
  const entry = pick(r, REFERENCE);
  const answer = entry.cmd.split(' ');
  const pool = REFERENCE.filter((e) => e.id !== entry.id).flatMap((e) => e.cmd.split(' ')).filter((t) => !answer.includes(t) && t.includes('='));
  const extra = shuffle(r, [...new Set(pool)]).slice(0, 3);
  return { entry, prompt: entry.title, answer, tokens: shuffle(r, [...answer, ...extra]) };
}

export const checkBuild = (q: BuildQ, chosen: string[]) => chosen.join(' ') === q.answer.join(' ');

export interface PortQ { entry: PortEntry; prompt: string; options: string[]; answer: string }
/** "Which port does X use?" */
export function portQuestion(r: Rng = Math.random): PortQ {
  const entry = pick(r, PORTS);
  const label = (p: PortEntry) => `${p.proto.toUpperCase()} ${p.port}`;
  const answer = label(entry);
  const others = shuffle(r, [...new Set(PORTS.map(label))].filter((l) => l !== answer)).slice(0, 3);
  return { entry, prompt: `Which port does ${entry.service.toUpperCase()} (${entry.iana}) use?`, answer, options: shuffle(r, [answer, ...others]) };
}
