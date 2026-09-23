import { describe, expect, it } from 'vitest';
import { CLICK_LINES, DRAGON_SCENES, DUETS } from '../src/data/pktDragon';
import { SCENES } from '../src/data/pktScenes';
import { PROPS } from '../src/data/pktProps';

describe('the dragon and its duets with Pkt', () => {
  it('the dragon has many things to do', () => {
    expect(DRAGON_SCENES.length).toBeGreaterThanOrEqual(10);
    expect(new Set(DRAGON_SCENES.flatMap((s) => s.steps.map((st) => st.pose))).size).toBeGreaterThanOrEqual(8);
    expect(new Set(DRAGON_SCENES.map((s) => s.id)).size).toBe(DRAGON_SCENES.length);
  });

  it('Pkt meets the dragon in several duets where both talk', () => {
    expect(DUETS.length).toBeGreaterThanOrEqual(5);
    for (const d of DUETS) {
      expect(d.beats.some((b) => b.pkt?.say), d.id).toBe(true);
      expect(d.beats.some((b) => b.dragon?.say), d.id).toBe(true);
      for (const b of d.beats) {
        expect(b.ms, d.id).toBeGreaterThanOrEqual(2200);
        if (b.pkt?.prop) expect(PROPS[b.pkt.prop], `${d.id}: prop ${b.pkt.prop}`).toBeTruthy();
        if (b.pkt?.x !== undefined) {
          expect(b.pkt.x).toBeGreaterThanOrEqual(-230);
          expect(b.pkt.x).toBeLessThanOrEqual(170);
        }
      }
    }
  });

  it('speech is short enough for a small bubble', () => {
    const texts = [
      ...SCENES.map((s) => s.text),
      ...CLICK_LINES,
      ...DRAGON_SCENES.flatMap((s) => s.steps.map((t) => t.say ?? '')),
      ...DUETS.flatMap((d) => d.beats.flatMap((b) => [b.pkt?.say ?? '', b.dragon?.say ?? ''])),
    ];
    for (const t of texts) expect(t.length, t).toBeLessThanOrEqual(50);
  });
});
