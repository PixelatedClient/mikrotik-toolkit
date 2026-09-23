import { defineConfig } from 'astro/config';
import react from '@astrojs/react';
import mdx from '@astrojs/mdx';
import sitemap from '@astrojs/sitemap';
import tailwindcss from '@tailwindcss/vite';
import sentry from '@sentry/astro';

// Set SITE_URL in the deploy environment to your real domain.
const site = process.env.SITE_URL ?? 'https://networkacademy.example';

export default defineConfig({
  site,
  // The floating Astro dev toolbar only exists in `npm run dev`; it is switched off so it never covers the page.
  devToolbar: { enabled: false },
  integrations: [sentry(), react(), mdx(), sitemap()],
  vite: {
    plugins: [tailwindcss()],
    build: {
      // Enable code splitting for better caching and parallel loading
      rollupOptions: {
        output: {
          // Use function form for Rolldown compatibility
          manualChunks: (id) => {
            if (id.includes('AuthBar')) return 'auth-ui';
            if (id.includes('game/ui')) return 'game-ui';
          },
        },
      },
      // Warn if chunks exceed 200KB (to catch bloat)
      chunkSizeWarningLimit: 200,
      // Target modern browsers for smaller output
      target: 'es2020',
    },
  },
  markdown: {
    shikiConfig: {
      themes: { light: 'github-light', dark: 'github-dark' },
    },
  },
});
