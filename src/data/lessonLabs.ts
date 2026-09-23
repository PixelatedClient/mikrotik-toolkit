import type { Lab, LabLink, LabNode } from './labs';
import type { SimLab } from '../lib/sim/lab';
import { MORE_SIM_LABS, MORE_TOPOLOGIES } from './lessonLabsMore';
import { BGP_LABS, BGP_TOPOLOGIES } from './simLabsBgp';
import { WIREGUARD_LABS, WIREGUARD_TOPOLOGIES } from './simLabsWireguard';

/**
 * Browser-only labs written for individual lessons. They are smaller than the GNS3 labs in labs.ts and grow with the
 * lessons: each one builds on what the previous lesson taught. Topologies here have no .rsc files.
 */
const topo = (id: string, title: string, level: Lab['level'], minutes: number, summary: string, nodes: LabNode[], links: LabLink[]): Lab => ({
  id, title, level, minutes, summary, objectives: [], nodes, links, setup: [], tasks: [], verify: [], related: [],
});

export const LESSON_TOPOLOGIES: Lab[] = [
  ...MORE_TOPOLOGIES,
  ...BGP_TOPOLOGIES,
  ...WIREGUARD_TOPOLOGIES,
  topo('first-link', 'Your first link: two routers', 'Beginner', 10, 'Two routers on one cable. Give each an address, ping across, then break the link and bring it back.',
    [
      { id: 'R1', label: 'R1', kind: 'router', x: 190, y: 130 },
      { id: 'R2', label: 'R2', kind: 'router', x: 450, y: 130 },
    ],
    [{ a: 'R1', ai: 'ether1', b: 'R2', bi: 'ether1', net: '10.0.0.0/30' }]),

  topo('dhcp-basics', 'Hand out addresses with DHCP', 'Beginner', 15, 'A router with a LAN and one PC. Build a DHCP server so the PC configures itself.',
    [
      { id: 'PC1', label: 'PC1', kind: 'pc', x: 180, y: 130 },
      { id: 'R1', label: 'R1', kind: 'router', x: 440, y: 130 },
    ],
    [{ a: 'PC1', ai: 'eth0', b: 'R1', bi: 'ether2', net: '192.168.10.0/24' }]),

  topo('trace-the-path', 'Trace the path and find the break', 'Beginner', 20, 'Three routers and two PCs are already configured, but PC1 cannot reach PC3. Trace the path and find out why.',
    [
      { id: 'PC1', label: 'PC1', kind: 'pc', x: 50, y: 130 },
      { id: 'R1', label: 'R1', kind: 'router', x: 195, y: 130 },
      { id: 'R2', label: 'R2', kind: 'router', x: 340, y: 130 },
      { id: 'R3', label: 'R3', kind: 'router', x: 485, y: 130 },
      { id: 'PC3', label: 'PC3', kind: 'pc', x: 590, y: 130 },
    ],
    [
      { a: 'PC1', ai: 'eth0', b: 'R1', bi: 'ether2', net: '192.168.1.0/24' },
      { a: 'R1', ai: 'ether1', b: 'R2', bi: 'ether1', net: '10.0.12.0/30' },
      { a: 'R2', ai: 'ether2', b: 'R3', bi: 'ether1', net: '10.0.23.0/30' },
      { a: 'R3', ai: 'ether2', b: 'PC3', bi: 'eth0', net: '192.168.3.0/24' },
    ]),

  topo('mac-learning', 'Watch a switch learn MAC addresses', 'Beginner', 15, 'One switch and three PCs. Build a bridge, ping between the PCs and read the switch MAC table.',
    [
      { id: 'PC1', label: 'PC1', kind: 'pc', x: 90, y: 60 },
      { id: 'PC2', label: 'PC2', kind: 'pc', x: 90, y: 200 },
      { id: 'SW1', label: 'SW1', kind: 'switch', x: 320, y: 130 },
      { id: 'PC3', label: 'PC3', kind: 'pc', x: 550, y: 130 },
    ],
    [
      { a: 'PC1', ai: 'eth0', b: 'SW1', bi: 'ether1', net: '10.0.0.0/24' },
      { a: 'PC2', ai: 'eth0', b: 'SW1', bi: 'ether2', net: '10.0.0.0/24' },
      { a: 'PC3', ai: 'eth0', b: 'SW1', bi: 'ether3', net: '10.0.0.0/24' },
    ]),
];

export const LESSON_SIM_LABS: SimLab[] = [
  ...MORE_SIM_LABS,
  ...BGP_LABS,
  ...WIREGUARD_LABS,
  {
    labId: 'first-link',
    intro: 'Two fresh routers joined by one cable. Click a router, then type RouterOS commands into its terminal.',
    setup: [],
    tasks: [
      {
        id: 't1',
        title: 'Address both ends',
        detail: 'Give R1 ether1 the address 10.0.0.1/30 and R2 ether1 the address 10.0.0.2/30. A /30 has exactly two usable addresses, perfect for a link between two routers.',
        hints: ['/ip address add address=10.0.0.1/30 interface=ether1', 'Check with /ip address print. Both addresses must be in the same network, 10.0.0.0/30.'],
        checks: [
          { kind: 'address', on: 'R1', iface: 'ether1', address: '10.0.0.1/30' },
          { kind: 'address', on: 'R2', iface: 'ether1', address: '10.0.0.2/30' },
        ],
        solution: [
          { device: 'R1', commands: ['/ip address add address=10.0.0.1/30 interface=ether1'] },
          { device: 'R2', commands: ['/ip address add address=10.0.0.2/30 interface=ether1'] },
        ],
      },
      {
        id: 't2',
        title: 'Ping across the cable',
        detail: 'From R1, ping R2 at 10.0.0.2. You should see replies. This works with no routes at all because the two routers share a network.',
        hints: ['/ping 10.0.0.2 count=3'],
        checks: [
          { kind: 'ran', on: 'R1', pattern: '^\\s*/?ping\\s+10\\.0\\.0\\.2' },
          { kind: 'ping', from: 'R1', to: '10.0.0.2', expect: 'reply' },
        ],
        solution: [{ device: 'R1', commands: ['/ping 10.0.0.2 count=3'] }],
      },
      {
        id: 't3',
        title: 'Break the link and bring it back',
        detail: 'Disable ether1 on R1, ping again (it fails), then enable it and ping once more. Watch the cable turn red in the diagram and green again.',
        hints: ['/interface disable ether1', '/interface enable ether1', 'A disabled interface drops its connected route, so the ping cannot leave the router.'],
        checks: [
          { kind: 'ran', on: 'R1', pattern: '^\\s*/?interface\\s+disable\\s+ether1' },
          { kind: 'ran', on: 'R1', pattern: '^\\s*/?interface\\s+enable\\s+ether1' },
          { kind: 'ping', from: 'R1', to: '10.0.0.2', expect: 'reply' },
        ],
        solution: [{ device: 'R1', commands: ['/interface disable ether1', '/ping 10.0.0.2 count=2', '/interface enable ether1', '/ping 10.0.0.2 count=2'] }],
      },
    ],
  },
  {
    labId: 'dhcp-basics',
    intro: 'R1 has one LAN port (ether2) and PC1 is plugged into it. PC1 has no address. You will build the DHCP server on R1.',
    setup: [],
    tasks: [
      {
        id: 't1',
        title: 'Give the LAN port an address',
        detail: 'R1 is the gateway for the LAN. Give ether2 the address 192.168.10.1/24.',
        hints: ['/ip address add address=192.168.10.1/24 interface=ether2'],
        checks: [{ kind: 'address', on: 'R1', iface: 'ether2', address: '192.168.10.1/24' }],
        solution: [{ device: 'R1', commands: ['/ip address add address=192.168.10.1/24 interface=ether2'] }],
      },
      {
        id: 't2',
        title: 'Build the DHCP server',
        detail: 'Create a pool 192.168.10.100-192.168.10.150, a DHCP server on ether2 that uses it, and a network entry that tells clients the gateway and DNS server (both 192.168.10.1).',
        hints: [
          '/ip pool add name=lan-pool ranges=192.168.10.100-192.168.10.150',
          '/ip dhcp-server add name=lan-dhcp interface=ether2 address-pool=lan-pool disabled=no',
          '/ip dhcp-server network add address=192.168.10.0/24 gateway=192.168.10.1 dns-server=192.168.10.1',
        ],
        checks: [{ kind: 'ran', on: 'R1', pattern: 'dhcp-server\\s+network\\s+add' }, { kind: 'ran', on: 'R1', pattern: 'dhcp-server\\s+add' }, { kind: 'ran', on: 'R1', pattern: 'pool\\s+add' }],
        solution: [
          {
            device: 'R1',
            commands: [
              '/ip pool add name=lan-pool ranges=192.168.10.100-192.168.10.150',
              '/ip dhcp-server add name=lan-dhcp interface=ether2 address-pool=lan-pool disabled=no',
              '/ip dhcp-server network add address=192.168.10.0/24 gateway=192.168.10.1 dns-server=192.168.10.1',
            ],
          },
        ],
      },
      {
        id: 't3',
        title: 'Let PC1 ask for an address',
        detail: 'On PC1 type dhcp. It should receive an address from your pool and the gateway 192.168.10.1.',
        hints: ['On the PC the command is simply: dhcp', 'If it says it cannot find a DHCP server, check that the server is enabled on ether2.'],
        checks: [{ kind: 'pc-in', on: 'PC1', net: '192.168.10.0/24' }],
        solution: [{ device: 'PC1', commands: ['dhcp'] }],
      },
      {
        id: 't4',
        title: 'Read the lease and ping the gateway',
        detail: 'On R1 print the lease table to see who has which address, then ping the router from PC1.',
        hints: ['/ip dhcp-server lease print', 'On PC1: ping 192.168.10.1'],
        checks: [
          { kind: 'ran', on: 'R1', pattern: 'dhcp-server\\s+lease\\s+print' },
          { kind: 'ping', from: 'PC1', to: '192.168.10.1', expect: 'reply' },
        ],
        solution: [
          { device: 'R1', commands: ['/ip dhcp-server lease print'] },
          { device: 'PC1', commands: ['ping 192.168.10.1'] },
        ],
      },
    ],
  },
  {
    labId: 'trace-the-path',
    intro: 'Everything is configured already, but PC1 cannot reach PC3. Use ping and traceroute to find where the path breaks, then fix it.',
    setup: [
      {
        device: 'R1',
        commands: [
          '/ip address add address=10.0.12.1/30 interface=ether1',
          '/ip address add address=192.168.1.1/24 interface=ether2',
          '/ip route add dst-address=10.0.23.0/30 gateway=10.0.12.2',
          '/ip route add dst-address=192.168.3.0/24 gateway=10.0.12.2',
        ],
      },
      {
        device: 'R2',
        commands: [
          '/ip address add address=10.0.12.2/30 interface=ether1',
          '/ip address add address=10.0.23.1/30 interface=ether2',
          '/ip route add dst-address=192.168.1.0/24 gateway=10.0.12.1',
          '/ip route add dst-address=192.168.3.0/24 gateway=10.0.23.2',
        ],
      },
      { device: 'R3', commands: ['/ip address add address=10.0.23.2/30 interface=ether1', '/ip address add address=192.168.3.1/24 interface=ether2'] },
      { device: 'PC1', commands: ['ip 192.168.1.10/24 192.168.1.1'] },
      { device: 'PC3', commands: ['ip 192.168.3.10/24 192.168.3.1'] },
    ],
    tasks: [
      {
        id: 't1',
        title: 'Confirm the problem',
        detail: 'On PC1 ping PC3 (192.168.3.10). It should time out.',
        hints: ['On PC1: ping 192.168.3.10'],
        checks: [{ kind: 'ran', on: 'PC1', pattern: '^\\s*ping\\s+192\\.168\\.3\\.10' }],
        solution: [{ device: 'PC1', commands: ['ping 192.168.3.10'] }],
      },
      {
        id: 't2',
        title: 'Trace the path',
        detail: 'Run a trace from PC1 to PC3. Every router on the way answers with its own address. Note the last hop that answers.',
        hints: ['On PC1: trace 192.168.3.10', 'The forward path works all the way to PC3. So why is there no answer?'],
        checks: [{ kind: 'ran', on: 'PC1', pattern: '^\\s*trace\\s+192\\.168\\.3\\.10' }],
        solution: [{ device: 'PC1', commands: ['trace 192.168.3.10'] }],
      },
      {
        id: 't3',
        title: 'Look at the last router',
        detail: 'A reply has to find its way back. Print the routing table on R3 and check whether it knows where 192.168.1.0/24 (PC1) is.',
        hints: ['/ip route print on R3', 'R3 only has connected routes. Nothing points back to PC1 network.'],
        checks: [{ kind: 'ran', on: 'R3', pattern: '^\\s*/?ip\\s+route\\s+print' }],
        solution: [{ device: 'R3', commands: ['/ip route print'] }],
      },
      {
        id: 't4',
        title: 'Fix the return path',
        detail: 'Add a static route on R3 for 192.168.1.0/24 via R2 (10.0.23.1) and try the ping again from PC1.',
        hints: ['/ip route add dst-address=192.168.1.0/24 gateway=10.0.23.1', 'R3 also needs to reach 10.0.12.0/30 if you want to ping R1 from R3, but PC1 to PC3 only needs the LAN route.'],
        checks: [{ kind: 'ping', from: 'PC1', to: '192.168.3.10', expect: 'reply' }],
        solution: [
          { device: 'R3', commands: ['/ip route add dst-address=192.168.1.0/24 gateway=10.0.23.1'] },
          { device: 'PC1', commands: ['ping 192.168.3.10'] },
        ],
      },
    ],
  },
  {
    labId: 'mac-learning',
    intro: 'SW1 is an empty MikroTik used as a switch and three PCs hang off it. You will make it a bridge and watch it learn who is where.',
    setup: [],
    tasks: [
      {
        id: 't1',
        title: 'Turn SW1 into a bridge',
        detail: 'Create bridge1 on SW1 and add ether1, ether2 and ether3 as its ports. A bridge is a software switch: it forwards frames by MAC address.',
        hints: ['/interface bridge add name=bridge1', '/interface bridge port add bridge=bridge1 interface=ether1 (repeat for ether2 and ether3)'],
        checks: [
          { kind: 'bridge', on: 'SW1', name: 'bridge1' },
          { kind: 'bridge-port', on: 'SW1', iface: 'ether1' },
          { kind: 'bridge-port', on: 'SW1', iface: 'ether2' },
          { kind: 'bridge-port', on: 'SW1', iface: 'ether3' },
        ],
        solution: [
          {
            device: 'SW1',
            commands: [
              '/interface bridge add name=bridge1',
              '/interface bridge port add bridge=bridge1 interface=ether1',
              '/interface bridge port add bridge=bridge1 interface=ether2',
              '/interface bridge port add bridge=bridge1 interface=ether3',
            ],
          },
        ],
      },
      {
        id: 't2',
        title: 'Address the PCs',
        detail: 'PC1 10.0.0.11/24, PC2 10.0.0.12/24, PC3 10.0.0.13/24, all with gateway 10.0.0.1. They share one network, so no router is needed.',
        hints: ['On a PC: ip 10.0.0.11/24 10.0.0.1'],
        checks: [
          { kind: 'pc', on: 'PC1', ip: '10.0.0.11', gateway: '10.0.0.1' },
          { kind: 'pc', on: 'PC2', ip: '10.0.0.12', gateway: '10.0.0.1' },
          { kind: 'pc', on: 'PC3', ip: '10.0.0.13', gateway: '10.0.0.1' },
        ],
        solution: [
          { device: 'PC1', commands: ['ip 10.0.0.11/24 10.0.0.1'] },
          { device: 'PC2', commands: ['ip 10.0.0.12/24 10.0.0.1'] },
          { device: 'PC3', commands: ['ip 10.0.0.13/24 10.0.0.1'] },
        ],
      },
      {
        id: 't3',
        title: 'Ping and read the MAC table',
        detail: 'Ping PC2 and PC3 from PC1, then on SW1 print the bridge host table. The switch learned each PC MAC address and the port it was seen on.',
        hints: ['On PC1: ping 10.0.0.12 and ping 10.0.0.13', 'On SW1: /interface bridge host print'],
        checks: [
          { kind: 'ping', from: 'PC1', to: '10.0.0.12', expect: 'reply' },
          { kind: 'ping', from: 'PC1', to: '10.0.0.13', expect: 'reply' },
          { kind: 'ran', on: 'SW1', pattern: 'bridge\\s+host\\s+print' },
        ],
        solution: [
          { device: 'PC1', commands: ['ping 10.0.0.12', 'ping 10.0.0.13'] },
          { device: 'SW1', commands: ['/interface bridge host print'] },
        ],
      },
    ],
  },
];
