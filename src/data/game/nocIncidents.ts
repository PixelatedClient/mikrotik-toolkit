/**
 * NOC incidents. Incidents 1, 2, 3, 4, 5, 6, 7, 8, 10, 11 and 12 were reproduced on RouterOS 7.16 (GNS3 CHR) and their RouterOS outputs follow the real format.
 * Incident 9 and all PC-side output (ping, nslookup, ipconfig) are still illustrative.
 * Each command may rule out wrong causes; the command(s) that point to the real cause carry `points`.
 * tests/noc.test.ts checks that every wrong cause can be ruled out and the truth can be found.
 */
export interface NocCmd {
  id: string;
  device: string;
  cmd: string;
  out: string;
  /** Causes this output proves are NOT the problem. */
  rules?: string[];
  /** True when this output reveals the real cause. */
  points?: boolean;
}

export interface Incident {
  id: string;
  title: string;
  level: 1 | 2 | 3;
  ticket: string;
  devices: { id: string; label: string }[];
  causes: { id: string; label: string }[];
  truth: string;
  fix: string[];
  lesson: string;
  /** Fewest commands that solve it. Three stars at par or below. */
  par: number;
  cmds: NocCmd[];
  read?: { href: string; label: string };
}

const R = { id: 'r1', label: 'Router R1' };
const PC = { id: 'pc', label: 'Customer PC' };

export const INCIDENTS: Incident[] = [
  {
    id: 'noc-1', title: 'No internet in the office', level: 1,
    ticket: 'Customer: "Everyone in the office lost the internet this morning. The router lights are green."',
    devices: [PC, R],
    causes: [
      { id: 'wan-down', label: 'The WAN link is down' },
      { id: 'no-default', label: 'The default route is missing' },
      { id: 'no-masq', label: 'The masquerade (source NAT) rule is missing' },
      { id: 'dns', label: 'DNS is broken' },
    ],
    truth: 'no-masq',
    par: 4,
    cmds: [
      { id: 'a', device: 'pc', cmd: 'ping 8.8.8.8', out: 'Request timed out.\nRequest timed out.\nRequest timed out.', rules: ['dns'] },
      { id: 'b', device: 'r1', cmd: '/ping 8.8.8.8', out: '  SEQ HOST                                     SIZE TTL TIME\n    0 8.8.8.8                                    56  117 12ms345us\n    1 8.8.8.8                                    56  117 12ms101us\n    sent=2 received=2 packet-loss=0% min-rtt=12ms101us avg-rtt=12ms223us max-rtt=12ms345us', rules: ['wan-down', 'no-default'] },
      { id: 'c', device: 'r1', cmd: '/ip route print where dst-address=0.0.0.0/0', out: 'Flags: A - ACTIVE; s - STATIC\nColumns: DST-ADDRESS, GATEWAY, DISTANCE\n#    DST-ADDRESS  GATEWAY      DISTANCE\n0 As 0.0.0.0/0    203.0.113.1         1', rules: ['no-default'] },
      { id: 'd', device: 'r1', cmd: '/ip firewall nat print', out: 'Flags: X - disabled, I - invalid; D - dynamic', points: true },
      { id: 'e', device: 'pc', cmd: 'ping 192.168.88.1', out: 'Reply from 192.168.88.1: time=1ms', rules: [] },
    ],
    fix: ['/ip firewall nat add chain=srcnat action=masquerade out-interface-list=WAN'],
    lesson: 'The router itself reaches the internet, so the link and the default route are fine. Private LAN addresses cannot be routed on the internet, so the router must rewrite the source address (masquerade). With no NAT rule, replies never come back to the LAN.',
    read: { href: '/learn/mikrotik/05-firewall-and-nat', label: 'Firewall and NAT' },
  },
  {
    id: 'noc-2', title: 'Websites do not open, ping works', level: 1,
    ticket: 'Customer: "I can ping Google\'s address but no website opens by name."',
    devices: [PC, R],
    causes: [
      { id: 'no-masq', label: 'Masquerade is missing' },
      { id: 'dns-remote', label: 'The router does not answer DNS queries from the LAN' },
      { id: 'wan-down', label: 'The WAN link is down' },
      { id: 'dhcp-dns', label: 'DHCP hands out the wrong DNS server' },
    ],
    truth: 'dns-remote',
    par: 4,
    cmds: [
      { id: 'a', device: 'pc', cmd: 'ping 8.8.8.8', out: 'Reply from 8.8.8.8: time=14ms', rules: ['no-masq', 'wan-down'] },
      { id: 'b', device: 'pc', cmd: 'nslookup example.com', out: 'DNS request timed out.\n  timeout was 2 seconds.\nServer:  router.lan\nAddress:  192.168.88.1' },
      { id: 'c', device: 'r1', cmd: '/ip dhcp-server network print', out: 'Columns: ADDRESS, GATEWAY, DNS-SERVER\n# ADDRESS          GATEWAY       DNS-SERVER\n0 192.168.88.0/24  192.168.88.1  192.168.88.1', rules: ['dhcp-dns'] },
      { id: 'd', device: 'r1', cmd: '/ip dns print', out: '                servers: 1.1.1.1\n  allow-remote-requests: no', points: true },
    ],
    fix: ['/ip dns set allow-remote-requests=yes'],
    lesson: 'The clients ask the router (192.168.88.1) for DNS, which is what DHCP told them to do. The router only answers other devices when allow-remote-requests is yes. Ping by address working proves NAT and the WAN are fine.',
    read: { href: '/learn/foundations/06-dns-and-dhcp', label: 'DNS and DHCP' },
  },
  {
    id: 'noc-3', title: 'Some pages hang, others load', level: 2,
    ticket: 'Customer on a new PPPoE line: "Small pages load, but big pages and uploads hang. Ping is fine."',
    devices: [PC, R],
    causes: [
      { id: 'dns', label: 'DNS is broken' },
      { id: 'mtu', label: 'MTU / MSS mismatch on the PPPoE link' },
      { id: 'no-masq', label: 'Masquerade is missing' },
      { id: 'wan-down', label: 'The WAN link is down' },
    ],
    truth: 'mtu',
    par: 4,
    cmds: [
      { id: 'a', device: 'pc', cmd: 'nslookup example.com', out: 'Name:    example.com\nAddress: 93.184.216.34', rules: ['dns'] },
      { id: 'b', device: 'pc', cmd: 'ping 8.8.8.8', out: 'Reply from 8.8.8.8: bytes=32 time=13ms', rules: ['no-masq', 'wan-down'] },
      { id: 'c', device: 'pc', cmd: 'ping 8.8.8.8 -f -l 1472', out: 'Packet needs to be fragmented but DF set.', points: true },
      { id: 'd', device: 'pc', cmd: 'ping 8.8.8.8 -f -l 1400', out: 'Reply from 8.8.8.8: bytes=1400 time=14ms' },
      { id: 'e', device: 'r1', cmd: '/interface print terse where name=pppoe-out1', out: '0 R name=pppoe-out1 type=pppoe-out mtu=1492 actual-mtu=1492', points: true },
    ],
    fix: ['/ip firewall mangle add chain=forward action=change-mss new-mss=clamp-to-pmtu protocol=tcp tcp-flags=syn out-interface=pppoe-out1'],
    lesson: 'Ethernet carries 1500-byte packets, but PPPoE adds 8 bytes of header, leaving an MTU of 1492. Full-size packets with DF set do not fit, and if the ICMP that would tell the sender is lost, big transfers hang while small ones work. Clamping the TCP MSS to the path MTU fixes it.',
    read: { href: '/learn/mikrotik-ops/06-pppoe-for-isps', label: 'PPPoE basics' },
  },
  {
    id: 'noc-4', title: 'New devices get a 169.254 address', level: 1,
    ticket: 'Reception: "New phones and laptops say they have no network, but the ones already connected work."',
    devices: [PC, R],
    causes: [
      { id: 'dhcp-off', label: 'The DHCP server is disabled' },
      { id: 'pool-full', label: 'The DHCP address pool is exhausted' },
      { id: 'cable', label: 'A cable or switch port is bad' },
      { id: 'vlan', label: 'The client is in the wrong VLAN' },
    ],
    truth: 'pool-full',
    par: 4,
    cmds: [
      { id: 'a', device: 'pc', cmd: 'ipconfig', out: 'Ethernet adapter:\n  Autoconfiguration IPv4 Address . : 169.254.31.7\n  Subnet Mask . . . . . . . . . . . : 255.255.0.0', rules: ['cable'] },
      { id: 'b', device: 'r1', cmd: '/ip dhcp-server print', out: 'Columns: NAME, INTERFACE, ADDRESS-POOL, LEASE-TIME\n# NAME   INTERFACE  ADDRESS-POOL  LEASE-TIME\n0 dhcp1  bridge     pool-lan      10m', rules: ['dhcp-off'] },
      { id: 'c', device: 'r1', cmd: '/ip dhcp-server lease print count-only', out: '51', points: true },
      { id: 'd', device: 'r1', cmd: '/ip pool print', out: 'Columns: NAME, RANGES\n#  NAME      RANGES\n0  pool-lan  192.168.88.200-192.168.88.250', points: true, rules: ['vlan'] },
    ],
    fix: ['/ip pool set pool-lan ranges=192.168.88.100-192.168.88.250', '# or shorten the lease time so old leases expire sooner'],
    lesson: 'The pool 192.168.88.200-250 holds 51 addresses and there are 51 leases, so no address is left for a new client. Clients that fail DHCP give themselves a 169.254.x.x link-local address. Widen the pool or shorten the lease time.',
    read: { href: '/learn/foundations/06-dns-and-dhcp', label: 'DNS and DHCP' },
  },
  {
    id: 'noc-5', title: 'BGP session never comes up', level: 3,
    ticket: 'NOC alert: "The new upstream BGP session has never come up. The upstream says their side is ready, their AS number is 64500, and they are the ones opening the connection to us."',
    devices: [R],
    causes: [
      { id: 'fw-179', label: 'Our firewall blocks TCP 179' },
      { id: 'no-route', label: 'No route to the neighbour address' },
      { id: 'wrong-as', label: 'Wrong remote AS number' },
      { id: 'link-down', label: 'The link to the upstream is down' },
    ],
    truth: 'fw-179',
    par: 4,
    cmds: [
      { id: 'a', device: 'r1', cmd: '/ping 198.51.100.1', out: 'SEQ HOST          SIZE TTL TIME\n  0 198.51.100.1    56  64 1ms\nsent=1 received=1 packet-loss=0%', rules: ['no-route', 'link-down'] },
      { id: 'b', device: 'r1', cmd: '/routing bgp connection print', out: ' 0 name=upstream remote.address=198.51.100.1 remote.as=64500 local.role=ebgp connect=no listen=yes', rules: ['wrong-as'] },
      { id: 'c', device: 'r1', cmd: '/ip firewall filter print stats where chain=input', out: 'Columns: CHAIN, ACTION, BYTES, PACKETS\n# CHAIN  ACTION  BYTES  PACKETS\n0 input  accept    408        9\n1 input  drop        0        0\n2 input  accept      0        0\n3 input  drop    4 256       42', points: true },
      { id: 'd', device: 'r1', cmd: '/routing bgp session print', out: '(nothing is printed: no session exists until the TCP connection is made)', },
    ],
    fix: ['/ip firewall filter add chain=input action=accept protocol=tcp dst-port=179 src-address=198.51.100.1 place-before=3'],
    lesson: 'BGP runs over TCP port 179. The ping works, the route exists and the AS number matches the upstream\'s, so the problem is the input chain: the final rule drops everything that is not from the LAN, including the upstream\'s incoming BGP connection, and its counter climbs with every retry. On RouterOS 7.16 a session that is not established does not appear in the session list at all. If this router also opened the connection itself it would still come up, because the replies match the established rule; here the router only listens. Add an accept for the neighbour above the drop.',
    read: { href: '/learn/routing/01-bgp-fundamentals', label: 'BGP' },
  },
  {
    id: 'noc-6', title: 'VLAN 20 users get no address', level: 2,
    ticket: 'Helpdesk: "Everybody on the second floor (VLAN 20) has no network. VLAN 10 is fine."',
    devices: [{ id: 'sw', label: 'Switch (MikroTik)' }, R],
    causes: [
      { id: 'trunk-tag', label: 'VLAN 20 is not tagged on the trunk port' },
      { id: 'dhcp-off', label: 'The VLAN 20 DHCP server is disabled' },
      { id: 'pvid', label: 'The access ports have the wrong PVID' },
      { id: 'no-vlan-if', label: 'The router has no VLAN 20 interface' },
    ],
    truth: 'trunk-tag',
    par: 4,
    cmds: [
      { id: 'a', device: 'r1', cmd: '/interface vlan print', out: 'Flags: R - RUNNING\nColumns: NAME, MTU, ARP, VLAN-ID, INTERFACE\n#   NAME     MTU  ARP      VLAN-ID  INTERFACE\n0 R vlan10  1500  enabled       10  ether2\n1 R vlan20  1500  enabled       20  ether2', rules: ['no-vlan-if'] },
      { id: 'b', device: 'r1', cmd: '/ip dhcp-server print', out: 'Columns: NAME, INTERFACE, ADDRESS-POOL, LEASE-TIME\n# NAME    INTERFACE  ADDRESS-POOL  LEASE-TIME\n0 dhcp10  vlan10     p10           30m\n1 dhcp20  vlan20     p20           30m', rules: ['dhcp-off'] },
      { id: 'c', device: 'sw', cmd: '/interface bridge port print', out: 'Columns: INTERFACE, BRIDGE, HW, PVID, PRIORITY, HORIZON\n# INTERFACE  BRIDGE  HW   PVID  PRIORITY  HORIZON\n0 ether3     bridge  yes    20  0x80      none\n1 ether4     bridge  yes    20  0x80      none\n2 ether1     bridge  yes     1  0x80      none', rules: ['pvid'] },
      { id: 'd', device: 'sw', cmd: '/interface bridge vlan print', out: 'Flags: D - DYNAMIC\nColumns: BRIDGE, VLAN-IDS, CURRENT-TAGGED, CURRENT-UNTAGGED\n#   BRIDGE  VLAN-IDS  CURRENT-TAGGED  CURRENT-UNTAGGED\n0   bridge        10  ether1          ether2\n1   bridge        20  bridge          ether3\n                                      ether4', points: true },
    ],
    fix: ['/interface bridge vlan set [find where vlan-ids=20] tagged=bridge,ether1'],
    lesson: 'The router side (VLAN interface and DHCP) and the access ports (PVID 20) are correct. In the bridge VLAN table VLAN 20 is tagged on the bridge but not on the trunk port ether1, so the tagged frames never leave the switch toward the router.',
    read: { href: '/learn/layer2/05-vlan-trunks-qinq-and-mtu', label: 'VLAN trunks and MTU' },
  },
  {
    id: 'noc-7', title: 'Packets go round in circles', level: 2,
    ticket: 'NOC: "Traffic from the branch to the data centre never arrives. Traceroute looks strange."',
    devices: [R, { id: 'r2', label: 'Router R2' }],
    causes: [
      { id: 'loop', label: 'A routing loop between R1 and R2' },
      { id: 'fw', label: 'A firewall rule drops the traffic' },
      { id: 'link', label: 'The R1-R2 link is down' },
      { id: 'no-route', label: 'R1 has no route at all' },
    ],
    truth: 'loop',
    par: 3,
    cmds: [
      { id: 'a', device: 'r1', cmd: '/tool traceroute 192.168.3.10', out: 'Columns: ADDRESS, LOSS, SENT, LAST\n#  ADDRESS      LOSS  SENT  LAST\n1  10.0.12.2    0%       1  0.7ms\n2  10.0.12.1    0%       1  0.5ms\n3  10.0.12.2    0%       1  0.6ms\n4  10.0.12.1    0%       1  0.5ms\n5               100%     1  timeout', points: true, rules: ['link', 'no-route'] },
      { id: 'b', device: 'r1', cmd: '/ip route print where dst-address=0.0.0.0/0', out: 'Flags: A - ACTIVE; s - STATIC\nColumns: DST-ADDRESS, GATEWAY, DISTANCE\n#    DST-ADDRESS  GATEWAY      DISTANCE\n0 As 0.0.0.0/0    10.0.12.2           1', rules: ['no-route'], points: true },
      { id: 'c', device: 'r2', cmd: '/ip route print where dst-address=0.0.0.0/0', out: 'Flags: A - ACTIVE; s - STATIC\nColumns: DST-ADDRESS, GATEWAY, DISTANCE\n#    DST-ADDRESS  GATEWAY      DISTANCE\n0 As 0.0.0.0/0    10.0.12.1           1', points: true },
      { id: 'd', device: 'r2', cmd: '/ip firewall filter print', out: '(no entries)', rules: ['fw'] },
    ],
    fix: ['# On R2, send the data-centre network toward R3 instead of back to R1', '/ip route add dst-address=192.168.3.0/24 gateway=10.0.23.2'],
    lesson: 'The traceroute alternates between 10.0.12.2 and 10.0.12.1. R1 sends everything to R2 and R2\'s default route sends it straight back. TTL drops by one at each hop until the packet dies. Give R2 a more specific route to the destination.',
    read: { href: '/play/route-4', label: 'Play: The Loop Trap' },
  },
  {
    id: 'noc-8', title: 'The server never answers', level: 2,
    ticket: 'App team: "Branch users can reach the server\'s router, but the server never replies to their pings."',
    devices: [R, { id: 'r3', label: 'Router R3 (server side)' }],
    causes: [
      { id: 'no-return', label: 'R3 has no route back to the branch network' },
      { id: 'fw', label: 'R3 firewall blocks ICMP' },
      { id: 'no-fwd', label: 'R1 has no route to the server network' },
      { id: 'link', label: 'A link on the path is down' },
    ],
    truth: 'no-return',
    par: 4,
    cmds: [
      { id: 'a', device: 'r1', cmd: '/tool traceroute 192.168.3.10', out: 'Columns: ADDRESS, LOSS, SENT, LAST\n#  ADDRESS      LOSS  SENT  LAST\n1  10.0.12.2    0%       1  1ms\n2  10.0.23.2    0%       1  1ms\n3               100%     1  timeout\n4               100%     1  timeout' },
      { id: 'b', device: 'r3', cmd: '/ip firewall filter print', out: '(no entries)', rules: ['fw'] },
      { id: 'c', device: 'r3', cmd: '/ip route print', out: 'Flags: D - DYNAMIC; A - ACTIVE; c - CONNECT\nColumns: DST-ADDRESS, GATEWAY, DISTANCE\n    DST-ADDRESS      GATEWAY  DISTANCE\nDAc 10.0.23.0/30     ether1          0\nDAc 192.168.3.0/24   ether2          0', points: true },
      { id: 'd', device: 'r3', cmd: '/tool sniffer quick ip-address=192.168.1.10', out: 'Columns: INTERFACE, TIME, NUM, DIR, SRC-MAC, DST-MAC, SRC-ADDRESS\nINTERFACE  TIME   NUM  DIR  SRC-MAC            DST-MAC            SRC-ADDRESS\nether1     0.833    1  <-   0C:49:6A:BD:00:00  0C:B2:7D:55:00:00  192.168.1.10\nether1     1.836    2  <-   0C:49:6A:BD:00:00  0C:B2:7D:55:00:00  192.168.1.10\n(requests arrive; nothing is sent back out)', points: true, rules: ['no-fwd', 'link'] },
    ],
    fix: ['/ip route add dst-address=192.168.1.0/24 gateway=10.0.23.1'],
    lesson: 'The request arrives (traceroute and sniffer prove it), but R3\'s table only has its two connected networks. It has no route to 192.168.1.0/24, so the reply has nowhere to go. A route works in one direction only: the return path needs one too.',
    read: { href: '/play/route-2', label: 'Play: The Return Trip' },
  },
  {
    id: 'noc-9', title: 'Port forward works on the bench, not on site', level: 2,
    ticket: 'Customer: "We forwarded port 8080 to our camera server, but nobody can reach it from outside."',
    devices: [R],
    causes: [
      { id: 'cgnat', label: 'The WAN address is behind carrier-grade NAT' },
      { id: 'dstnat', label: 'The dst-nat rule is wrong' },
      { id: 'fw', label: 'The forward chain blocks the traffic' },
      { id: 'server', label: 'The camera server is offline' },
    ],
    truth: 'cgnat',
    par: 4,
    cmds: [
      { id: 'a', device: 'r1', cmd: '/ip firewall nat print', out: ' 0 chain=dstnat action=dst-nat protocol=tcp dst-port=8080 in-interface-list=WAN to-addresses=192.168.88.50 to-ports=8080', rules: ['dstnat'] },
      { id: 'b', device: 'r1', cmd: '/ip firewall filter print where chain=forward', out: ' 0 chain=forward action=accept connection-state=established,related\n 1 chain=forward action=accept connection-nat-state=dstnat', rules: ['fw'] },
      { id: 'c', device: 'r1', cmd: '/ping 192.168.88.50', out: 'sent=3 received=3 packet-loss=0%', rules: ['server'] },
      { id: 'd', device: 'r1', cmd: '/ip address print where interface=ether1', out: ' 0 D 100.72.5.14/22  ether1', points: true },
      { id: 'e', device: 'r1', cmd: '/tool fetch url="https://ifconfig.example/ip" output=user', out: 'Your public IP: 203.0.113.77', points: true },
    ],
    fix: ['# Ask the ISP for a public (non-CGNAT) address, or use an outbound tunnel/VPN or a reverse proxy instead of a port forward.'],
    lesson: 'The rule, the firewall and the server are all fine. The WAN address 100.72.5.14 is in 100.64.0.0/10, the shared address space for carrier-grade NAT (RFC 6598), and the public address seen from outside is different. The ISP\'s NAT sits in front of you, so inbound connections never reach your router.',
  },
  {
    id: 'noc-10', title: 'The whole network crawls', level: 2,
    ticket: 'Everyone: "Since someone plugged in a new switch the network is very slow. The router CPU is at 100%."',
    devices: [{ id: 'sw', label: 'Core switch' }, R],
    causes: [
      { id: 'loop', label: 'A layer-2 loop and no spanning tree' },
      { id: 'ddos', label: 'A DDoS from the internet' },
      { id: 'dhcp', label: 'The DHCP server is overloaded' },
      { id: 'bad-cable', label: 'A faulty cable' },
    ],
    truth: 'loop',
    par: 3,
    cmds: [
      { id: 'a', device: 'r1', cmd: '/interface monitor-traffic ether1 once', out: '                         name:      ether1\n        rx-packets-per-second:          38\n           rx-bits-per-second:      42.0kbps\n        tx-packets-per-second:          29\n           tx-bits-per-second:      31.0kbps', rules: ['ddos'] },
      { id: 'b', device: 'sw', cmd: '/interface bridge print', out: 'Flags: X - disabled, R - running\n 0 R name="bridge" mtu=auto actual-mtu=1500 l2mtu=65535 arp=enabled\n     protocol-mode=none fast-forward=yes igmp-snooping=no auto-mac=yes\n     ageing-time=5m vlan-filtering=no', points: true },
      { id: 'c', device: 'sw', cmd: '/interface print stats', out: 'Columns: NAME, RX-BYTE, TX-BYTE, RX-PACKET, TX-PACKET\n#    NAME       RX-BYTE      TX-BYTE  RX-PACKET  TX-PACKET\n0 RS ether1   6 429 647    6 256 215     46 394     49 379\n1 RS ether2   5 496 775    5 745 770     45 115     44 137\n2 RS ether3     432 798    5 924 238     47 873     46 574', points: true, rules: ['bad-cable', 'dhcp'] },
    ],
    fix: ['/interface bridge set bridge protocol-mode=rstp', '# then remove the extra cable that closes the loop'],
    lesson: 'Internet traffic is low, so it is not a DDoS. On the switch the bridge has protocol-mode=none and two ports receive millions of broadcast packets: a frame is circulating around a loop, and layer 2 has no TTL to stop it. Enabling RSTP blocks one path.',
    read: { href: '/tools/stp-lab', label: 'Spanning tree lab' },
  },
  {
    id: 'noc-11', title: 'OSPF neighbour never appears', level: 3,
    ticket: 'Engineer: "R1 and R2 are connected but they never become OSPF neighbours."',
    devices: [R, { id: 'r2', label: 'Router R2' }],
    causes: [
      { id: 'passive', label: 'The interface is configured passive' },
      { id: 'link', label: 'The link is down' },
      { id: 'area', label: 'Area mismatch' },
      { id: 'fw', label: 'A firewall drops OSPF' },
    ],
    truth: 'passive',
    par: 4,
    cmds: [
      { id: 'a', device: 'r1', cmd: '/ping 10.0.12.2', out: 'sent=3 received=3 packet-loss=0%', rules: ['link'] },
      { id: 'b', device: 'r1', cmd: '/routing ospf neighbor print', out: '(no entries)' },
      { id: 'c', device: 'r2', cmd: '/routing ospf interface-template print', out: ' 0 area=backbone interfaces=ether1 instance-id=0 type=broadcast cost=1', rules: ['area'] },
      { id: 'd', device: 'r1', cmd: '/routing ospf interface-template print', out: ' 0 area=backbone interfaces=ether1 instance-id=0 type=broadcast cost=1 passive', points: true, rules: ['area'] },
      { id: 'e', device: 'r1', cmd: '/ip firewall filter print', out: '(no entries)', rules: ['fw'] },
    ],
    fix: ['/routing ospf interface-template set [find interfaces=ether1] !passive'],
    lesson: 'A passive interface advertises its network but does not send or accept OSPF hellos, so no neighbour can form. The areas match and the link works. Use passive only on interfaces that face customers or LANs, not on links to other routers.',
    read: { href: '/learn/mikrotik/03-routing-static-ospf-bgp', label: 'Routing lesson' },
  },
  {
    id: 'noc-12', title: 'Upstream cannot see our prefix', level: 3,
    ticket: 'Upstream: "Your BGP session is Established but we receive no routes from you."',
    devices: [R],
    causes: [
      { id: 'session', label: 'The BGP session is not really up' },
      { id: 'out-filter', label: 'Our output filter rejects the prefix' },
      { id: 'anchor', label: 'The prefix is not in our routing table (no anchor route)' },
      { id: 'in-filter', label: 'The upstream input filter rejects it' },
    ],
    truth: 'anchor',
    par: 4,
    cmds: [
      { id: 'a', device: 'r1', cmd: '/routing bgp session print', out: 'Flags: E - established\n 0 E name=upstream-1 remote.address=198.51.100.1 remote.as=64500', rules: ['session'] },
      { id: 'b', device: 'r1', cmd: '/routing filter rule print', out: ' 0 chain=bgp-out rule="if (dst == 203.0.113.0/24) { accept }"\n 1 chain=bgp-out rule="reject"', rules: ['out-filter'] },
      { id: 'c', device: 'r1', cmd: '/ip route print where dst-address=203.0.113.0/24', out: '(no entries)', points: true },
      { id: 'd', device: 'r1', cmd: '/routing bgp advertisements print', out: '(no entries)', points: true, rules: ['in-filter'] },
    ],
    fix: ['/ip route add dst-address=203.0.113.0/24 blackhole comment="BGP anchor"'],
    lesson: 'The session is up and our filter allows 203.0.113.0/24, but BGP can only advertise what is in the routing table. With no route for the prefix there is nothing to announce. An anchor (blackhole) route for our own block makes the prefix exist; more specific customer routes still win.',
    read: { href: '/learn/routing/01-bgp-fundamentals', label: 'BGP' },
  },
];
