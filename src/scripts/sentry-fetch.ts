/**
 * Fetch wrapper that automatically captures errors with Sentry.
 * Wraps the global fetch function to log failures.
 */

import { captureError, addBreadcrumb } from './sentry';

const originalFetch = globalThis.fetch;

/**
 * Wrapped fetch that captures errors in Sentry.
 * Use this instead of the global fetch to get automatic error tracking.
 */
export async function fetchWithSentry(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const url = input instanceof Request ? input.url : String(input);
  const method = init?.method || 'GET';

  addBreadcrumb(`${method} ${url}`, 'http');

  try {
    const response = await originalFetch(input, init);

    if (!response.ok) {
      // Log failed HTTP responses as errors
      const errorBody = await response.text();
      captureError(`HTTP ${response.status} ${response.statusText} on ${method} ${url}`, {
        url,
        method,
        status: response.status,
        statusText: response.statusText,
        body: errorBody.substring(0, 500), // Limit error body size
      });
    }

    return response;
  } catch (error) {
    captureError(error as Error, {
      url,
      method,
      type: 'fetch_error',
    });
    throw error;
  }
}

/**
 * Install the fetch wrapper as the global fetch.
 * Called from the layout to ensure all fetch calls are monitored.
 */
export function installFetchWrapper() {
  if (typeof globalThis !== 'undefined') {
    globalThis.fetch = fetchWithSentry as any;
  }
}
