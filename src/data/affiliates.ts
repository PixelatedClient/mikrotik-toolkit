export interface AffiliateLink {
  name: string;
  url: string;
  category: 'hardware' | 'learning' | 'tools' | 'service';
  tags: string[];
  description: string;
}

export const AFFILIATES: AffiliateLink[] = [
  {
    name: 'MikroTik RouterOS License',
    url: 'https://mikrotik.com/product/routeros',
    category: 'hardware',
    tags: ['routeros', 'licensing', 'chr'],
    description: 'Official RouterOS licensing and CHR (Cloud Hosted Router) downloads',
  },
  {
    name: 'MikroTik hEX',
    url: 'https://mikrotik.com/product/hex',
    category: 'hardware',
    tags: ['router', 'lab', 'affordable'],
    description: 'Affordable 5-port RouterOS router for home labs and small networks',
  },
  {
    name: 'MikroTik hEX S',
    url: 'https://mikrotik.com/product/hexs',
    category: 'hardware',
    tags: ['router', 'lab', 'gigabit'],
    description: 'Gigabit version with SFP for fiber testing',
  },
  {
    name: 'MikroTik Cloud Hosted Router (CHR)',
    url: 'https://mikrotik.com/product/chr',
    category: 'hardware',
    tags: ['virtualization', 'lab', 'free'],
    description: 'Free RouterOS virtual machine for cloud and local labs',
  },
  {
    name: 'GNS3',
    url: 'https://www.gns3.com/',
    category: 'tools',
    tags: ['simulation', 'lab', 'networking'],
    description: 'Network simulator for building and testing topologies',
  },
  {
    name: 'Wireshark',
    url: 'https://www.wireshark.org/',
    category: 'tools',
    tags: ['packet-analysis', 'troubleshooting', 'free'],
    description: 'Packet analyzer for deep packet inspection and troubleshooting',
  },
  {
    name: 'MikroTik Academy Certification',
    url: 'https://academy.mikrotik.com/',
    category: 'learning',
    tags: ['certification', 'training', 'official'],
    description: 'Official MikroTik training and MTCNA/MTCRE certification path',
  },
];

export function getAffiliatesByTag(tag: string): AffiliateLink[] {
  return AFFILIATES.filter(a => a.tags.includes(tag));
}

export function getAffiliatesByCategory(category: AffiliateLink['category']): AffiliateLink[] {
  return AFFILIATES.filter(a => a.category === category);
}
