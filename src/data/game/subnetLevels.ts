/** Subnet Valley: multiple-choice puzzle rounds. Every answer is re-computed from the subnet engine in tests. */

export type RoundKind = 'same-subnet' | 'network' | 'gateway' | 'prefix-for-hosts' | 'broadcast' | 'usable-count';

export interface Round {
  kind: RoundKind;
  prompt: string;
  /** Facts the checker needs (addresses, host count). */
  a?: string;
  b?: string;
  hosts?: number;
  cidr?: number;
  options: string[];
  answer: string;
  why: string;
}

export interface SubnetLevel {
  id: string;
  title: string;
  story: string;
  learn: string;
  boss?: string;
  /** Mistakes allowed before the level is failed. Stars: 0 mistakes 3, 1 mistake 2, otherwise 1. */
  lives: number;
  rounds: Round[];
  read?: { href: string; label: string };
}

const same = (a: string, b: string, answer: string, why: string): Round => ({
  kind: 'same-subnet', a, b,
  prompt: `${a} and ${b} must share one subnet. Which is the longest prefix (the smallest network) that still holds both?`,
  options: ['/24', '/25', '/26', '/27'], answer, why,
});
const network = (ip: string, options: string[], answer: string, why: string): Round => ({
  kind: 'network', a: ip, prompt: `What is the network address of ${ip}?`, options, answer, why,
});
const gateway = (net: string, options: string[], answer: string, why: string): Round => ({
  kind: 'gateway', a: net, prompt: `Which address can be the router's gateway address in ${net}?`, options, answer, why,
});
const hostsRound = (hosts: number, options: string[], answer: string, why: string): Round => ({
  kind: 'prefix-for-hosts', hosts, prompt: `A branch has ${hosts} devices. Which is the smallest prefix that fits them all?`, options, answer, why,
});
const bcast = (ip: string, options: string[], answer: string, why: string): Round => ({
  kind: 'broadcast', a: ip, prompt: `What is the broadcast address of ${ip}?`, options, answer, why,
});
const usable = (cidr: number, options: string[], answer: string, why: string): Round => ({
  kind: 'usable-count', cidr, prompt: `How many usable host addresses does a /${cidr} have?`, options, answer, why,
});

export const SUBNET_LEVELS: SubnetLevel[] = [
  {
    id: 'subnet-1',
    title: 'Same Street',
    story: 'Two houses want to share one street. The mask decides where a street ends, and a wrong mask leaves neighbours unable to talk.',
    learn: 'Two hosts are on the same subnet when their addresses give the same network address under the mask. A longer prefix makes smaller networks. Look at where the block boundary falls: /25 blocks are 128 wide, /26 are 64, /27 are 32.',
    lives: 2,
    rounds: [
      same('10.0.5.20', '10.0.5.200', '/24', '20 sits in 0-127 and 200 sits in 128-255, so only a /24 holds both.'),
      same('172.16.4.10', '172.16.4.100', '/25', 'Both fall in 0-127, so a /25 holds them; a /26 would split them at 64.'),
      same('192.168.1.5', '192.168.1.60', '/26', 'Both fall in 0-63, the first /26 block; a /27 would split them at 32.'),
      same('10.9.9.33', '10.9.9.40', '/27', 'Both fall in 32-63, the second /27 block.'),
    ],
    read: { href: '/learn/foundations/02-ip-addressing-subnetting', label: 'IP addressing and subnetting' },
  },
  {
    id: 'subnet-2',
    title: 'Find the Gate',
    story: 'Every street has a name written on its gate: the network address. Read it correctly and the guards let you in.',
    learn: 'The network address is the host address with all host bits set to 0. With the block-size method, take the block size (256 minus the mask octet) and round the address down to a multiple of it.',
    lives: 2,
    rounds: [
      network('192.168.1.77/26', ['192.168.1.0', '192.168.1.64', '192.168.1.76', '192.168.1.96'], '192.168.1.64', 'Blocks of 64: 0, 64, 128, 192. The address 77 sits in the block starting at 64.'),
      network('10.4.9.130/25', ['10.4.9.0', '10.4.9.128', '10.4.9.129', '10.4.9.192'], '10.4.9.128', 'Blocks of 128: 0 and 128. 130 falls in the block starting at 128.'),
      network('172.16.35.200/27', ['172.16.35.192', '172.16.35.196', '172.16.35.199', '172.16.35.224'], '172.16.35.192', 'Blocks of 32: 192 is a multiple of 32 and the next is 224.'),
      network('10.20.30.45/28', ['10.20.30.32', '10.20.30.40', '10.20.30.44', '10.20.30.48'], '10.20.30.32', 'Blocks of 16: 32, 48. 45 falls in the block starting at 32.'),
    ],
    read: { href: '/tools/subnet-calculator', label: 'Subnet calculator' },
  },
  {
    id: 'subnet-3',
    title: 'The Gateway Post',
    story: 'The router needs an address of its own on each street. But two addresses on every street are off limits.',
    learn: 'The first address of a subnet is the network address and the last is the broadcast. Neither can be given to a host. Everything in between is usable.',
    lives: 2,
    rounds: [
      gateway('192.168.10.0/24', ['192.168.10.0', '192.168.10.255', '192.168.11.1', '192.168.10.1'], '192.168.10.1', '.0 is the network, .255 the broadcast, and 192.168.11.1 is in a different subnet.'),
      gateway('10.1.1.64/27', ['10.1.1.64', '10.1.1.95', '10.1.1.96', '10.1.1.65'], '10.1.1.65', '64 is the network, 95 is the broadcast, and 96 belongs to the next subnet.'),
      gateway('172.16.8.128/26', ['172.16.8.128', '172.16.8.191', '172.16.8.192', '172.16.8.190'], '172.16.8.190', '128 is the network and 191 is the broadcast; 192 is the next subnet. 190 is the last usable address.'),
      gateway('192.168.50.8/29', ['192.168.50.8', '192.168.50.15', '192.168.50.16', '192.168.50.9'], '192.168.50.9', '8 is the network and 15 the broadcast, so usable is 9 to 14.'),
    ],
    read: { href: '/learn/foundations/02-ip-addressing-subnetting', label: 'IP addressing and subnetting' },
  },
  {
    id: 'subnet-4',
    title: 'Split the Land',
    story: 'The mayor has one big plot and many villages of different sizes. Give each village a right-sized block: not too small, not wasteful.',
    learn: 'A subnet of prefix /n has 2^(32-n) addresses, and two of them are reserved (network and broadcast). Pick the smallest prefix whose usable count is at least what you need. This is the heart of VLSM.',
    lives: 2,
    rounds: [
      hostsRound(50, ['/25', '/26', '/27', '/28'], '/26', '/26 has 62 usable addresses. A /27 has only 30.'),
      hostsRound(28, ['/26', '/27', '/28', '/29'], '/27', '/27 has 30 usable addresses. A /28 has only 14.'),
      hostsRound(100, ['/24', '/25', '/26', '/27'], '/25', '/25 has 126 usable addresses. A /26 has only 62.'),
      hostsRound(6, ['/28', '/29', '/30', '/31'], '/29', '/29 has 6 usable addresses. A /30 has only 2.'),
      usable(27, ['30', '32', '62', '28'], '30', '2^5 = 32 addresses, minus network and broadcast is 30.'),
    ],
    read: { href: '/tools/vlsm-calculator', label: 'VLSM calculator' },
  },
  {
    id: 'subnet-5',
    title: 'Boss: The Subnet Dragon',
    boss: 'The Subnet Dragon',
    story: 'The dragon guards the pass with riddles from every part of the valley. Two slips and it wins.',
    learn: 'Everything so far in one fight: block boundaries, network and broadcast addresses, and sizing for hosts.',
    lives: 2,
    rounds: [
      network('192.168.7.150/26', ['192.168.7.128', '192.168.7.144', '192.168.7.150', '192.168.7.192'], '192.168.7.128', 'Blocks of 64: 128 is the block that holds 150.'),
      bcast('10.10.10.20/27', ['10.10.10.31', '10.10.10.32', '10.10.10.30', '10.10.10.63'], '10.10.10.31', 'The /27 block is 0-31, so the broadcast is 31.'),
      hostsRound(200, ['/23', '/24', '/25', '/26'], '/24', '/24 has 254 usable addresses. A /25 has only 126.'),
      same('172.20.1.70', '172.20.1.120', '/26', '70 and 120 both sit in 64-127, one /26 block; a /27 would split them at 96.'),
      gateway('10.0.0.32/28', ['10.0.0.32', '10.0.0.47', '10.0.0.48', '10.0.0.33'], '10.0.0.33', '32 is the network, 47 is the broadcast and 48 is the next subnet.'),
      bcast('192.168.100.65/26', ['192.168.100.127', '192.168.100.128', '192.168.100.64', '192.168.100.126'], '192.168.100.127', 'The block starts at 64 and holds 64 addresses, ending at 127.'),
      usable(30, ['1', '2', '4', '6'], '2', '/30 has 4 addresses. Take away the network and the broadcast: 2 remain.'),
      network('10.200.3.99/29', ['10.200.3.96', '10.200.3.97', '10.200.3.98', '10.200.3.104'], '10.200.3.96', 'Blocks of 8: 96 holds 96-103.'),
    ],
    read: { href: '/practice/subnetting', label: 'Subnetting practice' },
  },
];

export const starsForMistakes = (mistakes: number, lives: number) => (mistakes > lives ? 0 : mistakes === 0 ? 3 : mistakes === 1 ? 2 : 1);
