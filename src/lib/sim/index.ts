import './commands';
import './menus-l2';
import './menus-sys';
import './menus-lists';
import './menus-ospf';
import './menus-bgp';
import './menus-wireguard';
import './detail';
import { CliError, completions, execLine, type ExecResult } from './cli';
import type { Device } from './device';
import { formatIPv4, maskOf, parseCidr, parseIPv4 } from './ip';

export { Device } from './device';
export { Network } from './network';
export { SUPPORTED } from './cli';
export { formatIPv4, parseIPv4 };

/** `[admin@R1] /ip address> ` for routers, `PC1> ` for hosts. */
export function prompt(dev: Device, ctx: string[]): string {
  if (dev.kind === 'pc') return `${dev.id}> `;
  return `[admin@${dev.identity}] ${ctx.length ? '/' + ctx.join(' ') : ''}${ctx.length ? '> ' : '> '}`;
}

// ---------- VPCS style host commands ----------

const dotted = (cidr: number) => formatIPv4(maskOf(cidr));

function pcExec(dev: Device, line: string): ExecResult {
  const [cmd, ...rest] = line.trim().split(/\s+/);
  const done = (output: string): ExecResult => ({ output, ctx: [] });
  const c = cmd?.toLowerCase() ?? '';
  if (!c) return done('');

  if (c === 'ip') {
    if (rest[0] === 'dhcp') return pcExec(dev, 'dhcp');
    const cidr = parseCidr(rest[0] ?? '');
    if (!cidr || !rest[0]?.includes('/')) {
      const ip = rest[0] ? parseIPv4(rest[0]) : null;
      if (ip === null) return done('Usage: ip <address>/<prefix> [gateway]   e.g. ip 192.168.1.10/24 192.168.1.1');
      dev.pc = { ip: rest[0], cidr: 24, gateway: rest[1] ?? null };
    } else {
      const [ip] = rest[0].split('/');
      dev.pc = { ip, cidr: cidr.cidr, gateway: rest[1] ?? null };
    }
    const gw = dev.pc.gateway ? ` gateway ${dev.pc.gateway}` : '';
    return done(`Checking for duplicate address...\n${dev.id} : ${dev.pc.ip} ${dotted(dev.pc.cidr)}${gw}`);
  }
  if (c === 'dhcp') {
    const lease = dev.net!.dhcpDiscover(dev);
    if (!lease) return done("Can't find dhcp server");
    dev.pc = { ip: lease.ip, cidr: lease.cidr, gateway: lease.gateway };
    return done(`DORA IP ${lease.ip}/${lease.cidr}${lease.gateway ? ` GW ${lease.gateway}` : ''}`);
  }
  if (c === 'clear' && rest[0] === 'ip') { dev.pc = { ip: null, cidr: 24, gateway: null }; return done(''); }
  if (c === 'show' && (rest[0] === 'ip' || rest.length === 0)) {
    const p = dev.pc;
    if (!p.ip) return done(`NAME        : ${dev.id}[1]\nIP/MASK     : 0.0.0.0/0\nGATEWAY     : 0.0.0.0`);
    return done(`NAME        : ${dev.id}[1]\nIP/MASK     : ${p.ip}/${p.cidr}\nGATEWAY     : ${p.gateway ?? '0.0.0.0'}\nMAC         : ${dev.iface('eth0')!.mac.toLowerCase()}`);
  }
  if (c === 'ping' || c === 'trace') {
    const dstText = rest[0];
    const dst = dstText ? parseIPv4(dstText) : null;
    if (dst === null) return done(`Usage: ${c} <ip address>`);
    if (!dev.pc.ip) return done('No IP address configured. Use: ip <address>/<prefix> <gateway>');
    const net = dev.net!;
    if (c === 'ping') {
      const lines: string[] = [];
      for (let i = 1; i <= 5; i++) {
        const r = net.pingOnce(dev, dst);
        if (r.status === 'reply') lines.push(`84 bytes from ${dstText} icmp_seq=${i} ttl=${r.ttl} time=${(r.us / 1000).toFixed(3)} ms`);
        else if (r.status === 'no-route') { lines.push(`host (${dev.pc.gateway ?? dstText}) not reachable`); break; }
        else if (r.status === 'error') lines.push(`${formatIPv4(r.from)} icmp_seq=${i} ${r.err === 'ttl-exceeded' ? 'ttl exceeded' : r.err === 'host-unreachable' ? 'host unreachable' : 'destination net unreachable'}`);
        else lines.push(`${dstText} icmp_seq=${i} timeout`);
      }
      return done(lines.join('\n'));
    }
    const rows = net.traceroute(dev, dst, { count: 1, maxHops: 8 });
    if (!rows.length) return done(`host (${dev.pc.gateway ?? dstText}) not reachable`);
    return done(`trace to ${dstText}, 8 hops max, press Ctrl+C to stop\n${rows.map((r, i) => ` ${i + 1}   ${r.address ?? '*'}${r.us.length ? `   ${(r.us[0] / 1000).toFixed(3)} ms` : ''}`).join('\n')}`);
  }
  if (c === 'help' || c === '?') return done('Commands: ip <address>/<prefix> <gateway>, ip dhcp (use dhcp), show ip, ping <address>, trace <address>, clear ip');
  return done(`*** command not found: ${line.trim()}. Type help.`);
}

/** Run one line typed into a device's terminal. */
export function runCommand(dev: Device, line: string, ctx: string[]): ExecResult {
  if (dev.kind === 'pc') return pcExec(dev, line);
  try {
    if (dev.net) dev.net.epoch++;
    const r = execLine(dev, line, ctx);
    if (dev.net) dev.net.epoch++;
    return r;
  } catch (e) {
    if (e instanceof CliError) return { output: e.message, ctx };
    throw e;
  }
}

export { completions };
