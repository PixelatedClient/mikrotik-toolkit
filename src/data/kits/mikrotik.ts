import type { LessonKit } from '../lessonKit';

export const MIKROTIK_KITS: LessonKit[] = [
  // ----- MikroTik -----
  {
    lesson: 'mikrotik/01-routeros-basics',
    level: 'Associate',
    labs: ['routeros-tour'],
    quiz: [
      { q: 'Where do you type RouterOS commands?', options: ['Only in Winbox', 'In the terminal (SSH, console, WebFig terminal) or Winbox terminal', 'Only through the web page', 'Only with a script file'], answer: 1, explain: 'RouterOS has one command tree. Winbox, WebFig and the terminal all change the same configuration.' },
      { q: 'What does /ip address print do?', options: ['Adds an address', 'Lists the configured addresses', 'Removes all addresses', 'Pings the address'], answer: 1, explain: 'print shows the current entries. add, set and remove change them.' },
      { q: 'What can you press in the terminal to see what is allowed next?', options: ['F5', 'Tab or ?', 'Ctrl+Z', 'Esc twice'], answer: 1, explain: 'Tab completes words and ? lists the choices. That is the fastest way to learn the command tree.' },
    ],
  },
  {
    lesson: 'mikrotik/02-bridge-and-vlans',
    level: 'Associate',
    labs: ['vlan-trunk'],
    quiz: [
      { q: 'What does a bridge port with pvid=20 do with an untagged frame?', options: ['Drops it', 'Treats it as VLAN 20', 'Sends it to VLAN 1', 'Tags it with the MAC address'], answer: 1, explain: 'pvid is the VLAN untagged frames belong to when they enter the port.' },
      { q: 'Where must the bridge itself be listed as tagged for the router to have an address in a VLAN?', options: ['In the bridge vlan entry', 'In /ip service', 'In the DHCP server', 'It never has to'], answer: 0, explain: 'The bridge interface is the router CPU port. To use VLAN 99 on the router, list the bridge as tagged for that VLAN.' },
      { q: 'Real RouterOS adds an "added by pvid" entry when filtering is on. Why?', options: ['A bug', 'So untagged traffic on ports with that pvid is allowed', 'To create routes', 'To rename ports'], answer: 1, explain: 'RouterOS creates dynamic VLAN entries for the pvid of each port so untagged traffic keeps working.' },
    ],
  },
  {
    lesson: 'mikrotik/03-routing-static-ospf-bgp',
    level: 'Associate',
    quiz: [
      { q: 'Two routes match a destination: 10.0.0.0/16 (distance 1) and 10.0.0.0/24 (distance 200). Which is used?', options: ['The /16, lower distance', 'The /24, longest prefix wins first', 'Both', 'Neither'], answer: 1, explain: 'Longest prefix is decided before distance. Distance only breaks ties between routes of the same length.' },
      { q: 'What is the default administrative distance of a static route?', options: ['0', '1', '110', '200'], answer: 1, explain: 'Connected is 0, static 1, eBGP 20, OSPF 110 and iBGP 200.' },
      { q: 'A static route to a gateway that is not on a connected network shows up as...', options: ['Active', 'Inactive, because the next hop is not reachable', 'A blackhole', 'Removed'], answer: 1, explain: 'The gateway must be reachable through a connected route. Otherwise the route stays inactive.' },
    ],
  },
  {
    lesson: 'mikrotik/04-wireguard-vpn',
    level: 'Associate',
    labs: ['wireguard-basics'],
    quiz: [
      { q: 'What is the default MTU of a WireGuard interface on RouterOS?', options: ['1500', '1420', '1280', '9000'], answer: 1, explain: 'It is 1420 because the tunnel headers take room out of a 1500 byte packet.' },
      { q: 'What does allowed-address on a peer mean?', options: ['Which source addresses the peer may use, and which destinations go to it', 'The peer IP only', 'The DNS server', 'The firewall rule'], answer: 0, explain: 'It works as both the filter for incoming traffic and the routing table for outgoing traffic through that peer.' },
      { q: 'A peer shows no handshake. Which is the least likely cause?', options: ['Wrong public key', 'Wrong endpoint or blocked UDP port', 'A different MTU', 'Firewall dropping the listen port'], answer: 2, explain: 'MTU affects large packets after the tunnel is up. A missing handshake points to keys, endpoint or the firewall.' },
    ],
  },
  {
    lesson: 'mikrotik/05-firewall-and-nat',
    level: 'Associate',
    labs: ['firewall-basics', 'nat-port-forward'],
    quiz: [
      { q: 'Which rule should usually be the first in the input chain?', options: ['Drop all', 'Accept established and related', 'Accept everything from the LAN', 'Log everything'], answer: 1, explain: 'Established and related packets are replies to traffic you allowed. Accept them early, then drop what is left.' },
      { q: 'What does a final "drop everything" rule in input protect against?', options: ['Traffic through the router', 'Unwanted access to the router itself', 'Slow DNS', 'Routing loops'], answer: 1, explain: 'input is traffic addressed to the router. A default drop keeps management services closed to the internet.' },
      { q: 'Where does dst-nat happen relative to routing?', options: ['After routing', 'Before routing', 'Instead of routing', 'Only on output'], answer: 1, explain: 'Destination NAT rewrites the address in prerouting so the routing decision uses the new destination.' },
    ],
  },
  {
    lesson: 'mikrotik/06-qos-and-bandwidth',
    level: 'Associate',
    quiz: [
      { q: 'A simple queue is best for...', options: ['Per-user or per-target limits', 'Router firmware', 'DNS', 'Routing'], answer: 0, explain: 'Simple queues limit a target such as a customer or a subnet. Queue trees give finer control by packet mark.' },
      { q: 'Why does a queue-tree entry for voice need max-limit?', options: ['It is required for the rule to be accepted', 'It changes the MTU', 'It enables NAT', 'It enables IPv6'], answer: 0, explain: 'On RouterOS 7.16 the up-voip line was rejected without max-limit, a real bug found while running this lesson.' },
      { q: 'Where should shaping be applied to control download speed?', options: ['On the WAN interface, incoming', 'On the LAN-facing egress', 'On the switch', 'On DNS'], answer: 1, explain: 'You can only delay what you send. Shape on the interface the traffic leaves.' },
    ],
  },
  {
    lesson: 'mikrotik/07-capsman-wireless',
    level: 'Associate',
    quiz: [
      { q: 'What is CAPsMAN for?', options: ['Central management of many access points', 'A firewall', 'A VPN', 'Routing'], answer: 0, explain: 'One controller holds the wireless configuration and pushes it to all CAPs.' },
      { q: 'Which is the main reason to keep the controller and CAPs on a management VLAN?', options: ['Speed', 'Isolation and reliable discovery', 'Less power use', 'Smaller frames'], answer: 1, explain: 'A dedicated management network keeps client traffic away from the control path.' },
      { q: 'Wireless behaviour depends on real radios. Can the browser labs teach it?', options: ['Yes, fully', 'No, this needs real hardware', 'Only with DHCP', 'Only in dark mode'], answer: 1, explain: 'CAPsMAN and wifi were not tested on virtual routers. Verify on real access points.' },
    ],
  },
  {
    lesson: 'mikrotik/08-hotspot-and-guest',
    level: 'Associate',
    quiz: [
      { q: 'What does a hotspot do?', options: ['Forces guests to log in before they get internet', 'Speeds up Wi-Fi', 'Replaces DHCP', 'Blocks all traffic'], answer: 0, explain: 'The hotspot redirects unauthenticated clients to a login page and lets them through after login.' },
      { q: 'Guests should be separated from staff. What is the simplest design?', options: ['One flat network', 'A separate VLAN and subnet with a firewall rule blocking guest to staff', 'The same VLAN with different SSIDs', 'A bigger DHCP pool'], answer: 1, explain: 'A separate VLAN plus a forward rule that drops guest to staff keeps them apart. The inter-VLAN lab does exactly this.' },
      { q: 'Which service must guests still reach even when other traffic is blocked?', options: ['DNS and DHCP', 'SNMP', 'Winbox', 'SSH'], answer: 0, explain: 'Without an address and name resolution, the login page never opens.' },
    ],
  },
  {
    lesson: 'mikrotik/09-isp-edge-router',
    level: 'Professional',
    quiz: [
      { q: 'Why does an ISP edge drop packets with a private source on the WAN?', options: ['Anti-spoofing: those addresses cannot legitimately arrive from the internet', 'To save bandwidth', 'To speed BGP', 'To reduce logging'], answer: 0, explain: 'Bogon and private sources arriving from outside are spoofed. Drop them at the edge.' },
      { q: 'What is a blackhole anchor route used for?', options: ['Making sure the prefix you announce exists in the routing table', 'Blocking a customer', 'Load balancing', 'Logging'], answer: 0, explain: 'A BGP router originating a prefix needs a matching route to announce it. A blackhole route keeps the prefix present even when customers are down.' },
      { q: 'Which filters belong on a BGP session to an upstream?', options: ['None', 'Input and output filters', 'Only output', 'Only DNS filters'], answer: 1, explain: 'Filter what you accept and what you announce. Never trust a neighbour with your whole table.' },
    ],
  },
  {
    lesson: 'mikrotik/10-troubleshooting',
    level: 'Associate',
    quiz: [
      { q: 'A ping to 8.8.8.8 works but a website by name fails. First suspect?', options: ['DNS', 'The default route', 'The cable', 'Spanning tree'], answer: 0, explain: 'Working IP connectivity but failing names points at name resolution.' },
      { q: 'Which order is a good general approach?', options: ['Guess and reboot', 'Check the link, then the address, then the route, then the firewall', 'Reset the router', 'Change the firmware'], answer: 1, explain: 'Working up the layers finds the broken one quickly and avoids random changes.' },
      { q: 'What tells you a drop rule is hit?', options: ['Its counters increase', 'The router beeps', 'The log is empty', 'The interface goes red'], answer: 0, explain: '/ip firewall filter print stats shows packet and byte counters for each rule.' },
    ],
  },

  // ----- MikroTik Operations -----
  {
    lesson: 'mikrotik-ops/01-first-access-and-cli',
    level: 'Associate',
    quiz: [
      { q: 'A brand new RouterOS device has which default login?', options: ['admin with an empty password (older) or a printed password on the label', 'root/root', 'mikrotik/mikrotik', 'No login'], answer: 0, explain: 'The user is admin. Many devices use an empty password; newer ones ship with a unique password on the label. CHR forces a password change on first login.' },
      { q: 'Which is the safest way to make a first change on a remote router?', options: ['Type quickly', 'Use safe mode so a lost connection undoes the change', 'Reboot first', 'Disable the firewall'], answer: 1, explain: 'Safe mode reverts your changes if the session drops, which saves you from locking yourself out.' },
      { q: 'What does /system identity set name=R1 change?', options: ['The hostname shown in the prompt', 'The MAC address', 'The IP address', 'The licence'], answer: 0, explain: 'The identity is the name of the router. Set a unique one so logs and prompts are clear.' },
    ],
  },
  {
    lesson: 'mikrotik-ops/02-backups-exports-and-resets',
    level: 'Associate',
    quiz: [
      { q: 'What is the difference between a backup and an export?', options: ['None', 'A backup is a binary file for the same device, an export is readable text you can edit and reuse', 'A backup is text', 'An export includes passwords'], answer: 1, explain: 'A binary backup restores the same router. An export (.rsc) can be read, compared and applied to another router.' },
      { q: 'Why keep exports in version control?', options: ['They are small', 'You can see exactly what changed between two dates', 'They install faster', 'They are encrypted'], answer: 1, explain: 'A text diff of two exports shows every change made to the configuration.' },
      { q: 'What does a reset with no default configuration give you?', options: ['A router with nothing configured', 'A router with the factory setup', 'A router with the last backup', 'A router with all ports closed'], answer: 0, explain: 'No-defaults reset removes the factory configuration too. You start empty, which is what the lab routers use.' },
    ],
  },
  {
    lesson: 'mikrotik-ops/03-upgrading-routeros',
    level: 'Associate',
    quiz: [
      { q: 'Before an upgrade you should...', options: ['Back up and read the release notes', 'Disable the licence', 'Change the IP', 'Format the disk'], answer: 0, explain: 'A backup and an export let you roll back, and the notes list changes such as renamed commands.' },
      { q: 'Which release channel is best for production routers?', options: ['Development', 'Long-term or stable', 'Testing', 'Whatever is newest'], answer: 1, explain: 'Long-term and stable have had the most testing. Use testing or development only in a lab.' },
      { q: 'Why are commands sometimes different between RouterOS releases?', options: ['They are not', 'Features change; for example BGP moved to templates and connections in v7', 'Only the logo changes', 'Because of the licence'], answer: 1, explain: 'On 7.16 a BGP instance does not exist; you use a template. Always check commands against your version.' },
    ],
  },
  {
    lesson: 'mikrotik-ops/04-users-services-and-secure-management',
    level: 'Associate',
    quiz: [
      { q: 'Which is a good first step to secure management?', options: ['Keep the default admin password', 'Disable services you do not use and restrict the rest by address', 'Open Winbox to the internet', 'Use telnet'], answer: 1, explain: 'Fewer open services and an address restriction shrink the attack surface a lot.' },
      { q: 'Why create a personal user instead of sharing admin?', options: ['It is faster', 'The log shows who changed what', 'Admin cannot log in', 'It saves memory'], answer: 1, explain: 'Separate users give an audit trail and let you remove one person without changing a shared password.' },
      { q: 'Which protocol should replace telnet?', options: ['FTP', 'SSH', 'HTTP', 'SNMPv1'], answer: 1, explain: 'SSH encrypts the session. Telnet sends everything in clear text.' },
    ],
  },
  {
    lesson: 'mikrotik-ops/05-dhcp-and-arp-in-depth',
    level: 'Associate',
    quiz: [
      { q: 'A DHCP server runs out of addresses. Clients show...', options: ['169.254.x.x addresses', 'The old address forever', 'A different VLAN', 'A DNS error only'], answer: 0, explain: 'A client that gets no offer configures a link-local 169.254 address. Check the pool size and stale leases.' },
      { q: 'What does ARP do?', options: ['Maps an IP address to a MAC address on the local network', 'Assigns addresses', 'Routes packets', 'Resolves names'], answer: 0, explain: 'A host that wants to reach an address in its own network asks who has it. The owner answers with its MAC.' },
      { q: 'Which DHCP address does RouterOS hand out first from a pool in the browser and real tests?', options: ['The lowest free', 'The highest free', 'A random one', 'The one closest to the gateway'], answer: 1, explain: 'A real 7.16 router gave the highest free address of the pool first. That is a good thing to remember when checking leases.' },
    ],
  },
  {
    lesson: 'mikrotik-ops/06-pppoe-for-isps',
    level: 'Professional',
    incidents: ['noc-3'],
    quiz: [
      { q: 'PPPoE adds 8 bytes of overhead. What is the usual MTU on the PPPoE link?', options: ['1500', '1492', '1400', '9000'], answer: 1, explain: '1500 minus 8 bytes is 1492. Clients that assume 1500 need MSS clamping or they hang on large transfers.' },
      { q: 'Some websites hang while others load. Which fix is typical for PPPoE?', options: ['Clamp the TCP MSS to the path MTU', 'Change the DNS', 'Add a route', 'Reset the modem'], answer: 0, explain: 'Path MTU discovery is often blocked. Clamping MSS makes TCP use segments that fit.' },
      { q: 'Where does a PPPoE server assign the customer address from?', options: ['A PPP profile and a pool', 'DHCP only', 'The ARP table', 'The bridge'], answer: 0, explain: 'The profile names the local and remote addresses or a pool, so each session gets one.' },
    ],
  },
  {
    lesson: 'mikrotik-ops/07-monitoring-and-diagnostics',
    level: 'Associate',
    quiz: [
      { q: 'Which tool shows each router on the path and how long it takes?', options: ['traceroute', 'ping only', 'ARP', 'DNS'], answer: 0, explain: 'Traceroute sends packets with a rising TTL so every router on the way reports itself.' },
      { q: 'What should an alert be based on?', options: ['Something a person must act on', 'Every log line', 'Only reboots', 'Nothing'], answer: 0, explain: 'Too many alerts get ignored. Alert on conditions that need action, like a link down or a session lost.' },
      { q: 'Torch and packet sniffer are used to...', options: ['See what traffic actually flows', 'Change routes', 'Upgrade firmware', 'Set DNS'], answer: 0, explain: 'They show live traffic, so you can confirm a rule or route is hit.' },
    ],
  },
];
