import { describe, it, expect } from 'vitest';
import {
  SWITCH_PORTS, defaultDesign, generateRouter, generateSwitch, pairKey, subnetOf, trace, validateDesign, gatewayOf,
} from '../src/lib/vlan';

describe('addressing plan', () => {
  it('gives every VLAN ID a unique /24', () => {
    const seen = new Set<string>();
    for (let id = 1; id <= 4094; id++) seen.add(subnetOf(id));
    expect(seen.size).toBe(4094);
  });
  it('is stable and readable', () => {
    expect(subnetOf(10)).toBe('10.0.10.0/24');
    expect(subnetOf(99)).toBe('10.0.99.0/24');
    expect(subnetOf(300)).toBe('10.1.44.0/24');
    expect(gatewayOf(4094)).toBe('10.15.254.1');
  });
});

describe('default design', () => {
  const d = defaultDesign();
  it('validates', () => expect(validateDesign(d)).toEqual([]));

  it('switch script is valid and ends with filtering', () => {
    const { rsc, errors } = generateSwitch(d);
    expect(errors).toEqual([]);
    expect(rsc).toContain('vlan-ids=10 tagged=sfp-sfpplus1 untagged=ether1,ether2,ether3,ether4');
    expect(rsc).toContain('address=10.0.99.2/24');
    expect(rsc).toContain('gateway=10.0.99.1');
    expect(rsc.trimEnd().endsWith('vlan-filtering=yes')).toBe(true);
  });

  it('router script has an interface, address and DHCP per VLAN', () => {
    const { rsc, errors } = generateRouter(d);
    expect(errors).toEqual([]);
    for (const v of d.vlans) {
      expect(rsc).toContain(`/interface vlan add name=vlan${v.id}-${v.name} interface=ether2 vlan-id=${v.id}`);
      expect(rsc).toContain(`address=${gatewayOf(v.id)}/24 interface=vlan${v.id}-${v.name}`);
      expect(rsc).toContain(`/ip dhcp-server add name=dhcp-${v.name}`);
    }
  });

  it('router firewall reflects the policy matrix exactly', () => {
    const { rsc } = generateRouter(d);
    expect(rsc).toContain('in-interface=vlan10-staff out-interface=vlan30-servers');
    expect(rsc).not.toContain('in-interface=vlan20-guest out-interface=vlan10-staff');
    expect(rsc).not.toContain('in-interface=vlan30-servers out-interface=vlan10-staff');
    expect(rsc).toContain('in-interface=vlan10-staff out-interface-list=WAN');
    expect(rsc).not.toContain('in-interface=vlan30-servers out-interface-list=WAN');
    expect(rsc.trimEnd().endsWith('comment="isolate everything else"')).toBe(true);
  });

  it('every generated line is a comment, blank or command with balanced quotes', () => {
    for (const rsc of [generateSwitch(d).rsc, generateRouter(d).rsc]) {
      for (const line of rsc.split('\n')) {
        expect(line === '' || line.startsWith('#') || line.startsWith('/')).toBe(true);
        expect((line.match(/"/g) ?? []).length % 2).toBe(0);
      }
    }
  });
});

describe('validation', () => {
  it('rejects duplicate IDs and names, bad names, missing mgmt VLAN, dangling ports', () => {
    const d = defaultDesign();
    expect(validateDesign({ ...d, vlans: [...d.vlans, { id: 10, name: 'x', internet: false }] }).length).toBeGreaterThan(0);
    expect(validateDesign({ ...d, vlans: [...d.vlans, { id: 11, name: 'staff', internet: false }] }).length).toBeGreaterThan(0);
    expect(validateDesign({ ...d, vlans: [{ id: 10, name: 'bad name!', internet: false }], mgmtVlan: 10, access: {} }).length).toBeGreaterThan(0);
    expect(validateDesign({ ...d, mgmtVlan: 5 }).length).toBeGreaterThan(0);
    expect(validateDesign({ ...d, access: { ...d.access, ether1: 77 } }).length).toBeGreaterThan(0);
    expect(validateDesign({ ...d, vlans: [{ id: 5000, name: 'a', internet: false }], mgmtVlan: 5000, access: {} }).length).toBeGreaterThan(0);
  });
  it('returns errors instead of scripts for invalid designs', () => {
    const d = { ...defaultDesign(), mgmtVlan: 5 };
    expect(generateSwitch(d).rsc).toBe('');
    expect(generateRouter(d).rsc).toBe('');
  });
  it('removing a VLAN that ports still use is flagged', () => {
    const d = defaultDesign();
    const broken = { ...d, vlans: d.vlans.filter((v) => v.id !== 20) };
    expect(validateDesign(broken).some((e) => e.includes('VLAN 20'))).toBe(true);
  });
});

describe('trace', () => {
  const d = defaultDesign();
  it('same VLAN stays on the switch', () => {
    const t = trace(d, 'ether1', 'ether2');
    expect(t.ok).toBe(true);
    expect(t.steps.join(' ')).toContain('never reaches the router');
  });
  it('allowed inter-VLAN path goes via the router', () => {
    const t = trace(d, 'ether1', 'ether9'); // staff -> servers
    expect(t.ok).toBe(true);
    expect(t.steps.join(' ')).toContain('may reach servers');
  });
  it('blocked direction is blocked, and policy is directional', () => {
    expect(trace(d, 'ether5', 'ether1').ok).toBe(false); // guest -> staff
    expect(trace(d, 'ether9', 'ether1').ok).toBe(false); // servers -> staff (only staff -> servers allowed)
  });
  it('unused ports drop traffic', () => {
    expect(trace(d, 'ether12', 'ether1').ok).toBe(false);
    expect(trace(d, 'ether1', 'ether12').ok).toBe(false);
  });
  it('internet access follows the per-VLAN flag', () => {
    expect(trace(d, 'ether1', 'internet').ok).toBe(true);
    expect(trace(d, 'ether9', 'internet').ok).toBe(false);
  });
  it('matches the generated firewall for every ordered pair of ports', () => {
    const { rsc } = generateRouter(d);
    for (const a of d.vlans) for (const b of d.vlans) {
      if (a.id === b.id) continue;
      const pa = SWITCH_PORTS.find((p) => d.access[p] === a.id);
      const pb = SWITCH_PORTS.find((p) => d.access[p] === b.id);
      if (!pa || !pb) continue;
      const inScript = rsc.includes(`in-interface=vlan${a.id}-${a.name} out-interface=vlan${b.id}-${b.name}`);
      expect(trace(d, pa, pb).ok, `${a.name}>${b.name}`).toBe(inScript);
      expect(d.allow[pairKey(a.id, b.id)] ?? false).toBe(inScript);
    }
  });
});
