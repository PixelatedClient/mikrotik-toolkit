import { useState } from 'react';

interface Props {
  question: string;
  options: string[];
  /** Zero-based index of the correct option. */
  answer: number;
  explain: string;
}

/** Predict-then-reveal question. Wrong answers can be retried; the right one shows why. */
export default function Challenge({ question, options, answer, explain }: Props) {
  const [picked, setPicked] = useState<number | null>(null);
  const [tries, setTries] = useState(0);
  const solved = picked === answer;

  return (
    <div className="not-prose my-8 rounded-xl border border-line bg-surface p-5">
      <p className="text-xs font-semibold uppercase tracking-wide text-accent">Predict it</p>
      <p className="mt-1 font-medium">{question}</p>
      <div role="radiogroup" aria-label={question} className="mt-3 grid gap-2">
        {options.map((o, i) => {
          const state = picked === i ? (i === answer ? 'right' : 'wrong') : 'idle';
          return (
            <button
              key={o}
              type="button"
              role="radio"
              aria-checked={picked === i}
              disabled={solved}
              onClick={() => { setPicked(i); setTries((t) => t + 1); }}
              className={`rounded-lg border px-4 py-2.5 text-left text-sm transition ${
                state === 'right' ? 'border-accent bg-accent-soft' :
                state === 'wrong' ? 'border-red-500 bg-red-500/10' :
                'border-line hover:border-muted disabled:opacity-60'
              }`}
            >
              {o}
            </button>
          );
        })}
      </div>
      <div role="status" aria-live="polite" className="mt-3 min-h-5 text-sm">
        {picked !== null && !solved && <p className="text-red-600 dark:text-red-400">Not quite. Think about the order of the rules and try again.</p>}
        {solved && (
          <p>
            <span className="font-semibold text-accent">{tries === 1 ? 'Correct on the first try. ' : 'Correct. '}</span>
            {explain}
          </p>
        )}
      </div>
    </div>
  );
}
