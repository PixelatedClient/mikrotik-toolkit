# Sentry Error Tracking Setup

This guide explains how to set up Sentry error tracking and monitoring for the Network Academy project.

## What is Sentry?

Sentry is an error tracking platform that automatically captures and reports errors from your web application. It helps you:
- Track JavaScript errors and exceptions
- Monitor performance with Core Web Vitals (LCP, CLS, FID)
- Capture unhandled promise rejections
- Track API/fetch errors
- See breadcrumbs of user actions before an error
- Monitor errors by user (if logged in)

## Quick Start

### 1. Create a Sentry Project

1. Go to [sentry.io](https://sentry.io) and sign up (or log in)
2. Create a new project:
   - Select "JavaScript" as the platform
   - Select "Astro" as the framework
3. Copy your DSN (Data Source Name) - it looks like: `https://key@sentry.io/project-id`

### 2. Add Environment Variable

Add your Sentry DSN to your `.env` file:

```
PUBLIC_SENTRY_DSN=https://YOUR-KEY@sentry.io/YOUR-PROJECT-ID
```

The `PUBLIC_` prefix means it's safe to expose in the browser (Sentry DSNs are meant to be public).

### 3. Test the Setup

1. Start the dev server: `npm run dev`
2. Go to `http://localhost:3000/test-sentry` (test page created for verification)
3. Click the buttons to trigger various error types
4. Check your Sentry dashboard - you should see errors appearing in real-time

## What Gets Tracked

### Automatic Capture

- **JavaScript Errors**: Any unhandled `throw` or syntax error
- **Promise Rejections**: Unhandled `await` failures
- **React Component Errors**: Caught by the ErrorBoundary component
- **Fetch/API Errors**: HTTP errors from failed requests
- **Performance Metrics**: Core Web Vitals (LCP, CLS, FID, TTFB)

### Manual Capture

Use these functions in your code to capture errors/messages:

```typescript
import { captureError, captureMessage, addBreadcrumb } from '../scripts/sentry';

// Capture an error
try {
  riskyOperation();
} catch (error) {
  captureError(error, { context: 'operation-name' });
}

// Capture a debug message
captureMessage('User started quiz', 'info');

// Add a breadcrumb (shows up in error context)
addBreadcrumb('User clicked button X', 'user-action');
```

### User Context

When a user logs in, Sentry automatically tracks their ID and email. This helps you:
- Find all errors for a specific user
- See which users are affected by a bug
- Contact users about issues

## Features

### Error Boundary

The `ErrorBoundary.tsx` component catches React component errors and prevents them from crashing the page:

```tsx
import ErrorBoundary from './ErrorBoundary';

export default function MyPage() {
  return (
    <ErrorBoundary>
      <MyComponent />
    </ErrorBoundary>
  );
}
```

### Fetch Wrapper

All `fetch` calls are automatically wrapped to capture HTTP errors. No code changes needed - just use `fetch()` normally.

### Breadcrumbs

Breadcrumbs show the sequence of events leading up to an error:
- Navigation (when users click links)
- API calls (all fetch requests)
- User actions (if you add them)

## Configuration

The Sentry integration is configured in:

- **src/scripts/sentry.ts** - Initialization and helper functions
- **src/scripts/sentry-fetch.ts** - Fetch wrapper for API error tracking
- **src/components/ErrorBoundary.tsx** - React error boundary
- **src/layouts/Base.astro** - Loads Sentry on all pages
- **astro.config.mjs** - Astro integration for server-side errors

### Environment-Specific Behavior

- **Production** (`mode === 'production'`): Full error tracking enabled
- **Preview** (`mode === 'preview'`): Full error tracking enabled
- **Development** (`mode === 'development'`): Full error tracking enabled with 100% trace sample rate (vs 10% in production)

### Sampling

By default:
- **Errors**: 100% are captured
- **Performance Traces**: 10% in production, 100% in development (configurable)
- **Session Replays**: 10% always, 100% on error

Adjust these in `src/scripts/sentry.ts`:

```typescript
tracesSampleRate: 0.1,        // 10% of transactions
replaysSessionSampleRate: 0.1, // 10% of sessions
replaysOnErrorSampleRate: 1.0, // 100% when error occurs
```

## Advanced Setup (Optional)

### Source Map Upload

To see original source code in Sentry (instead of minified), upload source maps to Sentry:

1. Create an auth token in Sentry (Settings > Auth Tokens)
2. Add to your build environment:
   ```
   SENTRY_AUTH_TOKEN=your-token-here
   SENTRY_ORG=your-org-name
   SENTRY_PROJECT=your-project-name
   ```

3. Configure in `astro.config.mjs`:
   ```javascript
   sentry({
     authToken: process.env.SENTRY_AUTH_TOKEN,
     org: process.env.SENTRY_ORG,
     project: process.env.SENTRY_PROJECT,
   })
   ```

### Release Tracking

Track which version of your code is running:

```typescript
// In src/scripts/sentry.ts
release: '1.0.0', // Or use: process.env.npm_package_version
```

## Disabling Sentry

To disable error tracking:
- Leave `PUBLIC_SENTRY_DSN` empty or unset
- Sentry will gracefully disable with no impact on performance

## Testing

### Test Page

Visit `http://localhost:3000/test-sentry` (in development only) to test error tracking:
- **Throw JavaScript Error** - Sync error
- **Throw Async Error** - Promise rejection
- **Trigger Fetch Error** - HTTP error (404)
- **Send Debug Message** - Manual message capture

### Manual Testing

```typescript
// In browser console
import { captureError } from '/src/scripts/sentry.ts';
captureError(new Error('Test error'));
```

### Production Testing

Once deployed, test in production by:
1. Opening your site
2. Opening browser console
3. Running: `window.__SENTRY_DSN__ && console.log('Sentry loaded')`

## Troubleshooting

### "No errors showing in Sentry"

1. Check that `PUBLIC_SENTRY_DSN` is set in your environment
2. Verify DSN is copied correctly (starts with `https://`)
3. In browser dev tools, check Network tab - look for `api.sentry.io` requests
4. Check browser console for any Sentry init errors

### "Getting 'Sentry init failed' error"

This usually means the DSN is invalid or missing. Verify:
- DSN is set in `.env`
- DSN is accessible (not blocked by ad blocker)
- Sentry project hasn't been deleted

### "Errors not uploading in production"

1. Make sure `PUBLIC_SENTRY_DSN` is set during the build
2. Check that the DSN is correct (not a development DSN)
3. Verify firewall/CSP isn't blocking `api.sentry.io`

## Performance Impact

Sentry is designed to have minimal performance impact:
- Initialization is non-blocking (happens after page loads)
- Error capture is asynchronous (doesn't block user actions)
- Sample rates prevent excessive data transmission
- Disabled when DSN is not configured

## Privacy & Data

Sentry captures:
- Error messages and stack traces
- Browser type and OS
- Page URL and referrer
- User ID and email (if logged in)
- Custom breadcrumbs and context

Sentry does NOT capture:
- Passwords or credentials (filtered)
- Full page content (unless in breadcrumbs)
- Network request bodies (by default, can be configured)

You can customize what data Sentry sees:

```typescript
// In src/scripts/sentry.ts
beforeSend(event) {
  // Filter or modify events before sending
  return event;
}
```

## Resources

- [Sentry Documentation](https://docs.sentry.io/)
- [Sentry for Astro](https://docs.sentry.io/platforms/javascript/guides/astro/)
- [Sentry for React](https://docs.sentry.io/platforms/javascript/guides/react/)
- [Performance Monitoring](https://docs.sentry.io/product/performance/)

## Support

For issues with Sentry setup:
1. Check [Sentry docs](https://docs.sentry.io/)
2. Review logs in Sentry dashboard
3. Check browser console for errors
4. Visit [Sentry Community](https://discord.gg/Wjxnqf8)
