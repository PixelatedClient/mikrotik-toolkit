import type { ReactNode } from 'react';
import { featureLocked, nocFeature, practiceFeature, regionFeature } from '../../lib/features';
import { LockPanel } from '../auth/LockPanel';
import { useAuth } from '../auth/useAuth';
import BreachAttack from './BreachAttack';
import FirewallDefense from './FirewallDefense';
import NocSimulator from './NocSimulator';
import PracticeRound from './PracticeRound';
import RoutePuzzle from './RoutePuzzle';
import SubnetGate from './SubnetGate';

function Waiting() {
  return <p className="text-sm text-muted" role="status">Loading...</p>;
}

/** A game level, or the lock panel when its region needs a login. */
export function LevelRunner({ kind, levelId, region }: { kind: 'subnet' | 'route' | 'defend' | 'breach'; levelId: string; region: string }) {
  const { ready, signedIn } = useAuth();
  const feature = regionFeature(region);
  if (!ready && feature) return <Waiting />;
  if (feature && featureLocked(feature, signedIn)) return <LockPanel feature={feature} />;
  const body: Record<typeof kind, ReactNode> = {
    subnet: <SubnetGate levelId={levelId} />,
    route: <RoutePuzzle levelId={levelId} />,
    defend: <FirewallDefense levelId={levelId} />,
    breach: <BreachAttack levelId={levelId} />,
  };
  return <>{body[kind]}</>;
}

/** A NOC incident, or the lock panel for medium and hard ones. */
export function NocRunner({ incidentId, level }: { incidentId: string; level: number }) {
  const { ready, signedIn } = useAuth();
  const feature = nocFeature(level);
  if (!ready && feature) return <Waiting />;
  if (feature && featureLocked(feature, signedIn)) return <LockPanel feature={feature} />;
  return <NocSimulator incidentId={incidentId} />;
}

/** A practice round, or the lock panel for the daily challenge. */
export function PracticeRunner({ topic }: { topic: string }) {
  const { ready, signedIn } = useAuth();
  const feature = practiceFeature(topic);
  if (!ready && feature) return <Waiting />;
  if (feature && featureLocked(feature, signedIn)) return <LockPanel feature={feature} />;
  return <PracticeRound topic={topic as any} />;
}
