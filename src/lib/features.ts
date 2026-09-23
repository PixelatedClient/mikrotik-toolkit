/** Which features need a login. Pure rules so they can be tested; the UI only asks these functions. */

export type FeatureId =
  | 'route-ridge'
  | 'firewall-fortress'
  | 'noc-advanced'
  | 'daily-challenge'
  | 'badges'
  | 'cloud-save';

export interface Feature {
  id: FeatureId;
  name: string;
  /** Shown to guests: what they get by logging in. */
  perk: string;
}

export const FEATURES: Feature[] = [
  { id: 'route-ridge', name: 'Route Ridge', perk: 'Play the routing world: static routes, loops and the enemy tower.' },
  { id: 'firewall-fortress', name: 'Firewall Fortress', perk: 'Write real MikroTik firewall rules and breach an enemy wall.' },
  { id: 'noc-advanced', name: 'Medium and hard NOC incidents', perk: 'Diagnose the trickier faults: BGP, MTU, loops and more.' },
  { id: 'daily-challenge', name: 'Daily challenge', perk: 'Five new questions every day, with a streak to protect.' },
  { id: 'badges', name: 'Badges', perk: 'Earn badges for your achievements and keep them.' },
  { id: 'cloud-save', name: 'Saved progress', perk: 'Your XP, stars, streak and lessons follow you to any device.' },
];

/** Locked for guests. Everything else (lessons, tools, labs, the reference, Subnet Valley, easy incidents) stays open. */
const GUEST_LOCKED: ReadonlySet<FeatureId> = new Set<FeatureId>(FEATURES.map((f) => f.id));

export const featureLocked = (id: FeatureId, signedIn: boolean): boolean => !signedIn && GUEST_LOCKED.has(id);

export const featureInfo = (id: FeatureId): Feature => FEATURES.find((f) => f.id === id)!;

/** The feature a game region sits behind, if any. Subnet Valley is free. */
export function regionFeature(region: string): FeatureId | null {
  if (region === 'route') return 'route-ridge';
  if (region === 'fw') return 'firewall-fortress';
  return null;
}

/** NOC incidents: level 1 (easy) is free, levels 2 and 3 need a login. */
export const nocFeature = (level: number): FeatureId | null => (level >= 2 ? 'noc-advanced' : null);

/** Practice rounds: only the daily challenge needs a login. */
export const practiceFeature = (topic: string): FeatureId | null => (topic === 'daily' ? 'daily-challenge' : null);

export const LOGIN_PROMPT = 'Log in to unlock every feature and save your progress.';
export const UNLOCKED_NOTICE = 'You are logged in. Your progress is saved and every feature is unlocked.';
