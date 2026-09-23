import { levelInfo } from '../../lib/gamify';
import { useGame } from './useGame';

/** Small header chip: level, XP bar and streak. */
export default function GameHud() {
  const { state, ready } = useGame();
  const info = levelInfo(state.xp);
  return (
    <a href="/play" className="hud flex items-center gap-2 rounded-md border-2 border-line bg-surface px-2 py-1 hover:border-accent" aria-label={`Level ${info.level}, ${state.xp} XP, ${state.streakDays} day streak. Open the world map.`}>
      <span className="text-accent">LV{ready ? info.level : 1}</span>
      <span className="hidden h-2 w-14 border border-line bg-bg sm:block" aria-hidden="true"><span className="block h-full bg-accent" style={{ width: `${ready ? info.pct : 0}%` }} /></span>
      <span aria-hidden="true" className="text-danger">{state.streakDays > 0 ? `🔥${state.streakDays}` : ''}</span>
    </a>
  );
}
