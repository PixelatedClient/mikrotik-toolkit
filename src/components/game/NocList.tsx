import { INCIDENTS } from '../../data/game/nocIncidents';
import { nocFeature } from '../../lib/features';
import { LockChip } from '../auth/LockPanel';
import { useGame } from './useGame';
import { Stars } from './ui';

export default function NocList() {
  const { state } = useGame();
  return (
    <ul className="grid gap-4 sm:grid-cols-2">
      {INCIDENTS.map((i) => (
        <li key={i.id}>
          <a href={`/noc/${i.id}`} className="block rounded-xl border bg-surface p-4">
            <div className="flex items-center justify-between">
              <span className="pixel text-[0.55rem] text-muted">{['', 'EASY', 'MEDIUM', 'HARD'][i.level]}</span>
              <Stars n={state.stars[i.id] ?? 0} size={16} />
            </div>
            <p className="mt-2 font-semibold">{i.title}{nocFeature(i.level) && <LockChip feature={nocFeature(i.level)!} />}</p>
          </a>
        </li>
      ))}
    </ul>
  );
}
