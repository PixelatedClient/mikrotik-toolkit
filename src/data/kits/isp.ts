import type { LessonKit } from '../lessonKit';

export const ISP_KITS: LessonKit[] = [
  {
    lesson: 'isp-ops/01-ftth-gpon-architecture',
    level: 'Professional',
    quiz: [
      { q: 'In GPON, what sits at the customer end?', options: ['An OLT', 'An ONT or ONU', 'A BNG', 'A route reflector'], answer: 1, explain: 'The ONT is the customer device; the OLT is in the operator central office.' },
      { q: 'What does a passive splitter do?', options: ['Shares one fibre between several customers without power', 'Amplifies the signal', 'Routes traffic', 'Encrypts traffic'], answer: 0, explain: 'A passive optical splitter divides the light. It needs no power, which is why the network is called passive.' },
      { q: 'Which direction is shared between customers on one PON port?', options: ['Only upstream', 'Both directions share the PON capacity', 'Neither', 'Only management'], answer: 1, explain: 'A PON is a shared medium. Downstream is broadcast and upstream is scheduled between ONTs.' },
    ],
  },
  {
    lesson: 'isp-ops/02-gpon-config-troubleshooting',
    level: 'Professional',
    quiz: [
      { q: 'An ONT shows LOS. What does that mean?', options: ['Loss of signal: no light is being received', 'Low speed', 'Wrong VLAN', 'License expired'], answer: 0, explain: 'LOS means no optical signal. Check the fibre, connectors and splitter first.' },
      { q: 'Which measurement checks a fibre link?', options: ['Optical power level in dBm', 'MTU', 'DNS time', 'ARP count'], answer: 0, explain: 'Compare received power to the expected range. Too low means a dirty connector or a bad splice.' },
      { q: 'Many customers on one PON go offline together. Suspect...', options: ['The shared feeder fibre or the OLT port', 'Each customer router', 'DNS', 'DHCP lease time'], answer: 0, explain: 'A common cause affects everyone behind it. The feeder is shared.' },
    ],
  },
  {
    lesson: 'isp-ops/03-network-monitoring',
    level: 'Professional',
    quiz: [
      { q: 'What does a flow record such as NetFlow or IPFIX contain?', options: ['A summary of a conversation (addresses, ports, bytes)', 'Every packet payload', 'Only the MAC table', 'Only interface counters'], answer: 0, explain: 'Flows summarise who talked to whom and how much, without the packet contents.' },
      { q: 'Why graph interface traffic over time?', options: ['To spot trends and capacity limits before customers complain', 'To fill disk space', 'To speed the link', 'To hide problems'], answer: 0, explain: 'History shows growth and unusual spikes.' },
      { q: 'What should you monitor besides bandwidth?', options: ['Errors, drops, CPU and temperature', 'Nothing else', 'Only DNS', 'Only the wall clock'], answer: 0, explain: 'Errors and drops often appear before an outage.' },
    ],
  },
  {
    lesson: 'isp-ops/04-snmp-management',
    level: 'Professional',
    quiz: [
      { q: 'Which SNMP version adds authentication and encryption?', options: ['v1', 'v2c', 'v3', 'v0'], answer: 2, explain: 'SNMPv3 has users, authentication and optional privacy (encryption). v1 and v2c use a community string in clear text.' },
      { q: 'What is an OID?', options: ['A numeric name for one managed value', 'A password', 'An address', 'A VLAN'], answer: 0, explain: 'OIDs form a tree. Each value, such as ifInOctets, has an OID.' },
      { q: 'Why restrict SNMP to your monitoring server address?', options: ['So outsiders cannot read your network data', 'To speed polling', 'To use less memory', 'To avoid traps'], answer: 0, explain: 'SNMP reveals a lot about the network. Restrict it by address and prefer v3.' },
    ],
  },
  {
    lesson: 'isp-ops/05-sla-and-traffic-engineering',
    level: 'Professional',
    quiz: [
      { q: 'What does an SLA say?', options: ['What service level the provider promises and how it is measured', 'Which cable to use', 'The router model', 'The VLAN numbers'], answer: 0, explain: 'A service level agreement defines targets such as availability and response time.' },
      { q: 'What does 99.9% availability allow per year?', options: ['About 8.8 hours of downtime', 'About 8.8 minutes', 'About 88 hours', 'None'], answer: 0, explain: '0.1% of a year is about 8.76 hours.' },
      { q: 'Traffic engineering is mainly about...', options: ['Steering traffic over the links you want', 'Changing MAC addresses', 'Assigning names', 'Encrypting'], answer: 0, explain: 'You influence paths with metrics, attributes and policy so links are used well.' },
    ],
  },
  {
    lesson: 'isp-ops/06-peering-and-ix',
    level: 'Professional',
    quiz: [
      { q: 'What is an internet exchange (IX)?', options: ['A place where networks connect and exchange traffic directly', 'A DNS server', 'A VPN', 'A firewall'], answer: 0, explain: 'Networks peer at an IX to send traffic to each other without paying a transit provider.' },
      { q: 'Peering usually means...', options: ['Exchanging only each other customer routes', 'Giving the other side full transit', 'Sharing passwords', 'Merging ASNs'], answer: 0, explain: 'Settlement-free peers exchange the routes of themselves and their customers.' },
      { q: 'Which protection is common on IX sessions?', options: ['Prefix filters and maximum-prefix limits', 'None', 'Only DNS', 'Only ACL on the LAN'], answer: 0, explain: 'Filters and limits stop a neighbour from leaking or flooding routes.' },
    ],
  },
  {
    lesson: 'isp-ops/07-isp-scaling',
    level: 'Professional',
    quiz: [
      { q: 'What is the main reason to move from a flat network to a routed hierarchy at scale?', options: ['Smaller failure domains and simpler growth', 'Cheaper cables', 'Fewer users', 'No need for monitoring'], answer: 0, explain: 'Layers with routing between them keep a fault from spreading and let each part grow.' },
      { q: 'What does CGNAT let an ISP do?', options: ['Share one public address between many customers', 'Give every customer many addresses', 'Remove NAT', 'Speed up BGP'], answer: 0, explain: 'It stretches limited IPv4 space, at the cost of port forwarding and some applications.' },
      { q: 'Which address block is reserved for carrier-grade NAT?', options: ['100.64.0.0/10', '10.0.0.0/8', '169.254.0.0/16', '192.0.2.0/24'], answer: 0, explain: '100.64.0.0/10 is shared address space for ISP NAT. It is not private RFC 1918 space.' },
    ],
  },
  {
    lesson: 'isp-ops/08-ddos-mitigation-basics',
    level: 'Professional',
    quiz: [
      { q: 'What is a DDoS attack?', options: ['Traffic from many sources meant to overwhelm a target', 'A password guess', 'A routing loop', 'A DNS update'], answer: 0, explain: 'Many sources send more traffic than the target link or service can handle.' },
      { q: 'What is a blackhole (RTBH) used for?', options: ['Dropping traffic to a victim address at the edge to protect the rest of the network', 'Speeding a link', 'Load balancing', 'Logging'], answer: 0, explain: 'The victim is sacrificed so the shared links stay up. It is a last resort.' },
      { q: 'Why does anti-spoofing matter for attacks?', options: ['It stops reflected or forged source traffic from leaving your network', 'It speeds routing', 'It fixes DNS', 'It changes MTU'], answer: 0, explain: 'Filtering forged sources at the edge means your network cannot be used to attack others.' },
    ],
  },
  {
    lesson: 'isp-ops/09-ipv6-deployment',
    level: 'Professional',
    quiz: [
      { q: 'How large is an IPv6 address?', options: ['32 bits', '64 bits', '128 bits', '256 bits'], answer: 2, explain: '128 bits, written as eight groups of hexadecimal.' },
      { q: 'What prefix length is normally given to a single customer LAN?', options: ['/64', '/48 per host', '/128', '/32'], answer: 0, explain: 'A /64 is the standard subnet size, because SLAAC needs it.' },
      { q: 'What does DHCPv6 prefix delegation do?', options: ['Hands a customer router a whole prefix to use on its LANs', 'Gives one host an address', 'Replaces BGP', 'Encrypts traffic'], answer: 0, explain: 'The ISP delegates, for example, a /56 or /60, and the customer router splits it into /64s.' },
    ],
  },
];
