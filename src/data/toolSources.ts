const d = '2026-09-21';
const rfc = (n: number, title: string) => ({ title: `RFC ${n}: ${title}`, url: `https://www.rfc-editor.org/rfc/rfc${n}`, publisher: 'IETF', accessed: d });

export const SRC = {
  cidr: rfc(4632, 'Classless Inter-domain Routing (CIDR)'),
  p2p: rfc(3021, 'Using 31-Bit Prefixes on IPv4 Point-to-Point Links'),
  private: rfc(1918, 'Address Allocation for Private Internets'),
  v6arch: rfc(4291, 'IP Version 6 Addressing Architecture'),
  v6text: rfc(5952, 'A Recommendation for IPv6 Address Text Representation'),
  ula: rfc(4193, 'Unique Local IPv6 Unicast Addresses'),
  v6doc: rfc(3849, 'IPv6 Address Prefix Reserved for Documentation'),
  shared: rfc(6598, 'IANA-Reserved IPv4 Prefix for Shared Address Space'),
  nist: { title: 'Prefixes for binary multiples', url: 'https://physics.nist.gov/cuu/Units/binary.html', publisher: 'NIST', accessed: d },
  ports: { title: 'Service Name and Transport Protocol Port Number Registry', url: 'https://www.iana.org/assignments/service-names-port-numbers/service-names-port-numbers.xhtml', publisher: 'IANA', accessed: d },
};
