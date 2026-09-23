import { CliError, registerTool, type Args } from './cli';
import type { Device } from './device';
import { exportConfig } from './export';
import { fmtTime, formatIPv4, parseIPv4 } from './ip';
import type { ErrorKind, PingReply } from './network';

const num = (a: Args, key: string, dflt: number): number => {
  const v = a.named[key]?.value;
  if (v === undefined) return dflt;
  if (!/^\d+$/.test(v)) throw new CliError(`invalid value for argument ${key}`);
  return Number(v);
};

function target(a: Args): number {
  const text = a.bare[0]?.text ?? a.named.address?.value;
  if (!text) throw new CliError('missing value(s) of argument(s) address');
  const ip = parseIPv4(text);
  if (ip === null) {
    throw new CliError('invalid value for argument address:\n    invalid value of mac-address, mac address required\n    invalid value for argument ipv6-address\n    failure: dns name exists, but no appropriate record');
  }
  return ip;
}

const STATUS: Record<ErrorKind, string> = {
  'net-unreachable': 'net unreachable',
  'host-unreachable': 'host unreachable',
  'ttl-exceeded': 'ttl exceeded',
  'admin-prohibited': 'admin prohibited',
};

/** The STATUS column is 12 wide; longer texts are cut like "net unrea...". */
const cut = (s: string) => (s.length > 12 ? `${s.slice(0, 9)}...` : s);

const pingRow = (seq: number, host: string, size: string, ttl: string, time: string, status: string) =>
  `${String(seq).padStart(5)} ${host.padEnd(41)}${size.padStart(4)} ${ttl.padStart(3)} ${time.padEnd(10)} ${status.padEnd(12)}`;

export function pingLines(d: Device, dst: number, opts: { count: number; size: number; ttl: number; srcAddress: number | null }): string {
  const net = d.net!;
  const lines = [`${'SEQ'.padStart(5)} ${'HOST'.padEnd(41)}${'SIZE'.padStart(4)} ${'TTL'.padStart(3)} ${'TIME'.padEnd(10)} ${'STATUS'.padEnd(12)}`];
  const times: number[] = [];
  const host = formatIPv4(dst);
  for (let seq = 0; seq < opts.count; seq++) {
    const r: PingReply = net.pingOnce(d, dst, { srcAddress: opts.srcAddress, ttl: opts.ttl, size: opts.size });
    if (r.status === 'reply') {
      times.push(r.us);
      lines.push(pingRow(seq, host, String(r.size), String(r.ttl), fmtTime(r.us), ''));
    } else if (r.status === 'error') lines.push(pingRow(seq, formatIPv4(r.from), '84', '64', fmtTime(300 + seq * 13), cut(STATUS[r.err])));
    else if (r.status === 'no-route') lines.push(pingRow(seq, '', '', '', '', cut('no route to host')));
    else lines.push(pingRow(seq, host, '', '', '', 'timeout'));
  }
  const loss = Math.round(((opts.count - times.length) / opts.count) * 100);
  let sum = `sent=${opts.count} received=${times.length} packet-loss=${loss}%`;
  if (times.length) {
    const avg = Math.round(times.reduce((a, b) => a + b, 0) / times.length);
    const a = `${sum} min-rtt=${fmtTime(Math.min(...times))} avg-rtt=${fmtTime(avg)}`;
    const mx = `max-rtt=${fmtTime(Math.max(...times))}`;
    sum = `    ${a} ${mx}`.length > 80 ? `    ${a} \n   ${mx}` : `    ${a} ${mx}`;
  } else sum = `    ${sum}`;
  lines.push(sum);
  return lines.join('\n');
}

export function execPing(d: Device, a: Args): string {
  const dst = target(a);
    const src = a.named['src-address']?.value;
    const srcIp = src ? parseIPv4(src) : null;
    if (src && srcIp === null) throw new CliError('invalid value for argument src-address');
    return pingLines(d, dst, { count: num(a, 'count', 4), size: num(a, 'size', 56), ttl: num(a, 'ttl', 64), srcAddress: srcIp });
}

registerTool({
  path: ['ping'],
  run: execPing,
});

// ---------- traceroute ----------

const ms = (us: number) => `${(us / 1000).toFixed(1)}ms`;
const dec = (us: number) => (us / 1000).toFixed(1);

export function tracerouteText(d: Device, dst: number, opts: { count: number; maxHops: number; srcAddress: number | null }): string {
  const rows = d.net!.traceroute(d, dst, opts);
  const dstText = formatIPv4(dst);
  const cells = rows.map((r) => {
    if (!r.us.length) return { address: r.address ?? '', loss: `${r.loss}%`, sent: String(r.sent), last: 'timeout', avg: '', best: '', worst: '', sd: '' };
    const avg = r.us.reduce((x, y) => x + y, 0) / r.us.length;
    const sd = Math.sqrt(r.us.reduce((x, y) => x + (y - avg) ** 2, 0) / r.us.length);
    return { address: r.address ?? '', loss: `${r.loss}%`, sent: String(r.sent), last: ms(r.us[r.us.length - 1]), avg: dec(avg), best: dec(Math.min(...r.us)), worst: dec(Math.max(...r.us)), sd: sd < 50 ? '0' : dec(sd) };
  });
  // a destination that never answers keeps timing out until max-hops, like the real tool
  if (!rows.length) return `no route to ${dstText}`;
  const w = {
    address: Math.max(7, ...cells.map((c) => c.address.length)),
    loss: Math.max(4, ...cells.map((c) => c.loss.length)),
    sent: Math.max(4, ...cells.map((c) => c.sent.length)),
    last: Math.max(4, ...cells.map((c) => c.last.length)),
    avg: Math.max(3, ...cells.map((c) => c.avg.length)),
    best: Math.max(4, ...cells.map((c) => c.best.length)),
    worst: Math.max(5, ...cells.map((c) => c.worst.length)),
    sd: Math.max(7, ...cells.map((c) => c.sd.length)),
  };
  const line = (idx: string, c: { address: string; loss: string; sent: string; last: string; avg: string; best: string; worst: string; sd: string }) =>
    `${idx.padEnd(2)} ${c.address.padEnd(w.address)}  ${c.loss.padEnd(w.loss)}  ${c.sent.padStart(w.sent)}  ${c.last.padEnd(w.last)}  ${c.avg.padEnd(w.avg)}  ${c.best.padEnd(w.best)}  ${c.worst.padEnd(w.worst)}  ${c.sd.padStart(w.sd)}`.replace(/\s+$/, '');
  return [
    'Columns: ADDRESS, LOSS, SENT, LAST, AVG, BEST, WORST, STD-DEV',
    line('#', { address: 'ADDRESS', loss: 'LOSS', sent: 'SENT', last: 'LAST', avg: 'AVG', best: 'BEST', worst: 'WORST', sd: 'STD-DEV' }),
    ...cells.map((c, i) => line(String(i + 1), c)),
  ].join('\n');
}

registerTool({
  path: ['tool', 'traceroute'],
  run(d, a) {
    const dst = target(a);
    const src = a.named['src-address']?.value;
    const srcIp = src ? parseIPv4(src) : null;
    if (src && srcIp === null) throw new CliError('invalid value for argument src-address');
    return tracerouteText(d, dst, { count: num(a, 'count', 3), maxHops: num(a, 'max-hops', 30), srcAddress: srcIp });
  },
});

// ---------- fetch (TCP reachability, for port forwarding labs) ----------

registerTool({
  path: ['tool', 'fetch'],
  run(d, a) {
    const url = a.named.url?.value;
    if (!url) throw new CliError('missing value(s) of argument(s) url');
    const m = /^https?:\/\/(\d{1,3}(?:\.\d{1,3}){3})(?::(\d+))?(\/.*)?$/.exec(url);
    if (!m) throw new CliError('failure: only http://a.b.c.d[:port]/ addresses work in the simulator');
    const ip = parseIPv4(m[1]);
    if (ip === null) throw new CliError('invalid value for argument url');
    const port = m[2] ? Number(m[2]) : url.startsWith('https') ? 443 : 80;
    const r = d.net!.tcpConnect(d, ip, port);
    const head = '  status: connecting';
    if (r === 'connected') return `${head}\n\n      status: finished\n  downloaded: 2KiB\n       total: 2KiB\n    duration: 1s`;
    if (r === 'refused') return `${head}\n\n      status: failed\n\nfailure: Connection refused`;
    return `${head}\n\n      status: failed\n\nfailure: Idle timeout - connecting`;
  },
});

// ---------- export ----------

registerTool({
  path: ['export'],
  run(d, args) {
    return exportConfig(d, [], args.flags.has('terse'));
  },
});
