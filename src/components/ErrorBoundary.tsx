import React from 'react';

interface ErrorBoundaryProps {
  children: React.ReactNode;
  fallback?: React.ReactNode;
  translations?: {
    title: string;
    message: string;
    reloadButton: string;
  };
}

interface State {
  hasError: boolean;
  error: Error | null;
}

class ErrorBoundaryBase extends React.Component<ErrorBoundaryProps, State> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(_error: Error, _errorInfo: React.ErrorInfo) {
    // Error logging removed - Sentry has been removed
  }

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

      const { title, message, reloadButton } = this.props.translations ?? {
        title: 'Etwas ist schiefgelaufen',
        message: 'Wir wurden benachrichtigt und arbeiten an der Lösung des Problems.',
        reloadButton: 'Seite neu laden',
      };

      return (
        <div className="min-h-screen flex items-center justify-center bg-background">
          <div className="max-w-md w-full space-y-8 p-8 bg-card rounded-lg shadow-lg border border-border">
            <div>
              <h2 className="mt-6 text-center text-3xl font-extrabold text-foreground">
                {title}
              </h2>
              <p className="mt-2 text-center text-sm text-muted-foreground">
                {message}
              </p>
            </div>
            <div className="mt-8">
              <button
                onClick={() => window.location.reload()}
                className="w-full flex justify-center py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-primary-foreground bg-primary hover:bg-primary/90 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-ring"
              >
                {reloadButton}
              </button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

const DEFAULT_ERROR_TRANSLATIONS = {
  title: 'Etwas ist schiefgelaufen',
  message: 'Wir wurden benachrichtigt und arbeiten an der Lösung des Problems.',
  reloadButton: 'Seite neu laden',
} as const;

/**
 * Provides a React error boundary with German error messages for the error UI.
 *
 * Wraps its children with {@link ErrorBoundaryBase}, injecting strings for the error UI.
 */
export function ErrorBoundary(props: Omit<ErrorBoundaryProps, 'translations'>) {
  return <ErrorBoundaryBase {...props} translations={DEFAULT_ERROR_TRANSLATIONS} />;
}
