import React from 'react';
import { useTranslation } from 'react-i18next';

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
        title: 'Something went wrong',
        message: "We've been notified and are working to fix the issue.",
        reloadButton: 'Reload page',
      };

      return (
        <div className="min-h-screen flex items-center justify-center bg-gray-50">
          <div className="max-w-md w-full space-y-8 p-8 bg-white rounded-lg shadow-lg">
            <div>
              <h2 className="mt-6 text-center text-3xl font-extrabold text-gray-900">
                {title}
              </h2>
              <p className="mt-2 text-center text-sm text-gray-600">
                {message}
              </p>
            </div>
            <div className="mt-8">
              <button
                onClick={() => window.location.reload()}
                className="w-full flex justify-center py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
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

/**
 * Provides a React error boundary with localized error messages using translations from `react-i18next`.
 *
 * Wraps its children with {@link ErrorBoundaryBase}, injecting translated strings for the error UI.
 */
export function ErrorBoundary(props: Omit<ErrorBoundaryProps, 'translations'>) {
  const { t } = useTranslation();

  const translations = {
    title: t('errors.somethingWentWrong'),
    message: t('errors.errorNotification'),
    reloadButton: t('common.reloadPage'),
  };

  return <ErrorBoundaryBase {...props} translations={translations} />;
} 