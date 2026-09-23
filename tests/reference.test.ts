import { describe, it, expect } from 'vitest';
import { REFERENCE } from '../src/data/reference';
import { PORTS } from '../src/data/ports';
import { buildQuestion, checkBuild, explainQuestion, portQuestion } from '../src/lib/cmdquiz';
import { seeded } from '../src/lib/practice';
import { readFileSync, existsSync } from 'node:fs';

describe('command reference', () => {
  it('has unique ids and complete entries', () => {
    expect(new Set(REFERENCE.map((e) => e.id)).size).toBe(REFERENCE.length);
    expect(REFERENCE.length).toBeGreaterThanOrEqual(30);
    for (const e of REFERENCE) {
      expect(e.cmd.startsWith('/'), e.id).toBe(true);
      expect(e.what.length).toBeGreaterThan(20);
      expect(e.source.url).toMatch(/^https:\/\/help\.mikrotik\.com\/docs\//);
      expect(e.tokens.length).toBeGreaterThan(0);
      expect(e.cmd).not.toMatch(/[<>"]/);
    }
  });
  it('every property named in a command is a token that was found on its source page', () => {
    for (const e of REFERENCE) {
      const props = [...e.cmd.matchAll(/ ([a-z][a-z.-]*)=/g)].map((m) => m[1]);
      const missing = props.filter((p) => !e.tokens.includes(p));
      expect(missing, `${e.id} ${e.cmd}`).toEqual([]);
    }
  });
});

describe('ports', () => {
  it('matches the IANA registry when the CSV is available', () => {
    const f = '/tmp/ports.csv';
    if (!existsSync(f)) return;
    const lines = readFileSync(f, 'utf8').split('\n');
    for (const p of PORTS) expect(lines.some((l) => l.includes(`,${p.port},${p.proto},`)), `${p.proto}/${p.port}`).toBe(true);
  });
  it('no duplicates', () => expect(new Set(PORTS.map((p) => `${p.proto}/${p.port}`)).size).toBe(PORTS.length));
});

describe('command quizzes', () => {
  it('explain: the answer is among four distinct options', () => {
    const r = seeded(1);
    for (let i = 0; i < 300; i++) { const q = explainQuestion(r); expect(q.options).toContain(q.answer); expect(new Set(q.options).size).toBe(4); }
  });
  it('build: the tokens contain exactly the answer plus extras, and the answer checks out', () => {
    const r = seeded(2);
    for (let i = 0; i < 300; i++) {
      const q = buildQuestion(r);
      const pool = [...q.tokens];
      for (const t of q.answer) { const k = pool.indexOf(t); expect(k).toBeGreaterThanOrEqual(0); pool.splice(k, 1); }
      expect(checkBuild(q, q.answer)).toBe(true);
      expect(checkBuild(q, [...q.answer].reverse())).toBe(q.answer.length === 1);
    }
  });
  it('ports: the answer is among four distinct options', () => {
    const r = seeded(3);
    for (let i = 0; i < 200; i++) { const q = portQuestion(r); expect(q.options).toContain(q.answer); expect(new Set(q.options).size).toBe(4); }
  });
});
