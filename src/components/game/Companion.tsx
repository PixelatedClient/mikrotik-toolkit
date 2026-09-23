import { useEffect, useRef, useState } from 'react';
import { BADGES, levelInfo, type GameState } from '../../lib/gamify';
import { get, subscribe } from '../../scripts/game-store';
import { Confetti } from './ui';

const TIPS = [
  'A /24 has 254 usable hosts: 256 minus network and broadcast.',
  'Firewall chains run top to bottom. First match wins.',
  'When two routes match, the longest prefix wins.',
  'A lower administrative distance beats a higher one.',
  'TTL drops by one at every router, which is how loops die.',
  'Pages hang but ping works? Think MTU.',
  'Routes work in one direction. Replies need a way back too.',
  'BGP runs over TCP port 179.',
  'A router with no matching route drops the packet.',
  'VLAN filtering goes on last, or you lock yourself out.',
];

interface Pop { id: number; text: string; kind: 'xp' | 'badge' | 'sad' }

/** A little mascot in the corner that reacts to what you do, floats +XP, and announces level-ups. */
export default function Companion() {
  const [mood, setMood] = useState<'idle' | 'happy' | 'sad'>('idle');
  const [say, setSay] = useState('');
  const [pops, setPops] = useState<Pop[]>([]);
  const [levelUp, setLevelUp] = useState<number | null>(null);
  const [hidden, setHidden] = useState(false);
  const prev = useRef<GameState | null>(null);
  const id = useRef(0);
  const timers = useRef<number[]>([]);

  const later = (fn: () => void, ms: number) => { timers.current.push(window.setTimeout(fn, ms)); };
  const pop = (text: string, kind: Pop['kind']) => {
    const n = ++id.current;
    setPops((p) => [...p, { id: n, text, kind }]);
    later(() => setPops((p) => p.filter((x) => x.id !== n)), 1800);
  };
  const speak = (text: string, m: 'idle' | 'happy' | 'sad' = 'idle', ms = 4200) => {
    setSay(text); setMood(m);
    later(() => { setSay(''); setMood('idle'); }, ms);
  };

  useEffect(() => {
    try { if (localStorage.getItem('na-companion') === 'off') setHidden(true); } catch { /* ignore */ }
    prev.current = get();
    const off = subscribe(() => {
      const s = get(), p = prev.current!;
      prev.current = s;
      if (s.xp > p.xp) {
        pop(`+${s.xp - p.xp} XP`, 'xp');
        const a = levelInfo(p.xp).level, b = levelInfo(s.xp).level;
        if (b > a) { setLevelUp(b); speak(`Level ${b}! You are getting good at this.`, 'happy', 5000); later(() => setLevelUp(null), 3500); }
        else if (s.run >= 3 && s.run > p.run) speak(`${s.run} in a row!`, 'happy');
        else if (s.stars && Object.keys(s.stars).length > Object.keys(p.stars).length) speak('Level cleared!', 'happy');
      } else if (s.run === 0 && p.run > 0) speak('Not quite. Read the explanation, then go again.', 'sad');
      for (const b of BADGES) if (s.badges.includes(b.id) && !p.badges.includes(b.id)) { pop(`Badge: ${b.name}`, 'badge'); speak(`New badge: ${b.name}!`, 'happy', 5000); }
    });
    const tipTimer = window.setInterval(() => {
      if (!document.hidden) speak(TIPS[Math.floor(Math.random() * TIPS.length)]);
    }, 32000);
    const first = window.setTimeout(() => speak('Hi! I am Pkt. Click me for a tip.'), 2500);
    return () => { off(); clearInterval(tipTimer); clearTimeout(first); timers.current.forEach(clearTimeout); };
  }, []);

  if (hidden) return null;

  return (
    <>
      {levelUp && (
        <div role="status" className="fixed inset-x-0 top-24 z-50 flex justify-center px-4">
          <div className="relative overflow-hidden rounded-xl border bg-surface px-8 py-5 text-center" style={{ animation: 'pop 0.4s ease-out' }}>
            <Confetti />
            <p className="pixel text-sm text-accent">LEVEL UP!</p>
            <p className="pixel mt-3 text-2xl">{levelUp}</p>
          </div>
        </div>
      )}
      <div className="pointer-events-none fixed bottom-3 right-3 z-40 flex flex-col items-end gap-2 print:hidden">
        <div aria-live="polite" className="flex flex-col items-end gap-1">
          {pops.map((p) => (
            <span key={p.id} className={`pixel rounded-md border-2 px-2 py-1 text-[0.55rem] ${p.kind === 'xp' ? 'border-accent bg-surface text-accent' : p.kind === 'badge' ? 'border-good bg-surface text-good' : 'border-danger bg-surface'}`} style={{ animation: 'companion-float 1.8s ease-out forwards' }}>{p.text}</span>
          ))}
        </div>
        {say && (
          <p role="status" className="pointer-events-auto max-w-[16rem] rounded-xl border-2 border-line bg-surface p-2.5 text-xs shadow-[0_3px_0_var(--edge)]" style={{ animation: 'pop 0.25s ease-out' }}>{say}</p>
        )}
        <button type="button" aria-label="Pkt, your mascot. Click for a networking tip." onClick={() => speak(TIPS[Math.floor(Math.random() * TIPS.length)])}
          className={`pointer-events-auto companion ${mood}`}>
          <svg width="56" height="56" viewBox="0 0 16 16" shapeRendering="crispEdges" aria-hidden="true">
            <rect x="3" y="1" width="1" height="2" fill="#ffd23f" /><rect x="12" y="1" width="1" height="2" fill="#ffd23f" />
            <rect x="2" y="3" width="12" height="9" fill="#ffd23f" /><rect x="2" y="3" width="12" height="1" fill="#fff0a8" /><rect x="2" y="11" width="12" height="1" fill="#c99a12" />
            <g className="c-eyes"><rect x="4" y="6" width="2" height="2" fill="#0a0e2a" /><rect x="10" y="6" width="2" height="2" fill="#0a0e2a" /></g>
            {mood === 'sad'
              ? <><rect x="6" y="10" width="4" height="1" fill="#0a0e2a" /><rect x="5" y="11" width="1" height="1" fill="#0a0e2a" /><rect x="10" y="11" width="1" height="1" fill="#0a0e2a" /></>
              : <><rect x="5" y="9" width="1" height="1" fill="#0a0e2a" /><rect x="6" y="10" width="4" height="1" fill="#0a0e2a" /><rect x="10" y="9" width="1" height="1" fill="#0a0e2a" /></>}
            <rect x="4" y="12" width="2" height="2" fill="#c99a12" /><rect x="10" y="12" width="2" height="2" fill="#c99a12" />
          </svg>
        </button>
      </div>
    </>
  );
}
