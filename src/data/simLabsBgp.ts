import type { Lab, LabLink, LabNode } from './labs';
import type { SimLab } from '../lib/sim/lab';

const topo = (id: string, title: string, level: Lab['level'], minutes: number, summary: string, nodes: LabNode[], links: LabLink[]): Lab => ({
  id, title, level, minutes, summary, objectives: [], nodes, links, setup: [], tasks: [], verify: [], related: [],
});
const SW = (device: string, commands: string[]) => ({ device, commands });

export const BGP_TOPOLOGIES: Lab[] = [
  topo('bgp-basics', 'eBGP between two networks', 'Advanced', 30, 'ISP1 and ISP2, each with a LAN to announce, share one link. Bring up eBGP, filter what crosses it, and check what each side learns.',
    [
      { id: 'ISP1', label: 'ISP1', kind: 'router', x: 180, y: 130 },
      { id: 'ISP2', label: 'ISP2', kind: 'router', x: 440, y: 130 },
    ],
    [{ a: 'ISP1', ai: 'ether1', b: 'ISP2', bi: 'ether1', net: '10.1.1.0/30' }]),
];

/** eBGP between two edges. The engine (sessions, filters, learned routes) was checked against real RouterOS 7.16; see tools/conformance/scenarios/bgp.json. */
export const BGP_LABS: SimLab[] = [
  {
    labId: 'bgp-basics',
    intro:
      'ISP1 (AS 64500) and ISP2 (AS 64501) share one link and each has its own LAN to announce: ISP1 announces 198.51.100.0/24, ISP2 announces 203.0.113.0/24. You bring up the session and control exactly what crosses it.',
    setup: [
      SW('ISP1', ['/interface bridge add name=lan comment=announce', '/ip address add address=198.51.100.1/24 interface=lan', '/ip address add address=10.1.1.1/30 interface=ether1']),
      SW('ISP2', ['/interface bridge add name=lan comment=announce', '/ip address add address=203.0.113.1/24 interface=lan', '/ip address add address=10.1.1.2/30 interface=ether1']),
    ],
    tasks: [
      {
        id: 't1',
        title: 'Give BGP something real to announce',
        detail:
          'A router only originates a prefix it actually has in its routing table. On each router add a blackhole static route for its own LAN (so the prefix exists even if the LAN is empty) and put it in an address-list named "announce".',
        hints: [
          '/ip route add dst-address=198.51.100.0/24 blackhole comment=anchor',
          '/ip firewall address-list add list=announce address=198.51.100.0/24',
          'Do the matching pair on ISP2 for 203.0.113.0/24.',
        ],
        checks: [
          { kind: 'route', on: 'ISP1', dst: '198.51.100.0/24' },
          { kind: 'route', on: 'ISP2', dst: '203.0.113.0/24' },
          { kind: 'ran', on: 'ISP1', pattern: 'address-list\\s+add' },
        ],
        solution: [
          SW('ISP1', ['/ip route add dst-address=198.51.100.0/24 blackhole comment=anchor', '/ip firewall address-list add list=announce address=198.51.100.0/24']),
          SW('ISP2', ['/ip route add dst-address=203.0.113.0/24 blackhole comment=anchor', '/ip firewall address-list add list=announce address=203.0.113.0/24']),
        ],
      },
      {
        id: 't2',
        title: 'Filters before the session: announce only your own prefix',
        detail:
          'Never trust the far end with your whole table and never hand yours over unfiltered. Build an out-filter that accepts only the announce list and rejects everything else, and an in-filter that accepts whatever the neighbour sends (for now).',
        hints: [
          '/routing filter rule add chain=out-filter rule="if (dst == 198.51.100.0/24) { accept }"',
          '/routing filter rule add chain=out-filter rule="reject"',
          '/routing filter rule add chain=in-filter rule="accept"',
        ],
        checks: [
          { kind: 'ran', on: 'ISP1', pattern: "filter\\s+rule\\s+add\\s+chain=out-filter" },
          { kind: 'ran', on: 'ISP1', pattern: 'chain=in-filter' },
          { kind: 'ran', on: 'ISP2', pattern: "filter\\s+rule\\s+add\\s+chain=out-filter" },
        ],
        solution: [
          SW('ISP1', [
            '/routing filter rule add chain=out-filter rule="if (dst == 198.51.100.0/24) { accept }"',
            '/routing filter rule add chain=out-filter rule="reject"',
            '/routing filter rule add chain=in-filter rule="accept"',
          ]),
          SW('ISP2', [
            '/routing filter rule add chain=out-filter rule="if (dst == 203.0.113.0/24) { accept }"',
            '/routing filter rule add chain=out-filter rule="reject"',
            '/routing filter rule add chain=in-filter rule="accept"',
          ]),
        ],
      },
      {
        id: 't3',
        title: 'Bring up the session',
        detail: 'Create a template with your AS and router-id, then a connection that points at the neighbour and wires in the filters and the announce list.',
        hints: [
          '/routing bgp template add name=main as=64500 router-id=10.255.0.1',
          '/routing bgp connection add name=to-isp2 templates=main local.address=10.1.1.1 local.role=ebgp remote.address=10.1.1.2 remote.as=64501 output.network=announce output.filter-chain=out-filter input.filter=in-filter',
          'Check with /routing bgp session print: state should be Established.',
        ],
        checks: [
          { kind: 'bgp-sessions', on: 'ISP1', count: 1 },
          { kind: 'bgp-sessions', on: 'ISP2', count: 1 },
          { kind: 'ran', on: 'ISP1', pattern: 'bgp\\s+session\\s+print' },
        ],
        solution: [
          SW('ISP1', [
            '/routing bgp template add name=main as=64500 router-id=10.255.0.1',
            '/routing bgp connection add name=to-isp2 templates=main local.address=10.1.1.1 local.role=ebgp remote.address=10.1.1.2 remote.as=64501 output.network=announce output.filter-chain=out-filter input.filter=in-filter',
            '/routing bgp session print',
          ]),
          SW('ISP2', [
            '/routing bgp template add name=main as=64501 router-id=10.255.0.2',
            '/routing bgp connection add name=to-isp1 templates=main local.address=10.1.1.2 local.role=ebgp remote.address=10.1.1.1 remote.as=64500 output.network=announce output.filter-chain=out-filter input.filter=in-filter',
          ]),
        ],
      },
      {
        id: 't4',
        title: 'Check what came across',
        detail: 'Print the routes learned from BGP (flag b, distance 20) and the advertisements you are sending out.',
        hints: ['/ip route print where bgp', '/routing bgp advertisements print'],
        checks: [
          { kind: 'ran', on: 'ISP1', pattern: 'ip\\s+route\\s+print\\s+where\\s+bgp' },
          { kind: 'ran', on: 'ISP1', pattern: 'bgp\\s+advertisements\\s+print' },
          { kind: 'route', on: 'ISP1', dst: '203.0.113.0/24', via: '10.1.1.2' },
          { kind: 'route', on: 'ISP2', dst: '198.51.100.0/24', via: '10.1.1.1' },
        ],
        solution: [SW('ISP1', ['/ip route print where bgp', '/routing bgp advertisements print'])],
      },
    ],
  },
];
