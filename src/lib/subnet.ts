export interface SubnetInfo {
  cidr: number;
  address: string;
  network: string;
  broadcast: string;
  mask: string;
  wildcard: string;
  firstHost: string;
  lastHost: string;
  totalAddresses: number;
  usableHosts: number;
}

export function parseIPv4(s: string): number | null {
  const parts = s.trim().split('.');
  if (parts.length !== 4) return null;
  let n = 0;
  for (const p of parts) {
    if (!/^\d{1,3}$/.test(p)) return null;
    const v = Number(p);
    if (v > 255) return null;
    n = n * 256 + v;
  }
  return n;
}

export function formatIPv4(n: number): string {
  return [n >>> 24, (n >>> 16) & 255, (n >>> 8) & 255, n & 255].join('.');
}

function maskFor(cidr: number): number {
  return cidr === 0 ? 0 : (0xffffffff << (32 - cidr)) >>> 0;
}

export function calcSubnet(input: string): SubnetInfo | null {
  const m = input.trim().match(/^([\d.]+)\/(\d{1,2})$/);
  if (!m) return null;
  const ip = parseIPv4(m[1]);
  const cidr = Number(m[2]);
  if (ip === null || cidr > 32) return null;

  const mask = maskFor(cidr);
  const network = (ip & mask) >>> 0;
  const broadcast = (network | (~mask >>> 0)) >>> 0;
  const total = 2 ** (32 - cidr);
  // /31 (RFC 3021) and /32 have no network/broadcast reservation
  const usable = cidr >= 31 ? total : total - 2;
  const first = cidr >= 31 ? network : network + 1;
  const last = cidr >= 31 ? broadcast : broadcast - 1;

  return {
    cidr,
    address: formatIPv4(ip),
    network: formatIPv4(network),
    broadcast: formatIPv4(broadcast),
    mask: formatIPv4(mask),
    wildcard: formatIPv4(~mask >>> 0),
    firstHost: formatIPv4(first),
    lastHost: formatIPv4(last),
    totalAddresses: total,
    usableHosts: usable,
  };
}

/** Split a network into 2^bits equal child subnets. */
export function splitSubnet(input: string, newCidr: number): string[] | null {
  const info = calcSubnet(input);
  if (!info || newCidr < info.cidr || newCidr > 32 || newCidr - info.cidr > 16) return null;
  const base = parseIPv4(info.network)!;
  const step = 2 ** (32 - newCidr);
  const count = 2 ** (newCidr - info.cidr);
  return Array.from({ length: count }, (_, i) => `${formatIPv4(base + i * step)}/${newCidr}`);
}

/** VLSM: allocate largest-first from a parent block. Returns null if it doesn't fit. */
export function vlsm(
  parent: string,
  needs: { name: string; hosts: number }[],
): { name: string; hosts: number; subnet: string; cidr: number }[] | null {
  const info = calcSubnet(parent);
  if (!info) return null;
  let cursor = parseIPv4(info.network)!;
  const end = parseIPv4(info.broadcast)!;
  const out = [];
  for (const n of [...needs].sort((a, b) => b.hosts - a.hosts)) {
    if (n.hosts < 1) return null;
    let cidr = 30;
    while (cidr > 0 && 2 ** (32 - cidr) - 2 < n.hosts) cidr--;
    const size = 2 ** (32 - cidr);
    cursor = Math.ceil(cursor / size) * size;
    if (cursor + size - 1 > end) return null;
    out.push({ name: n.name, hosts: n.hosts, subnet: `${formatIPv4(cursor)}/${cidr}`, cidr });
    cursor += size;
  }
  return out;
}
