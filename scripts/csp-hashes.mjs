// Computes the sha256 hashes of every inline <script> in the built site, so vercel.json's CSP header can allow exactly
// those scripts (and none other). Astro's own runtime bootstrap scripts (astro:load, client:idle, client:visible) and
// the layout's dark-mode script are the only inline scripts on this site, and their text is identical on every page.
// Run after `astro build`: node scripts/csp-hashes.mjs [--write]
import { createHash } from 'node:crypto';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const DIST = 'dist';

function walk(dir) {
  const out = [];
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) out.push(...walk(p));
    else if (name.endsWith('.html')) out.push(p);
  }
  return out;
}

const hashes = new Set();
for (const file of walk(DIST)) {
  const html = readFileSync(file, 'utf8');
  for (const m of html.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g)) {
    const body = m[1];
    if (!body.trim()) continue;
    hashes.add(`sha256-${createHash('sha256').update(body, 'utf8').digest('base64')}`);
  }
}

const sorted = [...hashes].sort();
console.log(`${sorted.length} distinct inline script(s) across the build:`);
for (const h of sorted) console.log(' ', h);

if (process.argv.includes('--write')) {
  const path = 'vercel.json';
  const cfg = JSON.parse(readFileSync(path, 'utf8'));
  const rule = cfg.headers.find((h) => h.source === '/(.*)');
  const csp = rule.headers.find((h) => h.key === 'Content-Security-Policy');
  const scriptSrc = `'self' ${sorted.map((h) => `'${h}'`).join(' ')}`;
  // When accounts are configured (see .env.example), the browser talks to Supabase directly; allow that origin.
  const supabaseUrl = process.env.PUBLIC_SUPABASE_URL;
  const connectSrc = supabaseUrl ? `'self' ${supabaseUrl}` : "'self'";
  const value = [
    "default-src 'self'",
    `script-src ${scriptSrc}`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data:",
    "font-src 'self' data:", // @fontsource fonts are inlined as data: URIs by the Tailwind/Vite build
    `connect-src ${connectSrc}`,
    "frame-ancestors 'none'",
    "base-uri 'none'",
    "form-action 'self'",
  ].join('; ');
  if (csp) csp.value = value;
  else rule.headers.push({ key: 'Content-Security-Policy', value });
  const { writeFileSync } = await import('node:fs');
  writeFileSync(path, JSON.stringify(cfg, null, 2) + '\n');
  console.log(`\nWrote ${path}`);
}
