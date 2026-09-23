import type { Net, Route } from '../../lib/game/routing';

export interface Flow {
  from: string;
  to: string;
  label: string;
  /** The packet must pass through this node (for policy puzzles). */
  mustPass?: string;
}

export interface RouteLevel {
  id: string;
  title: string;
  story: string;
  learn: string;
  goal: string;
  boss?: { name: string; hp: string };
  net: Net;
  /** Routers the player may edit. */
  editable: string[];
  flows: Flow[];
  /** Fewest routes that solve it. Three stars at par, two within 2, otherwise one. */
  par: number;
  /** Extra destinations offered in the editor, such as summaries the topology does not list. */
  extraPrefixes?: string[];
  solution: Record<string, Route[]>;
  read?: { href: string; label: string };
}

const host = (id: string, label: string, ip: string, cidr: number, gateway: string) => ({
  id, label, kind: 'host' as const, ifaces: [{ name: 'e0', ip, cidr }], gateway, routes: [] as Route[],
});
const router = (id: string, label: string, ifaces: [string, string, number][], routes: Route[] = []) => ({
  id, label, kind: 'router' as const, ifaces: ifaces.map(([name, ip, cidr]) => ({ name, ip, cidr })), routes,
});

/** PC1 - R1 - R2 - PC2 */
const twoRouters = (): Net => ({
  nodes: [
    host('pc1', 'PC1', '192.168.1.10', 24, '192.168.1.1'),
    router('r1', 'R1', [['e1', '192.168.1.1', 24], ['e2', '10.0.12.1', 30]]),
    router('r2', 'R2', [['e1', '10.0.12.2', 30], ['e2', '192.168.2.1', 24]]),
    host('pc2', 'PC2', '192.168.2.10', 24, '192.168.2.1'),
  ],
  links: [
    { a: 'pc1', ai: 'e0', b: 'r1', bi: 'e1', up: true },
    { a: 'r1', ai: 'e2', b: 'r2', bi: 'e1', up: true },
    { a: 'r2', ai: 'e2', b: 'pc2', bi: 'e0', up: true },
  ],
});

/** PC1 - R1 - R2 - R3 - SRV */
const threeRouters = (r2routes: Route[] = [], r1routes: Route[] = []): Net => ({
  nodes: [
    host('pc1', 'PC1', '192.168.1.10', 24, '192.168.1.1'),
    router('r1', 'R1', [['e1', '192.168.1.1', 24], ['e2', '10.0.12.1', 30]], r1routes),
    router('r2', 'R2', [['e1', '10.0.12.2', 30], ['e2', '10.0.23.1', 30]], r2routes),
    router('r3', 'R3', [['e1', '10.0.23.2', 30], ['e2', '192.168.3.1', 24]]),
    host('srv', 'Server', '192.168.3.10', 24, '192.168.3.1'),
  ],
  links: [
    { a: 'pc1', ai: 'e0', b: 'r1', bi: 'e1', up: true },
    { a: 'r1', ai: 'e2', b: 'r2', bi: 'e1', up: true },
    { a: 'r2', ai: 'e2', b: 'r3', bi: 'e1', up: true },
    { a: 'r3', ai: 'e2', b: 'srv', bi: 'e0', up: true },
  ],
});

/** Home router with two providers: ISP1 (9.9.9.9 behind it) and ISP2 (8.8.8.8 behind it). */
const twoExits = (): Net => ({
  nodes: [
    host('pc', 'PC', '10.9.0.10', 24, '10.9.0.1'),
    router('r', 'Home', [['e0', '10.9.0.1', 24], ['e1', '172.16.0.1', 30], ['e2', '172.16.1.1', 30]]),
    router('isp1', 'ISP 1', [['e0', '172.16.0.2', 30], ['e1', '9.9.9.9', 32]]),
    router('isp2', 'ISP 2', [['e0', '172.16.1.2', 30], ['e1', '8.8.8.8', 32]]),
  ],
  links: [
    { a: 'pc', ai: 'e0', b: 'r', bi: 'e0', up: true },
    { a: 'r', ai: 'e1', b: 'isp1', bi: 'e0', up: true },
    { a: 'r', ai: 'e2', b: 'isp2', bi: 'e0', up: true },
  ],
});

/** The boss map: the direct R1-R2 road is cut, so packets must go the long way round through R3. */
const siege = (): Net => ({
  nodes: [
    host('army', 'Your army', '10.0.0.10', 24, '10.0.0.1'),
    router('r1', 'R1', [['e0', '10.0.0.1', 24], ['e1', '10.1.12.1', 30], ['e2', '10.1.13.1', 30]]),
    router('r2', 'R2', [['e1', '10.1.12.2', 30], ['e2', '10.1.23.2', 30], ['e3', '172.16.1.1', 24], ['e4', '172.16.2.1', 24]]),
    router('r3', 'R3', [['e1', '10.1.13.2', 30], ['e2', '10.1.23.1', 30]]),
    host('tower', 'Enemy tower', '172.16.1.10', 24, '172.16.1.1'),
    host('vault', 'Enemy vault', '172.16.2.10', 24, '172.16.2.1'),
  ],
  links: [
    { a: 'army', ai: 'e0', b: 'r1', bi: 'e0', up: true },
    { a: 'r1', ai: 'e1', b: 'r2', bi: 'e1', up: false }, // the direct road is broken
    { a: 'r1', ai: 'e2', b: 'r3', bi: 'e1', up: true },
    { a: 'r3', ai: 'e2', b: 'r2', bi: 'e2', up: true },
    { a: 'r2', ai: 'e3', b: 'tower', bi: 'e0', up: true },
    { a: 'r2', ai: 'e4', b: 'vault', bi: 'e0', up: true },
  ],
});

export const ROUTE_LEVELS: RouteLevel[] = [
  {
    id: 'route-1',
    title: 'The First Road',
    story: 'A courier at PC1 must deliver a packet to PC2 across the river. R1 knows its own bank, but it has never heard of the far shore.',
    learn: 'A router only knows the networks it is directly connected to. To reach anything else you add a static route: a destination network, and the next router to hand the packet to.',
    goal: 'Deliver a packet from PC1 to PC2.',
    net: twoRouters(),
    editable: ['r1'],
    flows: [{ from: 'pc1', to: '192.168.2.10', label: 'PC1 to PC2' }],
    par: 1,
    solution: { r1: [{ dst: '192.168.2.0/24', via: '10.0.12.2' }] },
    read: { href: '/learn/foundations/03-your-first-router', label: 'Your first router' },
  },
  {
    id: 'route-2',
    title: 'The Return Trip',
    story: 'PC2 wants to answer PC1, but a reply is a new packet in the other direction, and the routers must know the way back too.',
    learn: 'Routing is one-way. A route that gets packets there does nothing for the replies. Every router on the path needs a route in both directions, or connections fail even though the outbound half works.',
    goal: 'Make both PC1 to PC2 and PC2 to PC1 arrive.',
    net: twoRouters(),
    editable: ['r1', 'r2'],
    flows: [{ from: 'pc1', to: '192.168.2.10', label: 'PC1 to PC2' }, { from: 'pc2', to: '192.168.1.10', label: 'PC2 to PC1' }],
    par: 2,
    solution: { r1: [{ dst: '192.168.2.0/24', via: '10.0.12.2' }], r2: [{ dst: '192.168.1.0/24', via: '10.0.12.1' }] },
    read: { href: '/labs/three-router', label: 'Three-router lab' },
  },
  {
    id: 'route-3',
    title: 'Three Bridges',
    story: 'The server is three routers away. Every router in the middle needs directions for both ends of the trip.',
    learn: 'A router in the middle needs routes to both ends. Count who needs what: R1 needs the far network, R3 needs the near one, and R2, in the middle, needs both.',
    goal: 'Let PC1 and the Server talk to each other.',
    net: threeRouters(),
    editable: ['r1', 'r2', 'r3'],
    flows: [{ from: 'pc1', to: '192.168.3.10', label: 'PC1 to Server' }, { from: 'srv', to: '192.168.1.10', label: 'Server to PC1' }],
    par: 4,
    solution: {
      r1: [{ dst: '192.168.3.0/24', via: '10.0.12.2' }],
      r2: [{ dst: '192.168.1.0/24', via: '10.0.12.1' }, { dst: '192.168.3.0/24', via: '10.0.23.2' }],
      r3: [{ dst: '192.168.1.0/24', via: '10.0.23.1' }],
    },
  },
  {
    id: 'route-4',
    title: 'The Loop Trap',
    story: 'A tired engineer left two routers pointing at each other. Packets bounce between them until they die of old age.',
    learn: 'A routing loop happens when routers send a packet back and forth. Every router lowers the TTL by one, so the packet is eventually dropped, but a loop wastes bandwidth and breaks the connection. Trace where the packet goes and repair the wrong route.',
    goal: 'Free the packet: PC1 must reach the Server.',
    net: threeRouters([{ dst: '0.0.0.0/0', via: '10.0.12.1' }], [{ dst: '0.0.0.0/0', via: '10.0.12.2' }]),
    editable: ['r1', 'r2'],
    flows: [{ from: 'pc1', to: '192.168.3.10', label: 'PC1 to Server' }],
    par: 2,
    solution: { r1: [{ dst: '0.0.0.0/0', via: '10.0.12.2' }], r2: [{ dst: '0.0.0.0/0', via: '10.0.23.2' }] },
    read: { href: '/learn/mikrotik/03-routing-static-ospf-bgp', label: 'Routing lesson' },
  },
  {
    id: 'route-5',
    title: 'Two Doors',
    story: 'Your home router has two providers. One exit is cheap for everything, but only ISP 2 reaches 8.8.8.8 quickly.',
    learn: 'When two routes match, the router picks the most specific one: the longest prefix. A default route (0.0.0.0/0) matches everything but loses to any more specific route.',
    goal: 'Send 9.9.9.9 out through ISP 1 and 8.8.8.8 through ISP 2.',
    net: twoExits(),
    editable: ['r'],
    flows: [
      { from: 'pc', to: '9.9.9.9', label: 'to 9.9.9.9 via ISP 1', mustPass: 'isp1' },
      { from: 'pc', to: '8.8.8.8', label: 'to 8.8.8.8 via ISP 2', mustPass: 'isp2' },
    ],
    par: 2,
    extraPrefixes: ['8.8.8.0/24'],
    solution: { r: [{ dst: '0.0.0.0/0', via: '172.16.0.2' }, { dst: '8.8.8.0/24', via: '172.16.1.2' }] },
    read: { href: '/learn/routing/02-route-maps-and-policy', label: 'Routing policy' },
  },
  {
    id: 'route-6',
    title: 'Siege of the Enemy Tower',
    story: 'The enemy holds a tower and a vault behind R2, and the direct road from R1 to R2 has been cut. Send your army the long way round, through R3, and storm both.',
    learn: 'Routes must avoid dead links. You can also summarise: two enemy networks that sit side by side, 172.16.1.0/24 and 172.16.2.0/24, fit inside one route to 172.16.0.0/16. Fewer routes means a stronger attack, and more stars.',
    goal: 'Deliver packets to the Enemy tower and the Enemy vault.',
    boss: { name: 'The Enemy Tower', hp: 'packets delivered' },
    net: siege(),
    editable: ['r1', 'r3'],
    flows: [{ from: 'army', to: '172.16.1.10', label: 'Attack the tower' }, { from: 'army', to: '172.16.2.10', label: 'Attack the vault' }],
    par: 2,
    extraPrefixes: ['172.16.0.0/16'],
    solution: { r1: [{ dst: '172.16.0.0/16', via: '10.1.13.2' }], r3: [{ dst: '172.16.0.0/16', via: '10.1.23.2' }] },
    read: { href: '/tools/route-summarization-calculator', label: 'Route summarization calculator' },
  },
  {
    id: 'route-7',
    title: 'The Four Corners',
    story: 'Four routers sit at the corners of a square. Packets must flow in a circle: R1 to R2 to R3 to R4 and back.',
    learn: 'A square topology has two paths around the ring. Every router needs routes to the three non-neighbours.',
    goal: 'Connect all four routers so packets can flow in either direction around the square.',
    net: {
      nodes: [
        router('r1', 'R1', [['e1', '192.168.1.1', 24], ['e2', '10.1.12.1', 30], ['e3', '10.1.14.1', 30]]),
        router('r2', 'R2', [['e1', '10.1.12.2', 30], ['e2', '10.2.23.1', 30]]),
        router('r3', 'R3', [['e1', '10.2.23.2', 30], ['e2', '10.3.34.1', 30]]),
        router('r4', 'R4', [['e1', '10.3.34.2', 30], ['e2', '192.168.4.1', 24], ['e3', '10.1.14.2', 30]]),
        host('pc1', 'PC1', '192.168.1.10', 24, '192.168.1.1'),
        host('pc4', 'PC4', '192.168.4.10', 24, '192.168.4.1'),
      ],
      links: [
        { a: 'pc1', ai: 'e0', b: 'r1', bi: 'e1', up: true },
        { a: 'r1', ai: 'e2', b: 'r2', bi: 'e1', up: true },
        { a: 'r2', ai: 'e2', b: 'r3', bi: 'e1', up: true },
        { a: 'r3', ai: 'e2', b: 'r4', bi: 'e1', up: true },
        { a: 'r4', ai: 'e3', b: 'r1', bi: 'e3', up: true },
        { a: 'pc4', ai: 'e0', b: 'r4', bi: 'e2', up: true },
      ],
    },
    editable: ['r1', 'r2', 'r3', 'r4'],
    flows: [
      { from: 'pc1', to: '192.168.4.10', label: 'PC1 to PC4' },
      { from: 'pc4', to: '192.168.1.10', label: 'PC4 to PC1' },
    ],
    par: 4,
    solution: {
      r1: [{ dst: '192.168.4.0/24', via: '10.1.12.2' }],
      r2: [{ dst: '192.168.1.0/24', via: '10.1.12.1' }, { dst: '192.168.4.0/24', via: '10.2.23.2' }],
      r3: [{ dst: '192.168.1.0/24', via: '10.2.23.1' }, { dst: '192.168.4.0/24', via: '10.3.34.2' }],
      r4: [{ dst: '192.168.1.0/24', via: '10.3.34.1' }],
    },
  },
  {
    id: 'route-8',
    title: 'The Redundant Path',
    story: 'Two providers feed your network. One is cheaper but slower (distance 100), the other is fast but pricey (distance 20). Pick the path each packet takes.',
    learn: 'Administrative distance decides when two routes have the same destination. A route via the fast provider (distance 20) wins over the slow one (distance 100).',
    goal: 'Fast traffic (to 8.8.8.8) takes the premium path. Cheap destinations (to 1.1.1.1) use the budget provider.',
    net: {
      nodes: [
        host('pc', 'PC', '10.0.0.10', 24, '10.0.0.1'),
        router('r', 'R', [
          ['e0', '10.0.0.1', 24],
          ['e1', '10.1.0.1', 30],
          ['e2', '10.2.0.1', 30],
        ]),
        router('fast', 'Fast ISP', [['e0', '10.1.0.2', 30], ['e1', '8.8.8.8', 32]]),
        router('slow', 'Slow ISP', [['e0', '10.2.0.2', 30], ['e1', '1.1.1.1', 32]]),
      ],
      links: [
        { a: 'pc', ai: 'e0', b: 'r', bi: 'e0', up: true },
        { a: 'r', ai: 'e1', b: 'fast', bi: 'e0', up: true },
        { a: 'r', ai: 'e2', b: 'slow', bi: 'e0', up: true },
      ],
    },
    editable: ['r'],
    flows: [
      { from: 'pc', to: '8.8.8.8', label: '8.8.8.8 (premium)', mustPass: 'fast' },
      { from: 'pc', to: '1.1.1.1', label: '1.1.1.1 (budget)', mustPass: 'slow' },
    ],
    par: 2,
    extraPrefixes: ['8.8.0.0/16', '1.1.0.0/16', '0.0.0.0/0'],
    solution: { r: [{ dst: '8.8.0.0/16', via: '10.1.0.2' }, { dst: '1.1.0.0/16', via: '10.2.0.2' }] },
    read: { href: '/learn/routing/02-route-maps-and-policy', label: 'Routing policy' },
  },
  {
    id: 'route-9',
    title: 'The Scaled Path',
    story: 'The backbone carries traffic across three hops: R1 to R2, then R2 to R3, then R3 to R4. Every router needs to know how to reach the far end.',
    learn: 'In a linear chain, the first router must reach through all the middle ones. A default route simplifies: send everything unknown towards the next router.',
    goal: 'Connect the chain from PC1 through the network to reach Endpoint, both directions.',
    net: {
      nodes: [
        host('pc1', 'PC1', '192.168.1.10', 24, '192.168.1.1'),
        router('r1', 'R1', [['e1', '192.168.1.1', 24], ['e2', '10.0.12.1', 30]]),
        router('r2', 'R2', [['e1', '10.0.12.2', 30], ['e2', '10.0.23.1', 30]]),
        router('r3', 'R3', [['e1', '10.0.23.2', 30], ['e2', '10.0.34.1', 30]]),
        router('r4', 'R4', [['e1', '10.0.34.2', 30], ['e2', '192.168.4.1', 24]]),
        host('ep', 'Endpoint', '192.168.4.10', 24, '192.168.4.1'),
      ],
      links: [
        { a: 'pc1', ai: 'e0', b: 'r1', bi: 'e1', up: true },
        { a: 'r1', ai: 'e2', b: 'r2', bi: 'e1', up: true },
        { a: 'r2', ai: 'e2', b: 'r3', bi: 'e1', up: true },
        { a: 'r3', ai: 'e2', b: 'r4', bi: 'e1', up: true },
        { a: 'r4', ai: 'e2', b: 'ep', bi: 'e0', up: true },
      ],
    },
    editable: ['r1', 'r2', 'r3', 'r4'],
    flows: [
      { from: 'pc1', to: '192.168.4.10', label: 'PC1 to Endpoint' },
      { from: 'ep', to: '192.168.1.10', label: 'Endpoint to PC1' },
    ],
    par: 4,
    solution: {
      r1: [{ dst: '192.168.4.0/24', via: '10.0.12.2' }],
      r2: [{ dst: '192.168.4.0/24', via: '10.0.23.2' }, { dst: '192.168.1.0/24', via: '10.0.12.1' }],
      r3: [{ dst: '192.168.4.0/24', via: '10.0.34.2' }, { dst: '192.168.1.0/24', via: '10.0.23.1' }],
      r4: [{ dst: '192.168.1.0/24', via: '10.0.34.1' }],
    },
  },
];
