import { useEffect, useRef, useState } from 'react';
import { isCorrect, makeQuestion, type Level, type Question } from '../lib/trainer';

const ROUND = 10;
const KEY = 'na-trainer-best';
const LEVELS: { id: Level; name: string; blurb: string }[] = [
  { id: 1, name: 'Warm-up', blurb: 'Masks and host counts' },
  { id: 2, name: 'Standard', blurb: 'Network and broadcast in the last octet' },
  { id: 3, name: 'Pro', blurb: 'Any prefix, first/last host, same-subnet checks' },
];

function loadBest(): Record<string, number> {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? '{}') || {};
  } catch {
    return {};
  }
}

export default function SubnetTrainer() {
  const [level, setLevel] = useState<Level | null>(null);
  const [q, setQ] = useState<Question | null>(null);
  const [n, setN] = useState(0);
  const [score, setScore] = useState(0);
  const [streak, setStreak] = useState(0);
  const [bestStreak, setBestStreak] = useState(0);
  const [input, setInput] = useState('');
  const [result, setResult] = useState<'right' | 'wrong' | null>(null);
  const [best, setBest] = useState<Record<string, number>>({});
  const field = useRef<HTMLInputElement>(null);
  const finished = level !== null && n >= ROUND && result === null;

  useEffect(() => setBest(loadBest()), []);
  useEffect(() => { if (q && result === null) field.current?.focus(); }, [q, result]);

  const start = (l: Level) => {
    setLevel(l); setN(0); setScore(0); setStreak(0); setBestStreak(0); setResult(null); setInput('');
    setQ(makeQuestion(l));
  };

  const submit = () => {
    if (!q || result || !input.trim()) return;
    const ok = isCorrect(q, input);
    setResult(ok ? 'right' : 'wrong');
    setScore((s) => s + (ok ? 1 : 0));
    setStreak((s) => (ok ? s + 1 : 0));
    if (ok) setBestStreak((b) => Math.max(b, streak + 1));
  };

  const next = () => {
    const done = n + 1;
    setN(done); setResult(null); setInput('');
    if (done >= ROUND) {
      const prev = best[String(level)] ?? 0;
      if (score > prev) {
        const nb = { ...best, [String(level)]: score };
        setBest(nb);
        try { localStorage.setItem(KEY, JSON.stringify(nb)); } catch { /* not saved */ }
      }
      setQ(null);
    } else setQ(makeQuestion(level!));
  };

  const btn = 'rounded-md bg-accent px-4 py-2 text-sm font-medium text-accent-fg hover:opacity-90';

  if (level === null || finished) {
    return (
      <div className="not-prose my-8 rounded-xl border border-line bg-surface p-5">
        {finished && (
          <div role="status" className="mb-5 rounded-lg bg-accent-soft p-4">
            <p className="text-lg font-semibold">{score}/{ROUND} {score === ROUND ? '- perfect round!' : score >= 8 ? '- excellent' : score >= 5 ? '- getting there' : '- keep practising'}</p>
            <p className="text-sm text-muted">Longest streak: {bestStreak}. Personal best on this level: {Math.max(best[String(level)] ?? 0, score)}/{ROUND}.</p>
          </div>
        )}
        <p className="font-medium">{finished ? 'Play again' : 'Pick a level'}</p>
        <div className="mt-3 grid gap-2 sm:grid-cols-3">
          {LEVELS.map((l) => (
            <button key={l.id} type="button" onClick={() => start(l.id)} className="rounded-lg border border-line p-3 text-left hover:border-accent">
              <span className="block font-medium">{l.name}</span>
              <span className="block text-xs text-muted">{l.blurb}</span>
              {best[String(l.id)] !== undefined && <span className="mt-1 block text-xs text-accent">Best {best[String(l.id)]}/{ROUND}</span>}
            </button>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="not-prose my-8 rounded-xl border border-line bg-surface p-5">
      <div className="flex items-center justify-between text-sm text-muted">
        <span>Question {Math.min(n + 1, ROUND)} of {ROUND}</span>
        <span>Score {score} · Streak {streak}{streak >= 3 ? ' 🔥' : ''}</span>
      </div>
      <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-surface-2" aria-hidden>
        <div className="h-full bg-accent transition-all" style={{ width: `${(n / ROUND) * 100}%` }} />
      </div>
      <p className="mt-5 text-lg font-medium">{q?.prompt}</p>
      <form className="mt-3 flex gap-2" onSubmit={(e) => { e.preventDefault(); submit(); }}>
        <label htmlFor="answer" className="sr-only">Your answer</label>
        <input
          id="answer" ref={field} value={input} onChange={(e) => setInput(e.target.value)} disabled={result !== null}
          autoComplete="off" spellCheck={false} placeholder="Your answer"
          className="w-full max-w-xs rounded-md border border-line bg-bg px-3 py-2 font-mono text-fg placeholder:text-muted focus:border-accent"
        />
        {result === null ? <button type="submit" className={btn}>Check</button> : <button type="button" onClick={next} autoFocus className={btn}>{n + 1 >= ROUND ? 'Finish' : 'Next'}</button>}
      </form>
      <div role="status" aria-live="polite" className="mt-4 min-h-12 text-sm">
        {result === 'right' && <p className="font-semibold text-accent">Correct!</p>}
        {result === 'wrong' && <p><span className="font-semibold text-red-600 dark:text-red-400">Not quite. </span>The answer is <code className="font-mono font-semibold">{q?.answer}</code>.</p>}
        {result && <p className="mt-1 text-muted">{q?.working}</p>}
      </div>
    </div>
  );
}
