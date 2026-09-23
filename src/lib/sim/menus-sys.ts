/**
 * System-level read-only commands: /system resource|clock|package, /user, /ip dns, /tool ping.
 * Layouts were captured from RouterOS 7.16 (CHR); values that change on a real router (uptime, memory, load)
 * are plausible constants here.
 */
import { CliError, registerTool, type Args } from './cli';
import type { Device } from './device';
import { execPing } from './commands';
import { renderTable, type Row } from './table';

/** RouterOS key/value block: keys right-aligned to the longest key plus two, blank line at the end. */
function kv(pairs: [string, string][]): string {
  const w = Math.max(...pairs.map(([k]) => k.length)) + 2;
  return pairs.map(([k, v]) => `${k.padStart(w)}: ${v}`.replace(/ +$/, ' ')).join('\n') + '\n';
}

const wantsPrint = (a: Args) => !a.bare.length || a.bare[0].text === 'print';

registerTool({
  path: ['system', 'resource'],
  run(_d, a) {
    if (!wantsPrint(a)) throw new CliError(`bad command name ${a.bare[0].text} (line 1 column ${a.bare[0].start + 1})`);
    return kv([
      ['uptime', '1h4m12s'], ['version', '7.16 (stable)'], ['build-time', '2024-09-20 13:00:27'], ['factory-software', '7.1'],
      ['free-memory', '168.5MiB'], ['total-memory', '384.0MiB'], ['cpu', 'QEMU'], ['cpu-count', '1'], ['cpu-frequency', '2611MHz'],
      ['cpu-load', '1%'], ['free-hdd-space', '71.2MiB'], ['total-hdd-space', '89.2MiB'], ['write-sect-since-reboot', '1712'],
      ['write-sect-total', '1712'], ['architecture-name', 'x86_64'], ['board-name', 'CHR QEMU Standard PC (i440FX + PIIX, 1996)'],
      ['platform', 'MikroTik'],
    ]);
  },
});

registerTool({
  path: ['system', 'clock'],
  run(_d, a) {
    if (!wantsPrint(a)) throw new CliError(`bad command name ${a.bare[0].text} (line 1 column ${a.bare[0].start + 1})`);
    const t = new Date();
    const p = (n: number) => String(n).padStart(2, '0');
    return kv([
      ['time', `${p(t.getHours())}:${p(t.getMinutes())}:${p(t.getSeconds())}`],
      ['date', `${t.getFullYear()}-${p(t.getMonth() + 1)}-${p(t.getDate())}`],
      ['time-zone-autodetect', 'yes'], ['time-zone-name', 'manual'], ['gmt-offset', '+00:00'], ['dst-active', 'no'],
    ]);
  },
});

registerTool({
  path: ['system', 'package'],
  run(_d, a) {
    if (!wantsPrint(a)) throw new CliError(`bad command name ${a.bare[0].text} (line 1 column ${a.bare[0].start + 1})`);
    const rows: Row[] = [{ index: 0, flags: '', cells: ['routeros', '7.16', '2024-09-20 13:00:27', '17.8MiB'] }];
    return renderTable([{ title: 'NAME' }, { title: 'VERSION' }, { title: 'BUILD-TIME' }, { title: 'SIZE' }], rows, []) + '\n';
  },
});

registerTool({
  path: ['user'],
  run(_d, a) {
    if (!wantsPrint(a)) throw new CliError(`bad command name ${a.bare[0].text} (line 1 column ${a.bare[0].start + 1})`);
    const rows: Row[] = [{ index: 0, flags: '', cells: ['admin', 'full', '2026-01-01 00:00:00', 'none'], comment: 'system default user' }];
    return renderTable([{ title: 'NAME' }, { title: 'GROUP' }, { title: 'LAST-LOGGED-IN' }, { title: 'INACTIVITY-POLICY' }], rows, []) + '\n';
  },
});

// ----- /ip dns -----

registerTool({
  path: ['ip', 'dns'],
  run(d: Device, a) {
    if (a.bare[0]?.text === 'set') {
      for (const [k, v] of Object.entries(a.named)) {
        if (k === 'servers') d.dns.servers = v.value;
        else if (k === 'allow-remote-requests') {
          if (v.value !== 'yes' && v.value !== 'no') throw new CliError(`invalid value for argument allow-remote-requests`);
          d.dns.allowRemoteRequests = v.value === 'yes';
        } else throw new CliError(`expected end of command (line 1 column ${v.col - k.length})`);
      }
      return '';
    }
    if (!wantsPrint(a)) throw new CliError(`bad command name ${a.bare[0].text} (line 1 column ${a.bare[0].start + 1})`);
    return kv([
      ['servers', d.dns.servers], ['dynamic-servers', ''], ['use-doh-server', ''], ['verify-doh-cert', 'no'],
      ['doh-max-server-connections', '5'], ['doh-max-concurrent-queries', '50'], ['doh-timeout', '5s'],
      ['allow-remote-requests', d.dns.allowRemoteRequests ? 'yes' : 'no'], ['max-udp-packet-size', '4096'],
      ['query-server-timeout', '2s'], ['query-total-timeout', '10s'], ['max-concurrent-queries', '100'],
      ['max-concurrent-tcp-sessions', '20'], ['cache-size', '2048KiB'], ['cache-max-ttl', '1w'],
      ['address-list-extra-time', '0s'], ['vrf', 'main'], ['mdns-repeat-ifaces', ''], ['cache-used', '20KiB'],
    ]);
  },
});

registerTool({
  path: ['tool', 'ping'],
  run(d, a) {
    return execPing(d, a);
  },
});
