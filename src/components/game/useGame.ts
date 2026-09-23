import { useEffect, useState } from 'react';
import { emptyState, recordLevel, today, type Badge, type GameState } from '../../lib/gamify';
import { get, subscribe, update } from '../../scripts/game-store';

/** Reads progress after hydration (so server and client render the same first frame) and stays in sync. */
export function useGame() {
  const [state, setState] = useState<GameState>(emptyState());
  const [ready, setReady] = useState(false);
  useEffect(() => {
    setState(get());
    setReady(true);
    return subscribe(() => setState(get()));
  }, []);
  return { state, ready };
}

export interface LevelReward { xp: number; improved: boolean; fresh: Badge[]; stars: number }

export function finishLevel(levelId: string, stars: number): LevelReward {
  let xp = 0;
  let improved = false;
  const r = update((s) => {
    const res = recordLevel(s, levelId, stars, today());
    xp = res.xp;
    improved = res.improved;
    return res.state;
  });
  return { xp, improved, fresh: r.fresh, stars };
}
