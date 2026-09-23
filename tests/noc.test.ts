import { describe, it, expect } from 'vitest';
import { existsSync } from 'node:fs';
import { INCIDENTS } from '../src/data/game/nocIncidents';
import { ROUTE_LEVELS } from '../src/data/game/routeLevels';
import { FW_LEVELS, BREACH_LEVELS } from '../src/data/game/firewallLevels';
import { SUBNET_LEVELS } from '../src/data/game/subnetLevels';

/** Every internal link a level or incident offers must resolve to a real page. */
const linkOk = (href: string) => {
  const m = href.match(/^\/learn\/([^/]+)\/([^/]+)$/);
  if (m) return existsSync(`src/content/courses/${m[1]}/${m[2]}.mdx`);
  if (href.startsWith('/tools/')) return existsSync(`src/pages${href}.astro`);
  if (href.startsWith('/labs/')) return existsSync(`public${href}`);
  if (href.startsWith('/practice/')) return ['subnetting', 'masks', 'vlsm', 'ipv6', 'routing'].includes(href.split('/')[2]);
  if (href.startsWith('/play/')) return true;
  return false;
};

describe('NOC incidents', () => {
  it('has unique ids', () => expect(new Set(INCIDENTS.map((i) => i.id)).size).toBe(INCIDENTS.length));
  for (const inc of INCIDENTS) {
    describe(inc.id, () => {
      const causes = inc.causes.map((c) => c.id);
      const devices = inc.devices.map((d) => d.id);
      it('truth is one of the causes and causes are unique', () => {
        expect(causes).toContain(inc.truth);
        expect(new Set(causes).size).toBe(causes.length);
      });
      it('every command targets a real device and cause references are valid', () => {
        expect(new Set(inc.cmds.map((c) => c.id)).size).toBe(inc.cmds.length);
        for (const c of inc.cmds) {
          expect(devices).toContain(c.device);
          for (const r of c.rules ?? []) expect(causes).toContain(r);
        }
      });
      it('no command rules out the real cause', () => {
        for (const c of inc.cmds) expect(c.rules ?? []).not.toContain(inc.truth);
      });
      it('every wrong cause can be ruled out by some command', () => {
        for (const cause of causes.filter((c) => c !== inc.truth)) {
          expect(inc.cmds.some((c) => c.rules?.includes(cause)), `${cause} is never ruled out`).toBe(true);
        }
      });
      it('some command reveals the real cause', () => expect(inc.cmds.some((c) => c.points)).toBe(true));
      it('par is achievable: enough commands to rule out every wrong cause and find the truth', () => {
        expect(inc.par).toBeGreaterThanOrEqual(2);
        expect(inc.par).toBeLessThanOrEqual(inc.cmds.length);
        // a greedy cover of wrong causes plus one pointing command must fit within par + 2
        const need = new Set(causes.filter((c) => c !== inc.truth));
        let used = 0;
        while (need.size) {
          const best = inc.cmds.map((c) => ({ c, n: (c.rules ?? []).filter((r) => need.has(r)).length })).sort((a, b) => b.n - a.n)[0];
          best.c.rules!.forEach((r) => need.delete(r));
          used++;
        }
        expect(used).toBeLessThanOrEqual(inc.par);
      });
      it('has a fix and a lesson', () => {
        expect(inc.fix.length).toBeGreaterThan(0);
        expect(inc.lesson.length).toBeGreaterThan(40);
      });
    });
  }
});

describe('links in game content', () => {
  const all = [...INCIDENTS, ...SUBNET_LEVELS, ...ROUTE_LEVELS, ...FW_LEVELS, ...BREACH_LEVELS] as { id: string; read?: { href: string } }[];
  for (const l of all) if (l.read) it(`${l.id} links to ${l.read.href}`, () => expect(linkOk(l.read!.href)).toBe(true));
});
