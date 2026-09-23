// Conformance harness: LOCAL developer tool, never shipped with the site.
// Runs each scenario on the simulator and on the real CHR routers (GNS3), diffs the outputs.
//
//   node tools/conformance/run.mjs [scenario-name ...] [--sim-only] [--save]
//
// --sim-only  skip the routers (shows what the simulator prints)
// --save      write the real output to scenarios/<name>.real.json so the next step can turn
//             it into a permanent offline test (tests must never depend on GNS3)
import { spawnSync } from 'node:child_process';
import { readdirSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { build } from 'esbuild';
import { mask, squeeze, same } from './normalize.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const simOnly = args.includes('--sim-only');
const save = args.includes('--save');
const markGaps = args.includes('--mark-gaps');
const only = args.filter((a) => !a.startsWith('--'));

const lab = JSON.parse(readFileSync(join(here, 'lab.json'), 'utf8'));
const scDir = join(here, 'scenarios');
const names = readdirSync(scDir).filter((f) => f.endsWith('.json') && !f.endsWith('.real.json') && !f.endsWith('.gaps.json')).map((f) => f.slice(0, -5));

mkdirSync(join(here, '.build'), { recursive: true });
const bundle = join(here, '.build', 'sim.mjs');
await build({ entryPoints: [join(here, 'sim-entry.ts')], bundle: true, platform: 'node', format: 'esm', outfile: bundle, logLevel: 'error' });
const { runOnSim } = await import(pathToFileURL(bundle).href);

let bad = 0;
for (const name of names) {
  if (only.length && !only.includes(name)) continue;
  const scPath = join(scDir, name + '.json');
  const sc = JSON.parse(readFileSync(scPath, 'utf8'));
  const sim = runOnSim(lab, sc).map((r, i) => ({ ...r, warm: sc.steps[i][2] === 'warm' }));
  let real = null;
  if (!simOnly) {
    const r = spawnSync('python', [join(here, 'real.py'), join(here, 'lab.json'), scPath], { encoding: 'utf8', env: { ...process.env, MSYS_NO_PATHCONV: '1', PYTHONIOENCODING: 'utf-8' }, maxBuffer: 64e6 });
    if (r.status !== 0) { console.error(`${name}: real side failed\n${r.stderr}`); bad++; continue; }
    real = JSON.parse(r.stdout);
    if (save) writeFileSync(join(scDir, name + '.real.json'), JSON.stringify(real, null, 2));
  }
  let identical = 0, spacing = 0, diff = 0;
  const gaps = [];
  const report = [];
  sim.forEach((s, i) => {
    if (s.warm) return;
    if (!real) { report.push(`[${s.dev}] ${s.cmd}\n${s.out}\n`); return; }
    const a = mask(s.out), b = mask(real[i].out);
    if (a === b) identical++;
    else if (same(s.cmd, s.out, real[i].out)) { spacing++; report.push(`~ SPACING [${s.dev}] ${s.cmd}\n--- sim\n${a}\n--- real\n${b}\n`); }
    else { diff++; gaps.push(i); report.push(`x DIFF [${s.dev}] ${s.cmd}\n--- sim\n${a}\n--- real\n${b}\n`); }
  });
  console.log(`\n=== ${name}: ${sim.filter((x) => !x.warm).length} steps` + (real ? `, ${identical} identical, ${spacing} spacing-only, ${diff} different` : ' (sim only)'));
  if (report.length) console.log(report.join('\n'));
  if (markGaps) writeFileSync(join(scDir, name + '.gaps.json'), JSON.stringify(gaps));
  if (diff && !markGaps) bad++;
}
process.exit(bad ? 1 : 0);
