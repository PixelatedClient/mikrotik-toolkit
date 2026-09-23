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
  topo('bgp-dual-upstream', 'Dual upstream BGP with local-pref', 'Advanced', 40, 'EDGE connects to ISP-A and ISP-B. Learn route filtering and use local-pref to prefer one upstream over the other.',
    [
      { id: 'EDGE', label: 'EDGE', kind: 'router', x: 320, y: 130 },
      { id: 'ISP-A', label: 'ISP-A', kind: 'router', x: 120, y: 130 },
      { id: 'ISP-B', label: 'ISP-B', kind: 'router', x: 520, y: 130 },
    ],
    [
      { a: 'EDGE', ai: 'ether1', b: 'ISP-A', bi: 'ether1', net: '10.1.1.0/30' },
      { a: 'EDGE', ai: 'ether2', b: 'ISP-B', bi: 'ether1', net: '10.2.1.0/30' },
    ]),
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
  {
    labId: 'bgp-dual-upstream',
    intro:
      'EDGE (AS 65001) connects to ISP-A (AS 64500) and ISP-B (AS 64501). Both upstreams will advertise their own prefixes. You build dual BGP sessions and use filtering and local-pref to control which upstream is preferred.',
    setup: [
      SW('EDGE', [
        '/interface bridge add name=loopback',
        '/ip address add address=10.255.0.1/32 interface=loopback',
        '/ip address add address=10.1.1.1/30 interface=ether1 comment="to ISP-A"',
        '/ip address add address=10.2.1.1/30 interface=ether2 comment="to ISP-B"',
        '/interface bridge add name=announce comment="local LAN"',
        '/ip address add address=198.51.100.1/24 interface=announce',
      ]),
      SW('ISP-A', [
        '/interface bridge add name=loopback',
        '/ip address add address=10.255.0.100/32 interface=loopback',
        '/ip address add address=10.1.1.2/30 interface=ether1 comment="to EDGE"',
        '/routing bgp template add name=main as=64500 router-id=10.255.0.100',
        '/interface bridge add name=announce comment="public prefix"',
        '/ip address add address=192.0.2.1/24 interface=announce',
        '/ip route add dst-address=192.0.2.0/24 blackhole',
        '/ip firewall address-list add list=announce-a address=192.0.2.0/24',
        '/routing filter rule add chain=to-edge rule="if (dst == 192.0.2.0/24) { accept }"',
        '/routing filter rule add chain=to-edge rule="reject"',
        '/routing bgp connection add name=to-edge templates=main local.address=10.1.1.2 local.role=ebgp remote.address=10.1.1.1 remote.as=65001 output.network=announce-a output.filter-chain=to-edge',
      ]),
      SW('ISP-B', [
        '/interface bridge add name=loopback',
        '/ip address add address=10.255.0.101/32 interface=loopback',
        '/ip address add address=10.2.1.2/30 interface=ether1 comment="to EDGE"',
        '/routing bgp template add name=main as=64501 router-id=10.255.0.101',
        '/interface bridge add name=announce comment="public prefix"',
        '/ip address add address=203.0.113.1/24 interface=announce',
        '/ip route add dst-address=203.0.113.0/24 blackhole',
        '/ip firewall address-list add list=announce-b address=203.0.113.0/24',
        '/routing filter rule add chain=to-edge rule="if (dst == 203.0.113.0/24) { accept }"',
        '/routing filter rule add chain=to-edge rule="reject"',
        '/routing bgp connection add name=to-edge templates=main local.address=10.2.1.2 local.role=ebgp remote.address=10.2.1.1 remote.as=65001 output.network=announce-b output.filter-chain=to-edge',
      ]),
    ],
    tasks: [
      {
        id: 't1',
        title: 'Set up EDGE: BGP template with your AS and router-id',
        detail:
          'Create a BGP template on EDGE with AS 65001 and router-id 10.255.0.1. You\'ll use this template for both upstream connections.',
        hints: ['/routing bgp template add name=main as=65001 router-id=10.255.0.1'],
        checks: [{ kind: 'ran', on: 'EDGE', pattern: 'bgp\\s+template\\s+add' }],
        solution: [SW('EDGE', ['/routing bgp template add name=main as=65001 router-id=10.255.0.1'])],
      },
      {
        id: 't2',
        title: 'Create announce filters on EDGE',
        detail:
          'Create a filter chain to announce your LAN (198.51.100.0/24) and accept routes from both upstreams. This is your output filter.',
        hints: [
          '/routing filter rule add chain=out-filter rule="if (dst == 198.51.100.0/24) { accept }"',
          '/routing filter rule add chain=out-filter rule="reject"',
          '/routing filter rule add chain=in-filter rule="accept"',
        ],
        checks: [
          { kind: 'ran', on: 'EDGE', pattern: 'filter\\s+rule\\s+add' },
        ],
        solution: [
          SW('EDGE', [
            '/routing filter rule add chain=out-filter rule="if (dst == 198.51.100.0/24) { accept }"',
            '/routing filter rule add chain=out-filter rule="reject"',
            '/routing filter rule add chain=in-filter rule="accept"',
          ]),
        ],
      },
      {
        id: 't3',
        title: 'Connect to ISP-A',
        detail:
          'Create a BGP connection to ISP-A (10.1.1.2, AS 64500) using your template and filters. Then check that the session is established.',
        hints: [
          '/routing bgp connection add name=to-isp-a templates=main local.address=10.1.1.1 local.role=ebgp remote.address=10.1.1.2 remote.as=64500 output.filter-chain=out-filter input.filter=in-filter',
          '/routing bgp session print',
        ],
        checks: [
          { kind: 'bgp-sessions', on: 'EDGE', count: 1 },
          { kind: 'ran', on: 'EDGE', pattern: 'bgp\\s+connection\\s+add' },
        ],
        solution: [
          SW('EDGE', [
            '/routing bgp connection add name=to-isp-a templates=main local.address=10.1.1.1 local.role=ebgp remote.address=10.1.1.2 remote.as=64500 output.filter-chain=out-filter input.filter=in-filter',
            '/routing bgp session print',
          ]),
        ],
      },
      {
        id: 't4',
        title: 'Connect to ISP-B',
        detail:
          'Create a BGP connection to ISP-B (10.2.1.2, AS 64501) using the same template and filters. Now you should have two eBGP sessions established.',
        hints: [
          '/routing bgp connection add name=to-isp-b templates=main local.address=10.2.1.1 local.role=ebgp remote.address=10.2.1.2 remote.as=64501 output.filter-chain=out-filter input.filter=in-filter',
          '/routing bgp session print should show 2 sessions',
        ],
        checks: [
          { kind: 'bgp-sessions', on: 'EDGE', count: 2 },
          { kind: 'ran', on: 'EDGE', pattern: 'bgp\\s+connection\\s+add' },
        ],
        solution: [
          SW('EDGE', [
            '/routing bgp connection add name=to-isp-b templates=main local.address=10.2.1.1 local.role=ebgp remote.address=10.2.1.2 remote.as=64501 output.filter-chain=out-filter input.filter=in-filter',
            '/routing bgp session print',
          ]),
        ],
      },
      {
        id: 't5',
        title: 'Check what routes you learned',
        detail:
          'Print the BGP routes EDGE learned: 192.0.2.0/24 from ISP-A and 203.0.113.0/24 from ISP-B. Also check that your own prefix is being advertised to both.',
        hints: [
          '/ip route print where bgp',
          '/routing bgp advertisements print',
        ],
        checks: [
          { kind: 'route', on: 'EDGE', dst: '192.0.2.0/24' },
          { kind: 'route', on: 'EDGE', dst: '203.0.113.0/24' },
          { kind: 'ran', on: 'EDGE', pattern: 'route\\s+print\\s+where\\s+bgp' },
        ],
        solution: [SW('EDGE', ['/ip route print where bgp', '/routing bgp advertisements print'])],
      },
    ],
  },
];
