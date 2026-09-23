import type { SimLab } from '../lib/sim/lab';

const SW = (device: string, commands: string[]) => ({ device, commands });

/** Browser labs about switching: VLANs on a bridge, and spanning tree. Topology comes from `labs.ts`. */
export const SWITCHING_LABS: SimLab[] = [
  {
    labId: 'inter-vlan-routing',
    intro:
      'R1 is already configured: it has a VLAN interface, DHCP server and firewall for staff (10), guest (20) and management (99), all on its trunk port ether2. SW1 is a blank switch. Build its bridge, ports and VLAN table, then watch the PCs get addresses and find out what the firewall lets through.',
    setup: [
      SW('R1', [
        '/system identity set name=R1',
        '/interface vlan add name=vlan10-staff interface=ether2 vlan-id=10',
        '/interface vlan add name=vlan20-guest interface=ether2 vlan-id=20',
        '/interface vlan add name=vlan99-mgmt interface=ether2 vlan-id=99',
        '/ip address add address=10.0.10.1/24 interface=vlan10-staff',
        '/ip address add address=10.0.20.1/24 interface=vlan20-guest',
        '/ip address add address=10.0.99.1/24 interface=vlan99-mgmt',
        '/ip pool add name=pool-staff ranges=10.0.10.10-10.0.10.254',
        '/ip pool add name=pool-guest ranges=10.0.20.10-10.0.20.254',
        '/ip dhcp-server add name=dhcp-staff interface=vlan10-staff address-pool=pool-staff lease-time=1h disabled=no',
        '/ip dhcp-server add name=dhcp-guest interface=vlan20-guest address-pool=pool-guest lease-time=1h disabled=no',
        '/ip dhcp-server network add address=10.0.10.0/24 gateway=10.0.10.1 dns-server=10.0.10.1',
        '/ip dhcp-server network add address=10.0.20.0/24 gateway=10.0.20.1 dns-server=10.0.20.1',
        '/ip firewall filter add chain=input action=accept connection-state=established,related,untracked comment="accept established"',
        '/ip firewall filter add chain=input action=drop connection-state=invalid comment="drop invalid"',
        '/ip firewall filter add chain=input action=accept protocol=icmp comment="accept ICMP"',
        '/ip firewall filter add chain=input action=accept in-interface=vlan99-mgmt comment="management VLAN may manage the router"',
        '/ip firewall filter add chain=input action=drop comment="drop everything else"',
        '/ip firewall filter add chain=forward action=accept connection-state=established,related,untracked comment="accept established"',
        '/ip firewall filter add chain=forward action=drop connection-state=invalid comment="drop invalid"',
        '/ip firewall filter add chain=forward action=accept in-interface=vlan10-staff out-interface=vlan20-guest comment="staff may reach guest"',
        '/ip firewall filter add chain=forward action=drop comment="isolate everything else"',
      ]),
    ],
    tasks: [
      {
        id: 't1',
        title: 'Build the bridge and its ports on SW1',
        detail:
          'Create bridge1 (leave vlan-filtering off for now, so you cannot lock yourself out). Add ether1 as the trunk (frame-types=admit-only-vlan-tagged), ether2 and ether4 as access ports for VLAN 10 (pvid=10) and ether3 as an access port for VLAN 20 (pvid=20). Access ports should only admit untagged frames: frame-types=admit-only-untagged-and-priority-tagged.',
        hints: [
          '/interface bridge add name=bridge1 vlan-filtering=no',
          '/interface bridge port add bridge=bridge1 interface=ether1 frame-types=admit-only-vlan-tagged',
          'The pvid is the VLAN an untagged frame gets when it enters the port. Check with /interface bridge port print.',
        ],
        checks: [
          { kind: 'bridge', on: 'SW1', name: 'bridge1', vlanFiltering: false },
          { kind: 'bridge-port', on: 'SW1', iface: 'ether1', frameTypes: 'admit-only-vlan-tagged' },
          { kind: 'bridge-port', on: 'SW1', iface: 'ether2', pvid: 10, frameTypes: 'admit-only-untagged-and-priority-tagged' },
          { kind: 'bridge-port', on: 'SW1', iface: 'ether3', pvid: 20, frameTypes: 'admit-only-untagged-and-priority-tagged' },
          { kind: 'bridge-port', on: 'SW1', iface: 'ether4', pvid: 10, frameTypes: 'admit-only-untagged-and-priority-tagged' },
        ],
        solution: [
          SW('SW1', [
            '/interface bridge add name=bridge1 vlan-filtering=no',
            '/interface bridge port add bridge=bridge1 interface=ether1 frame-types=admit-only-vlan-tagged comment="trunk to R1"',
            '/interface bridge port add bridge=bridge1 interface=ether2 pvid=10 frame-types=admit-only-untagged-and-priority-tagged comment="PC1 staff"',
            '/interface bridge port add bridge=bridge1 interface=ether3 pvid=20 frame-types=admit-only-untagged-and-priority-tagged comment="PC2 guest"',
            '/interface bridge port add bridge=bridge1 interface=ether4 pvid=10 frame-types=admit-only-untagged-and-priority-tagged comment="PC3 staff"',
          ]),
        ],
      },
      {
        id: 't2',
        title: 'Fill in the bridge VLAN table',
        detail: 'VLAN 10: tagged on ether1, untagged on ether2 and ether4. VLAN 20: tagged on ether1, untagged on ether3. VLAN 99 (management): tagged on the bridge itself and on ether1. A port cannot be both tagged and untagged in the same VLAN.',
        hints: [
          '/interface bridge vlan add bridge=bridge1 vlan-ids=10 tagged=ether1 untagged=ether2,ether4',
          'The bridge itself is a member too: use tagged=bridge1,ether1 for VLAN 99, because the switch will have an address on that VLAN.',
        ],
        checks: [
          { kind: 'bvlan', on: 'SW1', vlan: 10, tagged: ['ether1'], untagged: ['ether2', 'ether4'] },
          { kind: 'bvlan', on: 'SW1', vlan: 20, tagged: ['ether1'], untagged: ['ether3'] },
          { kind: 'bvlan', on: 'SW1', vlan: 99, tagged: ['bridge1', 'ether1'], untagged: [] },
        ],
        solution: [
          SW('SW1', [
            '/interface bridge vlan add bridge=bridge1 vlan-ids=10 tagged=ether1 untagged=ether2,ether4 comment="staff"',
            '/interface bridge vlan add bridge=bridge1 vlan-ids=20 tagged=ether1 untagged=ether3 comment="guest"',
            '/interface bridge vlan add bridge=bridge1 vlan-ids=99 tagged=bridge1,ether1 comment="mgmt"',
          ]),
        ],
      },
      {
        id: 't3',
        title: 'Manage the switch, and turn VLAN filtering on last',
        detail: 'Give SW1 a management address on VLAN 99 (10.0.99.2/24 on a VLAN interface on the bridge, with a default route via 10.0.99.1). Only then enable vlan-filtering, and prove it works by pinging R1 (10.0.99.1) from SW1.',
        hints: [
          '/interface vlan add name=vlan99-mgmt interface=bridge1 vlan-id=99, then /ip address add address=10.0.99.2/24 interface=vlan99-mgmt',
          'Enabling filtering is the last step: /interface bridge set bridge1 vlan-filtering=yes. On a real switch, doing it earlier can lock you out.',
        ],
        checks: [
          { kind: 'bridge', on: 'SW1', name: 'bridge1', vlanFiltering: true },
          { kind: 'address', on: 'SW1', iface: 'vlan99-mgmt', address: '10.0.99.2/24' },
          { kind: 'ping', from: 'SW1', to: '10.0.99.1', expect: 'reply' },
        ],
        solution: [
          SW('SW1', [
            '/interface vlan add name=vlan99-mgmt interface=bridge1 vlan-id=99',
            '/ip address add address=10.0.99.2/24 interface=vlan99-mgmt',
            '/ip route add dst-address=0.0.0.0/0 gateway=10.0.99.1',
            '/interface bridge set bridge1 vlan-filtering=yes',
            '/ping 10.0.99.1 count=2',
          ]),
        ],
      },
      {
        id: 't4',
        title: 'Get addresses on the PCs',
        detail: 'On each PC type dhcp. PC1 and PC3 (staff) should land in 10.0.10.0/24 and PC2 (guest) in 10.0.20.0/24. Notice that RouterOS hands out the highest free address in the pool first.',
        hints: ['PC1> dhcp', 'If a PC says "Can\'t find dhcp server", the VLAN is not reaching the router: check the trunk, the VLAN table and the pvid of that port.'],
        checks: [
          { kind: 'pc-in', on: 'PC1', net: '10.0.10.0/24' },
          { kind: 'pc-in', on: 'PC2', net: '10.0.20.0/24' },
          { kind: 'pc-in', on: 'PC3', net: '10.0.10.0/24' },
        ],
        solution: [SW('PC1', ['dhcp']), SW('PC2', ['dhcp']), SW('PC3', ['dhcp'])],
      },
      {
        id: 't5',
        title: 'Same VLAN, no router',
        detail: 'Ping PC3 from PC1. They share VLAN 10, so the switch forwards the frames directly and R1 never sees them. Then look at the MAC table on SW1: /interface bridge host print.',
        hints: ['PC1> show ip, then ping the address PC3 got.', '/interface bridge host print shows each PC MAC learned on its own port and VLAN.'],
        checks: [
          { kind: 'ping', from: 'PC1', to: '@PC3', expect: 'reply' },
          { kind: 'ran', on: 'SW1', pattern: 'host' },
        ],
        solution: [SW('PC1', ['ping 10.0.10.253']), SW('SW1', ['/interface bridge host print'])],
      },
      {
        id: 't6',
        title: 'Cross the router, and find what the firewall allows',
        detail: 'Ping PC2 (guest) from PC1 (staff): it works because of the forward rule "staff may reach guest". Then ping PC1 from PC2: it must fail. Use /ip firewall filter print stats on R1 to see which rule counted the dropped packets.',
        hints: ['PC1> ping 10.0.20.254 and PC2> ping 10.0.10.254', 'On R1 the last forward rule, "isolate everything else", counts the packets that were dropped.'],
        checks: [
          { kind: 'ping', from: 'PC1', to: '@PC2', expect: 'reply' },
          { kind: 'ping', from: 'PC2', to: '@PC1', expect: 'fail' },
          { kind: 'ran', on: 'R1', pattern: 'filter print' },
        ],
        solution: [SW('PC1', ['ping 10.0.20.254']), SW('PC2', ['ping 10.0.10.254']), SW('R1', ['/ip firewall filter print stats'])],
      },
      {
        id: 't7',
        title: 'Fix a wiring mistake: move PC3 to the guest VLAN',
        detail: 'Change only the switch: give ether4 pvid 20, take it out of the VLAN 10 untagged list and put it in the VLAN 20 untagged list. Then renew PC3\'s address with dhcp: it should now be in 10.0.20.0/24.',
        hints: ['/interface bridge port set [find where interface=ether4] pvid=20', '/interface bridge vlan set [find where vlan-ids=10 and dynamic=no] untagged=ether2 and the same for VLAN 20 with untagged=ether3,ether4. Without dynamic=no the selection also catches the automatic "added by pvid" row and RouterOS answers "no such item (4)" after applying your change (the same happens on a real router).'],
        checks: [
          { kind: 'bridge-port', on: 'SW1', iface: 'ether4', pvid: 20 },
          { kind: 'bvlan', on: 'SW1', vlan: 20, tagged: ['ether1'], untagged: ['ether3', 'ether4'] },
          { kind: 'pc-in', on: 'PC3', net: '10.0.20.0/24' },
        ],
        solution: [
          SW('SW1', [
            '/interface bridge port set [find where interface=ether4] pvid=20',
            '/interface bridge vlan set [find where vlan-ids=10 and dynamic=no] untagged=ether2',
            '/interface bridge vlan set [find where vlan-ids=20 and dynamic=no] untagged=ether3,ether4',
          ]),
          SW('PC3', ['dhcp']),
        ],
      },
    ],
  },

  {
    labId: 'rstp-triangle',
    intro:
      'Three switches in a triangle, all running RSTP. SW1 has priority 0x1000, SW2 0x2000 and SW3 the default 0x8000. Everything is configured; your job is to predict, observe and break it. The simulator converges instantly, while real RSTP took about 3 seconds after a silent failure (and classic STP about 34 seconds) on the routers used to check this lab.',
    setup: [
      SW('SW1', ['/system identity set name=SW1', '/interface bridge add name=bridge1 protocol-mode=rstp priority=0x1000 comment="root bridge"', '/interface bridge port add bridge=bridge1 interface=ether1 comment="to SW2"', '/interface bridge port add bridge=bridge1 interface=ether2 comment="to SW3"', '/ip address add address=10.20.0.1/24 interface=bridge1 comment="management"']),
      SW('SW2', ['/system identity set name=SW2', '/interface bridge add name=bridge1 protocol-mode=rstp priority=0x2000 comment="backup root"', '/interface bridge port add bridge=bridge1 interface=ether1 comment="to SW1"', '/interface bridge port add bridge=bridge1 interface=ether2 comment="to SW3"', '/interface bridge port add bridge=bridge1 interface=ether3 edge=yes bpdu-guard=yes comment="PC1, edge port"', '/ip address add address=10.20.0.2/24 interface=bridge1 comment="management"']),
      SW('SW3', ['/system identity set name=SW3', '/interface bridge add name=bridge1 protocol-mode=rstp comment="leaf, default priority"', '/interface bridge port add bridge=bridge1 interface=ether1 comment="to SW2"', '/interface bridge port add bridge=bridge1 interface=ether2 comment="to SW1"', '/interface bridge port add bridge=bridge1 interface=ether3 edge=yes bpdu-guard=yes comment="PC2, edge port"', '/ip address add address=10.20.0.3/24 interface=bridge1 comment="management"']),
      SW('PC1', ['ip 10.20.0.11/24']),
      SW('PC2', ['ip 10.20.0.12/24']),
    ],
    tasks: [
      {
        id: 't1',
        title: 'Who is the root bridge?',
        detail: 'Predict first: the lowest bridge ID (priority, then MAC) wins. Then run /interface bridge monitor bridge1 once on SW1 and on SW2 and compare root-bridge, root-bridge-id, root-path-cost and root-port.',
        hints: ['SW1 has the lowest priority (0x1000), so it should say root-bridge: yes.', 'Every link is 1 Gbps, which costs 20000 per hop in RouterOS.'],
        checks: [{ kind: 'ran', on: 'SW1', pattern: 'monitor' }, { kind: 'ran', on: 'SW2', pattern: 'monitor' }],
        solution: [SW('SW1', ['/interface bridge monitor bridge1 once']), SW('SW2', ['/interface bridge monitor bridge1 once'])],
      },
      {
        id: 't2',
        title: 'Read the port roles',
        detail: 'Run /interface bridge port monitor [find] once on SW3 and on SW2. Which port on SW3 is alternate (blocked) and why? Which port is its root port?',
        hints: ['SW3 has two paths to the root: directly to SW1 (cost 20000) and via SW2 (cost 40000). The costlier one is blocked.', 'On the SW2 to SW3 link the port on SW2 is designated because SW2 has the lower bridge ID.'],
        checks: [{ kind: 'ran', on: 'SW3', pattern: 'port monitor' }, { kind: 'ran', on: 'SW2', pattern: 'port monitor' }],
        solution: [SW('SW3', ['/interface bridge port monitor [find] once']), SW('SW2', ['/interface bridge port monitor [find] once'])],
      },
      {
        id: 't3',
        title: 'Follow the traffic',
        detail: 'Ping PC2 (10.20.0.12) from PC1. Which path does it take, and why is the SW2 to SW3 link not used? Then look at the host table on SW1: it should learn both PCs, one on each inter-switch port.',
        hints: ['PC1> ping 10.20.0.12', '/interface bridge host print on SW1 shows the learned MAC addresses and the port they were learned on.'],
        checks: [{ kind: 'ping', from: 'PC1', to: '10.20.0.12', expect: 'reply' }, { kind: 'ran', on: 'SW1', pattern: 'host print' }],
        solution: [SW('PC1', ['ping 10.20.0.12']), SW('SW1', ['/interface bridge host print'])],
      },
      {
        id: 't4',
        title: 'Cut the root port and watch it recover',
        detail: 'Disable ether1 on SW1 (the link to SW2). Which port takes over as SW2\'s root port, and does the ping between the PCs still work?',
        hints: ['/interface disable ether1 on SW1', 'SW2 now reaches the root through SW3, so its root port becomes ether2 and its root path cost doubles.'],
        checks: [
          { kind: 'ran', on: 'SW1', pattern: 'disable' },
          { kind: 'stp-root-port', on: 'SW2', bridge: 'bridge1', port: 'ether2' },
          { kind: 'ping', from: 'PC1', to: '10.20.0.12', expect: 'reply' },
        ],
        solution: [SW('SW1', ['/interface disable ether1']), SW('SW2', ['/interface bridge monitor bridge1 once']), SW('PC1', ['ping 10.20.0.12'])],
      },
      {
        id: 't5',
        title: 'Restore the link and move the root to SW3',
        detail: 'Enable ether1 on SW1 again. Then give SW3 the lowest priority (0x0000). Predict the new port roles on all three switches, then verify them.',
        hints: ['/interface enable ether1', '/interface bridge set bridge1 priority=0x0000 on SW3. Then SW1 and SW2 each use their direct link to SW3 as root port.'],
        checks: [
          { kind: 'ran', on: 'SW1', pattern: 'enable' },
          { kind: 'stp-root', on: 'SW3', bridge: 'bridge1', expect: true },
          { kind: 'stp-root', on: 'SW1', bridge: 'bridge1', expect: false },
        ],
        solution: [SW('SW1', ['/interface enable ether1']), SW('SW3', ['/interface bridge set bridge1 priority=0x0000']), SW('SW2', ['/interface bridge port monitor [find] once'])],
      },
      {
        id: 't6',
        title: 'Watch a loop (lab only)',
        detail: 'Set protocol-mode=none on all three bridges and ping PC2 from PC1: with no spanning tree, the triangle is a loop and the traffic is lost. Then put protocol-mode=rstp back on every switch and confirm the ping works again.',
        hints: ['/interface bridge set bridge1 protocol-mode=none on SW1, SW2 and SW3', 'Restore with /interface bridge set bridge1 protocol-mode=rstp on each switch.'],
        checks: [
          { kind: 'ran', on: 'SW1', pattern: 'protocol-mode=none' },
          { kind: 'ran', on: 'SW2', pattern: 'protocol-mode=none' },
          { kind: 'ran', on: 'SW3', pattern: 'protocol-mode=none' },
          { kind: 'bridge', on: 'SW1', name: 'bridge1', protocolMode: 'rstp' },
          { kind: 'bridge', on: 'SW2', name: 'bridge1', protocolMode: 'rstp' },
          { kind: 'bridge', on: 'SW3', name: 'bridge1', protocolMode: 'rstp' },
          { kind: 'ping', from: 'PC1', to: '10.20.0.12', expect: 'reply' },
        ],
        solution: [
          SW('SW1', ['/interface bridge set bridge1 protocol-mode=none']),
          SW('SW2', ['/interface bridge set bridge1 protocol-mode=none']),
          SW('SW3', ['/interface bridge set bridge1 protocol-mode=none']),
          SW('PC1', ['ping 10.20.0.12']),
          SW('SW1', ['/interface bridge set bridge1 protocol-mode=rstp']),
          SW('SW2', ['/interface bridge set bridge1 protocol-mode=rstp']),
          SW('SW3', ['/interface bridge set bridge1 protocol-mode=rstp']),
        ],
      },
    ],
  },
];
