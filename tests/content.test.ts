import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync, existsSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { parse as parseYaml } from 'yaml';
import { LABS } from '../src/data/labs';
import { TRACKS as TRACK_DATA } from '../src/data/tracks';

const ROOT = join(__dirname, '..');
const COURSES = join(ROOT, 'src/content/courses');
const TRACKS = TRACK_DATA.map((t) => t.id);

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    return statSync(p).isDirectory() ? walk(p) : [p];
  });
}

const lessons = walk(COURSES)
  .filter((f) => f.endsWith('.mdx'))
  .map((f) => {
    const raw = readFileSync(f, 'utf8').replace(/\r\n/g, '\n');
    const fm = raw.match(/^---\n([\s\S]*?)\n---\n/);
    const data = (fm ? parseYaml(fm[1]) : {}) as Record<string, any>;
    const id = relative(COURSES, f).replace(/\\/g, '/').replace(/\.mdx$/, '');
    return { id, data, body: raw.replace(/^---[\s\S]*?---\n/, '') };
  });

describe('lesson frontmatter', () => {
  it('finds lessons in every track', () => {
    for (const t of TRACKS) expect(lessons.some((l) => l.data.track === t)).toBe(true);
  });
  for (const l of lessons) {
    it(`${l.id}: has all fields and matches its folder`, () => {
      for (const k of ['title', 'track', 'module', 'order', 'duration', 'summary']) expect(l.data[k], k).toBeTruthy();
      expect(['sourced', 'draft', undefined]).toContain(l.data.status);
      expect(l.id.startsWith(l.data.track + '/')).toBe(true);
      expect(TRACKS).toContain(l.data.track);
    });
  }
  it('orders and module numbers are consecutive per track', () => {
    for (const t of TRACKS) {
      const ls = lessons.filter((l) => l.data.track === t).sort((a, b) => Number(a.data.order) - Number(b.data.order));
      ls.forEach((l, i) => {
        expect(Number(l.data.order), `${l.id} order`).toBe(i + 1);
        expect(l.data.module, `${l.id} module`).toBe(`${TRACKS.indexOf(t) + 1}.${i + 1}`);
      });
    }
  });
});

describe('internal links', () => {
  const ids = new Set(lessons.map((l) => l.id));
  const routes = new Set(['/', '/learn', '/tools', '/labs', '/tools/subnet-calculator', '/tools/mikrotik-config-generator', '/tools/bgp-lab', '/tools/subnet-trainer', '/tools/vlan-designer', '/tools/stp-lab', '/community']);
  const links = lessons.flatMap((l) => [...l.body.matchAll(/\]\((\/[^)\s]*)\)/g)].map((m) => ({ from: l.id, href: m[1] })));

  it('has links to check', () => expect(links.length).toBeGreaterThan(10));
  for (const { from, href } of links) {
    it(`${from} -> ${href}`, () => {
      const path = href.split('#')[0];
      if (path.startsWith('/learn/')) expect(ids.has(path.slice('/learn/'.length)), `missing lesson ${path}`).toBe(true);
      else if (path.startsWith('/labs/')) expect(LABS.some((l) => path === `/labs/${l.id}`), `missing lab ${path}`).toBe(true);
      else expect(routes.has(path), `unknown route ${path}`).toBe(true);
    });
  }
});

describe('lab downloads', () => {
  it('every rsc file referenced by the labs page exists', () => {
    for (const r of ['R1', 'R2', 'R3']) expect(existsSync(join(ROOT, 'public/labs/three-router', `${r}.rsc`))).toBe(true);
  });
  it('lab addressing matches the lesson', () => {
    const lesson = readFileSync(join(COURSES, 'foundations/03-your-first-router.mdx'), 'utf8');
    for (const s of ['10.0.12.0/30', '10.0.23.0/30', '192.168.1.0/24', '192.168.3.0/24']) expect(lesson).toContain(s);
  });
});

const COMPONENTS = ['SubnetCalculator', 'SubnetTrainer', 'PacketJourney', 'BgpLab', 'BgpSession', 'Challenge', 'StpLab', 'AffiliateLinks', 'VideoLesson'];

describe('MDX safety', () => {
  for (const l of lessons) {
    it(`${l.id}: code fences are balanced`, () => {
      expect((l.body.match(/^```/gm) ?? []).length % 2).toBe(0);
    });
    it(`${l.id}: no stray JSX-looking tags outside code`, () => {
      const prose = l.body.replace(/```[\s\S]*?```/g, '').replace(/`[^`]*`/g, '');
      for (const m of prose.matchAll(/<([A-Za-z][^>\s]*)/g)) expect(COMPONENTS, `unexpected tag <${m[1]}>`).toContain(m[1]);
    });
  }
});

describe('accessible tables', () => {
  for (const l of lessons) {
    it(`${l.id}: no table has an empty header cell`, () => {
      const prose = l.body.replace(/```[\s\S]*?```/g, '');
      // a markdown table header row is the line just before a |---| separator row
      const lines = prose.split('\n');
      lines.forEach((line, i) => {
        if (/^\|[\s|:-]+\|$/.test(line.trim()) && i > 0 && /^\|/.test(lines[i - 1])) {
          const cells = lines[i - 1].trim().replace(/^\||\|$/g, '').split('|');
          for (const c of cells) expect(c.trim(), `empty header cell in: ${lines[i - 1]}`).not.toBe('');
        }
      });
    });
  }
});

describe('sourced lessons', () => {
  const sourced = lessons.filter((l) => l.data.status === 'sourced');
  it('exist (the new tracks are built from primary sources)', () => expect(sourced.length).toBeGreaterThanOrEqual(7));

  for (const l of sourced) {
    it(`${l.id}: cites at least two valid, dated sources`, () => {
      const src = l.data.sources as { title: string; url: string; publisher: string; accessed: string }[];
      expect(Array.isArray(src)).toBe(true);
      expect(src.length).toBeGreaterThanOrEqual(2);
      const urls = new Set<string>();
      for (const s of src) {
        expect(s.title, 'title').toBeTruthy();
        expect(s.publisher, 'publisher').toBeTruthy();
        expect(s.url, `${s.title} url`).toMatch(/^https:\/\/[^\s]+$/);
        expect(s.accessed, `${s.title} date`).toMatch(/^\d{4}-\d{2}-\d{2}$/);
        expect(Number.isNaN(Date.parse(s.accessed)), `${s.accessed} is a real date`).toBe(false);
        expect(Date.parse(s.accessed)).toBeLessThanOrEqual(Date.now() + 86400000);
        expect(urls.has(s.url), `duplicate source ${s.url}`).toBe(false);
        urls.add(s.url);
      }
      expect(l.data.verifiedAgainst, 'verifiedAgainst').toBeTruthy();
    });
    it(`${l.id}: has a self-check and no copied-looking long quotes`, () => {
      expect(l.body).toMatch(/## Check yourself/);
      // long block quotes are a sign of copied text; we paraphrase
      expect(l.body).not.toMatch(/^> .{200,}/m);
    });
  }

  it('third-party course providers are never embedded', () => {
    for (const l of lessons) {
      expect(l.body, l.id).not.toMatch(/<iframe|<video|youtube\.com\/embed|player\.vimeo/i);
    }
  });
});
