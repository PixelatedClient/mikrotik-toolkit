import { useState } from 'react';
import { INCIDENTS } from '../../data/game/nocIncidents';
import { lessonForIncident } from '../../data/lessonKit';
import { finishLevel, useGame, type LevelReward } from './useGame';
import { Confetti, Stars, ghost, panel, primary, Terminal } from './ui';

export default function NocSimulator({ incidentId }: { incidentId: string }) {
  const inc = INCIDENTS.find((i) => i.id === incidentId)!;
  const lessonId = lessonForIncident(incidentId);
  const { state: game } = useGame();
  const [device, setDevice] = useState(inc.devices[0].id);
  const [ran, setRan] = useState<string[]>([]);
  const [guess, setGuess] = useState('');
  const [wrong, setWrong] = useState<string[]>([]);
  const [reward, setReward] = useState<LevelReward | null>(null);

  const ruledOut = new Set(inc.cmds.filter((c) => ran.includes(c.id)).flatMap((c) => c.rules ?? []));
  const idx = INCIDENTS.findIndex((i) => i.id === inc.id);
  const next = INCIDENTS[idx + 1];

  const run = (id: string) => setRan((r) => (r.includes(id) ? r : [...r, id]));
  const diagnose = () => {
    if (!guess) return;
    if (guess === inc.truth) {
      const base = ran.length <= inc.par ? 3 : ran.length <= inc.par + 2 ? 2 : 1;
      setReward(finishLevel(inc.id, Math.max(1, base - wrong.length)));
    } else if (!wrong.includes(guess)) setWrong([...wrong, guess]);
  };
  const restart = () => { setRan([]); setGuess(''); setWrong([]); setReward(null); setDevice(inc.devices[0].id); };

  const cmds = inc.cmds.filter((c) => c.device === device);

  return (
    <div className="space-y-5">
      <p className="pixel text-[0.55rem] text-accent">INCIDENT · LEVEL {inc.level}</p>
      <blockquote className="rounded-md border-2 border-line bg-surface-2 p-3 text-base">{inc.ticket}</blockquote>
      <p className="text-sm text-muted">Run diagnostics on the devices, gather evidence, then name the cause. Fewer commands earns more stars, and each wrong diagnosis costs one. Outputs are illustrative.</p>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <section className={panel} aria-labelledby="dev-h">
          <h2 id="dev-h" className="text-sm font-semibold">Devices</h2>
          <div className="mt-2 flex flex-wrap gap-2" role="tablist" aria-label="Devices">
            {inc.devices.map((d) => (
              <button key={d.id} type="button" role="tab" aria-selected={device === d.id} onClick={() => setDevice(d.id)}
                className={`rounded-md border-2 px-3 py-1.5 text-sm ${device === d.id ? 'border-accent bg-accent-soft' : 'border-line'}`}>{d.label}</button>
            ))}
          </div>
          <ul className="mt-3 space-y-2">
            {cmds.map((c) => (
              <li key={c.id}>
                <button type="button" onClick={() => run(c.id)} className="w-full rounded-md border-2 border-line bg-bg px-3 py-2 text-left font-mono text-xs hover:border-accent">
                  {ran.includes(c.id) ? '✓ ' : '> '}{c.cmd}
                </button>
              </li>
            ))}
          </ul>
        </section>

        <section className={panel} aria-labelledby="out-h">
          <h2 id="out-h" className="text-sm font-semibold">Output ({ran.length} command{ran.length === 1 ? '' : 's'} run · par {inc.par})</h2>
          <div className="mt-2 max-h-96 space-y-3 overflow-y-auto" aria-live="polite">
            {ran.length === 0 && <p className="text-sm text-muted">Nothing run yet. Pick a command on the left.</p>}
            {ran.map((id) => {
              const c = inc.cmds.find((x) => x.id === id)!;
              const d = inc.devices.find((x) => x.id === c.device)!;
              return (
                <div key={id}>
                  <p className="text-xs text-muted">{d.label}</p>
                  <Terminal lines={[`> ${c.cmd}`, c.out]} empty="" />
                </div>
              );
            })}
          </div>
        </section>
      </div>

      {!reward && (
        <fieldset className={panel}>
          <legend className="px-1 text-sm font-semibold">What is the cause?</legend>
          <div className="space-y-2">
            {inc.causes.map((c) => (
              <label key={c.id} className={`flex items-center gap-2 rounded-md border-2 px-3 py-2 text-sm ${wrong.includes(c.id) ? 'border-danger opacity-60' : 'border-line'}`}>
                <input type="radio" name="cause" value={c.id} checked={guess === c.id} onChange={() => setGuess(c.id)} disabled={wrong.includes(c.id)} />
                <span className={ruledOut.has(c.id) ? 'line-through' : ''}>{c.label}</span>
                {ruledOut.has(c.id) && <span className="text-xs text-good">ruled out by your evidence</span>}
                {wrong.includes(c.id) && <span className="text-xs text-danger">wrong</span>}
              </label>
            ))}
          </div>
          {wrong.length > 0 && <p role="status" className="mt-2 text-sm text-danger">Not that one. Look at the evidence again.</p>}
          <button type="button" className={`${primary} mt-3`} onClick={diagnose} disabled={!guess}>Submit diagnosis</button>
        </fieldset>
      )}

      {reward && (
        <div role="status" className="relative overflow-hidden rounded-xl border bg-accent-soft p-5" style={{ animation: 'pop 0.4s ease-out' }}>
          <Confetti />
          <p className="pixel text-center text-sm text-accent">INCIDENT RESOLVED!</p>
          <div className="mt-3 flex justify-center"><Stars n={reward.stars} size={34} /></div>
          <p className="mt-2 text-center text-sm">{reward.xp > 0 ? `+${reward.xp} XP` : 'No new XP: you already have these stars.'} · {ran.length} commands</p>
          <h2 className="mt-4 text-sm font-semibold">Why</h2>
          <p className="mt-1 text-sm">{inc.lesson}</p>
          <h2 className="mt-4 text-sm font-semibold">The fix</h2>
          <Terminal lines={inc.fix} empty="" />
          {inc.read && <p className="mt-3 text-sm"><a className="text-accent underline" href={inc.read.href}>{inc.read.label}</a></p>}
          <div className="mt-4 flex flex-wrap justify-center gap-3">
            <button type="button" className={ghost} onClick={restart}>Play again</button>
            {lessonId && <a href={`/learn/${lessonId}`} className={`${primary} inline-block`}>Back to the lesson</a>}
          </div>
        </div>
      )}
      <p className="flex items-center gap-2 text-xs text-muted">Best so far: <Stars n={game.stars[inc.id] ?? 0} size={14} /></p>
    </div>
  );
}
