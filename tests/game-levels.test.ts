import { describe, it, expect } from 'vitest';
import { ROUTE_LEVELS } from '../src/data/game/routeLevels';
import { FW_LEVELS, BREACH_LEVELS } from '../src/data/game/firewallLevels';
import { knownPrefixes, nextHopChoices, sendPacket, withRoutes } from '../src/lib/game/routing';
import { score, evaluate, type Packet } from '../src/lib/game/firewall';

describe('route levels', () => {
  for (const lv of ROUTE_LEVELS) {
    it(`${lv.id}: reference solution delivers every flow`, () => {
      const net = withRoutes(lv.net, lv.solution);
      for (const f of lv.flows) {
        const o = sendPacket(net, f.from, f.to);
        expect(o.delivered, `${f.label}: ${JSON.stringify(o)}`).toBe(true);
        if (f.mustPass && o.delivered) expect(o.path).toContain(f.mustPass);
      }
    });
    it(`${lv.id}: starting state is not already solved`, () => {
      const ok = lv.flows.every((f) => {
        const o = sendPacket(lv.net, f.from, f.to);
        return o.delivered && (!f.mustPass || o.path.includes(f.mustPass));
      });
      expect(ok).toBe(false);
    });
    it(`${lv.id}: the editor offers every prefix and next hop the solution needs`, () => {
      const offered = [...knownPrefixes(lv.net), ...(lv.extraPrefixes ?? [])];
      for (const [id, rs] of Object.entries(lv.solution)) {
        const hops = nextHopChoices(lv.net, id).map((h) => h.ip);
        for (const r of rs) { expect(offered).toContain(r.dst); expect(hops).toContain(r.via); }
      }
    });
    it(`${lv.id}: par matches the solution size and only editable routers are edited`, () => {
      const total = Object.values(lv.solution).reduce((n, r) => n + r.length, 0);
      expect(total).toBe(lv.par);
      for (const id of Object.keys(lv.solution)) expect(lv.editable).toContain(id);
    });
  }
});

describe('firewall levels', () => {
  const ids = new Set<string>();
  for (const lv of FW_LEVELS) {
    it(`${lv.id}: unique packet ids`, () => {
      for (const p of lv.packets) { expect(ids.has(p.id)).toBe(false); ids.add(p.id); }
    });
    it(`${lv.id}: reference solution wins`, () => {
      const s = score(lv.solution, lv.packets);
      expect(s.perfect, JSON.stringify(s.results.filter((r) => !r.ok).map((r) => r.packet.label))).toBe(true);
      expect(lv.solution.length).toBe(lv.par);
    });
    it(`${lv.id}: the starting ruleset does not win`, () => {
      expect(score(lv.initial ?? [], lv.packets).perfect).toBe(false);
    });
    it(`${lv.id}: has both attackers and legitimate traffic`, () => {
      expect(lv.packets.some((p) => p.evil)).toBe(true);
      expect(lv.packets.some((p) => !p.evil)).toBe(true);
    });
  }
  it('a lone drop-everything does not beat the levels with legitimate traffic', () => {
    for (const lv of FW_LEVELS) {
      const chains = [...new Set(lv.packets.map((p) => p.chain))];
      const s = score(chains.map((c) => ({ chain: c, action: 'drop' as const })), lv.packets);
      expect(s.perfect, lv.id).toBe(false);
    }
  });
});

describe('breach levels', () => {
  for (const b of BREACH_LEVELS) {
    it(`${b.id}: the reference packet is accepted`, () => {
      const pkt: Packet = { id: 'x', label: 'x', chain: b.chain, iface: b.solution.zone, src: b.solution.src, dst: '192.168.88.10', proto: b.solution.proto, dstPort: b.solution.port, state: 'new', evil: true, why: '' };
      expect(evaluate(b.enemyRules, pkt).action).toBe('accept');
    });
    it(`${b.id}: the naive packet from the first zone/source is blocked`, () => {
      const pkt: Packet = { id: 'x', label: 'x', chain: b.chain, iface: b.zones[0], src: b.sources[0].ip, dst: '192.168.88.10', proto: b.objective.proto, dstPort: b.objective.port, state: 'new', evil: true, why: '' };
      if (b.id === 'fw-b1') expect(evaluate(b.enemyRules, pkt).action).toBe('accept');
      else expect(evaluate(b.enemyRules, pkt).action).not.toBe('accept');
    });
    it(`${b.id}: solution is a legal choice`, () => {
      expect(b.zones).toContain(b.solution.zone);
      expect(b.sources.map((s) => s.ip)).toContain(b.solution.src);
    });
  }
});
