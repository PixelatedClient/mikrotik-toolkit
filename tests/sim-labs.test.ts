import { describe, expect, it } from 'vitest';
import { findLab } from '../src/data/allLabs';
import { SIM_LABS } from '../src/data/simLabs';
import { applySolution, build, evaluate, execute, simulatable, taskDone } from '../src/lib/sim/lab';

describe('browser labs', () => {
  it('every browser lab exists and can be simulated', () => {
    for (const s of SIM_LABS) {
      const lab = findLab(s.labId);
      expect(lab, s.labId).toBeTruthy();
      expect(simulatable(lab!), `${s.labId} uses only routers and PCs`).toBe(true);
    }
  });

  for (const spec of SIM_LABS) {
    describe(spec.labId, () => {
      it('has unique task ids, hints, and a solution for every task', () => {
        expect(new Set(spec.tasks.map((t) => t.id)).size).toBe(spec.tasks.length);
        for (const t of spec.tasks) {
          expect(t.hints.length, t.id).toBeGreaterThan(0);
          expect(t.checks.length, t.id).toBeGreaterThan(0);
          expect(t.solution.length, t.id).toBeGreaterThan(0);
        }
      });

      it('the starting state completes no task', () => {
        const b = build(spec);
        for (const t of spec.tasks) expect(taskDone(b, t), `${t.id} is already done at the start`).toBe(false);
      });

      it('each task is open until its own solution is applied, and done afterwards (in order)', () => {
        const b = build(spec);
        for (const t of spec.tasks) {
          expect(taskDone(b, t), `${t.id} should not be done before its solution`).toBe(false);
          applySolution(b, t);
          const failing = t.checks.filter((c) => !evaluate(b, c));
          expect(failing, `${t.id} solution leaves failing checks`).toEqual([]);
        }
      });

      it('the solution never produces a CLI error (fetch failures are the point of some tasks)', () => {
        const b = build(spec);
        const errors: string[] = [];
        for (const t of spec.tasks) {
          for (const s of t.solution) {
            for (const c of s.commands) {
              const out = execute(b, s.device, c);
              if (/^\s*\/?tool fetch/.test(c)) continue;
              if (/^(bad command|syntax error|invalid value|input does not|expected end|no such item|failure:|Script Error|missing value|\*\*\* command not found)/m.test(out)) errors.push(`${s.device}: ${c} -> ${out}`);
            }
          }
        }
        expect(errors).toEqual([]);
      });
    });
  }
});
