import { useEffect, useState } from 'react';
import { dailyChallenge, makeQuestion, type PQuestion, type Topic } from '../../lib/practice';
import { recordAnswer, today } from '../../lib/gamify';
import { update } from '../../scripts/game-store';
import { useGame } from './useGame';
import { ghost, panel, primary } from './ui';

const ROUND = 10;

export default function PracticeRound({ topic }: { topic: Topic | 'mixed' | 'daily' }) {
  const { state } = useGame();
  const [qs, setQs] = useState<PQuestion[] | null>(null);
  const [i, setI] = useState(0);
  const [picked, setPicked] = useState<string | null>(null);
  const [right, setRight] = useState(0);
  const [gained, setGained] = useState(0);
  const [done, setDone] = useState(false);

  const deal = () => {
    setQs(topic === 'daily' ? dailyChallenge(today()) : Array.from({ length: ROUND }, () => makeQuestion(topic)));
    setI(0); setPicked(null); setRight(0); setGained(0); setDone(false);
  };
  useEffect(deal, [topic]);

  if (!qs) return <p className="text-sm text-muted">Loading questions…</p>;
  const q = qs[i];

  const choose = (o: string) => {
    if (picked) return;
    setPicked(o);
    const ok = o === q.answer;
    if (ok) setRight((n) => n + 1);
    update((s) => {
      const res = recordAnswer(s, q.topic, ok, today());
      setGained((g) => g + res.xp);
      return res.state;
    });
  };

  if (done) {
    return (
      <div role="status" className="rounded-xl border bg-accent-soft p-5 text-center">
        <p className="pixel text-sm text-accent">ROUND OVER</p>
        <p className="mt-3 text-lg">{right} of {qs.length} correct</p>
        <p className="mt-1 text-sm">+{gained} XP · best run {state.bestRun}</p>
        <div className="mt-4 flex justify-center gap-3">
          {topic !== 'daily' && <button type="button" className={primary} onClick={deal}>Another round</button>}
          <a href="/practice" className={`${ghost} inline-block`}>All topics</a>
          <a href="/play" className={`${ghost} inline-block`}>World map</a>
        </div>
      </div>
    );
  }

  return (
    <div className={panel}>
      <div className="flex justify-between text-xs text-muted">
        <span>Question {i + 1} of {qs.length}</span>
        <span>Run: {state.run}</span>
      </div>
      <h2 className="mt-3 text-lg font-semibold">{q.prompt}</h2>
      <div className="mt-4 grid gap-2 sm:grid-cols-2" role="group" aria-label="Answers">
        {q.options.map((o) => {
          const st = !picked ? '' : o === q.answer ? 'border-good bg-accent-soft' : o === picked ? 'border-danger' : 'opacity-60';
          return (
            <button key={o} type="button" disabled={!!picked} onClick={() => choose(o)}
              className={`rounded-md border-2 border-line bg-bg px-3 py-3 text-left font-mono text-sm hover:border-accent disabled:cursor-default ${st}`}>
              {o}{picked && o === q.answer ? ' ✓' : ''}
            </button>
          );
        })}
      </div>
      {picked && (
        <div className="mt-4" role="status">
          <p className="text-sm"><strong>{picked === q.answer ? 'Correct.' : 'Not quite.'}</strong> {q.why}</p>
          <button type="button" className={`${primary} mt-3`} onClick={() => (i + 1 >= qs.length ? setDone(true) : (setI(i + 1), setPicked(null)))}>
            {i + 1 >= qs.length ? 'Finish' : 'Next question'}
          </button>
        </div>
      )}
    </div>
  );
}
