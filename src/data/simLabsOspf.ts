import type { SimLab } from '../lib/sim/lab';

const SW = (device: string, commands: string[]) => ({ device, commands });

/**
 * OSPF labs for the browser simulator. The OSPF model (neighbours, costs, learned routes, failover) was checked against
 * real RouterOS 7.16 routers; see tools/conformance/scenarios/ospf.json.
 */
export const OSPF_LABS: SimLab[] = [
  {
    labId: 'ospf-triangle',
    intro:
      'Three routers in a triangle. Addresses, loopbacks and the two PCs are already set up. You configure OSPF, watch it choose the cheap path, cut that path and watch traffic fail over to the expensive one. R1 to R2 to R3 costs 10 + 10; the direct R1 to R3 link costs 100.',
    setup: [
      SW('R1', [
        '/interface bridge add name=loopback comment="loopback"',
        '/ip address add address=10.255.0.1/32 interface=loopback',
        '/ip address add address=10.1.12.1/30 interface=ether1 comment="to R2"',
        '/ip address add address=10.1.13.1/30 interface=ether2 comment="to R3 (expensive backup)"',
        '/ip address add address=192.168.10.1/24 interface=ether3 comment="LAN1"',
      ]),
      SW('R2', [
        '/interface bridge add name=loopback comment="loopback"',
        '/ip address add address=10.255.0.2/32 interface=loopback',
        '/ip address add address=10.1.12.2/30 interface=ether1 comment="to R1"',
        '/ip address add address=10.1.23.1/30 interface=ether2 comment="to R3"',
      ]),
      SW('R3', [
        '/interface bridge add name=loopback comment="loopback"',
        '/ip address add address=10.255.0.3/32 interface=loopback',
        '/ip address add address=10.1.23.2/30 interface=ether1 comment="to R2"',
        '/ip address add address=10.1.13.2/30 interface=ether2 comment="to R1 (expensive backup)"',
        '/ip address add address=192.168.30.1/24 interface=ether3 comment="LAN3"',
      ]),
      SW('PC1', ['ip 192.168.10.10/24 192.168.10.1']),
      SW('PC3', ['ip 192.168.30.10/24 192.168.30.1']),
    ],
    tasks: [
      {
        id: 't1',
        title: 'Start OSPF: an instance and the backbone area on every router',
        detail:
          'On each router create an OSPF instance (router-id = its loopback address: 10.255.0.1, .2, .3) and the backbone area 0.0.0.0. Nothing is advertised yet, so there are no neighbours.',
        hints: [
          '/routing ospf instance add name=ospf1 version=2 router-id=10.255.0.1',
          '/routing ospf area add name=backbone area-id=0.0.0.0 instance=ospf1',
          'Do the same on R2 (router-id 10.255.0.2) and R3 (router-id 10.255.0.3).',
        ],
        checks: [
          { kind: 'ran', on: 'R1', pattern: 'ospf\\s+instance\\s+add' },
          { kind: 'ran', on: 'R2', pattern: 'ospf\\s+instance\\s+add' },
          { kind: 'ran', on: 'R3', pattern: 'ospf\\s+instance\\s+add' },
          { kind: 'ran', on: 'R1', pattern: 'ospf\\s+area\\s+add' },
          { kind: 'ran', on: 'R2', pattern: 'ospf\\s+area\\s+add' },
          { kind: 'ran', on: 'R3', pattern: 'ospf\\s+area\\s+add' },
        ],
        solution: [
          SW('R1', ['/routing ospf instance add name=ospf1 version=2 router-id=10.255.0.1', '/routing ospf area add name=backbone area-id=0.0.0.0 instance=ospf1']),
          SW('R2', ['/routing ospf instance add name=ospf1 version=2 router-id=10.255.0.2', '/routing ospf area add name=backbone area-id=0.0.0.0 instance=ospf1']),
          SW('R3', ['/routing ospf instance add name=ospf1 version=2 router-id=10.255.0.3', '/routing ospf area add name=backbone area-id=0.0.0.0 instance=ospf1']),
        ],
      },
      {
        id: 't2',
        title: 'Turn OSPF on for the interfaces and find the neighbours',
        detail:
          'An interface template tells RouterOS which networks run OSPF and at what cost. Add one for each link (R1 to R2 and R2 to R3 cost 10, R1 to R3 costs 100) and mark LANs and loopbacks passive: they are advertised but send no hellos. Then check that R1 has two neighbours in state Full.',
        hints: [
          'R1: /routing ospf interface-template add area=backbone networks=10.1.12.0/30 cost=10 type=ptp',
          'R1: ... networks=10.1.13.0/30 cost=100 type=ptp, then networks=192.168.10.0/24 passive and networks=10.255.0.1/32 passive',
          'passive is a bare word: passive=yes is a syntax error on RouterOS 7.16. Check with /routing ospf neighbor print.',
        ],
        checks: [
          { kind: 'ospf-neighbors', on: 'R1', count: 2 },
          { kind: 'ospf-neighbors', on: 'R2', count: 2 },
          { kind: 'ospf-neighbors', on: 'R3', count: 2 },
          { kind: 'ran', on: 'R1', pattern: 'ospf\\s+neighbor\\s+print' },
        ],
        solution: [
          SW('R1', [
            '/routing ospf interface-template add area=backbone networks=10.1.12.0/30 cost=10 type=ptp',
            '/routing ospf interface-template add area=backbone networks=10.1.13.0/30 cost=100 type=ptp',
            '/routing ospf interface-template add area=backbone networks=192.168.10.0/24 passive',
            '/routing ospf interface-template add area=backbone networks=10.255.0.1/32 passive',
          ]),
          SW('R2', [
            '/routing ospf interface-template add area=backbone networks=10.1.12.0/30 cost=10 type=ptp',
            '/routing ospf interface-template add area=backbone networks=10.1.23.0/30 cost=10 type=ptp',
            '/routing ospf interface-template add area=backbone networks=10.255.0.2/32 passive',
          ]),
          SW('R3', [
            '/routing ospf interface-template add area=backbone networks=10.1.23.0/30 cost=10 type=ptp',
            '/routing ospf interface-template add area=backbone networks=10.1.13.0/30 cost=100 type=ptp',
            '/routing ospf interface-template add area=backbone networks=192.168.30.0/24 passive',
            '/routing ospf interface-template add area=backbone networks=10.255.0.3/32 passive',
          ]),
          SW('R1', ['/routing ospf neighbor print']),
        ],
      },
      {
        id: 't3',
        title: 'Predict the path, then confirm it',
        detail:
          'From R1, which way will traffic to 192.168.30.0/24 go, and what is the total cost? Through R2 it is 10 + 10 + 1 = 21, the direct link is 100 + 1 = 101. Confirm with the routing table (OSPF routes carry the flag o) and a traceroute from PC1.',
        hints: ['/ip route print where ospf', 'On PC1: trace 192.168.30.10 (first hop 192.168.10.1, then R2 at 10.1.12.2)'],
        checks: [
          { kind: 'route', on: 'R1', dst: '192.168.30.0/24', via: '10.1.12.2' },
          { kind: 'ping', from: 'PC1', to: '192.168.30.10', expect: 'reply' },
          { kind: 'ran', on: 'R1', pattern: 'route\\s+print\\s+where\\s+ospf' },
        ],
        solution: [SW('R1', ['/ip route print where ospf']), SW('PC1', ['trace 192.168.30.10', 'ping 192.168.30.10'])],
      },
      {
        id: 't4',
        title: 'Cut the cheap path',
        detail:
          'On R1 disable ether1 (the cable to R2) and look at the neighbours and the route again. OSPF now sends the traffic over the expensive direct link to R3. Ping from PC1 still works.',
        hints: ['/interface disable ether1', '/routing ospf neighbor print, then /ip route print where ospf. The next hop to 192.168.30.0/24 is now 10.1.13.2.'],
        checks: [
          { kind: 'ran', on: 'R1', pattern: 'interface\\s+disable\\s+ether1' },
          { kind: 'ospf-neighbors', on: 'R1', count: 1 },
          { kind: 'route', on: 'R1', dst: '192.168.30.0/24', via: '10.1.13.2' },
          { kind: 'ping', from: 'PC1', to: '192.168.30.10', expect: 'reply' },
        ],
        solution: [SW('R1', ['/interface disable ether1', '/routing ospf neighbor print', '/ip route print where ospf']), SW('PC1', ['ping 192.168.30.10'])],
      },
      {
        id: 't5',
        title: 'Change the design: prefer the direct link',
        detail:
          'Enable ether1 again. Now make the direct R1 to R3 link the preferred one by lowering its cost to 5 on BOTH ends: the R1 template for 10.1.13.0/30 and the R3 template for the same link. Real routers behave asymmetrically until both ends are changed.',
        hints: [
          '/interface enable ether1',
          '/routing ospf interface-template set [find where networks=10.1.13.0/30] cost=5 (on R1 and on R3)',
          'The path from R1 to 192.168.30.0/24 should now use 10.1.13.2 even with all links up.',
        ],
        checks: [
          { kind: 'ran', on: 'R1', pattern: 'interface\\s+enable\\s+ether1' },
          { kind: 'ospf-neighbors', on: 'R1', count: 2 },
          { kind: 'route', on: 'R1', dst: '192.168.30.0/24', via: '10.1.13.2' },
          { kind: 'route', on: 'R3', dst: '192.168.10.0/24', via: '10.1.13.1' },
        ],
        solution: [
          SW('R1', ['/interface enable ether1', '/routing ospf interface-template set [find where networks=10.1.13.0/30] cost=5']),
          SW('R3', ['/routing ospf interface-template set [find where networks=10.1.13.0/30] cost=5']),
        ],
      },
    ],
  },
];
