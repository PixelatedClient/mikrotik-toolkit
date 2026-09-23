import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { LABS, type Lab } from '../src/data/labs';
import { calcSubnet, parseIPv4 } from '../src/lib/subnet';

const ROOT = join(__dirname, '..');
const read = (lab: Lab, file: string) => readFileSync(join(ROOT, 'public/labs', lab.id, file), 'utf8').replace(/\r\n/g, '\n');

interface Parsed {
  node: string;
  text: string;
  lines: string[];
  addrs: { ip: string; cidr: number; iface: string; net: string }[];
  created: Set<string>;
  /** Interfaces enslaved to a bridge: they carry frames, not IP addresses. */
  bridgePorts: Set<string>;
}

function parse(lab: Lab, nodeId: string): Parsed {
  const node = lab.nodes.find((n) => n.id === nodeId)!;
  const text = read(lab, node.file!);
  const lines = text.split('\n');
  const addrs = [...text.matchAll(/^\/ip address add address=(\d+\.\d+\.\d+\.\d+)\/(\d+) interface=(\S+)/gm)].map((m) => {
    const info = calcSubnet(`${m[1]}/${m[2]}`)!;
    return { ip: m[1], cidr: Number(m[2]), iface: m[3], net: `${info.network}/${info.cidr}` };
  });
  const created = new Set([...text.matchAll(/^\/interface (?:bridge|vlan|wireguard) add name=(\S+)/gm)].map((m) => m[1]));
  const bridgePorts = new Set([...text.matchAll(/^\/interface bridge port add .*?interface=(\S+)/gm)].map((m) => m[1]));
  return { node: nodeId, text, lines, addrs, created, bridgePorts };
}

const attr = (line: string, key: string) => line.match(new RegExp(`(?:^|\\s)${key.replace('.', '\\.')}=("[^"]*"|\\S+)`))?.[1]?.replace(/"/g, '');

describe.each(LABS)('lab $id', (lab) => {
  const routers = lab.nodes.filter((n) => n.file);
  const parsed = Object.fromEntries(routers.map((n) => [n.id, parse(lab, n.id)]));

  it('has content a learner can act on', () => {
    expect(lab.objectives.length).toBeGreaterThanOrEqual(2);
    expect(lab.setup.length).toBeGreaterThanOrEqual(2);
    expect(lab.tasks.length).toBeGreaterThanOrEqual(4);
    expect(lab.verify.length).toBeGreaterThanOrEqual(3);
    for (const v of lab.verify) {
      expect(lab.nodes.some((n) => n.id === v.node), `verify node ${v.node}`).toBe(true);
      expect(v.cmd.startsWith('/')).toBe(true);
    }
  });

  it('diagram data is sane', () => {
    const ids = lab.nodes.map((n) => n.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const n of lab.nodes) {
      expect(n.x).toBeGreaterThanOrEqual(30);
      expect(n.x).toBeLessThanOrEqual(610);
      expect(n.y).toBeGreaterThanOrEqual(30);
      expect(n.y).toBeLessThanOrEqual(230);
    }
    for (const l of lab.links) {
      expect(ids).toContain(l.a);
      expect(ids).toContain(l.b);
      expect(l.a).not.toBe(l.b);
    }
    // an interface is cabled at most once per node
    const used = new Set<string>();
    for (const l of lab.links) for (const end of [`${l.a}.${l.ai}`, `${l.b}.${l.bi}`]) {
      expect(used.has(end), `${end} cabled twice`).toBe(false);
      used.add(end);
    }
  });

  it('every config file exists, and none are orphaned', () => {
    for (const n of routers) expect(existsSync(join(ROOT, 'public/labs', lab.id, n.file!)), n.file).toBe(true);
    const onDisk = readdirSync(join(ROOT, 'public/labs', lab.id)).sort();
    expect(onDisk).toEqual(routers.map((n) => n.file!).sort());
  });

  it('config lines are well formed and identity matches the diagram label', () => {
    for (const p of Object.values(parsed)) {
      for (const line of p.lines) {
        expect(line === '' || line.startsWith('#') || line.startsWith('/'), `${p.node}: ${line}`).toBe(true);
        expect((line.match(/"/g) ?? []).length % 2, `${p.node}: quotes in ${line}`).toBe(0);
        expect(line).not.toMatch(/\s$/);
      }
      expect(p.text).toContain(`/system identity set name=${p.node}`);
    }
  });

  it('cabled router interfaces are addressed on a shared subnet with distinct hosts', () => {
    for (const l of lab.links) {
      const a = parsed[l.a];
      const b = parsed[l.b];
      const bridged = a && b && a.bridgePorts.has(l.ai) && b.bridgePorts.has(l.bi); // switch to switch: frames, no IPs
      if (a && b && !l.net?.startsWith('trunk') && !bridged) {
        const ea = a.addrs.find((x) => x.iface === l.ai);
        const eb = b.addrs.find((x) => x.iface === l.bi);
        expect(ea, `${l.a}.${l.ai} needs an address`).toBeTruthy();
        expect(eb, `${l.b}.${l.bi} needs an address`).toBeTruthy();
        expect(ea!.net, `${l.a}-${l.b} subnet`).toBe(eb!.net);
        expect(ea!.ip).not.toBe(eb!.ip);
      }
    }
  });

  it('addresses sit on real interfaces and no IP is used twice in the lab', () => {
    const seen = new Map<string, string>();
    for (const p of Object.values(parsed)) {
      const cabled = new Set(lab.links.flatMap((l) => [l.a === p.node ? l.ai : null, l.b === p.node ? l.bi : null]).filter(Boolean));
      for (const a of p.addrs) {
        expect(cabled.has(a.iface) || p.created.has(a.iface), `${p.node}: ${a.iface} is neither cabled nor created`).toBe(true);
        expect(seen.has(a.ip), `${a.ip} on both ${seen.get(a.ip)} and ${p.node}`).toBe(false);
        seen.set(a.ip, p.node);
      }
    }
  });

  it('static route gateways are directly reachable', () => {
    for (const p of Object.values(parsed)) {
      for (const m of p.text.matchAll(/^\/ip route add .*?gateway=(\d+\.\d+\.\d+\.\d+)/gm)) {
        const gw = m[1];
        const ok = p.addrs.some((a) => calcSubnet(`${gw}/${a.cidr}`)!.network === a.net.split('/')[0] && a.ip !== gw);
        expect(ok, `${p.node}: gateway ${gw} not on a connected subnet`).toBe(true);
      }
    }
  });

  it('OSPF templates only cover networks the router really has', () => {
    for (const p of Object.values(parsed)) {
      for (const m of p.text.matchAll(/^\/routing ospf interface-template add .*networks=(\S+)/gm)) {
        expect(p.addrs.some((a) => a.net === m[1]), `${p.node}: ${m[1]}`).toBe(true);
      }
      if (p.text.includes('/routing ospf instance add')) {
        const rid = attr(p.text.match(/^\/routing ospf instance add .*$/m)![0], 'router-id')!;
        expect(p.addrs.some((a) => a.ip === rid), `${p.node}: router-id ${rid} should be a local loopback`).toBe(true);
      }
    }
  });

  it('BGP sessions are reciprocal with matching AS numbers and defined filters', () => {
    // RouterOS 7.16-7.19: AS number and router ID live on a BGP template that each connection references (verified on a 7.16 CHR).
    const conns = Object.values(parsed).flatMap((p) => {
      const instances = new Map(
        p.lines.filter((l) => l.startsWith('/routing bgp template add')).map((l) => [attr(l, 'name')!, l] as const),
      );
      return p.lines.filter((l) => l.startsWith('/routing bgp connection add')).map((line) => {
        const instName = attr(line, 'templates')!;
        const inst = instances.get(instName);
        expect(inst, `${p.node}: connection references undefined template ${instName}`).toBeTruthy();
        return {
          node: p.node, as: Number(attr(inst!, 'as')), rid: attr(inst!, 'router-id')!, local: attr(line, 'local.address')!,
          remote: attr(line, 'remote.address')!, remoteAs: Number(attr(line, 'remote.as')), line, p,
        };
      });
    });
    for (const c of conns) {
      expect(c.p.addrs.some((a) => a.ip === c.local), `${c.node}: local ${c.local}`).toBe(true);
      expect(c.line).toContain('local.role=ebgp');
      expect(parseIPv4(c.rid)).not.toBeNull();
      const peer = conns.find((x) => x.node !== c.node && x.local === c.remote && x.remote === c.local);
      expect(peer, `${c.node} -> ${c.remote} has no matching peer`).toBeTruthy();
      expect(peer!.as, `${c.node}: remote.as`).toBe(c.remoteAs);
      expect(peer!.remoteAs, `${peer!.node}: remote.as`).toBe(c.as);
      expect(c.as).not.toBe(c.remoteAs);
      for (const key of ['input.filter', 'output.filter-chain']) {
        const chain = attr(c.line, key);
        if (chain) expect(c.p.text, `${c.node}: chain ${chain}`).toContain(`/routing filter rule add chain=${chain} `);
      }
      const list = attr(c.line, 'output.network');
      if (list) expect(c.p.text, `${c.node}: address-list ${list}`).toContain(`/ip firewall address-list add list=${list} `);
    }
    // every router agrees on a single AS number
    for (const p of Object.values(parsed)) {
      const asns = new Set(conns.filter((c) => c.node === p.node).map((c) => c.as));
      expect(asns.size).toBeLessThanOrEqual(1);
    }
  });

  it('WireGuard peer instructions point at the other end', () => {
    const wg = routers.filter((n) => parsed[n.id].text.includes('/interface wireguard add'));
    if (wg.length === 0) return;
    expect(wg.length).toBe(2);
    const [a, b] = wg.map((n) => parsed[n.id]);
    const cmd = (p: Parsed) => p.text.match(/^# \/interface wireguard peers add .*$/m)![0];
    const port = (p: Parsed) => attr(p.text.match(/^\/interface wireguard add .*$/m)![0], 'listen-port')!;
    expect(port(a)).toBe(port(b));
    const tun = (p: Parsed) => p.addrs.find((x) => x.iface === 'wg0')!;
    const wan = (p: Parsed) => p.addrs.find((x) => /^(198\.51|203\.0)/.test(x.ip))!;
    const lan = (p: Parsed) => p.addrs.find((x) => x.iface === 'ether2')!;
    for (const [me, other] of [[a, b], [b, a]] as [Parsed, Parsed][]) {
      const c = cmd(me);
      expect(attr(c, 'endpoint-address')).toBe(wan(other).ip);
      expect(attr(c, 'endpoint-port')).toBe(port(other));
      expect(attr(c, 'allowed-address')).toBe(`${tun(other).ip}/32,${lan(other).net}`);
      expect(tun(me).net).toBe(tun(other).net);
      expect(me.text).toContain(`/ip route add dst-address=${lan(other).net} gateway=wg0`);
    }
  });

  it('related links resolve', () => {
    const tools = new Set(['/tools/vlan-designer', '/tools/stp-lab', '/tools/bgp-lab', '/tools/subnet-trainer', '/tools/subnet-calculator', '/tools/mikrotik-config-generator']);
    for (const r of lab.related) {
      if (r.href.startsWith('/learn/')) {
        expect(existsSync(join(ROOT, 'src/content/courses', r.href.replace('/learn/', '') + '.mdx')), r.href).toBe(true);
      } else expect(tools.has(r.href), r.href).toBe(true);
    }
  });
});

describe('lab catalogue', () => {
  it('has unique ids and at least six labs', () => {
    expect(new Set(LABS.map((l) => l.id)).size).toBe(LABS.length);
    expect(LABS.length).toBeGreaterThanOrEqual(6);
  });
  it('the three-router lab matches the lesson', () => {
    const lesson = readFileSync(join(ROOT, 'src/content/courses/foundations/03-your-first-router.mdx'), 'utf8');
    for (const s of ['10.0.12.0/30', '10.0.23.0/30', '192.168.1.0/24', '192.168.3.0/24']) expect(lesson).toContain(s);
  });
  it('the VLAN lab follows the designer addressing plan', () => {
    const r1 = readFileSync(join(ROOT, 'public/labs/inter-vlan-routing/R1.rsc'), 'utf8');
    for (const s of ['10.0.10.1/24', '10.0.20.1/24', '10.0.99.1/24']) expect(r1).toContain(s);
  });
});
