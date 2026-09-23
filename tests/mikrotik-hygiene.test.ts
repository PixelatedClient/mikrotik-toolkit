import { describe, it, expect } from 'vitest';
import { DEFAULT_CONFIG, DEVICES, generate, validate, type Config } from '../src/lib/mikrotik';

const base = (over: Partial<Config>): Config => ({ ...DEFAULT_CONFIG, ...over });

describe('generated script hygiene', () => {
  const roles = ['gateway', 'isp-edge', 'vlan-switch'] as const;

  for (const role of roles) {
    for (const dev of DEVICES) {
      const cfg = base({
        role,
        deviceId: dev.id,
        wanPort: dev.ports[0],
        upstreamPort: dev.ports[0],
        trunkPort: dev.ports[dev.ports.length - 1],
        mgmtCidr: role === 'vlan-switch' ? '10.99.0.2/24' : '192.168.88.0/24',
        vlans: [
          { id: 10, name: 'staff', ports: [dev.ports[1], dev.ports[2]] },
          { id: 99, name: 'mgmt', ports: [dev.ports[3]] },
        ],
      });
      const { rsc, errors } = generate(cfg);
      if (errors.length) continue; // a switch as router is rejected on purpose

      it(`${role} on ${dev.id}: every line is a comment, blank or a command`, () => {
        for (const line of rsc.split('\n')) expect(line === '' || line.startsWith('#') || line.startsWith('/')).toBe(true);
      });
      it(`${role} on ${dev.id}: quotes are balanced`, () => {
        for (const line of rsc.split('\n')) expect((line.match(/"/g) ?? []).length % 2).toBe(0);
      });
      it(`${role} on ${dev.id}: only real ports are used`, () => {
        const used = [...rsc.matchAll(/interface=(ether\d+|sfp-sfpplus\d+)/g)].map((m) => m[1]);
        for (const p of used) expect(dev.ports).toContain(p);
      });
    }
  }

  it('gateway and edge always end input with a drop-all rule and disable telnet', () => {
    for (const role of ['gateway', 'isp-edge'] as const) {
      const { rsc } = generate(base({ role, deviceId: 'ccr2004' }));
      expect(rsc).toMatch(/chain=input action=drop comment="drop everything else"/);
      expect(rsc).toContain('/ip service set telnet disabled=yes');
    }
  });

  it('edge rejects the default route and our own prefix inbound', () => {
    const { rsc } = generate(base({ role: 'isp-edge', deviceId: 'ccr2004' }));
    expect(rsc).toContain('if (dst == 0.0.0.0/0) { reject }');
    expect(rsc).toContain('reject our own prefix');
  });

  it('trims stray whitespace so it never reaches the script', () => {
    const { rsc, errors } = generate(
      base({ role: 'isp-edge', deviceId: 'ccr2004', upstreamPeer: ' 203.0.113.1 ', upstreamLocal: '203.0.113.2/30 ', identity: ' edge-01 ' }),
    );
    expect(errors).toEqual([]);
    expect(rsc).toContain('remote.address=203.0.113.1 remote.as');
    expect(rsc).toContain('name=edge-01\n');
  });

  it('rejects injection through free-text fields', () => {
    expect(validate(base({ identity: 'x\n/system reset-configuration' })).length).toBeGreaterThan(0);
    expect(validate(base({ identity: 'x" ; /system reset' })).length).toBeGreaterThan(0);
    expect(validate(base({ dnsServers: '1.1.1.1;/system reset' })).length).toBeGreaterThan(0);
    expect(validate(base({ lanCidr: '192.168.88.1/24\n/user remove admin' })).length).toBeGreaterThan(0);
    expect(
      validate(base({ role: 'vlan-switch', deviceId: 'crs326', mgmtCidr: '10.99.0.2/24', vlans: [{ id: 99, name: 'a"b', ports: [] }] })).length,
    ).toBeGreaterThan(0);
  });

  it('never throws on garbage numeric input', () => {
    expect(() => generate(base({ role: 'isp-edge', deviceId: 'ccr2004', localAsn: NaN, peerAsn: Infinity }))).not.toThrow();
    expect(() => generate(base({ role: 'vlan-switch', deviceId: 'crs326', vlans: [{ id: NaN, name: '', ports: [''] }] }))).not.toThrow();
  });
});
