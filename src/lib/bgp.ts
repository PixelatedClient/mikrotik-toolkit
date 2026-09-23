export type Origin = 'igp' | 'egp' | 'incomplete';

export interface Route {
  id: string;
  name: string;
  neighborAs: number;
  /** AS path as received, before any extra prepending (nearest AS first). */
  basePath: number[];
  /** Extra copies of the neighbour's ASN added by the neighbour (AS-path prepending). */
  prepend: number;
  localPref: number;
  med: number;
  origin: Origin;
  ebgp: boolean;
  routerId: string;
  up: boolean;
}

export const asPath = (r: Route): number[] =>
  r.prepend > 0 ? [...Array(r.prepend).fill(r.neighborAs), ...r.basePath] : r.basePath;

export interface Step {
  rule: string;
  /** Route ids still in the running after this rule. */
  survivors: string[];
  /** Route ids this rule removed, with the reason. */
  eliminated: { id: string; reason: string }[];
}

export interface Selection {
  best: Route | null;
  steps: Step[];
  /** Why each losing route lost. */
  lostTo: Record<string, string>;
}

const ORIGIN_RANK: Record<Origin, number> = { igp: 0, egp: 1, incomplete: 2 };

function ipToNum(ip: string): number {
  return ip.split('.').reduce((n, p) => n * 256 + Number(p), 0);
}

/** BGP best-path selection, simplified to the rules an operator meets daily. */
export function selectBest(routes: Route[]): Selection {
  let pool = routes.filter((r) => r.up);
  const steps: Step[] = [];
  const lostTo: Record<string, string> = {};
  if (pool.length === 0) return { best: null, steps, lostTo };

  type Rule = { rule: string; keep: (r: Route, all: Route[]) => boolean; why: (r: Route, all: Route[]) => string };
  const rules: Rule[] = [
    {
      rule: 'Highest LOCAL_PREF',
      keep: (r, all) => r.localPref === Math.max(...all.map((x) => x.localPref)),
      why: (r, all) => `LOCAL_PREF ${r.localPref} is lower than ${Math.max(...all.map((x) => x.localPref))}`,
    },
    {
      rule: 'Shortest AS_PATH',
      keep: (r, all) => asPath(r).length === Math.min(...all.map((x) => asPath(x).length)),
      why: (r, all) => `AS_PATH length ${asPath(r).length} is longer than ${Math.min(...all.map((x) => asPath(x).length))}`,
    },
    {
      rule: 'Lowest ORIGIN (igp < egp < incomplete)',
      keep: (r, all) => ORIGIN_RANK[r.origin] === Math.min(...all.map((x) => ORIGIN_RANK[x.origin])),
      why: (r) => `ORIGIN ${r.origin} is worse`,
    },
    {
      // MED is only comparable between routes from the same neighbouring AS.
      rule: 'Lowest MED (same neighbour AS only)',
      keep: (r, all) => !all.some((x) => x.neighborAs === r.neighborAs && x.med < r.med),
      why: (r, all) => {
        const best = Math.min(...all.filter((x) => x.neighborAs === r.neighborAs).map((x) => x.med));
        return `MED ${r.med} is higher than ${best} from the same neighbour AS ${r.neighborAs}`;
      },
    },
    {
      rule: 'Prefer eBGP over iBGP',
      keep: (r, all) => r.ebgp || !all.some((x) => x.ebgp),
      why: () => 'iBGP route loses to an eBGP route',
    },
    {
      rule: 'Lowest router ID (final tie-break)',
      keep: (r, all) => ipToNum(r.routerId) === Math.min(...all.map((x) => ipToNum(x.routerId))),
      why: (r, all) => `router ID ${r.routerId} is higher than ${all.map((x) => x.routerId).sort((a, b) => ipToNum(a) - ipToNum(b))[0]}`,
    },
  ];

  for (const { rule, keep, why } of rules) {
    if (pool.length === 1) break;
    const survivors = pool.filter((r) => keep(r, pool));
    const eliminated = pool.filter((r) => !survivors.includes(r)).map((r) => ({ id: r.id, reason: why(r, pool) }));
    for (const e of eliminated) lostTo[e.id] = `${rule}: ${e.reason}`;
    steps.push({ rule, survivors: survivors.map((r) => r.id), eliminated });
    pool = survivors;
  }
  return { best: pool[0], steps, lostTo };
}

/** The starting lab: four ways to reach the same destination prefix. */
export const initialRoutes = (): Route[] => [
  { id: 'A1', name: 'Upstream A, link 1', neighborAs: 64500, basePath: [64500, 64999], prepend: 0, localPref: 100, med: 100, origin: 'igp', ebgp: true, routerId: '10.0.0.1', up: true },
  { id: 'A2', name: 'Upstream A, link 2', neighborAs: 64500, basePath: [64500, 64999], prepend: 0, localPref: 100, med: 100, origin: 'igp', ebgp: true, routerId: '10.0.0.2', up: true },
  { id: 'B', name: 'Upstream B', neighborAs: 64501, basePath: [64501, 64520, 64999], prepend: 0, localPref: 100, med: 0, origin: 'igp', ebgp: true, routerId: '10.0.0.3', up: true },
  { id: 'IX', name: 'IX peer', neighborAs: 64510, basePath: [64510, 64999], prepend: 0, localPref: 100, med: 0, origin: 'igp', ebgp: true, routerId: '10.0.0.4', up: true },
];

export interface Mission {
  id: string;
  title: string;
  brief: string;
  hint: string;
  done: (routes: Route[], best: Route | null) => boolean;
}

const untouchedLp = (rs: Route[]) => rs.every((r) => r.localPref === 100);
const noPrepend = (rs: Route[]) => rs.every((r) => r.prepend === 0);
// Policy missions must be won with attributes, not by cutting the competition.
const allUp = (rs: Route[]) => rs.every((r) => r.up);

export const MISSIONS: Mission[] = [
  {
    id: 'via-b',
    title: 'Prefer Upstream B',
    brief: 'Upstream B is cheaper. Make it the best path.',
    hint: 'Raise LOCAL_PREF on B. It is checked before AS_PATH length.',
    done: (rs, best) => allUp(rs) && best?.id === 'B',
  },
  {
    id: 'med-tiebreak',
    title: 'Win the tie with MED',
    brief: 'Make Upstream A link 2 the best path with all links up. Do not touch LOCAL_PREF or prepending.',
    hint: 'Both links go to the same neighbour AS, so MED is compared. Lower wins.',
    done: (rs, best) => allUp(rs) && best?.id === 'A2' && untouchedLp(rs) && noPrepend(rs),
  },
  {
    id: 'ix-prepend',
    title: 'Use the IX, no LOCAL_PREF',
    brief: 'Make the IX peer best while every LOCAL_PREF stays at 100.',
    hint: 'Make the other paths look longer with AS-path prepending.',
    done: (rs, best) => allUp(rs) && best?.id === 'IX' && untouchedLp(rs),
  },
  {
    id: 'b-prepend',
    title: 'Longest path wins?',
    brief: 'B has the longest AS path (3). Make it best without LOCAL_PREF.',
    hint: 'Prepend on A1, A2 and the IX until each is longer than 3.',
    done: (rs, best) => allUp(rs) && best?.id === 'B' && untouchedLp(rs),
  },
  {
    id: 'survive',
    title: 'Survive a failure',
    brief: 'Cut both Upstream A links. Traffic must keep flowing.',
    hint: 'Click a link in the diagram, or use the Link switch, to take it down.',
    done: (rs, best) => !!best && !rs.find((r) => r.id === 'A1')!.up && !rs.find((r) => r.id === 'A2')!.up,
  },
];
