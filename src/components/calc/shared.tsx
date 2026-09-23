import { useState, type ReactNode } from 'react';

export const input =
  'w-full rounded-md border border-line bg-bg px-3 py-2 font-mono text-sm text-fg placeholder:text-muted focus:border-accent';
export const card = 'not-prose my-8 rounded-xl border border-line bg-surface p-5';
export const btn = 'rounded-md border border-line px-3 py-1.5 text-sm hover:border-muted';
export const btnPrimary = 'rounded-md bg-accent px-3 py-1.5 text-sm font-medium text-accent-fg hover:opacity-90';

export function Field({ id, label, hint, children }: { id: string; label: string; hint?: string; children: ReactNode }) {
  return (
    <div>
      <label htmlFor={id} className="block text-sm font-medium">{label}</label>
      <div className="mt-1">{children}</div>
      {hint && <p className="mt-1 text-xs text-muted">{hint}</p>}
    </div>
  );
}

export function Message({ children }: { children: ReactNode }) {
  return <p role="status" aria-live="polite" className="mt-2 min-h-5 text-xs text-red-600 dark:text-red-400">{children}</p>;
}

/** The step-by-step working panel shown under a result. */
export function Steps({ title = 'How this was calculated', steps }: { title?: string; steps: string[] }) {
  return (
    <details open className="mt-5 rounded-lg border border-line bg-bg p-3">
      <summary className="cursor-pointer text-sm font-semibold">{title}</summary>
      <ol className="mt-2 list-decimal space-y-1.5 pl-5 text-sm text-muted">
        {steps.map((s, i) => <li key={i}>{s}</li>)}
      </ol>
    </details>
  );
}

export function Results({ rows }: { rows: [string, ReactNode][] }) {
  return (
    <dl className="mt-3 grid grid-cols-[auto_1fr] gap-x-6 gap-y-1.5 text-sm">
      {rows.map(([k, v]) => (
        <div key={k} className="contents">
          <dt className="text-muted">{k}</dt>
          <dd className="break-all font-mono">{v}</dd>
        </div>
      ))}
    </dl>
  );
}

export function CopyButton({ text, label = 'Copy' }: { text: string; label?: string }) {
  const [done, setDone] = useState(false);
  return (
    <button
      type="button"
      className={btn}
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
          setDone(true);
          setTimeout(() => setDone(false), 1500);
        } catch {
          /* clipboard blocked */
        }
      }}
    >
      {done ? 'Copied' : label}
    </button>
  );
}

/** Splits a 32-bit binary view into network and host bits, coloured by role. */
export function BitRow({ label, octets, network }: { label: string; octets: string[]; network: number }) {
  let idx = 0;
  return (
    <div className="flex flex-wrap items-baseline gap-x-3 font-mono text-xs">
      <span className="w-20 shrink-0 font-sans text-muted">{label}</span>
      <span aria-label={octets.join(' ')}>
        {octets.map((o, i) => (
          <span key={i} className="mr-2">
            {o.split('').map((b) => {
              const isNet = idx++ < network;
              return <span key={idx} className={isNet ? 'text-accent' : 'text-muted'}>{b}</span>;
            })}
          </span>
        ))}
      </span>
    </div>
  );
}
