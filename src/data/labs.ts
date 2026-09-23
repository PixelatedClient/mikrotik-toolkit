export interface LabNode {
  id: string;
  /** Shown in the diagram. For routers with a config file it must equal the system identity. */
  label: string;
  kind: 'router' | 'switch' | 'pc';
  x: number;
  y: number;
  /** Config file in public/labs/<lab id>/. Absent for PCs. */
  file?: string;
}

export interface LabLink {
  a: string;
  ai: string;
  b: string;
  bi: string;
  net?: string;
}

export interface LabTask {
  title: string;
  detail: string;
}

export interface LabVerify {
  node: string;
  title: string;
  cmd: string;
  expect: string;
}

export interface Lab {
  id: string;
  title: string;
  level: 'Beginner' | 'Intermediate' | 'Advanced';
  minutes: number;
  summary: string;
  objectives: string[];
  nodes: LabNode[];
  links: LabLink[];
  setup: string[];
  tasks: LabTask[];
  verify: LabVerify[];
  related: { href: string; label: string }[];
}

export const LABS: Lab[] = [
  {
    id: 'three-router',
    title: 'Three-router static routing',
    level: 'Beginner',
    minutes: 30,
    summary: 'R1, R2 and R3 in a line with a LAN on each end. Make the two LANs reach each other, then trace the path.',
    objectives: ['Read a routing table', 'Add static routes in both directions', 'Use ping and traceroute to find where a path breaks'],
    nodes: [
      { id: 'PC1', label: 'PC1', kind: 'pc', x: 50, y: 130 },
      { id: 'R1', label: 'R1', kind: 'router', x: 195, y: 130, file: 'R1.rsc' },
      { id: 'R2', label: 'R2', kind: 'router', x: 340, y: 130, file: 'R2.rsc' },
      { id: 'R3', label: 'R3', kind: 'router', x: 485, y: 130, file: 'R3.rsc' },
      { id: 'PC3', label: 'PC3', kind: 'pc', x: 590, y: 130 },
    ],
    links: [
      { a: 'PC1', ai: 'eth0', b: 'R1', bi: 'ether2', net: '192.168.1.0/24' },
      { a: 'R1', ai: 'ether1', b: 'R2', bi: 'ether1', net: '10.0.12.0/30' },
      { a: 'R2', ai: 'ether2', b: 'R3', bi: 'ether1', net: '10.0.23.0/30' },
      { a: 'R3', ai: 'ether2', b: 'PC3', bi: 'eth0', net: '192.168.3.0/24' },
    ],
    setup: [
      'Add three MikroTik CHR routers and two VPCS nodes in GNS3 and wire them as shown.',
      'Start everything, log in as admin (empty password on a fresh CHR) and paste each router config into its console.',
      'On the PCs run: ip 192.168.1.10/24 192.168.1.1 (PC1) and ip 192.168.3.10/24 192.168.3.1 (PC3).',
    ],
    tasks: [
      { title: 'Ping PC3 from PC1', detail: 'It should work. Then run a traceroute and name every hop.' },
      { title: 'Break it on purpose', detail: 'Remove the LAN3 route on R2. Which direction stops working, and why does ping from PC1 fail even though R1 is fine?' },
      { title: 'Prove it with the tools', detail: 'Use traceroute from each side to find exactly which router drops the packet.' },
      { title: 'Restore and add a default route', detail: 'Fix R2, then replace R1 specific route with a default route towards R2. What changes in the routing table?' },
      { title: 'Go dynamic', detail: 'Replace every static route with OSPF (see the OSPF triangle lab).' },
    ],
    verify: [
      { node: 'R1', title: 'Routing table', cmd: '/ip route print', expect: 'Connected routes for 10.0.12.0/30 and 192.168.1.0/24, plus static routes to 10.0.23.0/30 and 192.168.3.0/24 via 10.0.12.2.' },
      { node: 'R1', title: 'End-to-end ping', cmd: '/ping 192.168.3.1 src-address=192.168.1.1 count=3', expect: 'Three replies. If not, the return route on R2 or R3 is missing.' },
      { node: 'R1', title: 'Path', cmd: '/tool traceroute 192.168.3.1', expect: 'Two hops: 10.0.12.2 (R2), then 192.168.3.1 (R3 LAN address).' },
    ],
    related: [
      { href: '/learn/foundations/03-your-first-router', label: 'Your first router' },
      { href: '/learn/mikrotik/10-troubleshooting', label: 'Troubleshooting common issues' },
    ],
  },
  {
    id: 'ospf-triangle',
    title: 'OSPF triangle and failover',
    level: 'Intermediate',
    minutes: 45,
    summary: 'Three routers in a triangle running OSPF. Watch the cheap path win, cut it, and watch traffic fail over to the expensive one.',
    objectives: ['Bring up OSPF neighbours and read the neighbour table', 'Understand cost and path selection', 'Measure failover and speed it up with BFD'],
    nodes: [
      { id: 'R2', label: 'R2', kind: 'router', x: 320, y: 40, file: 'R2.rsc' },
      { id: 'R1', label: 'R1', kind: 'router', x: 160, y: 165, file: 'R1.rsc' },
      { id: 'R3', label: 'R3', kind: 'router', x: 480, y: 165, file: 'R3.rsc' },
      { id: 'PC1', label: 'PC1', kind: 'pc', x: 50, y: 225 },
      { id: 'PC3', label: 'PC3', kind: 'pc', x: 590, y: 225 },
    ],
    links: [
      { a: 'R1', ai: 'ether1', b: 'R2', bi: 'ether1', net: '10.1.12.0/30 (cost 10)' },
      { a: 'R2', ai: 'ether2', b: 'R3', bi: 'ether1', net: '10.1.23.0/30 (cost 10)' },
      { a: 'R1', ai: 'ether2', b: 'R3', bi: 'ether2', net: '10.1.13.0/30 (cost 100)' },
      { a: 'PC1', ai: 'eth0', b: 'R1', bi: 'ether3', net: '192.168.10.0/24' },
      { a: 'PC3', ai: 'eth0', b: 'R3', bi: 'ether3', net: '192.168.30.0/24' },
    ],
    setup: [
      'Add three CHR routers and two VPCS nodes, wired as shown. The R1 to R3 link is the expensive backup.',
      'Paste each config. Wait about 40 seconds for neighbours to reach Full.',
      'On the PCs run: ip 192.168.10.10/24 192.168.10.1 (PC1) and ip 192.168.30.10/24 192.168.30.1 (PC3).',
    ],
    tasks: [
      { title: 'Find the neighbours', detail: 'Check that every router has two neighbours in state Full.' },
      { title: 'Predict the path', detail: 'From R1, which way will traffic to 192.168.30.0/24 go, and what is the total cost? Then confirm with the routing table and traceroute.' },
      { title: 'Cut the cheap path', detail: 'On R1 disable ether1 and re-run the traceroute. How long did the path take to change? Restore ether1 afterwards.' },
      { title: 'Measure the outage', detail: 'Run a continuous ping from PC1 to PC3 with a short interval, cut the link and count the lost replies.' },
      { title: 'Speed it up with BFD', detail: 'Enable use-bfd=yes on the R1 to R2 template on both routers and add a /routing bfd configuration entry on both (for example interfaces=ether1 min-rx=200ms min-tx=200ms multiplier=5); without that entry the BFD session stays inactive. To compare fairly you need a silent failure, so drop all traffic on one side with firewall rules instead of disabling the port. On RouterOS 7.16 the silent outage was about 30 seconds without BFD and about 0.4 to 1 second with it.' },
      { title: 'Change the design', detail: 'Make the direct R1 to R3 link the preferred one by changing costs. Which two interface templates must you change? Change only R1 first and look at the return path from R3: on RouterOS 7.16 it still goes through R2 (asymmetric routing) until the R3 template for the same link is changed too.' },
    ],
    verify: [
      { node: 'R1', title: 'Neighbours', cmd: '/routing ospf neighbor print', expect: 'Two neighbours, R2 (10.255.0.2) and R3 (10.255.0.3), both in state Full.' },
      { node: 'R1', title: 'Learned routes', cmd: '/ip route print where ospf', expect: 'Routes to 192.168.30.0/24 via 10.1.12.2 (through R2) with the lowest total cost.' },
      { node: 'R1', title: 'Path', cmd: '/tool traceroute 192.168.30.1', expect: 'First hop 10.1.12.2 (R2), then 192.168.30.1. After cutting ether1 the path is a single hop, 192.168.30.1, because the direct R1 to R3 link reaches R3 itself (checked on RouterOS 7.16).' },
      { node: 'R1', title: 'Failover measurement', cmd: '/ping 192.168.30.1 interval=100ms count=200', expect: 'A short burst of timeouts while OSPF reconverges. Each lost reply is about 0.1 s of outage.' },
    ],
    related: [
      { href: '/learn/routing/04-ospf-for-enterprise', label: 'OSPF for enterprise networks' },
      { href: '/learn/routing/07-bfd-fast-failover', label: 'BFD and fast failover' },
    ],
  },
  {
    id: 'inter-vlan-routing',
    title: 'Inter-VLAN routing and isolation',
    level: 'Intermediate',
    minutes: 45,
    summary: 'A router on a stick and a VLAN-aware switch. Staff and guests share cabling but not a network, and a firewall decides what crosses.',
    objectives: ['Build access and trunk ports with bridge VLAN filtering', 'Route between VLANs on one physical link', 'Enforce policy with firewall rules and prove it'],
    nodes: [
      { id: 'R1', label: 'R1', kind: 'router', x: 100, y: 130, file: 'R1.rsc' },
      { id: 'SW1', label: 'SW1', kind: 'switch', x: 280, y: 130, file: 'SW1.rsc' },
      { id: 'PC1', label: 'PC1', kind: 'pc', x: 500, y: 45 },
      { id: 'PC2', label: 'PC2', kind: 'pc', x: 500, y: 130 },
      { id: 'PC3', label: 'PC3', kind: 'pc', x: 500, y: 215 },
    ],
    links: [
      { a: 'R1', ai: 'ether2', b: 'SW1', bi: 'ether1', net: 'trunk: VLAN 10, 20, 99' },
      { a: 'SW1', ai: 'ether2', b: 'PC1', bi: 'eth0', net: 'VLAN 10 staff' },
      { a: 'SW1', ai: 'ether3', b: 'PC2', bi: 'eth0', net: 'VLAN 20 guest' },
      { a: 'SW1', ai: 'ether4', b: 'PC3', bi: 'eth0', net: 'VLAN 10 staff' },
    ],
    setup: [
      'Add two CHR nodes (R1 and SW1) and three VPCS nodes. Cable R1.ether2 to SW1.ether1, the PCs to SW1.ether2 to ether4.',
      'Paste R1 first, then SW1. The switch enables VLAN filtering as its very last command.',
      'On each PC run: dhcp. PC1 and PC3 should get 10.0.10.x, PC2 should get 10.0.20.x.',
      'Design your own variant in the VLAN designer and compare its scripts with these.',
    ],
    tasks: [
      { title: 'Confirm the leases', detail: 'Check which addresses PC1, PC2 and PC3 received and why PC1 and PC3 are on the same subnet.' },
      { title: 'Same VLAN, no router', detail: 'Ping PC3 from PC1. Look at the router interface counters: did the traffic touch R1?' },
      { title: 'Cross the router', detail: 'Ping PC2 (guest) from PC1 (staff). It works because of one firewall rule. Which one?' },
      { title: 'Try the other direction', detail: 'Ping PC1 from PC2. It must fail. Use the firewall counters to prove which rule dropped it.' },
      { title: 'Fix a wiring mistake', detail: 'Move PC3 to the guest VLAN by changing only the switch pvid and VLAN table (ether4 pvid=20, remove it from the VLAN 10 untagged list, add it to VLAN 20). Renew its lease: it should now get a 10.0.20.x address and reach PC2 without crossing the router.' },
      { title: 'Lock down management', detail: 'Verify the switch is reachable from the management VLAN only, and test what staff can reach. On RouterOS 7.16 staff can still ping every R1 address (the input chain accepts ICMP) but cannot open a TCP connection to R1, and cannot reach SW1 at all. Which rule would you change to stop the pings?' },
    ],
    verify: [
      { node: 'SW1', title: 'VLAN table', cmd: '/interface bridge vlan print', expect: 'VLAN 10 untagged on ether2 and ether4, VLAN 20 untagged on ether3, VLAN 99 tagged on bridge1 and ether1.' },
      { node: 'SW1', title: 'Learned MACs', cmd: '/interface bridge host print', expect: 'Each PC MAC appears on its own port and in the right VLAN column.' },
      { node: 'R1', title: 'Firewall counters', cmd: '/ip firewall filter print stats where chain=forward', expect: 'The isolate rule packet counter grows when guest tries to reach staff.' },
      { node: 'R1', title: 'DHCP leases', cmd: '/ip dhcp-server lease print', expect: 'Two leases in 10.0.10.0/24 and one in 10.0.20.0/24.' },
    ],
    related: [
      { href: '/tools/vlan-designer', label: 'VLAN designer' },
      { href: '/learn/mikrotik/02-bridge-and-vlans', label: 'Bridge and VLAN filtering' },
      { href: '/learn/foundations/04-switching-and-vlans', label: 'Switching and VLANs' },
    ],
  },
  {
    id: 'bgp-two-isp',
    title: 'Multihomed BGP: two upstreams',
    level: 'Advanced',
    minutes: 60,
    summary: 'Your AS is connected to two upstreams that both reach the same destination. Steer traffic with local-pref and prepending, then fail a link.',
    objectives: ['Bring up two eBGP sessions and read the BGP table', 'Prefer one upstream with local-pref', 'Influence inbound traffic with AS-path prepending', 'Watch failover and speed it up with BFD'],
    nodes: [
      { id: 'EDGE', label: 'EDGE', kind: 'router', x: 90, y: 130, file: 'EDGE.rsc' },
      { id: 'UPA', label: 'UPA', kind: 'router', x: 290, y: 45, file: 'UPA.rsc' },
      { id: 'UPB', label: 'UPB', kind: 'router', x: 290, y: 215, file: 'UPB.rsc' },
      { id: 'DEST', label: 'DEST', kind: 'router', x: 500, y: 130, file: 'DEST.rsc' },
    ],
    links: [
      { a: 'EDGE', ai: 'ether1', b: 'UPA', bi: 'ether1', net: '10.64.1.0/30' },
      { a: 'EDGE', ai: 'ether2', b: 'UPB', bi: 'ether1', net: '10.64.2.0/30' },
      { a: 'UPA', ai: 'ether2', b: 'DEST', bi: 'ether1', net: '10.64.3.0/30' },
      { a: 'UPB', ai: 'ether2', b: 'DEST', bi: 'ether2', net: '10.64.4.0/30' },
    ],
    setup: [
      'Add four CHR routers wired as shown. EDGE is your AS 64512, UPA is AS 64500, UPB is AS 64501, DEST is AS 64999.',
      'Paste all four configs. Sessions should establish within about a minute.',
      'EDGE announces 198.51.100.0/24 and DEST announces 203.0.113.0/24. Test with source addresses from those networks.',
    ],
    tasks: [
      { title: 'Confirm both sessions', detail: 'Both EDGE sessions must be established. If one is stuck, use the BGP session animator to reason about why.' },
      { title: 'Read the table', detail: 'EDGE should hold two routes to 203.0.113.0/24. Compare their AS paths. Which rule picked the best one?' },
      { title: 'Prefer Upstream B', detail: 'Write an input filter chain on EDGE that sets bgp-local-pref 200 for routes from UPB and attach it to that session. Confirm the best path changed.' },
      { title: 'Influence inbound', detail: 'On EDGE, prepend your AS three times towards UPA in the output chain. On DEST, which path to 198.51.100.0/24 is now preferred? (On RouterOS 7.16 the prepended path shows 64512 three times in total.)' },
      { title: 'Fail a link', detail: 'Disable ether2 on EDGE. Measure how long traffic is lost, then confirm BGP moved to the other path. EDGE switches to UPA at once, yet on RouterOS 7.16 traffic stays lost for minutes (checked over 150 s): UPB never notices the failure until its 3 minute hold timer expires, so DEST keeps sending replies to UPB. Explain why the outage is on the return path.' },
      { title: 'Add BFD', detail: 'Enable use-bfd on the EDGE to UPB session on both routers, and add a /routing bfd configuration entry on both (for example interfaces=ether1 min-rx=200ms min-tx=200ms multiplier=5). Without that entry the BFD session stays inactive ("BFD forbidden for interface") and nothing changes. Repeat the failure: on RouterOS 7.16 recovery took about 2 seconds.' },
      { title: 'Protect the edge', detail: 'Add a filter that rejects your own prefix in the input chain, and one that limits accepted routes. Explain what each prevents.' },
    ],
    verify: [
      { node: 'EDGE', title: 'Sessions', cmd: '/routing bgp session print', expect: 'Two sessions with state established (to-upa and to-upb; RouterOS 7.16 shows them as to-upa-1 and to-upb-1).' },
      { node: 'EDGE', title: 'Two paths to the destination', cmd: '/routing route print where dst-address=203.0.113.0/24', expect: 'Two BGP routes, one via 10.64.1.1 and one via 10.64.2.1, one marked active.' },
      { node: 'EDGE', title: 'End-to-end reachability', cmd: '/ping 203.0.113.1 src-address=198.51.100.1 count=3', expect: 'Three replies. Failure usually means DEST has no route back to 198.51.100.0/24.' },
      { node: 'DEST', title: 'What the destination sees', cmd: '/routing route print where dst-address=198.51.100.0/24', expect: 'Two routes with AS paths ending in 64512, one through 64500 and one through 64501.' },
    ],
    related: [
      { href: '/tools/bgp-lab', label: 'BGP lab (simulator)' },
      { href: '/learn/routing/02-route-maps-and-policy', label: 'Routing policy and PBR' },
      { href: '/learn/routing/03-bgp-in-isp-networks', label: 'BGP in ISP networks' },
    ],
  },
  {
    id: 'rstp-triangle',
    title: 'RSTP triangle: root election and failover',
    level: 'Intermediate',
    minutes: 45,
    summary: 'Three switches in a triangle. Predict the root and the blocked port, verify them, cut a link and measure the outage, then break it on purpose.',
    objectives: ['Predict a spanning tree before looking at the switches', 'Read bridge and port monitors to confirm roles', 'Measure RSTP recovery time', 'Protect an edge port with BPDU Guard, and see what a loop does when spanning tree is off'],
    nodes: [
      { id: 'SW1', label: 'SW1', kind: 'switch', x: 320, y: 40, file: 'SW1.rsc' },
      { id: 'SW2', label: 'SW2', kind: 'switch', x: 160, y: 165, file: 'SW2.rsc' },
      { id: 'SW3', label: 'SW3', kind: 'switch', x: 480, y: 165, file: 'SW3.rsc' },
      { id: 'PC1', label: 'PC1', kind: 'pc', x: 60, y: 225 },
      { id: 'PC2', label: 'PC2', kind: 'pc', x: 580, y: 225 },
    ],
    links: [
      { a: 'SW1', ai: 'ether1', b: 'SW2', bi: 'ether1', net: 'bridged, 1 Gbps' },
      { a: 'SW2', ai: 'ether2', b: 'SW3', bi: 'ether1', net: 'bridged, 1 Gbps' },
      { a: 'SW1', ai: 'ether2', b: 'SW3', bi: 'ether2', net: 'bridged, 1 Gbps' },
      { a: 'PC1', ai: 'eth0', b: 'SW2', bi: 'ether3', net: '10.20.0.0/24' },
      { a: 'PC2', ai: 'eth0', b: 'SW3', bi: 'ether3', net: '10.20.0.0/24' },
    ],
    setup: [
      'Add three MikroTik CHR nodes and two VPCS nodes in GNS3 and cable them as shown. Every inter-switch link is a bridged port, so there are no IP subnets on them.',
      'Paste each switch config. All three run RSTP, with priorities 0x1000 (SW1), 0x2000 (SW2) and the default 0x8000 (SW3).',
      'On the PCs run: ip 10.20.0.11/24 (PC1) and ip 10.20.0.12/24 (PC2). Each switch also has a management address on its bridge (10.20.0.1 to .3).',
      'Wait about 10 seconds for RSTP to settle before you start.',
      'The simulator on the Spanning tree lab page uses the same rules, so you can rehearse first.',
    ],
    tasks: [
      { title: 'Predict first', detail: 'Before you run any command, write down the root bridge, each switch root port, and which port on which switch will be blocked. Use the priorities and the fact that all links are 1 Gbps.' },
      { title: 'Check with the monitors', detail: 'Run the bridge monitor and the port monitor on every switch. Were your predictions right? If not, find the rule you missed.' },
      { title: 'Follow the traffic', detail: 'Ping PC2 from PC1. Which path does it take, and why is the SW2 to SW3 link not used? Look at the host table on SW1 to see it learn both PCs.' },
      { title: 'Cut the root port and time it', detail: 'Start a fast continuous ping from PC1 to PC2, then disable SW1 ether1. How many replies are lost? Which port replaced the old one?' },
      { title: 'Restore and move the root', detail: 'Re-enable the link. Now give SW3 the lowest priority (0x0000). Predict the new roles on all three switches, then verify. On RouterOS 7.16 SW3 becomes root, SW1 and SW2 each take their direct link to SW3 as root port, and SW2 ether1 (towards SW1) becomes alternate.' },
      { title: 'Trigger BPDU Guard', detail: 'Add a fourth CHR switch with a bridge, and cable it to SW2 ether3 (the edge port). What happens to the port, and what does it take to bring it back? On RouterOS 7.16 the port goes inactive, the log shows "bpdu-guard disabling ether3", and only /interface bridge port enable brings it back.' },
      { title: 'Watch a loop', detail: 'In the lab only: set protocol-mode=none on all three bridges. Send a broadcast (a ping to an unused address). Watch CPU and interface counters, then set rstp back on every switch. On RouterOS 7.16 CPU load went from about 4% to 20 to 33% on all three switches within seconds and fell back after RSTP was restored.' },
    ],
    verify: [
      { node: 'SW1', title: 'Which bridge is the root?', cmd: '/interface bridge monitor bridge1', expect: 'SW1 reports that it is the root bridge. On SW2 and SW3 the root-bridge value points to SW1, and root-port names the port towards it (ether1 on SW2, ether2 on SW3).' },
      { node: 'SW3', title: 'Port roles', cmd: '/interface bridge port monitor [find]', expect: 'ether2 is the root port and forwards. ether1 (the link to SW2) is an alternate port and is discarding. ether3 is an edge port and forwards.' },
      { node: 'SW2', title: 'Port roles on the backup root', cmd: '/interface bridge port monitor [find]', expect: 'ether1 is the root port. ether2 is designated and forwarding, because SW2 has a lower bridge ID than SW3. ether3 is an edge port.' },
      { node: 'SW1', title: 'MAC learning', cmd: '/interface bridge host print where !local', expect: 'Both PC MAC addresses appear, one on each inter-switch port. A MAC that keeps changing port is the sign of a loop.' },
      { node: 'SW2', title: 'Fast failover measurement', cmd: '/ping 10.20.0.3 interval=100ms count=100', expect: 'A short burst of timeouts while RSTP recovers. Each lost reply is about 0.1 seconds of outage. On RouterOS 7.16 a silent cut (disabling SW1 ether1, which SW2 cannot see) lost about 3 seconds with RSTP and about 34 seconds with protocol-mode=stp on all switches. Disabling the port on SW2 itself lost nothing.' },
    ],
    related: [
      { href: '/tools/stp-lab', label: 'Spanning tree lab (simulator)' },
      { href: '/learn/layer2/02-loops-and-spanning-tree', label: 'Loops and the Spanning Tree Protocol' },
      { href: '/learn/layer2/03-rstp-and-mstp', label: 'RSTP and MSTP' },
      { href: '/learn/layer2/06-layer2-protection', label: 'Layer 2 protection' },
    ],
  },
  {
    id: 'wireguard-site-to-site',
    title: 'WireGuard site-to-site VPN',
    level: 'Intermediate',
    minutes: 40,
    summary: 'Join two sites across a simulated internet. Exchange keys, bring up a tunnel and route the two LANs through it.',
    objectives: ['Generate and exchange WireGuard keys', 'Understand allowed-address as filter and route', 'Verify handshakes and debug a tunnel that will not come up'],
    nodes: [
      { id: 'PC-A', label: 'PC-A', kind: 'pc', x: 50, y: 130 },
      { id: 'SITE-A', label: 'SITE-A', kind: 'router', x: 175, y: 130, file: 'SITE-A.rsc' },
      { id: 'INET', label: 'INET', kind: 'router', x: 320, y: 130, file: 'INET.rsc' },
      { id: 'SITE-B', label: 'SITE-B', kind: 'router', x: 465, y: 130, file: 'SITE-B.rsc' },
      { id: 'PC-B', label: 'PC-B', kind: 'pc', x: 590, y: 130 },
    ],
    links: [
      { a: 'PC-A', ai: 'eth0', b: 'SITE-A', bi: 'ether2', net: '192.168.1.0/24' },
      { a: 'SITE-A', ai: 'ether1', b: 'INET', bi: 'ether1', net: '203.0.113.0/30' },
      { a: 'INET', ai: 'ether2', b: 'SITE-B', bi: 'ether1', net: '198.51.100.0/30' },
      { a: 'SITE-B', ai: 'ether2', b: 'PC-B', bi: 'eth0', net: '192.168.2.0/24' },
    ],
    setup: [
      'Add three CHR routers and two VPCS nodes, wired as shown. INET just forwards between the two public links.',
      'Paste all three configs. Test that SITE-A can already ping 198.51.100.2 across INET.',
      'Read each public key with /interface wireguard print, then run the commented peers command from each config after replacing the placeholder.',
      'On the PCs run: ip 192.168.1.10/24 192.168.1.1 (PC-A) and ip 192.168.2.10/24 192.168.2.1 (PC-B).',
    ],
    tasks: [
      { title: 'Make the tunnel come up', detail: 'Exchange the public keys and add the peers. A recent handshake means success.' },
      { title: 'Ping through the tunnel', detail: 'From PC-A ping PC-B. Then capture on INET ether1 (/tool sniffer) and confirm the traffic is encrypted UDP 13231, not ICMP. On RouterOS 7.16 four pings produced 8 UDP 13231 packets and no ICMP at all.' },
      { title: 'Break allowed-address', detail: 'Remove 192.168.2.0/24 from the peer on SITE-A. What still works and what stops? Why?' },
      { title: 'Break the endpoint', detail: 'Remove the peer on SITE-A and re-add it with a wrong endpoint-address (do not just edit it: a running peer remembers the endpoint it learned and keeps working). What does the peer table show, and does a wrong public key look any different there? On RouterOS 7.16 both show rx=0 and a growing tx with no handshake, so what else could you check on the far side?' },
      { title: 'Add a firewall', detail: 'Add a drop-all input rule on SITE-A (keep a rule that lets your management access through). The tunnel stops working. Try accepting UDP 13231 first: the handshake recovers, but pings from SITE-A itself still fail. Why? Which single rule brings everything back?' },
      { title: 'Test the MTU', detail: 'Send large pings with the do-not-fragment flag through the tunnel and find the largest size that passes. On RouterOS 7.16 the wg0 MTU is 1420 and a 1420-byte ping passes while 1421 does not.' },
    ],
    verify: [
      { node: 'SITE-A', title: 'Public key', cmd: '/interface wireguard print', expect: 'Shows the public-key value to copy into the other router.' },
      { node: 'SITE-A', title: 'Handshake', cmd: '/interface wireguard peers print', expect: 'A peer with a recent last-handshake time and non-zero rx and tx counters.' },
      { node: 'SITE-A', title: 'Tunnel reachability', cmd: '/ping 10.99.0.2 count=3', expect: 'Three replies from the other end of the tunnel.' },
      { node: 'SITE-A', title: 'LAN to LAN', cmd: '/ping 192.168.2.1 src-address=192.168.1.1 count=3', expect: 'Three replies. Failure with a working tunnel points at allowed-address or a missing route. With the LAN missing from allowed-address the local router itself answers "host unreachable" (checked on RouterOS 7.16).' },
    ],
    related: [
      { href: '/learn/mikrotik/04-wireguard-vpn', label: 'WireGuard VPN on MikroTik' },
      { href: '/learn/foundations/07-tcpip-in-action', label: 'TCP/IP in action (MTU)' },
    ],
  },
  {
    id: 'nat-port-forward',
    title: 'NAT and port forwarding',
    level: 'Beginner',
    minutes: 35,
    summary: 'A gateway with masquerade and a default-drop firewall. Publish an internal web server, then lock it down.',
    objectives: ['See source NAT in the connection table', 'Publish a service with dst-nat', 'Understand why the firewall drops unsolicited traffic and how port forwarding is exempt'],
    nodes: [
      { id: 'ISP', label: 'ISP', kind: 'router', x: 100, y: 130, file: 'ISP.rsc' },
      { id: 'GW', label: 'GW', kind: 'router', x: 300, y: 130, file: 'GW.rsc' },
      { id: 'SRV', label: 'SRV', kind: 'router', x: 500, y: 130, file: 'SRV.rsc' },
    ],
    links: [
      { a: 'ISP', ai: 'ether1', b: 'GW', bi: 'ether1', net: '203.0.113.0/30 (WAN)' },
      { a: 'GW', ai: 'ether2', b: 'SRV', bi: 'ether1', net: '192.168.88.0/24 (LAN)' },
    ],
    setup: [
      'Add three CHR routers in a line. ISP plays the internet, GW is your gateway, SRV is a server with a built-in web page.',
      'Paste all three configs. Nothing is published yet: that is your job.',
    ],
    tasks: [
      { title: 'Prove source NAT', detail: 'From SRV ping 8.8.8.8, then look at the connection table on GW. Which source address does the ISP see?' },
      { title: 'Try to reach the server first', detail: 'From ISP fetch http://203.0.113.2:8080/. It must fail. Which firewall rule dropped it, and in which chain? Prove it with counters. Hint: who is the packet addressed to?' },
      { title: 'Publish it', detail: 'Add a dst-nat rule on GW sending TCP 8080 arriving on the WAN to 192.168.88.10 port 80. Repeat the fetch.' },
      { title: 'Why no forward rule?', detail: 'Explain why the forwarded traffic passes even though the forward chain drops new connections from WAN.' },
      { title: 'Restrict the source', detail: 'Allow the forward only from 203.0.113.1 using an address list, and confirm other sources are dropped.' },
      { title: 'Break it', detail: 'Remove the established-connections accept rule from the forward chain and re-test both the LAN ping and the published page. On RouterOS 7.16 nothing breaks. Why not? Then add a final "drop everything else" rule to the forward chain and repeat: now what breaks?' },
    ],
    verify: [
      { node: 'SRV', title: 'Outbound through NAT', cmd: '/ping 8.8.8.8 count=3', expect: 'Three replies from the loopback on ISP.' },
      { node: 'GW', title: 'NAT and connections', cmd: '/ip firewall connection print where dst-address~"8.8.8.8"', expect: 'A connection with the reply address showing 203.0.113.2, the translated source.' },
      { node: 'ISP', title: 'Published service', cmd: '/tool fetch url="http://203.0.113.2:8080/" keep-result=no', expect: 'Status finished once the dst-nat rule exists. Before that it fails or times out.' },
      { node: 'GW', title: 'Rule counters', cmd: '/ip firewall filter print stats where chain=input', expect: 'Before the port forward, the "drop everything else" rule counter in the input chain increases (the packet is addressed to the router itself). Once the dst-nat rule exists the packet is rewritten first, goes through the forward chain instead, and that input counter stays still. The forward "drop new from WAN" counter stays at 0 in both cases (checked on RouterOS 7.16).' },
    ],
    related: [
      { href: '/learn/foundations/05-nat-and-firewalls', label: 'NAT and firewalls' },
      { href: '/learn/mikrotik/05-firewall-and-nat', label: 'Firewall and NAT rules' },
    ],
  },
  {
    id: 'ospf-chain',
    title: 'OSPF linear chain: 4 routers',
    level: 'Advanced',
    minutes: 45,
    summary: 'Four routers in a line with a LAN on each end. Configure OSPF to route traffic through the chain and watch path selection based on cost.',
    objectives: ['Build OSPF on a linear 4-router topology', 'Understand how OSPF chooses paths based on accumulated cost', 'Manipulate link costs to control path selection', 'Observe convergence when links fail'],
    nodes: [
      { id: 'R1', label: 'R1', kind: 'router', x: 80, y: 130, file: 'R1.rsc' },
      { id: 'R2', label: 'R2', kind: 'router', x: 210, y: 130, file: 'R2.rsc' },
      { id: 'R3', label: 'R3', kind: 'router', x: 340, y: 130, file: 'R3.rsc' },
      { id: 'R4', label: 'R4', kind: 'router', x: 470, y: 130, file: 'R4.rsc' },
      { id: 'PC1', label: 'PC1', kind: 'pc', x: 80, y: 220 },
      { id: 'PC4', label: 'PC4', kind: 'pc', x: 470, y: 220 },
    ],
    links: [
      { a: 'PC1', ai: 'eth0', b: 'R1', bi: 'ether3', net: '192.168.10.0/24' },
      { a: 'R1', ai: 'ether1', b: 'R2', bi: 'ether1', net: '10.0.12.0/30 (cost 10)' },
      { a: 'R2', ai: 'ether2', b: 'R3', bi: 'ether1', net: '10.0.23.0/30 (cost 10)' },
      { a: 'R3', ai: 'ether2', b: 'R4', bi: 'ether1', net: '10.0.34.0/30 (cost 10)' },
      { a: 'R4', ai: 'ether3', b: 'PC4', bi: 'eth0', net: '192.168.40.0/24' },
    ],
    setup: [
      'Add four CHR routers and two VPCS nodes in GNS3 and wire them in a line as shown.',
      'Paste each config. Wait about 40 seconds for neighbours to reach Full.',
      'On the PCs run: ip 192.168.10.10/24 192.168.10.1 (PC1) and ip 192.168.40.10/24 192.168.40.1 (PC4).',
    ],
    tasks: [
      { title: 'Bring up OSPF', detail: 'Create an instance on each router with its loopback as router-id (10.255.0.1 to .4), then create a backbone area and interface templates for every link.' },
      { title: 'Check neighbours', detail: 'Verify that each router has the expected neighbours: R1 (1), R2 (2), R3 (2), R4 (1). All should be in state Full.' },
      { title: 'Predict and confirm the path', detail: 'From R1, traffic to 192.168.40.0/24 will go through all three hops (R1→R2→R3→R4) with a total cost of 10+10+10+1=31. Confirm with the routing table and traceroute from PC1.' },
      { title: 'Disable the first link', detail: 'On R1 disable ether1 (the link to R2). The chain breaks and PC1 can no longer reach PC4. Ping should fail.' },
      { title: 'Restore the link and change costs', detail: 'Enable ether1 again. Then lower the cost on R3 ether2 (the link to R4) from 10 to 5. Check the routing table: does R1 see a different path? Why or why not?' },
    ],
    verify: [
      { node: 'R1', title: 'Neighbours', cmd: '/routing ospf neighbor print', expect: 'One neighbour: R2 (10.255.0.2), in state Full.' },
      { node: 'R2', title: 'Neighbours on R2', cmd: '/routing ospf neighbor print', expect: 'Two neighbours: R1 (10.255.0.1) and R3 (10.255.0.3), both Full.' },
      { node: 'R3', title: 'Check R3 has two neighbours', cmd: '/routing ospf neighbor print', expect: 'Two neighbours: R2 (10.255.0.2) and R4 (10.255.0.4), both Full.' },
      { node: 'R1', title: 'Path to LAN4', cmd: '/ip route print where ospf', expect: 'A route to 192.168.40.0/24 via R2 (10.0.12.2).' },
      { node: 'R1', title: 'End-to-end ping', cmd: '/ping 192.168.40.1 src-address=192.168.10.1 count=3', expect: 'Three replies.' },
    ],
    related: [
      { href: '/learn/routing/04-ospf-for-enterprise', label: 'OSPF for enterprise networks' },
      { href: '/learn/routing/07-bfd-fast-failover', label: 'BFD and fast failover' },
    ],
  },
];

export const labById = (id: string) => LABS.find((l) => l.id === id);
