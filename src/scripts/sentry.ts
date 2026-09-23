/**
 * Sentry error tracking and monitoring initialization.
 * Captures JavaScript errors, React component errors, performance metrics, and API errors.
 */

const DSN = import.meta.env.PUBLIC_SENTRY_DSN as string | undefined;
const ENV = import.meta.env.MODE;

/** Initialize Sentry with browser integration. Called from the layout. */
export async function initSentry() {
  if (!DSN) {
    console.debug('Sentry DSN not configured, error tracking disabled');
    return;
  }

  try {
    const Sentry = await import('@sentry/browser');
    const { browserTracingIntegration, replayIntegration } = await import('@sentry/browser');

    Sentry.init({
      dsn: DSN,
      environment: ENV,
      enabled: ENV === 'production' || ENV === 'preview',
      release: import.meta.env.PACKAGE_VERSION || '0.1.0',
      integrations: [
        replayIntegration({
          maskAllText: true,
          blockAllMedia: true,
        }),
        browserTracingIntegration(),
      ],
      // Performance monitoring (through browserTracingIntegration)
      tracesSampleRate: ENV === 'production' ? 0.1 : 1.0,
      replaysSessionSampleRate: 0.1,
      replaysOnErrorSampleRate: 1.0,
      // Attach stack traces to all messages
      attachStacktrace: true,
    });
  } catch (e) {
    console.error('Failed to initialize Sentry:', e);
  }
}

/** Set user context when a user logs in. Call from auth.ts after successful login. */
export function setSentryUser(userId: string, email?: string) {
  if (!DSN) return;

  try {
    const Sentry = require('@sentry/browser');
    Sentry.setUser({
      id: userId,
      email,
    });
  } catch (e) {
    console.error('Failed to set Sentry user context:', e);
  }
}

/** Clear user context when a user logs out. */
export function clearSentryUser() {
  if (!DSN) return;

  try {
    const Sentry = require('@sentry/browser');
    Sentry.setUser(null);
  } catch (e) {
    console.error('Failed to clear Sentry user context:', e);
  }
}

/** Capture an error explicitly. Used for API errors and async failures. */
export function captureError(error: Error | string, context?: Record<string, any>) {
  if (!DSN) return;

  try {
    const Sentry = require('@sentry/browser');
    if (typeof error === 'string') {
      Sentry.captureMessage(error, 'error');
    } else {
      Sentry.captureException(error);
    }
    if (context) {
      Sentry.setContext('error_context', context);
    }
  } catch (e) {
    console.error('Failed to capture error in Sentry:', e);
  }
}

/** Capture a message for debugging. */
export function captureMessage(message: string, level: 'info' | 'warning' | 'error' = 'info') {
  if (!DSN) return;

  try {
    const Sentry = require('@sentry/browser');
    Sentry.captureMessage(message, level);
  } catch (e) {
    console.error('Failed to capture message in Sentry:', e);
  }
}

/** Add a breadcrumb for debugging. Breadcrumbs show up in the error context. */
export function addBreadcrumb(message: string, category: string = 'user-action', level: 'info' | 'warning' | 'error' = 'info') {
  if (!DSN) return;

  try {
    const Sentry = require('@sentry/browser');
    Sentry.addBreadcrumb({
      message,
      category,
      level,
      timestamp: Date.now() / 1000,
    });
  } catch (e) {
    console.error('Failed to add breadcrumb to Sentry:', e);
  }
}

/** Wrap an async function to capture any errors it throws. */
export function wrapAsync<T extends (...args: any[]) => Promise<any>>(fn: T, name: string = fn.name): T {
  return (async (...args: any[]) => {
    try {
      return await fn(...args);
    } catch (error) {
      captureError(error as Error, { function: name });
      throw error;
    }
  }) as T;
}
