/** Mask what legitimately differs run to run: timings, MACs, uptimes. */
export const mask = (s) =>
  s
    .replace(/\r/g, '')
    .replace(/^# \d{4}-\d\d-\d\d \d\d:\d\d:\d\d by/gm, '# <date> by')
    // the harness routers keep a DHCP client on the management port; the simulator has none
    .replace(/^\/ip dhcp-client\nadd add-default-route=no interface=ether8\n/gm, '')
    .replace(/^\/ip dhcp-client add add-default-route=no interface=ether8\n/gm, '')
    // known, documented difference: the simulator never shows the hardware-offload flag
    .replace('; H - HW-OFFLOADED', '')
    .replace(/^( *\d*\s*[A-Za-z]*?)H( )/gm, '$1$2')
    .replace(/^( *dynamic-servers:).*$/gm, '$1')
    .replace(/^( *cache-used:).*$/gm, '$1')
    // WireGuard key pairs are randomly generated (real crypto keys vs the simulator's fake ones) and peer names
    // auto-number from a per-router counter that keeps climbing across scenario runs
    .replace(/[A-Za-z0-9+/]{42,44}=/g, '<KEY>')
    .replace(/name="?peer\d+"?/g, 'name="peer<N>"')
    // leftover router state from earlier sessions on the harness routers, never written by our export
    .replace(/\/tool mac-server\nset allowed-interface-list=\S+\n/g, '')
    .replace(/\/tool mac-server mac-winbox\nset allowed-interface-list=\S+\n/g, '')
    .replace(/\/tool sniffer\nset filter-interface=\S+ filter-ip-protocol=\S+ memory-limit=\S+\n?/g, '')
    .replace(/state-changes=\d+ adjacency=\S+ timeout=\S+/g, 'state-changes=<N> adjacency=<A> timeout=<A>')
    .replace(/\d{4}-\d\d-\d\d \d\d:\d\d:\d\d/g, '<DATETIME>')
    .replace(/\d+(?:ms|us)(?:\d+us)?/g, '<T>')
    .replace(/\b(?:[0-9A-F]{2}:){5}[0-9A-F]{2}\b/gi, '<MAC>')
    .replace(/\b\d+[wdh]\d*[hms]?\d*[ms]?\d*s?\b/g, '<UP>')
    .split('\n')
    .map((l) => l.replace(/\s+$/, ''))
    .join('\n')
    .replace(/\n+$/, '');
/** Detail prints wrap at the terminal width, so compare them as one stream of words. */
export const squeezeAll = (s) => s.replace(/\s+/g, ' ').trim();
/** Items in a `where` print keep their position in the full table on a real router; do not compare row numbers. */
export const unindex = (s) => s.replace(/^( *)\d+( )/gm, '$1#$2');
/** Link up/down timestamps depend on cabling history. */
export const nolinktime = (s) => s.replace(/\s?last-link-(?:up|down)-time=<DATETIME>/g, '').replace(/\s?link-downs=\d+/g, '');
/** The comparison applied to one command's output. */
export const same = (cmd, a, b) => {
  let x = squeeze(mask(a)), y = squeeze(mask(b));
  if (/ where /.test(cmd)) { x = unindex(x); y = unindex(y); }
  if (/ traceroute/.test(cmd)) { x = x.replace(/\d+\.<T>/g, '<f>').replace(/\d+\.\d/g, '<f>'); y = y.replace(/\d+\.<T>/g, '<f>').replace(/\d+\.\d/g, '<f>'); }
  if (/ detail/.test(cmd)) { x = squeezeAll(x); y = squeezeAll(y); }
  if (/ detail| terse/.test(cmd)) { x = nolinktime(x); y = nolinktime(y); }
  return x === y;
};
export const squeeze = (s) => s.replace(/[ \t]+/g, ' ').replace(/ ?\n ?/g, '\n');

