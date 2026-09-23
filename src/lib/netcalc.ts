import { calcSubnet, formatIPv4, parseIPv4 } from './subnet';

/* ------------------------------------------------------------------ masks */

/** Prefix length for a dotted mask, or null if the mask is not a run of 1s followed by 0s. */
export function maskToCidr(mask: string): number | null {
  const n = parseIPv4(mask);
  if (n === null) return null;
  let cidr = 0;
  let seenZero = false;
  for (let i = 31; i >= 0; i--) {
    const bit = Math.floor(n / 2 ** i) % 2;
    if (bit === 1) {
      if (seenZero) return null;
      cidr++;
    } else seenZero = true;
  }
  return cidr;
}

export function cidrToMask(cidr: number): string | null {
  if (!Number.isInteger(cidr) || cidr < 0 || cidr > 32) return null;
  return formatIPv4(cidr === 0 ? 0 : (0xffffffff << (32 - cidr)) >>> 0);
}

/** Wildcard (inverse) mask for a prefix length. */
export const wildcardOf = (cidr: number) => (cidrToMask(cidr) === null ? null : formatIPv4(~parseIPv4(cidrToMask(cidr)!)! >>> 0));

/* ------------------------------------------------------- explained working */

export interface Working {
  steps: string[];
}

const octetName = ['first', 'second', 'third', 'fourth'];

/** Step-by-step working for a subnet calculation, using the block-size method. */
export function explainSubnet(input: string): Working | null {
  const info = calcSubnet(input);
  if (!info) return null;
  const { cidr } = info;
  const ip = info.address.split('.').map(Number);
  const steps: string[] = [];
  steps.push(`/${cidr} means the first ${cidr} bits are the network part and the last ${32 - cidr} bits identify hosts. The mask is ${info.mask}.`);

  if (cidr % 8 === 0) {
    const kept = cidr / 8;
    steps.push(
      kept === 0
        ? 'The prefix is /0, so no bits are fixed: the network is 0.0.0.0 and it spans every address.'
        : `The prefix ends exactly on an octet boundary. Keep the first ${kept} octet${kept > 1 ? 's' : ''} of the address (${ip.slice(0, kept).join('.')}), set the remaining octets to 0 for the network address, and to 255 for the broadcast address.`,
    );
  } else {
    const k = Math.floor(cidr / 8);
    const maskOctet = Number(info.mask.split('.')[k]);
    const block = 256 - maskOctet;
    const value = ip[k];
    const start = Math.floor(value / block) * block;
    const starts = Array.from({ length: Math.min(256 / block, 6) }, (_, i) => i * block);
    steps.push(`The ${octetName[k]} octet is split between network and host bits. Its mask octet is ${maskOctet}.`);
    steps.push(`Block size = 256 - ${maskOctet} = ${block}. Subnets in this octet start at ${starts.join(', ')}${256 / block > 6 ? ', ...' : ''}.`);
    steps.push(`The ${octetName[k]} octet of the address is ${value}, which falls in the block ${start} to ${start + block - 1}. So the network address has ${start} there.`);
    steps.push(`The broadcast address is the last address of the block: ${start + block - 1} in that octet, with all later octets set to 255.`);
  }
  steps.push(`Network ${info.network}, broadcast ${info.broadcast}.`);
  if (cidr === 32) steps.push('A /32 is a single host: there is one address, and it is both the network and the host.');
  else if (cidr === 31)
    steps.push(`A /31 has 2 addresses. RFC 3021 lets both be used as hosts on a point-to-point link, so the range is ${info.firstHost} to ${info.lastHost}.`);
  else
    steps.push(
      `Usable hosts: 2^${32 - cidr} = ${info.totalAddresses.toLocaleString()} addresses, minus the network and broadcast addresses = ${info.usableHosts.toLocaleString()}, from ${info.firstHost} to ${info.lastHost}.`,
    );
  return { steps };
}

/* ------------------------------------------------------------ range → CIDR */

/** Smallest list of CIDR blocks that covers exactly start..end (inclusive). */
export function rangeToCidrs(start: string, end: string): string[] | null {
  const s = parseIPv4(start);
  const e = parseIPv4(end);
  if (s === null || e === null || s > e) return null;
  const out: string[] = [];
  let cur = s;
  while (cur <= e) {
    // largest block that is aligned at `cur` ...
    let size = cur === 0 ? 2 ** 32 : cur & -cur;
    if (size < 0) size += 2 ** 32;
    // ... and still fits before `e`
    while (size > e - cur + 1) size /= 2;
    out.push(`${formatIPv4(cur)}/${32 - Math.log2(size)}`);
    cur += size;
  }
  return out;
}

/* ----------------------------------------------------- route summarization */

export interface Summary {
  /** The single smallest prefix that covers every input. */
  summary: string;
  summaryAddresses: number;
  inputAddresses: number;
  /** True when the single summary covers nothing except the inputs. */
  exact: boolean;
  /** Fewest prefixes that cover exactly the inputs and nothing else. */
  minimal: string[];
  /** Addresses inside the summary that are not in any input. */
  extra: number;
}

export function summarize(prefixes: string[]): Summary | null {
  const ranges: [number, number][] = [];
  for (const p of prefixes) {
    const info = calcSubnet(p);
    if (!info) return null;
    ranges.push([parseIPv4(info.network)!, parseIPv4(info.broadcast)!]);
  }
  if (ranges.length === 0) return null;
  ranges.sort((a, b) => a[0] - b[0]);
  const merged: [number, number][] = [];
  for (const r of ranges) {
    const last = merged[merged.length - 1];
    if (last && r[0] <= last[1] + 1) last[1] = Math.max(last[1], r[1]);
    else merged.push([r[0], r[1]]);
  }
  const minimal = merged.flatMap(([s, e]) => rangeToCidrs(formatIPv4(s), formatIPv4(e))!);
  const lo = merged[0][0];
  const hi = merged[merged.length - 1][1];
  let cidr = 32;
  for (; cidr > 0; cidr--) {
    const size = 2 ** (32 - cidr);
    const net = Math.floor(lo / size) * size;
    if (net + size - 1 >= hi) break;
  }
  const size = 2 ** (32 - cidr);
  const net = Math.floor(lo / size) * size;
  const inputAddresses = merged.reduce((n, [s, e]) => n + (e - s + 1), 0);
  return { summary: `${formatIPv4(net)}/${cidr}`, summaryAddresses: size, inputAddresses, exact: size === inputAddresses, minimal, extra: size - inputAddresses };
}

/* -------------------------------------------------------------------- VLSM */

export interface VlsmRow {
  name: string;
  hosts: number;
  cidr: number;
  size: number;
  subnet: string;
  mask: string;
  first: string;
  last: string;
  broadcast: string;
  /** Usable addresses left over after the required hosts. */
  spare: number;
}

export type VlsmResult = { ok: true; rows: VlsmRow[]; free: string[]; freeAddresses: number; steps: string[] } | { ok: false; error: string };

export const prefixForHosts = (hosts: number) => {
  let cidr = 30;
  while (cidr > 0 && 2 ** (32 - cidr) - 2 < hosts) cidr--;
  return cidr;
};

export function vlsmPlan(parent: string, needs: { name: string; hosts: number }[]): VlsmResult {
  const p = calcSubnet(parent);
  if (!p) return { ok: false, error: 'Enter the parent network like 192.168.10.0/24.' };
  if (p.address !== p.network) return { ok: false, error: `The parent must be a network address: ${p.network}/${p.cidr}.` };
  if (needs.length === 0) return { ok: false, error: 'Add at least one subnet requirement.' };
  for (const n of needs) if (!Number.isInteger(n.hosts) || n.hosts < 1) return { ok: false, error: `"${n.name}" needs a whole number of hosts, at least 1.` };

  const end = parseIPv4(p.broadcast)!;
  let cursor = parseIPv4(p.network)!;
  const rows: VlsmRow[] = [];
  const steps = [
    'Sort the requirements from the largest to the smallest. Big blocks first keeps every block aligned on its own size boundary, so nothing is wasted between them.',
  ];
  for (const n of [...needs].sort((a, b) => b.hosts - a.hosts)) {
    const cidr = prefixForHosts(n.hosts);
    const size = 2 ** (32 - cidr);
    cursor = Math.ceil(cursor / size) * size;
    if (cursor + size - 1 > end) return { ok: false, error: `Out of space: "${n.name}" needs a /${cidr} (${size} addresses) and ${p.network}/${p.cidr} has no room left.` };
    const info = calcSubnet(`${formatIPv4(cursor)}/${cidr}`)!;
    rows.push({
      name: n.name, hosts: n.hosts, cidr, size, subnet: `${info.network}/${cidr}`, mask: info.mask, first: info.firstHost, last: info.lastHost,
      broadcast: info.broadcast, spare: info.usableHosts - n.hosts,
    });
    steps.push(`${n.name}: ${n.hosts} hosts need ${n.hosts} + 2 = ${n.hosts + 2} addresses, so the next power of two is ${size}, a /${cidr}. Allocated ${info.network}/${cidr}.`);
    cursor += size;
  }
  const free = cursor <= end ? rangeToCidrs(formatIPv4(cursor), formatIPv4(end))! : [];
  return { ok: true, rows, free, freeAddresses: cursor <= end ? end - cursor + 1 : 0, steps };
}

/* ------------------------------------------------------------ number bases */

export type Base = 2 | 8 | 10 | 16;

const DIGITS: Record<Base, RegExp> = { 2: /^[01]+$/, 8: /^[0-7]+$/, 10: /^\d+$/, 16: /^[0-9a-f]+$/i };

export function convertNumber(input: string, base: Base): { dec: string; bin: string; oct: string; hex: string } | null {
  let s = input.trim().replace(/[\s_]/g, '');
  if (base === 16) s = s.replace(/^0x/i, '');
  if (base === 2) s = s.replace(/^0b/i, '');
  if (s === '' || !DIGITS[base].test(s) || s.length > 40) return null;
  const n = BigInt(base === 10 ? s : base === 16 ? `0x${s}` : base === 2 ? `0b${s}` : `0o${s}`);
  return { dec: n.toString(10), bin: n.toString(2), oct: n.toString(8), hex: n.toString(16).toUpperCase() };
}

/** Four 8-bit strings for a dotted IPv4 address. */
export const ipv4Octets = (ip: string): string[] | null => {
  const n = parseIPv4(ip);
  return n === null ? null : formatIPv4(n).split('.').map((o) => Number(o).toString(2).padStart(8, '0'));
};

/* -------------------------------------------------------------------- IPv6 */

export function parseIPv6(input: string): bigint | null {
  let s = input.trim();
  if (s === '' || /[^0-9a-fA-F:.]/.test(s)) return null;
  // trailing dotted IPv4 becomes two groups
  const v4 = s.match(/(\d+\.\d+\.\d+\.\d+)$/);
  if (v4) {
    const n = parseIPv4(v4[1]);
    if (n === null) return null;
    s = s.slice(0, s.length - v4[1].length) + `${Math.floor(n / 65536).toString(16)}:${(n % 65536).toString(16)}`;
  } else if (s.includes('.')) return null;
  const halves = s.split('::');
  if (halves.length > 2) return null;
  const toGroups = (h: string) => (h === '' ? [] : h.split(':'));
  const head = toGroups(halves[0]);
  const tail = halves.length === 2 ? toGroups(halves[1]) : [];
  const groups = halves.length === 2 ? [...head, ...Array(8 - head.length - tail.length).fill('0'), ...tail] : head;
  if (halves.length === 2 && head.length + tail.length > 7) return null;
  if (groups.length !== 8) return null;
  let n = 0n;
  for (const g of groups) {
    if (!/^[0-9a-fA-F]{1,4}$/.test(g)) return null;
    n = (n << 16n) | BigInt(parseInt(g, 16));
  }
  return n;
}

const groupsOf = (n: bigint) => Array.from({ length: 8 }, (_, i) => Number((n >> BigInt((7 - i) * 16)) & 0xffffn));

/** All eight groups, four digits each. */
export const expandIPv6 = (n: bigint) => groupsOf(n).map((g) => g.toString(16).padStart(4, '0')).join(':');

/** RFC 5952 canonical text: no leading zeros, lowercase, longest run of zero groups (first if tied) shortened, never a single group. */
export function compressIPv6(n: bigint): string {
  const g = groupsOf(n);
  let bestStart = -1, bestLen = 0;
  for (let i = 0; i < 8; ) {
    if (g[i] !== 0) { i++; continue; }
    let j = i;
    while (j < 8 && g[j] === 0) j++;
    if (j - i > bestLen) { bestStart = i; bestLen = j - i; }
    i = j;
  }
  const hex = g.map((x) => x.toString(16));
  if (bestLen < 2) return hex.join(':');
  const left = hex.slice(0, bestStart).join(':');
  const right = hex.slice(bestStart + bestLen).join(':');
  return `${left}::${right}`;
}

export interface V6Info {
  prefix: number;
  address: string;
  expanded: string;
  network: string;
  first: string;
  last: string;
  addresses: bigint;
  /** How many /64 subnets fit (0 when the prefix is longer than /64). */
  subnets64: bigint;
  kind: string;
}

const inPrefix = (n: bigint, base: bigint, len: number) => n >> BigInt(128 - len) === base >> BigInt(128 - len);
const v6 = (s: string) => parseIPv6(s)!;

export function classifyIPv6(n: bigint): string {
  if (n === 0n) return 'Unspecified address (::)';
  if (n === 1n) return 'Loopback address (::1)';
  if (inPrefix(n, v6('ff00::'), 8)) return 'Multicast (ff00::/8)';
  if (inPrefix(n, v6('fe80::'), 10)) return 'Link-local unicast (fe80::/10)';
  if (inPrefix(n, v6('fc00::'), 7)) return inPrefix(n, v6('fd00::'), 8) ? 'Unique local, locally assigned (fd00::/8, part of fc00::/7)' : 'Unique local (fc00::/7)';
  if (inPrefix(n, v6('2001:db8::'), 32)) return 'Documentation prefix (2001:db8::/32)';
  return 'Not one of the special-purpose ranges this tool recognises';
}

/** Accepts "address/length" (length defaults to 128). */
export function calcIPv6(input: string): V6Info | null {
  const [a, l] = input.trim().split('/');
  if (a === undefined || (input.includes('/') && !/^\d{1,3}$/.test(l ?? ''))) return null;
  const prefix = l === undefined ? 128 : Number(l);
  const n = parseIPv6(a);
  if (n === null || prefix < 0 || prefix > 128) return null;
  const host = (1n << BigInt(128 - prefix)) - 1n;
  const network = n & ~host;
  const last = network | host;
  return {
    prefix, address: compressIPv6(n), expanded: expandIPv6(n), network: compressIPv6(network), first: compressIPv6(network), last: compressIPv6(last),
    addresses: host + 1n, subnets64: prefix <= 64 ? 1n << BigInt(64 - prefix) : 0n, kind: classifyIPv6(n),
  };
}

/** Split a prefix into longer prefixes, at most `limit` of them. */
export function splitIPv6(input: string, newLen: number, limit = 64): { list: string[]; total: bigint } | null {
  const info = calcIPv6(input);
  if (!info || newLen < info.prefix || newLen > 128 || newLen - info.prefix > 64) return null;
  const total = 1n << BigInt(newLen - info.prefix);
  const step = 1n << BigInt(128 - newLen);
  const base = parseIPv6(info.network)!;
  const count = total < BigInt(limit) ? Number(total) : limit;
  return { list: Array.from({ length: count }, (_, i) => `${compressIPv6(base + step * BigInt(i))}/${newLen}`), total };
}

/* --------------------------------------------------------------- bandwidth */

/** Decimal (SI) units, as used for link speeds. */
export const RATE_UNITS = { bps: 1, Kbps: 1e3, Mbps: 1e6, Gbps: 1e9, Tbps: 1e12 } as const;
/** File sizes in bytes: SI (kB, MB, GB, TB) and IEC binary (KiB, MiB, GiB, TiB). */
export const SIZE_UNITS = { B: 1, kB: 1e3, MB: 1e6, GB: 1e9, TB: 1e12, KiB: 1024, MiB: 2 ** 20, GiB: 2 ** 30, TiB: 2 ** 40 } as const;

export function humanDuration(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return 'n/a';
  if (seconds < 1) return `${(seconds * 1000).toFixed(seconds < 0.01 ? 2 : 0)} ms`;
  if (seconds < 60) return `${seconds.toFixed(seconds < 10 ? 2 : 1)} s`;
  const d = Math.floor(seconds / 86400), h = Math.floor((seconds % 86400) / 3600), m = Math.floor((seconds % 3600) / 60), s = Math.round(seconds % 60);
  return [d && `${d} d`, h && `${h} h`, m && `${m} min`, !d && s && `${s} s`].filter(Boolean).join(' ');
}

/** Time to move `size` over a link, when only `efficiency` percent of the line rate is usable (headers, congestion). */
export function transferSeconds(size: number, sizeUnit: keyof typeof SIZE_UNITS, rate: number, rateUnit: keyof typeof RATE_UNITS, efficiency = 100): number {
  const bits = size * SIZE_UNITS[sizeUnit] * 8;
  const bps = rate * RATE_UNITS[rateUnit] * (efficiency / 100);
  return bps > 0 ? bits / bps : Infinity;
}

/** Bytes moved in `seconds` at a given rate. */
export const bytesInTime = (rate: number, rateUnit: keyof typeof RATE_UNITS, seconds: number, efficiency = 100) =>
  (rate * RATE_UNITS[rateUnit] * (efficiency / 100) * seconds) / 8;
