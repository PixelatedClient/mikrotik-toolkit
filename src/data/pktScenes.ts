/**
 * Pkt's little stories on the landing page: travelling, searching, routing and configuring.
 * The landing page picks a random scene, plays its steps one after the other, then picks another.
 * A step sets Pkt's pose, face and prop, and walks to `x` (world pixels, 0 is where Pkt starts) over `ms`.
 */
export type Pose = 'idle' | 'walk' | 'run' | 'hop' | 'jump' | 'spin' | 'tilt' | 'shake' | 'squash' | 'lean' | 'dance' | 'sleep' | 'type' | 'stretch' | 'wave';
export type Eyes = 'c' | 'l' | 'r' | 'u' | 'd' | 'x';
export type Mouth = 'flat' | 'smile' | 'open' | 'o' | 'sad';
export type Led = 'g' | 'r' | 'y' | 'off';

export interface Step {
  x?: number;
  pose?: Pose;
  eyes?: Eyes;
  mouth?: Mouth;
  led?: Led;
  /** Prop name from pktProps.ts, or null to put the current prop away. */
  prop?: string | null;
  /** How long this step lasts. */
  ms: number;
}

export interface Scene {
  id: string;
  kind: 'travel' | 'search' | 'route' | 'config' | 'fun';
  text: string;
  steps: Step[];
}

const at = (x: number, pose: Pose, ms: number, more: Partial<Step> = {}): Step => ({ x, pose, ms, ...more });

export const SCENES: Scene[] = [
  // ----- travelling -----
  { id: 'walk-castle', kind: 'travel', text: 'Walking to the castle with a packet', steps: [at(120, 'walk', 3600, { eyes: 'r', mouth: 'smile' }), at(120, 'idle', 700, { mouth: 'flat' }), at(-40, 'walk', 3200, { eyes: 'l' })] },
  { id: 'run-late', kind: 'travel', text: 'Running late! The packet TTL is almost zero', steps: [at(-140, 'run', 1800, { eyes: 'l', mouth: 'open', led: 'r', prop: 'exclam' }), at(150, 'run', 2600, { eyes: 'r' }), at(150, 'squash', 600, { prop: null, mouth: 'o', led: 'g' })] },
  { id: 'hop-puddle', kind: 'travel', text: 'Hopping over a puddle on the road', steps: [at(20, 'walk', 1800, { eyes: 'r', prop: 'puddle' }), at(70, 'hop', 700, { mouth: 'open' }), at(120, 'walk', 900, { prop: null, mouth: 'smile' })] },
  { id: 'hike', kind: 'travel', text: 'Hiking with a backpack full of cables', steps: [at(-60, 'walk', 2600, { eyes: 'r', prop: 'backpack', mouth: 'smile' }), at(100, 'walk', 3400), at(100, 'stretch', 900, { mouth: 'open', prop: null })] },
  { id: 'read-map', kind: 'travel', text: 'Reading the map to find the next hop', steps: [at(0, 'idle', 700, { prop: 'map', eyes: 'd', mouth: 'flat' }), at(0, 'tilt', 1200, { eyes: 'd' }), at(0, 'lean', 900, { eyes: 'r', prop: 'exclam' }), at(90, 'walk', 1800, { prop: null, eyes: 'r', mouth: 'smile' })] },
  { id: 'compass', kind: 'travel', text: 'Checking the compass: north is the gateway', steps: [at(0, 'idle', 600, { prop: 'compass', eyes: 'd' }), at(0, 'shake', 900, { eyes: 'l' }), at(0, 'tilt', 900, { eyes: 'u', mouth: 'o' }), at(60, 'walk', 1400, { prop: null, eyes: 'u', mouth: 'smile' })] },
  { id: 'camp', kind: 'travel', text: 'Taking a break by the campfire', steps: [at(-110, 'walk', 2600, { eyes: 'r' }), at(-110, 'idle', 400, { prop: 'campfire', mouth: 'smile', eyes: 'd' }), at(-110, 'idle', 3200, { mouth: 'smile' }), at(-110, 'stretch', 900, { prop: null, mouth: 'open' })] },
  { id: 'sleepy', kind: 'travel', text: 'Waiting for a slow link... zzz', steps: [at(0, 'tilt', 700, { eyes: 'x', mouth: 'flat', led: 'y' }), at(0, 'sleep', 3800, { eyes: 'x', prop: 'zzz', led: 'off' }), at(0, 'jump', 600, { prop: 'exclam', eyes: 'c', mouth: 'o', led: 'g' })] },
  { id: 'sunrise', kind: 'travel', text: 'Good morning! Stretching before the shift', steps: [at(0, 'stretch', 1400, { prop: 'sun', mouth: 'open', eyes: 'u' }), at(0, 'wave', 1600, { mouth: 'smile' }), at(60, 'walk', 1400, { prop: null })] },
  { id: 'hello', kind: 'travel', text: 'Saying hello to a visitor', steps: [at(0, 'wave', 2200, { mouth: 'smile', prop: 'heart', eyes: 'c' }), at(0, 'hop', 700, { prop: null })] },

  // ----- searching -----
  { id: 'binoculars', kind: 'search', text: 'Looking for the missing route with binoculars', steps: [at(40, 'walk', 1400, { eyes: 'r' }), at(40, 'idle', 1000, { prop: 'binoculars', eyes: 'r', mouth: 'flat' }), at(40, 'tilt', 1200, { eyes: 'u' }), at(40, 'jump', 600, { prop: 'exclam', eyes: 'c', mouth: 'open' })] },
  { id: 'magnify', kind: 'search', text: 'Inspecting the routing table with a magnifier', steps: [at(-20, 'lean', 900, { prop: 'magnifier', eyes: 'd' }), at(20, 'walk', 1200, { eyes: 'd' }), at(60, 'walk', 1200, { eyes: 'd' }), at(60, 'shake', 700, { prop: 'question', eyes: 'c', mouth: 'o' })] },
  { id: 'question', kind: 'search', text: 'Where does this packet go? Hmm...', steps: [at(0, 'tilt', 900, { prop: 'question', eyes: 'u', mouth: 'flat' }), at(0, 'shake', 800, { eyes: 'l' }), at(0, 'shake', 800, { eyes: 'r' }), at(0, 'jump', 500, { prop: 'bulb', mouth: 'open', eyes: 'c' })] },
  { id: 'trail', kind: 'search', text: 'Following the packet trail', steps: [at(-100, 'lean', 700, { eyes: 'd', prop: 'arrow' }), at(-30, 'walk', 1600, { eyes: 'd' }), at(60, 'walk', 1600, { eyes: 'd' }), at(120, 'lean', 900, { eyes: 'r', prop: 'exclam', mouth: 'o' })] },
  { id: 'lost-packet', kind: 'search', text: 'A packet is missing! Checking the dropped counters', steps: [at(0, 'shake', 700, { prop: 'cross', mouth: 'sad', led: 'r' }), at(-80, 'walk', 1400, { eyes: 'l', prop: 'magnifier' }), at(-80, 'idle', 900, { eyes: 'd' }), at(-80, 'hop', 600, { prop: 'check', mouth: 'smile', led: 'g' })] },
  { id: 'globe', kind: 'search', text: 'Looking up the route to the internet', steps: [at(20, 'idle', 700, { prop: 'globe', eyes: 'r' }), at(20, 'tilt', 1300, { eyes: 'r', mouth: 'o' }), at(20, 'hop', 700, { prop: 'check', mouth: 'smile' })] },

  // ----- routing -----
  { id: 'static-route', kind: 'route', text: 'Adding a static route: dst-address, then gateway', steps: [at(0, 'idle', 600, { prop: 'signpost', eyes: 'r' }), at(0, 'type', 1800, { prop: 'signpost', eyes: 'd', mouth: 'flat' }), at(0, 'jump', 600, { prop: 'check', mouth: 'smile', led: 'g' })] },
  { id: 'point-gw', kind: 'route', text: 'Pointing traffic at the right gateway', steps: [at(-20, 'idle', 700, { prop: 'arrow', eyes: 'r' }), at(-20, 'lean', 900, { eyes: 'r', mouth: 'open' }), at(-20, 'wave', 900, { mouth: 'smile' })] },
  { id: 'loop', kind: 'route', text: 'Breaking a routing loop before TTL runs out', steps: [at(-30, 'spin', 1600, { eyes: 'c', mouth: 'o', prop: 'cross', led: 'r' }), at(-30, 'spin', 1200, { eyes: 'c' }), at(-30, 'shake', 600, { prop: 'hammer', mouth: 'flat' }), at(-30, 'jump', 600, { prop: 'check', led: 'g', mouth: 'smile' })] },
  { id: 'ttl', kind: 'route', text: 'Counting the TTL down at every hop', steps: [at(-90, 'walk', 1000, { prop: 'package', eyes: 'r' }), at(-20, 'hop', 600, { eyes: 'r' }), at(50, 'hop', 600), at(120, 'hop', 600, { mouth: 'o' }), at(120, 'squash', 700, { prop: 'exclam', mouth: 'o' })] },
  { id: 'throw-packets', kind: 'route', text: 'Sending packets toward the castle', steps: [at(60, 'lean', 700, { prop: 'package', eyes: 'r' }), at(60, 'jump', 500, { mouth: 'open', prop: 'package' }), at(60, 'idle', 600, { prop: 'arrow', eyes: 'r' }), at(60, 'wave', 900, { prop: null, mouth: 'smile' })] },
  { id: 'traceroute', kind: 'route', text: 'Running a traceroute, hop by hop', steps: [at(-110, 'idle', 500, { prop: 'router', eyes: 'r' }), at(-40, 'walk', 1300, { prop: 'router', eyes: 'r' }), at(30, 'walk', 1300, { prop: 'router', eyes: 'r' }), at(100, 'walk', 1300, { prop: 'router', eyes: 'r' }), at(100, 'jump', 600, { prop: 'check', mouth: 'smile' })] },
  { id: 'ospf', kind: 'route', text: 'Waiting for an OSPF neighbour to reach Full', steps: [at(0, 'idle', 600, { prop: 'router', eyes: 'r', led: 'y' }), at(0, 'tilt', 1600, { eyes: 'r', mouth: 'flat', led: 'y' }), at(0, 'hop', 600, { prop: 'check', led: 'g', mouth: 'open' })] },
  { id: 'bgp', kind: 'route', text: 'Bringing up a BGP session to the upstream', steps: [at(60, 'walk', 1600, { prop: 'cable', eyes: 'r' }), at(60, 'type', 1500, { prop: 'wifi', eyes: 'd' }), at(60, 'dance', 1100, { prop: 'check', mouth: 'open', led: 'g' })] },

  // ----- configuration -----
  { id: 'type-config', kind: 'config', text: 'Typing the config: /ip address add', steps: [at(0, 'idle', 600, { prop: 'laptop', eyes: 'd' }), at(0, 'type', 2600, { prop: 'laptop', eyes: 'd', mouth: 'flat' }), at(0, 'hop', 600, { prop: 'check', mouth: 'smile', led: 'g' })] },
  { id: 'backup', kind: 'config', text: 'Saving a backup before touching anything', steps: [at(0, 'idle', 500, { prop: 'disk', eyes: 'd' }), at(0, 'lean', 1300, { prop: 'progress', mouth: 'flat' }), at(0, 'hop', 700, { prop: 'check', mouth: 'smile', led: 'g' })] },
  { id: 'upgrade', kind: 'config', text: 'Upgrading RouterOS... do not power off', steps: [at(0, 'idle', 500, { prop: 'progress', led: 'y', eyes: 'd' }), at(0, 'shake', 1600, { prop: 'progress', led: 'y', mouth: 'o' }), at(0, 'idle', 1200, { prop: 'power', led: 'off', eyes: 'x' }), at(0, 'jump', 700, { prop: 'check', led: 'g', eyes: 'c', mouth: 'open' })] },
  { id: 'vlan', kind: 'config', text: 'Turning VLAN filtering on... last!', steps: [at(0, 'idle', 700, { prop: 'toggle', eyes: 'd' }), at(0, 'lean', 900, { prop: 'toggle', mouth: 'o' }), at(0, 'jump', 700, { prop: 'check', mouth: 'smile', led: 'g' })] },
  { id: 'firewall', kind: 'config', text: 'Raising the firewall: drop by default', steps: [at(20, 'idle', 700, { prop: 'shield', eyes: 'u' }), at(20, 'lean', 900, { prop: 'shield', mouth: 'flat' }), at(20, 'dance', 900, { prop: 'shield', mouth: 'smile' })] },
  { id: 'harden', kind: 'config', text: 'Locking down the services on the router', steps: [at(0, 'type', 1200, { prop: 'lock', eyes: 'd' }), at(0, 'shake', 700, { prop: 'lock', mouth: 'o' }), at(0, 'hop', 600, { prop: 'check', mouth: 'smile', led: 'g' })] },
  { id: 'plug', kind: 'config', text: 'Plugging the cable into the right port', steps: [at(0, 'idle', 500, { prop: 'cable', eyes: 'r' }), at(0, 'lean', 900, { prop: 'cable', eyes: 'r' }), at(0, 'squash', 500, { prop: 'spark', mouth: 'o', led: 'g' }), at(0, 'hop', 600, { prop: null, mouth: 'smile' })] },
  { id: 'fix-cable', kind: 'config', text: 'Replacing a bad cable: link is up again', steps: [at(0, 'shake', 800, { prop: 'spark', led: 'r', mouth: 'sad' }), at(0, 'idle', 600, { prop: 'wrench', eyes: 'd' }), at(0, 'type', 1200, { prop: 'wrench', eyes: 'd' }), at(0, 'jump', 700, { prop: 'check', led: 'g', mouth: 'open' })] },
  { id: 'debug', kind: 'config', text: 'Squashing a config bug', steps: [at(0, 'idle', 600, { prop: 'bug', eyes: 'r', mouth: 'o' }), at(0, 'shake', 800, { prop: 'bug', eyes: 'r' }), at(0, 'jump', 500, { prop: 'hammer', mouth: 'open' }), at(0, 'squash', 500, { prop: 'check', mouth: 'smile', led: 'g' })] },
  { id: 'reboot', kind: 'config', text: 'Rebooting the router (the safe way)', steps: [at(0, 'idle', 700, { prop: 'power', led: 'r', mouth: 'flat' }), at(0, 'sleep', 1500, { led: 'off', eyes: 'x', prop: 'power' }), at(0, 'jump', 700, { led: 'g', eyes: 'c', prop: 'sparkle', mouth: 'open' })] },
  { id: 'monitor', kind: 'config', text: 'Watching the traffic graph for spikes', steps: [at(-40, 'idle', 700, { prop: 'graph', eyes: 'r' }), at(-40, 'tilt', 1400, { prop: 'graph', eyes: 'r', mouth: 'flat' }), at(-40, 'hop', 600, { prop: 'check', mouth: 'smile' })] },
  { id: 'gear', kind: 'config', text: 'Tuning the queue: shaping the bandwidth', steps: [at(0, 'lean', 800, { prop: 'gear', eyes: 'd' }), at(0, 'spin', 1400, { prop: 'gear', eyes: 'd' }), at(0, 'dance', 900, { prop: 'check', mouth: 'smile' })] },
  { id: 'server-check', kind: 'config', text: 'Checking the server answers on port 80', steps: [at(40, 'walk', 1500, { prop: 'server', eyes: 'r' }), at(40, 'idle', 900, { prop: 'server', eyes: 'r', led: 'y' }), at(40, 'wave', 900, { prop: 'check', led: 'g', mouth: 'smile' })] },

  // ----- just for fun -----
  { id: 'dance', kind: 'fun', text: 'Everything is green: victory dance!', steps: [at(0, 'dance', 2200, { prop: 'sparkle', mouth: 'open', led: 'g' }), at(0, 'hop', 800, { prop: 'star', mouth: 'smile' })] },
  { id: 'party', kind: 'fun', text: 'Ticket closed. Time to celebrate', steps: [at(-40, 'hop', 800, { prop: 'heart', mouth: 'open' }), at(40, 'hop', 800, { prop: 'star', mouth: 'open' }), at(0, 'dance', 1400, { prop: 'sparkle', mouth: 'smile' })] },
  { id: 'cloud-nap', kind: 'fun', text: 'Watching the clouds go by', steps: [at(-80, 'idle', 900, { prop: 'cloud', eyes: 'u', mouth: 'smile' }), at(-80, 'tilt', 2200, { eyes: 'u', mouth: 'smile' }), at(-80, 'wave', 900, { prop: null, eyes: 'c' })] },
  { id: 'paper-pass', kind: 'fun', text: 'Copying the config to the next router', steps: [at(0, 'idle', 500, { prop: 'paper', eyes: 'd' }), at(70, 'walk', 1600, { prop: 'paper', eyes: 'r' }), at(70, 'hop', 700, { prop: 'check', mouth: 'smile' })] },
  { id: 'cone', kind: 'fun', text: 'Roadworks: upgrading the link, please wait', steps: [at(40, 'walk', 1300, { prop: 'cone', eyes: 'r' }), at(40, 'idle', 1600, { prop: 'cone', eyes: 'd', mouth: 'flat' }), at(40, 'hop', 600, { prop: 'check', mouth: 'smile' })] },
  { id: 'flag-plant', kind: 'fun', text: 'Planting a flag: new site is online', steps: [at(90, 'walk', 2400, { prop: 'flag', eyes: 'r' }), at(90, 'lean', 700, { prop: 'flag' }), at(90, 'wave', 1200, { prop: 'flag', mouth: 'open', led: 'g' })] },
];

export const SCENE_COUNT = SCENES.length;
