// src/lib/subnet.ts
function parseIPv4(s) {
  const parts = s.trim().split(".");
  if (parts.length !== 4) return null;
  let n = 0;
  for (const p of parts) {
    if (!/^\d{1,3}$/.test(p)) return null;
    const v = Number(p);
    if (v > 255) return null;
    n = n * 256 + v;
  }
  return n;
}
function formatIPv4(n) {
  return [n >>> 24, n >>> 16 & 255, n >>> 8 & 255, n & 255].join(".");
}

// src/lib/sim/ip.ts
var maskOf = (cidr) => cidr === 0 ? 0 : 4294967295 << 32 - cidr >>> 0;
function parseCidr(text) {
  const m = /^(\d{1,3}(?:\.\d{1,3}){3})(?:\/(\d{1,2}))?$/.exec(text.trim());
  if (!m) return null;
  const ip = parseIPv4(m[1]);
  const cidr = m[2] === void 0 ? 32 : Number(m[2]);
  if (ip === null || cidr < 0 || cidr > 32) return null;
  const mask = maskOf(cidr);
  return { ip, cidr, net: (ip & mask) >>> 0, mask };
}
var inNet = (ip, c) => (ip & c.mask) >>> 0 === c.net;
var netText = (c) => `${formatIPv4(c.net)}/${c.cidr}`;
function fmtTime(us) {
  if (us < 1e3) return `${us}us`;
  const ms2 = Math.floor(us / 1e3);
  const rest = us % 1e3;
  return rest === 0 ? `${ms2}ms` : `${ms2}ms${rest}us`;
}
function rng(seed) {
  let s = seed >>> 0 || 1;
  return () => {
    s = Math.imul(s, 1664525) + 1013904223 >>> 0;
    return s / 4294967296;
  };
}

// src/lib/sim/bgpFilter.ts
function evalCond(cond, ctx) {
  return cond.split("||").some((part) => {
    const c = part.trim();
    let m = /^dst\s*==\s*(\S+)$/.exec(c);
    if (m) {
      const n = parseCidr(m[1]);
      return !!n && n.net === ctx.dst.net && n.cidr === ctx.dst.cidr;
    }
    m = /^dst\s+in\s+(\S+)$/.exec(c);
    if (m) {
      const n = parseCidr(m[1]);
      return !!n && inNet(ctx.dst.ip, n);
    }
    m = /^dst-len\s*([<>]=?)\s*(\d+)$/.exec(c);
    if (m) {
      const v = Number(m[2]);
      if (m[1] === ">") return ctx.dst.cidr > v;
      if (m[1] === "<") return ctx.dst.cidr < v;
      if (m[1] === ">=") return ctx.dst.cidr >= v;
      return ctx.dst.cidr <= v;
    }
    m = /^bgp-communities\s+any\s+(\S+)$/.exec(c);
    if (m) return ctx.communities.includes(m[1]);
    return false;
  });
}
function splitStatements(src) {
  const out = [];
  let depth = 0, cur = "";
  for (const ch of src) {
    if (ch === "{") depth++;
    if (ch === "}") depth--;
    if (ch === ";" && depth === 0) {
      out.push(cur.trim());
      cur = "";
      continue;
    }
    cur += ch;
  }
  if (cur.trim()) out.push(cur.trim());
  return out;
}
function runOne(stmt, ctx) {
  const ifm = /^if\s*\((.*)\)\s*\{([\s\S]*)\}$/.exec(stmt);
  if (ifm) return evalCond(ifm[1], ctx) ? runBlock(ifm[2], ctx) : "continue";
  if (stmt === "accept") return "accept";
  if (stmt === "reject") return "reject";
  const setm = /^set\s+(\S+)\s+(.+)$/.exec(stmt);
  if (setm) {
    const [, prop, value] = setm;
    if (prop === "bgp-local-pref") ctx.attrs.localPref = Number(value);
    else if (prop === "bgp-path-prepend") ctx.attrs.prepend += Number(value);
    else if (prop === "bgp-communities") ctx.attrs.communities = value.split(",");
    return "continue";
  }
  return "continue";
}
function runBlock(src, ctx) {
  for (const stmt of splitStatements(src)) {
    const v = runOne(stmt, ctx);
    if (v !== "continue") return v;
  }
  return "continue";
}
function runChain(rules, chain, ctx) {
  for (const r of rules) {
    if (r.disabled || r.chain !== chain) continue;
    const v = runBlock(r.text, ctx);
    if (v !== "continue") return v;
  }
  return "reject";
}

// src/lib/sim/bgp.ts
var emptyBgp = () => ({ templates: [], connections: [], filters: [] });
var templateFor = (cfg, conn) => cfg.templates.find((t) => t.name === conn.templates && !t.disabled);
function sessionKey(a, ac, b, bc) {
  return [a + "/" + ac, b + "/" + bc].sort().join("~");
}
function computeBgp(net) {
  const routers = [...net.devices.values()].filter((d) => d.kind === "router");
  const sessions = /* @__PURE__ */ new Map();
  const seen = /* @__PURE__ */ new Set();
  for (const dev of routers) sessions.set(dev.id, []);
  for (const dev of routers) {
    for (const conn of dev.bgp.connections) {
      if (conn.disabled) continue;
      const tpl = templateFor(dev.bgp, conn);
      if (!tpl) continue;
      const myIp = parseIPv4(conn.localAddress);
      const peerIp = parseIPv4(conn.remoteAddress);
      if (myIp === null || peerIp === null) continue;
      for (const other of routers) {
        if (other.id === dev.id) continue;
        for (const oc of other.bgp.connections) {
          if (oc.disabled) continue;
          const otpl = templateFor(other.bgp, oc);
          if (!otpl) continue;
          if (parseIPv4(oc.localAddress) !== peerIp || parseIPv4(oc.remoteAddress) !== myIp) continue;
          if (otpl.as !== conn.remoteAs || tpl.as !== oc.remoteAs) continue;
          const key2 = sessionKey(dev.id, conn.name, other.id, oc.name);
          if (seen.has(key2)) continue;
          seen.add(key2);
          sessions.get(dev.id).push({ conn, template: tpl, peerDev: other, peerConn: oc, peerTemplate: otpl, established: true });
          sessions.get(other.id).push({ conn: oc, template: otpl, peerDev: dev, peerConn: conn, peerTemplate: tpl, established: true });
        }
      }
    }
  }
  const originated = (dev) => (dev.addressLists ?? []).filter((e) => !e.disabled && dev.bgp.connections.some((c) => c.outputNetwork === e.list)).map((e) => parseCidr(e.address.includes("/") ? e.address : e.address + "/32")).filter((c) => !!c);
  const bestByDev = /* @__PURE__ */ new Map();
  for (const dev of routers) bestByDev.set(dev.id, /* @__PURE__ */ new Map());
  const advertised = /* @__PURE__ */ new Map();
  for (const dev of routers) advertised.set(dev.id, /* @__PURE__ */ new Map());
  const originatedByDev = /* @__PURE__ */ new Map();
  for (const dev of routers) originatedByDev.set(dev.id, originated(dev));
  for (let round = 0; round < 4; round++) {
    for (const dev of routers) {
      const mine = originatedByDev.get(dev.id).map((dst) => ({ dst, localPref: 100, asPath: [] }));
      const learned = [...bestByDev.get(dev.id).values()].map((r) => ({ dst: r.dst, localPref: r.localPref, asPath: r.asPath }));
      const candidates = [...mine, ...learned];
      for (const sess of sessions.get(dev.id) ?? []) {
        const chain = sess.conn.outputFilterChain;
        const rules = dev.bgp.filters;
        const adverts = [];
        for (const c of candidates) {
          if (c.asPath.includes(sess.peerTemplate.as)) continue;
          const ctx = { dst: c.dst, communities: [], attrs: { prepend: 0, communities: [] } };
          const verdict = chain ? runChain(rules, chain, ctx) : "accept";
          if (verdict !== "accept") continue;
          const asPath = [...Array(ctx.attrs.prepend + 1).fill(sess.template.as), ...c.asPath];
          adverts.push({ dst: c.dst, nexthop: parseIPv4(sess.conn.localAddress), asPath });
        }
        advertised.get(dev.id).set(sess.conn.name + "-1", adverts);
      }
    }
    for (const dev of routers) {
      const best = bestByDev.get(dev.id);
      for (const sess of sessions.get(dev.id) ?? []) {
        const inbound = advertised.get(sess.peerDev.id)?.get(sess.peerConn.name + "-1") ?? [];
        for (const adv of inbound) {
          const ctx = { dst: adv.dst, communities: [], attrs: { localPref: 100, prepend: 0, communities: [] } };
          const chain = sess.conn.inputFilter;
          const verdict = chain ? runChain(dev.bgp.filters, chain, ctx) : "accept";
          if (verdict !== "accept") continue;
          const key2 = netText(adv.dst);
          const have = best.get(key2);
          const cand = { dst: adv.dst, localPref: ctx.attrs.localPref ?? 100, asPath: adv.asPath, from: sess };
          if (!have || cand.localPref > have.localPref || cand.localPref === have.localPref && cand.asPath.length < have.asPath.length) best.set(key2, cand);
        }
      }
    }
  }
  const routes = /* @__PURE__ */ new Map();
  for (const dev of routers) {
    const mine = originatedByDev.get(dev.id);
    const out = [];
    for (const r of bestByDev.get(dev.id).values()) {
      if (mine.some((m) => netText(m) === netText(r.dst))) continue;
      out.push({
        dst: r.dst,
        gateway: parseIPv4(r.from.conn.remoteAddress),
        iface: dev.activeAddrs().find((a) => a.cidr.ip === parseIPv4(r.from.conn.localAddress))?.iface ?? null,
        localPref: r.localPref,
        asPathLen: r.asPath.length,
        distance: r.from.template.as === r.from.peerTemplate.as ? 200 : 20
      });
    }
    routes.set(dev.id, out);
  }
  return { sessions, advertised, routes };
}

// src/lib/sim/device.ts
var hex2 = (n) => (n & 255).toString(16).toUpperCase().padStart(2, "0");
var Device = class {
  constructor(id, kind, index, ports = 4) {
    this.id = id;
    this.kind = kind;
    this.index = index;
    this.identity = kind === "router" ? "MikroTik" : id;
    const base = `0C:${hex2(16 + index * 17)}:${hex2(64 + index * 7)}:${hex2(144 - index * 3)}:00`;
    if (kind === "router") {
      for (let i = 1; i <= ports; i++) this.ifaces.push({ name: `ether${i}`, mac: `${base}:${hex2(i - 1)}`, disabled: false, type: "ether" });
      this.ifaces.push({ name: "lo", mac: "00:00:00:00:00:00", disabled: false, type: "loopback", loopback: true });
    } else {
      this.ifaces.push({ name: "eth0", mac: `00:50:79:66:68:${hex2(index * 16 + 1)}`, disabled: false, type: "ether" });
    }
  }
  id;
  kind;
  index;
  net = null;
  identity;
  ifaces = [];
  addrs = [];
  routes = [];
  filter = [];
  natRules = [];
  bridges = [];
  bports = [];
  bvlans = [];
  pools = [];
  dhcpServers = [];
  dhcpNetworks = [];
  leases = [];
  arps = [];
  /** MAC addresses this device's bridges have learned: bridge -> entries. */
  hosts = [];
  /** RouterOS 7 defaults. */
  services = {
    telnet: { port: 23, disabled: false },
    ftp: { port: 21, disabled: false },
    www: { port: 80, disabled: false },
    ssh: { port: 22, disabled: false },
    "www-ssl": { port: 443, disabled: true },
    api: { port: 8728, disabled: false },
    winbox: { port: 8291, disabled: false },
    "api-ssl": { port: 8729, disabled: false }
  };
  dns = { servers: "", allowRemoteRequests: false };
  ospf = { instances: [], areas: [], templates: [] };
  bgp = emptyBgp();
  addressLists = [];
  wgPeers = [];
  /** Interface lists besides the built-in all, none, dynamic and static. */
  ifLists = [];
  ifListMembers = [];
  /** VPCS style host settings, for kind === 'pc'. */
  pc = { ip: null, cidr: 24, gateway: null };
  iface(name) {
    return this.ifaces.find((i) => i.name === name);
  }
  bridge(name) {
    return this.bridges.find((b) => b.name === name);
  }
  bridgePort(iface) {
    return this.bports.find((p) => p.iface === iface);
  }
  /** Record (or refresh) a resolved next hop, the way a real router's ARP cache picks one up when it needs to send somewhere. */
  learnArp(address, mac, iface) {
    const existing = this.arps.find((a) => a.address === address && a.iface === iface);
    if (existing) {
      existing.mac = mac;
      existing.status = "reachable";
      return;
    }
    this.arps.push({ address, mac, iface, dynamic: true, complete: true, published: false, status: "reachable" });
  }
  /** 1-based number of a port within its bridge, in the order ports were added. */
  portNumber(p) {
    return this.bports.filter((x) => x.bridge === p.bridge).indexOf(p) + 1;
  }
  /** Ports that belong to a bridge cannot carry addresses; RouterOS marks them SLAVE. */
  isSlave(name) {
    return !!this.bridgePort(name);
  }
  /** MAC address as RouterOS shows it: a bridge takes the lowest MAC of its ports, a VLAN takes its parent's. */
  macOf(name) {
    const i = this.iface(name);
    if (!i) return "00:00:00:00:00:00";
    if (i.type === "vlan") return i.parent ? this.macOf(i.parent) : i.mac;
    if (i.type === "bridge") {
      const macs = this.bports.filter((p) => p.bridge === name).map((p) => this.iface(p.iface)?.mac).filter((m) => !!m).sort();
      return macs[0] ?? i.mac;
    }
    return i.mac;
  }
  /** An interface is running when it is enabled and, for a real port, cabled to an enabled interface. */
  running(name) {
    const i = this.iface(name);
    if (!i || i.disabled) return false;
    switch (i.type) {
      case "loopback":
      case "bridge":
      case "wireguard":
        return true;
      case "vlan":
        return !!i.parent && this.running(i.parent);
      default: {
        const p = this.net?.peer(this.id, name);
        return !!p && !p.iface.disabled;
      }
    }
  }
  /** Addresses that are usable right now. */
  activeAddrs() {
    if (this.kind === "pc") {
      if (!this.pc.ip) return [];
      const c = parseCidr(`${this.pc.ip}/${this.pc.cidr}`);
      return c && this.running("eth0") ? [{ cidr: c, iface: "eth0", text: `${this.pc.ip}/${this.pc.cidr}` }] : [];
    }
    const out = [];
    for (const a of this.addrs) {
      if (a.disabled || this.isSlave(a.iface) || !this.running(a.iface)) continue;
      const c = parseCidr(a.address);
      if (c) out.push({ cidr: c, iface: a.iface, text: a.address });
    }
    return out;
  }
  /** Local delivery: an address stays local while its interface is merely unplugged (only disable or slave status removes it). */
  ownsLocal(ip) {
    if (this.kind === "pc") return this.ownsIp(ip);
    return this.addrs.some((a) => {
      if (a.disabled || this.isSlave(a.iface)) return false;
      const c = parseCidr(a.address);
      return c?.ip === ip && !this.iface(a.iface)?.disabled;
    });
  }
  ownsIp(ip, onIface) {
    return this.activeAddrs().some((a) => a.cidr.ip === ip && (!onIface || a.iface === onIface));
  }
  /** Routing table: connected routes from addresses plus static routes, sorted like RouterOS prints them. */
  routeViews() {
    const views = [];
    const seen = /* @__PURE__ */ new Set();
    if (this.kind === "pc") return views;
    for (const a of this.addrs) {
      if (a.disabled) continue;
      const c = parseCidr(a.address);
      if (!c) continue;
      const key2 = `${c.net}/${c.cidr}/${a.iface}`;
      if (seen.has(key2)) continue;
      seen.add(key2);
      views.push({ dst: { ...c, ip: c.net }, dstText: netText(c), gateway: a.iface, iface: a.iface, distance: 0, dynamic: true, connected: true, blackhole: false, disabled: false, active: !this.isSlave(a.iface) && this.running(a.iface), staticIndex: null, localAddr: c.ip === void 0 ? void 0 : formatIPv4(c.ip) });
    }
    const connectedActive = views.filter((v) => v.active);
    this.routes.forEach((r, i) => {
      const c = parseCidr(r.dst);
      if (!c) return;
      let active = false;
      let iface = null;
      if (!r.disabled) {
        if (r.blackhole) active = true;
        else if (r.gateway) {
          const gw = parseIPv4(r.gateway);
          if (gw !== null) {
            const via = connectedActive.find((v) => inNet(gw, v.dst));
            if (via) {
              active = true;
              iface = via.iface;
            }
          } else if (this.iface(r.gateway)) {
            active = this.running(r.gateway);
            iface = r.gateway;
          }
        }
      }
      views.push({ dst: c, dstText: netText(c), gateway: r.blackhole ? "blackhole" : r.gateway ?? "", iface, distance: r.distance, dynamic: false, connected: false, blackhole: !!r.blackhole, disabled: r.disabled, active, comment: r.comment, staticIndex: i });
    });
    const learned = this.net?.ospfResult().routes.get(this.id) ?? [];
    for (const r of learned) {
      const dstText = netText(r.dst);
      const beaten = views.some((v) => v.active && v.dstText === dstText && v.distance < 110);
      views.push({
        dst: r.dst,
        dstText,
        gateway: formatIPv4(r.gateway),
        gwShown: `${formatIPv4(r.gateway)}%${r.iface}`,
        iface: r.iface,
        distance: 110,
        dynamic: true,
        connected: false,
        blackhole: false,
        disabled: false,
        active: !beaten && this.running(r.iface),
        ospf: true,
        staticIndex: null
      });
    }
    const bgpLearned = this.net?.bgpResult().routes.get(this.id) ?? [];
    for (const r of bgpLearned) {
      const dstText = netText(r.dst);
      const beaten = views.some((v) => v.active && v.dstText === dstText && v.distance < r.distance);
      views.push({
        dst: r.dst,
        dstText,
        gateway: formatIPv4(r.gateway),
        iface: r.iface,
        distance: r.distance,
        dynamic: true,
        connected: false,
        blackhole: false,
        disabled: false,
        active: !beaten && (!r.iface || this.running(r.iface)),
        bgp: true,
        staticIndex: null
      });
    }
    return views.sort((a, b) => a.dst.net - b.dst.net || a.dst.cidr - b.dst.cidr || a.distance - b.distance);
  }
  /** Longest prefix wins, then the lowest distance. */
  lookup(dstIp) {
    let best = null;
    for (const v of this.routeViews()) {
      if (!v.active || !inNet(dstIp, v.dst)) continue;
      if (!best || v.dst.cidr > best.dst.cidr || v.dst.cidr === best.dst.cidr && v.distance < best.distance) best = v;
    }
    return best;
  }
  /** The address this device would use as the source when sending through a route. */
  sourceFor(route, dstIp) {
    const target2 = route.connected ? dstIp : parseIPv4(route.gateway);
    const via = this.activeAddrs().find((a) => a.iface === route.iface && (target2 !== null ? inNet(target2, a.cidr) : true));
    return via ? via.cidr.ip : null;
  }
};

// src/lib/sim/export.ts
var BS = String.fromCharCode(92);
var quote = (v) => /[\s"=;$\[\]()]/.test(v) || v === "" ? `"${v.replace(/["$\\]/g, (c) => BS + c)}"` : v;
var hex = (n) => `0x${n.toString(16)}`;
function sections(d) {
  const out = [];
  const add = (path, rows) => {
    if (rows.length) out.push({ path, lines: rows.map((props) => ({ cmd: "add", props })) });
  };
  const dis = (x) => x.disabled ? "yes" : void 0;
  add("/interface bridge", d.bridges.map((b) => ({
    name: b.name,
    comment: b.comment,
    "vlan-filtering": b.vlanFiltering ? "yes" : void 0,
    "protocol-mode": b.protocolMode !== "rstp" ? b.protocolMode : void 0,
    priority: b.priority !== 32768 ? hex(b.priority) : void 0
  })));
  out.push({
    path: "/interface ethernet",
    lines: d.ifaces.filter((i) => i.type === "ether").map((i) => ({
      cmd: "set",
      target: `[ find default-name=${i.name} ]`,
      props: { "disable-running-check": "no", disabled: dis(i), comment: i.comment }
    }))
  });
  add("/interface wireguard", d.ifaces.filter((i) => i.type === "wireguard").map((i) => ({ name: i.name, "listen-port": i.wgListenPort, mtu: i.wgMtu, comment: i.comment, disabled: dis(i) })));
  add("/interface vlan", d.ifaces.filter((i) => i.type === "vlan").map((i) => ({ name: i.name, interface: i.parent, "vlan-id": String(i.vlanId), comment: i.comment, disabled: dis(i) })));
  add("/interface list", d.ifLists.map((l) => ({ name: l.name, comment: l.comment })));
  add("/ip pool", d.pools.map((p) => ({ name: p.name, ranges: p.ranges })));
  out.push({ path: "/port", lines: [{ cmd: "set", target: "0", props: { name: "serial0" } }] });
  add("/routing bgp template", d.bgp.templates.map((t) => ({ name: t.name, as: t.as !== 65530 ? String(t.as) : void 0, "router-id": t.routerId, disabled: dis(t) })));
  add("/interface bridge port", d.bports.map((p) => ({
    bridge: p.bridge,
    interface: p.iface,
    pvid: p.pvid !== 1 ? String(p.pvid) : void 0,
    "frame-types": p.frameTypes !== "admit-all" ? p.frameTypes : void 0,
    "bpdu-guard": p.bpduGuard ? "yes" : void 0,
    edge: p.edge !== "auto" ? p.edge : void 0,
    disabled: dis(p)
  })));
  add("/routing ospf instance", d.ospf.instances.map((i) => ({ name: i.name, "router-id": i.routerId, version: i.version !== 2 ? String(i.version) : void 0, disabled: i.disabled ? "yes" : "no" })));
  add("/routing ospf area", d.ospf.areas.map((x) => ({ name: x.name, instance: x.instance, "area-id": x.areaId !== "0.0.0.0" ? x.areaId : void 0, disabled: x.disabled ? "yes" : "no" })));
  out.push({ path: "/ip neighbor discovery-settings", lines: [{ cmd: "set", props: { "discover-interface-list": "all" } }] });
  add("/interface list member", d.ifListMembers.map((m) => ({ interface: m.interface, list: m.list, disabled: dis(m) })));
  add("/interface bridge vlan", d.bvlans.map((v) => ({
    bridge: v.bridge,
    "vlan-ids": v.vlanIds.join(","),
    tagged: v.tagged.length ? v.tagged.join(",") : void 0,
    untagged: v.untagged.length ? v.untagged.join(",") : void 0,
    comment: v.comment
  })));
  add("/interface wireguard peers", d.wgPeers.map((p) => ({ interface: p.interface, name: p.name, "public-key": p.publicKey, "endpoint-address": p.endpointAddress, "endpoint-port": p.endpointPort, "allowed-address": p.allowedAddress, disabled: dis(p) })));
  add("/ip address", d.addrs.map((a) => {
    const [ip, len] = a.address.split("/");
    const o = ip.split(".").map(Number);
    const bits = Number(len);
    const mask = bits === 0 ? 0 : 4294967295 << 32 - bits >>> 0;
    const net = ((o[0] << 24 | o[1] << 16 | o[2] << 8 | o[3]) & mask) >>> 0;
    const network = [net >>> 24, net >>> 16 & 255, net >>> 8 & 255, net & 255].join(".");
    return { address: a.address.endsWith("/32") ? ip : a.address, interface: a.iface, network, comment: a.comment, disabled: dis(a) };
  }));
  add("/ip dhcp-server", d.dhcpServers.map((s) => ({ name: s.name, interface: s.iface, "address-pool": s.pool, "lease-time": s.leaseTime !== "30m" ? s.leaseTime : void 0, disabled: dis(s) })));
  add("/ip dhcp-server network", d.dhcpNetworks.map((n) => ({ address: n.address, gateway: n.gateway, "dns-server": n.dns })));
  if (d.dns.servers || d.dns.allowRemoteRequests) out.push({ path: "/ip dns", lines: [{ cmd: "set", props: { servers: d.dns.servers, "allow-remote-requests": d.dns.allowRemoteRequests ? "yes" : void 0 } }] });
  add("/ip firewall address-list", d.addressLists.filter((e) => !e.timeout).map((e) => ({ address: e.address, list: e.list, comment: e.comment, disabled: dis(e) })));
  add("/ip firewall filter", d.filter.map((r) => ({ ...r.props, action: r.action, chain: r.chain, comment: r.comment, disabled: dis(r) })));
  add("/ip firewall nat", d.natRules.map((r) => ({ ...r.props, action: r.action, chain: r.chain, comment: r.comment, disabled: dis(r) })));
  add("/ip route", d.routes.map((r) => ({
    "dst-address": r.dst,
    gateway: r.gateway,
    blackhole: r.blackhole ? "" : void 0,
    distance: r.distance !== 1 ? String(r.distance) : void 0,
    comment: r.comment,
    disabled: dis(r)
  })));
  const defaults = { "www-ssl": true };
  const svc = Object.entries(d.services).filter(([n, s]) => s.disabled !== !!defaults[n]);
  if (svc.length) out.push({ path: "/ip service", lines: svc.map(([n, s]) => ({ cmd: "set", target: n, props: { disabled: s.disabled ? "yes" : "no" } })) });
  add("/routing bgp connection", d.bgp.connections.map((c) => ({
    name: c.name,
    templates: c.templates,
    "local.address": c.localAddress,
    "local.role": c.localRole,
    "remote.address": c.remoteAddress,
    "remote.as": String(c.remoteAs),
    "output.network": c.outputNetwork,
    "output.filter-chain": c.outputFilterChain,
    "input.filter": c.inputFilter,
    disabled: dis(c)
  })));
  add("/routing filter rule", d.bgp.filters.map((r) => ({ chain: r.chain, rule: r.text, comment: r.comment, disabled: dis(r) })));
  add("/routing ospf interface-template", d.ospf.templates.map((t) => ({
    area: t.area,
    networks: t.networks,
    cost: t.cost !== void 0 && t.cost !== 1 ? String(t.cost) : void 0,
    type: t.type !== "broadcast" ? t.type : void 0,
    passive: t.passive ? "" : void 0,
    priority: t.priority !== 128 ? String(t.priority) : void 0,
    "use-bfd": t.useBfd ? "yes" : void 0,
    disabled: t.disabled ? "yes" : "no"
  })));
  if (d.identity !== "MikroTik") out.push({ path: "/system identity", lines: [{ cmd: "set", props: { name: d.identity } }] });
  out.push({ path: "/system note", lines: [{ cmd: "set", props: { "show-at-login": "no" } }] });
  return out;
}
var propTokens = (p) => {
  const keys = Object.keys(p).filter((k) => p[k] !== void 0 && (p[k] !== "" || k === "blackhole" || k === "passive")).sort();
  let prevPrefix = null;
  return keys.map((k) => {
    const dot = k.indexOf(".");
    const prefix = dot > 0 ? k.slice(0, dot) : null;
    const shown = prefix && prefix === prevPrefix ? k.slice(dot) : k;
    prevPrefix = prefix;
    return p[k] === "" ? shown : `${shown}=${quote(p[k])}`;
  });
};
function wrap(head, tokens) {
  const lines = [];
  let line = head;
  for (const tok of tokens) {
    if (line.length + 1 + tok.length <= 77) {
      line += " " + tok;
      continue;
    }
    const eq = tok.indexOf("=");
    if (eq > 0 && !tok.startsWith('"')) {
      const key2 = tok.slice(0, eq + 1);
      if (line.length + 1 + key2.length + 1 <= 78) {
        lines.push(line + " " + key2 + BS);
        line = "    " + tok.slice(eq + 1);
        continue;
      }
    }
    lines.push(line + " " + BS);
    line = "    " + tok;
  }
  lines.push(line);
  return lines;
}
var pad = (n) => String(n).padStart(2, "0");
function stamp() {
  const t = /* @__PURE__ */ new Date();
  return `${t.getFullYear()}-${pad(t.getMonth() + 1)}-${pad(t.getDate())} ${pad(t.getHours())}:${pad(t.getMinutes())}:${pad(t.getSeconds())}`;
}
function exportConfig(d, scope = [], terse2 = false) {
  const prefix = scope.length ? "/" + scope.join(" ") : "";
  const out = [`# ${stamp()} by RouterOS 7.16`, "# software id = ", "#"];
  for (const s of sections(d)) {
    if (prefix && s.path !== prefix && !s.path.startsWith(prefix + " ")) continue;
    if (!terse2) out.push(s.path);
    for (const l of s.lines) {
      const head = (terse2 ? s.path + " " : "") + l.cmd + (l.target ? " " + l.target : "");
      const toks = propTokens(l.props);
      if (terse2) out.push([head, ...toks].join(" "));
      else out.push(...wrap(head, toks));
    }
  }
  return out.join("\n") + "\n";
}

// src/lib/sim/firewall.ts
var FILTER_ACTIONS = ["accept", "add-dst-to-address-list", "add-src-to-address-list", "drop", "fasttrack-connection", "jump", "log", "passthrough", "reject", "return", "tarpit"];
var NAT_ACTIONS = ["accept", "add-dst-to-address-list", "add-src-to-address-list", "dst-nat", "jump", "log", "masquerade", "netmap", "passthrough", "redirect", "return", "same", "src-nat"];
var ACTION_PROPS = ["jump-target", "reject-with", "to-addresses", "to-ports", "address-list", "address-list-timeout", "hw-offload"];
var MATCH_PROPS = [
  "tcp-flags",
  "connection-state",
  "connection-nat-state",
  "connection-limit",
  "protocol",
  "src-address",
  "dst-address",
  "fragment",
  "psd",
  "ipv4-options",
  "src-address-type",
  "dst-address-type",
  "src-address-list",
  "dst-address-list",
  "hotspot",
  "ttl",
  "connection-mark",
  "routing-mark",
  "in-interface",
  "out-interface",
  "in-interface-list",
  "out-interface-list",
  "in-bridge-port",
  "out-bridge-port",
  "packet-mark",
  "src-port",
  "dst-port",
  "port",
  "icmp-options",
  "src-mac-address",
  "content",
  "ingress-priority",
  "dscp",
  "limit",
  "dst-limit",
  "time",
  "random",
  "nth",
  "per-connection-classifier",
  "packet-size",
  "log",
  "log-prefix",
  "ipsec-policy"
];
var RULE_PROPS = [...ACTION_PROPS, ...MATCH_PROPS];
var neg = (v) => v.startsWith("!") ? [true, v.slice(1)] : [false, v];
function portMatch(spec, port) {
  if (port === void 0) return false;
  const [n, body] = neg(spec);
  const hit = body.split(",").some((part) => {
    const [a, b] = part.split("-").map(Number);
    return b === void 0 ? port === a : port >= a && port <= b;
  });
  return n ? !hit : hit;
}
function addrMatch(spec, ip) {
  const [n, body] = neg(spec);
  const c = parseCidr(body);
  if (!c) return false;
  const hit = inNet(ip, c);
  return n ? !hit : hit;
}
function listMatch(dev, spec, ip) {
  if (!dev) return false;
  const [n, name] = neg(spec);
  const hit = dev.addressLists.some((e) => e.list === name && !e.disabled && (() => {
    const c = parseCidr(e.address.includes("/") ? e.address : e.address + "/32");
    return !!c && inNet(ip, c);
  })());
  return n ? !hit : hit;
}
function ifListMatch(dev, spec, iface) {
  if (!dev) return false;
  const [n, name] = neg(spec);
  let hit = false;
  if (iface !== null) {
    if (name === "all") hit = true;
    else if (name === "static") hit = dev.iface(iface)?.type === "ether" || dev.iface(iface)?.type === "bridge" || dev.iface(iface)?.type === "vlan";
    else hit = dev.ifListMembers.some((m) => m.list === name && m.interface === iface && !m.disabled);
  }
  return n ? !hit : hit;
}
function ruleMatches(rule, ctx, dev) {
  if (rule.disabled || rule.chain !== ctx.chain) return false;
  const { pkt } = ctx;
  for (const [k, v] of Object.entries(rule.props)) {
    switch (k) {
      case "protocol": {
        const [n, b] = neg(v);
        if (pkt.proto === b === n) return false;
        break;
      }
      case "src-address":
        if (!addrMatch(v, pkt.src)) return false;
        break;
      case "dst-address":
        if (!addrMatch(v, pkt.dst)) return false;
        break;
      case "src-port":
        if (!portMatch(v, pkt.sport)) return false;
        break;
      case "dst-port":
        if (!portMatch(v, pkt.dport)) return false;
        break;
      case "in-interface": {
        const [n, b] = neg(v);
        if (ctx.inIface === b === n) return false;
        break;
      }
      case "out-interface": {
        const [n, b] = neg(v);
        if (ctx.outIface === b === n) return false;
        break;
      }
      case "connection-state": {
        const [n, b] = neg(v);
        const has = b.split(",").includes(pkt.state);
        if (has === n) return false;
        break;
      }
      case "connection-nat-state": {
        const [n, b] = neg(v);
        const states = [];
        if (pkt.flow.dnat) states.push("dstnat");
        if (pkt.flow.snat) states.push("srcnat");
        const has = b.split(",").some((s) => states.includes(s));
        if (has === n) return false;
        break;
      }
      case "src-address-list":
        if (!listMatch(dev, v, pkt.src)) return false;
        break;
      case "dst-address-list":
        if (!listMatch(dev, v, pkt.dst)) return false;
        break;
      case "in-interface-list":
        if (!ifListMatch(dev, v, ctx.inIface)) return false;
        break;
      case "out-interface-list":
        if (!ifListMatch(dev, v, ctx.outIface)) return false;
        break;
      default:
        break;
    }
  }
  return true;
}
function filterVerdict(dev, ctx) {
  for (const r of dev.filter) {
    if (!ruleMatches(r, ctx, dev)) continue;
    r.packets++;
    r.bytes += pkt_size(ctx.pkt);
    if (r.action === "accept" || r.action === "drop" || r.action === "reject") return { action: r.action, rule: r };
  }
  return { action: "accept", rule: null };
}
var pkt_size = (p) => p.size;
function firstNat(dev, ctx) {
  for (const r of dev.natRules) {
    if (!ruleMatches(r, ctx, dev)) continue;
    r.packets++;
    r.bytes += pkt_size(ctx.pkt);
    if (r.action === "passthrough" || r.action === "log") continue;
    return r;
  }
  return null;
}

// src/lib/sim/table.ts
var BARE = String.fromCharCode(0);
var pad2 = (s, w, right = false) => right ? s.padStart(w) : s.padEnd(w);
function legend(defs, rows) {
  const present = new Set(rows.flatMap((r) => r.flags.split("")));
  const groups = /* @__PURE__ */ new Map();
  for (const d of defs) {
    if (!present.has(d.letter)) continue;
    groups.set(d.group, [...groups.get(d.group) ?? [], `${d.letter} - ${d.name}`]);
  }
  return [...groups.entries()].sort((a, b) => a[0] - b[0]).map(([, v]) => v.join(", ")).join("; ");
}
function renderTable(cols, rows, defs) {
  const lines = [];
  const leg = legend(defs, rows);
  if (leg) lines.push(`Flags: ${leg}`);
  lines.push(`Columns: ${cols.map((c) => c.title).join(", ")}`);
  const hasIndex = rows.some((r) => r.index !== null);
  const idxW = hasIndex ? Math.max(1, ...rows.map((r) => r.index === null ? 0 : String(r.index).length)) : 0;
  const hasD = rows.some((r) => r.flags.includes("D"));
  const rest = (r) => r.flags.replace("D", "");
  const restW = Math.max(0, ...rows.map((r) => rest(r).length));
  const flagW = (hasD ? 1 : 0) + restW;
  const widths = cols.map((c, i) => Math.max(c.title.length, ...rows.map((r) => (r.cells[i] ?? "").length)));
  const prefix = (idx, flags) => {
    const parts = [];
    if (hasIndex) parts.push(pad2(idx, idxW));
    if (flagW > 0) parts.push(`${hasD ? flags.includes("D") ? "D" : " " : ""}${pad2(flags.replace("D", ""), restW)}`);
    return parts.length ? parts.join(" ") + " " : "";
  };
  const cellLine = (cells) => cols.map((c, i) => pad2(cells[i] ?? "", widths[i], c.align === "right")).join("  ").replace(/\s+$/, "");
  lines.push(`${prefix("#", "")}${cols.map((c, i) => pad2(c.title, widths[i], c.align === "right")).join("  ")}`.replace(/\s+$/, ""));
  for (const r of rows) {
    if (r.comment) lines.push(`;;; ${r.comment}`);
    const split = r.cells.map((c) => c.split("\n"));
    const height = Math.max(1, ...split.map((s) => s.length));
    for (let k = 0; k < height; k++) {
      const cells = split.map((s) => s[k] ?? "");
      lines.push(k === 0 ? `${prefix(r.index === null ? "" : String(r.index), r.flags)}${cellLine(cells)}` : `${" ".repeat(prefix("", "").length)}${cellLine(cells)}`);
    }
  }
  return lines.join("\n");
}
function renderTerse(rows) {
  return rows.map((r) => {
    const head = [r.index === null ? "" : String(r.index), r.flags].filter(Boolean).join(" ");
    return `${head ? head + " " : ""}${r.props.map(([k, v]) => v === BARE ? k : `${k}=${v}`).join(" ")}`;
  }).join("\n");
}
function renderBlocks(legendText, blocks2, flagW = 2, noFlags = false) {
  const lines = legendText.trim() ? legendText.split(String.fromCharCode(10)) : [];
  const iw = Math.max(2, ...blocks2.map((b) => String(b.index ?? "").length));
  const indent = " ".repeat(noFlags ? iw + 1 : iw + 2 + flagW);
  for (const b of blocks2) {
    const idx = String(b.index ?? "").padStart(iw);
    const head = noFlags ? `${idx} ` : `${idx} ${b.flags.padEnd(flagW)} `;
    const out = [];
    let cur = head;
    if (b.comment) {
      out.push(`${head};;; ${b.comment}`);
      cur = indent;
    }
    for (const [k, v] of b.props) {
      const piece = v === BARE ? `${k} ` : `${k}=${v} `;
      if (cur.length + piece.length > 80 && cur !== head && cur !== indent) {
        out.push(cur);
        cur = indent;
      }
      cur += piece;
    }
    out.push(cur);
    lines.push(...out, "");
  }
  return lines.join("\n").replace(/\n+$/, "");
}

// src/lib/sim/cli.ts
function tokenize(line) {
  const out = [];
  let i = 0;
  while (i < line.length) {
    while (i < line.length && /\s/.test(line[i])) i++;
    if (i >= line.length) break;
    const start = i;
    let depth = 0;
    let quote2 = false;
    let text = "";
    while (i < line.length) {
      const ch = line[i];
      if (ch === '"' && line[i - 1] !== "\\") quote2 = !quote2;
      else if (!quote2 && ch === "[") depth++;
      else if (!quote2 && ch === "]") depth--;
      else if (!quote2 && depth === 0 && /\s/.test(ch)) break;
      text += ch;
      i++;
    }
    out.push({ text, start });
  }
  return out;
}
var unquote = (s) => s.startsWith('"') && s.endsWith('"') && s.length >= 2 ? s.slice(1, -1).replace(/\\"/g, '"') : s;
function abbrev(word, options) {
  if (options.includes(word)) return word;
  const hits = options.filter((o) => o.startsWith(word));
  return hits.length === 1 ? hits[0] : hits.length > 1 ? "ambiguous" : null;
}
var CliError = class extends Error {
};
function parseConds(tokens) {
  const groups = [[]];
  for (const t of tokens) {
    if (t.text === "and") continue;
    if (t.text === "or") {
      groups.push([]);
      continue;
    }
    const flagWord = FLAG_WORDS[t.text.replace(/^!/, "")];
    if (flagWord && !/[=~]/.test(t.text)) {
      groups[groups.length - 1].push({ key: "@flag", op: t.text.startsWith("!") ? "!=" : "=", value: flagWord });
      continue;
    }
    const m = /^([a-z-]+)(!=|=|~)(.*)$/.exec(t.text);
    if (!m) throw new CliError("syntax error");
    groups[groups.length - 1].push({ key: m[1], op: m[2], value: unquote(m[3]) });
  }
  return groups;
}
var FLAG_WORDS = { ospf: "o", static: "s", connect: "c", dynamic: "D", active: "A", inactive: "I", disabled: "X", bgp: "b", rip: "r" };
var condHit = (e, c) => {
  if (c.key === "@flag") return e.flags.includes(c.value) === (c.op === "=");
  const v = e.props[c.key] ?? "";
  if (c.op === "~") {
    try {
      return new RegExp(c.value).test(v);
    } catch {
      throw new CliError("syntax error");
    }
  }
  return v === c.value === (c.op === "=");
};
var whereHit = (e, groups) => groups.some((g) => g.every((c) => condHit(e, c)));
var ADDRESS_FLAGS = [{ letter: "X", name: "DISABLED", group: 1 }, { letter: "I", name: "INVALID", group: 1 }, { letter: "D", name: "DYNAMIC", group: 0 }];
var ROUTE_FLAGS = [
  { letter: "D", name: "DYNAMIC", group: 0 },
  { letter: "X", name: "DISABLED", group: 1 },
  { letter: "I", name: "INACTIVE", group: 1 },
  { letter: "A", name: "ACTIVE", group: 1 },
  { letter: "c", name: "CONNECT", group: 2 },
  { letter: "s", name: "STATIC", group: 2 },
  { letter: "o", name: "OSPF", group: 2 },
  { letter: "b", name: "BGP", group: 2 }
];
function addressEntries(d) {
  return d.addrs.map((a, i) => {
    const c = parseCidr(a.address);
    return {
      index: i,
      flags: a.disabled ? "X" : "",
      props: { ...a.comment ? { comment: a.comment } : {}, address: a.address, network: formatIPv4(c.net), interface: a.iface, "actual-interface": a.iface, disabled: a.disabled ? "yes" : "no" },
      ref: a
    };
  });
}
var addressMenu = {
  path: ["ip", "address"],
  fields: [
    { name: "address", kind: "cidr" },
    { name: "interface", kind: "iface" },
    { name: "comment", kind: "string" },
    { name: "disabled", kind: "enum", values: ["yes", "no"] }
  ],
  required: ["address", "interface"],
  flagDefs: ADDRESS_FLAGS,
  entries: addressEntries,
  add(d, a) {
    const c = parseCidr(a.address);
    const norm = `${formatIPv4(c.ip)}/${c.cidr}`;
    if (d.addrs.some((x) => x.address === norm && x.iface === a.interface)) throw new CliError("failure: already have such address");
    d.addrs.push({ address: norm, iface: a.interface, comment: a.comment, disabled: a.disabled === "yes" });
  },
  remove(d, e) {
    d.addrs.splice(d.addrs.indexOf(e.ref), 1);
  },
  toggle(_d, e, off) {
    e.ref.disabled = off;
  },
  set(d, e, a) {
    const r = e.ref;
    if (a.address) {
      const c = parseCidr(a.address);
      r.address = `${formatIPv4(c.ip)}/${c.cidr}`;
    }
    if (a.interface) r.iface = a.interface;
    if ("comment" in a) r.comment = a.comment || void 0;
    if (a.disabled) r.disabled = a.disabled === "yes";
    void d;
  },
  render(_d, rows, mode) {
    if (mode === "terse") return renderTerse(rows.map((e) => ({ index: e.index, flags: e.flags, props: Object.entries(e.props).filter(([k]) => k !== "disabled") })));
    const t = rows.map((e) => ({ index: e.index, flags: e.flags, comment: e.props.comment, cells: [e.props.address, e.props.network, e.props.interface] }));
    return renderTable([{ title: "ADDRESS" }, { title: "NETWORK" }, { title: "INTERFACE" }], t, ADDRESS_FLAGS);
  }
};
function routeEntries(d) {
  return d.routeViews().map((v) => {
    const flags = `${v.dynamic ? "D" : ""}${v.disabled ? "X" : v.active ? "A" : "I"}${v.connected ? "c" : v.ospf ? "o" : v.bgp ? "b" : "s"}`;
    return {
      index: v.staticIndex,
      flags,
      props: {
        ...v.comment ? { comment: v.comment } : {},
        "dst-address": v.dstText,
        "routing-table": "main",
        ...v.blackhole ? { blackhole: BARE } : { gateway: v.gwShown ?? v.gateway },
        "immediate-gw": v.connected ? v.gateway : v.active && v.iface && !v.blackhole ? v.gateway.includes(".") ? `${v.gateway}%${v.iface}` : v.gateway : "",
        distance: String(v.distance),
        scope: v.connected ? "10" : v.ospf ? "20" : v.bgp ? "40" : "30",
        ...v.blackhole ? {} : { "target-scope": v.connected ? "5" : "10" },
        ...v.connected && v.localAddr ? { "local-address": `${v.localAddr}%${v.gateway}` } : {},
        active: v.active ? "yes" : "no",
        disabled: v.disabled ? "yes" : "no"
      },
      ref: v.staticIndex === null ? null : d.routes[v.staticIndex]
    };
  });
}
var routeMenu = {
  path: ["ip", "route"],
  fields: [
    { name: "dst-address", kind: "cidr" },
    { name: "gateway", kind: "gateway" },
    { name: "distance", kind: "int" },
    { name: "comment", kind: "string" },
    { name: "disabled", kind: "enum", values: ["yes", "no"] }
  ],
  required: ["dst-address"],
  flagDefs: ROUTE_FLAGS,
  entries: routeEntries,
  add(d, a, bare) {
    const blackhole = bare.some((b) => "blackhole".startsWith(b) && b.length >= 1);
    if (!a.gateway && !blackhole) throw new CliError("failure: gateway required");
    const c = parseCidr(a["dst-address"]);
    d.routes.push({ dst: netText(c), gateway: a.gateway, blackhole, distance: a.distance ? Number(a.distance) : 1, comment: a.comment, disabled: a.disabled === "yes" });
  },
  remove(d, e) {
    if (!e.ref) throw new CliError("failure: cannot remove dynamic route");
    d.routes.splice(d.routes.indexOf(e.ref), 1);
  },
  toggle(_d, e, off) {
    if (!e.ref) throw new CliError("failure: cannot disable dynamic route");
    e.ref.disabled = off;
  },
  set(_d, e, a) {
    if (!e.ref) throw new CliError("failure: cannot change dynamic route");
    const r = e.ref;
    if (a["dst-address"]) r.dst = netText(parseCidr(a["dst-address"]));
    if (a.gateway) r.gateway = a.gateway;
    if (a.distance) r.distance = Number(a.distance);
    if ("comment" in a) r.comment = a.comment || void 0;
    if (a.disabled) r.disabled = a.disabled === "yes";
  },
  render(_d, rows, mode) {
    if (mode === "terse") return renderTerse(rows.map((e) => ({ index: e.index, flags: e.flags, props: Object.entries(e.props).filter(([k]) => !["active", "disabled"].includes(k)) })));
    const t = rows.map((e) => ({ index: e.index, flags: e.flags, comment: e.props.comment, cells: [e.props["dst-address"], e.props.gateway ?? "blackhole", e.props.distance] }));
    return renderTable([{ title: "DST-ADDRESS" }, { title: "GATEWAY" }, { title: "DISTANCE", align: "right" }], t, ROUTE_FLAGS);
  }
};
function ruleEntries(list) {
  return (d) => list(d).map((r, i) => {
    const ordered = [["chain", r.chain], ["action", r.action]];
    for (const k of RULE_PROPS) if (r.props[k] !== void 0) ordered.push([k, r.props[k]]);
    return {
      index: i,
      flags: r.disabled ? "X" : "",
      props: { ...r.comment ? { comment: r.comment } : {}, ...Object.fromEntries(ordered), bytes: String(r.bytes), packets: String(r.packets), disabled: r.disabled ? "yes" : "no" },
      ref: r
    };
  });
}
var PORT_PROPS = ["src-port", "dst-port", "port"];
var ADDR_PROPS = ["src-address", "dst-address"];
function ruleFields(actions) {
  return [
    { name: "chain", kind: "string" },
    { name: "action", kind: "enum", values: actions },
    ...RULE_PROPS.map((n) => ({
      name: n,
      kind: n === "in-interface" || n === "out-interface" ? "iface" : n === "protocol" ? "protocol" : PORT_PROPS.includes(n) ? "ports" : ADDR_PROPS.includes(n) ? "addr" : "string"
    })),
    { name: "comment", kind: "string" },
    { name: "disabled", kind: "enum", values: ["yes", "no"] },
    { name: "place-before", kind: "int" },
    { name: "destination", kind: "int" }
  ];
}
function checkRule(props) {
  const proto = (props.protocol ?? "").replace(/^!/, "");
  const withPorts = ["tcp", "udp", "udp-lite", "dccp", "sctp"].includes(proto);
  if (PORT_PROPS.some((k) => props[k] !== void 0) && !withPorts) throw new CliError("failure: ports can be specified if proto is tcp,udp,udp-lite,dccp,sctp");
  if (props["tcp-flags"] !== void 0 && proto !== "tcp") throw new CliError("failure: tcp-flags works only with tcp");
  if (props["icmp-options"] !== void 0 && proto !== "icmp") throw new CliError("failure: icmp-options can be specified if proto is icmp");
}
function ruleMenu(path, list, actions) {
  return {
    path,
    fields: ruleFields(actions),
    required: ["chain"],
    entries: ruleEntries(list),
    add(d, a) {
      const props = {};
      for (const k of RULE_PROPS) if (a[k] !== void 0) props[k] = a[k];
      checkRule(props);
      if (a.action === "fasttrack-connection") props["hw-offload"] = "yes";
      const rule = { chain: a.chain, action: a.action ?? "accept", props, comment: a.comment, disabled: a.disabled === "yes", packets: 0, bytes: 0 };
      const at = a["place-before"] === void 0 ? -1 : Number(a["place-before"]);
      if (at >= list(d).length) throw new CliError("failure: item referred by 'place-before' does not exist");
      if (at >= 0) list(d).splice(at, 0, rule);
      else list(d).push(rule);
    },
    remove(d, e) {
      const l = list(d);
      l.splice(l.indexOf(e.ref), 1);
    },
    toggle(_d, e, off) {
      e.ref.disabled = off;
    },
    /** RouterOS `move [numbers] destination=N`: pull the targets out (in their current relative order), then reinsert them just before what is currently index N. */
    move(d, targets, dest) {
      const l = list(d);
      const rules = targets.map((t) => t.ref);
      const destRule = l[dest];
      const remaining = l.filter((r) => !rules.includes(r));
      const at = destRule && !rules.includes(destRule) ? remaining.indexOf(destRule) : Math.min(dest, remaining.length);
      remaining.splice(at, 0, ...rules);
      l.length = 0;
      l.push(...remaining);
    },
    set(_d, e, a) {
      const r = e.ref;
      if (a.chain) r.chain = a.chain;
      if (a.action) r.action = a.action;
      const next = { ...r.props };
      for (const k of RULE_PROPS) if (a[k] !== void 0) next[k] = a[k];
      checkRule(next);
      r.props = next;
      if ("comment" in a) r.comment = a.comment || void 0;
      if (a.disabled) r.disabled = a.disabled === "yes";
    },
    render(_d, rows, mode) {
      if (mode === "stats") {
        const t = rows.map((e) => ({ index: e.index, flags: e.flags, comment: e.props.comment, cells: [e.props.chain, e.props.action, spaced(e.props.bytes), spaced(e.props.packets)] }));
        return renderTable([{ title: "CHAIN" }, { title: "ACTION" }, { title: "BYTES", align: "right" }, { title: "PACKETS", align: "right" }], t, [{ letter: "X", name: "DISABLED", group: 0 }, { letter: "I", name: "INVALID", group: 0 }]);
      }
      if (mode === "terse") return renderTerse(rows.map((e) => ({ index: e.index, flags: e.flags, props: Object.entries(e.props).filter(([k]) => !["bytes", "packets", "disabled"].includes(k)) })));
      return renderBlocks(
        `Flags: X - disabled, I - invalid; D - dynamic${rows.length ? " " : ""}`,
        rows.map((e) => ({ index: e.index ?? 0, flags: e.flags, comment: e.props.comment, props: Object.entries(e.props).filter(([k]) => !["comment", "bytes", "packets", "disabled"].includes(k)).map(([k, v]) => [k, k === "log-prefix" ? `"${v}"` : v]) }))
      );
    }
  };
}
var spaced = (n) => n.replace(/\B(?=(\d{3})+(?!\d))/g, " ");
function parseArgs(tokens, m, line, printing = false) {
  const args = { named: {}, bare: [], where: [[]], flags: /* @__PURE__ */ new Set(), tokens };
  const names = (m.fields ?? []).map((f) => f.name);
  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i];
    if (t.text === "where") {
      args.where = parseConds(tokens.slice(i + 1));
      break;
    }
    const eq = t.text.indexOf("=");
    if (eq > 0 && !t.text.startsWith("[")) {
      const rawName = t.text.slice(0, eq);
      const full = m.fields ? abbrev(rawName, names) : rawName;
      if (full === null || full === "ambiguous") {
        const like = names.some((n) => n[0] === rawName[0]);
        throw new CliError(`expected end of command (line 1 column ${printing || like ? t.start + 1 : t.start + eq + 1})`);
      }
      args.named[full] = { value: unquote(t.text.slice(eq + 1)), col: t.start + eq + 2 };
    } else if (["terse", "stats", "detail", "count-only", "without-paging", "as-value", "brief", "once"].includes(t.text)) args.flags.add(t.text);
    else args.bare.push(t);
  }
  void line;
  return args;
}
var PROTOCOLS = ["tcp", "udp", "icmp", "ipv6-icmp", "gre", "ipsec-esp", "ipsec-ah", "ospf", "vrrp", "igmp", "ggp", "egp", "pup", "idrp-cmtp", "rdp", "ipip", "sctp", "dccp", "udp-lite", "ip-encap", "etherip", "eigrp", "l2tp", "pim", "ipv6-encap", "ipv6-frag", "ipv6-nonxt", "ipv6-opts", "ipv6-route", "st", "xtp", "iso-tp4", "xns-idp", "rspf", "vmtp", "ddp", "encap", "hmp", "idpr-cmtp", "ipcomp", "ipv6", "iso-ip", "rsvp", "tp++", "all"];
function checkField(f, value, col, d) {
  switch (f.kind) {
    case "cidr": {
      if (!parseCidr(value)) {
        const m = /^([^/]+)\/(\d+)$/.exec(value);
        if (m && parseIPv4(m[1]) !== null && Number(m[2]) > 32) throw new CliError("value of netmask out of range (0..32)");
        throw new CliError(`invalid value for argument ${f.name}`);
      }
      return value;
    }
    case "protocol": {
      const b = value.replace(/^!/, "");
      if (!(/^\d+$/.test(b) ? Number(b) <= 255 : PROTOCOLS.includes(b))) throw new CliError(`syntax error (line 1 column ${col})`);
      return value;
    }
    case "ports": {
      for (const part of value.replace(/^!/, "").split(",")) {
        const m = /^(\d+)(?:-(\d+))?$/.exec(part);
        if (!m) throw new CliError(`syntax error (line 1 column ${col})`);
        if (Number(m[1]) > 65535 || Number(m[2] ?? 0) > 65535) throw new CliError("value of range out of range (0..65535)");
      }
      return value;
    }
    case "addr": {
      for (const part of value.replace(/^!/, "").split(",")) {
        const [lo, hi] = part.split("-");
        const ok = (x) => parseCidr(x.includes("/") ? x : x + "/32") !== null;
        if (!ok(lo) || hi !== void 0 && !ok(hi)) throw new CliError("value of range expects range of ip addresses");
      }
      return value;
    }
    case "ip":
      if (parseIPv4(value) === null) throw new CliError(`invalid value for argument ${f.name}`);
      return value;
    case "gateway": {
      if (parseIPv4(value) === null && !d.iface(value)) throw new CliError(`invalid value for argument ${f.name}`);
      return value;
    }
    case "iface": {
      if (!d.iface(value)) throw new CliError(`input does not match any value of ${f.name}`);
      return value;
    }
    case "int":
      if (!/^\d+$/.test(value)) throw new CliError(`invalid value for argument ${f.name}`);
      return value;
    case "enum": {
      const v = abbrev(value, f.values ?? []);
      if (v === null || v === "ambiguous") throw new CliError(`syntax error (line 1 column ${col})`);
      return v;
    }
    default:
      return value;
  }
}
function select(entries, sel, d, m) {
  if (!sel) throw new CliError("missing value(s) of argument(s) numbers");
  const t = sel.text;
  if (t.startsWith("[")) {
    const inner = tokenize(t.slice(1, -1));
    if (!inner.length || inner[0].text !== "find") throw new CliError("syntax error");
    let rest = inner.slice(1);
    if (rest[0]?.text === "where") rest = rest.slice(1);
    const conds = parseConds(rest);
    return entries.filter((e) => whereHit(e, conds));
  }
  const out = [];
  for (const part of t.split(",")) {
    const byName = entries.find((e) => e.props.name !== void 0 && e.props.name === part);
    const idx = /^\d+$/.test(part) ? Number(part) : null;
    const hit = byName ?? (idx !== null ? entries.find((e) => e.index === idx) : void 0);
    if (!hit) throw new CliError("no such item");
    out.push(hit);
  }
  void d;
  return out;
}
var identityMenu = {
  path: ["system", "identity"],
  actions: ["print", "set"],
  run(d, action, a) {
    if (action === "print") return `  name: ${d.identity}`;
    const n = a.named.name;
    if (!n) throw new CliError("missing value(s) of argument(s) name");
    d.identity = n.value;
    return "";
  }
};
function serviceEntries(d) {
  return Object.entries(d.services).map(([name, s], i) => ({
    index: i,
    flags: s.disabled ? "X" : "",
    props: {
      name,
      port: String(s.port),
      address: "",
      ...name.endsWith("ssl") ? { certificate: "none", "tls-version": "any" } : {},
      ...name === "ftp" ? {} : { vrf: "main" },
      "max-sessions": "20",
      disabled: s.disabled ? "yes" : "no"
    },
    ref: { name, s }
  }));
}
var serviceMenu = {
  path: ["ip", "service"],
  fields: [{ name: "port", kind: "int" }, { name: "disabled", kind: "enum", values: ["yes", "no"] }],
  entries: serviceEntries,
  toggle(_d, e, off) {
    e.ref.s.disabled = off;
  },
  set(_d, e, a) {
    const s = e.ref.s;
    if (a.port) s.port = Number(a.port);
    if (a.disabled) s.disabled = a.disabled === "yes";
  },
  render(_d, rows, mode) {
    if (mode === "terse") return renderTerse(rows.map((e) => ({ index: e.index, flags: e.flags, props: Object.entries(e.props).filter(([k]) => k !== "disabled") })));
    const all = [
      { title: "NAME", key: "name" },
      { title: "PORT", key: "port", align: "right" },
      { title: "CERTIFICATE", key: "certificate" },
      { title: "VRF", key: "vrf" },
      { title: "MAX-SESSIONS", key: "max-sessions", align: "right" }
    ];
    const cols = all.filter((c) => rows.some((e) => e.props[c.key]));
    const t = rows.map((e) => ({ index: e.index, flags: e.flags, cells: cols.map((c) => e.props[c.key] ?? "") }));
    return renderTable(cols.map((c) => ({ title: c.title, align: c.align })), t, [{ letter: "X", name: "DISABLED", group: 0 }, { letter: "I", name: "INVALID", group: 0 }]);
  }
};
var MENUS = [
  addressMenu,
  serviceMenu,
  routeMenu,
  ruleMenu(["ip", "firewall", "filter"], (d) => d.filter, FILTER_ACTIONS),
  ruleMenu(["ip", "firewall", "nat"], (d) => d.natRules, NAT_ACTIONS),
  identityMenu
];
var registerMenu = (m) => {
  MENUS.push(m);
};
var TOOLS = [];
var registerTool = (t) => {
  TOOLS.push(t);
};
var menuFor = (path) => menuAt(path);
var ALL_PATHS = () => [...MENUS.map((m) => m.path), ...TOOLS.map((t) => t.path)];
var LIST_ACTIONS = ["print", "add", "remove", "set", "enable", "disable", "move", "comment"];
function children(prefix) {
  const out = /* @__PURE__ */ new Set();
  for (const p of ALL_PATHS()) if (p.length > prefix.length && prefix.every((s, i) => p[i] === s)) out.add(p[prefix.length]);
  return [...out];
}
var menuAt = (path) => MENUS.find((m) => m.path.join("/") === path.join("/"));
var toolAt = (path) => TOOLS.find((t) => t.path.join("/") === path.join("/"));
function execLine(dev, rawLine, ctxIn) {
  let ctx = [...ctxIn];
  const outputs = [];
  for (const line of splitCommands(rawLine)) {
    try {
      const r = execOne(dev, line, ctx);
      ctx = r.ctx;
      if (r.output) outputs.push(r.output);
    } catch (e) {
      if (e instanceof CliError) {
        outputs.push(e.message);
        break;
      }
      throw e;
    }
  }
  return { output: outputs.join("\n"), ctx };
}
function splitCommands(line) {
  const out = [];
  let cur = "";
  let q2 = false;
  let depth = 0;
  for (const ch of line) {
    if (ch === '"') q2 = !q2;
    if (!q2 && ch === "[") depth++;
    if (!q2 && ch === "]") depth--;
    if (!q2 && depth === 0 && ch === ";") {
      out.push(cur);
      cur = "";
    } else cur += ch;
  }
  out.push(cur);
  return out.filter((s) => s.trim());
}
function expandPath(toks) {
  const first = toks[0];
  if (!first || !first.text.startsWith("/") || first.text.includes("=") || !first.text.slice(1).includes("/")) return toks;
  const out = [];
  let pos = 0;
  for (const part of first.text.split("/")) {
    if (part) out.push({ text: (pos === 0 ? "/" : "") + part, start: first.start + pos + (pos === 0 ? 0 : 0) });
    pos += part.length + 1;
  }
  if (out[0] && !out[0].text.startsWith("/")) out[0] = { ...out[0], text: "/" + out[0].text };
  return [...out, ...toks.slice(1)];
}
function execOne(dev, line, ctx) {
  const toks = expandPath(tokenize(line));
  if (!toks.length || toks[0].text.startsWith("#")) return { output: "", ctx };
  if (toks[0].text === ":put") return { output: unquote(toks.slice(1).map((t) => t.text).join(" ")), ctx };
  if (toks[0].text.startsWith(":")) throw new CliError(`bad command name ${toks[0].text.slice(1)} (line 1 column ${toks[0].start + 2})`);
  if (toks[0].text === "..") return { output: "", ctx: ctx.slice(0, -1) };
  let cur = toks[0].text.startsWith("/") ? [] : [...ctx];
  let i = 0;
  outer: while (i < toks.length) {
    const t = toks[i];
    if (t.text.includes("=") || t.text.startsWith("[")) break;
    const isAbs = t.text.startsWith("/");
    const segs = t.text.replace(/^\//, "").split("/");
    let consumed = 0;
    for (const seg of segs) {
      if (seg === "") continue;
      const next = abbrev(seg, children(cur));
      if (next === "ambiguous") throw new CliError(`ambiguous command name ${seg} (line 1 column ${t.start + (isAbs ? 2 : 1)})`);
      if (next === null) {
        if (consumed === 0 && !(isAbs && segs.length > 1)) break outer;
        break outer;
      }
      cur = [...cur, next];
      consumed++;
    }
    i++;
  }
  const rest = toks.slice(i);
  const tool = toolAt(cur);
  const menu = menuAt(cur);
  if (!tool && !menu && cur.length && rest[0]?.text === "export") return { output: exportConfig(dev, cur, rest.some((t) => t.text === "terse")), ctx };
  if (!tool && !menu) {
    if (i === toks.length) {
      if (children(cur).length === 0 && cur.length === 0) throw new CliError(`bad command name ${toks[0].text.replace(/^\//, "")} (line 1 column ${toks[0].start + 1 + (toks[0].text.startsWith("/") ? 1 : 0)})`);
      return { output: "", ctx: cur };
    }
    const bad = toks[i];
    const slash = bad.text.startsWith("/") ? 1 : 0;
    throw new CliError(`bad command name ${bad.text.slice(slash)} (line 1 column ${bad.start + 1 + slash})`);
  }
  if (tool) return { output: tool.run(dev, parseArgs(rest, { path: [] }, line), line), ctx };
  const m = menu;
  if (!rest.length) return { output: "", ctx: cur };
  const actionTok = rest[0];
  if (actionTok.text === "export") return { output: exportConfig(dev, cur, rest.some((t) => t.text === "terse")), ctx };
  const base = m.actions ?? (m.entries ? LIST_ACTIONS.filter((a) => a === "print" || a === "add" && m.add || a === "remove" && m.remove || a === "set" && m.set || (a === "enable" || a === "disable") && m.toggle || a === "move" && m.move || a === "comment" && m.set) : []);
  const actions = [...base, ...Object.keys(m.extra ?? {})];
  const action = abbrev(actionTok.text, actions);
  if (action === null || action === "ambiguous") throw new CliError(`bad command name ${actionTok.text} (line 1 column ${actionTok.start + 1})`);
  const args = parseArgs(rest.slice(1), m, line, action === "print");
  if (m.extra?.[action]) return { output: m.extra[action](dev, args), ctx };
  if (m.run) return { output: m.run(dev, action, args, line), ctx };
  const entries = m.entries(dev);
  if (action === "print") {
    let rows = entries.filter((e) => whereHit(e, args.where));
    if (args.flags.has("count-only")) return { output: String(rows.length), ctx };
    if (!rows.length && m.path[0] !== "ip" && !m.emptyLegend) return { output: "", ctx };
    if (args.bare.length) rows = select(entries, args.bare[0], dev, m);
    const mode = args.flags.has("terse") ? "terse" : args.flags.has("stats") ? "stats" : "table";
    if (args.flags.has("detail") && !args.flags.has("terse") && m.detail && rows.length) {
      const sp = m.detail;
      return { output: renderBlocks(sp.legend.split(String.fromCharCode(10)).map((l) => l ? l + " " : l).join(String.fromCharCode(10)), rows.map((e) => ({
        index: e.index,
        flags: sp.flags ? sp.flags(e) : e.flags,
        comment: e.props.comment,
        props: sp.props(e).map(([k, v]) => [k, v === BARE ? v : sp.quote?.includes(k) || v === "" ? `"${v}"` : v])
      })), sp.flagW, sp.noFlags), ctx };
    }
    if (!rows.length) return { output: mode === "table" && m.emptyLegend ? m.emptyLegend : mode === "table" && m.path[1] === "firewall" ? `Flags: X - disabled, I - invalid; D - dynamic` : "", ctx };
    return { output: m.render(dev, rows, mode), ctx };
  }
  if (action === "add") {
    const named = {};
    for (const f of m.fields ?? []) {
      const a = args.named[f.name];
      if (a) named[f.name] = checkField(f, a.value, a.col, dev);
    }
    const missing = (m.required ?? []).filter((r) => named[r] === void 0);
    if (missing.length) throw new CliError(`Script Error: missing value(s) of argument(s) ${missing.join(" ")}`);
    m.add(dev, named, args.bare.map((b) => b.text));
    return { output: "", ctx };
  }
  const targets = select(entries, args.bare[0], dev, m);
  const dynamicHit = !!m.skipDynamic && targets.some((t) => t.ref === null);
  const live = m.skipDynamic ? targets.filter((t) => t.ref !== null) : targets;
  if (action === "remove") {
    for (const t of [...live].reverse()) m.remove(dev, t);
    if (dynamicHit) throw new CliError("no such item (4)");
    return { output: "", ctx };
  }
  if (action === "enable" || action === "disable") {
    for (const t of live) m.toggle(dev, t, action === "disable");
    return { output: "", ctx };
  }
  if (action === "move") {
    const destArg = args.named.destination;
    if (!destArg) throw new CliError("missing value(s) of argument(s) destination");
    const dest = Number(destArg.value);
    if (!Number.isInteger(dest) || dest < 0) throw new CliError("invalid value for argument destination");
    m.move(dev, live, dest);
    if (dynamicHit) throw new CliError("no such item (4)");
    return { output: "", ctx };
  }
  if (action === "comment") {
    const text = args.named.comment ? args.named.comment.value : args.bare[1] ? unquote(args.bare[1].text) : "";
    for (const t of live) m.set(dev, t, { comment: text });
    if (dynamicHit) throw new CliError("no such item (4)");
    return { output: "", ctx };
  }
  if (action === "set") {
    const named = {};
    for (const f of m.fields ?? []) {
      const a = args.named[f.name];
      if (a) named[f.name] = checkField(f, a.value, a.col, dev);
    }
    for (const t of live) m.set(dev, t, named, args.bare.slice(1).map((b) => b.text));
    if (dynamicHit) throw new CliError("no such item (4)");
    return { output: "", ctx };
  }
  return { output: "", ctx };
}

// src/lib/sim/commands.ts
var num = (a, key2, dflt) => {
  const v = a.named[key2]?.value;
  if (v === void 0) return dflt;
  if (!/^\d+$/.test(v)) throw new CliError(`invalid value for argument ${key2}`);
  return Number(v);
};
function target(a) {
  const text = a.bare[0]?.text ?? a.named.address?.value;
  if (!text) throw new CliError("missing value(s) of argument(s) address");
  const ip = parseIPv4(text);
  if (ip === null) {
    throw new CliError("invalid value for argument address:\n    invalid value of mac-address, mac address required\n    invalid value for argument ipv6-address\n    failure: dns name exists, but no appropriate record");
  }
  return ip;
}
var STATUS = {
  "net-unreachable": "net unreachable",
  "host-unreachable": "host unreachable",
  "ttl-exceeded": "ttl exceeded",
  "admin-prohibited": "admin prohibited"
};
var cut = (s) => s.length > 12 ? `${s.slice(0, 9)}...` : s;
var pingRow = (seq, host, size, ttl, time, status) => `${String(seq).padStart(5)} ${host.padEnd(41)}${size.padStart(4)} ${ttl.padStart(3)} ${time.padEnd(10)} ${status.padEnd(12)}`;
function pingLines(d, dst, opts) {
  const net = d.net;
  const lines = [`${"SEQ".padStart(5)} ${"HOST".padEnd(41)}${"SIZE".padStart(4)} ${"TTL".padStart(3)} ${"TIME".padEnd(10)} ${"STATUS".padEnd(12)}`];
  const times = [];
  const host = formatIPv4(dst);
  for (let seq = 0; seq < opts.count; seq++) {
    const r = net.pingOnce(d, dst, { srcAddress: opts.srcAddress, ttl: opts.ttl, size: opts.size });
    if (r.status === "reply") {
      times.push(r.us);
      lines.push(pingRow(seq, host, String(r.size), String(r.ttl), fmtTime(r.us), ""));
    } else if (r.status === "error") lines.push(pingRow(seq, formatIPv4(r.from), "84", "64", fmtTime(300 + seq * 13), cut(STATUS[r.err])));
    else if (r.status === "no-route") lines.push(pingRow(seq, "", "", "", "", cut("no route to host")));
    else lines.push(pingRow(seq, host, "", "", "", "timeout"));
  }
  const loss = Math.round((opts.count - times.length) / opts.count * 100);
  let sum = `sent=${opts.count} received=${times.length} packet-loss=${loss}%`;
  if (times.length) {
    const avg = Math.round(times.reduce((a2, b) => a2 + b, 0) / times.length);
    const a = `${sum} min-rtt=${fmtTime(Math.min(...times))} avg-rtt=${fmtTime(avg)}`;
    const mx = `max-rtt=${fmtTime(Math.max(...times))}`;
    sum = `    ${a} ${mx}`.length > 80 ? `    ${a} 
   ${mx}` : `    ${a} ${mx}`;
  } else sum = `    ${sum}`;
  lines.push(sum);
  return lines.join("\n");
}
function execPing(d, a) {
  const dst = target(a);
  const src = a.named["src-address"]?.value;
  const srcIp = src ? parseIPv4(src) : null;
  if (src && srcIp === null) throw new CliError("invalid value for argument src-address");
  return pingLines(d, dst, { count: num(a, "count", 4), size: num(a, "size", 56), ttl: num(a, "ttl", 64), srcAddress: srcIp });
}
registerTool({
  path: ["ping"],
  run: execPing
});
var ms = (us) => `${(us / 1e3).toFixed(1)}ms`;
var dec = (us) => (us / 1e3).toFixed(1);
function tracerouteText(d, dst, opts) {
  const rows = d.net.traceroute(d, dst, opts);
  const dstText = formatIPv4(dst);
  const cells = rows.map((r) => {
    if (!r.us.length) return { address: r.address ?? "", loss: `${r.loss}%`, sent: String(r.sent), last: "timeout", avg: "", best: "", worst: "", sd: "" };
    const avg = r.us.reduce((x, y) => x + y, 0) / r.us.length;
    const sd = Math.sqrt(r.us.reduce((x, y) => x + (y - avg) ** 2, 0) / r.us.length);
    return { address: r.address ?? "", loss: `${r.loss}%`, sent: String(r.sent), last: ms(r.us[r.us.length - 1]), avg: dec(avg), best: dec(Math.min(...r.us)), worst: dec(Math.max(...r.us)), sd: sd < 50 ? "0" : dec(sd) };
  });
  if (!rows.length) return `no route to ${dstText}`;
  const w = {
    address: Math.max(7, ...cells.map((c) => c.address.length)),
    loss: Math.max(4, ...cells.map((c) => c.loss.length)),
    sent: Math.max(4, ...cells.map((c) => c.sent.length)),
    last: Math.max(4, ...cells.map((c) => c.last.length)),
    avg: Math.max(3, ...cells.map((c) => c.avg.length)),
    best: Math.max(4, ...cells.map((c) => c.best.length)),
    worst: Math.max(5, ...cells.map((c) => c.worst.length)),
    sd: Math.max(7, ...cells.map((c) => c.sd.length))
  };
  const line = (idx, c) => `${idx.padEnd(2)} ${c.address.padEnd(w.address)}  ${c.loss.padEnd(w.loss)}  ${c.sent.padStart(w.sent)}  ${c.last.padEnd(w.last)}  ${c.avg.padEnd(w.avg)}  ${c.best.padEnd(w.best)}  ${c.worst.padEnd(w.worst)}  ${c.sd.padStart(w.sd)}`.replace(/\s+$/, "");
  return [
    "Columns: ADDRESS, LOSS, SENT, LAST, AVG, BEST, WORST, STD-DEV",
    line("#", { address: "ADDRESS", loss: "LOSS", sent: "SENT", last: "LAST", avg: "AVG", best: "BEST", worst: "WORST", sd: "STD-DEV" }),
    ...cells.map((c, i) => line(String(i + 1), c))
  ].join("\n");
}
registerTool({
  path: ["tool", "traceroute"],
  run(d, a) {
    const dst = target(a);
    const src = a.named["src-address"]?.value;
    const srcIp = src ? parseIPv4(src) : null;
    if (src && srcIp === null) throw new CliError("invalid value for argument src-address");
    return tracerouteText(d, dst, { count: num(a, "count", 3), maxHops: num(a, "max-hops", 30), srcAddress: srcIp });
  }
});
registerTool({
  path: ["tool", "fetch"],
  run(d, a) {
    const url = a.named.url?.value;
    if (!url) throw new CliError("missing value(s) of argument(s) url");
    const m = /^https?:\/\/(\d{1,3}(?:\.\d{1,3}){3})(?::(\d+))?(\/.*)?$/.exec(url);
    if (!m) throw new CliError("failure: only http://a.b.c.d[:port]/ addresses work in the simulator");
    const ip = parseIPv4(m[1]);
    if (ip === null) throw new CliError("invalid value for argument url");
    const port = m[2] ? Number(m[2]) : url.startsWith("https") ? 443 : 80;
    const r = d.net.tcpConnect(d, ip, port);
    const head = "  status: connecting";
    if (r === "connected") return `${head}

      status: finished
  downloaded: 2KiB
       total: 2KiB
    duration: 1s`;
    if (r === "refused") return `${head}

      status: failed

failure: Connection refused`;
    return `${head}

      status: failed

failure: Idle timeout - connecting`;
  }
});
registerTool({
  path: ["export"],
  run(d, args) {
    return exportConfig(d, [], args.flags.has("terse"));
  }
});

// src/lib/stp.ts
var LONG_COST = [
  [1e5, 200],
  [25e3, 800],
  [1e4, 2e3],
  [1e3, 2e4],
  [100, 2e5],
  [10, 2e6]
];
function pathCost(speedMbps) {
  for (const [speed, cost] of LONG_COST) if (speedMbps >= speed) return cost;
  return 2e6;
}
var macNum = (mac) => parseInt(mac.replace(/[^0-9a-f]/gi, ""), 16);
var compareBridgeId = (a, b) => a.priority - b.priority || macNum(a.mac) - macNum(b.mac);
var bridgeIdText = (b) => `${b.priority.toString(16).toUpperCase().padStart(4, "0")}.${b.mac}`;
function computeStp(bridges, links) {
  const by = new Map(bridges.map((b) => [b.id, b]));
  const up = links.filter((l) => l.up && by.has(l.a) && by.has(l.b));
  const comp = /* @__PURE__ */ new Map();
  for (const b of bridges) {
    if (comp.has(b.id)) continue;
    const stack = [b.id];
    comp.set(b.id, b.id);
    while (stack.length) {
      const x = stack.pop();
      for (const l of up) {
        const y = l.a === x ? l.b : l.b === x ? l.a : null;
        if (y && !comp.has(y)) {
          comp.set(y, b.id);
          stack.push(y);
        }
      }
    }
  }
  const rootOf = {};
  const groups = /* @__PURE__ */ new Map();
  for (const b of bridges) groups.set(comp.get(b.id), [...groups.get(comp.get(b.id)) ?? [], b]);
  for (const members of groups.values()) {
    const root = [...members].sort(compareBridgeId)[0];
    for (const m of members) rootOf[m.id] = root.id;
  }
  const roots = [...new Set(Object.values(rootOf))];
  const rpc = {};
  for (const b of bridges) rpc[b.id] = roots.includes(b.id) ? 0 : Infinity;
  const otherEnd = (l, x) => l.a === x ? l.b : l.a;
  const costAt = (l) => pathCost(l.speedMbps);
  for (let i = 0; i < bridges.length; i++) {
    for (const l of up) {
      for (const [from, to] of [[l.a, l.b], [l.b, l.a]]) {
        if (rootOf[from] === rootOf[to] && rpc[from] + costAt(l) < rpc[to]) rpc[to] = rpc[from] + costAt(l);
      }
    }
  }
  const portNo = (l, x) => l.a === x ? l.aPort : l.bPort;
  const rootPortLink = /* @__PURE__ */ new Map();
  for (const b of bridges) {
    if (roots.includes(b.id)) continue;
    const cand = up.filter((l) => l.a === b.id || l.b === b.id).map((l) => {
      const n = by.get(otherEnd(l, b.id));
      return { l, cost: rpc[n.id] + costAt(l), n, np: portNo(l, n.id), own: portNo(l, b.id) };
    }).filter((c) => Number.isFinite(c.cost) && c.cost === rpc[b.id]).sort((x, y) => compareBridgeId(x.n, y.n) || x.np - y.np || x.own - y.own);
    if (cand[0]) rootPortLink.set(b.id, cand[0].l.id);
  }
  const ports = [];
  const activeLinks = [];
  const blockedLinks = [];
  for (const l of up) {
    const A = by.get(l.a);
    const B = by.get(l.b);
    const aWins = rpc[A.id] !== rpc[B.id] ? rpc[A.id] < rpc[B.id] : compareBridgeId(A, B) !== 0 ? compareBridgeId(A, B) < 0 : l.aPort <= l.bPort;
    const make = (x, designatedHere) => {
      const isRootPort = rootPortLink.get(x.id) === l.id;
      const role = isRootPort ? "root" : designatedHere ? "designated" : "alternate";
      return { bridge: x.id, link: l.id, port: portNo(l, x.id), role, forwarding: role !== "alternate", cost: costAt(l) };
    };
    const pa = make(A, aWins);
    const pb = make(B, !aWins);
    ports.push(pa, pb);
    (pa.forwarding && pb.forwarding ? activeLinks : blockedLinks).push(l.id);
  }
  return {
    rootOf,
    roots,
    rootPathCost: Object.fromEntries(Object.entries(rpc).map(([k, v]) => [k, Number.isFinite(v) ? v : 0])),
    ports,
    activeLinks,
    blockedLinks,
    downLinks: links.filter((l) => !l.up).map((l) => l.id)
  };
}

// src/lib/sim/l2.ts
var key = (dev, bridge2) => `${dev.id}|${bridge2}`;
function computeNetworkStp(net) {
  const bridges = [];
  const owner = /* @__PURE__ */ new Map();
  for (const dev of net.devices.values()) {
    for (const b of dev.bridges) {
      if (b.protocolMode === "none") continue;
      const id = key(dev, b.name);
      bridges.push({ id, priority: b.priority, mac: dev.macOf(b.name) });
      owner.set(id, { dev, bridge: b });
    }
  }
  const links = [];
  for (const c of net.cables) {
    const da = net.devices.get(c.a.dev);
    const db = net.devices.get(c.b.dev);
    if (!da || !db) continue;
    const pa = da.bridgePort(c.a.iface);
    const pb = db.bridgePort(c.b.iface);
    if (!pa || !pb || pa.disabled || pb.disabled) continue;
    const ba = key(da, pa.bridge);
    const bb = key(db, pb.bridge);
    if (!owner.has(ba) || !owner.has(bb)) continue;
    if (!da.running(c.a.iface) || !db.running(c.b.iface)) continue;
    links.push({ id: `${ba}:${pa.iface}~${bb}:${pb.iface}`, a: ba, b: bb, aPort: da.portNumber(pa), bPort: db.portNumber(pb), speedMbps: 1e3, up: true });
  }
  const res = computeStp(bridges, links);
  const ports = /* @__PURE__ */ new Map();
  for (const p of res.ports) ports.set(`${p.bridge}#${p.port}`, { role: p.role, forwarding: p.forwarding, cost: p.cost, linked: true });
  return {
    port(dev, bridge2, iface) {
      const bp = dev.bridgePort(iface);
      const br = dev.bridge(bridge2);
      if (!bp || !br) return { role: "disabled", forwarding: false, cost: 2e4, linked: false };
      if (bp.disabled || !dev.running(iface)) return { role: "disabled", forwarding: false, cost: 2e4, linked: false };
      if (br.protocolMode === "none") return { role: "designated", forwarding: true, cost: 2e4, linked: false };
      return ports.get(`${key(dev, bridge2)}#${dev.portNumber(bp)}`) ?? { role: "designated", forwarding: true, cost: 2e4, linked: false };
    },
    bridge(dev, bridge2) {
      const br = dev.bridge(bridge2);
      const mine = dev.bports.filter((p) => p.bridge === bridge2);
      const own = { priority: br.priority, mac: dev.macOf(bridge2) };
      if (br.protocolMode === "none") return { rootBridge: true, rootId: `0x${bridgeIdText({ id: "", ...own })}`, rootCost: 0, rootPort: null, ports: mine.length, designated: mine.length };
      const id = key(dev, bridge2);
      const rootIdKey = res.rootOf[id];
      const rootBr = bridges.find((b) => b.id === rootIdKey) ?? bridges.find((b) => b.id === id);
      const states = mine.map((p) => ({ p, s: ports.get(`${id}#${dev.portNumber(p)}`) }));
      const rootPort = states.find((x) => x.s?.role === "root")?.p.iface ?? null;
      return {
        rootBridge: res.roots.includes(id),
        rootId: `0x${bridgeIdText(rootBr)}`,
        rootCost: res.rootPathCost[id] ?? 0,
        rootPort,
        ports: mine.length,
        designated: states.filter((x) => !x.s || x.s.role === "designated").length
      };
    }
  };
}
var memberVlan = (dev, bridge2, name, vid) => {
  let tagged = false;
  let untagged = false;
  for (const v of dev.bvlans) {
    if (v.bridge !== bridge2 || !v.vlanIds.includes(vid)) continue;
    if (v.tagged.includes(name)) tagged = true;
    if (v.untagged.includes(name)) untagged = true;
  }
  return { tagged, untagged };
};
function portMembership(dev, br, port, vid) {
  const m = memberVlan(dev, br.name, port.iface, vid);
  if (port.pvid === vid && !m.tagged) m.untagged = true;
  return m;
}
function bridgeMembership(dev, br, vid) {
  const m = memberVlan(dev, br.name, br.name, vid);
  if (vid === br.pvid && !m.tagged) m.untagged = true;
  return m;
}
function segment(net, origin, ifaceName, srcMac) {
  const stp = computeNetworkStp(net);
  const endpoints = [];
  const seen = /* @__PURE__ */ new Set();
  let loop = false;
  const emit = (dev, port, tag) => {
    if (!dev.running(port)) return;
    const p = net.peer(dev.id, port);
    if (!p || p.iface.disabled) return;
    receive(p.dev, p.ifaceName, tag);
  };
  const learn = (dev, bridge2, vid, port) => {
    if (!srcMac) return;
    if (dev.hosts.some((h) => h.mac === srcMac && h.vid === vid && h.bridge === bridge2 && h.port === port)) return;
    dev.hosts = dev.hosts.filter((h) => !(h.mac === srcMac && h.vid === vid && h.bridge === bridge2));
    dev.hosts.push({ mac: srcMac, vid, port, bridge: bridge2 });
  };
  const flood = (dev, br, exceptPort, vid) => {
    for (const q2 of dev.bports.filter((x) => x.bridge === br.name && x.iface !== exceptPort && !x.disabled)) {
      if (!stp.port(dev, br.name, q2.iface).forwarding) continue;
      if (br.vlanFiltering) {
        const m = portMembership(dev, br, q2, vid);
        if (m.tagged) emit(dev, q2.iface, vid);
        else if (m.untagged) emit(dev, q2.iface, null);
      } else emit(dev, q2.iface, vid);
    }
  };
  const toBridgeCpu = (dev, br, vid, tagIn) => {
    if (br.vlanFiltering) {
      const m = bridgeMembership(dev, br, vid);
      if (m.untagged) endpoints.push({ dev, iface: br.name });
      else if (m.tagged) {
        const v = dev.ifaces.find((i2) => i2.type === "vlan" && i2.parent === br.name && i2.vlanId === vid && !i2.disabled);
        if (v) endpoints.push({ dev, iface: v.name });
      }
    } else if (tagIn === null) endpoints.push({ dev, iface: br.name });
    else {
      const v = dev.ifaces.find((i2) => i2.type === "vlan" && i2.parent === br.name && i2.vlanId === tagIn && !i2.disabled);
      if (v) endpoints.push({ dev, iface: v.name });
    }
  };
  const receive = (dev, port, tag) => {
    const k = `${dev.id}|${port}|${tag}`;
    if (seen.has(k)) {
      loop = true;
      return;
    }
    seen.add(k);
    const bp = dev.bridgePort(port);
    if (!bp) {
      if (tag === null) {
        if (["ether", "wireguard"].includes(dev.iface(port)?.type ?? "")) endpoints.push({ dev, iface: port });
        return;
      }
      const v = dev.ifaces.find((i2) => i2.type === "vlan" && i2.parent === port && i2.vlanId === tag && !i2.disabled);
      if (v) endpoints.push({ dev, iface: v.name });
      return;
    }
    const br = dev.bridge(bp.bridge);
    if (!br || bp.disabled) return;
    if (!stp.port(dev, br.name, port).forwarding) return;
    let vid;
    if (br.vlanFiltering) {
      if (tag !== null) {
        if (bp.frameTypes === "admit-only-untagged-and-priority-tagged") return;
        vid = tag;
      } else {
        if (bp.frameTypes === "admit-only-vlan-tagged") return;
        vid = bp.pvid;
      }
      if (bp.ingressFiltering) {
        const m = portMembership(dev, br, bp, vid);
        if (!m.tagged && !m.untagged) return;
      }
    } else vid = tag;
    learn(dev, br.name, vid, port);
    toBridgeCpu(dev, br, vid, tag);
    flood(dev, br, port, vid);
  };
  const i = origin.iface(ifaceName);
  if (i) {
    if ((i.type === "ether" || i.type === "wireguard") && !origin.isSlave(ifaceName)) emit(origin, ifaceName, null);
    else if (i.type === "vlan" && i.parent) {
      const parent = origin.iface(i.parent);
      if (parent?.type === "ether" && !origin.isSlave(parent.name)) emit(origin, parent.name, i.vlanId ?? null);
      else if (parent?.type === "bridge") inject(origin, parent.name, i.vlanId ?? null);
    } else if (i.type === "bridge") inject(origin, i.name, null);
  }
  function inject(dev, bridgeName, tag) {
    const br = dev.bridge(bridgeName);
    if (!br) return;
    const vid = br.vlanFiltering ? tag ?? br.pvid : tag;
    if (br.vlanFiltering) {
      const m = bridgeMembership(dev, br, vid);
      if (!m.tagged && !m.untagged) return;
    }
    flood(dev, br, null, vid);
  }
  return { endpoints: endpoints.filter((e) => !(e.dev === origin && e.iface === ifaceName)), loop };
}
function localHosts(dev, br) {
  const mac = dev.macOf(br.name);
  const out = [{ mac, vid: null, port: br.name, local: true }];
  if (br.vlanFiltering) {
    const ids = /* @__PURE__ */ new Set([br.pvid]);
    for (const v of dev.bvlans) if (v.bridge === br.name) for (const id of v.vlanIds) ids.add(id);
    for (const id of [...ids].sort((a, b) => a - b)) out.push({ mac, vid: id, port: br.name, local: true });
  }
  return out;
}

// src/lib/sim/menus-l2.ts
var YES_NO = ["yes", "no"];
var IFACE_FLAGS = [
  { letter: "X", name: "DISABLED", group: 0 },
  { letter: "R", name: "RUNNING", group: 0 },
  { letter: "S", name: "SLAVE", group: 1 }
];
var hexPriority = (n) => `0x${n.toString(16)}`;
function parsePriority(v) {
  const n = /^0x[0-9a-f]+$/i.test(v) ? parseInt(v, 16) : /^\d+$/.test(v) ? Number(v) : NaN;
  if (Number.isNaN(n) || n < 0 || n > 61440 || n % 4096 !== 0) throw new CliError("invalid value for argument priority");
  return n;
}
function parseVlanIds(v) {
  const out = [];
  for (const part of v.split(",")) {
    const m = /^(\d+)(?:-(\d+))?$/.exec(part.trim());
    if (!m) throw new CliError("invalid value for argument vlan-ids");
    const a = Number(m[1]);
    const b = m[2] === void 0 ? a : Number(m[2]);
    if (a < 1 || b > 4094 || a > b) throw new CliError("value of vlan-range out of range (1..4094)");
    for (let i = a; i <= b; i++) out.push(i);
  }
  return [...new Set(out)].sort((x, y) => x - y);
}
function idText(ids) {
  const parts = [];
  for (let i = 0; i < ids.length; ) {
    let j = i;
    while (ids[j + 1] === ids[j] + 1) j++;
    parts.push(j > i ? `${ids[i]}-${ids[j]}` : String(ids[i]));
    i = j + 1;
  }
  return parts.join(",");
}
function ifaceList(d, v, field) {
  const names = v === "" ? [] : v.split(",").map((s) => s.trim());
  for (const n of names) if (!d.iface(n)) throw new CliError(`input does not match any value of ${field}`);
  return names;
}
var findBridge = (d, name) => {
  const b = d.bridge(name);
  if (!b) throw new CliError("input does not match any value of bridge");
  return b;
};
var interfaceMenu = {
  path: ["interface"],
  entries(d) {
    return d.ifaces.map((i, n) => ({
      index: n,
      flags: `${i.disabled ? "X" : d.running(i.name) ? "R" : ""}${d.isSlave(i.name) ? "S" : ""}`,
      props: {
        ...i.comment ? { comment: i.comment } : {},
        name: i.name,
        ...i.type === "ether" || i.type === "loopback" ? { "default-name": i.name } : {},
        type: i.type,
        mtu: i.type === "bridge" ? "auto" : i.type === "loopback" ? "65536" : "1500",
        "actual-mtu": i.type === "loopback" ? "65536" : "1500",
        ...i.type === "bridge" ? { l2mtu: "65535" } : i.type === "vlan" ? { l2mtu: "65531" } : {},
        "mac-address": d.macOf(i.name),
        "link-downs": "0",
        disabled: i.disabled ? "yes" : "no"
      },
      ref: i
    }));
  },
  toggle(_d, e, off) {
    e.ref.disabled = off;
  },
  render(_d, rows, mode) {
    if (mode === "terse") return renderTerse(rows.map((e) => ({ index: e.index, flags: e.flags, props: Object.entries(e.props).filter(([k]) => k !== "disabled") })));
    const withL2 = rows.some((e) => e.props.l2mtu);
    const cols = [{ title: "NAME" }, { title: "TYPE" }, { title: "ACTUAL-MTU", align: "right" }, ...withL2 ? [{ title: "L2MTU", align: "right" }] : [], { title: "MAC-ADDRESS" }];
    const t = rows.map((e) => ({ index: e.index, flags: e.flags, comment: e.props.comment, cells: [e.props.name, e.props.type, e.props["actual-mtu"], ...withL2 ? [e.props.l2mtu ?? ""] : [], e.props["mac-address"]] }));
    return renderTable(cols, t, IFACE_FLAGS);
  }
};
function bridgeEntries(d) {
  return d.bridges.map((b, i) => ({
    index: i,
    flags: `R`,
    props: {
      ...b.comment ? { comment: b.comment } : {},
      name: b.name,
      mtu: "auto",
      "actual-mtu": "1500",
      l2mtu: "65535",
      arp: "enabled",
      "arp-timeout": "auto",
      "mac-address": d.macOf(b.name),
      "protocol-mode": b.protocolMode,
      "fast-forward": "yes",
      "igmp-snooping": "no",
      "auto-mac": "yes",
      "ageing-time": "5m",
      priority: hexPriority(b.priority),
      "max-message-age": "20s",
      "forward-delay": "15s",
      "transmit-hold-count": "6",
      "vlan-filtering": b.vlanFiltering ? "yes" : "no",
      ...b.vlanFiltering ? { "ether-type": "0x8100", pvid: String(b.pvid), "frame-types": "admit-all", "ingress-filtering": "yes" } : {},
      "dhcp-snooping": "no",
      "port-cost-mode": "long",
      mvrp: "no",
      "max-learned-entries": "auto"
    },
    ref: b
  }));
}
var bridgeFields = [
  { name: "name", kind: "string" },
  { name: "protocol-mode", kind: "enum", values: ["rstp", "stp", "none"] },
  { name: "priority", kind: "string" },
  { name: "vlan-filtering", kind: "enum", values: YES_NO },
  { name: "comment", kind: "string" }
];
var bridgeMenu = {
  path: ["interface", "bridge"],
  fields: bridgeFields,
  required: ["name"],
  entries: bridgeEntries,
  add(d, a) {
    if (d.iface(a.name)) throw new CliError("failure: already have interface with such name");
    const prio = a.priority !== void 0 ? parsePriority(a.priority) : 32768;
    d.bridges.push({ name: a.name, protocolMode: a["protocol-mode"] ?? "rstp", priority: prio, vlanFiltering: a["vlan-filtering"] === "yes", pvid: 1, comment: a.comment });
    d.ifaces.push({ name: a.name, mac: `DA:75:10:88:${(64 + d.index).toString(16).toUpperCase()}:${(91 + d.bridges.length).toString(16).toUpperCase().padStart(2, "0")}`, disabled: false, type: "bridge", comment: a.comment });
  },
  remove(d, e) {
    const b = e.ref;
    d.bports = d.bports.filter((p) => p.bridge !== b.name);
    d.bvlans = d.bvlans.filter((v) => v.bridge !== b.name);
    const gone = /* @__PURE__ */ new Set([b.name, ...d.ifaces.filter((i) => i.type === "vlan" && i.parent === b.name).map((i) => i.name)]);
    d.addrs = d.addrs.filter((a) => !gone.has(a.iface));
    d.ifaces = d.ifaces.filter((i) => !gone.has(i.name));
    d.bridges = d.bridges.filter((x) => x !== b);
  },
  set(d, e, a) {
    const b = e.ref;
    if (a["protocol-mode"]) b.protocolMode = a["protocol-mode"];
    if (a.priority !== void 0) b.priority = parsePriority(a.priority);
    if (a["vlan-filtering"]) b.vlanFiltering = a["vlan-filtering"] === "yes";
    if ("comment" in a) {
      b.comment = a.comment || void 0;
      const i = d.iface(b.name);
      if (i) i.comment = b.comment;
    }
  },
  render(_d, rows, mode) {
    if (mode === "terse") return renderTerse(rows.map((e) => ({ index: e.index, flags: e.flags, props: Object.entries(e.props) })));
    return renderBlocks(`Flags: X - disabled, R - running${rows.length ? " " : ""}`, rows.map((e) => ({ index: e.index ?? 0, flags: e.flags, comment: e.props.comment, props: Object.entries(e.props).filter(([k]) => k !== "comment").map(([k, v]) => [k, k === "name" ? `"${v}"` : v]) })), 1);
  },
  extra: {
    monitor(d, a) {
      const sel = a.bare[0]?.text;
      const b = sel ? d.bridges.find((x) => x.name === sel) ?? d.bridges[Number(sel)] : d.bridges[0];
      if (!b) throw new CliError("no such item");
      const st = computeNetworkStp(d.net).bridge(d, b.name);
      const lines = [
        ["state", "enabled"],
        ["current-mac-address", d.macOf(b.name)],
        ["root-bridge", st.rootBridge ? "yes" : "no"],
        ["root-bridge-id", st.rootId],
        ["root-path-cost", String(st.rootCost)],
        ["root-port", st.rootPort ?? "none"],
        ["port-count", String(st.ports)],
        ["designated-port-count", String(st.designated)],
        ["fast-forward", "no"]
      ];
      return [...b.comment ? [`${" ".repeat(21)};;; ${b.comment}`] : [], ...lines.map(([k, v]) => `${k.padStart(23)}: ${v}`)].join("\n");
    }
  }
};
var FRAME_TYPES = ["admit-all", "admit-only-vlan-tagged", "admit-only-untagged-and-priority-tagged"];
function portEntries(d) {
  return d.bports.map((p, i) => ({
    index: i,
    flags: p.disabled ? "X" : d.running(p.iface) ? "" : "I",
    props: {
      ...p.comment ? { comment: p.comment } : {},
      interface: p.iface,
      bridge: p.bridge,
      priority: "0x80",
      edge: p.edge,
      "point-to-point": "auto",
      learn: "auto",
      horizon: "none",
      hw: "yes",
      "auto-isolate": "no",
      "restricted-role": "no",
      "restricted-tcn": "no",
      pvid: String(p.pvid),
      "frame-types": p.frameTypes,
      "ingress-filtering": p.ingressFiltering ? "yes" : "no",
      "unknown-unicast-flood": "yes",
      "unknown-multicast-flood": "yes",
      "broadcast-flood": "yes",
      "tag-stacking": "no",
      "bpdu-guard": p.bpduGuard ? "yes" : "no",
      trusted: "no",
      "mvrp-registrar-state": "normal",
      "mvrp-applicant-state": "normal-participant",
      "multicast-router": "temporary-query",
      "fast-leave": "no",
      disabled: p.disabled ? "yes" : "no"
    },
    ref: p
  }));
}
var portMenu = {
  path: ["interface", "bridge", "port"],
  fields: [
    { name: "bridge", kind: "string" },
    { name: "interface", kind: "string" },
    { name: "pvid", kind: "int" },
    { name: "frame-types", kind: "enum", values: FRAME_TYPES },
    { name: "ingress-filtering", kind: "enum", values: YES_NO },
    { name: "edge", kind: "enum", values: ["auto", "yes", "no"] },
    { name: "bpdu-guard", kind: "enum", values: YES_NO },
    { name: "comment", kind: "string" },
    { name: "disabled", kind: "enum", values: YES_NO }
  ],
  required: ["bridge", "interface"],
  entries: portEntries,
  add(d, a) {
    findBridge(d, a.bridge);
    const i = d.iface(a.interface);
    if (!i || i.type === "bridge" || i.type === "loopback") throw new CliError("invalid value for argument interface:\n    input does not match any value of interface\n    input does not match any value of interface-list");
    if (d.bridgePort(a.interface)) throw new CliError("failure: device already added as bridge port");
    const pvid = a.pvid !== void 0 ? Number(a.pvid) : 1;
    if (pvid < 1 || pvid > 4094) throw new CliError("value of pvid out of range (1..4094)");
    d.bports.push({ bridge: a.bridge, iface: a.interface, pvid, frameTypes: a["frame-types"] ?? "admit-all", ingressFiltering: a["ingress-filtering"] !== "no", edge: a.edge ?? "auto", bpduGuard: a["bpdu-guard"] === "yes", disabled: a.disabled === "yes", comment: a.comment });
  },
  remove(d, e) {
    d.bports = d.bports.filter((p) => p !== e.ref);
  },
  toggle(_d, e, off) {
    e.ref.disabled = off;
  },
  set(_d, e, a) {
    const p = e.ref;
    if (a.pvid !== void 0) {
      const n = Number(a.pvid);
      if (n < 1 || n > 4094) throw new CliError("value of pvid out of range (1..4094)");
      p.pvid = n;
    }
    if (a["frame-types"]) p.frameTypes = a["frame-types"];
    if (a["ingress-filtering"]) p.ingressFiltering = a["ingress-filtering"] === "yes";
    if (a.edge) p.edge = a.edge;
    if (a["bpdu-guard"]) p.bpduGuard = a["bpdu-guard"] === "yes";
    if ("comment" in a) p.comment = a.comment || void 0;
    if (a.disabled) p.disabled = a.disabled === "yes";
  },
  render(_d, rows, mode) {
    if (mode === "terse") return renderTerse(rows.map((e) => ({ index: e.index, flags: e.flags, props: Object.entries(e.props).filter(([k]) => k !== "disabled") })));
    const t = rows.map((e) => ({ index: e.index, flags: e.flags, comment: e.props.comment, cells: [e.props.interface, e.props.bridge, e.props.hw, e.props.pvid, e.props.priority, e.props.horizon] }));
    return renderTable([{ title: "INTERFACE" }, { title: "BRIDGE" }, { title: "HW" }, { title: "PVID", align: "right" }, { title: "PRIORITY" }, { title: "HORIZON" }], t, [{ letter: "X", name: "DISABLED", group: 0 }, { letter: "I", name: "INACTIVE", group: 0 }, { letter: "D", name: "DYNAMIC", group: 0 }]);
  },
  extra: {
    monitor(d, a) {
      const all = d.bports;
      const sel = a.bare.find((t) => t.text.startsWith("["))?.text;
      let ports = all;
      if (!sel) {
        const named = a.bare.filter((t) => t.text !== "once").map((t) => t.text);
        if (named.length) ports = all.filter((p, i) => named.includes(p.iface) || named.includes(String(i)));
      }
      if (!ports.length) throw new CliError("no such item");
      const stp = computeNetworkStp(d.net);
      const rows = [
        ["interface", []],
        ["status", []],
        ["port-number", []],
        ["role", []],
        ["edge-port", []],
        ["edge-port-discovery", []],
        ["point-to-point-port", []],
        ["external-fdb", []],
        ["sending-rstp", []],
        ["learning", []],
        ["forwarding", []],
        ["actual-path-cost", []]
      ];
      const put = (k, v) => rows.find(([n]) => n === k)[1].push(v);
      for (const p of ports) {
        const s = stp.port(d, p.bridge, p.iface);
        const up = d.running(p.iface) && !p.disabled;
        put("interface", p.iface);
        put("status", up ? "in-bridge" : "inactive");
        put("port-number", up ? String(d.portNumber(p)) : "");
        put("role", up ? `${s.role === "disabled" ? "disabled" : s.role}-port` : "");
        const edge = p.edge === "yes" || p.edge === "auto" && !s.linked;
        put("edge-port", up ? edge ? "yes" : "no" : "");
        put("edge-port-discovery", up ? p.edge === "auto" ? "yes" : "no" : "");
        put("point-to-point-port", up ? "yes" : "");
        put("external-fdb", up ? "no" : "");
        put("sending-rstp", up ? p.edge === "yes" ? "yes" : "yes" : "");
        put("learning", up ? s.forwarding ? "yes" : "no" : "");
        put("forwarding", up ? s.forwarding ? "yes" : "no" : "");
        put("actual-path-cost", up ? String(s.cost) : "");
      }
      const widths = ports.map((_, i) => Math.max(...rows.map(([, v]) => v[i].length)) + 1);
      return rows.map(([k, v]) => `${k.padStart(23)}: ${v.map((x, i) => x.padEnd(widths[i])).join("")}`.replace(/\s+$/, "")).join("\n");
    }
  }
};
function vlanRows(d) {
  const rows = d.bvlans.map((v) => ({ bridge: v.bridge, ids: v.vlanIds, tagged: v.tagged, untagged: v.untagged, comment: v.comment, dynamic: false, ref: v }));
  for (const b of d.bridges) {
    if (!b.vlanFiltering) continue;
    const dyn = /* @__PURE__ */ new Map();
    const explicitUntagged = (id, name) => d.bvlans.some((v) => v.bridge === b.name && v.vlanIds.includes(id) && (v.untagged.includes(name) || v.tagged.includes(name)));
    for (const p of d.bports.filter((x) => x.bridge === b.name)) if (!explicitUntagged(p.pvid, p.iface)) dyn.set(p.pvid, [...dyn.get(p.pvid) ?? [], p.iface]);
    if (!explicitUntagged(b.pvid, b.name)) dyn.set(b.pvid, [...dyn.get(b.pvid) ?? [], b.name]);
    for (const [id, names] of [...dyn.entries()].sort((x, y) => x[0] - y[0])) rows.push({ bridge: b.name, ids: [id], tagged: [], untagged: names, comment: "added by pvid", dynamic: true, ref: null });
  }
  return rows;
}
var vlanTableMenu = {
  path: ["interface", "bridge", "vlan"],
  skipDynamic: true,
  fields: [
    { name: "bridge", kind: "string" },
    { name: "vlan-ids", kind: "string" },
    { name: "tagged", kind: "string" },
    { name: "untagged", kind: "string" },
    { name: "comment", kind: "string" }
  ],
  required: ["bridge", "vlan-ids"],
  entries(d) {
    return vlanRows(d).map((r, i) => ({
      index: i,
      flags: r.dynamic ? "D" : "",
      props: {
        ...r.comment ? { comment: r.comment } : {},
        bridge: r.bridge,
        "vlan-ids": idText(r.ids),
        tagged: r.tagged.join(","),
        untagged: r.untagged.join(","),
        dynamic: r.dynamic ? "yes" : "no",
        "mvrp-forbidden": "",
        "current-tagged": d.bridge(r.bridge)?.vlanFiltering ? r.tagged.join(",") : "",
        "current-untagged": d.bridge(r.bridge)?.vlanFiltering ? r.untagged.join(",") : ""
      },
      ref: r.ref
    }));
  },
  add(d, a) {
    findBridge(d, a.bridge);
    const ids = parseVlanIds(a["vlan-ids"]);
    const tagged = ifaceList(d, a.tagged ?? "", "tagged");
    const untagged = ifaceList(d, a.untagged ?? "", "untagged");
    if (tagged.some((n) => untagged.includes(n))) throw new CliError("failure: interface cannot be in tagged and untagged at the same time");
    d.bvlans.push({ bridge: a.bridge, vlanIds: ids, tagged, untagged, comment: a.comment });
  },
  remove(d, e) {
    d.bvlans = d.bvlans.filter((v) => v !== e.ref);
  },
  set(d, e, a) {
    const v = e.ref;
    const tagged = a.tagged !== void 0 ? ifaceList(d, a.tagged, "tagged") : v.tagged;
    const untagged = a.untagged !== void 0 ? ifaceList(d, a.untagged, "untagged") : v.untagged;
    if (tagged.some((n) => untagged.includes(n))) throw new CliError("failure: interface cannot be in tagged and untagged at the same time");
    if (a["vlan-ids"] !== void 0) v.vlanIds = parseVlanIds(a["vlan-ids"]);
    v.tagged = tagged;
    v.untagged = untagged;
    if ("comment" in a) v.comment = a.comment || void 0;
  },
  render(_d, rows, mode) {
    if (mode === "terse") return renderTerse(rows.map((e) => ({ index: e.index, flags: e.flags, props: Object.entries(e.props).filter(([k]) => k !== "dynamic") })));
    const showTagged = rows.some((e) => e.props["current-tagged"]);
    const showUntagged = rows.some((e) => e.props["current-untagged"]);
    const cols = [{ title: "BRIDGE" }, { title: "VLAN-IDS", align: "right" }, ...showTagged ? [{ title: "CURRENT-TAGGED" }] : [], ...showUntagged ? [{ title: "CURRENT-UNTAGGED" }] : []];
    const t = rows.map((e) => ({
      index: e.index,
      flags: e.flags,
      comment: e.props.comment,
      cells: [e.props.bridge, e.props["vlan-ids"], ...showTagged ? [e.props["current-tagged"].split(",").join("\n")] : [], ...showUntagged ? [e.props["current-untagged"].split(",").join("\n")] : []]
    }));
    return renderTable(cols, t, [{ letter: "D", name: "DYNAMIC", group: 0 }]);
  }
};
var hostMenu = {
  path: ["interface", "bridge", "host"],
  entries(d) {
    const rows = [];
    for (const b of d.bridges) {
      for (const h of localHosts(d, b)) rows.push({ index: rows.length, flags: "DL", props: { "mac-address": h.mac, ...h.vid === null ? {} : { vid: String(h.vid) }, interface: h.port, bridge: b.name, "on-interface": h.port }, ref: h });
      for (const h of d.hosts.filter((x) => x.bridge === b.name)) rows.push({ index: rows.length, flags: "D", props: { "mac-address": h.mac, ...h.vid === null ? {} : { vid: String(h.vid) }, interface: h.port, bridge: b.name, "on-interface": h.port }, ref: h });
    }
    return rows;
  },
  render(_d, rows, mode) {
    if (mode === "terse") return renderTerse(rows.map((e) => ({ index: e.index, flags: e.flags, props: Object.entries(e.props) })));
    const t = rows.map((e) => ({ index: e.index, flags: e.flags, cells: [e.props["mac-address"], e.props.vid ?? "", e.props["on-interface"], e.props.bridge] }));
    return renderTable([{ title: "MAC-ADDRESS" }, { title: "VID", align: "right" }, { title: "ON-INTERFACE" }, { title: "BRIDGE" }], t, [{ letter: "D", name: "DYNAMIC", group: 0 }, { letter: "L", name: "LOCAL", group: 1 }]);
  }
};
var vlanIfaceMenu = {
  path: ["interface", "vlan"],
  fields: [
    { name: "name", kind: "string" },
    { name: "vlan-id", kind: "int" },
    { name: "interface", kind: "string" },
    { name: "comment", kind: "string" },
    { name: "disabled", kind: "enum", values: YES_NO }
  ],
  required: ["name", "vlan-id", "interface"],
  entries(d) {
    return d.ifaces.filter((i) => i.type === "vlan").map((i, n) => ({
      index: n,
      flags: i.disabled ? "X" : d.running(i.name) ? "R" : "",
      props: {
        ...i.comment ? { comment: i.comment } : {},
        name: i.name,
        mtu: "1500",
        l2mtu: "65531",
        "mac-address": d.macOf(i.name),
        arp: "enabled",
        "arp-timeout": "auto",
        "loop-protect": "default",
        "loop-protect-status": "off",
        "loop-protect-send-interval": "5s",
        "loop-protect-disable-time": "5m",
        "vlan-id": String(i.vlanId),
        interface: i.parent ?? "",
        "use-service-tag": "no",
        mvrp: "no",
        disabled: i.disabled ? "yes" : "no"
      },
      ref: i
    }));
  },
  add(d, a) {
    const id = Number(a["vlan-id"]);
    if (id < 1 || id > 4094) throw new CliError("value of vlan-id out of range (1..4094)");
    const parent = d.iface(a.interface);
    if (!parent || parent.type === "loopback" || parent.type === "vlan") throw new CliError("input does not match any value of interface");
    if (d.iface(a.name)) throw new CliError("failure: already have interface with such name");
    d.ifaces.push({ name: a.name, mac: parent.mac, disabled: a.disabled === "yes", type: "vlan", vlanId: id, parent: a.interface, comment: a.comment });
  },
  remove(d, e) {
    const i = e.ref;
    d.addrs = d.addrs.filter((a) => a.iface !== i.name);
    d.ifaces = d.ifaces.filter((x) => x !== e.ref);
  },
  toggle(_d, e, off) {
    e.ref.disabled = off;
  },
  set(d, e, a) {
    const i = e.ref;
    if (a["vlan-id"]) i.vlanId = Number(a["vlan-id"]);
    if ("comment" in a) i.comment = a.comment || void 0;
    void d;
  },
  render(_d, rows, mode) {
    if (mode === "terse") return renderTerse(rows.map((e) => ({ index: e.index, flags: e.flags, props: Object.entries(e.props).filter(([k]) => k !== "disabled") })));
    const t = rows.map((e) => ({ index: e.index, flags: e.flags, comment: e.props.comment, cells: [e.props.name, e.props.mtu, e.props.arp, e.props["vlan-id"], e.props.interface] }));
    return renderTable([{ title: "NAME" }, { title: "MTU", align: "right" }, { title: "ARP" }, { title: "VLAN-ID", align: "right" }, { title: "INTERFACE" }], t, [{ letter: "R", name: "RUNNING", group: 0 }, { letter: "X", name: "DISABLED", group: 0 }]);
  }
};
var poolMenu = {
  path: ["ip", "pool"],
  fields: [{ name: "name", kind: "string" }, { name: "ranges", kind: "string" }],
  required: ["name", "ranges"],
  entries: (d) => d.pools.map((p, i) => ({ index: i, flags: "", props: { name: p.name, ranges: p.ranges }, ref: p })),
  add(d, a) {
    if (d.pools.some((p) => p.name === a.name)) throw new CliError("failure: pool with such name exists");
    for (const r of a.ranges.split(",")) {
      const [lo, hi] = r.trim().split("-");
      if (parseIPv4(lo) === null || hi !== void 0 && parseIPv4(hi) === null) throw new CliError("invalid value for argument ranges");
    }
    d.pools.push({ name: a.name, ranges: a.ranges });
  },
  remove(d, e) {
    d.pools = d.pools.filter((p) => p !== e.ref);
  },
  set(_d, e, a) {
    const p = e.ref;
    if (a.ranges) p.ranges = a.ranges;
    if (a.name) p.name = a.name;
  },
  render(_d, rows, mode) {
    if (mode === "terse") return renderTerse(rows.map((e) => ({ index: e.index, flags: e.flags, props: Object.entries(e.props) })));
    const t = rows.map((e) => ({ index: e.index, flags: "", cells: [e.props.name, e.props.ranges] }));
    return renderTable([{ title: "NAME" }, { title: "RANGES" }], t, []);
  }
};
var dhcpServerMenu = {
  path: ["ip", "dhcp-server"],
  fields: [
    { name: "name", kind: "string" },
    { name: "interface", kind: "iface" },
    { name: "address-pool", kind: "string" },
    { name: "lease-time", kind: "string" },
    { name: "disabled", kind: "enum", values: YES_NO }
  ],
  required: ["name", "interface"],
  entries: (d) => d.dhcpServers.map((s, i) => ({ index: i, flags: s.disabled ? "X" : d.activeAddrs().some((a) => a.iface === s.iface) ? "" : "I", props: { name: s.name, interface: s.iface, "lease-time": s.leaseTime, "address-pool": s.pool, "use-radius": "no", "lease-script": "", disabled: s.disabled ? "yes" : "no" }, ref: s })),
  add(d, a) {
    const pool = a["address-pool"] ?? "static-only";
    if (pool !== "static-only" && !d.pools.some((p) => p.name === pool)) throw new CliError("input does not match any value of address-pool");
    d.dhcpServers.push({ name: a.name, iface: a.interface, pool, leaseTime: a["lease-time"] ?? "30m", disabled: a.disabled === "yes" });
  },
  remove(d, e) {
    d.dhcpServers = d.dhcpServers.filter((s) => s !== e.ref);
  },
  toggle(_d, e, off) {
    e.ref.disabled = off;
  },
  set(d, e, a) {
    const s = e.ref;
    if (a["address-pool"]) {
      if (!d.pools.some((p) => p.name === a["address-pool"])) throw new CliError("input does not match any value of address-pool");
      s.pool = a["address-pool"];
    }
    if (a["lease-time"]) s.leaseTime = a["lease-time"];
    if (a.interface) s.iface = a.interface;
  },
  render(_d, rows, mode) {
    if (mode === "terse") return renderTerse(rows.map((e) => ({ index: e.index, flags: e.flags, props: Object.entries(e.props).filter(([k]) => k !== "disabled") })));
    const t = rows.map((e) => ({ index: e.index, flags: e.flags, cells: [e.props.name, e.props.interface, e.props["address-pool"], e.props["lease-time"]] }));
    return renderTable([{ title: "NAME" }, { title: "INTERFACE" }, { title: "ADDRESS-POOL" }, { title: "LEASE-TIME" }], t, [{ letter: "X", name: "DISABLED", group: 0 }, { letter: "I", name: "INVALID", group: 0 }]);
  }
};
var dhcpNetworkMenu = {
  path: ["ip", "dhcp-server", "network"],
  fields: [{ name: "address", kind: "cidr" }, { name: "gateway", kind: "ip" }, { name: "dns-server", kind: "string" }],
  required: ["address"],
  entries: (d) => d.dhcpNetworks.map((n, i) => ({ index: i, flags: "", props: { address: n.address, ...n.gateway ? { gateway: n.gateway } : {}, ...n.dns ? { "dns-server": n.dns } : {} }, ref: n })),
  add(d, a) {
    const c = parseCidr(a.address);
    d.dhcpNetworks.push({ address: `${formatIPv4(c.net)}/${c.cidr}`, gateway: a.gateway, dns: a["dns-server"] });
  },
  remove(d, e) {
    d.dhcpNetworks = d.dhcpNetworks.filter((n) => n !== e.ref);
  },
  set(_d, e, a) {
    const n = e.ref;
    if (a.gateway) n.gateway = a.gateway;
    if (a["dns-server"]) n.dns = a["dns-server"];
  },
  render(_d, rows, mode) {
    if (mode === "terse") return renderTerse(rows.map((e) => ({ index: e.index, flags: e.flags, props: Object.entries(e.props) })));
    const t = rows.map((e) => ({ index: e.index, flags: "", cells: [e.props.address, e.props.gateway ?? "", e.props["dns-server"] ?? ""] }));
    return renderTable([{ title: "ADDRESS" }, { title: "GATEWAY" }, { title: "DNS-SERVER" }], t, []);
  }
};
var leaseMenu = {
  path: ["ip", "dhcp-server", "lease"],
  entries: (d) => d.leases.map((l, i) => ({ index: i, flags: "D", props: { address: l.address, "mac-address": l.mac, "host-name": l.hostName, server: l.server, status: "bound", "last-seen": "2s" }, ref: l })),
  remove(d, e) {
    d.leases = d.leases.filter((l) => l !== e.ref);
  },
  render(_d, rows, mode) {
    if (mode === "terse") return renderTerse(rows.map((e) => ({ index: e.index, flags: e.flags, props: Object.entries(e.props) })));
    const t = rows.map((e) => ({ index: e.index, flags: e.flags, cells: [e.props.address, e.props["mac-address"], e.props["host-name"], e.props.server, e.props.status, e.props["last-seen"]] }));
    return renderTable([{ title: "ADDRESS" }, { title: "MAC-ADDRESS" }, { title: "HOST-NAME" }, { title: "SERVER" }, { title: "STATUS" }, { title: "LAST-SEEN" }], t, [{ letter: "D", name: "DYNAMIC", group: 0 }]);
  }
};
for (const m of [interfaceMenu, bridgeMenu, portMenu, vlanTableMenu, hostMenu, vlanIfaceMenu, poolMenu, dhcpServerMenu, dhcpNetworkMenu, leaseMenu]) registerMenu(m);

// src/lib/sim/menus-sys.ts
function kv(pairs) {
  const w = Math.max(...pairs.map(([k]) => k.length)) + 2;
  return pairs.map(([k, v]) => `${k.padStart(w)}: ${v}`.replace(/ +$/, " ")).join("\n") + "\n";
}
var wantsPrint = (a) => !a.bare.length || a.bare[0].text === "print";
registerTool({
  path: ["system", "resource"],
  run(_d, a) {
    if (!wantsPrint(a)) throw new CliError(`bad command name ${a.bare[0].text} (line 1 column ${a.bare[0].start + 1})`);
    return kv([
      ["uptime", "1h4m12s"],
      ["version", "7.16 (stable)"],
      ["build-time", "2024-09-20 13:00:27"],
      ["factory-software", "7.1"],
      ["free-memory", "168.5MiB"],
      ["total-memory", "384.0MiB"],
      ["cpu", "QEMU"],
      ["cpu-count", "1"],
      ["cpu-frequency", "2611MHz"],
      ["cpu-load", "1%"],
      ["free-hdd-space", "71.2MiB"],
      ["total-hdd-space", "89.2MiB"],
      ["write-sect-since-reboot", "1712"],
      ["write-sect-total", "1712"],
      ["architecture-name", "x86_64"],
      ["board-name", "CHR QEMU Standard PC (i440FX + PIIX, 1996)"],
      ["platform", "MikroTik"]
    ]);
  }
});
registerTool({
  path: ["system", "clock"],
  run(_d, a) {
    if (!wantsPrint(a)) throw new CliError(`bad command name ${a.bare[0].text} (line 1 column ${a.bare[0].start + 1})`);
    const t = /* @__PURE__ */ new Date();
    const p = (n) => String(n).padStart(2, "0");
    return kv([
      ["time", `${p(t.getHours())}:${p(t.getMinutes())}:${p(t.getSeconds())}`],
      ["date", `${t.getFullYear()}-${p(t.getMonth() + 1)}-${p(t.getDate())}`],
      ["time-zone-autodetect", "yes"],
      ["time-zone-name", "manual"],
      ["gmt-offset", "+00:00"],
      ["dst-active", "no"]
    ]);
  }
});
registerTool({
  path: ["system", "package"],
  run(_d, a) {
    if (!wantsPrint(a)) throw new CliError(`bad command name ${a.bare[0].text} (line 1 column ${a.bare[0].start + 1})`);
    const rows = [{ index: 0, flags: "", cells: ["routeros", "7.16", "2024-09-20 13:00:27", "17.8MiB"] }];
    return renderTable([{ title: "NAME" }, { title: "VERSION" }, { title: "BUILD-TIME" }, { title: "SIZE" }], rows, []) + "\n";
  }
});
registerTool({
  path: ["user"],
  run(_d, a) {
    if (!wantsPrint(a)) throw new CliError(`bad command name ${a.bare[0].text} (line 1 column ${a.bare[0].start + 1})`);
    const rows = [{ index: 0, flags: "", cells: ["admin", "full", "2026-01-01 00:00:00", "none"], comment: "system default user" }];
    return renderTable([{ title: "NAME" }, { title: "GROUP" }, { title: "LAST-LOGGED-IN" }, { title: "INACTIVITY-POLICY" }], rows, []) + "\n";
  }
});
registerTool({
  path: ["ip", "dns"],
  run(d, a) {
    if (a.bare[0]?.text === "set") {
      for (const [k, v] of Object.entries(a.named)) {
        if (k === "servers") d.dns.servers = v.value;
        else if (k === "allow-remote-requests") {
          if (v.value !== "yes" && v.value !== "no") throw new CliError(`invalid value for argument allow-remote-requests`);
          d.dns.allowRemoteRequests = v.value === "yes";
        } else throw new CliError(`expected end of command (line 1 column ${v.col - k.length})`);
      }
      return "";
    }
    if (!wantsPrint(a)) throw new CliError(`bad command name ${a.bare[0].text} (line 1 column ${a.bare[0].start + 1})`);
    return kv([
      ["servers", d.dns.servers],
      ["dynamic-servers", ""],
      ["use-doh-server", ""],
      ["verify-doh-cert", "no"],
      ["doh-max-server-connections", "5"],
      ["doh-max-concurrent-queries", "50"],
      ["doh-timeout", "5s"],
      ["allow-remote-requests", d.dns.allowRemoteRequests ? "yes" : "no"],
      ["max-udp-packet-size", "4096"],
      ["query-server-timeout", "2s"],
      ["query-total-timeout", "10s"],
      ["max-concurrent-queries", "100"],
      ["max-concurrent-tcp-sessions", "20"],
      ["cache-size", "2048KiB"],
      ["cache-max-ttl", "1w"],
      ["address-list-extra-time", "0s"],
      ["vrf", "main"],
      ["mdns-repeat-ifaces", ""],
      ["cache-used", "20KiB"]
    ]);
  }
});
registerTool({
  path: ["tool", "ping"],
  run(d, a) {
    return execPing(d, a);
  }
});

// src/lib/sim/menus-lists.ts
var stamp2 = () => {
  const t = /* @__PURE__ */ new Date();
  const p = (n) => String(n).padStart(2, "0");
  return `${t.getFullYear()}-${p(t.getMonth() + 1)}-${p(t.getDate())} ${p(t.getHours())}:${p(t.getMinutes())}:${p(t.getSeconds())}`;
};
var BUILTIN_LISTS = [
  { name: "all", comment: "contains all interfaces" },
  { name: "none", comment: "contains no interfaces" },
  { name: "dynamic", comment: "contains dynamic interfaces" },
  { name: "static", comment: "contains static interfaces" }
];
var YES_NO2 = ["yes", "no"];
var ADDR_FLAGS = [{ letter: "X", name: "DISABLED", group: 0 }, { letter: "D", name: "DYNAMIC", group: 0 }];
var addressListMenu = {
  path: ["ip", "firewall", "address-list"],
  fields: [
    { name: "list", kind: "string" },
    { name: "address", kind: "string" },
    { name: "comment", kind: "string" },
    { name: "timeout", kind: "string" },
    { name: "disabled", kind: "enum", values: YES_NO2 }
  ],
  required: ["list", "address"],
  entries: (d) => d.addressLists.map((e, i) => ({
    index: i,
    flags: `${e.disabled ? "X" : ""}${e.timeout ? "D" : ""}`,
    props: {
      ...e.comment ? { comment: e.comment } : {},
      list: e.list,
      address: e.address,
      "creation-time": stamp2(),
      ...e.timeout ? { timeout: e.timeout } : {},
      dynamic: e.timeout ? "yes" : "no",
      disabled: e.disabled ? "yes" : "no"
    },
    ref: e
  })),
  add(d, a) {
    d.addressLists.push({ list: a.list, address: a.address, comment: a.comment, disabled: a.disabled === "yes", timeout: a.timeout, created: 0 });
  },
  remove(d, e) {
    d.addressLists.splice(d.addressLists.indexOf(e.ref), 1);
  },
  toggle(_d, e, off) {
    e.ref.disabled = off;
  },
  set(_d, e, a) {
    const r = e.ref;
    if (a.list) r.list = a.list;
    if (a.address) r.address = a.address;
    if ("comment" in a) r.comment = a.comment || void 0;
    if (a.timeout) r.timeout = a.timeout;
    if (a.disabled) r.disabled = a.disabled === "yes";
  },
  render(_d, rows, mode) {
    if (mode === "terse") return renderTerse(rows.map((e) => ({ index: e.index, flags: e.flags, props: Object.entries(e.props).filter(([k]) => k !== "disabled") })));
    const t = rows.map((e) => ({ index: e.index, flags: e.flags, comment: e.props.comment, cells: [e.props.list, e.props.address, e.props["creation-time"]] }));
    return renderTable([{ title: "LIST" }, { title: "ADDRESS" }, { title: "CREATION-TIME" }], t, ADDR_FLAGS);
  },
  detail: {
    legend: "Flags: X - disabled, D - dynamic",
    flagW: 1,
    props: (e) => Object.entries(e.props).filter(([k]) => !["comment", "disabled"].includes(k))
  }
};
var LIST_FLAGS = [{ letter: "*", name: "BUILTIN", group: 0 }];
var interfaceListMenu = {
  path: ["interface", "list"],
  fields: [{ name: "name", kind: "string" }, { name: "comment", kind: "string" }],
  required: ["name"],
  entries: (d) => [
    ...BUILTIN_LISTS.map((l, i) => ({ index: i, flags: "*", props: { comment: l.comment, name: l.name, builtin: "yes" }, ref: { builtin: true, name: l.name } })),
    ...d.ifLists.map((l, i) => ({ index: BUILTIN_LISTS.length + i, flags: "", props: { ...l.comment ? { comment: l.comment } : {}, name: l.name, builtin: "no" }, ref: l }))
  ],
  add(d, a) {
    if (BUILTIN_LISTS.some((l) => l.name === a.name) || d.ifLists.some((l) => l.name === a.name)) throw new CliError("failure: list with such name already exists");
    d.ifLists.push({ name: a.name, comment: a.comment });
  },
  remove(d, e) {
    const r = e.ref;
    if (r.builtin) throw new CliError("failure: cannot remove builtin list");
    d.ifLists = d.ifLists.filter((l) => l !== e.ref);
    d.ifListMembers = d.ifListMembers.filter((m) => m.list !== r.name);
  },
  set(_d, e, a) {
    const r = e.ref;
    if (a.name) r.name = a.name;
    if ("comment" in a) r.comment = a.comment || void 0;
  },
  render(_d, rows, mode) {
    if (mode === "terse") return renderTerse(rows.map((e) => ({ index: e.index, flags: e.flags, props: [["name", e.props.name]] })));
    const t = rows.map((e) => ({ index: e.index, flags: e.flags, comment: e.props.comment, cells: [e.props.name] }));
    return renderTable([{ title: "NAME" }], t, LIST_FLAGS);
  }
};
var memberMenu = {
  path: ["interface", "list", "member"],
  fields: [{ name: "list", kind: "string" }, { name: "interface", kind: "string" }, { name: "disabled", kind: "enum", values: YES_NO2 }],
  required: ["list", "interface"],
  entries: (d) => d.ifListMembers.map((m, i) => ({ index: i, flags: m.disabled ? "X" : "", props: { list: m.list, interface: m.interface, dynamic: "no", disabled: m.disabled ? "yes" : "no" }, ref: m })),
  add(d, a) {
    if (!BUILTIN_LISTS.some((l) => l.name === a.list) && !d.ifLists.some((l) => l.name === a.list)) throw new CliError("input does not match any value of list");
    if (!d.iface(a.interface)) throw new CliError("input does not match any value of interface");
    d.ifListMembers.push({ list: a.list, interface: a.interface, disabled: a.disabled === "yes" });
  },
  remove(d, e) {
    d.ifListMembers = d.ifListMembers.filter((m) => m !== e.ref);
  },
  toggle(_d, e, off) {
    e.ref.disabled = off;
  },
  render(_d, rows, mode) {
    if (mode === "terse") return renderTerse(rows.map((e) => ({ index: e.index, flags: e.flags, props: [["list", e.props.list], ["interface", e.props.interface], ["dynamic", "no"]] })));
    const t = rows.map((e) => ({ index: e.index, flags: e.flags, cells: [e.props.list, e.props.interface] }));
    return renderTable([{ title: "LIST" }, { title: "INTERFACE" }], t, [{ letter: "X", name: "DISABLED", group: 0 }, { letter: "D", name: "DYNAMIC", group: 0 }]);
  },
  detail: {
    legend: "Flags: X - disabled, D - dynamic",
    flagW: 1,
    props: (e) => [["list", e.props.list], ["interface", e.props.interface], ["dynamic", "no"]]
  }
};
var ethernetMenu = {
  path: ["interface", "ethernet"],
  entries: (d) => d.ifaces.filter((i) => i.type === "ether").map((i, n) => ({
    index: n,
    flags: i.disabled ? "X" : d.running(i.name) ? "R" : "",
    props: { name: i.name, mtu: "1500", "mac-address": d.macOf(i.name), arp: "enabled", "default-name": i.name },
    ref: i
  })),
  toggle(_d, e, off) {
    e.ref.disabled = off;
  },
  render(_d, rows, mode) {
    if (mode === "terse") return renderTerse(rows.map((e) => ({ index: e.index, flags: e.flags, props: Object.entries(e.props) })));
    const t = rows.map((e) => ({ index: e.index, flags: e.flags, cells: [e.props.name, e.props.mtu, e.props["mac-address"], e.props.arp] }));
    return renderTable([{ title: "NAME" }, { title: "MTU", align: "right" }, { title: "MAC-ADDRESS" }, { title: "ARP" }], t, [{ letter: "X", name: "DISABLED", group: 0 }, { letter: "R", name: "RUNNING", group: 0 }]);
  }
};
for (const m of [addressListMenu, interfaceListMenu, memberMenu, ethernetMenu]) registerMenu(m);

// src/lib/sim/menus-ospf.ts
var YES_NO3 = ["yes", "no"];
var TYPES = ["broadcast", "ptp", "ptmp", "nbma", "ptp-unnumbered", "virtual-link"];
var legend2 = (text, rows) => text + (rows.length ? " " : "");
var blocks = (text, rows, flagW, quote2 = /^name$/, hide = ["comment", "disabled"]) => renderBlocks(legend2(text, rows), rows.map((e) => ({
  index: e.index ?? 0,
  flags: e.flags,
  comment: e.props.comment,
  props: Object.entries(e.props).filter(([k]) => !hide.includes(k)).map(([k, v]) => [k, quote2.test(k) ? `"${v}"` : v])
})), flagW);
var terse = (rows) => renderTerse(rows.map((e) => ({ index: e.index, flags: e.flags, props: Object.entries(e.props).filter(([k]) => k !== "disabled").map(([k, v]) => [k, v]) })));
var instanceMenu = {
  path: ["routing", "ospf", "instance"],
  fields: [
    { name: "name", kind: "string" },
    { name: "version", kind: "enum", values: ["2", "3"] },
    { name: "router-id", kind: "ip" },
    { name: "vrf", kind: "string" },
    { name: "comment", kind: "string" },
    { name: "disabled", kind: "enum", values: YES_NO3 }
  ],
  required: ["name"],
  entries: (d) => d.ospf.instances.map((i, n) => ({
    index: n,
    flags: i.disabled ? "X" : "",
    props: { name: i.name, version: String(i.version), vrf: "main", "router-id": i.routerId, disabled: i.disabled ? "yes" : "no" },
    ref: i
  })),
  add(d, a) {
    if (d.ospf.instances.some((i) => i.name === a.name)) throw new CliError("failure: item with such name already exists");
    d.ospf.instances.push({ name: a.name, version: Number(a.version ?? 2), routerId: a["router-id"] ?? "0.0.0.0", disabled: a.disabled === "yes" });
  },
  remove(d, e) {
    d.ospf.instances = d.ospf.instances.filter((i) => i !== e.ref);
  },
  toggle(_d, e, off) {
    e.ref.disabled = off;
  },
  set(_d, e, a) {
    const i = e.ref;
    if (a.name) i.name = a.name;
    if (a.version) i.version = Number(a.version);
    if (a["router-id"]) i.routerId = a["router-id"];
    if (a.disabled) i.disabled = a.disabled === "yes";
  },
  render: (_d, rows, mode) => mode === "terse" ? terse(rows) : blocks("Flags: X - disabled, I - inactive", rows, 1),
  emptyLegend: "Flags: X - disabled, I - inactive"
};
var areaMenu = {
  path: ["routing", "ospf", "area"],
  fields: [
    { name: "name", kind: "string" },
    { name: "area-id", kind: "ip" },
    { name: "instance", kind: "string" },
    { name: "type", kind: "enum", values: ["default", "stub", "nssa"] },
    { name: "disabled", kind: "enum", values: YES_NO3 }
  ],
  required: ["name", "instance"],
  entries: (d) => d.ospf.areas.map((a, n) => ({
    index: n,
    flags: a.disabled ? "X" : "",
    props: { name: a.name, instance: a.instance, "area-id": a.areaId, type: "default", disabled: a.disabled ? "yes" : "no" },
    ref: a
  })),
  add(d, a) {
    if (!d.ospf.instances.some((i) => i.name === a.instance)) throw new CliError("input does not match any value of instance");
    if (d.ospf.areas.some((x) => x.name === a.name)) throw new CliError("failure: item with such name already exists");
    d.ospf.areas.push({ name: a.name, areaId: a["area-id"] ?? "0.0.0.0", instance: a.instance, disabled: a.disabled === "yes" });
  },
  remove(d, e) {
    d.ospf.areas = d.ospf.areas.filter((x) => x !== e.ref);
  },
  toggle(_d, e, off) {
    e.ref.disabled = off;
  },
  set(_d, e, a) {
    const x = e.ref;
    if (a.name) x.name = a.name;
    if (a["area-id"]) x.areaId = a["area-id"];
    if (a.instance) x.instance = a.instance;
    if (a.disabled) x.disabled = a.disabled === "yes";
  },
  render: (_d, rows, mode) => mode === "terse" ? terse(rows) : blocks("Flags: X - disabled, I - inactive, D - dynamic; T - transit-capable", rows, 2),
  emptyLegend: "Flags: X - disabled, I - inactive, D - dynamic; T - transit-capable"
};
var templateMenu = {
  path: ["routing", "ospf", "interface-template"],
  fields: [
    { name: "area", kind: "string" },
    { name: "networks", kind: "string" },
    { name: "cost", kind: "int" },
    { name: "type", kind: "enum", values: TYPES },
    { name: "hello-interval", kind: "string" },
    { name: "dead-interval", kind: "string" },
    { name: "priority", kind: "int" },
    { name: "use-bfd", kind: "enum", values: YES_NO3 },
    { name: "comment", kind: "string" },
    { name: "disabled", kind: "enum", values: YES_NO3 }
  ],
  required: ["area"],
  entries: (d) => d.ospf.templates.map((t, n) => ({
    index: n,
    flags: t.disabled ? "X" : "",
    props: {
      area: t.area,
      "instance-id": "0",
      networks: t.networks,
      type: t.type,
      "retransmit-interval": "5s",
      "transmit-delay": "1s",
      "hello-interval": t.helloInterval,
      "dead-interval": t.deadInterval,
      priority: String(t.priority),
      cost: String(t.cost ?? 1),
      ...t.useBfd ? { "use-bfd": "yes" } : {},
      ...t.passive ? { passive: BARE } : {},
      disabled: t.disabled ? "yes" : "no"
    },
    ref: t
  })),
  add(d, a, bare) {
    if (!d.ospf.areas.some((x) => x.name === a.area)) throw new CliError("input does not match any value of area");
    if (a.networks) {
      for (const n of a.networks.split(",")) if (!parseCidr(n.trim())) throw new CliError("invalid value for argument networks");
    }
    const t = {
      area: a.area,
      networks: a.networks ?? "0.0.0.0/0",
      cost: a.cost !== void 0 ? Number(a.cost) : void 0,
      type: a.type ?? "broadcast",
      passive: bare.some((b) => b === "passive"),
      useBfd: a["use-bfd"] === "yes",
      disabled: a.disabled === "yes",
      priority: Number(a.priority ?? 128),
      helloInterval: a["hello-interval"] ?? "10s",
      deadInterval: a["dead-interval"] ?? "40s"
    };
    d.ospf.templates.push(t);
  },
  remove(d, e) {
    d.ospf.templates = d.ospf.templates.filter((t) => t !== e.ref);
  },
  toggle(_d, e, off) {
    e.ref.disabled = off;
  },
  set(_d, e, a, bare = []) {
    const t = e.ref;
    if (a.area) t.area = a.area;
    if (a.networks) t.networks = a.networks;
    if (a.cost !== void 0) t.cost = Number(a.cost);
    if (a.type) t.type = a.type;
    if (a.priority) t.priority = Number(a.priority);
    if (a["hello-interval"]) t.helloInterval = a["hello-interval"];
    if (a["dead-interval"]) t.deadInterval = a["dead-interval"];
    if (a["use-bfd"]) t.useBfd = a["use-bfd"] === "yes";
    if (a.disabled) t.disabled = a.disabled === "yes";
    if (bare.includes("passive")) t.passive = true;
    if (bare.includes("!passive")) t.passive = false;
  },
  render: (_d, rows, mode) => mode === "terse" ? terse(rows) : blocks("Flags: X - disabled, I - inactive", rows, 1),
  emptyLegend: "Flags: X - disabled, I - inactive"
};
var neighborMenu = {
  path: ["routing", "ospf", "neighbor"],
  entries(d) {
    const list = d.net?.ospfResult().neighbors.get(d.id) ?? [];
    return list.map((nb, n) => {
      const broadcast = nb.local.type === "broadcast";
      return {
        index: n,
        flags: " D",
        props: {
          instance: d.ospf.instances.find((i) => !i.disabled)?.name ?? "",
          area: nb.local.area,
          address: nb.address,
          ...broadcast ? { priority: "128" } : {},
          "router-id": nb.routerId,
          ...broadcast ? { dr: nb.dr, bdr: nb.bdr } : {},
          state: "Full",
          "state-changes": "5",
          adjacency: "18s",
          timeout: "35s"
        },
        ref: nb
      };
    });
  },
  render: (_d, rows, mode) => mode === "terse" ? terse(rows) : blocks("Flags: V - virtual; D - dynamic", rows, 2, /^(name|state)$/),
  emptyLegend: "Flags: V - virtual; D - dynamic"
};
var interfaceMenu2 = {
  path: ["routing", "ospf", "interface"],
  entries(d) {
    const res = d.net?.ospfResult();
    const list = res?.ifaces.get(d.id) ?? [];
    return list.map((i, n) => {
      const broadcast = i.type === "broadcast";
      const nbs = res?.neighbors.get(d.id)?.filter((x) => x.local === i) ?? [];
      const state = i.passive ? "passive" : broadcast ? nbs.length ? nbs[0].dr === formatIPv4(i.ip) ? "DR" : nbs[0].bdr === formatIPv4(i.ip) ? "BDR" : "DROther" : "DR" : i.type;
      return {
        index: n,
        flags: "D",
        props: {
          address: `${formatIPv4(i.ip)}%${i.iface}`,
          area: i.area,
          state,
          "network-type": i.type,
          cost: String(i.cost),
          ...broadcast ? { priority: String(i.template.priority) } : {},
          "use-bfd": i.template.useBfd ? "yes" : "no",
          "retransmit-interval": "5s",
          "transmit-delay": "1s",
          "hello-interval": i.template.helloInterval,
          "dead-interval": i.template.deadInterval
        },
        ref: i
      };
    });
  },
  render: (_d, rows, mode) => mode === "terse" ? terse(rows) : blocks("Flags: D - dynamic", rows, 1),
  emptyLegend: "Flags: D - dynamic"
};
for (const m of [instanceMenu, areaMenu, templateMenu, neighborMenu, interfaceMenu2]) registerMenu(m);

// src/lib/sim/menus-bgp.ts
var YES_NO4 = ["yes", "no"];
function fold(props) {
  const out = [];
  let prevPrefix = null;
  for (const [key2, value] of props) {
    const dot = key2.indexOf(".");
    const prefix = dot > 0 ? key2.slice(0, dot) : null;
    const shown = prefix && prefix === prevPrefix ? key2.slice(dot) : key2;
    prevPrefix = prefix;
    out.push([shown, value === BARE ? BARE : value]);
  }
  return out;
}
var legend3 = (text, rows) => text + (rows.length ? " " : "");
var q = (v) => `"${v}"`;
function renderGrouped(legendText, blocks2) {
  const lines = legendText.trim() ? [legendText] : [];
  const iw = Math.max(2, ...blocks2.map((b) => String(b.index).length));
  const flagW = 1;
  const indent = " ".repeat(iw + 2 + flagW);
  for (const b of blocks2) {
    const head = `${String(b.index).padStart(iw)} ${b.flags.padEnd(flagW)} `;
    const out = [];
    let first = true;
    for (const group of blocks2.indexOf(b) >= 0 ? b.groups : []) {
      if (!group.length) continue;
      let cur = first ? head : indent;
      first = false;
      for (const [k, v] of fold(group)) {
        const piece = v === BARE ? `${k} ` : `${k}=${v} `;
        if (cur.length + piece.length > 80 && cur !== head && cur !== indent) {
          out.push(cur);
          cur = indent;
        }
        cur += piece;
      }
      out.push(cur);
    }
    lines.push(...out, "");
  }
  return lines.join("\n").replace(/\n+$/, "");
}
var DEFAULT_TEMPLATE = { name: "default", as: 65530, routerId: "", disabled: false };
var templateMenu2 = {
  path: ["routing", "bgp", "template"],
  fields: [
    { name: "name", kind: "string" },
    { name: "as", kind: "int" },
    { name: "router-id", kind: "ip" },
    { name: "comment", kind: "string" },
    { name: "disabled", kind: "enum", values: YES_NO4 }
  ],
  required: ["name"],
  entries: (d) => [DEFAULT_TEMPLATE, ...d.bgp.templates].map((t, n) => ({
    index: n,
    flags: `${t === DEFAULT_TEMPLATE ? "*" : ""}${t.disabled ? "X" : ""}`,
    props: { name: t.name, "routing-table": "main", ...t.routerId ? { "router-id": t.routerId } : {}, as: String(t.as) },
    ref: t
  })),
  add(d, a) {
    if (d.bgp.templates.some((t) => t.name === a.name) || a.name === "default") throw new CliError("failure: item with such name already exists");
    d.bgp.templates.push({ name: a.name, as: Number(a.as ?? 65530), routerId: a["router-id"] ?? "", disabled: a.disabled === "yes" });
  },
  remove(d, e) {
    if (e.ref === DEFAULT_TEMPLATE) throw new CliError("failure: cannot remove default template");
    d.bgp.templates = d.bgp.templates.filter((t) => t !== e.ref);
  },
  toggle(_d, e, off) {
    e.ref.disabled = off;
  },
  set(_d, e, a) {
    const t = e.ref;
    if (a.as) t.as = Number(a.as);
    if (a["router-id"]) t.routerId = a["router-id"];
    if (a.disabled) t.disabled = a.disabled === "yes";
  },
  render: (_d, rows) => renderBlocks(
    legend3("Flags: * - default; X - disabled, I - inactive", rows),
    rows.map((e) => ({ index: e.index, flags: e.flags, props: fold(Object.entries(e.props).map(([k, v]) => [k, k === "name" ? q(v) : v])) })),
    2
  ),
  emptyLegend: "Flags: * - default; X - disabled, I - inactive"
};
var connectionMenu = {
  path: ["routing", "bgp", "connection"],
  fields: [
    { name: "name", kind: "string" },
    { name: "templates", kind: "string" },
    { name: "local.address", kind: "ip" },
    { name: "local.role", kind: "enum", values: ["ebgp", "ibgp"] },
    { name: "remote.address", kind: "ip" },
    { name: "remote.as", kind: "int" },
    { name: "output.network", kind: "string" },
    { name: "output.filter-chain", kind: "string" },
    { name: "input.filter", kind: "string" },
    { name: "comment", kind: "string" },
    { name: "disabled", kind: "enum", values: YES_NO4 }
  ],
  required: ["remote.address"],
  entries: (d) => d.bgp.connections.map((c, n) => {
    const t = d.bgp.templates.find((x) => x.name === c.templates);
    return {
      index: n,
      flags: c.disabled ? "X" : "",
      props: {
        name: c.name,
        "remote.address": c.remoteAddress,
        "remote.as": String(c.remoteAs),
        "local.address": c.localAddress,
        "local.role": c.localRole,
        "routing-table": "main",
        ...t?.routerId ? { "router-id": t.routerId } : {},
        templates: c.templates,
        as: String(t?.as ?? ""),
        ...c.outputFilterChain ? { "output.filter-chain": c.outputFilterChain } : {},
        ...c.outputNetwork ? { "output.network": c.outputNetwork } : {},
        ...c.inputFilter ? { "input.filter": c.inputFilter } : {}
      },
      ref: c
    };
  }),
  add(d, a) {
    if (a.name && d.bgp.connections.some((c2) => c2.name === a.name)) throw new CliError("failure: item with such name already exists");
    const c = {
      name: a.name ?? `conn${d.bgp.connections.length + 1}`,
      templates: a.templates ?? "default",
      localAddress: a["local.address"] ?? "",
      localRole: a["local.role"] ?? "ebgp",
      remoteAddress: a["remote.address"],
      remoteAs: Number(a["remote.as"] ?? 0),
      outputNetwork: a["output.network"],
      outputFilterChain: a["output.filter-chain"],
      inputFilter: a["input.filter"],
      disabled: a.disabled === "yes"
    };
    d.bgp.connections.push(c);
  },
  remove(d, e) {
    d.bgp.connections = d.bgp.connections.filter((c) => c !== e.ref);
  },
  toggle(_d, e, off) {
    e.ref.disabled = off;
  },
  set(_d, e, a) {
    const c = e.ref;
    if (a["local.address"]) c.localAddress = a["local.address"];
    if (a["local.role"]) c.localRole = a["local.role"];
    if (a["remote.address"]) c.remoteAddress = a["remote.address"];
    if (a["remote.as"]) c.remoteAs = Number(a["remote.as"]);
    if (a["output.network"]) c.outputNetwork = a["output.network"];
    if (a["output.filter-chain"]) c.outputFilterChain = a["output.filter-chain"];
    if (a["input.filter"]) c.inputFilter = a["input.filter"];
    if (a.templates) c.templates = a.templates;
    if (a.disabled) c.disabled = a.disabled === "yes";
  },
  render: (_d, rows) => renderGrouped(
    legend3("Flags: D - dynamic, X - disabled, I - inactive", rows),
    rows.map((e) => {
      const p = e.props;
      return {
        index: e.index,
        flags: e.flags,
        groups: [
          [["name", q(p.name)]],
          [["remote.address", p["remote.address"]], ["remote.as", p["remote.as"]]],
          [["local.address", p["local.address"]], ["local.role", p["local.role"]]],
          [["routing-table", p["routing-table"]], ...p["router-id"] ? [["router-id", p["router-id"]]] : [], ["templates", p.templates], ["as", p.as]],
          [...p["output.filter-chain"] ? [["output.filter-chain", p["output.filter-chain"]]] : [], ...p["output.network"] ? [["output.network", p["output.network"]]] : []],
          [...p["input.filter"] ? [["input.filter", p["input.filter"]]] : []]
        ]
      };
    })
  ),
  emptyLegend: "Flags: D - dynamic, X - disabled, I - inactive"
};
var sessionMenu = {
  path: ["routing", "bgp", "session"],
  entries(d) {
    const res = d.net?.bgpResult();
    const list = res?.sessions.get(d.id) ?? [];
    const myRoutes = res?.routes.get(d.id) ?? [];
    return list.map((s, n) => ({
      index: n,
      flags: "E",
      props: {
        name: `${s.conn.name}-1`,
        "remote.address": s.conn.remoteAddress,
        "remote.as": String(s.conn.remoteAs),
        "remote.id": s.peerTemplate.routerId,
        "remote.capabilities": "mp,rr,gr,as4",
        "remote.afi": "ip",
        "remote.messages": "2",
        "remote.bytes": "67",
        "remote.eor": "",
        "local.address": s.conn.localAddress,
        "local.as": String(s.template.as),
        "local.id": s.template.routerId,
        "local.cluster-id": s.template.routerId,
        "local.capabilities": "mp,rr,gr,as4",
        "local.afi": "ip",
        "local.messages": "2",
        "local.bytes": "67",
        "local.eor": "",
        "output.procid": "20",
        "output.filter-chain": s.conn.outputFilterChain ?? "",
        "output.network": s.conn.outputNetwork ?? "",
        "input.procid": "20",
        "input.filter": s.conn.inputFilter ?? "",
        role: s.conn.localRole,
        "hold-time": "3m",
        "keepalive-time": "1m",
        uptime: "14s930ms",
        "last-started": "2026-01-01 00:00:00",
        "prefix-count": String(myRoutes.filter((r) => r.gateway === parseIPv4(s.conn.remoteAddress)).length)
      },
      ref: s
    }));
  },
  render: (_d, rows) => renderGrouped(
    legend3("Flags: E - established", rows),
    rows.map((e) => {
      const p = e.props;
      return {
        index: e.index,
        flags: e.flags,
        groups: [
          [["name", q(p.name)]],
          [["remote.address", p["remote.address"]], ["remote.as", p["remote.as"]], ["remote.id", p["remote.id"]], ["remote.capabilities", p["remote.capabilities"]], ["remote.afi", p["remote.afi"]], ["remote.messages", p["remote.messages"]], ["remote.bytes", p["remote.bytes"]], ["remote.eor", q("")]],
          [["local.address", p["local.address"]], ["local.as", p["local.as"]], ["local.id", p["local.id"]], ["local.cluster-id", p["local.cluster-id"]], ["local.capabilities", p["local.capabilities"]], ["local.afi", p["local.afi"]], ["local.messages", p["local.messages"]], ["local.bytes", p["local.bytes"]], ["local.eor", q("")]],
          [["output.procid", p["output.procid"]], ...p["output.filter-chain"] ? [["output.filter-chain", p["output.filter-chain"]]] : [], ...p["output.network"] ? [["output.network", p["output.network"]]] : []],
          [["input.procid", p["input.procid"]], ...p["input.filter"] ? [["input.filter", p["input.filter"]]] : [], [p.role, BARE]],
          [["hold-time", p["hold-time"]], ["keepalive-time", p["keepalive-time"]], ["uptime", p.uptime]],
          [["last-started", p["last-started"]], ["prefix-count", p["prefix-count"]]]
        ]
      };
    })
  ),
  emptyLegend: "Flags: E - established"
};
registerTool({
  path: ["routing", "bgp", "advertisements"],
  run(d) {
    const res = d.net?.bgpResult();
    const out = [];
    let i = 0;
    for (const [connName, adverts] of res?.advertised.get(d.id) ?? []) {
      for (const a of adverts) {
        out.push(` ${i} peer=${connName} dst=${a.dst.net ? `${formatIPv4(a.dst.net)}/${a.dst.cidr}` : ""} afi=ip nexthop=${formatIPv4(a.nexthop)} origin=0`);
        out.push(`   as-path=${a.asPath.length ? `sequence ${a.asPath.join(",")}` : "empty"}`);
        i++;
      }
    }
    return out.join("\n");
  }
});
var filterRuleMenu = {
  path: ["routing", "filter", "rule"],
  fields: [{ name: "chain", kind: "string" }, { name: "rule", kind: "string" }, { name: "comment", kind: "string" }, { name: "disabled", kind: "enum", values: YES_NO4 }, { name: "place-before", kind: "int" }],
  required: ["chain", "rule"],
  entries: (d) => d.bgp.filters.map((r, n) => ({ index: n, flags: r.disabled ? "X" : "", props: { ...r.comment ? { comment: r.comment } : {}, chain: r.chain, rule: r.text, disabled: r.disabled ? "yes" : "no" }, ref: r })),
  add(d, a, bare) {
    void bare;
    const at = a["place-before"] === void 0 ? -1 : Number(a["place-before"]);
    const rule = { chain: a.chain, text: a.rule, comment: a.comment, disabled: a.disabled === "yes" };
    if (at >= 0) d.bgp.filters.splice(at, 0, rule);
    else d.bgp.filters.push(rule);
  },
  remove(d, e) {
    d.bgp.filters = d.bgp.filters.filter((r) => r !== e.ref);
  },
  toggle(_d, e, off) {
    e.ref.disabled = off;
  },
  set(_d, e, a) {
    const r = e.ref;
    if (a.chain) r.chain = a.chain;
    if (a.rule) r.text = a.rule;
    if ("comment" in a) r.comment = a.comment || void 0;
    if (a.disabled) r.disabled = a.disabled === "yes";
  },
  render: (_d, rows) => renderBlocks(
    legend3("Flags: X - disabled, I - inactive", rows),
    rows.map((e) => ({ index: e.index, flags: e.flags, comment: e.props.comment, props: [["chain", e.props.chain], ["rule", q(e.props.rule)]] })),
    1
  ),
  emptyLegend: "Flags: X - disabled, I - inactive"
};
for (const m of [templateMenu2, connectionMenu, sessionMenu, filterRuleMenu]) registerMenu(m);

// src/lib/sim/menus-wireguard.ts
var YES_NO5 = ["yes", "no"];
var B64 = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
function fakeKey(seed) {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  let s = "";
  for (let i = 0; i < 43; i++) {
    h = Math.imul(h ^ h >>> 15, 2246822519) >>> 0;
    s += B64[h % 64];
  }
  return s + "=";
}
var wireguardMenu = {
  path: ["interface", "wireguard"],
  fields: [{ name: "name", kind: "string" }, { name: "listen-port", kind: "int" }, { name: "mtu", kind: "int" }, { name: "comment", kind: "string" }, { name: "disabled", kind: "enum", values: YES_NO5 }],
  required: ["name"],
  entries: (d) => d.ifaces.filter((i) => i.type === "wireguard").map((i, n) => ({
    index: n,
    flags: i.disabled ? "X" : d.running(i.name) ? "R" : "",
    props: {
      ...i.comment ? { comment: i.comment } : {},
      name: i.name,
      mtu: i.wgMtu ?? "1420",
      "listen-port": i.wgListenPort ?? "13231",
      "private-key": i.wgPrivateKey ?? "",
      "public-key": i.wgPublicKey ?? "",
      disabled: i.disabled ? "yes" : "no"
    },
    ref: i
  })),
  add(d, a) {
    if (d.iface(a.name)) throw new CliError("failure: already have interface with such name");
    const iface = {
      name: a.name,
      mac: "00:00:00:00:00:00",
      disabled: a.disabled === "yes",
      type: "wireguard",
      comment: a.comment,
      wgListenPort: a["listen-port"] ?? "13231",
      wgMtu: a.mtu ?? "1420",
      wgPrivateKey: fakeKey(`${d.id}/${a.name}/priv`),
      wgPublicKey: fakeKey(`${d.id}/${a.name}/pub`)
    };
    d.ifaces.push(iface);
  },
  remove(d, e) {
    const i = e.ref;
    d.wgPeers = d.wgPeers.filter((p) => p.interface !== i.name);
    d.addrs = d.addrs.filter((a) => a.iface !== i.name);
    d.ifaces = d.ifaces.filter((x) => x !== i);
  },
  toggle(_d, e, off) {
    e.ref.disabled = off;
  },
  set(_d, e, a) {
    const i = e.ref;
    if (a["listen-port"]) i.wgListenPort = a["listen-port"];
    if (a.mtu) i.wgMtu = a.mtu;
    if ("comment" in a) i.comment = a.comment || void 0;
    if (a.disabled) i.disabled = a.disabled === "yes";
  },
  render(_d, rows, mode) {
    if (mode === "terse") return renderTerse(rows.map((e) => ({ index: e.index, flags: e.flags, props: Object.entries(e.props).filter(([k]) => k !== "disabled") })));
    return renderBlocks("Flags: X - disabled; R - running" + (rows.length ? " " : ""), rows.map((e) => ({
      index: e.index,
      flags: e.flags,
      props: Object.entries(e.props).filter(([k]) => !["comment", "disabled"].includes(k)).map(([k, v]) => [k, ["name", "private-key", "public-key"].includes(k) ? `"${v}"` : v])
    })), 1);
  },
  emptyLegend: "Flags: X - disabled; R - running"
};
var peerCounter = 0;
var peerMenu = {
  path: ["interface", "wireguard", "peers"],
  fields: [
    { name: "interface", kind: "iface" },
    { name: "public-key", kind: "string" },
    { name: "endpoint-address", kind: "string" },
    { name: "endpoint-port", kind: "int" },
    { name: "allowed-address", kind: "string" },
    { name: "comment", kind: "string" },
    { name: "disabled", kind: "enum", values: YES_NO5 }
  ],
  required: ["interface", "public-key"],
  entries: (d) => d.wgPeers.map((p, n) => ({
    index: n,
    flags: p.disabled ? "X" : "D",
    props: {
      interface: p.interface,
      name: p.name,
      "public-key": p.publicKey,
      "private-key": "",
      "endpoint-address": p.endpointAddress ?? "",
      "endpoint-port": p.endpointPort ?? "",
      "current-endpoint-address": p.endpointAddress ?? "",
      "current-endpoint-port": p.endpointPort ?? "",
      "allowed-address": p.allowedAddress,
      "preshared-key": "",
      "client-endpoint": "",
      rx: "0",
      tx: "0"
    },
    ref: p
  })),
  add(d, a) {
    if (!d.iface(a.interface) || d.iface(a.interface)?.type !== "wireguard") throw new CliError("input does not match any value of interface");
    peerCounter++;
    d.wgPeers.push({
      interface: a.interface,
      name: `peer${peerCounter}`,
      publicKey: a["public-key"],
      endpointAddress: a["endpoint-address"],
      endpointPort: a["endpoint-port"],
      allowedAddress: a["allowed-address"] ?? "0.0.0.0/0",
      disabled: a.disabled === "yes"
    });
  },
  remove(d, e) {
    d.wgPeers = d.wgPeers.filter((p) => p !== e.ref);
  },
  toggle(_d, e, off) {
    e.ref.disabled = off;
  },
  set(_d, e, a) {
    const p = e.ref;
    if (a["public-key"]) p.publicKey = a["public-key"];
    if (a["endpoint-address"]) p.endpointAddress = a["endpoint-address"];
    if (a["endpoint-port"]) p.endpointPort = a["endpoint-port"];
    if (a["allowed-address"]) p.allowedAddress = a["allowed-address"];
    if (a.disabled) p.disabled = a.disabled === "yes";
  },
  render(_d, rows, mode) {
    if (mode === "terse") return renderTerse(rows.map((e) => ({ index: e.index, flags: e.flags, props: [["interface", e.props.interface], ["public-key", e.props["public-key"]], ["endpoint-address", e.props["endpoint-address"]], ["endpoint-port", e.props["endpoint-port"]]] })));
    const t = rows.map((e) => ({ index: e.index, flags: "", cells: [e.props.interface, e.props["public-key"], e.props["endpoint-address"], e.props["endpoint-port"]] }));
    return renderTable([{ title: "INTERFACE" }, { title: "PUBLIC-KEY" }, { title: "ENDPOINT-ADDRESS" }, { title: "ENDPOINT-PORT", align: "right" }], t, []);
  },
  emptyLegend: "",
  detail: {
    legend: "Flags: X - disabled; D - dynamic",
    flagW: 1,
    quote: ["name", "public-key", "private-key", "preshared-key", "client-endpoint"],
    props: (e) => [
      ["interface", e.props.interface],
      ["name", e.props.name],
      ["public-key", e.props["public-key"]],
      ["private-key", e.props["private-key"]],
      ...e.props["endpoint-address"] ? [["endpoint-address", e.props["endpoint-address"]], ["endpoint-port", e.props["endpoint-port"]]] : [],
      ...e.props["current-endpoint-address"] ? [["current-endpoint-address", e.props["current-endpoint-address"]], ["current-endpoint-port", e.props["current-endpoint-port"]]] : [],
      ["allowed-address", e.props["allowed-address"]],
      ["preshared-key", e.props["preshared-key"]],
      ["client-endpoint", e.props["client-endpoint"]],
      ["rx", e.props.rx],
      ["tx", e.props.tx]
    ]
  }
};
for (const m of [wireguardMenu, peerMenu]) registerMenu(m);

// src/lib/sim/detail.ts
var pick = (e, keys) => keys.filter((k) => e.props[k] !== void 0).map((k) => [k, e.props[k]]);
var without = (e, hide) => Object.entries(e.props).filter(([k]) => !hide.includes(k));
var attach = (path, spec) => {
  const m = menuFor(path);
  if (m) m.detail = spec;
};
attach(["ip", "address"], {
  legend: "Flags: X - disabled, I - invalid, D - dynamic; S - slave",
  flagW: 2,
  props: (e) => pick(e, ["address", "network", "interface", "actual-interface"])
});
attach(["ip", "route"], {
  legend: "Flags: D - dynamic; X - disabled, I - inactive, A - active;\nc - connect, s - static, r - rip, b - bgp, o - ospf, i - is-is, d - dhcp, v - vpn, m - modem, y - bgp-mpls-vpn;\nH - hw-offloaded; + - ecmp",
  flagW: 5,
  flags: (e) => " " + e.flags,
  props: (e) => without(e, ["comment", "active", "disabled"])
});
attach(["ip", "service"], {
  legend: "Flags: X - disabled, I - invalid",
  flagW: 1,
  quote: ["name"],
  props: (e) => pick(e, ["name", "port", "address", "certificate", "tls-version", "vrf", "max-sessions"])
});
attach(["interface"], {
  legend: "Flags: D - dynamic; X - disabled; I - inactive, R - running; S - slave;\nP - passthrough",
  flagW: 5,
  // slots: dynamic/disabled, then running, then slave
  flags: (e) => `${e.flags.includes("X") ? " X" : "  "}${e.flags.includes("R") ? "R" : " "}${e.flags.includes("S") ? "S" : " "}`.replace(/^ {2}/, e.flags.includes("X") ? " X" : "  "),
  quote: ["name", "default-name", "type"],
  props: (e) => without(e, ["comment", "disabled"])
});
attach(["interface", "bridge"], {
  legend: "Flags: X - disabled, R - running",
  flagW: 1,
  quote: ["name"],
  props: (e) => without(e, ["comment", "disabled"])
});
attach(["interface", "vlan"], {
  legend: "Flags: X - disabled, R - running",
  flagW: 1,
  quote: ["name"],
  props: (e) => without(e, ["comment", "disabled"])
});
attach(["interface", "bridge", "port"], {
  legend: "Flags: X - disabled, I - inactive; D - dynamic; H - hw-offload",
  flagW: 3,
  props: (e) => without(e, ["comment", "disabled"])
});
attach(["interface", "bridge", "vlan"], {
  legend: "Flags: X - disabled, D - dynamic",
  flagW: 1,
  props: (e) => without(e, ["comment", "disabled", "dynamic"])
});
attach(["ip", "pool"], {
  legend: "",
  flagW: 0,
  noFlags: true,
  quote: ["name"],
  props: (e) => without(e, ["comment", "disabled"])
});
attach(["ip", "dhcp-server"], {
  legend: "Flags: D - dynamic; X - disabled, I - invalid",
  flagW: 2,
  flags: (e) => e.flags ? " " + e.flags : "",
  quote: ["name"],
  props: (e) => without(e, ["comment", "disabled"])
});
attach(["ip", "dhcp-server", "network"], {
  legend: "Flags: D - dynamic",
  flagW: 1,
  props: (e) => [...without(e, ["comment", "disabled"]), ["wins-server", ""], ["ntp-server", ""], ["caps-manager", ""], ["dhcp-option", ""]]
});
var bridge = menuFor(["interface", "bridge"]);
if (bridge) bridge.emptyLegend = "Flags: X - disabled, R - running";

// src/lib/sim/ospf.ts
function participating(dev) {
  const cfg = dev.ospf;
  const inst = cfg.instances.find((i) => !i.disabled);
  if (!inst) return [];
  const out = [];
  for (const a of dev.activeAddrs()) {
    for (const t of cfg.templates) {
      if (t.disabled) continue;
      const area = cfg.areas.find((x) => x.name === t.area && x.instance === inst.name && !x.disabled);
      if (!area) continue;
      const net = parseCidr(t.networks);
      if (!net || !inNet(a.cidr.ip, net)) continue;
      out.push({
        dev,
        iface: a.iface,
        address: a.text,
        ip: a.cidr.ip,
        cidr: a.cidr,
        area: area.name,
        areaId: area.areaId,
        cost: t.cost ?? 1,
        type: t.type,
        passive: t.passive,
        template: t,
        routerId: inst.routerId
      });
      break;
    }
  }
  return out.sort((a, b) => dev.ifaces.findIndex((i) => i.name === a.iface) - dev.ifaces.findIndex((i) => i.name === b.iface));
}
function computeOspf(net) {
  const ifaces = /* @__PURE__ */ new Map();
  for (const dev of net.devices.values()) if (dev.kind === "router") ifaces.set(dev.id, participating(dev));
  const neighbors = /* @__PURE__ */ new Map();
  for (const [id, list] of ifaces) {
    const found = [];
    for (const me of list) {
      if (me.passive || !me.dev.running(me.iface)) continue;
      const seg = segment(net, me.dev, me.iface, null);
      for (const ep of seg.endpoints) {
        if (ep.dev.id === id) continue;
        const theirs = ifaces.get(ep.dev.id)?.find((o) => o.iface === ep.iface && !o.passive);
        if (!theirs || theirs.areaId !== me.areaId || theirs.type !== me.type) continue;
        if (!inNet(theirs.ip, me.cidr)) continue;
        let dr = "0.0.0.0", bdr = "0.0.0.0";
        if (me.type === "broadcast") {
          const cands = [me, theirs].sort((x, y) => y.template.priority - x.template.priority || parseIPv4(y.routerId) - parseIPv4(x.routerId));
          dr = formatIPv4(cands[0].ip);
          bdr = formatIPv4(cands[1].ip);
        }
        found.push({ local: me, address: formatIPv4(theirs.ip), routerId: theirs.routerId, peerIp: theirs.ip, peerDev: ep.dev, dr, bdr });
      }
    }
    neighbors.set(id, found.sort((a, b) => a.peerIp - b.peerIp));
  }
  const stubs = /* @__PURE__ */ new Map();
  for (const [id, list] of ifaces) stubs.set(id, list.map((i) => ({ dst: { ...i.cidr, ip: i.cidr.net }, cost: i.cost })));
  const routes = /* @__PURE__ */ new Map();
  for (const dev of net.devices.values()) {
    if (dev.kind !== "router" || !ifaces.get(dev.id)?.length) continue;
    const dist = /* @__PURE__ */ new Map([[dev.id, 0]]);
    const first = /* @__PURE__ */ new Map();
    const todo = /* @__PURE__ */ new Set([dev.id]);
    const done = /* @__PURE__ */ new Set();
    while (todo.size) {
      let cur = "";
      for (const id of todo) if (cur === "" || dist.get(id) < dist.get(cur)) cur = id;
      todo.delete(cur);
      if (done.has(cur)) continue;
      done.add(cur);
      for (const nb of neighbors.get(cur) ?? []) {
        const id = nb.peerDev.id;
        const d = dist.get(cur) + nb.local.cost;
        if (d < (dist.get(id) ?? Infinity)) {
          dist.set(id, d);
          first.set(id, cur === dev.id ? nb : first.get(cur));
          todo.add(id);
        }
      }
    }
    const best = /* @__PURE__ */ new Map();
    const mine = dev.activeAddrs();
    for (const [rid, d] of dist) {
      if (rid === dev.id) continue;
      const hop = first.get(rid);
      if (!hop) continue;
      for (const s of stubs.get(rid) ?? []) {
        if (mine.some((a) => a.cidr.net === s.dst.net && a.cidr.cidr === s.dst.cidr)) continue;
        const key2 = netText(s.dst);
        const metric = d + s.cost;
        const have = best.get(key2);
        if (!have || metric < have.metric) best.set(key2, { dst: s.dst, gateway: hop.peerIp, iface: hop.local.iface, metric });
      }
    }
    routes.set(dev.id, [...best.values()]);
  }
  return { ifaces, neighbors, routes };
}

// src/lib/sim/network.ts
var MAX_STEPS = 64;
var Network = class {
  devices = /* @__PURE__ */ new Map();
  /** Bumped whenever a command or a cable can change the topology; the OSPF result is cached per epoch. */
  epoch = 0;
  ospfCache = null;
  bgpCache = null;
  ospfResult() {
    if (!this.ospfCache || this.ospfCache.epoch !== this.epoch) this.ospfCache = { epoch: this.epoch, result: computeOspf(this) };
    return this.ospfCache.result;
  }
  bgpResult() {
    if (!this.bgpCache || this.bgpCache.epoch !== this.epoch) this.bgpCache = { epoch: this.epoch, result: computeBgp(this) };
    return this.bgpCache.result;
  }
  cables = [];
  flowId = 1;
  rand = rng(7);
  add(dev) {
    dev.net = this;
    this.devices.set(dev.id, dev);
    return dev;
  }
  device(id) {
    const d = this.devices.get(id);
    if (!d) throw new Error(`unknown device ${id}`);
    return d;
  }
  connect(a, ai, b, bi) {
    this.epoch++;
    this.cables.push({ a: { dev: a, iface: ai }, b: { dev: b, iface: bi } });
  }
  peer(dev, iface) {
    for (const c of this.cables) {
      const [me2, other] = c.a.dev === dev && c.a.iface === iface ? [c.a, c.b] : c.b.dev === dev && c.b.iface === iface ? [c.b, c.a] : [null, null];
      if (!me2 || !other) continue;
      const d = this.devices.get(other.dev);
      const i = d?.iface(other.iface);
      return d && i ? { dev: d, iface: i, ifaceName: other.iface } : null;
    }
    const me = this.devices.get(dev);
    if (me?.iface(iface)?.type === "wireguard") return this.wireguardPeer(me, iface);
    return null;
  }
  /**
   * A WireGuard tunnel is not a cable: it rides on top of whatever reaches the peer's endpoint address. The simulator
   * does not model the handshake, so two wg interfaces are "connected" whenever each one's peer names an address the
   * other device actually owns - which is exactly the case a correctly configured tunnel is meant to cover.
   */
  wireguardPeer(dev, ifaceName) {
    const myPeer = dev.wgPeers.find((p) => p.interface === ifaceName && !p.disabled);
    if (!myPeer?.endpointAddress) return null;
    const endpointIp = parseIPv4(myPeer.endpointAddress);
    if (endpointIp === null) return null;
    for (const other of this.devices.values()) {
      if (other === dev || !other.activeAddrs().some((a) => a.cidr.ip === endpointIp)) continue;
      for (const oi of other.ifaces.filter((i) => i.type === "wireguard")) {
        const theirPeer = other.wgPeers.find((p) => p.interface === oi.name && !p.disabled);
        if (!theirPeer?.endpointAddress) continue;
        const myUnderlying = parseIPv4(theirPeer.endpointAddress);
        if (myUnderlying !== null && dev.activeAddrs().some((a) => a.cidr.ip === myUnderlying)) return { dev: other, iface: oi, ifaceName: oi.name };
      }
    }
    return null;
  }
  newFlow() {
    return { id: this.flowId++ };
  }
  packet(src, dst, over) {
    return { src, dst, ttl: 64, size: 56, state: "new", reply: false, flow: this.newFlow(), ...over };
  }
  /** Choose where a locally generated packet leaves. PCs use their subnet or their gateway; routers use the routing table. */
  originate(dev, dst) {
    if (dev.kind === "pc") {
      const a = dev.activeAddrs()[0];
      if (!a) return { fail: "no-route" };
      if (inNet(dst, a.cidr)) return { egress: "eth0", nextIp: dst, route: null, srcIp: a.cidr.ip };
      const gw = dev.pc.gateway ? parseIPv4(dev.pc.gateway) : null;
      if (gw === null || !inNet(gw, a.cidr)) return { fail: "no-route" };
      return { egress: "eth0", nextIp: gw, route: null, srcIp: a.cidr.ip };
    }
    const r = dev.lookup(dst);
    if (!r) return { fail: "no-route" };
    if (r.blackhole) return { fail: "blackhole" };
    const srcIp = dev.sourceFor(r, dst);
    if (srcIp === null || !r.iface) return { fail: "no-route" };
    return { egress: r.iface, nextIp: r.connected ? dst : parseIPv4(r.gateway), route: r, srcIp };
  }
  /** Address of the interface a router received a packet on, used as the source of ICMP errors. */
  ingressAddr(dev, iface, toward) {
    const own = dev.activeAddrs();
    return (own.find((a) => a.iface === iface) ?? own.find((a) => inNet(toward, a.cidr)) ?? own[0])?.cidr.ip ?? null;
  }
  errorPacket(at, ingress, orig, err) {
    const from = this.ingressAddr(at, ingress, orig.src);
    if (from === null) return null;
    return this.packet(from, orig.src, { proto: "icmp", type: "error", err, state: "related", size: 56, flow: this.newFlow() });
  }
  /**
   * Carry a packet hop by hop. `start` is where it was created (inIface null) or where it just arrived.
   * Applies, in RouterOS order: un-NAT of replies, dst-nat, local delivery (input chain), TTL, routing, forward/output chain, src-nat.
   */
  walk(start, first, inIface) {
    let dev = start;
    let ingress = inIface;
    let pkt = first;
    let hops = 0;
    const fromWire = () => ingress !== null;
    for (let step = 0; step < MAX_STEPS; step++) {
      if (pkt.reply) {
        if (pkt.flow.snat?.dev === dev.id && pkt.dst === pkt.flow.snat.newSrc) pkt = { ...pkt, dst: pkt.flow.snat.origSrc };
        if (pkt.flow.dnat?.dev === dev.id && pkt.src === pkt.flow.dnat.newDst) pkt = { ...pkt, src: pkt.flow.dnat.origDst, sport: pkt.flow.dnat.origPort ?? pkt.sport };
      }
      if (fromWire() && pkt.state === "new" && !pkt.reply) {
        const rule = firstNat(dev, { chain: "dstnat", pkt, inIface: ingress, outIface: null });
        if (rule?.action === "dst-nat" && rule.props["to-addresses"]) {
          const newDst = parseIPv4(rule.props["to-addresses"]);
          if (newDst !== null) {
            const newPort = rule.props["to-ports"] ? Number(rule.props["to-ports"]) : pkt.dport;
            pkt = { ...pkt, dst: newDst, dport: newPort, flow: { ...pkt.flow, dnat: { dev: dev.id, origDst: pkt.dst, newDst, origPort: pkt.dport, newPort } } };
          }
        }
      }
      if (dev.ownsLocal(pkt.dst)) {
        if (fromWire()) {
          const v2 = filterVerdict(dev, { chain: "input", pkt, inIface: ingress, outIface: null });
          if (v2.action !== "accept") return this.refuse(dev, ingress, pkt, v2.action, hops, v2.rule?.props["reject-with"]);
        }
        if (pkt.type === "error") return { kind: "error", err: pkt.err, fromIp: pkt.src, hops };
        return { kind: "delivered", dev, pkt, hops };
      }
      if (dev.kind === "pc" && fromWire()) return { kind: "lost", why: "a host does not forward", at: dev.id, hops };
      if (fromWire()) {
        if (pkt.ttl <= 1) return this.bounce(dev, ingress, pkt, "ttl-exceeded", hops);
        pkt = { ...pkt, ttl: pkt.ttl - 1 };
      }
      const o = this.originate(dev, pkt.dst);
      if ("fail" in o) {
        if (!fromWire()) return o.fail === "no-route" ? { kind: "no-route" } : { kind: "lost", why: "blackhole route", at: dev.id, hops };
        return o.fail === "no-route" ? this.bounce(dev, ingress, pkt, "net-unreachable", hops) : { kind: "lost", why: "blackhole route", at: dev.id, hops };
      }
      const ctx = { chain: fromWire() ? "forward" : "output", pkt, inIface: ingress, outIface: o.egress };
      const v = filterVerdict(dev, ctx);
      if (v.action !== "accept") return this.refuse(dev, ingress, pkt, v.action, hops, v.rule?.props["reject-with"]);
      if (pkt.state === "new" && !pkt.reply) {
        const rule = firstNat(dev, { chain: "srcnat", pkt, inIface: ingress, outIface: o.egress });
        if (rule && (rule.action === "masquerade" || rule.action === "src-nat")) {
          const out = dev.activeAddrs().find((a) => a.iface === o.egress);
          const newSrc = rule.action === "src-nat" && rule.props["to-addresses"] ? parseIPv4(rule.props["to-addresses"]) : out?.cidr.ip ?? null;
          if (newSrc !== null && newSrc !== pkt.src) pkt = { ...pkt, src: newSrc, flow: { ...pkt.flow, snat: { dev: dev.id, origSrc: pkt.src, newSrc } } };
        }
      }
      const seg = segment(this, dev, o.egress, dev.macOf(o.egress));
      if (seg.loop) return { kind: "lost", why: "broadcast storm", at: dev.id, hops };
      const target2 = seg.endpoints.find((e) => e.dev.ownsIp(o.nextIp, e.iface));
      if (!target2) return { kind: "lost", why: seg.endpoints.length ? "nobody answers ARP" : "link is down", at: dev.id, hops };
      hops++;
      dev = target2.dev;
      ingress = target2.iface;
    }
    return { kind: "lost", why: "loop", at: dev.id, hops };
  }
  refuse(dev, ingress, pkt, action, hops, rejectWith) {
    const kinds = {
      "icmp-net-unreachable": "net-unreachable",
      "icmp-network-unreachable": "net-unreachable",
      "icmp-host-unreachable": "host-unreachable",
      "icmp-admin-prohibited": "admin-prohibited"
    };
    if (action === "reject" && pkt.type !== "error") return this.bounce(dev, ingress, pkt, rejectWith && kinds[rejectWith] || "net-unreachable", hops);
    return { kind: "lost", why: "dropped by firewall", at: dev.id, hops };
  }
  /** A router sends an ICMP error back; it only counts if it makes it home. */
  bounce(at, ingress, orig, err, hops) {
    if (orig.type === "error") return { kind: "lost", why: "no error about an error", at: at.id, hops };
    const e = this.errorPacket(at, ingress, orig, err);
    if (!e) return { kind: "lost", why: "no source address for the error", at: at.id, hops };
    const back = this.walk(at, e, null);
    if (back.kind === "error") return { kind: "error", err, fromIp: e.src, hops: hops + back.hops };
    return { kind: "lost", why: "error did not come back", at: at.id, hops };
  }
  jitter(legs) {
    let us = 0;
    for (let i = 0; i < legs; i++) us += 260 + Math.floor(this.rand() * 640);
    return us;
  }
  /** One echo request and its reply. */
  pingOnce(src, dst, opts = {}) {
    if (src.ownsIp(dst)) return { status: "reply", host: dst, ttl: 64, us: 20 + Math.floor(this.rand() * 90), size: opts.size ?? 56 };
    const o = this.originate(src, dst);
    if ("fail" in o) return o.fail === "no-route" ? { status: "no-route" } : { status: "timeout" };
    const srcIp = opts.srcAddress ?? o.srcIp;
    if (opts.srcAddress != null && !src.ownsIp(opts.srcAddress)) return { status: "no-route" };
    const req = this.packet(srcIp, dst, { proto: "icmp", type: "echo", ttl: opts.ttl ?? 64, size: opts.size ?? 56 });
    const fwd = this.walk(src, req, null);
    if (fwd.kind === "error") return { status: "error", err: fwd.err, from: fwd.fromIp };
    if (fwd.kind === "no-route") return { status: "no-route" };
    if (fwd.kind !== "delivered") return { status: "timeout" };
    const rep = this.packet(fwd.pkt.dst, fwd.pkt.src, { proto: "icmp", type: "echo-reply", state: "established", reply: true, flow: fwd.pkt.flow, size: req.size });
    const back = this.walk(fwd.dev, rep, null);
    if (back.kind !== "delivered" || back.dev !== src) return { status: "timeout" };
    return { status: "reply", host: dst, ttl: back.pkt.ttl, us: this.jitter(fwd.hops + back.hops + 1), size: req.size };
  }
  /** One TCP connection attempt, as `/tool fetch` makes it. */
  tcpConnect(src, dst, port) {
    const o = this.originate(src, dst);
    if ("fail" in o) return o.fail === "no-route" ? "no-route" : "timeout";
    const syn = this.packet(o.srcIp, dst, { proto: "tcp", type: "syn", dport: port, sport: 4e4 + Math.floor(this.rand() * 2e4), size: 60 });
    const fwd = this.walk(src, syn, null);
    if (fwd.kind === "no-route") return "no-route";
    if (fwd.kind !== "delivered") return "timeout";
    const svc = Object.values(fwd.dev.services).find((s) => !s.disabled && s.port === fwd.pkt.dport);
    const rep = this.packet(fwd.pkt.dst, fwd.pkt.src, { proto: "tcp", type: "synack", state: "established", reply: true, flow: fwd.pkt.flow, sport: fwd.pkt.dport, dport: fwd.pkt.sport, size: 60 });
    const back = this.walk(fwd.dev, rep, null);
    if (back.kind !== "delivered" || back.dev !== src) return "timeout";
    return svc ? "connected" : "refused";
  }
  /** A PC asks for an address: the first DHCP server on its broadcast domain answers, handing out the highest free address like RouterOS does. */
  dhcpDiscover(client) {
    const mac = client.macOf("eth0");
    const seg = segment(this, client, "eth0", mac);
    for (const e of seg.endpoints) {
      const srv = e.dev.dhcpServers.find((s) => !s.disabled && s.iface === e.iface);
      const pool = srv && e.dev.pools.find((p) => p.name === srv.pool);
      if (!srv || !pool) continue;
      const own = e.dev.addrs.find((a) => a.iface === e.iface && !a.disabled);
      const ownC = own ? parseCidr(own.address) : null;
      const netw = e.dev.dhcpNetworks.find((n) => {
        const c = parseCidr(n.address);
        return !!c && !!ownC && (ownC.ip & c.mask) >>> 0 === c.net;
      });
      if (!ownC || !netw) continue;
      const used = new Set(e.dev.leases.filter((l) => l.server === srv.name).map((l) => parseIPv4(l.address)));
      used.add(ownC.ip);
      let ip = null;
      const existing = e.dev.leases.find((l) => l.server === srv.name && l.mac === mac);
      if (existing) ip = parseIPv4(existing.address);
      else {
        const ranges = pool.ranges.split(",").map((r) => r.trim().split("-")).map(([a, b]) => [parseIPv4(a), parseIPv4(b ?? a)]).filter(([a, b]) => a !== null && b !== null);
        outer: for (const [lo, hi] of [...ranges].reverse()) for (let x = hi; x >= lo; x--) if (!used.has(x)) {
          ip = x;
          break outer;
        }
        if (ip === null) return null;
        e.dev.leases.push({ address: formatIPv4(ip), mac, server: srv.name, hostName: client.id, born: 0 });
      }
      return { ip: formatIPv4(ip), cidr: parseCidr(netw.address).cidr, gateway: netw.gateway ?? null };
    }
    return null;
  }
  /** `/tool traceroute`: probes with rising TTL. */
  traceroute(src, dst, opts) {
    const rows = [];
    const o = this.originate(src, dst);
    if ("fail" in o) return rows;
    const srcIp = opts.srcAddress ?? o.srcIp;
    for (let ttl = 1; ttl <= opts.maxHops; ttl++) {
      const us = [];
      let addr = null;
      let reached = false;
      for (let n = 0; n < opts.count; n++) {
        const req = this.packet(srcIp, dst, { proto: "icmp", type: "echo", ttl });
        const fwd = this.walk(src, req, null);
        if (fwd.kind === "error" && fwd.err === "ttl-exceeded") {
          addr = fwd.fromIp;
          us.push(this.jitter(fwd.hops + 1));
        } else if (fwd.kind === "delivered") {
          const rep = this.packet(fwd.pkt.dst, fwd.pkt.src, { proto: "icmp", type: "echo-reply", state: "established", reply: true, flow: fwd.pkt.flow });
          const back = this.walk(fwd.dev, rep, null);
          if (back.kind === "delivered" && back.dev === src) {
            addr = dst;
            reached = true;
            us.push(this.jitter(fwd.hops + back.hops + 1));
          }
        }
      }
      rows.push({ address: addr === null ? null : formatIPv4(addr), loss: Math.round((opts.count - us.length) / opts.count * 100), sent: opts.count, us });
      if (reached) break;
    }
    return rows;
  }
};

// src/lib/sim/index.ts
var dotted = (cidr) => formatIPv4(maskOf(cidr));
function pcExec(dev, line) {
  const [cmd, ...rest] = line.trim().split(/\s+/);
  const done = (output) => ({ output, ctx: [] });
  const c = cmd?.toLowerCase() ?? "";
  if (!c) return done("");
  if (c === "ip") {
    if (rest[0] === "dhcp") return pcExec(dev, "dhcp");
    const cidr = parseCidr(rest[0] ?? "");
    if (!cidr || !rest[0]?.includes("/")) {
      const ip = rest[0] ? parseIPv4(rest[0]) : null;
      if (ip === null) return done("Usage: ip <address>/<prefix> [gateway]   e.g. ip 192.168.1.10/24 192.168.1.1");
      dev.pc = { ip: rest[0], cidr: 24, gateway: rest[1] ?? null };
    } else {
      const [ip] = rest[0].split("/");
      dev.pc = { ip, cidr: cidr.cidr, gateway: rest[1] ?? null };
    }
    const gw = dev.pc.gateway ? ` gateway ${dev.pc.gateway}` : "";
    return done(`Checking for duplicate address...
${dev.id} : ${dev.pc.ip} ${dotted(dev.pc.cidr)}${gw}`);
  }
  if (c === "dhcp") {
    const lease = dev.net.dhcpDiscover(dev);
    if (!lease) return done("Can't find dhcp server");
    dev.pc = { ip: lease.ip, cidr: lease.cidr, gateway: lease.gateway };
    return done(`DORA IP ${lease.ip}/${lease.cidr}${lease.gateway ? ` GW ${lease.gateway}` : ""}`);
  }
  if (c === "clear" && rest[0] === "ip") {
    dev.pc = { ip: null, cidr: 24, gateway: null };
    return done("");
  }
  if (c === "show" && (rest[0] === "ip" || rest.length === 0)) {
    const p = dev.pc;
    if (!p.ip) return done(`NAME        : ${dev.id}[1]
IP/MASK     : 0.0.0.0/0
GATEWAY     : 0.0.0.0`);
    return done(`NAME        : ${dev.id}[1]
IP/MASK     : ${p.ip}/${p.cidr}
GATEWAY     : ${p.gateway ?? "0.0.0.0"}
MAC         : ${dev.iface("eth0").mac.toLowerCase()}`);
  }
  if (c === "ping" || c === "trace") {
    const dstText = rest[0];
    const dst = dstText ? parseIPv4(dstText) : null;
    if (dst === null) return done(`Usage: ${c} <ip address>`);
    if (!dev.pc.ip) return done("No IP address configured. Use: ip <address>/<prefix> <gateway>");
    const net = dev.net;
    if (c === "ping") {
      const lines = [];
      for (let i = 1; i <= 5; i++) {
        const r = net.pingOnce(dev, dst);
        if (r.status === "reply") lines.push(`84 bytes from ${dstText} icmp_seq=${i} ttl=${r.ttl} time=${(r.us / 1e3).toFixed(3)} ms`);
        else if (r.status === "no-route") {
          lines.push(`host (${dev.pc.gateway ?? dstText}) not reachable`);
          break;
        } else if (r.status === "error") lines.push(`${formatIPv4(r.from)} icmp_seq=${i} ${r.err === "ttl-exceeded" ? "ttl exceeded" : r.err === "host-unreachable" ? "host unreachable" : "destination net unreachable"}`);
        else lines.push(`${dstText} icmp_seq=${i} timeout`);
      }
      return done(lines.join("\n"));
    }
    const rows = net.traceroute(dev, dst, { count: 1, maxHops: 8 });
    if (!rows.length) return done(`host (${dev.pc.gateway ?? dstText}) not reachable`);
    return done(`trace to ${dstText}, 8 hops max, press Ctrl+C to stop
${rows.map((r, i) => ` ${i + 1}   ${r.address ?? "*"}${r.us.length ? `   ${(r.us[0] / 1e3).toFixed(3)} ms` : ""}`).join("\n")}`);
  }
  if (c === "help" || c === "?") return done("Commands: ip <address>/<prefix> <gateway>, ip dhcp (use dhcp), show ip, ping <address>, trace <address>, clear ip");
  return done(`*** command not found: ${line.trim()}. Type help.`);
}
function runCommand(dev, line, ctx) {
  if (dev.kind === "pc") return pcExec(dev, line);
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

// tools/conformance/sim-entry.ts
function runOnSim(lab, sc) {
  const net = new Network();
  const devs = /* @__PURE__ */ new Map();
  Object.keys(lab.devices).forEach((id, i) => devs.set(id, net.add(new Device(id, "router", i, 8))));
  for (const [a, ai, b, bi] of lab.links) net.connect(a, ai, b, bi);
  return sc.steps.map(([dev, cmd]) => {
    if (cmd.startsWith("#sleep")) return { dev, cmd, out: "" };
    const d = devs.get(dev);
    if (!d) throw new Error(`scenario ${sc.name}: unknown device ${dev}`);
    return { dev, cmd, out: runCommand(d, cmd, []).output };
  });
}
export {
  runOnSim
};
