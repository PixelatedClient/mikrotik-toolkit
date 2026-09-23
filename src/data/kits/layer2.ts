import type { LessonKit } from '../lessonKit';

export const LAYER2_KITS: LessonKit[] = [
  {
    lesson: 'layer2/01-ethernet-frames-and-mac-learning',
    level: 'Associate',
    labs: ['mac-learning'],
    quiz: [
      { q: 'What does a switch do with a frame whose destination MAC it has never seen?', options: ['Drops it', 'Floods it out of every port except the one it arrived on', 'Sends it to the router', 'Sends it back to the sender'], answer: 1, explain: 'An unknown unicast is flooded. When the owner answers, the switch learns its port from the source address of the reply.' },
      { q: 'Which field does a switch learn from an incoming frame?', options: ['Destination MAC', 'Source MAC', 'Source IP', 'VLAN name'], answer: 1, explain: 'The source MAC address and the port it arrived on go into the MAC (bridge host) table.' },
      { q: 'How large is a MAC address?', options: ['32 bits', '48 bits', '64 bits', '128 bits'], answer: 1, explain: 'A MAC address is 48 bits, written as six hexadecimal bytes such as 0C:84:53:9F:00:00.' },
      { q: 'What happens to an entry in the MAC table when the host stays silent for a long time?', options: ['It stays forever', 'It ages out', 'It is copied to the router', 'It turns into an IP route'], answer: 1, explain: 'Entries age out (the RouterOS bridge default ageing time is 5 minutes) so the table follows hosts that move.' },
    ],
  },
  {
    lesson: 'layer2/02-loops-and-spanning-tree',
    level: 'Associate',
    labs: ['rstp-triangle'],
    incidents: ['noc-10'],
    quiz: [
      { q: 'Why is a loop between switches so damaging?', options: ['The cable overheats', 'Broadcasts circle forever and multiply, filling the links', 'MAC addresses are lost', 'DHCP stops working'], answer: 1, explain: 'Ethernet frames have no TTL. A broadcast in a loop is copied at every switch and never dies, which is a broadcast storm.' },
      { q: 'How does spanning tree choose the root bridge?', options: ['The fastest switch', 'The lowest bridge ID (priority, then MAC)', 'The switch with most ports', 'The newest switch'], answer: 1, explain: 'The bridge ID is the priority followed by the MAC address. The lowest value wins. Set the priority on purpose so the right switch becomes root.' },
      { q: 'What does a blocked (alternate) port do?', options: ['Forwards everything', 'Does not forward user traffic but keeps listening to BPDUs', 'Is shut down permanently', 'Routes packets'], answer: 1, explain: 'It breaks the loop by not forwarding, yet it stays ready to take over if the active path fails.' },
    ],
  },
  {
    lesson: 'layer2/03-rstp-and-mstp',
    level: 'Associate',
    quiz: [
      { q: 'Why is RSTP preferred over classic STP?', options: ['It uses less memory', 'It reconverges in seconds instead of tens of seconds', 'It needs no root bridge', 'It supports more VLANs'], answer: 1, explain: 'Real tests on RouterOS showed about 3 seconds for RSTP after a silent failure versus about 34 seconds for classic STP.' },
      { q: 'What is MSTP good for?', options: ['Encrypting BPDUs', 'Running several spanning trees, each covering a group of VLANs', 'Speeding up ARP', 'Replacing VLANs'], answer: 1, explain: 'MSTP maps VLANs to instances so different VLANs can use different active paths.' },
      { q: 'Which ports should be marked as edge ports?', options: ['Ports toward other switches', 'Ports that connect only to end hosts', 'Every port', 'Only trunk ports'], answer: 1, explain: 'An edge port goes straight to forwarding because no bridge sits behind it. It must never receive BPDUs, which is why BPDU guard is paired with it.' },
    ],
  },
  {
    lesson: 'layer2/04-link-aggregation-and-bonding',
    level: 'Associate',
    quiz: [
      { q: 'Why bundle two links into one aggregate?', options: ['To get more bandwidth and survive one link failing', 'To remove the need for VLANs', 'To make MAC addresses shorter', 'To disable spanning tree'], answer: 0, explain: 'The bundle shares traffic across the members and keeps working if one member fails.' },
      { q: 'Does a bond make a single flow faster than one member link?', options: ['Yes, always', 'No, a single flow uses one member because of the hash', 'Only with LACP', 'Only for UDP'], answer: 1, explain: 'Frames of one conversation are kept in order by hashing them onto one link. Many flows together use the whole bundle.' },
      { q: 'What does LACP add compared with a static bundle?', options: ['Encryption', 'A protocol that checks both ends agree and detects a failing member', 'Larger frames', 'Routing'], answer: 1, explain: 'LACP negotiates the bundle, so a mis-cabled or one-sided configuration is noticed instead of causing a loop.' },
    ],
  },
  {
    lesson: 'layer2/05-vlan-trunks-qinq-and-mtu',
    level: 'Associate',
    labs: ['vlan-trunk', 'inter-vlan-routing'],
    quiz: [
      { q: 'How many bytes does a single 802.1Q tag add to a frame?', options: ['2', '4', '8', '12'], answer: 1, explain: 'The tag adds 4 bytes: TPID and TCI with the 12-bit VLAN ID.' },
      { q: 'What is QinQ used for?', options: ['Two tags on one frame, so a provider can carry customer VLANs inside its own', 'Speeding up trunks', 'Removing loops', 'Encrypting VLANs'], answer: 0, explain: 'A provider tag is added outside the customer tag, so customers can keep their own VLAN numbers.' },
      { q: 'A trunk works for small pings but large transfers fail. What should you suspect?', options: ['DNS', 'An MTU mismatch caused by the extra tag', 'Spanning tree', 'The default route'], answer: 1, explain: 'Tags make frames 4 bytes bigger. If a device in the path cannot carry them, large frames are dropped while small ones pass.' },
    ],
  },
  {
    lesson: 'layer2/06-layer2-protection',
    level: 'Associate',
    quiz: [
      { q: 'What does BPDU guard do on an edge port?', options: ['Shuts the port down when a BPDU arrives', 'Speeds the port up', 'Adds a VLAN tag', 'Filters MAC addresses'], answer: 0, explain: 'A BPDU on an edge port means a switch was plugged in where none should be. BPDU guard disables the port before it can change the tree.' },
      { q: 'What is a MAC flooding attack trying to do?', options: ['Overflow the MAC table so the switch floods traffic', 'Guess passwords', 'Break spanning tree', 'Change VLAN IDs'], answer: 0, explain: 'When the table is full, the switch floods frames like a hub, and an attacker can capture them.' },
      { q: 'Which setting limits how many broadcasts a port can pass?', options: ['Storm control', 'Ageing time', 'MTU', 'Port priority'], answer: 0, explain: 'Storm control caps broadcast, multicast and unknown unicast rates. It needs a switch chip on real hardware.' },
    ],
  },
  {
    lesson: 'layer2/07-mikrotik-bridge-in-practice',
    level: 'Associate',
    quiz: [
      { q: 'On a RouterOS bridge, what does frame-types=admit-only-vlan-tagged do on a port?', options: ['Accepts only tagged frames, typical for a trunk', 'Accepts only untagged frames', 'Blocks all frames', 'Tags every frame'], answer: 0, explain: 'It makes the port a trunk port: untagged frames are dropped on ingress.' },
      { q: 'What does pvid set on a bridge port?', options: ['The VLAN given to untagged frames arriving on it', 'The port priority', 'The speed', 'The MTU'], answer: 0, explain: 'Untagged frames are put into the port pvid. With admit-only-untagged this makes an access port.' },
      { q: 'Why enable vlan-filtering last?', options: ['It is faster', 'Enabling it early can cut off your own management access', 'It needs a reboot', 'It clears the MAC table'], answer: 1, explain: 'Once filtering is on, only VLANs you defined are allowed. Do it after ports, VLAN entries and the management VLAN exist.' },
    ],
  },
];
