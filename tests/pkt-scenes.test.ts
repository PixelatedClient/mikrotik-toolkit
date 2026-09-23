import { describe, expect, it } from 'vitest';
import { SCENES } from '../src/data/pktScenes';
import { PROPS, PALETTE, toRects } from '../src/data/pktProps';

describe("Pkt's landing page scenes", () => {
  it('has at least 30 different stories across travel, search, routing and config', () => {
    expect(SCENES.length).toBeGreaterThanOrEqual(30);
    expect(new Set(SCENES.map((s) => s.id)).size).toBe(SCENES.length);
    expect(new Set(SCENES.map((s) => s.text)).size).toBe(SCENES.length);
    for (const kind of ['travel', 'search', 'route', 'config']) expect(SCENES.filter((s) => s.kind === kind).length, kind).toBeGreaterThanOrEqual(5);
  });

  it('every prop a scene uses is drawn, and stays on the screen', () => {
    for (const s of SCENES) {
      expect(s.steps.length, s.id).toBeGreaterThan(0);
      for (const st of s.steps) {
        if (st.prop) expect(PROPS[st.prop], `${s.id}: prop ${st.prop}`).toBeTruthy();
        if (st.x !== undefined) {
          expect(st.x, s.id).toBeGreaterThanOrEqual(-230);
          expect(st.x, s.id).toBeLessThanOrEqual(170);
        }
        expect(st.ms, s.id).toBeGreaterThan(0);
      }
    }
  });

  it('prop drawings only use colours from the palette and fit next to Pkt', () => {
    for (const [name, p] of Object.entries(PROPS)) {
      for (const row of p.rows) for (const ch of row) if (ch !== '.') expect(PALETTE[ch], `${name}: '${ch}'`).toBeTruthy();
      const rects = toRects(p);
      expect(rects.length, name).toBeGreaterThan(0);
      for (const r of rects) {
        expect(29 + r.x, name).toBeGreaterThanOrEqual(0);
        expect(29 + r.x + r.w, name).toBeLessThanOrEqual(96);
      }
    }
  });
});
