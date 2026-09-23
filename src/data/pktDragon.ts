import type { Eyes, Mouth, Pose } from './pktScenes';

/**
 * The dragon that lives on the left mountain of the landing page, and the duets where Pkt and the dragon meet.
 * Speech is kept short: it appears in a small bubble and stays for the whole scene.
 */
export type DragonPose = 'sleep' | 'idle' | 'look' | 'yawn' | 'fire' | 'roar' | 'fly' | 'tail' | 'wave' | 'stretch' | 'proud';

export interface DragonStep {
  pose: DragonPose;
  /** Offset from the mountain perch in world pixels (the dragon flies when this is not 0,0). */
  dx?: number;
  dy?: number;
  say?: string;
  ms: number;
}

export interface DragonScene {
  id: string;
  steps: DragonStep[];
}

const d = (pose: DragonPose, ms: number, more: Partial<DragonStep> = {}): DragonStep => ({ pose, ms, ...more });

export const DRAGON_SCENES: DragonScene[] = [
  { id: 'nap', steps: [d('sleep', 7000, { say: 'zzz...' })] },
  { id: 'yawn', steps: [d('idle', 900), d('yawn', 2200, { say: 'Aaah... so sleepy' }), d('idle', 900)] },
  { id: 'look-around', steps: [d('look', 3400), d('tail', 2400)] },
  { id: 'fire-breath', steps: [d('idle', 700), d('fire', 2800, { say: 'Fire test 1, 2, 3' }), d('proud', 1600)] },
  { id: 'roar', steps: [d('roar', 2800, { say: 'ROAR! No packet drops here' }), d('idle', 900)] },
  { id: 'tail', steps: [d('tail', 4200, { say: 'Wiggle wiggle' })] },
  { id: 'flight', steps: [d('stretch', 1000), d('fly', 4200, { dx: 300, dy: 30, say: 'Patrolling the network!' }), d('fly', 4200, { dx: 520, dy: 90 }), d('fly', 4600, { dx: 0, dy: 0 }), d('idle', 900)] },
  { id: 'loop-de-loop', steps: [d('fly', 2400, { dx: 120, dy: -18, say: 'Wheee!' }), d('fly', 2400, { dx: 320, dy: 40 }), d('fly', 2800, { dx: 0, dy: 0 }), d('proud', 1000)] },
  { id: 'wave', steps: [d('wave', 3000, { say: 'Hello down there!' }), d('idle', 700)] },
  { id: 'burp-fire', steps: [d('yawn', 1400, { say: '*hic*' }), d('fire', 1400), d('idle', 1400, { say: 'Oops, sorry' })] },
  { id: 'guard', steps: [d('look', 2600, { say: 'All routes look fine up here' }), d('proud', 2400)] },
  { id: 'stretch', steps: [d('stretch', 2800, { say: 'Stretching my wings' }), d('idle', 800)] },
];

/** Both actors at once. Each beat lets Pkt and/or the dragon say something and move. */
export interface Beat {
  pkt?: { x?: number; pose?: Pose; eyes?: Eyes; mouth?: Mouth; prop?: string | null; say?: string };
  dragon?: { pose: DragonPose; dx?: number; dy?: number; say?: string };
  ms: number;
}

export interface Duet {
  id: string;
  beats: Beat[];
}

export const DUETS: Duet[] = [
  {
    id: 'hello-dragon',
    beats: [
      { pkt: { x: -150, pose: 'walk', eyes: 'u', mouth: 'smile' }, ms: 2800 },
      { pkt: { pose: 'wave', say: 'Hi, dragon!', mouth: 'open' }, dragon: { pose: 'look' }, ms: 3000 },
      { dragon: { pose: 'wave', say: 'Hello, little router!' }, pkt: { pose: 'hop', mouth: 'smile' }, ms: 3200 },
    ],
  },
  {
    id: 'fire-route',
    beats: [
      { pkt: { x: -120, pose: 'walk', eyes: 'u', prop: 'question' }, ms: 2600 },
      { pkt: { pose: 'idle', say: 'Is the castle route up?', prop: 'question' }, ms: 3000 },
      { dragon: { pose: 'fire', say: 'Let me light the way!' }, pkt: { pose: 'jump', prop: 'exclam', mouth: 'o' }, ms: 3200 },
      { pkt: { pose: 'dance', prop: 'check', say: 'Thanks!', mouth: 'open' }, dragon: { pose: 'proud' }, ms: 2800 },
    ],
  },
  {
    id: 'scared',
    beats: [
      { dragon: { pose: 'roar', say: 'ROAR!' }, pkt: { pose: 'squash', mouth: 'o', prop: 'exclam' }, ms: 2400 },
      { pkt: { pose: 'shake', say: 'Ahh! Packet loss!', mouth: 'sad' }, dragon: { pose: 'idle' }, ms: 3000 },
      { dragon: { pose: 'tail', say: 'Just kidding, friend' }, pkt: { pose: 'hop', mouth: 'smile', prop: 'heart' }, ms: 3200 },
    ],
  },
  {
    id: 'race',
    beats: [
      { pkt: { x: -160, pose: 'idle', say: 'Race you to the castle!', mouth: 'open' }, dragon: { pose: 'stretch' }, ms: 2800 },
      { pkt: { x: 150, pose: 'run', mouth: 'open' }, dragon: { pose: 'fly', dx: 560, dy: 60 }, ms: 3600 },
      { pkt: { pose: 'jump', say: 'I win!', mouth: 'open' }, dragon: { pose: 'fly', dx: 560, dy: 40, say: 'No! I was flying!' }, ms: 3000 },
      { dragon: { pose: 'fly', dx: 0, dy: 0 }, pkt: { x: 0, pose: 'walk' }, ms: 4400 },
    ],
  },
  {
    id: 'backup-dragon',
    beats: [
      { pkt: { x: -140, pose: 'walk', prop: 'disk', eyes: 'u' }, ms: 2600 },
      { pkt: { pose: 'idle', say: 'Guard my backup?', prop: 'disk' }, dragon: { pose: 'look' }, ms: 3000 },
      { dragon: { pose: 'proud', say: 'Nothing gets past me' }, pkt: { pose: 'wave', prop: 'shield', mouth: 'smile' }, ms: 3200 },
    ],
  },
  {
    id: 'ttl-joke',
    beats: [
      { dragon: { pose: 'yawn', say: 'How long do packets live?' }, pkt: { x: -140, pose: 'walk', eyes: 'u' }, ms: 3000 },
      { pkt: { pose: 'tilt', say: 'Until TTL hits zero!', mouth: 'open', prop: 'bulb' }, dragon: { pose: 'look' }, ms: 3200 },
      { dragon: { pose: 'roar', say: 'Then they meet me. ROAR!' }, pkt: { pose: 'shake', mouth: 'o' }, ms: 3000 },
    ],
  },
];

/** Things Pkt says when someone clicks on it. */
export const CLICK_LINES = ['Hey!', 'Ping!', 'Hello!', 'Packet delivered!', 'Need a hand?', 'Boop!', 'Route found!', 'Ready to learn?'];
