import type { Lab, LabLink, LabNode } from './labs';
import type { SimLab } from '../lib/sim/lab';

const topo = (id: string, title: string, level: Lab['level'], minutes: number, summary: string, nodes: LabNode[], links: LabLink[]): Lab => ({
  id, title, level, minutes, summary, objectives: [], nodes, links, setup: [], tasks: [], verify: [], related: [],
});

const SW = (device: string, commands: string[]) => ({ device, commands });

export const MORE_TOPOLOGIES: Lab[] = [
  topo('subnet-carve', 'Carve a /24 into subnets', 'Beginner', 15, 'One router, two PCs. Split 192.168.10.0/24 into two /26 subnets and prove the router joins them.',
    [
      { id: 'PC1', label: 'PC1', kind: 'pc', x: 110, y: 130 },
      { id: 'R1', label: 'R1', kind: 'router', x: 320, y: 130 },
      { id: 'PC2', label: 'PC2', kind: 'pc', x: 530, y: 130 },
    ],
    [
      { a: 'PC1', ai: 'eth0', b: 'R1', bi: 'ether2', net: '192.168.10.0/26' },
      { a: 'R1', ai: 'ether3', b: 'PC2', bi: 'eth0', net: '192.168.10.64/26' },
    ]),

  topo('routeros-tour', 'A tour of RouterOS', 'Beginner', 15, 'One router and its terminal. Name it, address it, look around with print, and read its export.',
    [{ id: 'R1', label: 'R1', kind: 'router', x: 320, y: 130 }], []),

  topo('firewall-basics', 'Firewall rules: order decides', 'Beginner', 20, 'PC1 reaches R2 through R1. Block it, then let one host through, and see why the order of the rules matters.',
    [
      { id: 'PC1', label: 'PC1', kind: 'pc', x: 100, y: 130 },
      { id: 'R1', label: 'R1', kind: 'router', x: 300, y: 130 },
      { id: 'R2', label: 'R2', kind: 'router', x: 500, y: 130 },
    ],
    [
      { a: 'PC1', ai: 'eth0', b: 'R1', bi: 'ether2', net: '192.168.1.0/24' },
      { a: 'R1', ai: 'ether1', b: 'R2', bi: 'ether1', net: '10.0.12.0/30' },
    ]),

  topo('vlan-trunk', 'Carry two VLANs over one trunk', 'Beginner', 25, 'Two switches joined by one cable. Put PC1 and PC2 in VLAN 10 and PC3 in VLAN 20, and watch VLAN 10 cross the trunk.',
    [
      { id: 'PC1', label: 'PC1', kind: 'pc', x: 70, y: 130 },
      { id: 'SW1', label: 'SW1', kind: 'switch', x: 230, y: 130 },
      { id: 'SW2', label: 'SW2', kind: 'switch', x: 410, y: 130 },
      { id: 'PC2', label: 'PC2', kind: 'pc', x: 570, y: 60 },
      { id: 'PC3', label: 'PC3', kind: 'pc', x: 570, y: 200 },
    ],
    [
      { a: 'PC1', ai: 'eth0', b: 'SW1', bi: 'ether2' },
      { a: 'SW1', ai: 'ether1', b: 'SW2', bi: 'ether1' },
      { a: 'SW2', ai: 'ether2', b: 'PC2', bi: 'eth0' },
      { a: 'SW2', ai: 'ether3', b: 'PC3', bi: 'eth0' },
    ]),

  topo('secure-management-basics', 'Lock down the management plane', 'Advanced', 20, 'One router with an admin PC and an outside PC. Disable insecure services, restrict SSH to the admin subnet, then finish with drop-by-default.',
    [
      { id: 'PC-admin', label: 'PC-admin', kind: 'pc', x: 90, y: 130 },
      { id: 'R1', label: 'R1', kind: 'router', x: 320, y: 130 },
      { id: 'PC-outside', label: 'PC-outside', kind: 'pc', x: 550, y: 130 },
    ],
    [
      { a: 'PC-admin', ai: 'eth0', b: 'R1', bi: 'ether2', net: '10.0.5.0/24' },
      { a: 'R1', ai: 'ether1', b: 'PC-outside', bi: 'eth0', net: '192.0.2.0/24' },
    ]),
];

export const MORE_SIM_LABS: SimLab[] = [
  {
    labId: 'subnet-carve',
    intro: 'You have the block 192.168.10.0/24. A /26 holds 64 addresses, so the block splits into four: .0, .64, .128 and .192. Use the first two, one for each PC.',
    setup: [],
    tasks: [
      {
        id: 't1',
        title: 'Address the two router ports',
        detail: 'R1 ether2 (PC1 side) gets 192.168.10.1/26. R1 ether3 (PC2 side) gets 192.168.10.65/26. Each is the first usable address of its subnet.',
        hints: ['/ip address add address=192.168.10.1/26 interface=ether2', 'The second subnet starts at 192.168.10.64, so its first usable address is .65.'],
        checks: [
          { kind: 'address', on: 'R1', iface: 'ether2', address: '192.168.10.1/26' },
          { kind: 'address', on: 'R1', iface: 'ether3', address: '192.168.10.65/26' },
        ],
        solution: [SW('R1', ['/ip address add address=192.168.10.1/26 interface=ether2', '/ip address add address=192.168.10.65/26 interface=ether3'])],
      },
      {
        id: 't2',
        title: 'Address the PCs',
        detail: 'PC1: 192.168.10.10/26 with gateway 192.168.10.1. PC2: 192.168.10.70/26 with gateway 192.168.10.65. Each PC must use the gateway inside its own subnet.',
        hints: ['ip 192.168.10.10/26 192.168.10.1', 'PC2 lives in 192.168.10.64/26 (hosts .65 to .126), so .70 fits.'],
        checks: [
          { kind: 'pc', on: 'PC1', ip: '192.168.10.10', gateway: '192.168.10.1' },
          { kind: 'pc', on: 'PC2', ip: '192.168.10.70', gateway: '192.168.10.65' },
        ],
        solution: [SW('PC1', ['ip 192.168.10.10/26 192.168.10.1']), SW('PC2', ['ip 192.168.10.70/26 192.168.10.65'])],
      },
      {
        id: 't3',
        title: 'Cross between the subnets',
        detail: 'Ping PC2 from PC1. The two subnets are different networks, so the packet must go through R1. It works with no routes because R1 is connected to both.',
        hints: ['On PC1: ping 192.168.10.70', 'Print the routes on R1 with /ip route print and find the two connected networks.'],
        checks: [
          { kind: 'ping', from: 'PC1', to: '192.168.10.70', expect: 'reply' },
          { kind: 'ran', on: 'R1', pattern: '^\\s*/?ip\\s+route\\s+print' },
        ],
        solution: [SW('PC1', ['ping 192.168.10.70']), SW('R1', ['/ip route print'])],
      },
    ],
  },
  {
    labId: 'routeros-tour',
    intro: 'R1 is a factory-fresh router with nothing configured. There is no cable to anything: this lab is only about the command line.',
    setup: [],
    tasks: [
      {
        id: 't1',
        title: 'Give the router a name',
        detail: 'Set the system identity to edge-1 and print it back. The identity is the name shown in logs and in your prompt.',
        hints: ['/system identity set name=edge-1', '/system identity print'],
        checks: [
          { kind: 'ran', on: 'R1', pattern: '^\\s*/?system\\s+identity\\s+set\\s+name=edge-1' },
          { kind: 'ran', on: 'R1', pattern: '^\\s*/?system\\s+identity\\s+print' },
        ],
        solution: [SW('R1', ['/system identity set name=edge-1', '/system identity print'])],
      },
      {
        id: 't2',
        title: 'Add an address with a comment',
        detail: 'Put 10.10.10.1/24 on ether1 with the comment "lan". Comments make an export much easier to read later.',
        hints: ['/ip address add address=10.10.10.1/24 interface=ether1 comment="lan"'],
        checks: [{ kind: 'address', on: 'R1', iface: 'ether1', address: '10.10.10.1/24' }],
        solution: [SW('R1', ['/ip address add address=10.10.10.1/24 interface=ether1 comment="lan"'])],
      },
      {
        id: 't3',
        title: 'Look around with print',
        detail: 'Run print on three menus: /interface print, /ip address print and /ip route print. Notice the connected route RouterOS created by itself for your new address.',
        hints: ['/interface print', '/ip address print', '/ip route print'],
        checks: [
          { kind: 'ran', on: 'R1', pattern: '^\\s*/?interface\\s+print' },
          { kind: 'ran', on: 'R1', pattern: '^\\s*/?ip\\s+address\\s+print' },
          { kind: 'ran', on: 'R1', pattern: '^\\s*/?ip\\s+route\\s+print' },
        ],
        solution: [SW('R1', ['/interface print', '/ip address print', '/ip route print'])],
      },
      {
        id: 't4',
        title: 'Read the configuration as text',
        detail: 'Run /export to see everything you configured, then /ip address export to see one menu only. Then disable ether2 and print the interfaces to spot the X flag.',
        hints: ['/export', '/ip address export', '/interface disable ether2, then /interface print'],
        checks: [
          { kind: 'ran', on: 'R1', pattern: '^\\s*/?export' },
          { kind: 'ran', on: 'R1', pattern: 'address\\s+export' },
          { kind: 'ran', on: 'R1', pattern: '^\\s*/?interface\\s+disable\\s+ether2' },
        ],
        solution: [SW('R1', ['/export', '/ip address export', '/interface disable ether2', '/interface print'])],
      },
    ],
  },
  {
    labId: 'firewall-basics',
    intro: 'The network is already built and PC1 can reach R2. You will control what PC1 may send through R1 with the forward chain.',
    setup: [
      SW('R1', [
        '/ip address add address=10.0.12.1/30 interface=ether1',
        '/ip address add address=192.168.1.1/24 interface=ether2',
        '/ip route add dst-address=0.0.0.0/0 gateway=10.0.12.2',
      ]),
      SW('R2', ['/ip address add address=10.0.12.2/30 interface=ether1', '/ip route add dst-address=192.168.1.0/24 gateway=10.0.12.1']),
      SW('PC1', ['ip 192.168.1.10/24 192.168.1.1']),
    ],
    tasks: [
      {
        id: 't1',
        title: 'Check that it works first',
        detail: 'From PC1 ping R2 (10.0.12.2). Always test before you add rules, so you know what "working" looked like.',
        hints: ['On PC1: ping 10.0.12.2'],
        checks: [
          { kind: 'ran', on: 'PC1', pattern: '^\\s*ping\\s+10\\.0\\.12\\.2' },
          { kind: 'ping', from: 'PC1', to: '10.0.12.2', expect: 'reply' },
        ],
        solution: [SW('PC1', ['ping 10.0.12.2'])],
      },
      {
        id: 't2',
        title: 'Block the LAN from pinging out',
        detail: 'On R1 add a forward rule that drops ICMP from 192.168.1.0/24. Ping again from PC1: it now times out (a drop is silent).',
        hints: ['/ip firewall filter add chain=forward action=drop protocol=icmp src-address=192.168.1.0/24', 'Then ping from PC1 again.'],
        checks: [
          { kind: 'ran', on: 'R1', pattern: 'firewall\\s+filter\\s+add.*action=drop' },
          { kind: 'ping', from: 'PC1', to: '10.0.12.2', expect: 'fail' },
        ],
        solution: [SW('R1', ['/ip firewall filter add chain=forward action=drop protocol=icmp src-address=192.168.1.0/24 comment="block lan ping"']), SW('PC1', ['ping 10.0.12.2'])],
      },
      {
        id: 't3',
        title: 'Let one host through: order matters',
        detail: 'Add an accept rule for PC1 (192.168.1.10) and put it above the drop rule with place-before=0. If it is below the drop, it never matches, because the first matching rule wins.',
        hints: ['/ip firewall filter add chain=forward action=accept protocol=icmp src-address=192.168.1.10 place-before=0', 'Print the rules to check the order: /ip firewall filter print'],
        checks: [
          { kind: 'ran', on: 'R1', pattern: 'action=accept.*place-before=0' },
          { kind: 'ping', from: 'PC1', to: '10.0.12.2', expect: 'reply' },
        ],
        solution: [SW('R1', ['/ip firewall filter add chain=forward action=accept protocol=icmp src-address=192.168.1.10 place-before=0 comment="allow pc1"']), SW('PC1', ['ping 10.0.12.2'])],
      },
      {
        id: 't4',
        title: 'Read the counters',
        detail: 'Print the rules with statistics. The accept rule counts the packets it let through; the drop rule counts what it blocked before you added the accept rule.',
        hints: ['/ip firewall filter print stats'],
        checks: [{ kind: 'ran', on: 'R1', pattern: 'firewall\\s+filter\\s+print\\s+stats' }],
        solution: [SW('R1', ['/ip firewall filter print stats'])],
      },
    ],
  },
  {
    labId: 'vlan-trunk',
    intro: 'SW1 and SW2 are empty switches. PC1 and PC2 must be in VLAN 10 on different switches, and PC3 in VLAN 20. One trunk cable carries both VLANs.',
    setup: [],
    tasks: [
      {
        id: 't1',
        title: 'Bridge and ports on SW1',
        detail: 'On SW1 create bridge1. ether1 is the trunk (admit-only-vlan-tagged). ether2 is an access port for PC1 (pvid=10, admit-only-untagged-and-priority-tagged). Leave VLAN filtering off until the end.',
        hints: ['/interface bridge add name=bridge1 vlan-filtering=no', '/interface bridge port add bridge=bridge1 interface=ether1 frame-types=admit-only-vlan-tagged'],
        checks: [
          { kind: 'bridge', on: 'SW1', name: 'bridge1' },
          { kind: 'bridge-port', on: 'SW1', iface: 'ether1', frameTypes: 'admit-only-vlan-tagged' },
          { kind: 'bridge-port', on: 'SW1', iface: 'ether2', pvid: 10 },
        ],
        solution: [
          SW('SW1', [
            '/interface bridge add name=bridge1 vlan-filtering=no',
            '/interface bridge port add bridge=bridge1 interface=ether1 frame-types=admit-only-vlan-tagged comment="trunk"',
            '/interface bridge port add bridge=bridge1 interface=ether2 pvid=10 frame-types=admit-only-untagged-and-priority-tagged comment="PC1"',
          ]),
        ],
      },
      {
        id: 't2',
        title: 'Bridge and ports on SW2',
        detail: 'On SW2: trunk on ether1, PC2 on ether2 (pvid 10), PC3 on ether3 (pvid 20).',
        hints: ['Same commands as SW1, plus ether3 with pvid=20.'],
        checks: [
          { kind: 'bridge', on: 'SW2', name: 'bridge1' },
          { kind: 'bridge-port', on: 'SW2', iface: 'ether1', frameTypes: 'admit-only-vlan-tagged' },
          { kind: 'bridge-port', on: 'SW2', iface: 'ether2', pvid: 10 },
          { kind: 'bridge-port', on: 'SW2', iface: 'ether3', pvid: 20 },
        ],
        solution: [
          SW('SW2', [
            '/interface bridge add name=bridge1 vlan-filtering=no',
            '/interface bridge port add bridge=bridge1 interface=ether1 frame-types=admit-only-vlan-tagged comment="trunk"',
            '/interface bridge port add bridge=bridge1 interface=ether2 pvid=10 frame-types=admit-only-untagged-and-priority-tagged comment="PC2"',
            '/interface bridge port add bridge=bridge1 interface=ether3 pvid=20 frame-types=admit-only-untagged-and-priority-tagged comment="PC3"',
          ]),
        ],
      },
      {
        id: 't3',
        title: 'The VLAN tables, then filtering last',
        detail: 'SW1: VLAN 10 tagged on ether1, untagged on ether2. SW2: VLAN 10 tagged on ether1, untagged on ether2; VLAN 20 tagged on ether1, untagged on ether3. Then turn vlan-filtering on for both bridges.',
        hints: ['/interface bridge vlan add bridge=bridge1 vlan-ids=10 tagged=ether1 untagged=ether2', '/interface bridge set bridge1 vlan-filtering=yes (last!)'],
        checks: [
          { kind: 'bvlan', on: 'SW1', vlan: 10, tagged: ['ether1'], untagged: ['ether2'] },
          { kind: 'bvlan', on: 'SW2', vlan: 10, tagged: ['ether1'], untagged: ['ether2'] },
          { kind: 'bvlan', on: 'SW2', vlan: 20, tagged: ['ether1'], untagged: ['ether3'] },
          { kind: 'bridge', on: 'SW1', name: 'bridge1', vlanFiltering: true },
          { kind: 'bridge', on: 'SW2', name: 'bridge1', vlanFiltering: true },
        ],
        solution: [
          SW('SW1', ['/interface bridge vlan add bridge=bridge1 vlan-ids=10 tagged=ether1 untagged=ether2', '/interface bridge set bridge1 vlan-filtering=yes']),
          SW('SW2', [
            '/interface bridge vlan add bridge=bridge1 vlan-ids=10 tagged=ether1 untagged=ether2',
            '/interface bridge vlan add bridge=bridge1 vlan-ids=20 tagged=ether1 untagged=ether3',
            '/interface bridge set bridge1 vlan-filtering=yes',
          ]),
        ],
      },
      {
        id: 't4',
        title: 'Prove it: same VLAN across the trunk, other VLAN blocked',
        detail: 'PC1 10.0.10.11/24 and PC2 10.0.10.12/24 (VLAN 10); PC3 10.0.20.13/24 (VLAN 20), all with a gateway on their own subnet. PC1 must reach PC2 over the trunk, but not PC3.',
        hints: ['ip 10.0.10.11/24 10.0.10.1', 'ping 10.0.10.12 works; ping 10.0.20.13 times out because there is no router between the VLANs.'],
        checks: [
          { kind: 'pc', on: 'PC1', ip: '10.0.10.11', gateway: '10.0.10.1' },
          { kind: 'pc', on: 'PC2', ip: '10.0.10.12', gateway: '10.0.10.1' },
          { kind: 'pc', on: 'PC3', ip: '10.0.20.13', gateway: '10.0.20.1' },
          { kind: 'ping', from: 'PC1', to: '10.0.10.12', expect: 'reply' },
          { kind: 'ping', from: 'PC1', to: '10.0.20.13', expect: 'fail' },
        ],
        solution: [
          SW('PC1', ['ip 10.0.10.11/24 10.0.10.1']),
          SW('PC2', ['ip 10.0.10.12/24 10.0.10.1']),
          SW('PC3', ['ip 10.0.20.13/24 10.0.20.1']),
          SW('PC1', ['ping 10.0.10.12', 'ping 10.0.20.13']),
        ],
      },
    ],
  },
  {
    labId: 'secure-management-basics',
    intro: 'R1 is factory fresh, addressed and reachable from both sides. Every service is on by default, and nothing restricts who can reach them. Lock the management plane down, one step at a time.',
    setup: [
      SW('R1', [
        '/ip address add address=10.0.5.1/24 interface=ether2',
        '/ip address add address=192.0.2.1/24 interface=ether1',
      ]),
      SW('PC-admin', ['ip 10.0.5.10/24 10.0.5.1']),
      SW('PC-outside', ['ip 192.0.2.10/24 192.0.2.1']),
    ],
    tasks: [
      {
        id: 't1',
        title: 'Check the starting point',
        detail: 'SSH (port 22) reaches R1 from both PC-admin and PC-outside right now, because every service starts enabled and nothing filters the input chain. That is the problem this lab fixes.',
        hints: ['On PC-admin: ping 10.0.5.1', 'On PC-outside: ping 192.0.2.1'],
        checks: [
          { kind: 'ran', on: 'PC-admin', pattern: '^\\s*ping\\s+10\\.0\\.5\\.1' },
          { kind: 'ran', on: 'PC-outside', pattern: '^\\s*ping\\s+192\\.0\\.2\\.1' },
          { kind: 'ping', from: 'PC-admin', to: '10.0.5.1', expect: 'reply' },
          { kind: 'ping', from: 'PC-outside', to: '192.0.2.1', expect: 'reply' },
        ],
        solution: [SW('PC-admin', ['ping 10.0.5.1']), SW('PC-outside', ['ping 192.0.2.1'])],
      },
      {
        id: 't2',
        title: 'Disable what you do not use',
        detail: 'Telnet, FTP and plain HTTP send credentials in clear text. Disable all three on R1 and leave SSH and Winbox running.',
        hints: ['/ip service disable telnet,ftp,www', '/ip service print to check what is left enabled'],
        checks: [
          { kind: 'ran', on: 'R1', pattern: 'ip\\s+service\\s+disable\\s+telnet' },
        ],
        solution: [SW('R1', ['/ip service disable telnet,ftp,www'])],
      },
      {
        id: 't3',
        title: 'Restrict SSH to the admin subnet',
        detail: 'Add an input firewall rule on R1 that drops SSH (TCP port 22) from anywhere outside 10.0.5.0/24. PC-outside should no longer be able to open an SSH session; PC-admin still can.',
        hints: ['/ip firewall filter add chain=input action=drop protocol=tcp dst-port=22 src-address=!10.0.5.0/24 comment="ssh admin only"', 'The ! negates the address: this matches everyone except the admin subnet.'],
        checks: [
          { kind: 'ran', on: 'R1', pattern: 'action=drop.*dst-port=22.*src-address=!10\\.0\\.5\\.0/24' },
          { kind: 'tcp', from: 'PC-outside', to: '192.0.2.1', port: 22, expect: 'fail' },
          { kind: 'tcp', from: 'PC-admin', to: '10.0.5.1', port: 22, expect: 'connected' },
        ],
        solution: [SW('R1', ['/ip firewall filter add chain=input action=drop protocol=tcp dst-port=22 src-address=!10.0.5.0/24 comment="ssh admin only"'])],
      },
      {
        id: 't4',
        title: 'Finish with drop-by-default',
        detail: 'Accept established and related traffic, accept everything from the admin subnet, then drop everything else that reaches the router itself. Order matters: the SSH rule from the last task must stay above this new accept-admin rule, or it never gets a chance to match.',
        hints: [
          '/ip firewall filter add chain=input action=accept connection-state=established,related',
          '/ip firewall filter add chain=input action=accept src-address=10.0.5.0/24',
          '/ip firewall filter add chain=input action=drop comment="drop by default"',
        ],
        checks: [
          { kind: 'ran', on: 'R1', pattern: 'action=accept\\s+connection-state=established,related' },
          { kind: 'ran', on: 'R1', pattern: 'action=accept\\s+src-address=10\\.0\\.5\\.0/24' },
          { kind: 'ran', on: 'R1', pattern: 'action=drop\\s+comment="drop by default"' },
          { kind: 'ping', from: 'PC-outside', to: '192.0.2.1', expect: 'fail' },
          { kind: 'ping', from: 'PC-admin', to: '10.0.5.1', expect: 'reply' },
          { kind: 'tcp', from: 'PC-admin', to: '10.0.5.1', port: 22, expect: 'connected' },
        ],
        solution: [
          SW('R1', [
            '/ip firewall filter add chain=input action=accept connection-state=established,related',
            '/ip firewall filter add chain=input action=accept src-address=10.0.5.0/24',
            '/ip firewall filter add chain=input action=drop comment="drop by default"',
          ]),
        ],
      },
    ],
  },
];
