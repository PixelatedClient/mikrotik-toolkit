import { useMemo, useState } from 'react';
import { REFERENCE, VERIFIED_ON } from '../../data/reference';
import { IANA_URL, PORTS } from '../../data/ports';
import { buildQuestion, checkBuild, explainQuestion, portQuestion, type BuildQ } from '../../lib/cmdquiz';
import { recordAnswer, today } from '../../lib/gamify';
import { update } from '../../scripts/game-store';
import { ghost, panel, primary, sel } from './ui';

type Tab = 'commands' | 'ports' | 'explain' | 'build' | 'portquiz';
const TABS: [Tab, string][] = [['commands', 'Commands'], ['ports', 'Ports'], ['explain', 'Quiz: what does it do?'], ['build', 'Quiz: build it'], ['portquiz', 'Quiz: ports']];

const award = (topic: string, ok: boolean) => update((s) => recordAnswer(s, topic, ok, today()).state);

function Commands() {
  const [q, setQ] = useState('');
  const [cat, setCat] = useState('');
  const cats = [...new Set(REFERENCE.map((e) => e.cat))];
  const list = REFERENCE.filter((e) => (!cat || e.cat === cat) && (e.title + e.cmd + e.what).toLowerCase().includes(q.toLowerCase()));
  return (
    <div>
      <div className="flex flex-wrap gap-3">
        <label className="text-xs">Search<input className={`${sel} mt-1 block w-64`} value={q} onChange={(e) => setQ(e.target.value)} placeholder="e.g. masquerade" /></label>
        <label className="text-xs">Category
          <select className={`${sel} mt-1 block`} value={cat} onChange={(e) => setCat(e.target.value)}>
            <option value="">All</option>{cats.map((c) => <option key={c}>{c}</option>)}
          </select>
        </label>
      </div>
      <p className="mt-3 text-xs text-muted">{list.length} of {REFERENCE.length} commands. Every property name was checked on its source page on {VERIFIED_ON}. Examples use documentation addresses and were not run on a device.</p>
      <ul className="mt-4 grid grid-cols-1 gap-4">
        {list.map((e) => (
          <li key={e.id} className={`${panel}`}>
            <p className="pixel text-[0.5rem] text-muted">{e.cat.toUpperCase()}</p>
            <h2 className="mt-1 font-semibold">{e.title}</h2>
            <pre tabIndex={0} className="mt-2 overflow-x-auto rounded-md border-2 border-line bg-black/80 p-3 font-mono text-xs text-green-300">{e.cmd}</pre>
            <p className="mt-2 text-sm">{e.what}</p>
            {e.note && <p className="mt-1 text-xs text-muted">{e.note}</p>}
            <p className="mt-2 text-xs text-muted">Source: <a className="text-accent underline" href={e.source.url} rel="noopener">MikroTik docs: {e.source.title}</a></p>
          </li>
        ))}
      </ul>
    </div>
  );
}

function Ports() {
  const [q, setQ] = useState('');
  const list = PORTS.filter((p) => `${p.port} ${p.service} ${p.iana} ${p.note}`.toLowerCase().includes(q.toLowerCase()));
  return (
    <div>
      <label className="text-xs">Search<input className={`${sel} mt-1 block w-64`} value={q} onChange={(e) => setQ(e.target.value)} placeholder="e.g. 179 or ssh" /></label>
      <p className="mt-3 text-xs text-muted">Port numbers and service names come from the <a className="text-accent underline" href={IANA_URL} rel="noopener">IANA registry</a>. The notes are ours. RouterOS management ports (Winbox, API) are not IANA-registered: see <code>/ip service print</code> on your device.</p>
      <div className="mt-4 overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead><tr><th scope="col" className="p-2">Port</th><th scope="col" className="p-2">Service</th><th scope="col" className="p-2">Why you care</th></tr></thead>
          <tbody>
            {list.map((p) => (
              <tr key={`${p.proto}${p.port}`} className="border-t border-line align-top">
                <td className="p-2 font-mono">{p.proto.toUpperCase()} {p.port}</td>
                <td className="p-2">{p.service}<br /><span className="text-xs text-muted">{p.iana}</span></td>
                <td className="p-2">{p.note}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Mcq({ make, topic }: { make: () => { prompt: string; options: string[]; answer: string }; topic: string }) {
  const [q, setQ] = useState(make);
  const [picked, setPicked] = useState<string | null>(null);
  const [score, setScore] = useState({ right: 0, total: 0 });
  const choose = (o: string) => {
    if (picked) return;
    setPicked(o);
    const ok = o === q.answer;
    setScore((s) => ({ right: s.right + (ok ? 1 : 0), total: s.total + 1 }));
    award(topic, ok);
  };
  return (
    <div className={panel}>
      <p className="text-xs text-muted">Score: {score.right} / {score.total}</p>
      <h2 className="mt-2 break-words font-mono text-sm font-semibold">{q.prompt}</h2>
      <div className="mt-4 grid gap-2" role="group" aria-label="Answers">
        {q.options.map((o) => (
          <button key={o} type="button" disabled={!!picked} onClick={() => choose(o)}
            className={`rounded-md border-2 border-line bg-bg px-3 py-2 text-left text-sm hover:border-accent disabled:cursor-default ${!picked ? '' : o === q.answer ? 'border-good bg-accent-soft' : o === picked ? 'border-danger' : 'opacity-60'}`}>{o}</button>
        ))}
      </div>
      {picked && <div role="status" className="mt-4"><p className="text-sm"><strong>{picked === q.answer ? 'Correct.' : 'Not quite.'}</strong></p><button type="button" className={`${primary} mt-2`} onClick={() => { setQ(make()); setPicked(null); }}>Next</button></div>}
    </div>
  );
}

function Build() {
  const [q, setQ] = useState<BuildQ>(buildQuestion);
  const [chosen, setChosen] = useState<number[]>([]);
  const [done, setDone] = useState<null | boolean>(null);
  const [score, setScore] = useState({ right: 0, total: 0 });
  const words = chosen.map((i) => q.tokens[i]);
  const check = () => {
    const ok = checkBuild(q, words);
    setDone(ok);
    setScore((s) => ({ right: s.right + (ok ? 1 : 0), total: s.total + 1 }));
    award('commands', ok);
  };
  const next = () => { setQ(buildQuestion()); setChosen([]); setDone(null); };
  return (
    <div className={panel}>
      <p className="text-xs text-muted">Score: {score.right} / {score.total}</p>
      <h2 className="mt-2 text-sm font-semibold">Build the command: {q.entry.title}</h2>
      <p className="mt-1 text-xs text-muted">Tap the pieces in order. Some pieces do not belong.</p>
      <pre aria-live="polite" className="mt-3 min-h-10 overflow-x-auto whitespace-pre-wrap rounded-md border-2 border-line bg-black/80 p-3 font-mono text-xs text-green-300" tabIndex={0}>{words.join(' ') || '…'}</pre>
      <div className="mt-3 flex flex-wrap gap-2" role="group" aria-label="Pieces">
        {q.tokens.map((t, i) => (
          <button key={i} type="button" disabled={chosen.includes(i) || done !== null} onClick={() => setChosen([...chosen, i])}
            className="rounded-md border-2 border-line bg-bg px-2 py-1 font-mono text-xs hover:border-accent disabled:opacity-30">{t}</button>
        ))}
      </div>
      <div className="mt-4 flex flex-wrap gap-2">
        <button type="button" className={primary} onClick={check} disabled={chosen.length === 0 || done !== null}>Check</button>
        <button type="button" className={ghost} onClick={() => setChosen(chosen.slice(0, -1))} disabled={done !== null || chosen.length === 0}>Undo</button>
      </div>
      {done !== null && (
        <div role="status" className="mt-4">
          <p className="text-sm"><strong>{done ? 'Correct.' : 'Not quite.'}</strong> {q.entry.what}</p>
          {!done && <pre tabIndex={0} className="mt-2 overflow-x-auto rounded-md border-2 border-line bg-black/80 p-3 font-mono text-xs text-green-300">{q.entry.cmd}</pre>}
          <button type="button" className={`${primary} mt-2`} onClick={next}>Next</button>
        </div>
      )}
    </div>
  );
}

export default function ReferenceHub() {
  const [tab, setTab] = useState<Tab>('commands');
  const explain = useMemo(() => () => { const q = explainQuestion(); return { prompt: q.prompt, options: q.options, answer: q.answer }; }, []);
  const ports = useMemo(() => () => { const q = portQuestion(); return { prompt: q.prompt, options: q.options, answer: q.answer }; }, []);
  return (
    <div>
      <div role="tablist" aria-label="Reference sections" className="flex flex-wrap gap-2">
        {TABS.map(([id, label]) => (
          <button key={id} type="button" role="tab" aria-selected={tab === id} onClick={() => setTab(id)}
            className={`rounded-md border-2 px-3 py-1.5 text-sm ${tab === id ? 'border-accent bg-accent-soft' : 'border-line'}`}>{label}</button>
        ))}
      </div>
      <div className="mt-6" role="tabpanel">
        {tab === 'commands' && <Commands />}
        {tab === 'ports' && <Ports />}
        {tab === 'explain' && <Mcq key="e" make={explain} topic="commands" />}
        {tab === 'build' && <Build />}
        {tab === 'portquiz' && <Mcq key="p" make={ports} topic="ports" />}
      </div>
    </div>
  );
}
