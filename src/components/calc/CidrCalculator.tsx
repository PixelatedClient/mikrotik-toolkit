import { useMemo, useState } from 'react';
import { calcSubnet } from '../../lib/subnet';
import { cidrToMask, maskToCidr, prefixForHosts, wildcardOf } from '../../lib/netcalc';
import { Field, Message, Results, card, input } from './shared';

type Mode = 'prefix' | 'mask' | 'hosts';

export default function CidrCalculator() {
  const [mode, setMode] = useState<Mode>('prefix');
  const [text, setText] = useState('26');
  const [filter, setFilter] = useState('');

  const { cidr, error } = useMemo((): { cidr: number | null; error: string } => {
    const t = text.trim().replace(/^\//, '');
    if (mode === 'prefix') {
      const n = Number(t);
      return Number.isInteger(n) && t !== '' && n >= 0 && n <= 32 ? { cidr: n, error: '' } : { cidr: null, error: 'Enter a prefix length from 0 to 32.' };
    }
    if (mode === 'mask') {
      const c = maskToCidr(t);
      return c === null ? { cidr: null, error: 'Enter a valid subnet mask such as 255.255.255.192. Masks are a run of 1s then 0s.' } : { cidr: c, error: '' };
    }
    const h = Number(t);
    if (!Number.isInteger(h) || h < 1 || h > 2 ** 32 - 2) return { cidr: null, error: 'Enter how many hosts you need (1 or more).' };
    return { cidr: h > 2 ** 31 - 2 ? 0 : prefixForHosts(h), error: '' };
  }, [mode, text]);

  const rows = useMemo(
    () =>
      Array.from({ length: 33 }, (_, c) => {
        const info = calcSubnet(`0.0.0.0/${c}`)!;
        return { c, mask: info.mask, wildcard: wildcardOf(c)!, total: info.totalAddresses, usable: info.usableHosts };
      }),
    [],
  );
  const shown = rows.filter((r) => !filter || `/${r.c} ${r.mask} ${r.wildcard}`.includes(filter.trim()));
  const info = cidr !== null ? calcSubnet(`0.0.0.0/${cidr}`) : null;

  return (
    <div className={card}>
      <div role="tablist" aria-label="Start from" className="flex flex-wrap gap-1">
        {([['prefix', 'Prefix length'], ['mask', 'Subnet mask'], ['hosts', 'Hosts needed']] as const).map(([m, label]) => (
          <button key={m} role="tab" aria-selected={mode === m} type="button" onClick={() => { setMode(m); setText(m === 'prefix' ? '26' : m === 'mask' ? '255.255.255.192' : '50'); }}
            className={`rounded-md border px-3 py-1.5 text-sm ${mode === m ? 'border-accent bg-accent-soft' : 'border-line hover:border-muted'}`}>{label}</button>
        ))}
      </div>
      <div className="mt-4 max-w-sm">
        <Field id="cidr-in" label={mode === 'prefix' ? 'Prefix length' : mode === 'mask' ? 'Subnet mask' : 'Number of hosts'} hint={mode === 'hosts' ? 'Finds the smallest subnet with enough usable addresses.' : undefined}>
          <input id="cidr-in" className={input} value={text} onChange={(e) => setText(e.target.value)} spellCheck={false} aria-invalid={!!error} />
        </Field>
        <Message>{error}</Message>
      </div>
      {info && cidr !== null && (
        <Results
          rows={[
            ['Prefix', `/${cidr}`],
            ['Subnet mask', info.mask],
            ['Wildcard mask', wildcardOf(cidr)!],
            ['Total addresses', info.totalAddresses.toLocaleString()],
            ['Usable hosts', info.usableHosts.toLocaleString()],
            ['Block size', cidr % 8 === 0 || cidr === 0 ? 'whole octets' : `${256 - Number(cidrToMask(cidr)!.split('.')[Math.floor(cidr / 8)])} in octet ${Math.floor(cidr / 8) + 1}`],
          ]}
        />
      )}

      <h2 className="mt-8 text-lg font-semibold">Every prefix length</h2>
      <div className="mt-2 max-w-xs"><Field id="cidr-filter" label="Filter"><input id="cidr-filter" className={input} value={filter} onChange={(e) => setFilter(e.target.value)} placeholder="/24 or 255.255.255" spellCheck={false} /></Field></div>
      <div className="mt-3 max-h-96 overflow-auto rounded-lg border border-line">
        <table className="min-w-full text-sm">
          <caption className="sr-only">All IPv4 prefix lengths</caption>
          <thead className="sticky top-0 bg-surface-2 text-left text-xs text-muted">
            <tr><th scope="col" className="px-3 py-2">Prefix</th><th scope="col" className="px-3 py-2">Mask</th><th scope="col" className="px-3 py-2">Wildcard</th><th scope="col" className="px-3 py-2 text-right">Addresses</th><th scope="col" className="px-3 py-2 text-right">Usable</th></tr>
          </thead>
          <tbody className="font-mono text-xs">
            {shown.map((r) => (
              <tr key={r.c} className={`border-t border-line ${r.c === cidr ? 'bg-accent-soft' : ''}`}>
                <th scope="row" className="px-3 py-1.5 text-left font-semibold">/{r.c}</th>
                <td className="px-3 py-1.5">{r.mask}</td>
                <td className="px-3 py-1.5">{r.wildcard}</td>
                <td className="px-3 py-1.5 text-right">{r.total.toLocaleString()}</td>
                <td className="px-3 py-1.5 text-right">{r.usable.toLocaleString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
