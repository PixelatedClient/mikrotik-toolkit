import { useEffect, useState } from 'react';

interface Task {
  title: string;
  detail: string;
}

export default function LabChecklist({ labId, tasks }: { labId: string; tasks: Task[] }) {
  const key = `na-lab-${labId}`;
  const [done, setDone] = useState<number[]>([]);

  useEffect(() => {
    try {
      const v = JSON.parse(localStorage.getItem(key) ?? '[]');
      if (Array.isArray(v)) setDone(v.filter((n) => Number.isInteger(n) && n >= 0 && n < tasks.length));
    } catch {
      /* start empty */
    }
  }, [key, tasks.length]);

  const save = (next: number[]) => {
    setDone(next);
    try {
      localStorage.setItem(key, JSON.stringify(next));
    } catch {
      /* progress not saved */
    }
  };
  const toggle = (i: number) => save(done.includes(i) ? done.filter((x) => x !== i) : [...done, i]);
  const pct = (done.length / tasks.length) * 100;

  return (
    <div className="not-prose">
      <div className="flex items-center justify-between text-sm">
        <span className="font-medium">{done.length} of {tasks.length} tasks done</span>
        {done.length > 0 && <button type="button" onClick={() => save([])} className="text-xs text-muted underline hover:text-fg">Reset</button>}
      </div>
      <div className="mt-2 h-2 overflow-hidden rounded-full bg-surface-2" role="progressbar" aria-label="Lab progress" aria-valuemin={0} aria-valuemax={tasks.length} aria-valuenow={done.length}>
        <div className="h-full bg-accent transition-all" style={{ width: `${pct}%` }} />
      </div>
      <ol className="mt-4 space-y-2">
        {tasks.map((t, i) => {
          const on = done.includes(i);
          return (
            <li key={t.title} className={`rounded-lg border p-3 ${on ? 'border-accent bg-accent-soft' : 'border-line'}`}>
              <label className="flex cursor-pointer items-start gap-3">
                <input type="checkbox" checked={on} onChange={() => toggle(i)} className="mt-1" />
                <span>
                  <span className={`block text-sm font-medium ${on ? 'line-through decoration-muted' : ''}`}>{i + 1}. {t.title}</span>
                  <span className="block text-sm text-muted">{t.detail}</span>
                </span>
              </label>
            </li>
          );
        })}
      </ol>
      {done.length === tasks.length && <p role="status" className="mt-3 text-sm font-semibold text-accent">Lab complete. Try breaking it in a new way and fixing it.</p>}
    </div>
  );
}
