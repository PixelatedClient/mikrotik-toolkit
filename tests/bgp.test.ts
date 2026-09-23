import { describe, it, expect } from 'vitest';
import { MISSIONS, asPath, initialRoutes, selectBest, type Route } from '../src/lib/bgp';

const routes = (mut?: (r: Record<string, Route>) => void) => {
  const list = initialRoutes();
  const by = Object.fromEntries(list.map((r) => [r.id, r]));
  mut?.(by);
  return list;
};

describe('selectBest', () => {
  it('breaks the initial tie on router ID (A1)', () => {
    const s = selectBest(routes());
    expect(s.best?.id).toBe('A1');
    expect(s.steps.at(-1)?.rule).toContain('router ID');
  });
  it('LOCAL_PREF beats a shorter AS path', () => {
    const s = selectBest(routes((r) => (r.B.localPref = 200)));
    expect(s.best?.id).toBe('B');
    expect(s.steps[0].rule).toBe('Highest LOCAL_PREF');
  });
  it('shorter AS_PATH wins when LOCAL_PREF ties', () => {
    const s = selectBest(routes());
    expect(s.lostTo.B).toContain('AS_PATH');
  });
  it('prepending makes a path lose', () => {
    const s = selectBest(routes((r) => { r.A1.prepend = 2; r.A2.prepend = 2; }));
    expect(s.best?.id).toBe('IX');
    expect(asPath(routes((r) => (r.A1.prepend = 2))[0])).toEqual([64500, 64500, 64500, 64999]);
  });
  it('MED is only compared between routes from the same neighbour AS', () => {
    // IX has MED 0 (lowest) but is a different AS, so it must not beat A on MED.
    const s = selectBest(routes((r) => (r.A2.med = 50)));
    expect(s.best?.id).toBe('A2');
    expect(s.lostTo.A1).toContain('MED');
    expect(s.lostTo.IX ?? '').not.toContain('MED');
  });
  it('a lower MED from a different AS does not win', () => {
    const s = selectBest(routes((r) => { r.IX.med = 0; r.A1.med = 500; r.A2.med = 500; }));
    // A1 wins the router-id tie-break over IX; MED across ASes is ignored
    expect(s.best?.id).toBe('A1');
  });
  it('skips down links and reports null when none are left', () => {
    expect(selectBest(routes((r) => (r.A1.up = false))).best?.id).toBe('A2');
    expect(selectBest(routes((r) => { for (const k in r) r[k].up = false; })).best).toBeNull();
  });
  it('lower ORIGIN wins', () => {
    const s = selectBest(routes((r) => { r.A1.origin = 'incomplete'; r.A2.origin = 'incomplete'; r.IX.origin = 'egp'; }));
    expect(s.best?.id).toBe('IX');
  });
  it('eBGP beats iBGP', () => {
    const s = selectBest(routes((r) => { r.A1.ebgp = false; r.A2.ebgp = false; r.IX.ebgp = false; r.B.basePath = [64501, 64999]; }));
    expect(s.best?.id).toBe('B');
  });
  it('records every eliminated route exactly once', () => {
    const s = selectBest(routes());
    const eliminated = s.steps.flatMap((x) => x.eliminated.map((e) => e.id));
    expect(new Set(eliminated).size).toBe(eliminated.length);
    expect(eliminated.length).toBe(3);
  });
});

describe('missions are solvable and not pre-solved', () => {
  const apply = (id: string) => {
    switch (id) {
      case 'via-b': return routes((r) => (r.B.localPref = 200));
      case 'med-tiebreak': return routes((r) => (r.A2.med = 10));
      case 'ix-prepend': return routes((r) => { r.A1.prepend = 1; r.A2.prepend = 1; r.B.prepend = 1; });
      case 'b-prepend': return routes((r) => { r.A1.prepend = 2; r.A2.prepend = 2; r.IX.prepend = 2; });
      default: return routes((r) => { r.A1.up = false; r.A2.up = false; });
    }
  };
  for (const m of MISSIONS) {
    it(`${m.id}: starts incomplete`, () => {
      const rs = initialRoutes();
      expect(m.done(rs, selectBest(rs).best)).toBe(false);
    });
    it(`${m.id}: has a valid solution`, () => {
      const rs = apply(m.id);
      expect(m.done(rs, selectBest(rs).best)).toBe(true);
    });
  }
  it('cutting links does not solve the policy missions', () => {
    const cases: [string, (r: Record<string, Route>) => void][] = [
      ['med-tiebreak', (r) => (r.A1.up = false)],
      ['via-b', (r) => { r.A1.up = false; r.A2.up = false; r.IX.up = false; }],
      ['ix-prepend', (r) => { r.A1.up = false; r.A2.up = false; r.B.up = false; }],
      ['b-prepend', (r) => { r.A1.up = false; r.A2.up = false; r.IX.up = false; }],
    ];
    for (const [id, cut] of cases) {
      const rs = routes(cut);
      expect(MISSIONS.find((m) => m.id === id)!.done(rs, selectBest(rs).best), id).toBe(false);
    }
  });
  it('cheating with LOCAL_PREF does not solve the no-LOCAL_PREF missions', () => {
    const rs = routes((r) => (r.IX.localPref = 200));
    const ix = MISSIONS.find((m) => m.id === 'ix-prepend')!;
    expect(ix.done(rs, selectBest(rs).best)).toBe(false);
  });
});
