export interface AffiliateLink {
  id?: string;
  name: string;
  url: string;
  category: 'hardware' | 'learning' | 'tools' | 'service' | 'hosting';
  tags: string[];
  description: string;
}

export const AFFILIATES: AffiliateLink[] = [
  {
    id: 'mikrotik-routeros',
    name: 'MikroTik RouterOS',
    url: 'https://mikrotik.com/product/routeros',
    category: 'hardware',
    tags: ['routeros', 'licensing', 'chr', 'mikrotik'],
    description: 'Official RouterOS licensing and CHR (Cloud Hosted Router) downloads',
  },
  {
    id: 'mikrotik-hex',
    name: 'MikroTik hEX',
    url: 'https://mikrotik.com/product/hex',
    category: 'hardware',
    tags: ['router', 'lab', 'affordable', 'mikrotik'],
    description: 'Affordable 5-port RouterOS router for home labs and small networks',
  },
  {
    id: 'mikrotik-hex-s',
    name: 'MikroTik hEX S',
    url: 'https://mikrotik.com/product/hexs',
    category: 'hardware',
    tags: ['router', 'lab', 'gigabit', 'fiber', 'mikrotik'],
    description: 'Gigabit version with SFP for fiber testing',
  },
  {
    id: 'mikrotik-chr',
    name: 'MikroTik Cloud Hosted Router (CHR)',
    url: 'https://mikrotik.com/product/chr',
    category: 'hardware',
    tags: ['virtualization', 'lab', 'free', 'cloud', 'mikrotik'],
    description: 'Free RouterOS virtual machine for cloud and local labs',
  },
  {
    id: 'gns3',
    name: 'GNS3',
    url: 'https://www.gns3.com/',
    category: 'tools',
    tags: ['simulation', 'lab', 'networking', 'training'],
    description: 'Network simulator for building and testing topologies',
  },
  {
    id: 'wireshark',
    name: 'Wireshark',
    url: 'https://www.wireshark.org/',
    category: 'tools',
    tags: ['packet-analysis', 'troubleshooting', 'free', 'debugging'],
    description: 'Packet analyzer for deep packet inspection and troubleshooting',
  },
  {
    id: 'mikrotik-academy',
    name: 'MikroTik Academy',
    url: 'https://academy.mikrotik.com/',
    category: 'learning',
    tags: ['certification', 'training', 'official', 'mtcna'],
    description: 'Official MikroTik training and MTCNA/MTCRE certification path',
  },
  {
    id: 'vercel',
    name: 'Vercel Hosting',
    url: 'https://vercel.com',
    category: 'hosting',
    tags: ['deployment', 'hosting', 'nextjs', 'static'],
    description: 'Deploy your projects with Vercel — fast, reliable edge hosting',
  },
  {
    id: 'aws',
    name: 'Amazon Web Services (AWS)',
    url: 'https://aws.amazon.com',
    category: 'hosting',
    tags: ['cloud', 'ec2', 'labs', 'infrastructure'],
    description: 'Cloud infrastructure for running production networks and labs at scale',
  },
  {
    id: 'linode',
    name: 'Linode by Akamai',
    url: 'https://www.linode.com',
    category: 'hosting',
    tags: ['cloud', 'vps', 'linux', 'affordable'],
    description: 'Developer-friendly VPS hosting for lab environments and production',
  },
];

export function getAffiliatesByTag(tag: string): AffiliateLink[] {
  return AFFILIATES.filter(a => a.tags.includes(tag));
}

export function getAffiliatesByCategory(category: AffiliateLink['category']): AffiliateLink[] {
  return AFFILIATES.filter(a => a.category === category);
}
