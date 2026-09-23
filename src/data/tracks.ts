export interface Track {
  id: string;
  name: string;
  blurb: string;
  level: string;
  available: boolean;
}

/** Array order is display order and defines the module prefix: track N has modules N.1, N.2, ... */
export const TRACKS: Track[] = [
  { id: 'foundations', name: 'Foundations', blurb: 'Packets, IP addressing, subnetting and your first routers.', level: 'Beginner', available: true },
  { id: 'layer2', name: 'Layer 2 in Depth', blurb: 'Ethernet, MAC learning, spanning tree, link aggregation, VLAN trunks and Layer 2 protection. Every lesson cites its sources.', level: 'Associate', available: true },
  { id: 'mikrotik', name: 'MikroTik', blurb: 'RouterOS, bridge VLAN filtering, routing and a config generator.', level: 'Associate', available: true },
  { id: 'mikrotik-ops', name: 'MikroTik Operations', blurb: 'Run RouterOS day to day: first access, backups, upgrades, users, DHCP and ARP, PPPoE and monitoring. Every lesson cites its sources.', level: 'Associate', available: true },
  { id: 'routing', name: 'Advanced Routing', blurb: 'BGP, route maps, OSPF, route reflection and fast failover.', level: 'Professional', available: true },
  { id: 'isp-ops', name: 'ISP Operations', blurb: 'GPON, flow analysis, SNMP, peering and scaling subscribers.', level: 'Professional', available: true },
  { id: 'design', name: 'Network Design', blurb: 'Plan a network before you build it: requirements, addressing, segmentation, redundancy and reference designs, with design-review practice.', level: 'Associate', available: true },
  { id: 'config', name: 'Configuration Techniques', blurb: 'Change routers safely: workflow, exports and diffs, scripts, templates and rollback.', level: 'Associate', available: true },
  { id: 'security', name: 'Network Security', blurb: 'Encrypted tunnels, authentication and hardening as a discipline: IPsec, RADIUS and 802.1X, secure management, and defence in depth.', level: 'Professional', available: true },
  { id: 'automation', name: 'Network Automation', blurb: 'Script and version your configuration: Git, Python basics, the RouterOS REST API, templating and Ansible.', level: 'Professional', available: true },
  { id: 'ipv6-wireless', name: 'IPv6 and Wireless', blurb: 'IPv6 addressing and neighbour discovery, dual stack, and Wi-Fi fundamentals from RF basics to site surveys.', level: 'Associate', available: true },
  { id: 'cloud-dc', name: 'Data Centre and Cloud', blurb: 'VXLAN and EVPN, cloud virtual networks and hybrid connectivity, and the ideas behind SDN.', level: 'Professional', available: true },
  { id: 'mpls', name: 'MPLS and VPN Services', blurb: 'Labels, LSRs and LERs, LDP, VPLS and L3VPN/VRF: how ISPs and large enterprises carry many customers over one core.', level: 'Professional', available: true },
];

export const trackById = (id: string) => TRACKS.find((t) => t.id === id);
export const trackNumber = (id: string) => TRACKS.findIndex((t) => t.id === id) + 1;
