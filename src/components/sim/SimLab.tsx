import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { findLab } from '../../data/allLabs';
import { simLabFor } from '../../data/simLabs';
import { recordLevel, today } from '../../lib/gamify';
import { SUPPORTED, completions, prompt } from '../../lib/sim';
import { build, execute, taskDone, type Built, type History, type SimTask } from '../../lib/sim/lab';
import { update } from '../../scripts/game-store';
import Topology from './Topology';

interface Line {
  kind: 'cmd' | 'out' | 'note';
  text: string;
}

const KEY = (id: string) => `na-sim:${id}`;
const MAX_LINES = 600;

const banner = (kind: 'router' | 'pc', id: string): Line[] =>
  kind === 'router'
    ? [
        { kind: 'note', text: `MikroTik RouterOS 7.16 (simulated)  -  ${id}` },
        { kind: 'note', text: 'A learning simulator: it copies real RouterOS output for the commands below. Type "help" for the list, Tab to complete.' },
      ]
    : [{ kind: 'note', text: `${id}  -  virtual PC. Commands: ip <address>/<prefix> <gateway>, show ip, ping <address>, trace <address>. Type "help".` }];

export default function SimLab({ labId }: { labId: string }) {
  const spec = useMemo(() => simLabFor(labId)!, [labId]);
  const lab = useMemo(() => findLab(labId)!, [labId]);
  const built = useRef<Built>(null as unknown as Built);
  if (!built.current) built.current = build(spec);

  const [, setTick] = useState(0);
  const bump = () => setTick((n) => n + 1);
  const [selected, setSelected] = useState(lab.nodes[0].id);
  const [lines, setLines] = useState<Record<string, Line[]>>(() => Object.fromEntries(lab.nodes.map((n) => [n.id, banner(n.kind === 'pc' ? 'pc' : 'router', n.id)])));
  const [solved, setSolved] = useState<string[]>([]);
  const [hints, setHints] = useState<Record<string, number>>({});
  const [shown, setShown] = useState<Record<string, boolean>>({});
  const [input, setInput] = useState('');
  const [cursor, setCursor] = useState<number | null>(null);
  const [award, setAward] = useState<string | null>(null);
  const logRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const dev = built.current.net.device(selected);
  const ctx = built.current.ctx[selected] ?? [];

  // ---- restore saved progress (after mount, so the first render matches the server)
  useEffect(() => {
    try {
      const raw = JSON.parse(localStorage.getItem(KEY(labId)) ?? 'null') as { history: History; solved: string[] } | null;
      if (raw && Array.isArray(raw.history)) {
        const b = build(spec);
        const buf: Record<string, Line[]> = Object.fromEntries(lab.nodes.map((n) => [n.id, banner(n.kind === 'pc' ? 'pc' : 'router', n.id)]));
        for (const h of raw.history) {
          const d = b.net.device(h.dev);
          const p = prompt(d, b.ctx[h.dev] ?? []);
          const out = execute(b, h.dev, h.line);
          buf[h.dev]?.push({ kind: 'cmd', text: `${p}${h.line}` }, ...(out ? [{ kind: 'out' as const, text: out }] : []));
        }
        built.current = b;
        for (const n of lab.nodes) buf[n.id].push({ kind: 'note', text: '(your earlier work was restored)' });
        setLines(buf);
        setSolved(Array.isArray(raw.solved) ? raw.solved : []);
        bump();
      }
    } catch { /* start fresh */ }
  }, [labId, spec, lab.nodes]);

  useEffect(() => { logRef.current?.scrollTo({ top: logRef.current.scrollHeight }); }, [lines, selected]);

  const persist = useCallback((nextSolved: string[]) => {
    try { localStorage.setItem(KEY(labId), JSON.stringify({ history: built.current.history, solved: nextSolved })); } catch { /* not saved */ }
  }, [labId]);

  /** Re-check every task after a command; tasks stay solved once they are done. */
  const recheck = useCallback((current: string[]) => {
    const now = spec.tasks.filter((t) => taskDone(built.current, t)).map((t) => t.id);
    const fresh = now.filter((id) => !current.includes(id));
    if (!fresh.length) return current;
    const next = [...current, ...fresh];
    setSolved(next);
    for (const id of fresh) update((s) => recordLevel(s, `lab-${labId}-${id}`, 1, today()).state);
    setAward(`Task complete: ${spec.tasks.find((t) => t.id === fresh[0])!.title}`);
    return next;
  }, [spec, labId]);

  const push = (id: string, add: Line[]) => setLines((all) => ({ ...all, [id]: [...(all[id] ?? []), ...add].slice(-MAX_LINES) }));

  function run(line: string) {
    const text = line.trim();
    const p = prompt(dev, ctx);
    if (!text) { push(selected, [{ kind: 'cmd', text: `${p}` }]); return; }
    if (text === 'clear' || text === '/clear') { setLines((all) => ({ ...all, [selected]: [] })); return; }
    if (text === 'help' || text === '?' || text === '/help') {
      push(selected, [{ kind: 'cmd', text: `${p}${text}` }, { kind: 'out', text: dev.kind === 'pc' ? 'ip <address>/<prefix> <gateway>   set the address\nshow ip                          show the address\nping <address>\ntrace <address>\nclear ip' : `Commands this simulator understands:\n${SUPPORTED.map((s) => '  ' + s).join('\n')}\n\nYou can shorten words (/ip addr pr), use [find where ...] and place-before=<n>. Ctrl+L or "clear" empties the screen.` }]);
      return;
    }
    const out = execute(built.current, selected, text);
    push(selected, [{ kind: 'cmd', text: `${p}${text}` }, ...(out ? [{ kind: 'out' as const, text: out }] : [])]);
    const next = recheck(solved);
    persist(next);
    setCursor(null);
    bump();
  }

  function onKey(e: React.KeyboardEvent<HTMLInputElement>) {
    const typed = built.current.history.filter((h) => h.dev === selected).map((h) => h.line);
    if (e.key === 'Enter') { run(input); setInput(''); return; }
    if (e.key === 'ArrowUp') {
      e.preventDefault();
      const i = cursor === null ? typed.length - 1 : Math.max(0, cursor - 1);
      if (typed.length) { setCursor(i); setInput(typed[i]); }
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (cursor === null) return;
      const i = cursor + 1;
      if (i >= typed.length) { setCursor(null); setInput(''); } else { setCursor(i); setInput(typed[i]); }
    } else if (e.key === 'Tab' && dev.kind === 'router') {
      e.preventDefault();
      const hits = completions(input, ctx);
      const partial = /\s$/.test(input) ? '' : input.split(/\s+/).pop()!.replace(/^\//, '');
      if (hits.length === 1) setInput(input.slice(0, input.length - partial.length) + hits[0] + ' ');
      else if (hits.length > 1) push(selected, [{ kind: 'cmd', text: `${prompt(dev, ctx)}${input}` }, { kind: 'out', text: hits.join('   ') }]);
    } else if (e.key === 'l' && e.ctrlKey) {
      e.preventDefault();
      setLines((all) => ({ ...all, [selected]: [] }));
    }
  }

  function typeSolution(t: SimTask) {
    const add: Record<string, Line[]> = {};
    for (const step of t.solution) {
      const d = built.current.net.device(step.device);
      for (const c of step.commands) {
        const p = prompt(d, built.current.ctx[step.device] ?? []);
        const out = execute(built.current, step.device, c);
        (add[step.device] ??= []).push({ kind: 'cmd', text: `${p}${c}` }, ...(out ? [{ kind: 'out' as const, text: out }] : []));
      }
    }
    setLines((all) => {
      const next = { ...all };
      for (const [id, l] of Object.entries(add)) next[id] = [...(next[id] ?? []), ...l].slice(-MAX_LINES);
      return next;
    });
    const nextSolved = recheck(solved);
    persist(nextSolved);
    bump();
  }

  function reset() {
    if (!window.confirm('Reset this lab? All devices go back to their starting state.')) return;
    built.current = build(spec);
    setLines(Object.fromEntries(lab.nodes.map((n) => [n.id, banner(n.kind === 'pc' ? 'pc' : 'router', n.id)])));
    setSolved([]); setHints({}); setShown({}); setAward(null);
    try { localStorage.removeItem(KEY(labId)); } catch { /* ignore */ }
    bump();
  }

  const done = solved.length;
  const total = spec.tasks.length;

  return (
    <div className="not-prose">
      <p className="text-sm text-muted">{spec.intro}</p>

      <div className="mt-4 grid gap-4 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="min-w-0 space-y-3">
          <div className="rounded-xl border-2 border-line bg-surface p-2">
            <Topology lab={lab} net={built.current.net} selected={selected} onSelect={(id) => { setSelected(id); setCursor(null); setTimeout(() => inputRef.current?.focus(), 0); }} />
          </div>

          <div role="tablist" aria-label="Device terminals" className="flex flex-wrap gap-1">
            {lab.nodes.map((n) => (
              <button key={n.id} role="tab" type="button" aria-selected={selected === n.id} onClick={() => { setSelected(n.id); setCursor(null); setTimeout(() => inputRef.current?.focus(), 0); }} className={`rounded-md border-2 px-3 py-1 font-mono text-xs ${selected === n.id ? 'border-accent text-accent' : 'border-line text-muted hover:text-fg'}`}>
                {n.label}
              </button>
            ))}
          </div>

          <div className="overflow-hidden rounded-md border-2 border-accent-edge bg-[#050814] font-mono text-xs text-[#b6ffcc]" onClick={() => inputRef.current?.focus()}>
            <div ref={logRef} role="log" aria-live="polite" aria-label={`Terminal for ${selected}`} tabIndex={0} className="h-80 overflow-auto p-3">
              {(lines[selected] ?? []).map((l, i) => (
                <pre key={i} className={`m-0 font-mono ${l.kind === 'note' ? 'whitespace-pre-wrap text-[#6fdc96]' : l.kind === 'cmd' ? 'whitespace-pre-wrap text-white' : 'whitespace-pre'}`}>{l.text}</pre>
              ))}
            </div>
            <label className="flex items-center gap-2 border-t border-[#1d3a2a] px-3 py-2">
              <span className="whitespace-pre text-white">{prompt(dev, ctx)}</span>
              <input ref={inputRef} value={input} onChange={(e) => setInput(e.target.value)} onKeyDown={onKey} spellCheck={false} autoComplete="off" autoCapitalize="off" aria-label={`Command for ${selected}`} className="min-w-0 flex-1 bg-transparent font-mono text-xs text-white outline-none" />
            </label>
          </div>
          <p className="text-xs text-muted">Click a router or PC in the diagram (or a tab) to open its terminal. Up/Down recalls commands, Tab completes.</p>
        </div>

        <aside aria-label="Tasks" className="min-w-0">
          <div className="flex items-center justify-between text-sm">
            <span className="font-semibold">{done} of {total} tasks done</span>
            <button type="button" onClick={reset} className="text-xs text-muted underline hover:text-fg">Reset lab</button>
          </div>
          <div className="mt-2 h-2 border border-line bg-bg" role="progressbar" aria-label="Lab progress" aria-valuemin={0} aria-valuemax={total} aria-valuenow={done}>
            <div className="h-full bg-accent transition-all" style={{ width: `${(done / total) * 100}%` }} />
          </div>
          {award && <p role="status" className="mt-2 rounded-md border-2 border-accent bg-accent-soft p-2 text-xs font-semibold">{award} (+40 XP the first time)</p>}
          <ol className="mt-3 space-y-2">
            {spec.tasks.map((t, i) => {
              const ok = solved.includes(t.id);
              return (
                <li key={t.id} className={`rounded-md border-2 p-3 text-sm ${ok ? 'border-accent bg-accent-soft' : 'border-line bg-surface'}`}>
                  <p className="font-semibold"><span aria-hidden="true">{ok ? '✔ ' : `${i + 1}. `}</span><span className="sr-only">{ok ? 'Done: ' : ''}</span>{t.title}</p>
                  <p className="mt-1 text-xs text-muted">{t.detail}</p>
                  {!ok && (
                    <div className="mt-2 space-y-1">
                      {(hints[t.id] ?? 0) > 0 && (
                        <ul className="list-disc space-y-1 pl-4 text-xs">
                          {t.hints.slice(0, hints[t.id]).map((h, k) => <li key={k}>{h}</li>)}
                        </ul>
                      )}
                      <div className="flex flex-wrap gap-2 text-xs">
                        {(hints[t.id] ?? 0) < t.hints.length && <button type="button" className="underline" onClick={() => setHints((h) => ({ ...h, [t.id]: (h[t.id] ?? 0) + 1 }))}>{(hints[t.id] ?? 0) === 0 ? 'Show a hint' : 'Another hint'}</button>}
                        <button type="button" className="underline" onClick={() => setShown((s) => ({ ...s, [t.id]: !s[t.id] }))}>{shown[t.id] ? 'Hide solution' : 'Show solution'}</button>
                      </div>
                      {shown[t.id] && (
                        <div className="rounded-sm border border-line bg-bg p-2">
                          {t.solution.map((s, k) => (
                            <div key={k} className="font-mono text-[0.68rem]"><span className="text-accent">{s.device}</span>{s.commands.map((c, j) => <div key={j} className="break-words pl-2">{c}</div>)}</div>
                          ))}
                          <button type="button" onClick={() => typeSolution(t)} className="mt-2 rounded-sm bg-accent px-2 py-1 text-xs text-accent-fg">Type it for me</button>
                        </div>
                      )}
                    </div>
                  )}
                </li>
              );
            })}
          </ol>
        </aside>
      </div>
    </div>
  );
}
