import type { SimLab } from '../lib/sim/lab';
import { SWITCHING_LABS } from './simLabsSwitching';
import { LESSON_SIM_LABS } from './lessonLabs';
import { OSPF_LABS } from './simLabsOspf';

/**
 * Labs that run in the browser simulator. The topology (nodes and cables) comes from `labs.ts`, so the diagram and the
 * GNS3 wiring stay identical. Tasks are checked automatically; `solution` is what the "Show solution" button types.
 * tests/sim-labs.test.ts proves every solution finishes its task and that no task is done before you start.
 */
export const SIM_LABS: SimLab[] = [
  ...SWITCHING_LABS,
  ...LESSON_SIM_LABS,
  ...OSPF_LABS,
  {
    labId: 'three-router',
    intro: 'Three fresh routers and two PCs, cabled in a line. Click a device, then type RouterOS commands into its terminal. Nothing is configured yet: you build it all, exactly as you would in GNS3.',
    setup: [],
    tasks: [
      {
        id: 't1',
        title: 'Give every interface its address',
        detail:
          'R1: ether1 10.0.12.1/30 (to R2) and ether2 192.168.1.1/24 (LAN 1). R2: ether1 10.0.12.2/30 and ether2 10.0.23.1/30. R3: ether1 10.0.23.2/30 and ether2 192.168.3.1/24 (LAN 3). Then on the PCs: ip 192.168.1.10/24 192.168.1.1 (PC1) and ip 192.168.3.10/24 192.168.3.1 (PC3).',
        hints: [
          'On a router the command is /ip address add address=<ip>/<prefix> interface=<port>.',
          'Check your work with /ip address print. A /30 has two usable addresses: .1 and .2.',
          'On a PC the command is: ip <address>/<prefix> <gateway>.',
        ],
        checks: [
          { kind: 'address', on: 'R1', iface: 'ether1', address: '10.0.12.1/30' },
          { kind: 'address', on: 'R1', iface: 'ether2', address: '192.168.1.1/24' },
          { kind: 'address', on: 'R2', iface: 'ether1', address: '10.0.12.2/30' },
          { kind: 'address', on: 'R2', iface: 'ether2', address: '10.0.23.1/30' },
          { kind: 'address', on: 'R3', iface: 'ether1', address: '10.0.23.2/30' },
          { kind: 'address', on: 'R3', iface: 'ether2', address: '192.168.3.1/24' },
          { kind: 'pc', on: 'PC1', ip: '192.168.1.10', gateway: '192.168.1.1' },
          { kind: 'pc', on: 'PC3', ip: '192.168.3.10', gateway: '192.168.3.1' },
        ],
        solution: [
          { device: 'R1', commands: ['/ip address add address=10.0.12.1/30 interface=ether1 comment="to R2"', '/ip address add address=192.168.1.1/24 interface=ether2 comment="LAN1"'] },
          { device: 'R2', commands: ['/ip address add address=10.0.12.2/30 interface=ether1 comment="to R1"', '/ip address add address=10.0.23.1/30 interface=ether2 comment="to R3"'] },
          { device: 'R3', commands: ['/ip address add address=10.0.23.2/30 interface=ether1 comment="to R2"', '/ip address add address=192.168.3.1/24 interface=ether2 comment="LAN3"'] },
          { device: 'PC1', commands: ['ip 192.168.1.10/24 192.168.1.1'] },
          { device: 'PC3', commands: ['ip 192.168.3.10/24 192.168.3.1'] },
        ],
      },
      {
        id: 't2',
        title: 'Ping your neighbours',
        detail: 'From R1, ping R2 (10.0.12.2). Directly connected routers answer without any routing. Then try R3 from R1 (10.0.23.2): it should fail. Why?',
        hints: ['/ping 10.0.12.2', 'R1 has a connected route to 10.0.12.0/30 only. Look at it with /ip route print.'],
        checks: [
          { kind: 'ran', on: 'R1', pattern: '^\\s*/?ping\\s+10\\.0\\.12\\.2' },
          { kind: 'ran', on: 'R1', pattern: '^\\s*/?ping\\s+10\\.0\\.23\\.2' },
        ],
        solution: [{ device: 'R1', commands: ['/ping 10.0.12.2 count=2', '/ping 10.0.23.2 count=2'] }],
      },
      {
        id: 't3',
        title: 'Make the two LANs reach each other',
        detail: 'Add static routes so PC1 can reach PC3 and back. Every router needs a route to each network it is not directly connected to, in both directions.',
        hints: [
          'R1 needs routes to 10.0.23.0/30 and 192.168.3.0/24, both via 10.0.12.2.',
          'R2 needs 192.168.1.0/24 via 10.0.12.1 and 192.168.3.0/24 via 10.0.23.2.',
          'R3 needs 10.0.12.0/30 and 192.168.1.0/24, both via 10.0.23.1. Test with PC1> ping 192.168.3.10.',
        ],
        checks: [
          { kind: 'route', on: 'R1', dst: '192.168.3.0/24', via: '10.0.12.2' },
          { kind: 'route', on: 'R2', dst: '192.168.1.0/24', via: '10.0.12.1' },
          { kind: 'route', on: 'R3', dst: '192.168.1.0/24', via: '10.0.23.1' },
          { kind: 'ping', from: 'PC1', to: '192.168.3.10', expect: 'reply' },
          { kind: 'ping', from: 'PC3', to: '192.168.1.10', expect: 'reply' },
        ],
        solution: [
          { device: 'R1', commands: ['/ip route add dst-address=10.0.23.0/30 gateway=10.0.12.2 comment="R2-R3 link"', '/ip route add dst-address=192.168.3.0/24 gateway=10.0.12.2 comment="LAN3 via R2"'] },
          { device: 'R2', commands: ['/ip route add dst-address=192.168.1.0/24 gateway=10.0.12.1 comment="LAN1 via R1"', '/ip route add dst-address=192.168.3.0/24 gateway=10.0.23.2 comment="LAN3 via R3"'] },
          { device: 'R3', commands: ['/ip route add dst-address=10.0.12.0/30 gateway=10.0.23.1 comment="R1-R2 link"', '/ip route add dst-address=192.168.1.0/24 gateway=10.0.23.1 comment="LAN1 via R2"'] },
        ],
      },
      {
        id: 't4',
        title: 'Break it on purpose',
        detail: 'Remove R2\'s route to LAN 3 (192.168.3.0/24). Then ping PC3 from PC1 and use /tool traceroute on R1 to find which router stops the packet.',
        hints: ['/ip route print shows the numbers. Remove with /ip route remove <number> or /ip route remove [find where dst-address=192.168.3.0/24].', 'The traceroute stops after R2: its own routing table has no way forward.'],
        checks: [
          { kind: 'ran', on: 'R2', pattern: 'remove' },
          { kind: 'ping', from: 'PC1', to: '192.168.3.10', expect: 'fail' },
        ],
        solution: [{ device: 'R2', commands: ['/ip route remove [find where dst-address=192.168.3.0/24]'] }, { device: 'R1', commands: ['/tool traceroute 192.168.3.1 count=1 src-address=192.168.1.1'] }],
      },
      {
        id: 't5',
        title: 'Restore it and use a default route on R1',
        detail: 'Put R2\'s route back. Then replace R1\'s two specific routes with a single default route (0.0.0.0/0) towards R2 and confirm PC1 can still reach PC3.',
        hints: ['Re-add: /ip route add dst-address=192.168.3.0/24 gateway=10.0.23.2 on R2.', 'On R1: remove the static routes, then /ip route add dst-address=0.0.0.0/0 gateway=10.0.12.2.'],
        checks: [
          { kind: 'route', on: 'R1', dst: '0.0.0.0/0', via: '10.0.12.2' },
          { kind: 'route', on: 'R2', dst: '192.168.3.0/24', via: '10.0.23.2' },
          { kind: 'ping', from: 'PC1', to: '192.168.3.10', expect: 'reply' },
        ],
        solution: [
          { device: 'R2', commands: ['/ip route add dst-address=192.168.3.0/24 gateway=10.0.23.2 comment="LAN3 via R3"'] },
          { device: 'R1', commands: ['/ip route remove [find where dst-address=192.168.3.0/24]', '/ip route remove [find where dst-address=10.0.23.0/30]', '/ip route add dst-address=0.0.0.0/0 gateway=10.0.12.2'] },
        ],
      },
    ],
  },

  {
    labId: 'nat-port-forward',
    intro: 'A gateway with a default-drop firewall sits between the "internet" (ISP) and a server on the LAN. The addressing and firewall are already in place. Your job is NAT: let the LAN out, then publish the server.',
    setup: [
      { device: 'ISP', commands: ['/system identity set name=ISP', '/ip address add address=8.8.8.8/32 interface=lo comment="pretend public server"', '/ip address add address=203.0.113.1/30 interface=ether1 comment="to GW"'] },
      {
        device: 'GW',
        commands: [
          '/system identity set name=GW',
          '/ip address add address=203.0.113.2/30 interface=ether1 comment="WAN"',
          '/ip address add address=192.168.88.1/24 interface=ether2 comment="LAN"',
          '/ip route add dst-address=0.0.0.0/0 gateway=203.0.113.1',
          '/ip firewall filter add chain=input action=accept connection-state=established,related,untracked comment="accept established"',
          '/ip firewall filter add chain=input action=drop connection-state=invalid comment="drop invalid"',
          '/ip firewall filter add chain=input action=accept protocol=icmp comment="accept ICMP"',
          '/ip firewall filter add chain=input action=accept in-interface=ether2 comment="accept from LAN"',
          '/ip firewall filter add chain=input action=drop comment="drop everything else"',
          '/ip firewall filter add chain=forward action=accept connection-state=established,related,untracked comment="accept established"',
          '/ip firewall filter add chain=forward action=drop connection-state=invalid comment="drop invalid"',
          '/ip firewall filter add chain=forward action=drop connection-state=new connection-nat-state=!dstnat in-interface=ether1 comment="drop new from WAN unless port-forwarded"',
        ],
      },
      { device: 'SRV', commands: ['/system identity set name=SRV', '/ip address add address=192.168.88.10/24 interface=ether1', '/ip route add dst-address=0.0.0.0/0 gateway=192.168.88.1', '/ip service set www disabled=no port=80'] },
    ],
    tasks: [
      {
        id: 't1',
        title: 'Let the LAN reach the internet (source NAT)',
        detail: 'From SRV, ping 8.8.8.8: it fails, because the private LAN address cannot be routed on the internet. Fix it on GW with a masquerade rule out of the WAN port (ether1), then ping again.',
        hints: ['/ping 8.8.8.8 on SRV shows timeouts. The router GW can reach 8.8.8.8 itself, so the link and default route are fine.', 'On GW: /ip firewall nat add chain=srcnat action=masquerade out-interface=ether1'],
        checks: [{ kind: 'ping', from: 'SRV', to: '8.8.8.8', expect: 'reply' }],
        solution: [{ device: 'SRV', commands: ['/ping 8.8.8.8 count=2'] }, { device: 'GW', commands: ['/ip firewall nat add chain=srcnat action=masquerade out-interface=ether1 comment="masquerade to WAN"'] }],
      },
      {
        id: 't2',
        title: 'Try to reach the server from the internet',
        detail: 'On ISP run /tool fetch url="http://203.0.113.2:8080/" keep-result=no. It must fail. Then look at the firewall counters on GW: which rule dropped it, and in which chain?',
        hints: ['The packet is addressed to GW itself (203.0.113.2), so it is judged by the input chain, not forward.', '/ip firewall filter print stats on GW shows the "drop everything else" rule counting packets.'],
        checks: [
          { kind: 'ran', on: 'ISP', pattern: 'fetch' },
          { kind: 'tcp', from: 'ISP', to: '203.0.113.2', port: 8080, expect: 'fail' },
        ],
        solution: [{ device: 'ISP', commands: ['/tool fetch url="http://203.0.113.2:8080/" keep-result=no'] }, { device: 'GW', commands: ['/ip firewall filter print stats'] }],
      },
      {
        id: 't3',
        title: 'Publish the web server (destination NAT)',
        detail: 'Add a dst-nat rule on GW that sends TCP port 8080 arriving on the WAN to 192.168.88.10 port 80, then fetch again from ISP.',
        hints: ['/ip firewall nat add chain=dstnat action=dst-nat protocol=tcp dst-port=8080 in-interface=ether1 to-addresses=192.168.88.10 to-ports=80', 'No forward rule is needed: the last forward rule only drops new connections that were NOT port-forwarded.'],
        checks: [{ kind: 'tcp', from: 'ISP', to: '203.0.113.2', port: 8080, expect: 'connected' }],
        solution: [
          { device: 'GW', commands: ['/ip firewall nat add chain=dstnat action=dst-nat protocol=tcp dst-port=8080 in-interface=ether1 to-addresses=192.168.88.10 to-ports=80 comment="web"'] },
          { device: 'ISP', commands: ['/tool fetch url="http://203.0.113.2:8080/" keep-result=no'] },
        ],
      },
      {
        id: 't4',
        title: 'Break it: what does the "established" rule do?',
        detail: 'On GW remove the forward-chain "accept established" rule and fetch again. On RouterOS 7.16 nothing breaks yet. Then add a final rule "drop everything else" to the forward chain and try once more.',
        hints: ['/ip firewall filter remove [find where chain=forward and comment="accept established"]', 'Without a final drop-all, unmatched packets are accepted. Add /ip firewall filter add chain=forward action=drop and the replies are lost.'],
        checks: [
          { kind: 'ran', on: 'GW', pattern: 'filter remove' },
          { kind: 'tcp', from: 'ISP', to: '203.0.113.2', port: 8080, expect: 'fail' },
        ],
        solution: [
          { device: 'GW', commands: ['/ip firewall filter remove [find where chain=forward and comment="accept established"]', '/ip firewall filter add chain=forward action=drop comment="drop everything else"'] },
          { device: 'ISP', commands: ['/tool fetch url="http://203.0.113.2:8080/" keep-result=no'] },
        ],
      },
    ],
  },
];

export const simLabFor = (labId: string): SimLab | undefined => SIM_LABS.find((l) => l.labId === labId);
