import type { LessonKit } from '../lessonKit';

export const SECURITY_KITS: LessonKit[] = [
  {
    lesson: 'security/01-ipsec-fundamentals',
    level: 'Professional',
    quiz: [
      { q: 'What does IKE phase 1 establish?', options: ['A secure channel used to negotiate the real (phase 2) tunnel', 'The final encrypted data tunnel', 'A routing adjacency', 'A DNS record'], answer: 0, explain: 'Phase 1 builds a protected channel; phase 2 negotiates the actual IPsec SAs inside it.' },
      { q: 'What is the difference between tunnel mode and transport mode?', options: ['Tunnel mode wraps the whole original packet in a new one; transport mode protects only the payload', 'Transport mode is only for IPv6', 'Tunnel mode has no encryption', 'They are the same thing with different names'], answer: 0, explain: 'Tunnel mode adds a new IP header for site-to-site use; transport mode keeps the original header, typical for host-to-host.' },
      { q: 'Two ends have matching phase 1 but the tunnel never passes traffic. What is a likely cause?', options: ['Mismatched phase 2 selectors (the traffic each side expects to protect)', 'A wrong VLAN ID', 'DNS is down', 'The default gateway changed'], answer: 0, explain: 'Phase 1 succeeding only proves the outer channel works; phase 2 selectors still have to match on both ends.' },
    ],
  },
  {
    lesson: 'security/02-aaa-radius-8021x',
    level: 'Professional',
    quiz: [
      { q: 'What are the three parts of AAA?', options: ['Authentication, authorization, accounting', 'Access, audit, alerting', 'Authentication, availability, auditing', 'Allow, ask, alert'], answer: 0, explain: 'Authentication checks who you are, authorization checks what you may do, accounting records what you did.' },
      { q: 'In 802.1X, what role does the switch play?', options: ['Authenticator, relaying the exchange between supplicant and auth server', 'Supplicant', 'Authentication server', 'None, 802.1X is client-server only'], answer: 0, explain: 'The client is the supplicant, the switch is the authenticator, and a RADIUS server is the authentication server.' },
      { q: 'Which RADIUS ports does modern MikroTik/RFC 2865-2866 use?', options: ['1812 (authentication) and 1813 (accounting)', '1645 and 1646 only', '389 and 636', '3389'], answer: 0, explain: '1812/1813 are the standardised ports; 1645/1646 are the older legacy ports some gear still defaults to.' },
    ],
  },
  {
    lesson: 'security/03-secure-management-and-logging',
    level: 'Professional',
    labs: ['secure-management-basics'],
    quiz: [
      { q: 'Why disable Telnet even on a trusted internal network?', options: ['It sends credentials in clear text, readable by anything that can see the traffic', 'It uses too much bandwidth', 'It is not supported on RouterOS', 'It breaks SSH'], answer: 0, explain: 'Cleartext protocols expose credentials to anyone able to observe the traffic, internal network or not.' },
      { q: 'Why send logs to a separate server instead of keeping them only on the device?', options: ['A device that reboots or is compromised can lose or have its local log erased', 'It is required by RouterOS licensing', 'Local logs are always incomplete', 'Syslog is faster than local storage'], answer: 0, explain: 'A local-only log disappears on reboot and can be erased by an attacker who reaches the device.' },
      { q: 'Why does out-of-band management matter after a misconfiguration specifically?', options: ['A routing or firewall mistake can cut off the very path used to fix it, unless management does not depend on that path', 'It is faster than in-band management', 'It avoids the need for a password', 'It replaces the need for logging'], answer: 0, explain: 'If management traffic depends on the broken configuration, you lock yourself out exactly when you need access most.' },
    ],
  },
  {
    lesson: 'security/04-threats-and-defence-in-depth',
    level: 'Professional',
    quiz: [
      { q: 'What is defence in depth?', options: ['Layering multiple independent controls so one failure alone does not lead to compromise', 'Buying the most expensive firewall available', 'Using a single very strong password', 'Disabling all remote access'], answer: 0, explain: 'No single control is perfect; layering means one failure is caught by another layer.' },
      { q: 'Which of these is usually the most common real-world cause of outages and exposure?', options: ['Misconfiguration', 'Zero-day exploits', 'Physical cable damage', 'Power failures'], answer: 0, explain: 'A left-open rule or unchanged default password causes far more real incidents than novel attacks.' },
      { q: 'What does the principle of least privilege limit?', options: ['What any one account, rule or service can reach, to only what it needs', 'How many devices can be on a network', 'The number of firewall rules allowed', 'The length of a password'], answer: 0, explain: 'Least privilege shrinks the blast radius of any single compromised credential or misconfigured rule.' },
    ],
  },
];
