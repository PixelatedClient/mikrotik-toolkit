import { useEffect, useState } from 'react';
import { finishLevel, useGame } from './game/useGame';
import type { QuizQuestion } from '../data/lessonKit';

/** Multiple-choice check at the end of a lesson. Pass mark is 70%; stars: 3 = all right, 2 = one wrong, 1 = pass. */
export default function LessonQuiz({ lessonId, questions }: { lessonId: string; questions: QuizQuestion[] }) {
  const id = `quiz-${lessonId}`;
  const { state } = useGame();
  const [picked, setPicked] = useState<(number | null)[]>(() => questions.map(() => null));
  const [checked, setChecked] = useState(false);
  const [note, setNote] = useState('');
  const best = state.stars[id] ?? 0;

  useEffect(() => { setNote(''); }, [checked]);

  const right = picked.filter((p, i) => p === questions[i].answer).length;
  const pass = right / questions.length >= 0.7;

  function check() {
    setChecked(true);
    if (!pass && right / questions.length < 0.7) return;
    const stars = right === questions.length ? 3 : right === questions.length - 1 ? 2 : 1;
    const r = finishLevel(id, stars);
    setNote(r.xp ? `+${r.xp} XP` : '');
  }

  return (
    <div className="not-prose space-y-5">
      {questions.map((q, qi) => (
        <fieldset key={q.q} className="rounded-xl border border-line bg-surface p-4">
          <legend className="px-1 text-sm font-semibold">{qi + 1}. {q.q}</legend>
          <div className="mt-2 grid gap-2">
            {q.options.map((o, oi) => {
              const on = picked[qi] === oi;
              const state = checked ? (oi === q.answer ? 'right' : on ? 'wrong' : 'idle') : on ? 'on' : 'idle';
              return (
                <label key={o} className={`flex cursor-pointer items-start gap-2 rounded-lg border px-3 py-2 text-sm ${
                  state === 'right' ? 'border-accent bg-accent-soft' : state === 'wrong' ? 'border-red-500 bg-red-500/10' : state === 'on' ? 'border-accent' : 'border-line hover:border-muted'}`}>
                  <input type="radio" name={`${id}-${qi}`} className="mt-1" disabled={checked} checked={on}
                    onChange={() => setPicked((p) => p.map((v, i) => (i === qi ? oi : v)))} />
                  <span>{o}</span>
                </label>
              );
            })}
          </div>
          {checked && <p className="mt-2 text-sm text-muted">{q.explain}</p>}
        </fieldset>
      ))}
      <div className="flex flex-wrap items-center gap-3">
        {!checked ? (
          <button type="button" onClick={check} disabled={picked.some((p) => p === null)} className="rounded-md border border-accent bg-accent-soft px-4 py-2 text-sm font-medium disabled:opacity-50">
            Check answers
          </button>
        ) : (
          <button type="button" onClick={() => { setChecked(false); setPicked(questions.map(() => null)); }} className="rounded-md border border-line px-4 py-2 text-sm font-medium hover:border-accent">
            Try again
          </button>
        )}
        {checked && <p role="status" className="text-sm font-medium">{right} of {questions.length} right{pass ? ' - passed' : ' - you need 70% to pass'}{note ? ` (${note})` : ''}</p>}
        {best > 0 && <p className="text-xs text-muted">Best result: {best} of 3 stars</p>}
      </div>
    </div>
  );
}
