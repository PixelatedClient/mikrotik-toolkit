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
  {
    labId: 'ospf-chain',
    intro:
      'Four routers in a line: R1 → R2 → R3 → R4. R1 has LAN1, R4 has LAN4. Each link costs 10. You will build OSPF to route traffic through the entire chain and learn how accumulated costs work.',
    setup: [
      SW('R1', [
        '/interface bridge add name=loopback comment="loopback"',
        '/ip address add address=10.255.0.1/32 interface=loopback',
        '/ip address add address=10.0.12.1/30 interface=ether1 comment="to R2"',
        '/ip address add address=192.168.10.1/24 interface=ether3 comment="LAN1"',
      ]),
      SW('R2', [
        '/interface bridge add name=loopback comment="loopback"',
        '/ip address add address=10.255.0.2/32 interface=loopback',
        '/ip address add address=10.0.12.2/30 interface=ether1 comment="to R1"',
        '/ip address add address=10.0.23.1/30 interface=ether2 comment="to R3"',
      ]),
      SW('R3', [
        '/interface bridge add name=loopback comment="loopback"',
        '/ip address add address=10.255.0.3/32 interface=loopback',
        '/ip address add address=10.0.23.2/30 interface=ether1 comment="to R2"',
        '/ip address add address=10.0.34.1/30 interface=ether2 comment="to R4"',
      ]),
      SW('R4', [
        '/interface bridge add name=loopback comment="loopback"',
        '/ip address add address=10.255.0.4/32 interface=loopback',
        '/ip address add address=10.0.34.2/30 interface=ether1 comment="to R3"',
        '/ip address add address=192.168.40.1/24 interface=ether3 comment="LAN4"',
      ]),
      SW('PC1', ['ip 192.168.10.10/24 192.168.10.1']),
      SW('PC4', ['ip 192.168.40.10/24 192.168.40.1']),
    ],
    tasks: [
      {
        id: 't1',
        title: 'Start OSPF with instances and the backbone area',
        detail:
          'On each router create an OSPF instance with its loopback as router-id (10.255.0.1 to .4), then create the backbone area 0.0.0.0.',
        hints: [
          '/routing ospf instance add name=ospf1 version=2 router-id=10.255.0.1',
          '/routing ospf area add name=backbone area-id=0.0.0.0 instance=ospf1',
          'Repeat on R2, R3, and R4 with their respective router-ids.',
        ],
        checks: [
          { kind: 'ran', on: 'R1', pattern: 'ospf\\s+instance\\s+add' },
          { kind: 'ran', on: 'R2', pattern: 'ospf\\s+instance\\s+add' },
          { kind: 'ran', on: 'R3', pattern: 'ospf\\s+instance\\s+add' },
          { kind: 'ran', on: 'R4', pattern: 'ospf\\s+instance\\s+add' },
        ],
        solution: [
          SW('R1', ['/routing ospf instance add name=ospf1 version=2 router-id=10.255.0.1', '/routing ospf area add name=backbone area-id=0.0.0.0 instance=ospf1']),
          SW('R2', ['/routing ospf instance add name=ospf1 version=2 router-id=10.255.0.2', '/routing ospf area add name=backbone area-id=0.0.0.0 instance=ospf1']),
          SW('R3', ['/routing ospf instance add name=ospf1 version=2 router-id=10.255.0.3', '/routing ospf area add name=backbone area-id=0.0.0.0 instance=ospf1']),
          SW('R4', ['/routing ospf instance add name=ospf1 version=2 router-id=10.255.0.4', '/routing ospf area add name=backbone area-id=0.0.0.0 instance=ospf1']),
        ],
      },
      {
        id: 't2',
        title: 'Add OSPF interface templates for all links',
        detail:
          'Add templates for each link (all cost 10) and mark LANs and loopbacks as passive. R1 and R4 each have 2 templates, R2 and R3 each have 3.',
        hints: [
          'R1: /routing ospf interface-template add area=backbone networks=10.0.12.0/30 cost=10 type=ptp, then passive templates for LAN1 and loopback',
          'R2: templates for 10.0.12.0/30 and 10.0.23.0/30 (both cost 10), then loopback passive',
          'R3: templates for 10.0.23.0/30 and 10.0.34.0/30 (both cost 10), then loopback passive',
          'R4: template for 10.0.34.0/30 and passive templates for LAN4 and loopback',
        ],
        checks: [
          { kind: 'ran', on: 'R1', pattern: 'ospf\\s+interface-template\\s+add' },
          { kind: 'ran', on: 'R2', pattern: 'ospf\\s+interface-template\\s+add' },
          { kind: 'ran', on: 'R3', pattern: 'ospf\\s+interface-template\\s+add' },
          { kind: 'ran', on: 'R4', pattern: 'ospf\\s+interface-template\\s+add' },
        ],
        solution: [
          SW('R1', [
            '/routing ospf interface-template add area=backbone networks=10.0.12.0/30 cost=10 type=ptp',
            '/routing ospf interface-template add area=backbone networks=192.168.10.0/24 passive',
            '/routing ospf interface-template add area=backbone networks=10.255.0.1/32 passive',
          ]),
          SW('R2', [
            '/routing ospf interface-template add area=backbone networks=10.0.12.0/30 cost=10 type=ptp',
            '/routing ospf interface-template add area=backbone networks=10.0.23.0/30 cost=10 type=ptp',
            '/routing ospf interface-template add area=backbone networks=10.255.0.2/32 passive',
          ]),
          SW('R3', [
            '/routing ospf interface-template add area=backbone networks=10.0.23.0/30 cost=10 type=ptp',
            '/routing ospf interface-template add area=backbone networks=10.0.34.0/30 cost=10 type=ptp',
            '/routing ospf interface-template add area=backbone networks=10.255.0.3/32 passive',
          ]),
          SW('R4', [
            '/routing ospf interface-template add area=backbone networks=10.0.34.0/30 cost=10 type=ptp',
            '/routing ospf interface-template add area=backbone networks=192.168.40.0/24 passive',
            '/routing ospf interface-template add area=backbone networks=10.255.0.4/32 passive',
          ]),
          SW('R1', ['/routing ospf neighbor print']),
        ],
      },
      {
        id: 't3',
        title: 'Predict the path and confirm it',
        detail:
          'From R1, traffic to 192.168.40.0/24 goes through all four routers: cost is 10+10+10+1=31. Confirm with the routing table and traceroute from PC1. The next hop from R1 should be 10.0.12.2 (R2).',
        hints: ['/ip route print where ospf on R1', 'On PC1: trace 192.168.40.10'],
        checks: [
          { kind: 'route', on: 'R1', dst: '192.168.40.0/24', via: '10.0.12.2' },
          { kind: 'ping', from: 'PC1', to: '192.168.40.10', expect: 'reply' },
          { kind: 'ran', on: 'R1', pattern: 'route\\s+print\\s+where\\s+ospf' },
        ],
        solution: [SW('R1', ['/ip route print where ospf']), SW('PC1', ['trace 192.168.40.10', 'ping 192.168.40.10'])],
      },
      {
        id: 't4',
        title: 'Break the chain and measure the outage',
        detail:
          'On R1 disable ether1 (the link to R2). OSPF neighbour R2 disappears from R1\'s table and the route to LAN4 vanishes. Ping from PC1 to PC4 fails.',
        hints: ['/interface disable ether1 on R1', '/routing ospf neighbor print shows no neighbours on R1', '/ip route print shows no OSPF routes on R1'],
        checks: [
          { kind: 'ran', on: 'R1', pattern: 'interface\\s+disable\\s+ether1' },
          { kind: 'ospf-neighbors', on: 'R1', count: 0 },
          { kind: 'ping', from: 'PC1', to: '192.168.40.10', expect: 'fail' },
        ],
        solution: [SW('R1', ['/interface disable ether1', '/routing ospf neighbor print', '/ip route print where ospf']), SW('PC1', ['ping 192.168.40.10'])],
      },
      {
        id: 't5',
        title: 'Restore the chain',
        detail:
          'Enable ether1 on R1 again. The neighbour to R2 returns, routes reappear, and PC1 can ping PC4 again. The convergence is instant in the simulator.',
        hints: ['/interface enable ether1 on R1', '/routing ospf neighbor print to verify R2 returns', '/ip route print to verify the route is back'],
        checks: [
          { kind: 'ran', on: 'R1', pattern: 'interface\\s+enable\\s+ether1' },
          { kind: 'ospf-neighbors', on: 'R1', count: 1 },
          { kind: 'route', on: 'R1', dst: '192.168.40.0/24', via: '10.0.12.2' },
          { kind: 'ping', from: 'PC1', to: '192.168.40.10', expect: 'reply' },
        ],
        solution: [SW('R1', ['/interface enable ether1', '/routing ospf neighbor print']), SW('R1', ['/ip route print where ospf']), SW('PC1', ['ping 192.168.40.10'])],
      },
    ],
  },
  {
    labId: 'ospf-mesh',
    intro:
      'Four routers in a square: R1 top-left, R2 top-right, R4 bottom-right, R3 bottom-left. A diagonal link from R1 to R4 with high cost creates redundancy. PC1 on R1, PC4 on R3. You configure OSPF and watch path selection in a mesh.',
    setup: [
      SW('R1', [
        '/interface bridge add name=loopback',
        '/ip address add address=10.255.0.1/32 interface=loopback',
        '/ip address add address=10.0.12.1/30 interface=ether1 comment="to R2"',
        '/ip address add address=10.0.13.1/30 interface=ether2 comment="to R3"',
        '/ip address add address=10.0.14.1/30 interface=ether4 comment="to R4 (expensive)"',
        '/ip address add address=192.168.1.1/24 interface=ether3 comment="LAN1"',
      ]),
      SW('R2', [
        '/interface bridge add name=loopback',
        '/ip address add address=10.255.0.2/32 interface=loopback',
        '/ip address add address=10.0.12.2/30 interface=ether1 comment="to R1"',
        '/ip address add address=10.0.24.1/30 interface=ether2 comment="to R4"',
      ]),
      SW('R3', [
        '/interface bridge add name=loopback',
        '/ip address add address=10.255.0.3/32 interface=loopback',
        '/ip address add address=10.0.13.2/30 interface=ether1 comment="to R1"',
        '/ip address add address=10.0.34.2/30 interface=ether2 comment="to R4"',
        '/ip address add address=192.168.4.1/24 interface=ether3 comment="LAN4"',
      ]),
      SW('R4', [
        '/interface bridge add name=loopback',
        '/ip address add address=10.255.0.4/32 interface=loopback',
        '/ip address add address=10.0.24.2/30 interface=ether2 comment="to R2"',
        '/ip address add address=10.0.34.1/30 interface=ether1 comment="to R3"',
        '/ip address add address=10.0.14.2/30 interface=ether3 comment="to R1 (expensive)"',
      ]),
      SW('PC1', ['ip 192.168.1.10/24 192.168.1.1']),
      SW('PC4', ['ip 192.168.4.10/24 192.168.4.1']),
    ],
    tasks: [
      {
        id: 't1',
        title: 'Set up OSPF: instances, areas, templates',
        detail:
          'On each router: create OSPF instance with loopback as router-id, create backbone area, add templates for all connected links (square edges cost 10, diagonal R1-R4 costs 100).',
        hints: [
          'R1: instance router-id 10.255.0.1, then add 3 templates (10.0.12.0/30, 10.0.13.0/30, 10.0.14.0/30 with costs 10,10,100)',
          'R2: instance router-id 10.255.0.2, then 2 templates (10.0.12.0/30 cost 10, 10.0.24.0/30 cost 10)',
          'Similarly for R3 and R4. Don\'t forget loopback and LAN as passive.',
        ],
        checks: [
          { kind: 'ran', on: 'R1', pattern: 'ospf\\s+instance\\s+add' },
          { kind: 'ran', on: 'R2', pattern: 'ospf\\s+interface-template' },
          { kind: 'ran', on: 'R3', pattern: 'ospf\\s+interface-template' },
          { kind: 'ran', on: 'R4', pattern: 'ospf\\s+interface-template' },
        ],
        solution: [
          SW('R1', [
            '/routing ospf instance add name=ospf1 version=2 router-id=10.255.0.1',
            '/routing ospf area add name=backbone area-id=0.0.0.0 instance=ospf1',
            '/routing ospf interface-template add area=backbone networks=10.0.12.0/30 cost=10 type=ptp',
            '/routing ospf interface-template add area=backbone networks=10.0.13.0/30 cost=10 type=ptp',
            '/routing ospf interface-template add area=backbone networks=10.0.14.0/30 cost=100 type=ptp',
            '/routing ospf interface-template add area=backbone networks=192.168.1.0/24 passive',
            '/routing ospf interface-template add area=backbone networks=10.255.0.1/32 passive',
          ]),
          SW('R2', [
            '/routing ospf instance add name=ospf1 version=2 router-id=10.255.0.2',
            '/routing ospf area add name=backbone area-id=0.0.0.0 instance=ospf1',
            '/routing ospf interface-template add area=backbone networks=10.0.12.0/30 cost=10 type=ptp',
            '/routing ospf interface-template add area=backbone networks=10.0.24.0/30 cost=10 type=ptp',
            '/routing ospf interface-template add area=backbone networks=10.255.0.2/32 passive',
          ]),
          SW('R3', [
            '/routing ospf instance add name=ospf1 version=2 router-id=10.255.0.3',
            '/routing ospf area add name=backbone area-id=0.0.0.0 instance=ospf1',
            '/routing ospf interface-template add area=backbone networks=10.0.13.0/30 cost=10 type=ptp',
            '/routing ospf interface-template add area=backbone networks=10.0.34.0/30 cost=10 type=ptp',
            '/routing ospf interface-template add area=backbone networks=192.168.4.0/24 passive',
            '/routing ospf interface-template add area=backbone networks=10.255.0.3/32 passive',
          ]),
          SW('R4', [
            '/routing ospf instance add name=ospf1 version=2 router-id=10.255.0.4',
            '/routing ospf area add name=backbone area-id=0.0.0.0 instance=ospf1',
            '/routing ospf interface-template add area=backbone networks=10.0.24.0/30 cost=10 type=ptp',
            '/routing ospf interface-template add area=backbone networks=10.0.34.0/30 cost=10 type=ptp',
            '/routing ospf interface-template add area=backbone networks=10.0.14.0/30 cost=100 type=ptp',
            '/routing ospf interface-template add area=backbone networks=10.255.0.4/32 passive',
          ]),
        ],
      },
      {
        id: 't2',
        title: 'Verify all neighbours formed and check path to PC4',
        detail:
          'Each router should see: R1(3 neighbours), R2(2), R3(2), R4(3). Check the route from R1 to 192.168.4.0/24 - it should prefer the R1→R3→R4 path (cost 21) over the diagonal (cost 101).',
        hints: [
          '/routing ospf neighbor print on each router',
          '/ip route print where ospf on R1 to see the route',
          'Traceroute should show: PC1 → 192.168.1.1 → 10.0.13.2 (R3) → 192.168.4.1 (R4 LAN address)',
        ],
        checks: [
          { kind: 'ospf-neighbors', on: 'R1', count: 3 },
          { kind: 'ospf-neighbors', on: 'R2', count: 2 },
          { kind: 'ospf-neighbors', on: 'R3', count: 2 },
          { kind: 'ospf-neighbors', on: 'R4', count: 3 },
          { kind: 'route', on: 'R1', dst: '192.168.4.0/24', via: '10.0.13.2' },
          { kind: 'ping', from: 'PC1', to: '192.168.4.10', expect: 'reply' },
        ],
        solution: [
          SW('R1', ['/ip route print where ospf']),
          SW('PC1', ['ping 192.168.4.10']),
        ],
      },
      {
        id: 't3',
        title: 'Break the R1-R3 link',
        detail:
          'Disable R1 ether2 (link to R3). R1 should now take the R1→R2→R4 path instead (same cost 21). Traceroute should now go through R2.',
        hints: [
          '/interface disable ether2 on R1',
          'Check the route again: should still be cost 21 but via 10.0.12.2 (R2) instead of 10.0.13.2',
        ],
        checks: [
          { kind: 'ran', on: 'R1', pattern: 'interface\\s+disable\\s+ether2' },
          { kind: 'ospf-neighbors', on: 'R1', count: 2 },
          { kind: 'route', on: 'R1', dst: '192.168.4.0/24', via: '10.0.12.2' },
          { kind: 'ping', from: 'PC1', to: '192.168.4.10', expect: 'reply' },
        ],
        solution: [SW('R1', ['/interface disable ether2', '/ip route print where ospf']), SW('PC1', ['ping 192.168.4.10'])],
      },
      {
        id: 't4',
        title: 'Break the R1-R2 link and force the diagonal',
        detail:
          'Disable R1 ether1 (link to R2) as well. Now only the expensive diagonal remains (cost 101). Both R3 and R2 neighbours should be gone. Traceroute now goes direct R1→R4.',
        hints: ['/interface disable ether1 on R1', 'Route cost jumps to 101, via 10.0.14.2 (R4 direct)'],
        checks: [
          { kind: 'ran', on: 'R1', pattern: 'interface\\s+disable\\s+ether1' },
          { kind: 'ospf-neighbors', on: 'R1', count: 1 },
          { kind: 'route', on: 'R1', dst: '192.168.4.0/24', via: '10.0.14.2' },
          { kind: 'ping', from: 'PC1', to: '192.168.4.10', expect: 'reply' },
        ],
        solution: [SW('R1', ['/interface disable ether1', '/routing ospf neighbor print', '/ip route print where ospf']), SW('PC1', ['ping 192.168.4.10'])],
      },
      {
        id: 't5',
        title: 'Restore the chain',
        detail:
          'Enable both R1 ether1 and ether2. Neighbours return, the cheaper paths reappear. R1 should go back to using R3 as the first-hop neighbor (cost 21 again).',
        hints: [
          '/interface enable ether2 and ether1 on R1',
          'Verify 3 neighbours are back on R1',
          'Route should now be via 10.0.13.2 again (or 10.0.12.2, both cost 21)',
        ],
        checks: [
          { kind: 'ran', on: 'R1', pattern: 'interface\\s+enable' },
          { kind: 'ospf-neighbors', on: 'R1', count: 3 },
          { kind: 'ping', from: 'PC1', to: '192.168.4.10', expect: 'reply' },
        ],
        solution: [SW('R1', ['/interface enable ether2', '/interface enable ether1', '/routing ospf neighbor print']), SW('R1', ['/ip route print where ospf'])],
      },
    ],
  },
];
