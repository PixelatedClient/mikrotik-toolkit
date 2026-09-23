import { useState } from 'react';
import { SUBNET_LEVELS, starsForMistakes } from '../../data/game/subnetLevels';
import { finishLevel, useGame, type LevelReward } from './useGame';
import { HeartRow, LevelHeader, Stars, Victory, ghost, panel } from './ui';

export default function SubnetGate({ levelId }: { levelId: string }) {
  const level = SUBNET_LEVELS.find((l) => l.id === levelId)!;
  const { state: game } = useGame();
  const [i, setI] = useState(0);
  const [mistakes, setMistakes] = useState(0);
  const [picked, setPicked] = useState<string | null>(null);
  const [reward, setReward] = useState<LevelReward | null>(null);
  const [failed, setFailed] = useState(false);

  const round = level.rounds[i];
  const lives = Math.max(0, level.lives + 1 - mistakes);
  const restart = () => { setI(0); setMistakes(0); setPicked(null); setReward(null); setFailed(false); };

  const choose = (o: string) => {
    if (picked) return;
    setPicked(o);
    if (o !== round.answer) setMistakes((m) => m + 1);
  };

  const advance = () => {
    const nextMistakes = mistakes;
    if (nextMistakes > level.lives) { setFailed(true); return; }
    if (i + 1 >= level.rounds.length) {
      const stars = starsForMistakes(nextMistakes, level.lives);
      setReward(finishLevel(level.id, stars));
      return;
    }
    setI(i + 1);
    setPicked(null);
  };

  return (
    <div className="space-y-5">
      <LevelHeader title={level.title} story={level.story} learn={level.learn} goal={`Answer every round. You can afford ${level.lives} slip${level.lives === 1 ? '' : 's'}.`} boss={level.boss} read={level.read} />

      {reward ? (
        <Victory levelId={level.id} reward={reward} onRetry={restart} />
      ) : failed ? (
        <div role="status" className={`${panel} text-center`}>
          <p className="pixel text-sm text-danger">DEFEATED</p>
          <p className="mt-2 text-sm text-muted">Out of lives. Read the hint and try again.</p>
          <button type="button" onClick={restart} className={`${ghost} mt-3`}>Retry</button>
        </div>
      ) : (
        <div className={panel}>
          <div className="flex items-center justify-between text-xs text-muted">
            <span>Round {i + 1} of {level.rounds.length}</span>
            <HeartRow left={Math.min(lives, level.lives + 1)} total={level.lives + 1} />
          </div>
          <h2 className="mt-3 text-lg font-semibold" style={picked && picked !== round.answer ? { animation: 'hit 0.3s' } : undefined}>{round.prompt}</h2>
          <div className="mt-4 grid gap-2 sm:grid-cols-2" role="group" aria-label="Answers">
            {round.options.map((o) => {
              const state = !picked ? '' : o === round.answer ? 'border-good bg-accent-soft' : o === picked ? 'border-danger' : 'opacity-60';
              return (
                <button key={o} type="button" disabled={!!picked} onClick={() => choose(o)}
                  className={`rounded-md border-2 border-line bg-bg px-3 py-3 text-left font-mono text-sm hover:border-accent disabled:cursor-default min-h-11 md:min-h-auto ${state}`}>
                  {o}{picked && o === round.answer ? ' ✓' : ''}
                </button>
              );
            })}
          </div>
          {picked && (
            <div className="mt-4" role="status">
              <p className="text-sm"><strong>{picked === round.answer ? 'Correct.' : 'Not quite.'}</strong> {round.why}</p>
              <button type="button" onClick={advance} className="mt-3 rounded-md bg-accent px-4 py-2 text-sm text-accent-fg">
                {i + 1 >= level.rounds.length || mistakes > level.lives ? 'Finish' : 'Next round'}
              </button>
            </div>
          )}
        </div>
      )}
      <p className="flex items-center gap-2 text-xs text-muted">Best so far: <Stars n={game.stars[level.id] ?? 0} size={14} /> Saved in this browser.</p>
    </div>
  );
}
