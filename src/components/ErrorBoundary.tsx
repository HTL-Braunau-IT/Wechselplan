import React from 'react'
import { useTranslation } from 'react-i18next'
import { AlertTriangle, RefreshCw } from 'lucide-react'
import { Alert, AlertTitle, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'

interface ErrorBoundaryProps {
  children: React.ReactNode
  fallback?: React.ReactNode
  translations?: {
    title: string
    message: string
    reloadButton: string
  }
}

interface State {
  hasError: boolean
  error: Error | null
}

class ErrorBoundaryBase extends React.Component<ErrorBoundaryProps, State> {
  constructor(props: ErrorBoundaryProps) {
    super(props)
    this.state = { hasError: false, error: null }
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error }
  }

  componentDidCatch(_error: Error, _errorInfo: React.ErrorInfo) {
    // Error logging removed - Sentry has been removed
  }

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback
      }

      const { title, message, reloadButton } = this.props.translations ?? {
        title: 'Something went wrong',
        message: "We've been notified and are working to fix the issue.",
        reloadButton: 'Reload page',
      }

      return (
        <div className="bg-background flex min-h-screen items-center justify-center p-4">
          <div className="w-full max-w-md space-y-6">
            <Alert variant="destructive">
              <AlertTriangle className="h-4 w-4" />
              <AlertTitle>{title}</AlertTitle>
              <AlertDescription>{message}</AlertDescription>
            </Alert>
            <Button className="w-full" onClick={() => window.location.reload()}>
              <RefreshCw className="h-4 w-4" />
              {reloadButton}
            </Button>
          </div>
        </div>
      )
    }

    return this.props.children
  }
}

/**
 * Provides a React error boundary with localized error messages using translations from `react-i18next`.
 *
 * Wraps its children with {@link ErrorBoundaryBase}, injecting translated strings for the error UI.
 */
export function ErrorBoundary(props: Omit<ErrorBoundaryProps, 'translations'>) {
  const { t } = useTranslation()

  const translations = {
    title: t('errors.somethingWentWrong'),
    message: t('errors.errorNotification'),
    reloadButton: t('common.reloadPage'),
  }

  return <ErrorBoundaryBase {...props} translations={translations} />
}
