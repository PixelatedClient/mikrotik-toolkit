import { calcSubnet, formatIPv4, parseIPv4 } from './subnet';

export type Role = 'gateway' | 'isp-edge' | 'vlan-switch';

export interface Device {
  id: string;
  name: string;
  kind: 'router' | 'switch';
  ports: string[];
}

const eth = (n: number) => Array.from({ length: n }, (_, i) => `ether${i + 1}`);
const sfp = (n: number) => Array.from({ length: n }, (_, i) => `sfp-sfpplus${i + 1}`);

export const DEVICES: Device[] = [
  { id: 'hap-ax2', name: 'hAP ax² (C52iG-5HaxD2HaxD)', kind: 'router', ports: eth(5) },
  { id: 'hex', name: 'hEX (RB750Gr3)', kind: 'router', ports: eth(5) },
  { id: 'rb4011', name: 'RB4011iGS+', kind: 'router', ports: [...eth(10), ...sfp(1)] },
  { id: 'ccr2004', name: 'CCR2004-16G-2S+', kind: 'router', ports: [...eth(16), ...sfp(2)] },
  { id: 'crs326', name: 'CRS326-24G-2S+RM', kind: 'switch', ports: [...eth(24), ...sfp(2)] },
];

export const deviceById = (id: string) => DEVICES.find((d) => d.id === id);

export interface VlanEntry {
  id: number;
  name: string;
  ports: string[];
}

export interface Config {
  role: Role;
  deviceId: string;
  identity: string;
  // gateway
  wanPort: string;
  lanCidr: string; // router address on LAN, e.g. 192.168.88.1/24
  dnsServers: string;
  // isp-edge
  upstreamPort: string;
  upstreamLocal: string; // e.g. 203.0.113.2/30
  upstreamPeer: string; // e.g. 203.0.113.1
  localAsn: number;
  peerAsn: number;
  /** 'template' works on RouterOS 7.16 (verified on a device); 'instance' is the 7.20+ form. */
  bgpStyle: 'template' | 'instance';
  announcePrefix: string; // e.g. 198.51.100.0/24
  // shared management
  mgmtCidr: string; // gateway/edge: allowed management subnet. switch: switch address on mgmt VLAN
  // vlan-switch
  trunkPort: string;
  mgmtVlanId: number;
  mgmtGateway: string;
  vlans: VlanEntry[];
}

export const DEFAULT_CONFIG: Config = {
  role: 'gateway',
  deviceId: 'hex',
  identity: 'gw-office-01',
  wanPort: 'ether1',
  lanCidr: '192.168.88.1/24',
  dnsServers: '1.1.1.1,9.9.9.9',
  upstreamPort: 'ether1',
  upstreamLocal: '203.0.113.2/30',
  upstreamPeer: '203.0.113.1',
  localAsn: 64512,
  peerAsn: 64500,
  bgpStyle: 'template',
  announcePrefix: '198.51.100.0/24',
  mgmtCidr: '192.168.88.0/24',
  trunkPort: 'sfp-sfpplus1',
  mgmtVlanId: 99,
  mgmtGateway: '',
  vlans: [
    { id: 10, name: 'staff', ports: ['ether1', 'ether2'] },
    { id: 20, name: 'guest', ports: ['ether3', 'ether4'] },
    { id: 99, name: 'mgmt', ports: ['ether24'] },
  ],
};

const IDENT = /^[A-Za-z0-9._-]{1,32}$/;
const VLAN_NAME = /^[A-Za-z0-9_-]{1,16}$/;

function validAsn(n: number) {
  return Number.isInteger(n) && n >= 1 && n <= 4294967295;
}

/** Trim every free-text field so stray whitespace never reaches the script. */
function normalise(c: Config): Config {
  return {
    ...c,
    identity: c.identity.trim(),
    lanCidr: c.lanCidr.trim(),
    dnsServers: c.dnsServers.split(',').map((s) => s.trim()).filter(Boolean).join(','),
    upstreamLocal: c.upstreamLocal.trim(),
    upstreamPeer: c.upstreamPeer.trim(),
    announcePrefix: c.announcePrefix.trim(),
    mgmtCidr: c.mgmtCidr.trim(),
    mgmtGateway: c.mgmtGateway.trim(),
    vlans: c.vlans.map((v) => ({ ...v, name: v.name.trim() })),
  };
}

export function validate(input: Config): string[] {
  const c = normalise(input);
  const errors: string[] = [];
  const dev = deviceById(c.deviceId);
  if (!dev) return ['Unknown device.'];
  if (!IDENT.test(c.identity)) errors.push('Identity: 1-32 chars, letters, digits, . _ -');

  if (c.role !== 'vlan-switch' && dev.kind === 'switch')
    errors.push(`${dev.name} is a switch. Use the VLAN switch role.`);

  if (c.role === 'gateway') {
    if (!dev.ports.includes(c.wanPort)) errors.push('WAN port is not on this device.');
    const lan = calcSubnet(c.lanCidr);
    if (!lan) errors.push('LAN address must look like 192.168.88.1/24.');
    else {
      if (lan.cidr > 28) errors.push('LAN prefix must be /28 or larger.');
      if (lan.address === lan.network || lan.address === lan.broadcast)
        errors.push('LAN address cannot be the network or broadcast address.');
    }
    const dns = c.dnsServers.split(',').map((s) => s.trim()).filter(Boolean);
    if (dns.length === 0 || dns.some((d) => parseIPv4(d) === null))
      errors.push('DNS servers: comma-separated IPv4 addresses.');
  }

  if (c.role === 'isp-edge') {
    if (!dev.ports.includes(c.upstreamPort)) errors.push('Upstream port is not on this device.');
    const local = calcSubnet(c.upstreamLocal);
    if (!local) errors.push('Upstream local address must look like 203.0.113.2/30.');
    if (parseIPv4(c.upstreamPeer) === null) errors.push('Upstream peer must be an IPv4 address.');
    if (local && parseIPv4(c.upstreamPeer) !== null) {
      const peer = calcSubnet(`${c.upstreamPeer}/${local.cidr}`);
      if (peer && peer.network !== local.network)
        errors.push('Upstream peer is not in the same subnet as the local address.');
      if (c.upstreamPeer === local.address) errors.push('Peer and local address must differ.');
    }
    if (!validAsn(c.localAsn) || !validAsn(c.peerAsn)) errors.push('ASNs must be 1-4294967295.');
    else if (c.localAsn === c.peerAsn) errors.push('Local and peer ASN are equal; that would be iBGP, not an upstream.');
    const p = calcSubnet(c.announcePrefix);
    if (!p) errors.push('Announced prefix must look like 198.51.100.0/24.');
    else {
      if (p.address !== p.network) errors.push(`Announced prefix must be a network address (${p.network}/${p.cidr}).`);
      if (p.cidr > 24) errors.push('Announced prefix cannot be longer than /24 (upstreams filter it).');
      if (p.cidr < 8) errors.push('Announced prefix is unrealistically large.');
    }
    if (!calcSubnet(c.mgmtCidr)) errors.push('Management subnet must look like 192.168.88.0/24.');
  }

  if (c.role === 'vlan-switch') {
    if (!dev.ports.includes(c.trunkPort)) errors.push('Trunk port is not on this device.');
    if (c.vlans.length === 0) errors.push('Add at least one VLAN.');
    const ids = new Set<number>();
    const used = new Map<string, number>();
    for (const v of c.vlans) {
      if (!Number.isInteger(v.id) || v.id < 1 || v.id > 4094) errors.push(`VLAN ${v.id}: ID must be 1-4094.`);
      if (ids.has(v.id)) errors.push(`VLAN ${v.id} is listed twice.`);
      ids.add(v.id);
      if (!VLAN_NAME.test(v.name)) errors.push(`VLAN ${v.id}: name must be 1-16 chars, letters, digits, _ -`);
      for (const port of v.ports) {
        if (!dev.ports.includes(port)) errors.push(`VLAN ${v.id}: ${port} is not on this device.`);
        else if (port === c.trunkPort) errors.push(`VLAN ${v.id}: ${port} is the trunk port.`);
        else if (used.has(port)) errors.push(`${port} is an access port for both VLAN ${used.get(port)} and ${v.id}.`);
        else used.set(port, v.id);
      }
    }
    if (!ids.has(c.mgmtVlanId)) errors.push('Management VLAN must be one of the VLANs above.');
    const m = calcSubnet(c.mgmtCidr);
    if (!m) errors.push('Switch management address must look like 10.99.0.2/24.');
    if (c.mgmtGateway && parseIPv4(c.mgmtGateway) === null) errors.push('Management gateway must be an IPv4 address.');
  }
  return errors;
}

const header = (c: Config, dev: Device) =>
  [
    `# ${c.identity} - ${dev.name}`,
    '# Generated by Network Academy. Target: RouterOS v7.',
    '# Review every line and test in a lab before applying to production.',
    '# Start from a router without its factory default configuration (/system reset-configuration no-defaults=yes skip-backup=yes), otherwise lines that recreate defaults, such as the DHCP client, fail with "already exists". Tested on RouterOS 7.16.',
    '',
    `/system identity set name=${c.identity}`,
  ].join('\n');

function gateway(c: Config, dev: Device): string {
  const lan = calcSubnet(c.lanCidr)!;
  const net = parseIPv4(lan.network)!;
  const bcast = parseIPv4(lan.broadcast)!;
  const poolStart = lan.usableHosts > 20 ? net + 10 : net + 2;
  const poolEnd = bcast - 1;
  const lanPorts = dev.ports.filter((p) => p !== c.wanPort);
  const dns = c.dnsServers.split(',').map((s) => s.trim()).filter(Boolean).join(',');
  const gw = lan.address;

  return [
    header(c, dev),
    '',
    '# --- Bridge and interface lists ---',
    '/interface bridge add name=bridge-lan comment="LAN"',
    ...lanPorts.map((p) => `/interface bridge port add bridge=bridge-lan interface=${p}`),
    '/interface list add name=WAN',
    '/interface list add name=LAN',
    `/interface list member add list=WAN interface=${c.wanPort}`,
    '/interface list member add list=LAN interface=bridge-lan',
    '',
    '# --- Addressing, DHCP, DNS ---',
    `/ip address add address=${c.lanCidr} interface=bridge-lan`,
    `/ip pool add name=dhcp-lan ranges=${formatIPv4(poolStart)}-${formatIPv4(poolEnd)}`,
    '/ip dhcp-server add name=dhcp-lan interface=bridge-lan address-pool=dhcp-lan lease-time=1h disabled=no',
    `/ip dhcp-server network add address=${lan.network}/${lan.cidr} gateway=${gw} dns-server=${gw}`,
    `/ip dhcp-client add interface=${c.wanPort} disabled=no`,
    `/ip dns set allow-remote-requests=yes servers=${dns}`,
    '',
    '# --- Firewall: protect the router ---',
    '/ip firewall filter add chain=input action=accept connection-state=established,related,untracked comment="accept established"',
    '/ip firewall filter add chain=input action=drop connection-state=invalid comment="drop invalid"',
    '/ip firewall filter add chain=input action=accept protocol=icmp comment="accept ICMP"',
    '/ip firewall filter add chain=input action=accept in-interface-list=LAN comment="accept from LAN"',
    '/ip firewall filter add chain=input action=drop comment="drop everything else"',
    '',
    '# --- Firewall: protect the LAN ---',
    '/ip firewall filter add chain=forward action=fasttrack-connection connection-state=established,related hw-offload=yes comment="fasttrack"',
    '/ip firewall filter add chain=forward action=accept connection-state=established,related,untracked comment="accept established"',
    '/ip firewall filter add chain=forward action=drop connection-state=invalid comment="drop invalid"',
    '/ip firewall filter add chain=forward action=drop connection-state=new connection-nat-state=!dstnat in-interface-list=WAN comment="drop new from WAN unless port-forwarded"',
    '',
    '# --- NAT ---',
    '/ip firewall nat add chain=srcnat action=masquerade out-interface-list=WAN comment="masquerade to WAN"',
    '',
    '# --- Hardening ---',
    '/ip service set telnet disabled=yes',
    '/ip service set ftp disabled=yes',
    '/ip service set www disabled=yes',
    '/ip service set api disabled=yes',
    '/ip service set api-ssl disabled=yes',
    '/tool mac-server set allowed-interface-list=LAN',
    '/tool mac-server mac-winbox set allowed-interface-list=LAN',
    '/ip neighbor discovery-settings set discover-interface-list=LAN',
    '',
  ].join('\n');
}

const BOGONS = [
  '0.0.0.0/8', '10.0.0.0/8', '100.64.0.0/10', '127.0.0.0/8', '169.254.0.0/16',
  '172.16.0.0/12', '192.0.2.0/24', '192.168.0.0/16', '198.18.0.0/15',
  '198.51.100.0/24', '203.0.113.0/24', '224.0.0.0/3',
];

function ispEdge(c: Config, dev: Device): string {
  const local = calcSubnet(c.upstreamLocal)!;
  const prefix = calcSubnet(c.announcePrefix)!;
  const custAddr = `${prefix.firstHost}/${prefix.cidr}`;
  const custPorts = dev.ports.filter((p) => p !== c.upstreamPort);
  const p = `${prefix.network}/${prefix.cidr}`;
  const mgmt = calcSubnet(c.mgmtCidr)!;
  // our own prefix has its own explicit rule below, so leave it out here
  const bogonRule = BOGONS.filter((b) => b !== p)
    .map((b) => `dst in ${b}`)
    .join(' || ');

  return [
    header(c, dev),
    '',
    '# --- Interfaces ---',
    '/interface bridge add name=bridge-customers comment="customer-facing"',
    ...custPorts.map((x) => `/interface bridge port add bridge=bridge-customers interface=${x}`),
    '/interface list add name=WAN',
    '/interface list add name=LAN',
    `/interface list member add list=WAN interface=${c.upstreamPort}`,
    '/interface list member add list=LAN interface=bridge-customers',
    '',
    '# --- Addressing ---',
    `/ip address add address=${c.upstreamLocal} interface=${c.upstreamPort} comment="upstream link"`,
    `/ip address add address=${custAddr} interface=bridge-customers comment="customer gateway"`,
    `/ip route add dst-address=${p} blackhole comment="anchor route so BGP can originate the prefix"`,
    '',
    '# --- Prefix lists ---',
    `/ip firewall address-list add list=bgp-announce address=${p}`,
    `/ip firewall address-list add list=mgmt address=${mgmt.network}/${mgmt.cidr}`,
    '',
    '# --- BGP filters (never trust the internet) ---',
    '/routing filter rule add chain=upstream-in rule="if (dst == 0.0.0.0/0) { reject }" comment="reject default route"',
    `/routing filter rule add chain=upstream-in rule="if (${bogonRule}) { reject }"`,
    `/routing filter rule add chain=upstream-in rule="if (dst == ${p}) { reject }" comment="reject our own prefix"`,
    '/routing filter rule add chain=upstream-in rule="if (dst-len > 24) { reject }" comment="reject longer than /24"',
    '/routing filter rule add chain=upstream-in rule="accept"',
    `/routing filter rule add chain=upstream-out rule="if (dst == ${p}) { accept }"`,
    '/routing filter rule add chain=upstream-out rule="reject" comment="announce only our own prefix"',
    '',
    '# --- BGP session ---',
    c.bgpStyle === 'instance'
      ? '# RouterOS 7.20 and later: an explicit BGP instance holds the AS number and router ID.'
      : '# RouterOS 7.16 to 7.19: a BGP template holds the AS number and router ID (checked on 7.16). On 7.20 or later choose the instance style.',
    c.bgpStyle === 'instance'
      ? `/routing bgp instance add name=main as=${c.localAsn} router-id=${local.address}`
      : `/routing bgp template add name=main as=${c.localAsn} router-id=${local.address}`,
    `/routing bgp connection add name=upstream ${c.bgpStyle === 'instance' ? 'instance' : 'templates'}=main local.address=${local.address} local.role=ebgp remote.address=${c.upstreamPeer} remote.as=${c.peerAsn} output.network=bgp-announce output.filter-chain=upstream-out input.filter=upstream-in`,
    '',
    '# --- Firewall: protect the router ---',
    '/ip firewall filter add chain=input action=accept connection-state=established,related,untracked comment="accept established"',
    '/ip firewall filter add chain=input action=drop connection-state=invalid comment="drop invalid"',
    '/ip firewall filter add chain=input action=accept protocol=icmp comment="accept ICMP"',
    `/ip firewall filter add chain=input action=accept protocol=tcp dst-port=179 src-address=${c.upstreamPeer} comment="BGP from upstream only"`,
    '/ip firewall filter add chain=input action=accept src-address-list=mgmt comment="management subnet"',
    '/ip firewall filter add chain=input action=drop comment="drop everything else"',
    '',
    '# --- Firewall: transit and anti-spoofing ---',
    '/ip firewall filter add chain=forward action=accept connection-state=established,related,untracked comment="accept established"',
    '/ip firewall filter add chain=forward action=drop connection-state=invalid comment="drop invalid"',
    `/ip firewall filter add chain=forward action=drop in-interface=bridge-customers src-address=!${p} comment="anti-spoof: customers may only source our prefix"`,
    '/ip firewall filter add chain=forward action=drop in-interface-list=WAN src-address=' + p + ' comment="drop spoofed traffic claiming our prefix"',
    '',
    '# --- Hardening ---',
    '/ip service set telnet disabled=yes',
    '/ip service set ftp disabled=yes',
    '/ip service set www disabled=yes',
    '/ip service set api disabled=yes',
    '/ip service set api-ssl disabled=yes',
    '/tool mac-server set allowed-interface-list=LAN',
    '/tool mac-server mac-winbox set allowed-interface-list=LAN',
    '/ip neighbor discovery-settings set discover-interface-list=LAN',
    '',
  ].join('\n');
}

function vlanSwitch(c: Config, dev: Device): string {
  const m = calcSubnet(c.mgmtCidr)!;
  const accessPorts = new Set(c.vlans.flatMap((v) => v.ports));
  const vlans = [...c.vlans].sort((a, b) => a.id - b.id);
  const mgmt = vlans.find((v) => v.id === c.mgmtVlanId)!;

  return [
    header(c, dev),
    '',
    '# --- Bridge (VLAN filtering is enabled last to avoid locking yourself out) ---',
    '/interface bridge add name=bridge1 vlan-filtering=no',
    `/interface bridge port add bridge=bridge1 interface=${c.trunkPort} frame-types=admit-only-vlan-tagged comment="trunk"`,
    ...vlans.flatMap((v) =>
      v.ports.map(
        (port) =>
          `/interface bridge port add bridge=bridge1 interface=${port} pvid=${v.id} frame-types=admit-only-untagged-and-priority-tagged comment="access ${v.name}"`,
      ),
    ),
    '',
    '# --- VLAN table ---',
    ...vlans.map((v) => {
      const tagged = ['bridge1', c.trunkPort];
      const untagged = v.ports;
      // bridge1 needs to be tagged only for the management VLAN (it has an L3 interface)
      const t = v.id === c.mgmtVlanId ? tagged : [c.trunkPort];
      return `/interface bridge vlan add bridge=bridge1 vlan-ids=${v.id} tagged=${t.join(',')}${untagged.length ? ` untagged=${untagged.join(',')}` : ''} comment="${v.name}"`;
    }),
    '',
    '# --- Management interface ---',
    `/interface vlan add name=vlan${mgmt.id}-${mgmt.name} interface=bridge1 vlan-id=${mgmt.id}`,
    `/ip address add address=${c.mgmtCidr} interface=vlan${mgmt.id}-${mgmt.name}`,
    ...(c.mgmtGateway ? [`/ip route add dst-address=0.0.0.0/0 gateway=${c.mgmtGateway}`] : []),
    `# Management subnet: ${m.network}/${m.cidr}`,
    '',
    '# --- Hardening ---',
    '/ip service set telnet disabled=yes',
    '/ip service set ftp disabled=yes',
    '/ip service set www disabled=yes',
    '/ip service set api disabled=yes',
    '/ip service set api-ssl disabled=yes',
    '',
    `# ${accessPorts.size} access port(s) configured. Enable filtering from a port on VLAN ${mgmt.id} or the trunk:`,
    '/interface bridge set bridge1 vlan-filtering=yes',
    '',
  ].join('\n');
}

export function generate(input: Config): { rsc: string; errors: string[] } {
  const c = normalise(input);
  const errors = validate(c);
  if (errors.length) return { rsc: '', errors };
  const dev = deviceById(c.deviceId)!;
  const rsc = c.role === 'gateway' ? gateway(c, dev) : c.role === 'isp-edge' ? ispEdge(c, dev) : vlanSwitch(c, dev);
  return { rsc, errors: [] };
}
