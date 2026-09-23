/**
 * Spanning tree calculation for point-to-point switched networks (the normal case today).
 *
 * Election rules follow IEEE 802.1D as described in the MikroTik and Cisco documentation:
 *  - root bridge: lowest bridge ID = (priority, then MAC address)
 *  - root port: the port with the best received vector (root path cost, sender bridge ID, sender port ID, own port ID)
 *  - designated port on a segment: the side offering the best vector (root path cost, bridge ID, port ID)
 *  - every other port is blocked (STP) / alternate (RSTP)
 */

export interface Bridge {
  id: string;
  /** Multiple of 4096, 0..61440. Lower wins. Default 32768 (0x8000). */
  priority: number;
  mac: string;
}

export interface Link {
  id: string;
  a: string;
  b: string;
  /** Port number on each bridge (used as a tie-breaker, lower wins). */
  aPort: number;
  bPort: number;
  speedMbps: number;
  up: boolean;
}

export type Role = 'root' | 'designated' | 'alternate';

export interface Port {
  bridge: string;
  link: string;
  port: number;
  role: Role;
  /** Root and designated ports forward; alternate ports discard. */
  forwarding: boolean;
  cost: number;
}

export interface StpResult {
  /** Root bridge id for every bridge (bridges cut off from each other elect separate roots). */
  rootOf: Record<string, string>;
  roots: string[];
  /** Root path cost of each bridge (0 for a root). */
  rootPathCost: Record<string, number>;
  ports: Port[];
  /** Links that are up and forward on both ends: the spanning tree. */
  activeLinks: string[];
  /** Links that are up but blocked at one end. */
  blockedLinks: string[];
  downLinks: string[];
}

/** IEEE 802.1D "long" path costs as listed in the MikroTik documentation. */
const LONG_COST: [number, number][] = [
  [100000, 200],
  [25000, 800],
  [10000, 2000],
  [1000, 20000],
  [100, 200000],
  [10, 2000000],
];

export function pathCost(speedMbps: number): number {
  for (const [speed, cost] of LONG_COST) if (speedMbps >= speed) return cost;
  return 2000000;
}

const macNum = (mac: string) => parseInt(mac.replace(/[^0-9a-f]/gi, ''), 16);

/** Compare bridge IDs: priority first, then MAC. Negative when a is better. */
export const compareBridgeId = (a: Bridge, b: Bridge) => a.priority - b.priority || macNum(a.mac) - macNum(b.mac);

export const bridgeIdText = (b: Bridge) => `${b.priority.toString(16).toUpperCase().padStart(4, '0')}.${b.mac}`;

export function computeStp(bridges: Bridge[], links: Link[]): StpResult {
  const by = new Map(bridges.map((b) => [b.id, b]));
  const up = links.filter((l) => l.up && by.has(l.a) && by.has(l.b));

  // connected components over the links that are up
  const comp = new Map<string, string>();
  for (const b of bridges) {
    if (comp.has(b.id)) continue;
    const stack = [b.id];
    comp.set(b.id, b.id);
    while (stack.length) {
      const x = stack.pop()!;
      for (const l of up) {
        const y = l.a === x ? l.b : l.b === x ? l.a : null;
        if (y && !comp.has(y)) {
          comp.set(y, b.id);
          stack.push(y);
        }
      }
    }
  }

  const rootOf: Record<string, string> = {};
  const groups = new Map<string, Bridge[]>();
  for (const b of bridges) groups.set(comp.get(b.id)!, [...(groups.get(comp.get(b.id)!) ?? []), b]);
  for (const members of groups.values()) {
    const root = [...members].sort(compareBridgeId)[0];
    for (const m of members) rootOf[m.id] = root.id;
  }
  const roots = [...new Set(Object.values(rootOf))];

  // root path cost by relaxation (small graphs, so simplicity beats speed)
  const rpc: Record<string, number> = {};
  for (const b of bridges) rpc[b.id] = roots.includes(b.id) ? 0 : Infinity;
  const otherEnd = (l: Link, x: string) => (l.a === x ? l.b : l.a);
  const costAt = (l: Link) => pathCost(l.speedMbps);
  for (let i = 0; i < bridges.length; i++) {
    for (const l of up) {
      for (const [from, to] of [[l.a, l.b], [l.b, l.a]] as const) {
        if (rootOf[from] === rootOf[to] && rpc[from] + costAt(l) < rpc[to]) rpc[to] = rpc[from] + costAt(l);
      }
    }
  }

  // root port: best (cost via neighbour, neighbour bridge ID, neighbour port, own port)
  const portNo = (l: Link, x: string) => (l.a === x ? l.aPort : l.bPort);
  const rootPortLink = new Map<string, string>();
  for (const b of bridges) {
    if (roots.includes(b.id)) continue;
    const cand = up
      .filter((l) => l.a === b.id || l.b === b.id)
      .map((l) => {
        const n = by.get(otherEnd(l, b.id))!;
        return { l, cost: rpc[n.id] + costAt(l), n, np: portNo(l, n.id), own: portNo(l, b.id) };
      })
      .filter((c) => Number.isFinite(c.cost) && c.cost === rpc[b.id])
      .sort((x, y) => compareBridgeId(x.n, y.n) || x.np - y.np || x.own - y.own);
    if (cand[0]) rootPortLink.set(b.id, cand[0].l.id);
  }

  const ports: Port[] = [];
  const activeLinks: string[] = [];
  const blockedLinks: string[] = [];
  for (const l of up) {
    const A = by.get(l.a)!;
    const B = by.get(l.b)!;
    // the side with the better offered vector is designated on this segment
    const aWins =
      rpc[A.id] !== rpc[B.id] ? rpc[A.id] < rpc[B.id] : compareBridgeId(A, B) !== 0 ? compareBridgeId(A, B) < 0 : l.aPort <= l.bPort;
    const make = (x: Bridge, designatedHere: boolean): Port => {
      const isRootPort = rootPortLink.get(x.id) === l.id;
      const role: Role = isRootPort ? 'root' : designatedHere ? 'designated' : 'alternate';
      return { bridge: x.id, link: l.id, port: portNo(l, x.id), role, forwarding: role !== 'alternate', cost: costAt(l) };
    };
    const pa = make(A, aWins);
    const pb = make(B, !aWins);
    ports.push(pa, pb);
    (pa.forwarding && pb.forwarding ? activeLinks : blockedLinks).push(l.id);
  }

  return {
    rootOf,
    roots,
    rootPathCost: Object.fromEntries(Object.entries(rpc).map(([k, v]) => [k, Number.isFinite(v) ? v : 0])),
    ports,
    activeLinks,
    blockedLinks,
    downLinks: links.filter((l) => !l.up).map((l) => l.id),
  };
}

/** The demo network: a ring of four with one diagonal. */
export const initialBridges = (): Bridge[] => [
  { id: 'A', priority: 32768, mac: '00:0C:42:00:00:0A' },
  { id: 'B', priority: 32768, mac: '00:0C:42:00:00:0B' },
  { id: 'C', priority: 32768, mac: '00:0C:42:00:00:0C' },
  { id: 'D', priority: 32768, mac: '00:0C:42:00:00:0D' },
];

export const initialLinks = (): Link[] => [
  { id: 'AB', a: 'A', b: 'B', aPort: 1, bPort: 1, speedMbps: 1000, up: true },
  { id: 'BC', a: 'B', b: 'C', aPort: 2, bPort: 1, speedMbps: 1000, up: true },
  { id: 'CD', a: 'C', b: 'D', aPort: 2, bPort: 1, speedMbps: 1000, up: true },
  { id: 'DA', a: 'D', b: 'A', aPort: 2, bPort: 2, speedMbps: 1000, up: true },
  { id: 'AC', a: 'A', b: 'C', aPort: 3, bPort: 3, speedMbps: 100, up: true },
];

export interface Mission {
  id: string;
  title: string;
  brief: string;
  hint: string;
  done: (bridges: Bridge[], links: Link[], r: StpResult, initial: StpResult) => boolean;
}

export const MISSIONS: Mission[] = [
  {
    id: 'root-d',
    title: 'Elect D as the root',
    brief: 'Make bridge D the root bridge by changing one setting.',
    hint: 'The lowest priority wins. If priorities tie, the lowest MAC address wins.',
    done: (_b, _l, r) => r.roots.length === 1 && r.roots[0] === 'D',
  },
  {
    id: 'block-da',
    title: 'Block the D to A link',
    brief: 'Make the D to A link blocked (one end discarding) while everything stays connected. Do not cut any link.',
    hint: 'A link is blocked when it is not part of the tree. Moving the root to a bridge on the far side changes which links the tree needs.',
    done: (_b, l, r) => r.roots.length === 1 && l.every((x) => x.up) && r.blockedLinks.includes('DA'),
  },
  {
    id: 'failover',
    title: 'Survive a failure',
    brief: 'Cut a link that is carrying traffic. The network must stay connected, using a link that was blocked before.',
    hint: 'Green links carry traffic. Click one to cut it, then watch a dashed link take over.',
    done: (_b, _l, r, initial) => r.roots.length === 1 && r.downLinks.length >= 1 && r.activeLinks.some((id) => initial.blockedLinks.includes(id)),
  },
  {
    id: 'split',
    title: 'Split the network',
    brief: 'Cut enough links to isolate bridge B, and see that it elects itself root.',
    hint: 'B has two links. Cut both.',
    done: (_b, _l, r) => r.rootOf['B'] === 'B' && r.roots.length >= 2,
  },
];
