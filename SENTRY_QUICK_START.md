# Sentry Quick Start Guide

## 1. Get Your DSN

1. Create a Sentry account at [sentry.io](https://sentry.io)
2. Create a new project (select "Astro" framework)
3. Copy your DSN

## 2. Add to Environment

Add to `.env`:
```
PUBLIC_SENTRY_DSN=https://your-key@sentry.io/your-project-id
```

## 3. Restart Dev Server

```bash
npm run dev
```

## 4. Test It Works

Visit: `http://localhost:3000/test-sentry`

Click buttons to trigger errors and watch them appear in your Sentry dashboard.

## 5. In Your Code

Use these functions to track errors:

```typescript
import { captureError, captureMessage, addBreadcrumb } from '../scripts/sentry';

// Track an error
captureError(error, { context: 'what-failed' });

// Track a message
captureMessage('User completed quiz', 'info');

// Add debug info
addBreadcrumb('User clicked button', 'user-action');

// Wrap async functions
const wrappedFn = wrapAsync(myAsyncFn, 'function-name');
```

## Files Added/Modified

### Created:
- `src/scripts/sentry.ts` - Main Sentry initialization
- `src/scripts/sentry-fetch.ts` - Fetch error wrapper
- `src/components/ErrorBoundary.tsx` - React error boundary
- `src/pages/test-sentry.astro` - Test page
- `SENTRY_SETUP.md` - Full documentation
- `SENTRY_QUICK_START.md` - This file

### Modified:
- `package.json` - Added @sentry/astro and @sentry/react
- `.env.example` - Added PUBLIC_SENTRY_DSN
- `astro.config.mjs` - Added Sentry integration
- `src/layouts/Base.astro` - Load Sentry on all pages
- `src/scripts/auth.ts` - Send user context to Sentry

## What Gets Tracked Automatically

✓ JavaScript errors and exceptions  
✓ Unhandled promise rejections  
✓ React component errors (via ErrorBoundary)  
✓ HTTP/Fetch errors  
✓ Performance metrics (Core Web Vitals)  
✓ User context (ID & email when logged in)  
✓ Navigation tracking  
✓ Action breadcrumbs  

## Disable Anytime

Sentry is optional - leave `PUBLIC_SENTRY_DSN` empty to disable.

## Learn More

See `SENTRY_SETUP.md` for complete documentation.
