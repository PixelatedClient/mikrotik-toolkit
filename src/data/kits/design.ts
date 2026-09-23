import type { LessonKit } from '../lessonKit';

export const DESIGN_KITS: LessonKit[] = [
  {
    lesson: 'design/01-requirements-and-site-survey',
    level: 'Associate',
    quiz: [
      { q: 'Which is a requirement rather than a solution?', options: ['We need two firewalls', 'We cannot be offline for more than an hour', 'Use OSPF', 'Buy a bigger switch'], answer: 1, explain: 'A requirement says what the network must achieve. Firewalls and protocols are ways to meet it.' },
      { q: 'How much downtime per year does 99.9 percent availability allow?', options: ['About 8.8 hours', 'About 53 minutes', 'About 3.7 days', 'None'], answer: 0, explain: '0.1 percent of a year is about 8.8 hours. 99.99 percent is about 53 minutes.' },
      { q: 'Why should you write your assumptions down?', options: ['To fill the document', 'So you can see which one broke when something changes', 'Because auditors insist', 'To choose a vendor'], answer: 1, explain: 'When users grow or an application changes, the assumptions show what needs a redesign.' },
    ],
  },
  {
    lesson: 'design/02-ip-addressing-plan',
    level: 'Associate',
    quiz: [
      { q: 'What does aligning a block to the bit boundary make possible?', options: ['Summarising several subnets into one route', 'Faster ARP', 'Bigger MTU', 'More VLANs'], answer: 0, explain: 'A /22 that starts on a multiple of 4 in the third octet covers exactly four /24s, so one route describes them.' },
      { q: 'Which prefix is a sensible size for a segment with about 100 hosts including growth?', options: ['/25', '/27', '/29', '/23 minimum'], answer: 0, explain: 'A /25 has 126 usable addresses, the smallest block that fits 100 hosts.' },
      { q: 'Two sites both use 192.168.1.0/24 and you want to join them by VPN. What is the main problem?', options: ['Overlapping addresses', 'Different MTU', 'A DNS loop', 'Wrong VLAN ID'], answer: 0, explain: 'A router cannot tell which site an address belongs to. Renumber one side or use NAT, and check before connecting.' },
    ],
  },
  {
    lesson: 'design/03-vlan-and-segmentation-design',
    level: 'Associate',
    labs: ['inter-vlan-routing'],
    quiz: [
      { q: 'What should you write first when designing the firewall between segments?', options: ['The allowed flows as arrows, then deny the rest', 'A drop rule for everything', 'The password list', 'The MAC table'], answer: 0, explain: 'Design the flows you need and turn them into allow rules. Anything without an arrow is denied.' },
      { q: 'What is the risk of router on a stick in a busy network?', options: ['The single trunk link to the router becomes a bottleneck', 'It cannot route', 'It needs IPv6', 'It disables VLANs'], answer: 0, explain: 'All inter-VLAN traffic crosses one link twice. A layer 3 switch avoids that.' },
      { q: 'Where should unused switch ports go?', options: ['A user VLAN', 'A dead VLAN with no gateway, or shut down', 'The management VLAN', 'VLAN 1 with everything else'], answer: 1, explain: 'An unused port in a working VLAN is an open door. Park it somewhere harmless.' },
    ],
  },
  {
    lesson: 'design/04-redundancy-and-failure-domains',
    level: 'Associate',
    quiz: [
      { q: 'What is a failure domain?', options: ['Everything affected when one thing fails', 'A DNS zone', 'A VLAN name', 'A type of cable'], answer: 0, explain: 'Smaller failure domains mean a single failure hurts fewer users.' },
      { q: 'Why add BFD to a routing session?', options: ['Failure detection in about a second instead of waiting for protocol timers', 'More prefixes', 'Encryption', 'Fewer routes'], answer: 0, explain: 'In tests, a BGP hold timer took minutes to notice a silent failure and BFD took about two seconds.' },
      { q: 'When is a failover design really redundant?', options: ['When it is drawn on paper', 'When you have tested it by breaking the primary on purpose', 'When it is expensive', 'When both links use the same cable'], answer: 1, explain: 'An untested failover is a guess. Test it in a maintenance window.' },
    ],
  },
  {
    lesson: 'design/05-reference-designs-and-design-review',
    level: 'Professional',
    quiz: [
      { q: 'Which design needs the strictest filtering on routing sessions?', options: ['The small office', 'The small ISP edge', 'A home network', 'A single switch'], answer: 1, explain: 'An ISP edge exchanges routes with other networks, so it needs BGP input and output filters and anti-spoofing.' },
      { q: 'What does the answer "not needed, because..." force in a design review?', options: ['A written reason for leaving something out', 'Nothing', 'A new device', 'A rewrite'], answer: 0, explain: 'The reason turns an accidental omission into a decision someone can check.' },
      { q: 'Which finding is most common when reviewing a real network?', options: ['No management VLAN, untested backups or an untested failover', 'Too many redundant links', 'Too much documentation', 'Too many monitoring tools'], answer: 0, explain: 'The boring parts are usually missing. They are cheap to fix on paper.' },
    ],
  },
];
