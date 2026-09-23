import { useMemo, useState } from 'react';
import { calcSubnet, parseIPv4 } from '../../lib/subnet';
import {
  RATE_UNITS, SIZE_UNITS, bytesInTime, calcIPv6, cidrToMask, compressIPv6, convertNumber, expandIPv6, humanDuration, ipv4Octets, maskToCidr, parseIPv6,
  rangeToCidrs, splitIPv6, summarize, transferSeconds, wildcardOf, type Base,
} from '../../lib/netcalc';
import { BitRow, CopyButton, Field, Message, Results, Steps, btn, card, input } from './shared';

/* ----------------------------------------------------------- wildcard mask */

export function WildcardCalculator() {
  const [ip, setIp] = useState('192.168.10.0');
  const [m, setM] = useState('255.255.255.192');
  const [wild, setWild] = useState('0.0.0.63');

  const fromMask = useMemo(() => {
    const cidr = m.includes('.') ? maskToCidr(m) : /^\/?\d{1,2}$/.test(m.trim()) ? Number(m.trim().replace('/', '')) : null;
    if (cidr === null || cidr < 0 || cidr > 32) return null;
    const info = calcSubnet(`${ip}/${cidr}`);
    return info ? { cidr, info, wildcard: wildcardOf(cidr)! } : null;
  }, [ip, m]);

  const fromWild = useMemo(() => {
    const w = parseIPv4(wild);
    if (w === null) return null;
    const mask = (~w) >>> 0;
    const maskText = [mask >>> 24, (mask >>> 16) & 255, (mask >>> 8) & 255, mask & 255].join('.');
    const cidr = maskToCidr(maskText);
    return cidr === null ? { contiguous: false as const, maskText } : { contiguous: true as const, cidr, maskText };
  }, [wild]);

  return (
    <div className={card}>
      <h2 className="text-lg font-semibold">Mask or prefix to wildcard</h2>
      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <Field id="w-ip" label="IP address"><input id="w-ip" className={input} value={ip} onChange={(e) => setIp(e.target.value)} spellCheck={false} /></Field>
        <Field id="w-mask" label="Subnet mask or prefix" hint="255.255.255.192 or /26"><input id="w-mask" className={input} value={m} onChange={(e) => setM(e.target.value)} spellCheck={false} /></Field>
      </div>
      <Message>{!fromMask && 'Enter a valid address and a mask (a run of 1s then 0s) or a prefix from 0 to 32.'}</Message>
      {fromMask && (
        <>
          <Results rows={[
            ['Wildcard mask', fromMask.wildcard],
            ['Prefix', `/${fromMask.cidr}`],
            ['Network', `${fromMask.info.network}`],
            ['Matches', `${fromMask.info.network} to ${fromMask.info.broadcast}`],
            ['As a pair', `${fromMask.info.network} ${fromMask.wildcard}`],
          ]} />
          <Steps title="How the wildcard is found" steps={[
            `The wildcard mask is the subnet mask with every bit flipped: 1s in the mask become 0s, and 0s become 1s.`,
            `/${fromMask.cidr} = ${cidrToMask(fromMask.cidr)}, so the wildcard is ${fromMask.wildcard}.`,
            'A 0 bit in a wildcard means "this bit must match the address exactly". A 1 bit means "any value is fine". That is why 0.0.0.63 matches 64 consecutive addresses.',
          ]} />
        </>
      )}

      <h2 className="mt-8 text-lg font-semibold">Wildcard to mask</h2>
      <div className="mt-3 max-w-xs"><Field id="w-wild" label="Wildcard mask"><input id="w-wild" className={input} value={wild} onChange={(e) => setWild(e.target.value)} spellCheck={false} /></Field></div>
      {fromWild ? (
        fromWild.contiguous ? <Results rows={[['Subnet mask', fromWild.maskText], ['Prefix', `/${fromWild.cidr}`]]} /> :
          <p className="mt-2 text-sm text-muted">The inverse is {fromWild.maskText}, which is not a normal subnet mask (its 1 bits are not contiguous). Wildcards like this are legal in some access lists but do not describe a subnet.</p>
      ) : <Message>Enter a wildcard such as 0.0.0.255.</Message>}
    </div>
  );
}

/* ------------------------------------------------------------ range → CIDR */

export function RangeToCidrCalculator() {
  const [a, setA] = useState('192.168.1.10');
  const [b, setB] = useState('192.168.1.200');
  const list = useMemo(() => rangeToCidrs(a.trim(), b.trim()), [a, b]);
  const total = list ? list.reduce((n, c) => n + calcSubnet(c)!.totalAddresses, 0) : 0;
  return (
    <div className={card}>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field id="r-a" label="First address"><input id="r-a" className={input} value={a} onChange={(e) => setA(e.target.value)} spellCheck={false} /></Field>
        <Field id="r-b" label="Last address"><input id="r-b" className={input} value={b} onChange={(e) => setB(e.target.value)} spellCheck={false} /></Field>
      </div>
      <Message>{!list && 'Enter two valid IPv4 addresses, with the first not higher than the last.'}</Message>
      {list && (
        <>
          <p className="mt-3 text-sm">{total.toLocaleString()} addresses in {list.length} block{list.length === 1 ? '' : 's'}:</p>
          <ul className="mt-2 font-mono text-sm">{list.map((c) => <li key={c}>{c}</li>)}</ul>
          <div className="mt-3"><CopyButton text={list.join('\n')} label="Copy list" /></div>
          <Steps title="How the range is split" steps={[
            'Start at the first address. Take the largest block that begins exactly there, meaning the start is a multiple of the block size, and that still ends before the last address.',
            'Add that block to the list and move to the address just after it. Repeat until the last address is covered.',
            'Taking the largest aligned block each time gives the smallest possible list, and the blocks never overlap or leave gaps.',
          ]} />
        </>
      )}
    </div>
  );
}

/* --------------------------------------------------- route summarization */

export function SummarizeCalculator() {
  const [text, setText] = useState('192.168.4.0/24\n192.168.5.0/24\n192.168.6.0/24\n192.168.7.0/24');
  const lines = text.split(/[\n,]+/).map((s) => s.trim()).filter(Boolean);
  const result = useMemo(() => (lines.length ? summarize(lines) : null), [text]);
  return (
    <div className={card}>
      <Field id="s-in" label="Prefixes, one per line" hint="Routes, subnets or ranges you want to advertise as one.">
        <textarea id="s-in" rows={6} className={input} value={text} onChange={(e) => setText(e.target.value)} spellCheck={false} />
      </Field>
      <Message>{lines.length > 0 && !result && 'One of the lines is not a valid prefix like 10.0.0.0/24.'}</Message>
      {result && (
        <>
          <Results rows={[
            ['Single summary', result.summary],
            ['Exact?', result.exact ? 'Yes: it covers only your prefixes' : `No: it also covers ${result.extra.toLocaleString()} addresses you did not list`],
            ['Fewest exact prefixes', result.minimal.join(', ')],
          ]} />
          <Steps steps={[
            'Merge overlapping and touching prefixes into continuous ranges.',
            `The lowest address is the start of the first range, and the highest is the end of the last. The smallest single prefix that contains both is ${result.summary}.`,
            result.exact ? 'That prefix holds exactly the addresses you listed, so summarizing loses nothing.' : `That prefix is bigger than what you listed by ${result.extra.toLocaleString()} addresses. Advertising it would attract traffic for addresses you may not own. When that matters, advertise the exact list instead.`,
            'Route summarization needs contiguous, power-of-two aligned blocks (RFC 4632). That is why four /24s starting at a multiple of four make a clean /22.',
          ]} />
        </>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ binary */

export function BinaryCalculator() {
  const [base, setBase] = useState<Base>(10);
  const [text, setText] = useState('192');
  const [ip, setIp] = useState('192.168.10.73');
  const [cidr, setCidr] = useState('26');
  const conv = useMemo(() => convertNumber(text, base), [text, base]);
  const octets = ipv4Octets(ip.trim());
  const c = Number(cidr);
  const cidrOk = Number.isInteger(c) && c >= 0 && c <= 32;
  return (
    <div className={card}>
      <h2 className="text-lg font-semibold">Number converter</h2>
      <div className="mt-3 flex flex-wrap items-end gap-3">
        <div role="tablist" aria-label="Input base" className="flex gap-1">
          {([[10, 'Decimal'], [2, 'Binary'], [16, 'Hex'], [8, 'Octal']] as const).map(([b, label]) => (
            <button key={b} role="tab" aria-selected={base === b} type="button" onClick={() => setBase(b)} className={`rounded-md border px-3 py-1.5 text-sm ${base === b ? 'border-accent bg-accent-soft' : 'border-line hover:border-muted'}`}>{label}</button>
          ))}
        </div>
        <div className="w-56"><Field id="b-in" label="Value"><input id="b-in" className={input} value={text} onChange={(e) => setText(e.target.value)} spellCheck={false} /></Field></div>
      </div>
      <Message>{!conv && 'That is not a valid number in this base.'}</Message>
      {conv && <Results rows={[['Decimal', conv.dec], ['Binary', conv.bin.replace(/(?=(\d{8})+$)/g, ' ').trim()], ['Hexadecimal', conv.hex], ['Octal', conv.oct]]} />}

      <h2 className="mt-8 text-lg font-semibold">IPv4 address in binary</h2>
      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <Field id="b-ip" label="IPv4 address"><input id="b-ip" className={input} value={ip} onChange={(e) => setIp(e.target.value)} spellCheck={false} /></Field>
        <Field id="b-cidr" label="Prefix length"><input id="b-cidr" className={input} value={cidr} onChange={(e) => setCidr(e.target.value)} inputMode="numeric" /></Field>
      </div>
      <Message>{(!octets || !cidrOk) && 'Enter a valid IPv4 address and a prefix from 0 to 32.'}</Message>
      {octets && cidrOk && (
        <div className="mt-3 space-y-1.5 rounded-lg border border-line bg-bg p-3">
          <BitRow label="Address" octets={octets} network={c} />
          <BitRow label="Mask" octets={ipv4Octets(cidrToMask(c)!)!} network={c} />
          <p className="pt-1 text-xs text-muted">Green bits are the network part, grey bits identify the host. Decimal: {octets.map((o) => parseInt(o, 2)).join('.')}</p>
        </div>
      )}
    </div>
  );
}

/* -------------------------------------------------------------------- IPv6 */

export function Ipv6Calculator() {
  const [text, setText] = useState('2001:0db8:0000:0000:0000:0000:0000:0001/48');
  const [splitLen, setSplitLen] = useState('64');
  const info = useMemo(() => calcIPv6(text), [text]);
  const bare = text.split('/')[0];
  const parsed = parseIPv6(bare);
  const split = info && splitLen !== '' ? splitIPv6(`${info.network}/${info.prefix}`, Number(splitLen), 16) : null;
  return (
    <div className={card}>
      <Field id="v6" label="IPv6 address, with an optional /prefix" hint="Try 2001:db8::1/64, fe80::1, ::1 or fd12:3456::/48.">
        <input id="v6" className={input} value={text} onChange={(e) => setText(e.target.value)} spellCheck={false} autoComplete="off" />
      </Field>
      <Message>{!info && 'That is not a valid IPv6 address. Check for more than one "::", groups longer than 4 hex digits, or a prefix above 128.'}</Message>
      {info && parsed !== null && (
        <>
          <Results rows={[
            ['Shortest form', info.address],
            ['Full form', info.expanded],
            ['Prefix', `/${info.prefix}`],
            ['Network', `${info.network}/${info.prefix}`],
            ['Last address', info.last],
            ['Addresses', info.addresses.toLocaleString('en-US')],
            ['/64 subnets inside', info.subnets64 === 0n ? 'none: the prefix is longer than /64' : info.subnets64.toLocaleString('en-US')],
            ['Type', info.kind],
          ]} />
          <div className="mt-3"><CopyButton text={info.address} label="Copy shortest form" /></div>
          <Steps title="Text rules used" steps={[
            'Write each 16-bit group without leading zeros (RFC 5952, section 4.1).',
            'Replace the longest run of all-zero groups with "::". If two runs tie, shorten the first. Never use "::" for a single zero group (section 4.2).',
            'Use lowercase hexadecimal letters (section 4.3).',
            'A /64 is the standard size of one IPv6 subnet: unicast addresses (except those starting with binary 000) use a 64-bit interface identifier (RFC 4291, section 2.5.1).',
          ]} />
          <div className="mt-5 border-t border-line pt-4">
            <div className="flex flex-wrap items-end gap-3">
              <div className="w-32"><Field id="v6-split" label="Split into /"><input id="v6-split" className={input} inputMode="numeric" value={splitLen} onChange={(e) => setSplitLen(e.target.value)} /></Field></div>
              {split && <p className="text-sm text-muted">{split.total.toLocaleString('en-US')} subnets{split.total > 16n ? ', first 16 shown' : ''}</p>}
            </div>
            {split ? <ul className="mt-2 max-h-56 overflow-auto font-mono text-sm">{split.list.map((s) => <li key={s}>{s}</li>)}</ul> : <p className="mt-2 text-xs text-muted">Enter a prefix length between {info.prefix} and {Math.min(128, info.prefix + 64)}.</p>}
          </div>
        </>
      )}
    </div>
  );
}

/* --------------------------------------------------------------- bandwidth */

export function BandwidthCalculator() {
  const [size, setSize] = useState('4.7');
  const [sizeUnit, setSizeUnit] = useState<keyof typeof SIZE_UNITS>('GB');
  const [rate, setRate] = useState('100');
  const [rateUnit, setRateUnit] = useState<keyof typeof RATE_UNITS>('Mbps');
  const [eff, setEff] = useState('90');
  const [period, setPeriod] = useState('3600');
  const s = Number(size), r = Number(rate), e = Number(eff), p = Number(period);
  const okT = s > 0 && r > 0 && e > 0 && e <= 100;
  const secs = okT ? transferSeconds(s, sizeUnit, r, rateUnit, e) : NaN;
  const bytes = r > 0 && p > 0 && e > 0 && e <= 100 ? bytesInTime(r, rateUnit, p, e) : NaN;
  const sel = 'rounded-md border border-line bg-bg px-2 py-2 text-sm text-fg';
  return (
    <div className={card}>
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <span className="block text-sm font-medium">File size</span>
          <div className="mt-1 flex gap-2"><input aria-label="File size" className={input} value={size} onChange={(e) => setSize(e.target.value)} inputMode="decimal" />
            <select aria-label="Size unit" className={sel} value={sizeUnit} onChange={(e) => setSizeUnit(e.target.value as keyof typeof SIZE_UNITS)}>{Object.keys(SIZE_UNITS).map((u) => <option key={u}>{u}</option>)}</select></div>
        </div>
        <div>
          <span className="block text-sm font-medium">Link speed</span>
          <div className="mt-1 flex gap-2"><input aria-label="Link speed" className={input} value={rate} onChange={(e) => setRate(e.target.value)} inputMode="decimal" />
            <select aria-label="Speed unit" className={sel} value={rateUnit} onChange={(e) => setRateUnit(e.target.value as keyof typeof RATE_UNITS)}>{Object.keys(RATE_UNITS).map((u) => <option key={u}>{u}</option>)}</select></div>
        </div>
        <Field id="bw-eff" label="Usable share of the line rate (%)" hint="Headers and sharing mean you rarely get 100%."><input id="bw-eff" className={input} value={eff} onChange={(e) => setEff(e.target.value)} inputMode="decimal" /></Field>
      </div>
      <Message>{!okT && 'Enter positive numbers, with the usable share between 1 and 100.'}</Message>
      {okT && <Results rows={[['Transfer time', humanDuration(secs)], ['Effective speed', `${((r * RATE_UNITS[rateUnit] * e) / 100 / 1e6).toLocaleString(undefined, { maximumFractionDigits: 2 })} Mbps`], ['In bytes per second', `${((r * RATE_UNITS[rateUnit] * e) / 100 / 8 / 1e6).toLocaleString(undefined, { maximumFractionDigits: 2 })} MB/s`]]} />}

      <h2 className="mt-8 text-lg font-semibold">How much data fits in a period?</h2>
      <div className="mt-3 max-w-xs"><Field id="bw-p" label="Period in seconds" hint="3600 is one hour, 86400 is a day."><input id="bw-p" className={input} value={period} onChange={(e) => setPeriod(e.target.value)} inputMode="numeric" /></Field></div>
      {Number.isFinite(bytes) && <Results rows={[['Data moved', `${(bytes / 1e9).toLocaleString(undefined, { maximumFractionDigits: 2 })} GB (${(bytes / 2 ** 30).toLocaleString(undefined, { maximumFractionDigits: 2 })} GiB)`]]} />}
      <Steps title="How the units work" steps={[
        'Link speeds use decimal (SI) prefixes: 1 Mbps is 1,000,000 bits per second. File sizes on disk are often shown in binary units: 1 MiB is 1,048,576 bytes (NIST, IEC binary prefixes).',
        'A byte is 8 bits, so divide the speed in megabits by 8 to get megabytes per second.',
        'Time = size in bits divided by the usable speed in bits per second.',
      ]} />
      <button type="button" className={`${btn} mt-2`} onClick={() => { setSize('4.7'); setSizeUnit('GB'); setRate('100'); setRateUnit('Mbps'); setEff('90'); setPeriod('3600'); }}>Reset example</button>
    </div>
  );
}
