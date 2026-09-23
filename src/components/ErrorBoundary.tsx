import React, { type ReactNode, type ErrorInfo } from 'react';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
  onError?: (error: Error, errorInfo: ErrorInfo) => void;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

/**
 * Error boundary to catch React component errors.
 * Logs errors to Sentry and displays a fallback UI.
 */
export default class ErrorBoundary extends React.Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    // Log to Sentry
    try {
      const Sentry = require('@sentry/react');
      Sentry.captureException(error, {
        contexts: {
          react: {
            componentStack: errorInfo.componentStack,
          },
        },
      });
    } catch (e) {
      console.error('Failed to report error to Sentry:', e);
    }

    // Call onError callback if provided
    this.props.onError?.(error, errorInfo);

    // Log to console in development
    if (import.meta.env.DEV) {
      console.error('Error caught by boundary:', error, errorInfo);
    }
  }

  render() {
    if (this.state.hasError) {
      return (
        this.props.fallback || (
          <div className="flex flex-col items-center justify-center rounded-lg border border-line bg-surface p-6 text-center">
            <h2 className="text-lg font-semibold text-fg">Something went wrong</h2>
            <p className="mt-2 text-sm text-muted">
              We've logged this error and our team will look into it. Please try refreshing the page.
            </p>
            <button
              onClick={() => window.location.reload()}
              className="mt-4 rounded-md bg-accent px-4 py-2 text-sm font-medium text-accent-fg hover:opacity-90"
            >
              Refresh page
            </button>
            {import.meta.env.DEV && this.state.error && (
              <details className="mt-4 w-full text-left">
                <summary className="cursor-pointer text-xs font-mono text-muted">Error details</summary>
                <pre className="mt-2 overflow-auto rounded bg-surface-2 p-2 text-xs text-muted">{this.state.error.toString()}</pre>
              </details>
            )}
          </div>
        )
      );
    }

    return this.props.children;
  }
}
