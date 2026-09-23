import { describe, it, expect } from 'vitest';
import { describeRule, evaluate, matches, score, toRouterOs, type Packet, type Rule } from '../src/lib/game/firewall';

const pkt = (over: Partial<Packet>): Packet => ({
  id: 'p', label: 'p', chain: 'input', iface: 'wan', src: '203.0.113.9', proto: 'tcp', dstPort: 22, state: 'new', evil: true, why: '', ...over,
});

describe('rule matching', () => {
  it('an empty rule matches every packet in its chain', () => {
    expect(matches({ chain: 'input', action: 'drop' }, pkt({}))).toBe(true);
    expect(matches({ chain: 'forward', action: 'drop' }, pkt({}))).toBe(false);
  });
  it('protocol and ports', () => {
    const r: Rule = { chain: 'input', action: 'drop', proto: 'tcp', dstPort: [22, 23] };
    expect(matches(r, pkt({ dstPort: 23 }))).toBe(true);
    expect(matches(r, pkt({ dstPort: 80 }))).toBe(false);
    expect(matches(r, pkt({ proto: 'udp', dstPort: 22 }))).toBe(false);
    expect(matches(r, pkt({ proto: 'icmp', dstPort: undefined }))).toBe(false);
  });
  it('a port rule never matches ICMP, even without a port on the packet', () => {
    expect(matches({ chain: 'input', action: 'drop', dstPort: [80] }, pkt({ proto: 'icmp', dstPort: undefined }))).toBe(false);
  });
  it('source and destination networks', () => {
    const r: Rule = { chain: 'input', action: 'accept', src: '10.10.0.0/24' };
    expect(matches(r, pkt({ src: '10.10.0.77' }))).toBe(true);
    expect(matches(r, pkt({ src: '10.10.1.1' }))).toBe(false);
    const d: Rule = { chain: 'forward', action: 'accept', dst: '192.168.88.10/32' };
    expect(matches(d, pkt({ chain: 'forward', dst: '192.168.88.10' }))).toBe(true);
    expect(matches(d, pkt({ chain: 'forward', dst: '192.168.88.11' }))).toBe(false);
    expect(matches(d, pkt({ chain: 'forward' }))).toBe(false); // no destination on the packet
  });
  it('connection state and interface', () => {
    const r: Rule = { chain: 'input', action: 'accept', state: ['established', 'related'], iface: 'wan' };
    expect(matches(r, pkt({ state: 'established' }))).toBe(true);
    expect(matches(r, pkt({ state: 'new' }))).toBe(false);
    expect(matches(r, pkt({ state: 'established', iface: 'lan' }))).toBe(false);
  });
});

describe('evaluation (MikroTik chain rules)', () => {
  it('a packet that matches no rule is accepted', () => {
    expect(evaluate([], pkt({}))).toEqual({ action: 'accept', rule: null });
    expect(evaluate([{ chain: 'input', action: 'drop', dstPort: [80] }], pkt({}))).toEqual({ action: 'accept', rule: null });
  });
  it('the first matching rule decides, so order matters', () => {
    const acceptFirst: Rule[] = [{ chain: 'input', action: 'accept', dstPort: [22] }, { chain: 'input', action: 'drop' }];
    const dropFirst = [...acceptFirst].reverse();
    expect(evaluate(acceptFirst, pkt({})).action).toBe('accept');
    expect(evaluate(dropFirst, pkt({})).action).toBe('drop');
    expect(evaluate(dropFirst, pkt({})).rule).toBe(0);
  });
  it('rules for another chain are skipped', () => {
    expect(evaluate([{ chain: 'forward', action: 'drop' }], pkt({})).action).toBe('accept');
  });
});

describe('scoring', () => {
  const packets = [pkt({ id: 'a', dstPort: 23 }), pkt({ id: 'b', dstPort: 443, evil: false }), pkt({ id: 'c', dstPort: 22 })];
  it('an empty ruleset leaks everything', () => {
    const s = score([], packets);
    expect(s.evilBlocked).toBe(0);
    expect(s.leaked.map((r) => r.packet.id)).toEqual(['a', 'c']);
    expect(s.perfect).toBe(false);
  });
  it('a perfect ruleset blocks the bad and allows the good', () => {
    const s = score([{ chain: 'input', action: 'drop', proto: 'tcp', dstPort: [22, 23] }], packets);
    expect(s.perfect).toBe(true);
    expect([s.evilBlocked, s.evilTotal, s.goodAllowed, s.goodTotal]).toEqual([2, 2, 1, 1]);
  });
  it('a blanket drop causes collateral damage', () => {
    const s = score([{ chain: 'input', action: 'drop' }], packets);
    expect(s.evilBlocked).toBe(2);
    expect(s.collateral.map((r) => r.packet.id)).toEqual(['b']);
    expect(s.perfect).toBe(false);
  });
  it('reject counts as blocked', () => {
    expect(score([{ chain: 'input', action: 'reject' }], [pkt({})]).evilBlocked).toBe(1);
  });
});

describe('RouterOS output', () => {
  it('writes the command with the documented property names', () => {
    expect(toRouterOs({ chain: 'input', action: 'drop', proto: 'tcp', dstPort: [23], iface: 'wan' })).toBe('/ip firewall filter add chain=input action=drop protocol=tcp dst-port=23 in-interface-list=WAN');
    expect(toRouterOs({ chain: 'input', action: 'accept', state: ['established', 'related'] })).toBe('/ip firewall filter add chain=input action=accept connection-state=established,related');
    expect(toRouterOs({ chain: 'forward', action: 'accept', proto: 'tcp', dstPort: [80, 443], dst: '192.168.88.10/32', src: '10.0.0.0/8' })).toBe(
      '/ip firewall filter add chain=forward action=accept protocol=tcp src-address=10.0.0.0/8 dst-address=192.168.88.10/32 dst-port=80,443',
    );
    expect(toRouterOs({ chain: 'input', action: 'drop' })).toBe('/ip firewall filter add chain=input action=drop');
  });
  it('describes rules in words', () => {
    expect(describeRule({ chain: 'input', action: 'drop', proto: 'tcp', dstPort: [23], iface: 'wan' })).toBe('Drop traffic using TCP to port 23 arriving from the WAN (input chain)');
  });
});
