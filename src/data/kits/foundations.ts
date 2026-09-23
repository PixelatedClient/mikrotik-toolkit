import type { LessonKit } from '../lessonKit';

export const FOUNDATIONS_KITS: LessonKit[] = [
  {
    lesson: 'foundations/01-what-is-a-network',
    level: 'Beginner',
    labs: ['first-link'],
    video: {
      url: 'https://www.youtube.com/embed/3QhU9jd0giI',
      duration: '8 min',
    },
    quiz: [
      { q: 'What does a router do that a switch does not?', options: ['Forwards frames by MAC address', 'Forwards packets between different IP networks', 'Assigns MAC addresses', 'Encrypts all traffic'], answer: 1, explain: 'A switch moves frames inside one network using MAC addresses. A router looks at the destination IP address and moves packets between networks.' },
      { q: 'Data on the wire is split into small pieces. What are the pieces called at layer 3?', options: ['Frames', 'Packets', 'Segments', 'Bits'], answer: 1, explain: 'Layer 3 (IP) carries packets. Layer 2 carries frames, and TCP carries segments.' },
      { q: 'Two computers on the same switch can talk without a router because...', options: ['Switches route IP', 'They are in the same network and use MAC addresses', 'The switch has a default gateway', 'DHCP joins them'], answer: 1, explain: 'Hosts in the same IP network reach each other directly. They only need a router to leave that network.' },
    ],
  },
  {
    lesson: 'foundations/02-ip-addressing-subnetting',
    level: 'Beginner',
    labs: ['subnet-carve'],
    quiz: [
      { q: 'How many usable host addresses does a /24 have?', options: ['256', '255', '254', '253'], answer: 2, explain: '2^8 = 256 addresses, minus the network address and the broadcast address = 254.' },
      { q: 'Which of these is the network address of 192.168.10.77/26?', options: ['192.168.10.0', '192.168.10.64', '192.168.10.76', '192.168.10.128'], answer: 1, explain: 'A /26 has blocks of 64. 77 falls in the block that starts at 64 (64 to 127).' },
      { q: 'Which subnet mask matches /30?', options: ['255.255.255.192', '255.255.255.224', '255.255.255.240', '255.255.255.252'], answer: 3, explain: '/30 leaves 2 host bits: the last octet is 11111100 = 252. Two usable hosts, ideal for a router-to-router link.' },
      { q: 'Which address is private (RFC 1918)?', options: ['172.32.0.1', '172.20.5.9', '100.64.0.1', '192.169.1.1'], answer: 1, explain: '172.16.0.0/12 covers 172.16.0.0 to 172.31.255.255. 100.64/10 is carrier-grade NAT space, not RFC 1918.' },
    ],
  },
  {
    lesson: 'foundations/03-your-first-router',
    level: 'Beginner',
    labs: ['three-router'],
    quiz: [
      { q: 'On RouterOS, which command adds an address to an interface?', options: ['/ip address add address=10.0.0.1/24 interface=ether1', '/interface set ether1 ip=10.0.0.1', '/ip add 10.0.0.1 ether1', '/address add 10.0.0.1/24'], answer: 0, explain: 'The address needs a prefix length and the interface it lives on.' },
      { q: 'A router has a connected route to 10.0.12.0/30 only. What happens to a ping to 10.0.23.2?', options: ['It works', 'It fails: there is no route to that network', 'It goes to the default gateway automatically', 'The router asks DHCP'], answer: 1, explain: 'Without a static route, a dynamic protocol or a default route, the router does not know where to send the packet.' },
      { q: 'What does a static route need at minimum?', options: ['A destination network and a next hop', 'A destination and a VLAN', 'An AS number', 'A MAC address'], answer: 0, explain: 'dst-address says where, gateway says which neighbour to send it to. The gateway must be reachable on a connected network.' },
    ],
  },
  {
    lesson: 'foundations/04-switching-and-vlans',
    level: 'Beginner',
    labs: ['inter-vlan-routing'],
    quiz: [
      { q: 'What does a VLAN do?', options: ['Adds encryption', 'Splits one switch into separate broadcast domains', 'Increases the link speed', 'Assigns IP addresses'], answer: 1, explain: 'Each VLAN is its own layer 2 network. Traffic between VLANs needs a router.' },
      { q: 'A trunk port carries frames for several VLANs. How are they told apart?', options: ['By the MAC address', 'By an 802.1Q tag', 'By the IP address', 'By port number'], answer: 1, explain: 'The 802.1Q header adds a 12-bit VLAN ID to each frame on a trunk.' },
      { q: 'On a RouterOS bridge, when should vlan-filtering be turned on?', options: ['First, before anything else', 'Last, after ports and VLAN entries are configured', 'Never', 'Only on the router, not the switch'], answer: 1, explain: 'Turning it on early can cut off your own management path. Enable it last.' },
    ],
  },
  {
    lesson: 'foundations/05-nat-and-firewalls',
    level: 'Beginner',
    labs: ['nat-port-forward'],
    incidents: ['noc-9'],
    quiz: [
      { q: 'What does masquerade (source NAT) do for a private LAN?', options: ['Hides the internal addresses behind the router public address', 'Blocks all inbound traffic', 'Encrypts the traffic', 'Assigns addresses by DHCP'], answer: 0, explain: 'Outgoing packets get the router public address as their source, so replies come back to the router.' },
      { q: 'In a firewall filter, which rule wins when two rules match?', options: ['The last one', 'The most specific one', 'The first one in the chain', 'Both are applied'], answer: 2, explain: 'RouterOS checks rules top to bottom and the first match decides. That is why rule order matters.' },
      { q: 'Traffic addressed to the router itself is judged in which chain?', options: ['forward', 'input', 'output', 'prerouting'], answer: 1, explain: 'Packets for the router go through input. Packets passing through go through forward.' },
      { q: 'What does drop do compared with reject?', options: ['Drop silently discards; reject sends an ICMP error back', 'Drop sends an error; reject discards', 'They are identical', 'Drop only works for TCP'], answer: 0, explain: 'A drop makes the sender wait and time out. A reject tells it immediately.' },
    ],
  },
  {
    lesson: 'foundations/06-dns-and-dhcp',
    level: 'Beginner',
    labs: ['dhcp-basics'],
    incidents: ['noc-1', 'noc-2', 'noc-4', 'noc-6'],
    quiz: [
      { q: 'A PC shows the address 169.254.12.7. What most likely happened?', options: ['It has a static address', 'DHCP failed and it gave itself a link-local address', 'The DNS server is down', 'The gateway is wrong'], answer: 1, explain: 'A 169.254.0.0/16 address is self-assigned when no DHCP server answers.' },
      { q: 'Pinging 8.8.8.8 works but opening a website by name fails. What should you check?', options: ['The default route', 'DNS', 'The subnet mask of the switch', 'Spanning tree'], answer: 1, explain: 'If a raw IP works, routing is fine. Names are resolved by DNS, so look at the DNS server setting and allow-remote-requests on the router.' },
      { q: 'What does a DHCP server hand out besides the address?', options: ['Only the address', 'Gateway, DNS servers and lease time', 'The MAC address', 'A VLAN tag'], answer: 1, explain: 'A lease usually carries the mask, default gateway, DNS servers and how long the lease lasts.' },
    ],
  },
  {
    lesson: 'foundations/07-tcpip-in-action',
    level: 'Beginner',
    labs: ['trace-the-path'],
    incidents: ['noc-7', 'noc-8'],
    quiz: [
      { q: 'What does TTL protect against?', options: ['Packets that are too big', 'Packets looping forever', 'Packets from spoofed sources', 'Slow links'], answer: 1, explain: 'Every router lowers TTL by one. At zero the packet is dropped, which ends routing loops.' },
      { q: 'Which flags does the first packet of a TCP handshake carry?', options: ['SYN', 'SYN and ACK', 'ACK', 'FIN'], answer: 0, explain: 'The client sends SYN, the server answers SYN-ACK, the client finishes with ACK.' },
      { q: 'traceroute shows a * at hop 4 but later hops answer. What does that suggest?', options: ['The path is broken', 'Hop 4 does not answer ICMP time-exceeded, but forwards traffic', 'The destination is down', 'A DNS problem'], answer: 1, explain: 'A silent hop only means that router does not send the error. Traffic still passes through it.' },
    ],
  },
];

