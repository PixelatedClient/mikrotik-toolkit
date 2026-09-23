# Network Academy

Free networking courses built around how ISPs actually run networks. Static site: Astro, React, Tailwind.

## Develop

```
npm install
npm run dev      # http://localhost:4321
npm test
npm run build
```

## Deploy

Deploy `dist/` to any static host. On Vercel, import the repo; `vercel.json` is included. Set the environment variable `SITE_URL` (e.g. `https://learn.example.com`) so canonical URLs, the sitemap and `robots.txt` are correct.

## Accounts (optional)

Login, saved progress and badges use [Supabase](https://supabase.com) (free tier is enough). The site works without it: every visitor is a guest and the login-only features stay locked with a "not switched on yet" message.

1. Create a Supabase project, then run `supabase/schema.sql` in the SQL editor (creates the `progress` table with row level security).
2. In Authentication > Providers keep Email enabled. In Authentication > URL configuration set the Site URL to your real domain (and add `http://localhost:4321` for development).
3. Copy `.env.example` to `.env` and fill in `PUBLIC_SUPABASE_URL` and `PUBLIC_SUPABASE_ANON_KEY` (Project settings > API). Set the same two variables in Vercel.
4. Rebuild. In `npm run dev` without those variables you get a demo mode where accounts live in the browser, useful for trying the flow.

Guests can use lessons, tools, labs, the reference, Subnet Valley, easy NOC incidents and the practice topics. Logging in unlocks Route Ridge, Firewall Fortress, medium and hard incidents, the daily challenge and badges, and saves progress. The rules live in `src/lib/features.ts`. This is a progress gate, not security: the content is static and public.

## Add a lesson

Create `src/content/courses/<track>/NN-slug.mdx` with the frontmatter fields shown in any existing lesson. See `CLAUDE.md` for details.

## Content quality

Lessons are marked `sourced` (facts checked against cited primary sources, with dates) or `draft`. See `CLAUDE.md` for the rules and `/roadmap` and `/sources` on the site.
