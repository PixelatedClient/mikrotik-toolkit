import type { Lab, LabLink, LabNode } from './labs';
import type { SimLab } from '../lib/sim/lab';

const topo = (id: string, title: string, level: Lab['level'], minutes: number, summary: string, nodes: LabNode[], links: LabLink[]): Lab => ({
  id, title, level, minutes, summary, objectives: [], nodes, links, setup: [], tasks: [], verify: [], related: [],
});
const SW = (device: string, commands: string[]) => ({ device, commands });

export const WIREGUARD_TOPOLOGIES: Lab[] = [
  topo('wireguard-basics', 'A WireGuard tunnel between two sites', 'Intermediate', 25, 'ISP1 and ISP2 share a link. Build a WireGuard tunnel over it and route each side\'s LAN through the tunnel.',
    [
      { id: 'ISP1', label: 'ISP1', kind: 'router', x: 180, y: 130 },
      { id: 'ISP2', label: 'ISP2', kind: 'router', x: 440, y: 130 },
    ],
    [{ a: 'ISP1', ai: 'ether1', b: 'ISP2', bi: 'ether1', net: '10.1.1.0/30' }]),
];

/** The WireGuard engine needs no special model: once a peer exists and the interface has an address, it works like
 * any other interface. Verified against real RouterOS 7.16; see tools/conformance/scenarios/wireguard.json. */
export const WIREGUARD_LABS: SimLab[] = [
  {
    labId: 'wireguard-basics',
    intro: 'ISP1 and ISP2 are connected over 10.1.1.0/30. You will build a WireGuard tunnel between them and route each side\'s private LAN through it.',
    setup: [
      SW('ISP1', ['/ip address add address=10.1.1.1/30 interface=ether1']),
      SW('ISP2', ['/ip address add address=10.1.1.2/30 interface=ether1']),
    ],
    tasks: [
      {
        id: 't1',
        title: 'Create the tunnel interface',
        detail: 'Add a WireGuard interface on each router and give it a tunnel address in its own small subnet. RouterOS generates a key pair for you the moment the interface is created.',
        hints: ['/interface wireguard add name=wg0', '/ip address add address=10.9.9.1/30 interface=wg0', 'Print the interface to see its public key: /interface wireguard print'],
        checks: [
          { kind: 'address', on: 'ISP1', iface: 'wg0', address: '10.9.9.1/30' },
          { kind: 'address', on: 'ISP2', iface: 'wg0', address: '10.9.9.2/30' },
          { kind: 'ran', on: 'ISP1', pattern: 'wireguard\\s+print' },
        ],
        solution: [
          SW('ISP1', ['/interface wireguard add name=wg0', '/ip address add address=10.9.9.1/30 interface=wg0', '/interface wireguard print']),
          SW('ISP2', ['/interface wireguard add name=wg0', '/ip address add address=10.9.9.2/30 interface=wg0']),
        ],
      },
      {
        id: 't2',
        title: 'Add each other as a peer',
        detail: 'A tunnel needs two matching halves. On each router, add a peer with the OTHER router\'s public key, its address as the endpoint, and allowed-address for the tunnel address plus the LAN behind it.',
        hints: [
          'Read the public key from /interface wireguard print on the OTHER router first.',
          '/interface wireguard peers add interface=wg0 public-key="<the other router\'s key>" endpoint-address=10.1.1.2 endpoint-port=13231 allowed-address=10.9.9.2/32,192.168.20.0/24',
          'Swap the numbers around for ISP2\'s peer entry.',
        ],
        checks: [
          { kind: 'ran', on: 'ISP1', pattern: 'wireguard\\s+peers\\s+add' },
          { kind: 'ran', on: 'ISP2', pattern: 'wireguard\\s+peers\\s+add' },
          { kind: 'ping', from: 'ISP1', to: '10.9.9.2', expect: 'reply' },
        ],
        solution: [
          SW('ISP1', ['/interface wireguard peers add interface=wg0 public-key="du6tbb6HP4hytSnrBmQZdoVG+SfI2mYN4PP8S1i0TIJ=" endpoint-address=10.1.1.2 endpoint-port=13231 allowed-address=10.9.9.2/32,192.168.20.0/24']),
          SW('ISP2', ['/interface wireguard peers add interface=wg0 public-key="gX/HrRA9wclJuAPU3/TEvgW1P0tZ21sTu+Px3vGXIqO=" endpoint-address=10.1.1.1 endpoint-port=13231 allowed-address=10.9.9.1/32,192.168.10.0/24']),
          SW('ISP1', ['/ping 10.9.9.2 count=3']),
        ],
      },
      {
        id: 't3',
        title: 'Route the LANs through the tunnel',
        detail: 'The tunnel address answers, but a whole remote LAN needs a route. Point each side at the other\'s LAN with the tunnel interface as the gateway.',
        hints: ['/ip route add dst-address=192.168.20.0/24 gateway=wg0', 'The matching route on ISP2 points at 192.168.10.0/24.'],
        checks: [
          { kind: 'route', on: 'ISP1', dst: '192.168.20.0/24', via: 'wg0' },
          { kind: 'route', on: 'ISP2', dst: '192.168.10.0/24', via: 'wg0' },
        ],
        solution: [
          SW('ISP1', ['/ip route add dst-address=192.168.20.0/24 gateway=wg0']),
          SW('ISP2', ['/ip route add dst-address=192.168.10.0/24 gateway=wg0']),
        ],
      },
      {
        id: 't4',
        title: 'Check the peer',
        detail: 'Print the peer in detail. current-endpoint-address is the address actually in use, separate from the endpoint-address you configured, which matters when a peer roams.',
        hints: ['/interface wireguard peers print detail'],
        checks: [{ kind: 'ran', on: 'ISP1', pattern: 'wireguard\\s+peers\\s+print\\s+detail' }],
        solution: [SW('ISP1', ['/interface wireguard peers print detail'])],
      },
    ],
  },
];
