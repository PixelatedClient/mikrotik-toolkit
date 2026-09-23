import { describe, expect, it } from 'vitest';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { same } from '../tools/conformance/normalize.mjs';
import { runOnSim, type Lab, type Scenario } from '../tools/conformance/sim-entry';

// Replays scenarios whose output was CAPTURED from real CHR 7.16 routers (tools/conformance/run.mjs --save)
// on the simulator. No GNS3 needed: the real output lives in scenarios/<name>.real.json.
const dir = join(__dirname, '../tools/conformance');
const lab: Lab = JSON.parse(readFileSync(join(dir, 'lab.json'), 'utf8'));
const names = readdirSync(join(dir, 'scenarios'))
  .filter((f) => f.endsWith('.json') && !f.endsWith('.real.json') && !f.endsWith('.gaps.json'))
  .map((f) => f.slice(0, -5))
  .filter((n) => existsSync(join(dir, 'scenarios', n + '.real.json')));

describe('simulator agrees with captured real RouterOS 7.16 output', () => {
  it('has at least one captured scenario', () => expect(names.length).toBeGreaterThan(0));
  for (const name of names) {
    const sc: Scenario = JSON.parse(readFileSync(join(dir, 'scenarios', name + '.json'), 'utf8'));
    const real: { dev: string; cmd: string; out: string }[] = JSON.parse(readFileSync(join(dir, 'scenarios', name + '.real.json'), 'utf8'));
    const gapFile = join(dir, 'scenarios', name + '.gaps.json');
    const gaps: number[] = existsSync(gapFile) ? JSON.parse(readFileSync(gapFile, 'utf8')) : [];
    const sim = runOnSim(lab, sc);
    describe(name, () => {
      sim.forEach((s, i) => {
        if (sc.steps[i][2] === 'warm') return;
        // spacing is compared loosely: real print widths follow the whole table and the H flag (see CLAUDE.md)
        const ok = () => same(s.cmd, s.out, real[i].out);
        if (gaps.includes(i)) {
          // known gap: the simulator does not match real RouterOS yet. When it starts to, this fails so the list stays honest.
          it(`[${s.dev}] ${s.cmd} (known gap)`, () => expect(ok(), 'now matches: run run.mjs --mark-gaps').toBe(false));
        } else it(`[${s.dev}] ${s.cmd}`, () => expect(ok(), `sim:
${s.out}
real:
${real[i].out}`).toBe(true));
      });
    });
  }
});
