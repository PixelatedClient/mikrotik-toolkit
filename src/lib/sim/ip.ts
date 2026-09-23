import { formatIPv4, parseIPv4 } from '../subnet';

export { formatIPv4, parseIPv4 };

export interface Cidr {
  ip: number;
  cidr: number;
  /** Network address as a number. */
  net: number;
  mask: number;
}

export const maskOf = (cidr: number): number => (cidr === 0 ? 0 : (0xffffffff << (32 - cidr)) >>> 0);

/** "10.0.0.1/24" or a bare "10.0.0.1" (treated as /32, like RouterOS). Returns null for anything invalid. */
export function parseCidr(text: string): Cidr | null {
  const m = /^(\d{1,3}(?:\.\d{1,3}){3})(?:\/(\d{1,2}))?$/.exec(text.trim());
  if (!m) return null;
  const ip = parseIPv4(m[1]);
  const cidr = m[2] === undefined ? 32 : Number(m[2]);
  if (ip === null || cidr < 0 || cidr > 32) return null;
  const mask = maskOf(cidr);
  return { ip, cidr, net: (ip & mask) >>> 0, mask };
}

export const inNet = (ip: number, c: { net: number; mask: number }): boolean => ((ip & c.mask) >>> 0) === c.net;

/** "a.b.c.d/nn" for the network of a parsed prefix. */
export const netText = (c: Cidr): string => `${formatIPv4(c.net)}/${c.cidr}`;

/** RouterOS prints durations as 1ms305us, 555us, 29us, 2ms50us. */
export function fmtTime(us: number): string {
  if (us < 1000) return `${us}us`;
  const ms = Math.floor(us / 1000);
  const rest = us % 1000;
  return rest === 0 ? `${ms}ms` : `${ms}ms${rest}us`;
}

/** Deterministic pseudo-random numbers so the same lab behaves the same way every time (and tests stay stable). */
export function rng(seed: number): () => number {
  let s = seed >>> 0 || 1;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 0x100000000;
  };
}
