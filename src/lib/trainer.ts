import { calcSubnet, formatIPv4, parseIPv4 } from './subnet';

export type Level = 1 | 2 | 3;
export type Rng = () => number;

export interface Question {
  kind: string;
  prompt: string;
  answer: string;
  /** Worked solution shown after answering. */
  working: string;
}

const int = (rng: Rng, lo: number, hi: number) => lo + Math.floor(rng() * (hi - lo + 1));
const pick = <T,>(rng: Rng, xs: T[]) => xs[Math.floor(rng() * xs.length)];

function randomAddress(rng: Rng): string {
  const first = pick(rng, [10, 172, 192, 100, 203]);
  const second = first === 172 ? int(rng, 16, 31) : first === 192 ? 168 : int(rng, 0, 255);
  return `${first}.${second}.${int(rng, 0, 255)}.${int(rng, 1, 254)}`;
}

/** Explains the block-size trick for the octet where the prefix ends. */
function blockWorking(addr: string, cidr: number): string {
  const info = calcSubnet(`${addr}/${cidr}`)!;
  if (cidr % 8 === 0) return `A /${cidr} ends exactly on an octet boundary, so the network keeps the first ${cidr / 8} octet(s) and zeroes the rest: ${info.network}.`;
  const octet = Math.floor(cidr / 8); // 0-based octet that is split
  const maskOctet = Number(info.mask.split('.')[octet]);
  const block = 256 - maskOctet;
  const value = Number(addr.split('.')[octet]);
  const start = Math.floor(value / block) * block;
  return `Octet ${octet + 1} is split. Mask octet ${maskOctet}, so the block size is 256 - ${maskOctet} = ${block}. ${value} falls in the block starting at ${start} (${start} to ${start + block - 1}).`;
}

export function makeQuestion(level: Level, rng: Rng = Math.random): Question {
  const kinds: Record<Level, string[]> = {
    1: ['hosts', 'mask', 'prefix-from-mask'],
    2: ['network', 'broadcast', 'hosts-need'],
    3: ['first', 'last', 'network', 'broadcast', 'same-subnet'],
  };
  const kind = pick(rng, kinds[level]);
  const cidr = level === 1 ? int(rng, 22, 30) : level === 2 ? int(rng, 24, 30) : int(rng, 9, 29);

  switch (kind) {
    case 'hosts': {
      const info = calcSubnet(`10.0.0.0/${cidr}`)!;
      return { kind, prompt: `How many usable host addresses are in a /${cidr}?`, answer: String(info.usableHosts),
        working: `A /${cidr} leaves ${32 - cidr} host bits: 2^${32 - cidr} = ${info.totalAddresses} addresses, minus the network and broadcast addresses = ${info.usableHosts}.` };
    }
    case 'mask': {
      const info = calcSubnet(`10.0.0.0/${cidr}`)!;
      return { kind, prompt: `What is the subnet mask for /${cidr}?`, answer: info.mask,
        working: `${cidr} network bits = ${Math.floor(cidr / 8)} full octet(s) of 255, then ${cidr % 8} bit(s) in the next octet, giving ${info.mask}.` };
    }
    case 'prefix-from-mask': {
      const info = calcSubnet(`10.0.0.0/${cidr}`)!;
      return { kind, prompt: `What prefix length is the mask ${info.mask}? (answer like /24)`, answer: `/${cidr}`,
        working: `Count the 1 bits in ${info.mask}: ${cidr}.` };
    }
    case 'hosts-need': {
      const need = pick(rng, [2, 5, 10, 25, 30, 50, 60, 100, 120, 200, 250, 500, 1000]);
      let p = 30;
      while (2 ** (32 - p) - 2 < need) p--;
      return { kind, prompt: `What is the longest prefix (smallest subnet) that fits ${need} hosts? (answer like /26)`, answer: `/${p}`,
        working: `/${p} gives ${2 ** (32 - p) - 2} usable hosts. /${p + 1} would give only ${2 ** (31 - p) - 2}.` };
    }
    case 'same-subnet': {
      const a = randomAddress(rng);
      const infoA = calcSubnet(`${a}/${cidr}`)!;
      const same = rng() < 0.5;
      const base = parseIPv4(infoA.network)!;
      const size = infoA.totalAddresses;
      const other = same ? base + int(rng, 0, size - 1) : (base + size + int(rng, 0, size - 1)) >>> 0;
      const b = formatIPv4(other >>> 0);
      const answer = calcSubnet(`${b}/${cidr}`)!.network === infoA.network ? 'yes' : 'no';
      return { kind, prompt: `Are ${a} and ${b} in the same /${cidr} subnet? (yes or no)`, answer,
        working: `${a}/${cidr} is in ${infoA.network}/${cidr}. ${b} is in ${calcSubnet(`${b}/${cidr}`)!.network}/${cidr}.` };
    }
    default: {
      const addr = randomAddress(rng);
      const info = calcSubnet(`${addr}/${cidr}`)!;
      const label: Record<string, [string, string]> = {
        network: ['network address', info.network],
        broadcast: ['broadcast address', info.broadcast],
        first: ['first usable host', info.firstHost],
        last: ['last usable host', info.lastHost],
      };
      const [name, answer] = label[kind];
      return { kind, prompt: `What is the ${name} of ${addr}/${cidr}?`, answer, working: blockWorking(addr, cidr) };
    }
  }
}

export const normalise = (s: string) => s.trim().toLowerCase().replace(/\s+/g, '');
export const isCorrect = (q: Question, input: string) => normalise(input) === normalise(q.answer);
