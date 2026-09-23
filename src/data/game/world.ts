import { SUBNET_LEVELS } from './subnetLevels';
import { ROUTE_LEVELS } from './routeLevels';
import { FW_LEVELS, BREACH_LEVELS } from './firewallLevels';

export interface WorldLevel {
  id: string;
  title: string;
  kind: 'subnet' | 'route' | 'defend' | 'breach';
  boss: boolean;
  region: string;
}

export interface Region {
  id: 'subnet' | 'route' | 'fw';
  name: string;
  blurb: string;
  /** Levels that must be cleared (at least one star each) in an earlier region before this one opens. */
  requires?: { region: Region['id']; levels: number };
  levels: WorldLevel[];
}

export const REGIONS: Region[] = [
  {
    id: 'subnet', name: 'Subnet Valley', blurb: 'Fix the masks and addresses so every street has a working gate.',
    levels: SUBNET_LEVELS.map((l) => ({ id: l.id, title: l.title, kind: 'subnet' as const, boss: !!l.boss, region: 'subnet' })),
  },
  {
    id: 'route', name: 'Route Ridge', blurb: 'Lay the roads. Route packets home, dodge loops, and storm the enemy tower.',
    requires: { region: 'subnet', levels: 3 },
    levels: ROUTE_LEVELS.map((l) => ({ id: l.id, title: l.title, kind: 'route' as const, boss: !!l.boss, region: 'route' })),
  },
  {
    id: 'fw', name: 'Firewall Fortress', blurb: 'Write real MikroTik rules to hold the wall, then breach an enemy one.',
    requires: { region: 'route', levels: 3 },
    levels: [
      ...FW_LEVELS.map((l) => ({ id: l.id, title: l.title, kind: 'defend' as const, boss: !!l.boss, region: 'fw' })),
      ...BREACH_LEVELS.map((l) => ({ id: l.id, title: l.title, kind: 'breach' as const, boss: false, region: 'fw' })),
    ],
  },
];

export const ALL_LEVELS = REGIONS.flatMap((r) => r.levels);
export const levelMeta = (id: string) => ALL_LEVELS.find((l) => l.id === id);

type Stars = Record<string, number>;

export function regionOpen(region: Region, stars: Stars): boolean {
  if (!region.requires) return true;
  const req = REGIONS.find((r) => r.id === region.requires!.region)!;
  return req.levels.filter((l) => (stars[l.id] ?? 0) > 0).length >= region.requires.levels;
}

/** Levels open one after another. Breach levels open once the defend levels are cleared up to fw-4. */
export function levelOpen(id: string, stars: Stars): boolean {
  const region = REGIONS.find((r) => r.levels.some((l) => l.id === id));
  if (!region || !regionOpen(region, stars)) return false;
  const i = region.levels.findIndex((l) => l.id === id);
  if (i === 0) return true;
  const lv = region.levels[i];
  if (lv.kind === 'breach') return (stars['fw-4'] ?? 0) > 0;
  return (stars[region.levels[i - 1].id] ?? 0) > 0;
}

export function nextLevel(id: string): WorldLevel | null {
  const region = REGIONS.find((r) => r.levels.some((l) => l.id === id));
  if (!region) return null;
  const i = region.levels.findIndex((l) => l.id === id);
  return region.levels[i + 1] ?? null;
}
