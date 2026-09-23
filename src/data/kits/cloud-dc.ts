import type { LessonKit } from '../lessonKit';

export const CLOUD_DC_KITS: LessonKit[] = [
  {
    lesson: 'cloud-dc/01-vxlan-and-evpn-concepts',
    level: 'Professional',
    quiz: [
      { q: 'What does a VTEP do, and what does overlay mean in that context?', options: ['It wraps/unwraps frames at the tunnel ends; overlay means a Layer 2 network laid on top of a Layer 3 one', 'It is a physical cable type used only in data centres', 'It replaces BGP entirely', 'It is another name for a VLAN tag'], answer: 0, explain: 'The VTEP does the encapsulation; overlay describes running Layer 2 logically on top of a routed core that only sees UDP.' },
      { q: 'Why does the VNI\'s larger ID space matter for a large multi-tenant data centre?', options: ['4094 VLANs is not enough segments for many tenants; 16 million is', 'It makes packets smaller', 'It removes the need for IP addressing', 'It is required for BGP to function'], answer: 0, explain: 'A VLAN\'s 12-bit ID caps out at 4094; a 24-bit VNI supports about 16 million isolated segments.' },
      { q: 'What specific problem does EVPN solve that plain VXLAN does not?', options: ['A control plane for learning MAC reachability, instead of relying on flooding', 'Encrypting the VXLAN tunnel', 'Assigning IP addresses to VTEPs', 'Choosing the VNI number automatically'], answer: 0, explain: 'Plain VXLAN floods to learn MAC locations; EVPN distributes that reachability information over BGP instead.' },
    ],
  },
  {
    lesson: 'cloud-dc/02-cloud-virtual-networks-and-hybrid-connectivity',
    level: 'Professional',
    quiz: [
      { q: 'What cloud concept plays the same role as a router\'s routing table?', options: ['A route table attached to the VPC/VNet', 'A security group', 'An availability zone', 'A subnet'], answer: 0, explain: 'A cloud route table decides where traffic goes, the same job a router\'s routing table does.' },
      { q: 'Why might a company pay for a dedicated direct-connect circuit instead of just a site-to-site VPN?', options: ['Stable bandwidth and latency, not subject to public internet variability', 'It is always cheaper than a VPN', 'VPNs cannot reach cloud providers at all', 'Direct connect requires no configuration'], answer: 0, explain: 'A dedicated circuit avoids the unpredictable performance of routing production traffic over the public internet.' },
      { q: 'How does a direct-connect-plus-VPN-backup setup relate to primary/backup routing already covered elsewhere?', options: ['The cloud path is just another next hop with its own metric, same pattern as any primary/backup design', 'It has nothing in common with routing concepts', 'It only works with static routes', 'It requires disabling BGP'], answer: 0, explain: 'The same primary/backup route selection ideas from the Advanced Routing track apply directly to a cloud hybrid path.' },
    ],
  },
  {
    lesson: 'cloud-dc/03-sdn-concepts',
    level: 'Professional',
    quiz: [
      { q: 'What is the difference between the control plane and the data plane on a traditional router?', options: ['The control plane decides routes; the data plane forwards packets according to them', 'The control plane forwards packets; the data plane computes routes', 'They are two names for the same function', 'The data plane only exists in SDN'], answer: 0, explain: 'Control plane = deciding what should happen; data plane = actually forwarding traffic according to that decision.' },
      { q: 'What does a central SDN controller have that a distributed protocol like OSPF, running independently per router, does not?', options: ['A global view of the whole topology at once', 'Faster individual link speeds', 'Built-in encryption', 'A requirement for fewer routers'], answer: 0, explain: 'OSPF only knows what it learns hop by hop; a central controller can see and reason about the whole topology simultaneously.' },
      { q: 'Why does the control-plane/data-plane split explain a cloud VPC being configured through an API rather than a device CLI?', options: ['A controller, not a human at a CLI, is programming the underlying fabric on the customer\'s behalf', 'APIs are always faster than a CLI', 'Cloud providers do not use physical switches', 'CLIs cannot be automated'], answer: 0, explain: 'The provider\'s controller holds the control-plane logic and exposes it as an API, which is what the VPC console/API actually drives.' },
    ],
  },
];
