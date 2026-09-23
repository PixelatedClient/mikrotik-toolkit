/**
 * `print detail` layouts per menu, captured from RouterOS 7.16 (see tools/conformance/scenarios/detail.json).
 * Each spec says which entry properties are shown, in which order, and how the flag column is laid out.
 */
import { menuFor, type DetailSpec, type Entry } from './cli';

const pick = (e: Entry, keys: string[]): [string, string][] =>
  keys.filter((k) => e.props[k] !== undefined).map((k) => [k, e.props[k]] as [string, string]);
const without = (e: Entry, hide: string[]): [string, string][] =>
  Object.entries(e.props).filter(([k]) => !hide.includes(k)) as [string, string][];

const attach = (path: string[], spec: DetailSpec) => {
  const m = menuFor(path);
  if (m) m.detail = spec;
};

attach(['ip', 'address'], {
  legend: 'Flags: X - disabled, I - invalid, D - dynamic; S - slave',
  flagW: 2,
  props: (e) => pick(e, ['address', 'network', 'interface', 'actual-interface']),
});

attach(['ip', 'route'], {
  legend: 'Flags: D - dynamic; X - disabled, I - inactive, A - active;\nc - connect, s - static, r - rip, b - bgp, o - ospf, i - is-is, d - dhcp, v - vpn, m - modem, y - bgp-mpls-vpn;\nH - hw-offloaded; + - ecmp',
  flagW: 5,
  flags: (e) => ' ' + e.flags,
  props: (e) => without(e, ['comment', 'active', 'disabled']),
});

attach(['ip', 'service'], {
  legend: 'Flags: X - disabled, I - invalid',
  flagW: 1,
  quote: ['name'],
  props: (e) => pick(e, ['name', 'port', 'address', 'certificate', 'tls-version', 'vrf', 'max-sessions']),
});

attach(['interface'], {
  legend: 'Flags: D - dynamic; X - disabled; I - inactive, R - running; S - slave;\nP - passthrough',
  flagW: 5,
  // slots: dynamic/disabled, then running, then slave
  flags: (e) => `${e.flags.includes('X') ? ' X' : '  '}${e.flags.includes('R') ? 'R' : ' '}${e.flags.includes('S') ? 'S' : ' '}`.replace(/^ {2}/, e.flags.includes('X') ? ' X' : '  '),
  quote: ['name', 'default-name', 'type'],
  props: (e) => without(e, ['comment', 'disabled']),
});

attach(['interface', 'bridge'], {
  legend: 'Flags: X - disabled, R - running',
  flagW: 1,
  quote: ['name'],
  props: (e) => without(e, ['comment', 'disabled']),
});

attach(['interface', 'vlan'], {
  legend: 'Flags: X - disabled, R - running',
  flagW: 1,
  quote: ['name'],
  props: (e) => without(e, ['comment', 'disabled']),
});

attach(['interface', 'bridge', 'port'], {
  legend: 'Flags: X - disabled, I - inactive; D - dynamic; H - hw-offload',
  flagW: 3,
  props: (e) => without(e, ['comment', 'disabled']),
});

attach(['interface', 'bridge', 'vlan'], {
  legend: 'Flags: X - disabled, D - dynamic',
  flagW: 1,
  props: (e) => without(e, ['comment', 'disabled', 'dynamic']),
});

attach(['ip', 'pool'], {
  legend: '',
  flagW: 0,
  noFlags: true,
  quote: ['name'],
  props: (e) => without(e, ['comment', 'disabled']),
});

attach(['ip', 'dhcp-server'], {
  legend: 'Flags: D - dynamic; X - disabled, I - invalid',
  flagW: 2,
  flags: (e) => (e.flags ? ' ' + e.flags : ''),
  quote: ['name'],
  props: (e) => without(e, ['comment', 'disabled']),
});

attach(['ip', 'dhcp-server', 'network'], {
  legend: 'Flags: D - dynamic',
  flagW: 1,
  props: (e) => [...without(e, ['comment', 'disabled']), ['wins-server', ''], ['ntp-server', ''], ['caps-manager', ''], ['dhcp-option', '']],
});

const bridge = menuFor(['interface', 'bridge']);
if (bridge) bridge.emptyLegend = 'Flags: X - disabled, R - running';
