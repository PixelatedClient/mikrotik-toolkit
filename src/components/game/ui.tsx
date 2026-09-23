import type { ReactNode } from 'react';
import { nextLevel } from '../../data/game/world';
import type { LevelReward } from './useGame';

export const panel = 'min-w-0 rounded-xl border bg-surface p-4 sm:p-4';
export const primary = 'rounded-md bg-accent px-4 py-2.5 text-sm text-accent-fg disabled:opacity-40 md:py-2 min-h-11 md:min-h-auto';
export const ghost = 'rounded-md border-2 border-line px-3 py-2 text-sm hover:border-muted md:py-1.5 min-h-11 md:min-h-auto';
export const sel = 'rounded-md border-2 border-line bg-bg px-3 py-2 font-mono text-sm text-fg md:px-2 md:py-1.5 min-h-11 md:min-h-auto';

export function Stars({ n, of = 3, size = 20 }: { n: number; of?: number; size?: number }) {
  return (
    <span role="img" aria-label={`${n} of ${of} stars`} className="inline-flex gap-0.5">
      {Array.from({ length: of }, (_, i) => (
        <svg key={i} width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
          <path d="M12 2l3 6.6 7.2.8-5.4 4.9 1.5 7.1L12 17.8 5.7 21.4l1.5-7.1L1.8 9.4 9 8.6z" fill={i < n ? 'var(--accent)' : 'none'} stroke={i < n ? 'var(--accent-edge)' : 'var(--muted)'} strokeWidth="1.6" strokeLinejoin="round" />
        </svg>
      ))}
    </span>
  );
}

export function HeartRow({ left, total }: { left: number; total: number }) {
  return (
    <span role="img" aria-label={`${left} of ${total} lives left`} className="inline-flex gap-1">
      {Array.from({ length: total }, (_, i) => (
        <svg key={i} width="18" height="18" viewBox="0 0 24 24" aria-hidden="true">
          <path d="M12 21s-8-5.2-8-11a4.5 4.5 0 0 1 8-2.8A4.5 4.5 0 0 1 20 10c0 5.8-8 11-8 11z" fill={i < left ? 'var(--danger)' : 'none'} stroke={i < left ? 'var(--danger)' : 'var(--muted)'} strokeWidth="2" />
        </svg>
      ))}
    </span>
  );
}

export function HpBar({ label, pct }: { label: string; pct: number }) {
  return (
    <div>
      <div className="flex justify-between text-xs"><span className="font-semibold">{label}</span><span className="text-muted">{pct}% HP</span></div>
      <div className="mt-1 h-4 border-2 border-line bg-bg" role="progressbar" aria-label={`${label} health`} aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
        <div className="h-full bg-danger transition-all duration-500" style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

export function LevelHeader({ title, story, learn, goal, boss, read }: { title: string; story: string; learn: string; goal: string; boss?: string; read?: { href: string; label: string } }) {
  return (
    <div>
      {boss && <p className="pixel text-[0.6rem] text-danger">BOSS FIGHT: {boss}</p>}
      <p className="text-base">{story}</p>
      <details className="mt-3 rounded-md border-2 border-line bg-surface-2 p-3 text-sm">
        <summary className="cursor-pointer font-semibold">Need a hint? Read the lesson</summary>
        <p className="mt-2 text-muted">{learn}</p>
        {read && <p className="mt-2"><a className="text-accent underline" href={read.href}>{read.label}</a></p>}
      </details>
      <p className="mt-3 text-sm"><span className="pixel text-[0.55rem] text-accent">GOAL</span>{' '}{goal}</p>
      <span className="sr-only">{title}</span>
    </div>
  );
}

const CONFETTI = ['var(--accent)', 'var(--good)', 'var(--danger)', '#7aa2ff', '#fff'];
export function Confetti() {
  return (
    <div className="confetti" aria-hidden="true">
      {Array.from({ length: 28 }, (_, i) => (
        <i key={i} style={{ left: `${(i * 37) % 100}%`, background: CONFETTI[i % CONFETTI.length], animationDelay: `${(i % 7) * 0.06}s`, ['--dx' as string]: `${((i * 53) % 90) - 45}px` }} />
      ))}
    </div>
  );
}

export function Victory({ levelId, reward, onRetry, extra }: { levelId: string; reward: LevelReward; onRetry: () => void; extra?: ReactNode }) {
  const next = nextLevel(levelId);
  return (
    <div role="status" className="relative overflow-hidden rounded-xl border bg-accent-soft p-5 text-center" style={{ animation: 'pop 0.4s ease-out' }}>
      <Confetti />
      <p className="pixel text-sm text-accent">LEVEL CLEAR!</p>
      <div className="mt-3 flex justify-center"><Stars n={reward.stars} size={34} /></div>
      <p className="mt-3 text-sm">{reward.xp > 0 ? `+${reward.xp} XP` : 'No new XP: you already have these stars.'}</p>
      {reward.fresh.map((b) => <p key={b.id} className="mt-1 text-sm font-semibold text-accent">New badge: {b.name}</p>)}
      {extra}
      <div className="mt-4 flex flex-wrap justify-center gap-3">
        {next && <a href={`/play/${next.id}`} className={`${primary} inline-block`}>Next: {next.title}</a>}
        <button type="button" onClick={onRetry} className={ghost}>Play again</button>
        <a href="/play" className={`${ghost} inline-block`}>World map</a>
      </div>
    </div>
  );
}

/** Real command lines in a terminal-looking block. */
export function Terminal({ lines, empty }: { lines: string[]; empty: string }) {
  return (
    <pre className="overflow-x-auto rounded-md border-2 border-line bg-black/80 p-3 font-mono text-xs leading-relaxed text-green-300" aria-label="RouterOS commands" tabIndex={0}>
      {lines.length ? lines.join('\n') : `# ${empty}`}
    </pre>
  );
}
