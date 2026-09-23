import type { LessonKit } from '../lessonKit';

export const ROUTING_KITS: LessonKit[] = [
  {
    lesson: 'routing/01-bgp-fundamentals',
    level: 'Professional',
    incidents: ['noc-5'],
    labs: ['bgp-basics'],
    quiz: [
      { q: 'Which transport does BGP use?', options: ['UDP 179', 'TCP 179', 'TCP 80', 'UDP 520'], answer: 1, explain: 'BGP peers open a TCP session on port 179. If a firewall drops 179 the session cannot be established.' },
      { q: 'How is an eBGP neighbour recognised?', options: ['Same AS number', 'Different AS number', 'Same router ID', 'Same MAC'], answer: 1, explain: 'eBGP runs between different autonomous systems. iBGP runs inside one AS.' },
      { q: 'What must match on both ends for a session to come up?', options: ['The router names', 'The AS numbers each side expects, plus reachability of the peer address', 'The interface names', 'The MTU only'], answer: 1, explain: 'Each side is configured with the other AS number. A wrong number or unreachable address leaves the session down.' },
      { q: 'Which attribute makes BGP prefer one exit over another inside your AS?', options: ['Local preference', 'MED only', 'Weight of the interface', 'TTL'], answer: 0, explain: 'A higher local preference is preferred. It is the usual tool for choosing the outbound path.' },
    ],
  },
  {
    lesson: 'routing/02-route-maps-and-policy',
    level: 'Professional',
    quiz: [
      { q: 'On RouterOS v7, what is the default action at the end of a routing filter chain?', options: ['Accept', 'Reject', 'Ask', 'Log'], answer: 1, explain: 'The default is reject. A chain must end with an explicit accept for what you want to allow.' },
      { q: 'Which is safest for an upstream link?', options: ['Accept every prefix', 'Accept only what you expect and announce only your own prefixes', 'Announce the whole table', 'No filters'], answer: 1, explain: 'A missing filter can leak routes or accept bogons. Always filter in and out.' },
      { q: 'Where is it most reliable to set attributes such as MED that the neighbour will use?', options: ['In your output filter', 'In the receiver input filter', 'On the interface', 'In DNS'], answer: 1, explain: 'A test on 7.16 showed that a MED set in an output filter on a locally originated prefix was not advertised; prepending in the output chain works.' },
    ],
  },
  {
    lesson: 'routing/03-bgp-in-isp-networks',
    level: 'Professional',
    incidents: ['noc-12'],
    gns3Labs: ['bgp-two-isp'],
    quiz: [
      { q: 'Your upstream cannot see your prefix. Which is a common cause on RouterOS?', options: ['No matching route in your table for the network you announce', 'Wrong time zone', 'DNS', 'A bad cable to a customer'], answer: 0, explain: 'A router only originates a prefix it has in its routing table. Add the network or an anchor blackhole route.' },
      { q: 'What does prepending the AS path do?', options: ['Makes the route look longer so it is less preferred', 'Deletes the route', 'Speeds the session', 'Changes the AS number'], answer: 0, explain: 'A longer path is less attractive to other networks, so prepend the path you want as backup.' },
      { q: 'What is the benefit of BFD with BGP?', options: ['Faster failure detection than the hold timer', 'More prefixes', 'Encryption', 'Lower latency'], answer: 0, explain: 'In tests, the BGP hold timer took minutes; with BFD both ends noticed in about two seconds.' },
    ],
  },
  {
    lesson: 'routing/04-ospf-for-enterprise',
    level: 'Professional',
    incidents: ['noc-11'],
    labs: ['ospf-triangle'],
    quiz: [
      { q: 'Two OSPF neighbours never reach Full. A likely cause?', options: ['Different area IDs or timers on the shared link', 'DNS', 'A VLAN name', 'The clock'], answer: 0, explain: 'Hello and dead timers and the area must match on a link, or the neighbours never form an adjacency.' },
      { q: 'What does making a LAN interface passive do?', options: ['Advertises the network but sends no hellos', 'Blocks the network', 'Doubles the cost', 'Turns OSPF off everywhere'], answer: 0, explain: 'You advertise the LAN without letting neighbours form there. On RouterOS 7.16 passive is a bare flag, and passive=yes is a syntax error.' },
      { q: 'How does OSPF choose the best path?', options: ['Lowest total cost', 'Fewest hops', 'Highest bandwidth link only', 'Oldest route'], answer: 0, explain: 'OSPF adds interface costs along the path and picks the lowest total.' },
    ],
  },
  {
    lesson: 'routing/05-route-reflection-confederations',
    level: 'Professional',
    quiz: [
      { q: 'Why do large iBGP networks use route reflectors?', options: ['iBGP needs a full mesh otherwise, which does not scale', 'To encrypt sessions', 'To speed up OSPF', 'To reduce the AS number'], answer: 0, explain: 'A route reflector re-advertises iBGP routes, so routers need a session to the reflector instead of to every other router.' },
      { q: 'What stops a route reflector loop?', options: ['Originator ID and cluster list', 'TTL', 'The MTU', 'DNS'], answer: 0, explain: 'The originator ID and the cluster list let a router see that a route came back to where it started.' },
      { q: 'A confederation splits one AS into...', options: ['Sub-ASes that look like one AS to the outside', 'Two VLANs', 'Two OSPF areas', 'Two DHCP scopes'], answer: 0, explain: 'Inside, the sub-ASes run eBGP-like sessions. Outside, they show as a single AS.' },
    ],
  },
  {
    lesson: 'routing/06-multicast-basics',
    level: 'Professional',
    quiz: [
      { q: 'Multicast is used to...', options: ['Send one stream to a group of interested receivers', 'Send to everybody', 'Send to one host', 'Encrypt a stream'], answer: 0, explain: 'One copy leaves the source and routers copy it only where receivers joined the group.' },
      { q: 'How do hosts tell the network they want a group?', options: ['IGMP', 'ARP', 'DHCP', 'BGP'], answer: 0, explain: 'IGMP reports let routers and snooping switches know which ports have receivers.' },
      { q: 'What can flood a VLAN when IGMP snooping is off?', options: ['Multicast traffic', 'Only unicast', 'Only DNS', 'Nothing'], answer: 0, explain: 'Without snooping, a switch treats multicast like broadcast and sends it to every port.' },
    ],
  },
  {
    lesson: 'routing/07-bfd-fast-failover',
    level: 'Professional',
    quiz: [
      { q: 'What does BFD do?', options: ['Detects link and neighbour failure in a fraction of a second', 'Balances traffic', 'Encrypts a link', 'Assigns addresses'], answer: 0, explain: 'BFD sends tiny frequent packets, so routing protocols can react in about a second instead of waiting for their own timers.' },
      { q: 'On RouterOS 7.16, use-bfd=yes alone gives...', options: ['A working session', 'An inactive session until a /routing bfd configuration entry exists', 'An error at boot', 'A faster link'], answer: 1, explain: 'Tested on a real router: the session stayed inactive ("BFD forbidden for interface") until a configuration entry for the interface was added.' },
      { q: 'What unit did the BFD min-rx and min-tx use in the tested configuration?', options: ['Seconds only', 'Milliseconds, for example 200ms', 'Bits', 'Hops'], answer: 1, explain: 'The tested entry used min-rx=200ms min-tx=200ms multiplier=5.' },
    ],
  },
];
