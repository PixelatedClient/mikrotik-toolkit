import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { KITS } from '../src/data/lessonKit';
import { findLab } from '../src/data/allLabs';
import { simLabFor } from '../src/data/simLabs';
import { INCIDENTS } from '../src/data/game/nocIncidents';

const root = join(__dirname, '../src/content/courses');
const lessons = readdirSync(root).flatMap((t) => readdirSync(join(root, t)).map((f) => `${t}/${f.replace(/\.mdx?$/, '')}`));

describe('lesson kits (lab, quiz, troubleshooting attached to lessons)', () => {
  it('every kit points at a real lesson, once', () => {
    const ids = KITS.map((k) => k.lesson);
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ids) expect(lessons, id).toContain(id);
  });

  it('labs and incidents exist, and every browser lab really runs', () => {
    for (const k of KITS) {
      for (const l of k.labs ?? []) {
        expect(findLab(l), `${k.lesson}: lab ${l}`).toBeTruthy();
        expect(simLabFor(l), `${k.lesson}: ${l} has no browser lab`).toBeTruthy();
      }
      for (const l of k.gns3Labs ?? []) expect(findLab(l), `${k.lesson}: gns3 lab ${l}`).toBeTruthy();
      for (const i of k.incidents ?? []) expect(INCIDENTS.some((x) => x.id === i), `${k.lesson}: incident ${i}`).toBe(true);
    }
  });

  it('an incident belongs to one lesson only', () => {
    const seen = new Map<string, string>();
    for (const k of KITS) for (const i of k.incidents ?? []) {
      expect(seen.get(i), `${i} is in ${seen.get(i)} and ${k.lesson}`).toBeUndefined();
      seen.set(i, k.lesson);
    }
  });

  it('quiz questions are well formed', () => {
    for (const k of KITS) for (const q of k.quiz ?? []) {
      expect(q.options.length, q.q).toBeGreaterThanOrEqual(3);
      expect(new Set(q.options).size, `${q.q}: duplicate options`).toBe(q.options.length);
      expect(q.answer, q.q).toBeGreaterThanOrEqual(0);
      expect(q.answer, q.q).toBeLessThan(q.options.length);
      expect(q.explain.length, q.q).toBeGreaterThan(20);
    }
  });

  it('every lesson has a kit with a quiz, and every incident has a home', () => {
    for (const l of lessons) {
      const k = KITS.find((x) => x.lesson === l);
      expect(k, `${l} has no kit`).toBeTruthy();
      expect(k!.quiz?.length ?? 0, `${l} has no quiz`).toBeGreaterThanOrEqual(3);
    }
    for (const i of INCIDENTS) expect(KITS.some((k) => k.incidents?.includes(i.id)), `${i.id} is not in any lesson`).toBe(true);
  });

  it('the browser labs of a lesson get bigger: no lab repeats inside one lesson', () => {
    for (const k of KITS) expect(new Set(k.labs ?? []).size, k.lesson).toBe((k.labs ?? []).length);
  });

  it('lesson text has no heading that would clash with the Lab, Quiz and Troubleshooting sections', () => {
    for (const l of lessons) {
      const text = readFileSync(join(root, l + '.mdx'), 'utf8');
      for (const m of text.matchAll(/^#{2,3}\s+(.+)$/gm)) expect(['lab', 'quiz', 'troubleshooting'], `${l}: heading "${m[1]}"`).not.toContain(m[1].trim().toLowerCase());
    }
  });
});
