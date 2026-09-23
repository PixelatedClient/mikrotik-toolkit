// Re-checks src/data/reference.ts against MikroTik's live documentation.
// Usage: node scripts/verify-reference.mjs   (needs network)
import { readFileSync } from 'node:fs';

const src = readFileSync(new URL('../src/data/reference.ts', import.meta.url), 'utf8');
const entries = [...src.matchAll(/id: "(cmd-\d+)".*?url: "([^"]+)" \}, tokens: (\[[^\]]*\])/g)].map((m) => ({ id: m[1], url: m[2], tokens: JSON.parse(m[3]) }));
const cache = new Map();
let bad = 0;
for (const e of entries) {
  const pid = e.url.match(/pages\/(\d+)\//)[1];
  if (!cache.has(pid)) {
    const res = await fetch(`https://help.mikrotik.com/docs/exportword?pageId=${pid}`);
    const raw = (await res.text()).replace(/=\r?\n/g, '').replace(/=3D/g, '=');
    cache.set(pid, raw.replace(/<[^>]+>/g, ' '));
  }
  const text = cache.get(pid);
  const missing = e.tokens.filter((t) => !text.includes(t));
  if (missing.length) { bad++; console.log(`${e.id}: missing ${missing.join(', ')} on ${e.url}`); }
}
console.log(`${entries.length} entries checked, ${bad} with missing tokens`);
process.exit(bad ? 1 : 0);
