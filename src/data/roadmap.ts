export type StepStatus = 'done' | 'next' | 'planned';

export interface RoadmapStep {
  step: number;
  title: string;
  status: StepStatus;
  why: string;
  topics: string[];
  /** Primary sources the lessons are checked against. */
  sources: string[];
}

/** Gaps found against MikroTik's MTCNA topic list (2016) and what working network engineers are expected to know. */
export const ROADMAP: RoadmapStep[] = [
  {
    step: 1,
    title: 'MikroTik Operations',
    status: 'done',
    why: 'The MTCNA outline covers day-to-day router operation that our MikroTik track skipped.',
    topics: ['First access and the CLI', 'Backups, exports, resets and Netinstall', 'Upgrading RouterOS and firmware', 'Users, services and secure management', 'DHCP and ARP in depth', 'PPPoE for ISPs', 'Monitoring and diagnostic tools'],
    sources: ['MikroTik RouterOS documentation', 'RFC 2516 (PPPoE)', 'RFC 3046 (DHCP relay information)'],
  },
  {
    step: 2,
    title: 'Layer 2 in depth',
    status: 'done',
    why: 'Only a short spanning-tree mention exists today. Real networks fail at Layer 2 first.',
    topics: ['Ethernet frames and MAC learning', 'STP: loops and the spanning tree', 'RSTP and MSTP', 'Link aggregation (LACP) and bonding', 'VLAN trunks, Q-in-Q and MTU', 'Layer 2 protection', 'MikroTik bridge in practice'],
    sources: ['MikroTik bridging and switching documentation', 'Cisco RSTP and STP timer documents', 'RFC 894', 'IANA EtherType registry', 'IEEE EUI guidelines'],
  },
  {
    step: 3,
    title: 'MPLS and VPN services',
    status: 'done',
    why: 'MPLS carries much of the ISP and enterprise WAN world and is not covered at all.',
    topics: ['Labels, LSRs and LERs', 'LDP', 'VPLS (L2VPN)', 'L3VPN and VRF'],
    sources: ['RFC 3031 (MPLS architecture)', 'RFC 4364 (BGP/MPLS VPNs)', 'RFC 5036 (LDP)', 'MikroTik MPLS documentation'],
  },
  {
    step: 4,
    title: 'Network security',
    status: 'done',
    why: 'We cover firewalls and DDoS, but not encrypted tunnels, authentication or hardening as a discipline.',
    topics: ['IPsec', 'AAA, RADIUS and 802.1X', 'Secure management and logging', 'Threats and defence in depth'],
    sources: ['RFC 4301 (IPsec)', 'RFC 2865 (RADIUS)', 'IEEE 802.1X', 'MikroTik security documentation'],
  },
  {
    step: 5,
    title: 'Network automation',
    status: 'done',
    why: 'Modern network teams script and version their configuration. Nothing covers it yet.',
    topics: ['Git for configuration', 'Python basics for network engineers', 'The RouterOS REST API', 'Templating and idempotent changes', 'Ansible'],
    sources: ['MikroTik REST API documentation', 'Python documentation', 'Ansible documentation'],
  },
  {
    step: 6,
    title: 'IPv6 and wireless fundamentals',
    status: 'done',
    why: 'IPv6 appears in one ISP lesson only, and wireless is only CAPsMAN configuration.',
    topics: ['IPv6 addressing, SLAAC and neighbour discovery', 'Dual stack and transition', 'Wi-Fi standards, channels and RF basics', 'Site surveys and roaming'],
    sources: ['RFC 8200 (IPv6)', 'RFC 4861 (Neighbor Discovery)', 'IEEE 802.11 (public summaries)', 'MikroTik wireless documentation'],
  },
  {
    step: 7,
    title: 'Modern data-centre and cloud networking',
    status: 'done',
    why: 'VXLAN/EVPN and cloud connectivity are standard vocabulary for working engineers.',
    topics: ['VXLAN and EVPN concepts', 'Cloud virtual networks and hybrid connectivity', 'SDN concepts'],
    sources: ['RFC 7348 (VXLAN)', 'RFC 7432 (EVPN)', 'Cloud provider documentation'],
  },
  {
    step: 8,
    title: 'Retro-fit sources into the original 33 lessons',
    status: 'done',
    why: 'The first lessons were written before the source-checking process. Each will be verified and relabelled.',
    topics: ['Foundations', 'MikroTik', 'Advanced Routing', 'ISP Operations'],
    sources: ['Primary sources per lesson, as in the new tracks'],
  },
  {
    step: 9,
    title: 'Monetization & sponsorship',
    status: 'next',
    why: 'Affiliate links and Patreon support sustainable maintenance without ads or paywalls.',
    topics: ['Affiliate link infrastructure', 'Patreon/sponsorship banner', 'Email newsletter capture', 'Partner integrations'],
    sources: ['Product affiliate programs'],
  },
  {
    step: 10,
    title: 'User accounts and progress tracking',
    status: 'planned',
    why: 'Server-side progress enables persistence across devices and unlocks premium content tiers.',
    topics: ['Authentication (OAuth or email)', 'Progress database schema', 'Session management', 'Premium user tiers'],
    sources: [],
  },
  {
    step: 11,
    title: 'Analytics and observability',
    status: 'planned',
    why: 'Understand which lessons work, where users drop off, and which topics need depth.',
    topics: ['Page view tracking', 'Lesson completion rates', 'User engagement heatmaps', 'Error reporting'],
    sources: [],
  },
  {
    step: 12,
    title: 'Video and rich media',
    status: 'planned',
    why: 'Self-hosted video for core topics improves retention and accessibility.',
    topics: ['Video hosting and encoding', 'Embedded media in lessons', 'Transcript generation', 'Accessibility (captions, audio descriptions)'],
    sources: [],
  },
  {
    step: 13,
    title: 'Security and infrastructure hardening',
    status: 'planned',
    why: 'CSP headers, certificate management, and legal pages prepare for scale.',
    topics: ['Content Security Policy headers', 'TLS certificate automation', 'Privacy policy and contact', 'Terms of service'],
    sources: [],
  },
  {
    step: 14,
    title: 'Legal compliance and trust',
    status: 'planned',
    why: 'Terms of Service, Privacy Policy, disclaimers, and accessibility statements build user trust and meet legal requirements.',
    topics: ['Terms of Service (lab-only use disclaimer)', 'Privacy Policy (GDPR compliance)', 'Disclaimer (unverified on real devices)', 'Accessibility statement (WCAG audit)', 'Copyright attribution for sourced content', 'Contact page with support address'],
    sources: [],
  },
  {
    step: 15,
    title: 'Discovery and content engagement',
    status: 'planned',
    why: 'Search, tags, and digests help users find relevant lessons and stay updated.',
    topics: ['Full-text search across lessons', 'Lesson difficulty levels and prerequisites', 'Printable lesson PDFs', 'Mobile optimization audit', 'RSS feed for new content', 'Email digest (weekly/monthly)'],
    sources: [],
  },
  {
    step: 16,
    title: 'Community features',
    status: 'planned',
    why: 'Community labs, comments, and discussion build engagement and crowdsource knowledge.',
    topics: ['Discord server or GitHub Discussions', 'User-submitted lab configurations', 'Comment threads on lessons', 'Lab walkthroughs (community-written guides)', 'Certification badge tracker (post-auth)', 'Community leaderboards'],
    sources: [],
  },
  {
    step: 17,
    title: 'Quality assurance and observability',
    status: 'planned',
    why: 'Error tracking, performance monitoring, and mobile testing catch regressions at scale.',
    topics: ['Error tracking (Sentry integration)', 'Performance monitoring (Core Web Vitals)', 'Mobile device testing', 'Lighthouse CI', 'Real user monitoring (RUM)', 'Lab configuration validation (GitHub CI)'],
    sources: [],
  },
  {
    step: 18,
    title: 'Pkt AI Assistant (hint system)',
    status: 'planned',
    why: 'Logged-in users get contextual hints from Pkt during labs and challenges, reducing frustration while preserving learning.',
    topics: ['Auth prerequisite (step 10)', 'Hint database (RouterOS commands, subnetting, BGP troubleshooting)', 'Context-aware suggestions (from lab state)', 'Difficulty levels (newbie/intermediate/advanced hints)', 'Hint throttling (prevent spoilers)', 'Pkt personality (friendly tone, emoji reactions)'],
    sources: [],
  },
];
