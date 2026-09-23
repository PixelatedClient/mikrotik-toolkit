import { defineConfig } from 'astro/config';
import react from '@astrojs/react';
import mdx from '@astrojs/mdx';
import sitemap from '@astrojs/sitemap';
import tailwindcss from '@tailwindcss/vite';

// Set SITE_URL in the deploy environment to your real domain.
const site = process.env.SITE_URL ?? 'https://networkacademy.example';

export default defineConfig({
  site,
  // The floating Astro dev toolbar only exists in `npm run dev`; it is switched off so it never covers the page.
  devToolbar: { enabled: false },
  integrations: [react(), mdx(), sitemap()],
  vite: { plugins: [tailwindcss()] },
  markdown: {
    shikiConfig: {
      themes: { light: 'github-light', dark: 'github-dark' },
    },
  },
});
