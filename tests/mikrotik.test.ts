import { describe, it, expect } from 'vitest';
import { DEFAULT_CONFIG, generate, validate, type Config } from '../src/lib/mikrotik';

const base = (over: Partial<Config>): Config => ({ ...DEFAULT_CONFIG, ...over });

describe('gateway', () => {
  const { rsc, errors } = generate(base({ role: 'gateway' }));
  it('validates defaults', () => expect(errors).toEqual([]));
  it('bridges every port except WAN', () => {
    expect(rsc).toContain('/interface bridge port add bridge=bridge-lan interface=ether2');
    expect(rsc).not.toContain('bridge=bridge-lan interface=ether1');
  });
  it('builds DHCP pool inside the LAN', () => {
    expect(rsc).toContain('ranges=192.168.88.10-192.168.88.254');
    expect(rsc).toContain('address=192.168.88.0/24 gateway=192.168.88.1');
  });
  it('masquerades and drops WAN input', () => {
    expect(rsc).toContain('action=masquerade out-interface-list=WAN');
    expect(rsc).toContain('chain=input action=drop');
  });
  it('rejects bad LAN and WAN', () => {
    expect(validate(base({ lanCidr: '192.168.88.0/24' }))).toHaveLength(1);
    expect(validate(base({ lanCidr: '10.0.0.1/30' }))).toHaveLength(1);
    expect(validate(base({ wanPort: 'ether9' }))).toHaveLength(1);
  });
  it('refuses a switch as router', () => expect(validate(base({ deviceId: 'crs326' })).length).toBeGreaterThan(0));
});

describe('isp-edge', () => {
  const cfg = base({ role: 'isp-edge', deviceId: 'ccr2004' });
  const { rsc, errors } = generate(cfg);
  it('validates defaults', () => expect(errors).toEqual([]));
  it('configures the BGP session', () => {
    expect(rsc).toContain('/routing bgp template add name=main as=64512 router-id=203.0.113.2');
    expect(rsc).toContain('/routing bgp connection add name=upstream templates=main');
    expect(rsc).not.toContain('/routing bgp instance');
    expect(rsc).toContain('remote.address=203.0.113.1 remote.as=64500');
    expect(rsc).toContain('output.network=bgp-announce');
  });
  it('offers the 7.20 instance style on request', () => {
    const inst = generate({ ...cfg, bgpStyle: 'instance' }).rsc;
    expect(inst).toContain('/routing bgp instance add name=main as=64512 router-id=203.0.113.2');
    expect(inst).toContain('/routing bgp connection add name=upstream instance=main');
    expect(inst).not.toContain('/routing bgp template');
  });
  it('announces only our prefix and filters inbound', () => {
    expect(rsc).toContain('chain=upstream-out rule="if (dst == 198.51.100.0/24) { accept }"');
    expect(rsc).toContain('dst-len > 24');
    expect(rsc).toContain('dst in 10.0.0.0/8');
  });
  it('anti-spoofs customers', () => expect(rsc).toContain('src-address=!198.51.100.0/24'));
  it('rejects iBGP-looking config and long prefixes', () => {
    expect(validate({ ...cfg, peerAsn: cfg.localAsn }).length).toBeGreaterThan(0);
    expect(validate({ ...cfg, announcePrefix: '198.51.100.0/25' }).length).toBeGreaterThan(0);
    expect(validate({ ...cfg, announcePrefix: '198.51.100.5/24' }).length).toBeGreaterThan(0);
    expect(validate({ ...cfg, upstreamPeer: '203.0.113.9' }).length).toBeGreaterThan(0);
  });
});

describe('vlan-switch', () => {
  const cfg = base({ role: 'vlan-switch', deviceId: 'crs326', mgmtCidr: '10.99.0.2/24' });
  const { rsc, errors } = generate(cfg);
  it('validates defaults', () => expect(errors).toEqual([]));
  it('sets access ports with PVID', () =>
    expect(rsc).toContain('interface=ether1 pvid=10 frame-types=admit-only-untagged-and-priority-tagged'));
  it('tags trunk on every VLAN and bridge only on mgmt', () => {
    expect(rsc).toContain('vlan-ids=10 tagged=sfp-sfpplus1 untagged=ether1,ether2');
    expect(rsc).toContain('vlan-ids=99 tagged=bridge1,sfp-sfpplus1 untagged=ether24');
  });
  it('enables filtering last', () => expect(rsc.trimEnd().endsWith('vlan-filtering=yes')).toBe(true));
  it('rejects duplicate ports and bad mgmt VLAN', () => {
    const dup = { ...cfg, vlans: [{ id: 10, name: 'a', ports: ['ether1'] }, { id: 99, name: 'm', ports: ['ether1'] }] };
    expect(validate(dup).length).toBeGreaterThan(0);
    expect(validate({ ...cfg, mgmtVlanId: 5 }).length).toBeGreaterThan(0);
    expect(validate({ ...cfg, vlans: [{ id: 99, name: 'm', ports: ['sfp-sfpplus1'] }] }).length).toBeGreaterThan(0);
  });
});
