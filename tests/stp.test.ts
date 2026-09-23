import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { LABS } from '../src/data/labs';
import {
  MISSIONS, bridgeIdText, computeStp, initialBridges, initialLinks, pathCost, type Bridge, type Link,
} from '../src/lib/stp';

const bridges = (mut?: (b: Record<string, Bridge>) => void) => {
  const list = initialBridges();
  mut?.(Object.fromEntries(list.map((b) => [b.id, b])));
  return list;
};
const links = (mut?: (l: Record<string, Link>) => void) => {
  const list = initialLinks();
  mut?.(Object.fromEntries(list.map((l) => [l.id, l])));
  return list;
};
const role = (r: ReturnType<typeof computeStp>, bridge: string, link: string) => r.ports.find((p) => p.bridge === bridge && p.link === link)!.role;

describe('path costs (long mode, MikroTik documentation table)', () => {
  it('matches the documented values', () => {
    expect(pathCost(10)).toBe(2000000);
    expect(pathCost(100)).toBe(200000);
    expect(pathCost(1000)).toBe(20000);
    expect(pathCost(10000)).toBe(2000);
    expect(pathCost(25000)).toBe(800);
    expect(pathCost(100000)).toBe(200);
  });
});

describe('root election', () => {
  it('equal priorities: the lowest MAC address wins', () => {
    expect(computeStp(bridges(), links()).roots).toEqual(['A']);
  });
  it('a lower priority beats a lower MAC', () => {
    const r = computeStp(bridges((b) => (b.D.priority = 4096)), links());
    expect(r.roots).toEqual(['D']);
  });
  it('bridge ID text is priority then MAC', () => {
    expect(bridgeIdText(initialBridges()[0])).toBe('8000.00:0C:42:00:00:0A');
  });
});

describe('the demo network (hand-computed)', () => {
  const r = computeStp(bridges(), links());
  it('root path costs', () => {
    expect(r.rootPathCost).toEqual({ A: 0, B: 20000, C: 40000, D: 20000 });
  });
  it('C picks B over D as its root port (equal cost, lower bridge ID)', () => {
    expect(role(r, 'C', 'BC')).toBe('root');
    expect(role(r, 'C', 'CD')).toBe('alternate');
  });
  it('the 100 Mbps diagonal is not used', () => {
    expect(role(r, 'A', 'AC')).toBe('designated');
    expect(role(r, 'C', 'AC')).toBe('alternate');
  });
  it('active and blocked links', () => {
    expect([...r.activeLinks].sort()).toEqual(['AB', 'BC', 'DA']);
    expect([...r.blockedLinks].sort()).toEqual(['AC', 'CD']);
  });
});

describe('failure and reconvergence', () => {
  it('cutting an active link brings a blocked one into service', () => {
    const r = computeStp(bridges(), links((l) => (l.AB.up = false)));
    expect(r.roots).toEqual(['A']);
    expect([...r.activeLinks].sort()).toEqual(['BC', 'CD', 'DA']);
    expect(r.rootPathCost.B).toBe(60000);
    expect(r.downLinks).toEqual(['AB']);
  });
  it('isolating a bridge makes it its own root', () => {
    const r = computeStp(bridges(), links((l) => { l.AB.up = false; l.BC.up = false; }));
    expect(r.rootOf.B).toBe('B');
    expect(r.roots.sort()).toEqual(['A', 'B']);
    expect(r.rootPathCost.B).toBe(0);
  });
  it('a faster link changes the tree', () => {
    // make the diagonal 10 Gbps: C now reaches the root in 2000
    const r = computeStp(bridges(), links((l) => (l.AC.speedMbps = 10000)));
    expect(r.rootPathCost.C).toBe(2000);
    expect(role(r, 'C', 'AC')).toBe('root');
  });
});

describe('the RSTP lab topology (rstp-triangle)', () => {
  const b: Bridge[] = [
    { id: 'SW1', priority: 0x1000, mac: '00:0C:42:00:00:01' },
    { id: 'SW2', priority: 0x2000, mac: '00:0C:42:00:00:02' },
    { id: 'SW3', priority: 0x8000, mac: '00:0C:42:00:00:03' },
  ];
  const l: Link[] = [
    { id: '12', a: 'SW1', b: 'SW2', aPort: 1, bPort: 1, speedMbps: 1000, up: true },
    { id: '23', a: 'SW2', b: 'SW3', aPort: 2, bPort: 1, speedMbps: 1000, up: true },
    { id: '13', a: 'SW1', b: 'SW3', aPort: 2, bPort: 2, speedMbps: 1000, up: true },
  ];
  const r = computeStp(b, l);
  it('SW1 is the root, and every SW1 port is designated', () => {
    expect(r.roots).toEqual(['SW1']);
    expect(role(r, 'SW1', '12')).toBe('designated');
    expect(role(r, 'SW1', '13')).toBe('designated');
  });
  it('the SW2 to SW3 link is blocked on the SW3 side', () => {
    expect(role(r, 'SW2', '12')).toBe('root');
    expect(role(r, 'SW3', '13')).toBe('root');
    expect(role(r, 'SW2', '23')).toBe('designated');
    expect(role(r, 'SW3', '23')).toBe('alternate');
  });
  it('after SW1-SW3 fails, SW3 uses SW2', () => {
    const r2 = computeStp(b, l.map((x) => (x.id === '13' ? { ...x, up: false } : x)));
    expect(role(r2, 'SW3', '23')).toBe('root');
    expect(role(r2, 'SW2', '23')).toBe('designated');
    expect(r2.blockedLinks).toEqual([]);
  });
});

describe('spanning tree properties on random networks', () => {
  const rng = (seed: number) => () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 2 ** 32);

  it('300 random topologies: loop free, and connectivity is preserved', () => {
    const rand = rng(2026);
    for (let t = 0; t < 300; t++) {
      const n = 2 + Math.floor(rand() * 7);
      const bs: Bridge[] = Array.from({ length: n }, (_, i) => ({
        id: `S${i}`, priority: Math.floor(rand() * 4) * 4096 + 28672, mac: `00:00:00:00:00:${(i + 16).toString(16).padStart(2, '0')}`,
      }));
      const ls: Link[] = [];
      const speeds = [10, 100, 1000, 10000];
      const nextPort: Record<string, number> = {};
      const port = (id: string) => (nextPort[id] = (nextPort[id] ?? 0) + 1);
      const pairs = new Set<string>();
      const target = n - 1 + Math.floor(rand() * (n + 2));
      for (let k = 0; k < target * 3 && ls.length < target; k++) {
        const a = Math.floor(rand() * n), b2 = Math.floor(rand() * n);
        if (a === b2 || pairs.has(`${Math.min(a, b2)}-${Math.max(a, b2)}`)) continue;
        pairs.add(`${Math.min(a, b2)}-${Math.max(a, b2)}`);
        ls.push({ id: `L${ls.length}`, a: `S${a}`, b: `S${b2}`, aPort: port(`S${a}`), bPort: port(`S${b2}`), speedMbps: speeds[Math.floor(rand() * 4)], up: rand() > 0.15 });
      }
      const res = computeStp(bs, ls);
      const up = ls.filter((x) => x.up);

      // components of the full up-graph vs components of the active tree
      const comps = (edges: { a: string; b: string }[]) => {
        const parent = new Map(bs.map((x) => [x.id, x.id]));
        const find = (x: string): string => (parent.get(x) === x ? x : (parent.set(x, find(parent.get(x)!)), parent.get(x)!));
        for (const e of edges) parent.set(find(e.a), find(e.b));
        return new Set(bs.map((x) => find(x.id))).size;
      };
      const active = ls.filter((x) => res.activeLinks.includes(x.id));
      expect(comps(active), `topology ${t}: connectivity`).toBe(comps(up));
      expect(active.length, `topology ${t}: tree edges = nodes - components`).toBe(n - comps(up));
      expect(res.roots.length, `topology ${t}: one root per component`).toBe(comps(up));

      // every up link has exactly one designated-or-root side per segment, and a root has no root port
      for (const x of up) {
        const ends = res.ports.filter((p) => p.link === x.id);
        expect(ends).toHaveLength(2);
        expect(ends.filter((p) => p.role === 'alternate').length).toBeLessThanOrEqual(1);
      }
      for (const root of res.roots) expect(res.ports.some((p) => p.bridge === root && p.role === 'root')).toBe(false);
      for (const b of bs) if (!res.roots.includes(b.id)) {
        expect(res.ports.filter((p) => p.bridge === b.id && p.role === 'root'), `${b.id} has exactly one root port`).toHaveLength(1);
      }
    }
  });
});

describe('missions', () => {
  const initial = computeStp(initialBridges(), initialLinks());
  const solve = (id: string) => {
    switch (id) {
      case 'root-d': return [bridges((b) => (b.D.priority = 4096)), links()] as const;
      case 'block-da': return [bridges((b) => (b.C.priority = 4096)), links()] as const;
      case 'failover': return [bridges(), links((l) => (l.AB.up = false))] as const;
      default: return [bridges(), links((l) => { l.AB.up = false; l.BC.up = false; })] as const;
    }
  };
  for (const m of MISSIONS) {
    it(`${m.id}: not solved at the start`, () => {
      expect(m.done(initialBridges(), initialLinks(), initial, initial)).toBe(false);
    });
    it(`${m.id}: has a solution`, () => {
      const [b, l] = solve(m.id);
      expect(m.done(b, l, computeStp(b, l), initial)).toBe(true);
    });
  }
  it('cutting a blocked link does not count as surviving a failure', () => {
    const l = links((x) => (x.CD.up = false));
    const failover = MISSIONS.find((m) => m.id === 'failover')!;
    expect(failover.done(bridges(), l, computeStp(bridges(), l), initial)).toBe(false);
  });
});

describe('the rstp-triangle lab files agree with the engine and with the lab text', () => {
  const lab = LABS.find((l) => l.id === 'rstp-triangle')!;
  const conf = (n: string) => readFileSync(join(__dirname, '..', 'public/labs/rstp-triangle', n + '.rsc'), 'utf8');
  const bs: Bridge[] = ['SW1', 'SW2', 'SW3'].map((id, i) => {
    const m = conf(id).match(/^\/interface bridge add .*priority=(0x[0-9a-fA-F]+)/m);
    return { id, priority: m ? parseInt(m[1], 16) : 0x8000, mac: `00:0C:42:00:00:0${i + 1}` };
  });
  const portNo = (i: string) => Number(i.replace('ether', ''));
  const ls: Link[] = lab.links
    .filter((l) => l.a.startsWith('SW') && l.b.startsWith('SW'))
    .map((l, i) => ({ id: `L${i}`, a: l.a, b: l.b, aPort: portNo(l.ai), bPort: portNo(l.bi), speedMbps: 1000, up: true }));
  const r = computeStp(bs, ls);
  const linkOf = (x: string, y: string) => ls.find((l) => [l.a, l.b].sort().join() === [x, y].sort().join())!.id;

  it('priorities come from the config files', () => {
    expect(bs.map((b) => b.priority)).toEqual([0x1000, 0x2000, 0x8000]);
  });
  it('SW1 is the root, as the lab tells the learner', () => {
    expect(r.roots).toEqual(['SW1']);
  });
  it('SW3 blocks its port towards SW2 (the lab verify text), and SW2 stays designated there', () => {
    const l = linkOf('SW2', 'SW3');
    expect(role(r, 'SW3', l)).toBe('alternate');
    expect(role(r, 'SW2', l)).toBe('designated');
    expect(role(r, 'SW3', linkOf('SW1', 'SW3'))).toBe('root');
    expect(role(r, 'SW2', linkOf('SW1', 'SW2'))).toBe('root');
  });
  it('moving the root to SW3 (task 5) blocks SW2 towards SW1', () => {
    const r2 = computeStp(bs.map((b) => (b.id === 'SW3' ? { ...b, priority: 0 } : b)), ls);
    expect(r2.roots).toEqual(['SW3']);
    expect(role(r2, 'SW2', linkOf('SW1', 'SW2'))).toBe('alternate');
    expect(role(r2, 'SW1', linkOf('SW1', 'SW2'))).toBe('designated');
  });
});
