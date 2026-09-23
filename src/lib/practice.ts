import { calcSubnet, formatIPv4, parseIPv4 } from './subnet';
import { compressIPv6, cidrToMask, expandIPv6, maskToCidr, prefixForHosts } from './netcalc';

export type Topic = 'subnetting' | 'masks' | 'vlsm' | 'ipv6' | 'routing';
export type Rng = () => number;

export interface PQuestion {
  topic: Topic;
  prompt: string;
  options: string[];
  answer: string;
  why: string;
}

export const TOPICS: { id: Topic; name: string; blurb: string }[] = [
  { id: 'subnetting', name: 'Subnetting', blurb: 'Network and broadcast addresses and usable hosts.' },
  { id: 'masks', name: 'Masks', blurb: 'Convert between prefix lengths and dotted masks.' },
  { id: 'vlsm', name: 'VLSM', blurb: 'Pick the smallest prefix that fits a number of hosts.' },
  { id: 'ipv6', name: 'IPv6', blurb: 'Address types and the compression rules.' },
  { id: 'routing', name: 'Routing', blurb: 'Longest prefix match and administrative distance.' },
];

/** Small deterministic generator, for the daily challenge. */
export function seeded(seed: number): Rng {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
export const seedFromDay = (day: string) => [...day].reduce((h, c) => (Math.imul(h, 31) + c.charCodeAt(0)) >>> 0, 7);

const int = (r: Rng, lo: number, hi: number) => lo + Math.floor(r() * (hi - lo + 1));
const pick = <T,>(r: Rng, xs: T[]) => xs[Math.floor(r() * xs.length)];
function shuffle<T>(r: Rng, xs: T[]): T[] {
  const a = [...xs];
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}
/** Correct answer plus distractors, deduplicated, shuffled. */
function options(r: Rng, answer: string, distractors: string[]): string[] {
  const set = [...new Set(distractors.filter((d) => d !== answer))].slice(0, 3);
  return shuffle(r, [answer, ...set]);
}

const randomHost = (r: Rng) => {
  const base = pick(r, [[10], [172, int(r, 16, 31)], [192, 168]]);
  const oct = [...base];
  while (oct.length < 4) oct.push(int(r, 0, 255));
  return oct;
};

function subnetting(r: Rng): PQuestion {
  const cidr = int(r, 25, 29);
  const ip = randomHost(r).join('.');
  const info = calcSubnet(`${ip}/${cidr}`)!;
  const size = 2 ** (32 - cidr);
  const kind = pick(r, ['network', 'broadcast', 'hosts'] as const);
  const step = (ipStr: string, d: number) => formatIPv4(((parseIPv4(ipStr)! + d) >>> 0));
  if (kind === 'network') {
    return { topic: 'subnetting', prompt: `What is the network address of ${ip}/${cidr}?`, answer: info.network,
      options: options(r, info.network, [step(info.network, size), step(info.network, -size), ip === info.network ? step(ip, 1) : ip, info.broadcast]),
      why: `Blocks are ${size} wide. ${ip} sits in the block starting at ${info.network}.` };
  }
  if (kind === 'broadcast') {
    return { topic: 'subnetting', prompt: `What is the broadcast address of ${ip}/${cidr}?`, answer: info.broadcast,
      options: options(r, info.broadcast, [step(info.broadcast, size), step(info.broadcast, -size), step(info.broadcast, 1), info.network]),
      why: `The block is ${info.network} to ${info.broadcast}; the last address is the broadcast.` };
  }
  const answer = String(info.usableHosts);
  return { topic: 'subnetting', prompt: `How many usable host addresses are in ${ip}/${cidr}?`, answer,
    options: options(r, answer, [String(size), String(size - 1), String(size - 4), String(size * 2 - 2)]),
    why: `2^${32 - cidr} = ${size} addresses, minus the network and broadcast addresses = ${info.usableHosts}.` };
}

function masks(r: Rng): PQuestion {
  const cidr = int(r, 8, 30);
  const mask = cidrToMask(cidr)!;
  const near = (c: number) => cidrToMask(Math.min(32, Math.max(1, c)))!;
  if (r() < 0.5) {
    return { topic: 'masks', prompt: `What is /${cidr} written as a dotted mask?`, answer: mask,
      options: options(r, mask, [near(cidr + 1), near(cidr - 1), near(cidr + 2), near(cidr - 2)]),
      why: `/${cidr} means ${cidr} one-bits followed by ${32 - cidr} zero-bits, which is ${mask}.` };
  }
  const answer = `/${cidr}`;
  return { topic: 'masks', prompt: `What prefix length is the mask ${mask}?`, answer,
    options: options(r, answer, [`/${cidr + 1}`, `/${cidr - 1}`, `/${cidr + 2}`, `/${cidr - 2}`]),
    why: `${mask} has ${maskToCidr(mask)} one-bits.` };
}

function vlsm(r: Rng): PQuestion {
  const hosts = pick(r, [2, 5, 10, 12, 25, 30, 45, 60, 90, 120, 200, 250, 500]);
  const c = prefixForHosts(hosts);
  const usable = 2 ** (32 - c) - 2;
  return { topic: 'vlsm', prompt: `A subnet must hold ${hosts} hosts. What is the smallest prefix that fits?`, answer: `/${c}`,
    options: options(r, `/${c}`, [`/${c + 1}`, `/${c - 1}`, `/${c - 2}`, `/${c + 2}`]),
    why: `/${c} has ${usable} usable addresses, enough for ${hosts}. The next longer prefix has only ${2 ** (32 - c - 1) - 2}.` };
}

const IPV6_FACTS: { prompt: string; answer: string; wrong: string[]; why: string }[] = [
  { prompt: 'Which prefix is reserved for IPv6 link-local addresses?', answer: 'fe80::/10', wrong: ['fc00::/7', 'ff00::/8', '2001:db8::/32'], why: 'fe80::/10 is link-local (RFC 4291).' },
  { prompt: 'Which prefix is used for unique local addresses (the private range of IPv6)?', answer: 'fc00::/7', wrong: ['fe80::/10', 'ff00::/8', '::1/128'], why: 'fc00::/7 is the unique local range (RFC 4193); in practice fd00::/8 is used.' },
  { prompt: 'Which prefix is reserved for documentation examples?', answer: '2001:db8::/32', wrong: ['fe80::/10', 'fc00::/7', '2000::/3'], why: '2001:db8::/32 is set aside for documentation (RFC 3849).' },
  { prompt: 'Which prefix is IPv6 multicast?', answer: 'ff00::/8', wrong: ['fe80::/10', 'fc00::/7', '2001:db8::/32'], why: 'Multicast addresses begin with ff (RFC 4291).' },
  { prompt: 'What is the IPv6 loopback address?', answer: '::1', wrong: ['::', 'fe80::1', 'ff02::1'], why: '::1 is the loopback address; :: is the unspecified address (RFC 4291).' },
  { prompt: 'How many bits are in an IPv6 address?', answer: '128', wrong: ['32', '64', '256'], why: 'IPv6 addresses are 128 bits long.' },
  { prompt: 'A standard IPv6 LAN subnet uses which prefix length?', answer: '/64', wrong: ['/48', '/56', '/128'], why: 'Subnets use /64 so the interface identifier gets 64 bits (RFC 4291 and RFC 5375 style practice).' },
];

function ipv6(r: Rng): PQuestion {
  if (r() < 0.5) {
    const f = pick(r, IPV6_FACTS);
    return { topic: 'ipv6', prompt: f.prompt, answer: f.answer, options: options(r, f.answer, f.wrong), why: f.why };
  }
  // compression: build an address with a run of zero groups, then ask for the shortest form
  const g = [0x2001, 0x0db8, int(r, 0, 0xffff), 0, 0, 0, int(r, 1, 0xffff), int(r, 1, 0xffff)];
  const n = g.reduce((acc, x) => (acc << 16n) | BigInt(x), 0n);
  const full = expandIPv6(n);
  const answer = compressIPv6(n);
  const hex = (x: number) => x.toString(16);
  const noCompress = g.map(hex).join(':');
  const lastTwo = `${hex(g[0])}:${hex(g[1])}:${hex(g[2])}::${hex(g[6])}`;
  const wrongDouble = `${hex(g[0])}::${hex(g[2])}::${hex(g[6])}:${hex(g[7])}`;
  return { topic: 'ipv6', prompt: `What is the correct shortest form of ${full}?`, answer,
    options: options(r, answer, [noCompress, lastTwo, wrongDouble]),
    why: `Drop leading zeros in each group and replace the longest run of zero groups with :: once (RFC 5952).` };
}

// Default administrative distances. Checked on RouterOS 7.16 (connected 0, static 1, eBGP 20, OSPF 110, IS-IS 115, RIP 120, iBGP 200);
// they are also Cisco's values for these protocols.
const AD: [string, number][] = [['Connected', 0], ['Static', 1], ['eBGP', 20], ['OSPF', 110], ['IS-IS', 115], ['RIP', 120], ['iBGP', 200]];

function routing(r: Rng): PQuestion {
  if (r() < 0.5) {
    const [a, b] = shuffle(r, AD).slice(0, 2);
    const win = a[1] < b[1] ? a : b;
    return { topic: 'routing', prompt: `A router learns the same prefix from ${a[0]} and from ${b[0]}. Which route is installed (using default administrative distances)?`, answer: win[0],
      options: shuffle(r, [a[0], b[0]]), why: `A lower administrative distance is preferred: ${a[0]} = ${a[1]}, ${b[0]} = ${b[1]}.` };
  }
  const third = int(r, 0, 250);
  const dest = `10.1.${third}.${int(r, 1, 254)}`;
  const specific = `10.1.${third}.0/24`;
  const routes = [
    { p: '0.0.0.0/0', hop: 'ISP-A' },
    { p: '10.0.0.0/8', hop: 'ISP-B' },
    { p: '10.1.0.0/16', hop: 'ISP-C' },
    { p: specific, hop: 'ISP-D' },
  ];
  const drop = pick(r, [0, 1]); // sometimes remove the most specific to vary the answer
  const table = drop === 1 ? routes.slice(0, 3) : routes;
  const answer = table[table.length - 1].hop;
  const shown = shuffle(r, table);
  return { topic: 'routing', prompt: `Routes: ${shown.map((x) => `${x.p} via ${x.hop}`).join('; ')}. Where does a packet to ${dest} go?`, answer,
    options: shuffle(r, ['ISP-A', 'ISP-B', 'ISP-C', 'ISP-D'].filter((h) => table.some((x) => x.hop === h)).concat(table.length === 3 ? ['ISP-D'] : [])).slice(0, 4),
    why: `The longest matching prefix wins: ${table[table.length - 1].p} is the most specific route that contains ${dest}.` };
}

const GEN: Record<Topic, (r: Rng) => PQuestion> = { subnetting, masks, vlsm, ipv6, routing };

export function makeQuestion(topic: Topic | 'mixed', r: Rng = Math.random): PQuestion {
  const t = topic === 'mixed' ? pick(r, TOPICS).id : topic;
  return GEN[t](r);
}

export const dailyChallenge = (day: string, count = 5): PQuestion[] => {
  const r = seeded(seedFromDay(day));
  return Array.from({ length: count }, () => makeQuestion('mixed', r));
};
