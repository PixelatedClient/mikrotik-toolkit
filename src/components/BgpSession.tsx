import { useEffect, useState } from 'react';

type State = 'Idle' | 'Connect' | 'Active' | 'OpenSent' | 'OpenConfirm' | 'Established';
interface Ev {
  dir: 'r1' | 'r2' | 'none'; // who sends
  msg: string;
  s1: State;
  s2: State;
  note: string;
}
interface Scenario {
  id: string;
  label: string;
  verdict: string;
  fix: string;
  events: Ev[];
}

const SCENARIOS: Scenario[] = [
  {
    id: 'ok',
    label: 'Everything correct',
    verdict: 'The session reaches Established and the routers exchange routes.',
    fix: '/routing bgp session print',
    events: [
      { dir: 'r1', msg: 'TCP SYN to port 179', s1: 'Connect', s2: 'Idle', note: 'R1 starts a TCP connection to the peer. State: Connect.' },
      { dir: 'r2', msg: 'TCP SYN-ACK', s1: 'Connect', s2: 'Connect', note: 'R2 is listening on TCP 179 and answers.' },
      { dir: 'r1', msg: 'TCP ACK', s1: 'Connect', s2: 'Connect', note: 'The TCP connection is up. BGP has not started talking yet.' },
      { dir: 'r1', msg: 'OPEN  AS 64512, hold 90s', s1: 'OpenSent', s2: 'Connect', note: 'R1 announces its AS number, hold time and router ID.' },
      { dir: 'r2', msg: 'OPEN  AS 64500, hold 90s', s1: 'OpenSent', s2: 'OpenSent', note: 'R2 checks the AS number matches what it expects, then replies with its own OPEN.' },
      { dir: 'r1', msg: 'KEEPALIVE', s1: 'OpenConfirm', s2: 'OpenSent', note: 'R1 accepts the OPEN it received.' },
      { dir: 'r2', msg: 'KEEPALIVE', s1: 'Established', s2: 'Established', note: 'Both sides agree. The session is Established.' },
      { dir: 'r2', msg: 'UPDATE  203.0.113.0/24  AS_PATH 64500', s1: 'Established', s2: 'Established', note: 'R2 sends its routes. Filters and best-path selection now apply.' },
      { dir: 'r1', msg: 'UPDATE  198.51.100.0/24  AS_PATH 64512', s1: 'Established', s2: 'Established', note: 'R1 announces its own prefix.' },
    ],
  },
  {
    id: 'firewall',
    label: 'Firewall blocks TCP 179',
    verdict: 'Stuck in Connect/Active. Nothing ever answers the SYN.',
    fix: '/ip firewall filter print stats where dst-port=179',
    events: [
      { dir: 'r1', msg: 'TCP SYN to port 179', s1: 'Connect', s2: 'Idle', note: 'R1 tries to connect.' },
      { dir: 'none', msg: '... no reply (dropped by a firewall)', s1: 'Connect', s2: 'Idle', note: 'A drop rule silently discards the SYN. R1 waits for its connect-retry timer.' },
      { dir: 'r1', msg: 'TCP SYN (retry)', s1: 'Active', s2: 'Idle', note: 'R1 tries again. State flips between Connect and Active.' },
      { dir: 'none', msg: '... still no reply', s1: 'Active', s2: 'Idle', note: 'It will loop forever. TCP never opens, so BGP never sees an OPEN.' },
    ],
  },
  {
    id: 'refused',
    label: 'Wrong peer address',
    verdict: 'The TCP connection is refused (RST): nothing is listening there.',
    fix: '/ping <peer address>  and check remote.address',
    events: [
      { dir: 'r1', msg: 'TCP SYN to port 179', s1: 'Connect', s2: 'Idle', note: 'R1 connects to an address it believes is its peer.' },
      { dir: 'r2', msg: 'TCP RST (connection refused)', s1: 'Active', s2: 'Idle', note: 'The host is up but no BGP is configured for R1. It resets the connection.' },
      { dir: 'r1', msg: 'TCP SYN (retry)', s1: 'Connect', s2: 'Idle', note: 'R1 keeps retrying, with growing back-off.' },
    ],
  },
  {
    id: 'as',
    label: 'Wrong AS number',
    verdict: 'TCP works, but the OPEN is rejected with a NOTIFICATION. Back to Idle.',
    fix: '/log print where topics~"bgp"  (look for "Bad Peer AS")',
    events: [
      { dir: 'r1', msg: 'TCP SYN to port 179', s1: 'Connect', s2: 'Idle', note: 'TCP is fine.' },
      { dir: 'r2', msg: 'TCP SYN-ACK', s1: 'Connect', s2: 'Connect', note: 'R2 is listening.' },
      { dir: 'r1', msg: 'OPEN  AS 64599 (wrong!)', s1: 'OpenSent', s2: 'Connect', note: 'R1 sends an OPEN with an AS number that R2 does not expect.' },
      { dir: 'r2', msg: 'NOTIFICATION  Bad Peer AS', s1: 'Idle', s2: 'Idle', note: 'R2 refuses the session and tears down the connection. Both return to Idle.' },
    ],
  },
];

const tone: Record<State, string> = {
  Idle: 'bg-surface-2 text-muted',
  Connect: 'bg-amber-500/20 text-amber-700 dark:text-amber-300',
  Active: 'bg-amber-500/20 text-amber-700 dark:text-amber-300',
  OpenSent: 'bg-sky-500/20 text-sky-700 dark:text-sky-300',
  OpenConfirm: 'bg-sky-500/20 text-sky-700 dark:text-sky-300',
  Established: 'bg-accent text-accent-fg',
};

export default function BgpSession() {
  const [sid, setSid] = useState('ok');
  const [step, setStep] = useState(0);
  const [playing, setPlaying] = useState(false);
  const sc = SCENARIOS.find((s) => s.id === sid)!;
  const shown = sc.events.slice(0, step);
  const cur = step > 0 ? sc.events[step - 1] : null;
  const finished = step === sc.events.length;

  useEffect(() => {
    if (!playing) return;
    if (finished) { setPlaying(false); return; }
    const t = setTimeout(() => setStep((s) => s + 1), 1100);
    return () => clearTimeout(t);
  }, [playing, step, finished]);

  const pick = (id: string) => { setSid(id); setStep(0); setPlaying(false); };

  return (
    <div className="not-prose my-8 rounded-xl border border-line bg-surface p-5">
      <p className="text-xs font-semibold uppercase tracking-wide text-accent">Watch a BGP session</p>
      <fieldset className="mt-2">
        <legend className="sr-only">Scenario</legend>
        <div className="flex flex-wrap gap-2">
          {SCENARIOS.map((s) => (
            <label key={s.id} className={`cursor-pointer rounded-full border px-3 py-1 text-sm ${sid === s.id ? 'border-accent bg-accent-soft' : 'border-line hover:border-muted'}`}>
              <input type="radio" name="scenario" className="sr-only" checked={sid === s.id} onChange={() => pick(s.id)} />
              {s.label}
            </label>
          ))}
        </div>
      </fieldset>

      <div className="mt-4 grid grid-cols-[1fr_auto_1fr] items-center gap-2 text-center text-sm">
        <div><p className="font-semibold">R1</p><p className="text-xs text-muted">AS 64512</p><span className={`mt-1 inline-block rounded-full px-2.5 py-0.5 text-xs font-medium ${tone[cur?.s1 ?? 'Idle']}`}>{cur?.s1 ?? 'Idle'}</span></div>
        <div className="w-40 sm:w-72" />
        <div><p className="font-semibold">R2</p><p className="text-xs text-muted">AS 64500</p><span className={`mt-1 inline-block rounded-full px-2.5 py-0.5 text-xs font-medium ${tone[cur?.s2 ?? 'Idle']}`}>{cur?.s2 ?? 'Idle'}</span></div>
      </div>

      <ol className="mt-2 space-y-1.5" aria-label="Messages">
        {shown.map((e, i) => (
          <li key={i} className={`flex items-center gap-2 rounded-md px-2 py-1.5 text-xs sm:text-sm ${i === step - 1 ? 'bg-accent-soft' : ''}`}>
            {e.dir === 'r1' && <><span className="text-muted">R1</span><span aria-hidden>──▶</span><span className="font-mono">{e.msg}</span></>}
            {e.dir === 'r2' && <><span className="font-mono">{e.msg}</span><span aria-hidden>◀──</span><span className="text-muted">R2</span></>}
            {e.dir === 'none' && <span className="mx-auto font-mono text-red-600 dark:text-red-400">{e.msg}</span>}
          </li>
        ))}
        {step === 0 && <li className="px-2 py-1.5 text-sm text-muted">Press Step to send the first packet.</li>}
      </ol>

      <div role="status" aria-live="polite" className="mt-3 min-h-12 rounded-lg border border-line p-3 text-sm">
        {cur ? cur.note : 'Both routers start in Idle.'}
        {finished && (
          <p className="mt-2"><span className="font-semibold">Result:</span> {sc.verdict}<br /><span className="text-muted">Check with: </span><code className="font-mono text-xs">{sc.fix}</code></p>
        )}
      </div>

      <div className="mt-3 flex gap-2">
        <button type="button" disabled={finished} onClick={() => setStep((s) => s + 1)} className="rounded-md bg-accent px-3 py-1.5 text-sm font-medium text-accent-fg disabled:opacity-40">Step</button>
        <button type="button" disabled={finished} onClick={() => setPlaying((p) => !p)} className="rounded-md border border-line px-3 py-1.5 text-sm hover:border-muted disabled:opacity-40">{playing ? 'Pause' : 'Auto-play'}</button>
        <button type="button" onClick={() => { setStep(0); setPlaying(false); }} className="rounded-md border border-line px-3 py-1.5 text-sm hover:border-muted">Reset</button>
      </div>
    </div>
  );
}
