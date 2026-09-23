import type { Packet, Rule } from '../../lib/game/firewall';

export interface FwLevel {
  id: string;
  title: string;
  story: string;
  learn: string;
  goal: string;
  boss?: string;
  /** Rules already in place (the player can edit or reorder them). */
  initial?: Rule[];
  packets: Packet[];
  /** Fewest rules that solve it. Three stars at par, two within 2, otherwise one. */
  par: number;
  solution: Rule[];
  /** Which fields the rule builder shows, to keep early levels simple. */
  fields: ('chain' | 'action' | 'proto' | 'port' | 'src' | 'dst' | 'state' | 'iface')[];
  read?: { href: string; label: string };
}

let n = 0;
const P = (label: string, over: Partial<Packet> & Pick<Packet, 'evil' | 'why'>): Packet => ({
  id: `p${++n}`, label, chain: 'input', iface: 'wan', src: '203.0.113.50', proto: 'tcp', dstPort: 443, state: 'new', ...over,
});

const BASE = ['action', 'proto', 'port'] as const;

export const FW_LEVELS: FwLevel[] = [
  {
    id: 'fw-1',
    title: 'Close the Telnet Gate',
    story: 'Scouts from the wasteland are knocking on port 23, an old, unencrypted door your router still has open. Slam it shut without blocking the villagers.',
    learn: 'A firewall rule matches traffic by protocol and port, then accepts or drops it. Telnet (TCP 23) sends passwords in clear text, so it must never face the internet.',
    goal: 'Stop the telnet scouts. Let normal web traffic through.',
    packets: [
      P('Telnet scout', { dstPort: 23, evil: true, src: '198.51.100.7', why: 'Telnet sends passwords in clear text.' }),
      P('Telnet scout', { dstPort: 23, evil: true, src: '203.0.113.99', why: 'Telnet sends passwords in clear text.' }),
      P('Telnet scout', { dstPort: 23, evil: true, src: '192.0.2.44', why: 'Telnet sends passwords in clear text.' }),
      P('Web visitor', { dstPort: 443, evil: false, why: 'HTTPS is the normal way to reach a web page.' }),
      P('Web visitor', { dstPort: 80, evil: false, src: '198.51.100.20', why: 'HTTP web traffic.' }),
    ],
    par: 1,
    solution: [{ chain: 'input', action: 'drop', proto: 'tcp', dstPort: [23] }],
    fields: [...BASE],
    read: { href: '/learn/foundations/05-nat-and-firewalls', label: 'NAT and firewalls' },
  },
  {
    id: 'fw-2',
    title: 'Default Deny',
    story: 'Too many doors, too few guards. Instead of hunting every bad port, allow only what the village needs and close everything else.',
    learn: 'A RouterOS chain accepts any packet that matches no rule. To be safe, list what you allow first and end with a rule that drops everything else. Rules run from top to bottom and the first match wins, so a drop-all placed first would lock out everyone.',
    goal: 'Allow web traffic (TCP 80 and 443) only. Drop everything else.',
    packets: [
      P('Web visitor', { dstPort: 443, evil: false, why: 'HTTPS web traffic.' }),
      P('Web visitor', { dstPort: 80, evil: false, src: '198.51.100.20', why: 'HTTP web traffic.' }),
      P('SSH brute-forcer', { dstPort: 22, evil: true, src: '192.0.2.44', why: 'SSH should not face the internet.' }),
      P('Winbox probe', { dstPort: 8291, evil: true, src: '198.51.100.7', why: 'Router management must not face the internet.' }),
      P('Telnet scout', { dstPort: 23, evil: true, why: 'Clear-text login.' }),
      P('DNS amplifier', { proto: 'udp', dstPort: 53, evil: true, src: '192.0.2.81', why: 'An open DNS resolver is used in DDoS attacks.' }),
    ],
    par: 2,
    solution: [{ chain: 'input', action: 'accept', proto: 'tcp', dstPort: [80, 443] }, { chain: 'input', action: 'drop' }],
    fields: [...BASE],
    read: { href: '/learn/mikrotik/05-firewall-and-nat', label: 'Firewall and NAT rules' },
  },
  {
    id: 'fw-3',
    title: 'Remember the Replies',
    story: 'Your villagers browse the outside world, but if you slam the gate on everything from outside, the replies get locked out as well.',
    learn: 'Connection tracking gives every packet a state. Replies to conversations you started are established or related, so you accept those first. Then a new connection arriving from the WAN is one nobody asked for, and can be dropped.',
    goal: 'Let replies and villagers out, keep unsolicited outsiders from entering the LAN.',
    packets: [
      P('Villager browsing', { chain: 'forward', iface: 'lan', src: '192.168.88.20', dst: '93.184.216.34', dstPort: 443, evil: false, why: 'Your own users opening a connection outwards.' }),
      P('Reply to a villager', { chain: 'forward', state: 'established', src: '93.184.216.34', dst: '192.168.88.20', dstPort: 51000, evil: false, why: 'A reply to a connection your user started.' }),
      P('RDP raider', { chain: 'forward', dst: '192.168.88.30', dstPort: 3389, evil: true, why: 'Nobody inside asked for this connection.' }),
      P('File-share raider', { chain: 'forward', dst: '192.168.88.31', dstPort: 445, evil: true, src: '198.51.100.7', why: 'Windows file sharing must never be reachable from the internet.' }),
      P('SSH raider', { chain: 'forward', dst: '192.168.88.32', dstPort: 22, evil: true, src: '192.0.2.44', why: 'Nobody inside asked for this connection.' }),
    ],
    par: 2,
    solution: [
      { chain: 'forward', action: 'accept', state: ['established', 'related'] },
      { chain: 'forward', action: 'drop', iface: 'wan' },
    ],
    fields: ['chain', 'action', 'state', 'iface'],
    read: { href: '/learn/mikrotik/05-firewall-and-nat', label: 'Firewall and NAT rules' },
  },
  {
    id: 'fw-4',
    title: 'Order of Battle',
    story: 'The previous guard wrote the right rules in the wrong order. The villagers are locked out and the raiders walk right past.',
    learn: 'Order is everything. The first matching rule decides, and RouterOS stops. A broad drop placed above a specific accept means the accept can never fire. Move the specific rules up.',
    goal: 'Reorder the rules so web traffic passes and everything else is dropped.',
    initial: [{ chain: 'input', action: 'drop' }, { chain: 'input', action: 'accept', proto: 'tcp', dstPort: [80, 443] }],
    packets: [
      P('Web visitor', { dstPort: 443, evil: false, why: 'HTTPS web traffic.' }),
      P('Web visitor', { dstPort: 80, evil: false, src: '198.51.100.20', why: 'HTTP web traffic.' }),
      P('SSH brute-forcer', { dstPort: 22, evil: true, why: 'SSH should not face the internet.' }),
      P('Telnet scout', { dstPort: 23, evil: true, src: '192.0.2.44', why: 'Clear-text login.' }),
    ],
    par: 2,
    solution: [{ chain: 'input', action: 'accept', proto: 'tcp', dstPort: [80, 443] }, { chain: 'input', action: 'drop' }],
    fields: [...BASE],
    read: { href: '/learn/mikrotik/05-firewall-and-nat', label: 'Firewall and NAT rules' },
  },
  {
    id: 'fw-5',
    title: 'VIP Only',
    story: 'The admin needs SSH from the office, 10.10.0.0/24, and only from there. The public still needs the website.',
    learn: 'Rules can match the source address too. Allow management only from a trusted network, and let the default drop stop everyone else. Put the trusted rule before the drop.',
    goal: 'Allow SSH (TCP 22) only from 10.10.0.0/24, allow HTTPS for everyone, drop the rest.',
    packets: [
      P('Admin at the office', { src: '10.10.0.25', dstPort: 22, evil: false, why: 'The trusted admin network.' }),
      P('Web visitor', { dstPort: 443, evil: false, why: 'Public website.' }),
      P('SSH brute-forcer', { dstPort: 22, evil: true, src: '203.0.113.9', why: 'Not from the admin network.' }),
      P('SSH brute-forcer', { dstPort: 22, evil: true, src: '198.51.100.4', why: 'Not from the admin network.' }),
      P('Telnet scout', { dstPort: 23, evil: true, why: 'Clear-text login.' }),
    ],
    par: 3,
    solution: [
      { chain: 'input', action: 'accept', proto: 'tcp', src: '10.10.0.0/24', dstPort: [22] },
      { chain: 'input', action: 'accept', proto: 'tcp', dstPort: [443] },
      { chain: 'input', action: 'drop' },
    ],
    fields: ['action', 'proto', 'port', 'src'],
    read: { href: '/learn/mikrotik-ops/04-users-services-and-secure-management', label: 'Secure management' },
  },
  {
    id: 'fw-6',
    title: 'Invalid and Ping',
    story: 'Strange packets that belong to no conversation are arriving, and someone is pinging your border. Staff may ping inside; strangers may not.',
    learn: 'Drop invalid packets early: they match no known connection and are usually forged or broken. Then accept established and related traffic, then only the exact new traffic you want, then drop the rest.',
    goal: 'Drop invalid packets, let staff ping the router from the LAN, and drop everything else that is new.',
    packets: [
      P('Forged packet', { state: 'invalid', dstPort: 443, evil: true, why: 'It matches no connection. It is forged or broken.' }),
      P('Reply to the router', { state: 'established', src: '198.51.100.20', dstPort: 51000, evil: false, why: 'Part of a conversation the router started.' }),
      P('Staff ping', { iface: 'lan', src: '192.168.88.5', proto: 'icmp', dstPort: undefined, evil: false, why: 'Staff testing the router from the LAN.' }),
      P('Recon ping', { proto: 'icmp', dstPort: undefined, evil: true, why: 'Outsiders mapping your network.' }),
      P('Port probe', { dstPort: 1433, evil: true, src: '192.0.2.44', why: 'Scanning for databases.' }),
    ],
    par: 4,
    solution: [
      { chain: 'input', action: 'drop', state: ['invalid'] },
      { chain: 'input', action: 'accept', state: ['established', 'related'] },
      { chain: 'input', action: 'accept', proto: 'icmp', iface: 'lan' },
      { chain: 'input', action: 'drop' },
    ],
    fields: ['action', 'proto', 'state', 'iface'],
    read: { href: '/learn/mikrotik-ops/04-users-services-and-secure-management', label: 'Secure management' },
  },
  {
    id: 'fw-7',
    title: 'Guard the Village Hall',
    story: 'The village hall (192.168.88.10) runs the public website. Only it may be reached from outside, and only on TCP 80. Every other house stays hidden.',
    learn: 'You can match on the destination address as well. Accept known replies, accept the one exposed service to its one server, then drop new connections from the WAN. This is the pattern behind a port forward.',
    goal: 'Allow new web traffic from the WAN to 192.168.88.10 only. Keep the rest of the LAN unreachable from outside.',
    packets: [
      P('Visitor to the hall', { chain: 'forward', dst: '192.168.88.10', dstPort: 80, evil: false, why: 'Public access to the one web server.' }),
      P('Reply from the hall', { chain: 'forward', iface: 'lan', state: 'established', src: '192.168.88.10', dst: '198.51.100.20', dstPort: 51000, evil: false, why: 'The web server answering a visitor.' }),
      P('Villager browsing', { chain: 'forward', iface: 'lan', src: '192.168.88.20', dst: '93.184.216.34', dstPort: 443, evil: false, why: 'Your own users going out.' }),
      P('Raider at another house', { chain: 'forward', dst: '192.168.88.20', dstPort: 80, evil: true, why: 'Only the web server is meant to be public.' }),
      P('Raider at the hall', { chain: 'forward', dst: '192.168.88.10', dstPort: 22, evil: true, src: '192.0.2.44', why: 'Only TCP 80 is public.' }),
      P('Raider with RDP', { chain: 'forward', dst: '192.168.88.30', dstPort: 3389, evil: true, why: 'Remote desktop must not be public.' }),
    ],
    par: 3,
    solution: [
      { chain: 'forward', action: 'accept', state: ['established', 'related'] },
      { chain: 'forward', action: 'accept', proto: 'tcp', dstPort: [80], dst: '192.168.88.10/32', iface: 'wan' },
      { chain: 'forward', action: 'drop', iface: 'wan' },
    ],
    fields: ['chain', 'action', 'proto', 'port', 'dst', 'state', 'iface'],
    read: { href: '/labs/nat-port-forward', label: 'NAT and port forwarding lab' },
  },
  {
    id: 'fw-8',
    title: 'Boss: The Storm Dragon',
    boss: 'The Storm Dragon',
    story: 'The dragon attacks the router itself and the village behind it in one huge wave. You need the whole ruleset: protect the router, then the LAN.',
    learn: 'A real ruleset has two parts. The input chain protects the router. The forward chain protects the networks behind it. Both start by accepting established and related traffic, and both end with a drop for the rest.',
    goal: 'Build a full defence with as few rules as you can.',
    packets: [
      P('Admin over SSH', { src: '10.10.0.25', dstPort: 22, evil: false, why: 'The trusted admin network.' }),
      P('Router ping from LAN', { iface: 'lan', src: '192.168.88.5', proto: 'icmp', dstPort: undefined, evil: false, why: 'Staff testing.' }),
      P('Reply to the router', { state: 'established', src: '198.51.100.20', dstPort: 51000, evil: false, why: 'A conversation the router started.' }),
      P('Winbox probe', { dstPort: 8291, evil: true, src: '198.51.100.7', why: 'Router management must not face the internet.' }),
      P('SSH brute-forcer', { dstPort: 22, evil: true, src: '203.0.113.9', why: 'Not from the admin network.' }),
      P('DNS amplifier', { proto: 'udp', dstPort: 53, evil: true, src: '192.0.2.81', why: 'Open resolver abuse.' }),
      P('Forged packet', { state: 'invalid', evil: true, why: 'It matches no connection.' }),
      P('Villager browsing', { chain: 'forward', iface: 'lan', src: '192.168.88.20', dst: '93.184.216.34', dstPort: 443, evil: false, why: 'Your own users going out.' }),
      P('Reply to a villager', { chain: 'forward', state: 'established', src: '93.184.216.34', dst: '192.168.88.20', dstPort: 51000, evil: false, why: 'A reply to your user.' }),
      P('Visitor to the hall', { chain: 'forward', dst: '192.168.88.10', dstPort: 80, evil: false, why: 'The public web server.' }),
      P('File-share raider', { chain: 'forward', dst: '192.168.88.31', dstPort: 445, evil: true, why: 'Nobody inside asked for it.' }),
      P('RDP raider', { chain: 'forward', dst: '192.168.88.10', dstPort: 3389, evil: true, src: '192.0.2.44', why: 'Only TCP 80 is public.' }),
    ],
    par: 8,
    solution: [
      { chain: 'input', action: 'accept', state: ['established', 'related'] },
      { chain: 'input', action: 'drop', state: ['invalid'] },
      { chain: 'input', action: 'accept', proto: 'icmp', iface: 'lan' },
      { chain: 'input', action: 'accept', proto: 'tcp', src: '10.10.0.0/24', dstPort: [22] },
      { chain: 'input', action: 'drop' },
      { chain: 'forward', action: 'accept', state: ['established', 'related'] },
      { chain: 'forward', action: 'accept', proto: 'tcp', dstPort: [80], dst: '192.168.88.10/32', iface: 'wan' },
      { chain: 'forward', action: 'drop', iface: 'wan' },
    ],
    fields: ['chain', 'action', 'proto', 'port', 'src', 'dst', 'state', 'iface'],
    read: { href: '/tools/mikrotik-config-generator', label: 'Config generator' },
  },
  {
    id: 'fw-9',
    title: 'The Dual Webs',
    story: 'Two web servers on the LAN share the public face: 192.168.88.10 on port 80, and 192.168.88.11 on port 443. Both must be reachable from outside, and nothing else.',
    learn: 'A firewall protecting multiple servers uses destination address matching. List each public server and its port. Everything else from the WAN is dropped.',
    goal: 'Allow web traffic to two servers on their specific ports, drop the rest.',
    packets: [
      P('Visitor to port 80', { chain: 'forward', dst: '192.168.88.10', dstPort: 80, evil: false, why: 'Public HTTP server on .10.' }),
      P('Visitor to port 443', { chain: 'forward', dst: '192.168.88.11', dstPort: 443, evil: false, why: 'Public HTTPS server on .11.' }),
      P('Reply to a visitor', { chain: 'forward', state: 'established', src: '192.168.88.10', dst: '203.0.113.5', dstPort: 51000, evil: false, iface: 'lan', why: 'Web server reply.' }),
      P('Mixed-up visitor', { chain: 'forward', dst: '192.168.88.10', dstPort: 443, evil: true, why: 'Port 443 is only on .11.' }),
      P('Raider at .11:80', { chain: 'forward', dst: '192.168.88.11', dstPort: 80, evil: true, src: '203.0.113.9', why: 'Port 80 is only on .10.' }),
      P('SSH raider at .10', { chain: 'forward', dst: '192.168.88.10', dstPort: 22, evil: true, why: 'SSH is not public.' }),
      P('Villager out', { chain: 'forward', iface: 'lan', src: '192.168.88.20', dst: '93.184.216.34', dstPort: 443, evil: false, why: 'LAN user browsing.' }),
    ],
    par: 4,
    solution: [
      { chain: 'forward', action: 'accept', state: ['established', 'related'] },
      { chain: 'forward', action: 'accept', proto: 'tcp', dstPort: [80], dst: '192.168.88.10/32', iface: 'wan' },
      { chain: 'forward', action: 'accept', proto: 'tcp', dstPort: [443], dst: '192.168.88.11/32', iface: 'wan' },
      { chain: 'forward', action: 'drop', iface: 'wan' },
    ],
    fields: ['chain', 'action', 'proto', 'port', 'dst', 'state', 'iface'],
    read: { href: '/learn/mikrotik/05-firewall-and-nat', label: 'Firewall and NAT rules' },
  },
  {
    id: 'fw-10',
    title: 'Private Service',
    story: 'Your office staff (10.20.0.0/16) needs access to a private service on 192.168.88.50:9000. Nobody from outside must reach it, and no other LAN traffic reaches the internal server.',
    learn: 'Combine source and destination matching to expose a service only to a trusted internal network. Place this rule before the drop-all so it wins.',
    goal: 'Let the office reach the private service, block outside access and other local access.',
    packets: [
      P('Office worker', { chain: 'forward', iface: 'lan', src: '10.20.5.30', dst: '192.168.88.50', dstPort: 9000, evil: false, why: 'Trusted office network.' }),
      P('Reply to office', { chain: 'forward', state: 'established', src: '192.168.88.50', dst: '10.20.5.30', dstPort: 51000, evil: false, iface: 'lan', why: 'Service reply.' }),
      P('Outsider trying the service', { chain: 'forward', dst: '192.168.88.50', dstPort: 9000, evil: true, src: '203.0.113.77', why: 'Not from the office.' }),
      P('VPN user from 10.50.0.0/16', { chain: 'forward', iface: 'lan', src: '10.50.1.1', dst: '192.168.88.50', dstPort: 9000, evil: true, why: 'Not from the office subnet.' }),
      P('Other LAN host trying the service', { chain: 'forward', iface: 'lan', src: '192.168.88.20', dst: '192.168.88.50', dstPort: 9000, evil: true, why: 'Not from the office subnet.' }),
    ],
    par: 2,
    solution: [
      { chain: 'forward', action: 'accept', proto: 'tcp', src: '10.20.0.0/16', dstPort: [9000], dst: '192.168.88.50/32', iface: 'lan' },
      { chain: 'forward', action: 'drop', dst: '192.168.88.50/32' },
    ],
    fields: ['chain', 'action', 'proto', 'port', 'src', 'dst', 'iface'],
    read: { href: '/learn/mikrotik/05-firewall-and-nat', label: 'Firewall and NAT rules' },
  },
  {
    id: 'fw-11',
    title: 'Two Services',
    story: 'Run an internal web server (192.168.88.10:80) and an SSH server (192.168.88.11:22), both on the LAN. Only staff from 10.20.0.0/16 should reach SSH; everyone on the LAN can use HTTP.',
    learn: 'Different services need different rules. List each one with its source restrictions. Always end with a drop-all rule to block what you did not explicitly allow.',
    goal: 'Allow HTTP from LAN, SSH only from staff, block everything else.',
    packets: [
      P('Web visitor from LAN', { chain: 'forward', iface: 'lan', src: '192.168.88.20', dst: '192.168.88.10', proto: 'tcp', dstPort: 80, evil: false, why: 'Anyone on the LAN can use the web server.' }),
      P('Staff over SSH', { chain: 'forward', iface: 'lan', src: '10.20.5.5', dst: '192.168.88.11', proto: 'tcp', dstPort: 22, evil: false, why: 'Trusted staff network.' }),
      P('Reply to web visitor', { chain: 'forward', state: 'established', src: '192.168.88.10', dst: '192.168.88.20', dstPort: 51000, evil: false, why: 'Web server reply.' }),
      P('Outsider trying HTTP', { chain: 'forward', dst: '192.168.88.10', proto: 'tcp', dstPort: 80, evil: true, src: '203.0.113.77', why: 'WAN traffic, not from LAN.' }),
      P('Other LAN trying SSH', { chain: 'forward', iface: 'lan', src: '192.168.88.99', dst: '192.168.88.11', proto: 'tcp', dstPort: 22, evil: true, why: 'Not from the staff network.' }),
    ],
    par: 4,
    solution: [
      { chain: 'forward', action: 'accept', state: ['established', 'related'] },
      { chain: 'forward', action: 'accept', proto: 'tcp', dstPort: [80], dst: '192.168.88.10/32', iface: 'lan' },
      { chain: 'forward', action: 'accept', proto: 'tcp', src: '10.20.0.0/16', dstPort: [22], dst: '192.168.88.11/32', iface: 'lan' },
      { chain: 'forward', action: 'drop' },
    ],
    fields: ['chain', 'action', 'proto', 'port', 'src', 'dst', 'state', 'iface'],
    read: { href: '/learn/mikrotik/05-firewall-and-nat', label: 'Firewall and NAT rules' },
  },
];

/** Attack levels: read the enemy's ruleset, then craft a packet that gets through. */
export interface Breach {
  id: string;
  title: string;
  story: string;
  learn: string;
  goal: string;
  chain: 'input' | 'forward';
  enemyRules: Rule[];
  /** What the attacker must get accepted. */
  objective: { proto: 'tcp' | 'udp' | 'icmp'; port?: number; label: string };
  /** Zones the attacker can send from. */
  zones: ('wan' | 'lan')[];
  /** Source addresses the attacker may claim. */
  sources: { ip: string; label: string }[];
  /** A packet that works. */
  solution: { zone: 'wan' | 'lan'; src: string; proto: 'tcp' | 'udp' | 'icmp'; port?: number };
  read?: { href: string; label: string };
}

export const BREACH_LEVELS: Breach[] = [
  {
    id: 'fw-b1',
    title: 'Scout the Wall',
    story: 'The enemy castle has a firewall. Read its rules, find the one door that is open, and knock.',
    learn: 'Reading a ruleset like a firewall does is the skill behind defending. Rules run top to bottom, and the first match decides. A packet that matches an accept rule gets in.',
    goal: 'Get a packet accepted to the enemy on TCP 443.',
    chain: 'input',
    enemyRules: [
      { chain: 'input', action: 'accept', state: ['established', 'related'] },
      { chain: 'input', action: 'accept', proto: 'tcp', dstPort: [443] },
      { chain: 'input', action: 'drop' },
    ],
    objective: { proto: 'tcp', port: 443, label: 'Reach the enemy web server (TCP 443)' },
    zones: ['wan'],
    sources: [{ ip: '203.0.113.5', label: 'Your own address (203.0.113.5)' }],
    solution: { zone: 'wan', src: '203.0.113.5', proto: 'tcp', port: 443 },
    read: { href: '/learn/mikrotik/05-firewall-and-nat', label: 'Firewall and NAT rules' },
  },
  {
    id: 'fw-b2',
    title: 'The Lazy Guard',
    story: 'This castle only lets its own office reach SSH: anyone from 10.0.0.0/8. But addresses in a packet are just claims.',
    learn: 'Allowing traffic by source address is weak on its own, because a source address can be forged. That is why real networks also block spoofed addresses at the edge (BCP 38) and use keys or VPNs, not just a source list.',
    goal: 'Get a packet accepted to the enemy on SSH (TCP 22).',
    chain: 'input',
    enemyRules: [
      { chain: 'input', action: 'accept', state: ['established', 'related'] },
      { chain: 'input', action: 'accept', proto: 'tcp', src: '10.0.0.0/8', dstPort: [22] },
      { chain: 'input', action: 'drop', proto: 'tcp', dstPort: [22] },
    ],
    objective: { proto: 'tcp', port: 22, label: 'Reach SSH on the enemy router (TCP 22)' },
    zones: ['wan'],
    sources: [
      { ip: '203.0.113.5', label: 'Your own address (203.0.113.5)' },
      { ip: '10.20.30.40', label: 'Claim to be an office machine (10.20.30.40)' },
      { ip: '192.0.2.9', label: 'A documentation address (192.0.2.9)' },
    ],
    solution: { zone: 'wan', src: '10.20.30.40', proto: 'tcp', port: 22 },
    read: { href: '/learn/isp-ops/08-ddos-mitigation-basics', label: 'DDoS mitigation (anti-spoofing)' },
  },
  {
    id: 'fw-b3',
    title: 'The Wall That Forgot Its Own Hall',
    story: 'This firewall is perfect against the outside: it drops every new connection from the WAN. But you have a foothold inside the enemy network.',
    learn: 'A firewall that only watches the outside does nothing about threats that are already inside. Segment your networks and filter between them too, not only at the internet edge.',
    goal: 'Get a packet accepted to the enemy on TCP 3389 (remote desktop).',
    chain: 'forward',
    enemyRules: [
      { chain: 'forward', action: 'accept', state: ['established', 'related'] },
      { chain: 'forward', action: 'drop', iface: 'wan' },
    ],
    objective: { proto: 'tcp', port: 3389, label: 'Reach a remote desktop server (TCP 3389)' },
    zones: ['wan', 'lan'],
    sources: [{ ip: '203.0.113.5', label: 'Your own address (203.0.113.5)' }, { ip: '192.168.88.77', label: 'A compromised laptop inside (192.168.88.77)' }],
    solution: { zone: 'lan', src: '192.168.88.77', proto: 'tcp', port: 3389 },
    read: { href: '/tools/vlan-designer', label: 'VLAN designer (segmentation)' },
  },
  {
    id: 'fw-b4',
    title: 'The Web of Decoys',
    story: 'The enemy runs three web servers on the same IP, each on a different port: 8001, 8002, 8003. The public website is on 8080. Your job is to find which port the real administration console sits on.',
    learn: 'When servers hide behind port numbers instead of IP addresses, a firewall must check both. A simple rule like "allow TCP 80" catches only port 80. Reaching a hidden admin port requires knowing the right port number.',
    goal: 'Get a packet accepted to the enemy on TCP 8001 (admin console).',
    chain: 'input',
    enemyRules: [
      { chain: 'input', action: 'accept', state: ['established', 'related'] },
      { chain: 'input', action: 'accept', proto: 'tcp', dstPort: [8080] },
      { chain: 'input', action: 'accept', proto: 'tcp', dstPort: [8001], src: '10.0.0.0/8' },
      { chain: 'input', action: 'drop' },
    ],
    objective: { proto: 'tcp', port: 8001, label: 'Access the admin console (TCP 8001)' },
    zones: ['wan'],
    sources: [
      { ip: '203.0.113.5', label: 'Your own address (203.0.113.5)' },
      { ip: '10.10.10.50', label: 'Spoof an office address (10.10.10.50)' },
      { ip: '10.99.99.99', label: 'Claim to be from 10.0.0.0/8 (10.99.99.99)' },
    ],
    solution: { zone: 'wan', src: '10.99.99.99', proto: 'tcp', port: 8001 },
    read: { href: '/learn/isp-ops/08-ddos-mitigation-basics', label: 'Anti-spoofing (BCP 38)' },
  },
];
