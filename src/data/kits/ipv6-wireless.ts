import type { LessonKit } from '../lessonKit';

export const IPV6_WIRELESS_KITS: LessonKit[] = [
  {
    lesson: 'ipv6-wireless/01-ipv6-addressing-slaac-neighbor-discovery',
    level: 'Associate',
    quiz: [
      { q: 'What does :: do in an IPv6 address, and how many times can it appear?', options: ['Collapses one run of all-zero groups; at most once per address', 'Marks the end of the address; can appear anywhere', 'Separates IPv6 from an embedded IPv4 address; twice', 'Indicates a multicast address; unlimited times'], answer: 0, explain: 'Only one :: is allowed per address, otherwise the number of collapsed groups would be ambiguous.' },
      { q: 'What two pieces of information does a host combine to build its own address under SLAAC?', options: ['The advertised network prefix and an interface identifier', 'Its MAC address and its hostname', 'A DHCP lease and a default gateway', 'Its link-local address and a DNS server'], answer: 0, explain: 'The Router Advertisement supplies the prefix; the host supplies (or randomises) the rest of the address itself.' },
      { q: 'Why does IPv6 use multicast for neighbour solicitation instead of a broadcast like ARP?', options: ['It targets a narrow solicited-node group instead of interrupting every host on the link', 'Multicast is required by IPv6 addressing rules', 'Broadcast does not exist in any Layer 2 technology', 'It makes the request encrypted'], answer: 0, explain: 'Solicited-node multicast reaches a much narrower set of hosts than a broadcast would, reducing unnecessary interrupts.' },
    ],
  },
  {
    lesson: 'ipv6-wireless/02-dual-stack-and-transition',
    level: 'Associate',
    quiz: [
      { q: 'Why does a broken IPv6 path often go unnoticed on a dual-stack network with Happy Eyeballs?', options: ['The client falls back to IPv4 fast enough that the failure is invisible to the user', 'IPv6 is disabled by default on most clients', 'Happy Eyeballs disables IPv6 permanently after one failure', 'Dual stack networks cannot use IPv6 for browsing'], answer: 0, explain: 'Racing both connections hides a slow or broken IPv6 path behind a fast IPv4 fallback, which is convenient but can mask real problems.' },
      { q: 'What problem does NAT64 solve that dual stack alone does not?', options: ['Letting an IPv6-only client reach an IPv4-only server', 'Letting two IPv4 networks with overlapping addresses talk to each other', 'Encrypting traffic between two IPv6 hosts', 'Assigning IPv6 addresses without a DHCP server'], answer: 0, explain: 'Dual stack requires both protocols on both ends; NAT64 bridges an IPv6-only client to an IPv4-only destination.' },
      { q: 'What is the difference in direction between NAT64 and DS-Lite?', options: ['NAT64 lets IPv6-only clients reach IPv4; DS-Lite tunnels IPv4 customer traffic over an IPv6-only access network', 'They are two names for the same mechanism', 'DS-Lite is only used inside a single data centre', 'NAT64 requires no IPv6 at all'], answer: 0, explain: 'NAT64 serves IPv6-only clients reaching IPv4; DS-Lite serves an IPv6-only last mile still carrying customer IPv4 traffic.' },
    ],
  },
  {
    lesson: 'ipv6-wireless/03-wifi-standards-channels-rf-basics',
    level: 'Associate',
    quiz: [
      { q: 'Why do most 2.4 GHz deployments only use channels 1, 6 and 11?', options: ['They are the only non-overlapping 20 MHz channels in that band', 'They are reserved by regulation for Wi-Fi only', 'Other channels are reserved for Bluetooth', 'Client devices cannot scan any other channels'], answer: 0, explain: 'Any other channel choice overlaps with one of 1, 6 or 11, causing unnecessary contention between networks.' },
      { q: 'Why does 2.4 GHz reach further through walls than 5 GHz?', options: ['Lower frequencies diffract around obstacles more easily', '2.4 GHz radios are always transmitted at higher power', '5 GHz is blocked by regulation indoors', '2.4 GHz uses a different antenna type'], answer: 0, explain: 'Lower frequency signals bend around and pass through obstacles more readily than higher frequency ones.' },
      { q: 'What is the throughput-vs-capacity trade-off in choosing a wider channel width?', options: ['Wider channels carry more data per AP but leave fewer non-overlapping channels for a dense deployment', 'Wider channels always reduce range with no other effect', 'Wider channels only work on 2.4 GHz', 'Wider channels reduce security'], answer: 0, explain: 'A single AP benefits from a wide channel; many APs in the same space need narrower channels to avoid colliding.' },
    ],
  },
  {
    lesson: 'ipv6-wireless/04-site-surveys-and-roaming',
    level: 'Associate',
    quiz: [
      { q: 'What does an active survey measure that a passive survey does not?', options: ['The actual signal and roaming behaviour produced by a temporary test AP', 'The building\'s wall materials', 'The number of existing networks nearby', 'Nothing; they measure the same thing'], answer: 0, explain: 'A passive survey only observes existing signal and noise; an active survey installs a real test AP and measures its actual coverage.' },
      { q: 'Why does too much coverage overlap between APs hurt performance, not just too little?', answer: 0, options: ['It wastes airtime to co-channel interference between APs unnecessarily both audible at full strength', 'It always disables roaming entirely', 'It prevents SLAAC from working', 'It is not actually a problem'], explain: 'Excess overlap means multiple APs compete for the same airtime in the same spot, hurting throughput even with strong signal.' },
      { q: 'What does using the same SSID and security settings across every AP buy you for roaming?', options: ['The client sees one logical network and can move between APs without re-authenticating', 'It increases the maximum transmit power', 'It is required for 802.11ax support', 'It removes the need for a site survey'], answer: 0, explain: 'A consistent SSID and security configuration lets the client roam seamlessly instead of treating each AP as a separate network.' },
    ],
  },
];
