import { defineCollection } from 'astro:content';
import { glob } from 'astro/loaders';
import { z } from 'astro/zod';

const source = z.object({
  title: z.string(),
  url: z.string().url(),
  publisher: z.string(),
  /** ISO date (YYYY-MM-DD) the page was read and the facts checked. */
  accessed: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

const courses = defineCollection({
  loader: glob({ pattern: '**/*.{md,mdx}', base: './src/content/courses' }),
  schema: z.object({
    title: z.string(),
    track: z.enum(['foundations', 'layer2', 'mikrotik', 'mikrotik-ops', 'routing', 'isp-ops', 'design', 'config', 'security', 'automation', 'ipv6-wireless', 'cloud-dc', 'mpls']),
    module: z.string(),
    order: z.number(),
    duration: z.string(),
    summary: z.string(),
    /** `sourced`: facts checked against the cited primary sources. `draft`: not yet checked. */
    status: z.enum(['sourced', 'draft']).default('draft'),
    /** What the facts were checked against, e.g. "RouterOS v7 documentation". */
    verifiedAgainst: z.string().optional(),
    sources: z.array(source).default([]),
  }),
});

export const collections = { courses };
