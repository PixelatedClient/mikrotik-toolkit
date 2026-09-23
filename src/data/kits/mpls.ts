import type { LessonKit } from '../lessonKit';

export const MPLS_KITS: LessonKit[] = [
  {
    lesson: 'mpls/01-labels-lsrs-lers',
    level: 'Professional',
    quiz: [
      { q: 'What is the difference in role between an LSR and an LER?', options: ['An LER does IP lookups at the network edge; an LSR only swaps labels in the middle', 'An LSR is faster hardware than an LER', 'An LER only exists in IPv6 networks', 'They are two names for the same router role'], answer: 0, explain: 'The LER does the one IP lookup at ingress/egress; every LSR in between only ever swaps labels.' },
      { q: 'Which label operation runs at every transit hop, and why is it cheaper than a full IP lookup?', options: ['Swap; it is a simple table index instead of a longest-prefix match', 'Push; it adds a new label at every hop', 'Pop; it removes a label at every hop', 'None; every hop still does a full IP lookup'], answer: 0, explain: 'Swap replaces the incoming label with the outgoing one via a direct table lookup, cheaper than matching a routing table.' },
      { q: 'Why can two packets to the same destination prefix travel different LSPs?', options: ['An LSP is tied to the specific path taken from a given ingress LER, not just the destination prefix', 'MPLS randomly assigns paths per packet', 'Different packets always use different protocols', 'LSPs are recomputed for every packet'], answer: 0, explain: 'The LSP depends on where a packet entered the MPLS domain, not just where it is headed.' },
    ],
  },
  {
    lesson: 'mpls/02-ldp',
    level: 'Professional',
    quiz: [
      { q: 'What are LDP\'s two stages, and why does the second use TCP?', options: ['UDP discovery (Hello), then a TCP session; label bindings must arrive reliably and in order', 'Both stages use UDP for speed', 'TCP discovery, then UDP label exchange', 'LDP has only one stage'], answer: 0, explain: 'Hello discovery is best-effort UDP; the actual label binding exchange needs TCP\'s reliability and ordering.' },
      { q: 'What does downstream-unsolicited mean?', options: ['A router advertises a label for a prefix without being asked first', 'A router only sends labels when a neighbour explicitly requests one', 'Labels are assigned by the network administrator', 'Labels only flow from the egress LER backward'], answer: 0, explain: 'The advertising router pushes the binding out proactively rather than waiting for a request.' },
      { q: 'Why does LDP rely on the IGP rather than compute its own paths?', options: ['The IGP already computes the best path; LDP only distributes labels along whatever path the IGP chose', 'LDP cannot run without a specific IGP installed', 'The IGP and LDP are actually the same protocol', 'LDP paths are always manually configured'], answer: 0, explain: 'LDP\'s job is only to agree on labels for the IGP\'s chosen path, not to pick the path itself.' },
    ],
  },
  {
    lesson: 'mpls/03-vpls-l2vpn',
    level: 'Professional',
    quiz: [
      { q: 'What does a customer experience plugging into a VPLS handoff at two different cities?', options: ['The same as plugging into two ports on one shared switch', 'A separate routed connection between each site', 'No connectivity until a VPN client is installed', 'A dedicated physical cable is run between the cities'], answer: 0, explain: 'VPLS makes geographically separate sites appear to share one Ethernet broadcast domain.' },
      { q: 'Why does a VPLS instance need a full mesh of pseudowires between PEs?', options: ['So every PE can reach every other PE directly for that customer\'s traffic, without depending on being relayed through another PE', 'Because MPLS labels only work in a mesh topology', 'To reduce the total number of pseudowires needed', 'Full mesh is only needed for more than 100 sites'], answer: 0, explain: 'A direct pseudowire between every PE pair avoids depending on other PEs to relay traffic, mirroring a real single switch.' },
      { q: 'What prevents a Layer 2 loop across the full mesh, with no spanning tree between PEs?', options: ['Split-horizon: a frame is never re-flooded back out the pseudowire it arrived on', 'MPLS labels physically cannot loop', 'Each PE runs its own independent spanning tree instance', 'Pseudowires cannot carry broadcast traffic'], answer: 0, explain: 'Split-horizon across the full mesh removes the need for spanning tree between the PEs.' },
    ],
  },
  {
    lesson: 'mpls/04-l3vpn-vrf',
    level: 'Professional',
    quiz: [
      { q: 'Why can two different customers use the identical private address range on the same PE?', options: ['Each customer\'s routes live in a separate VRF, isolated from every other VRF on the router', 'MPLS labels prevent any address from being reused anywhere', 'The PE automatically renumbers one customer\'s addresses', 'They cannot; this always causes a conflict'], answer: 0, explain: 'A VRF is a separate routing table; identical prefixes in different VRFs never collide.' },
      { q: 'What does a Route Distinguisher make unique, and why does BGP need that?', options: ['It makes otherwise-identical customer prefixes from different VRFs unique, so BGP can carry both as distinct routes', 'It makes every MPLS label globally unique', 'It identifies which physical PE originated a route', 'It replaces the need for a routing table entirely'], answer: 0, explain: 'Without the RD, two customers\' identical prefixes would be indistinguishable inside the provider\'s shared BGP.' },
      { q: 'What are the two labels involved in forwarding an L3VPN packet, and what does each tell the receiving router?', options: ['An outer LDP label gets the packet to the right PE; an inner VPN label identifies the VRF/customer site', 'Two identical labels, one for redundancy', 'One label for IPv4, one for IPv6', 'A label for the source and a label for the destination'], answer: 0, explain: 'The outer label is plain MPLS-core forwarding; the inner label is what actually separates the customer traffic once it arrives.' },
    ],
  },
];
