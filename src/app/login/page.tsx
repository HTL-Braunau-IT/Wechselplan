'use client'

import { useState } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { AlertCircle, LogIn } from 'lucide-react'
import { signIn } from 'next-auth/react'
import { captureFrontendError } from '@/lib/frontend-error'
import { useTranslation } from 'react-i18next'

/**
 * Login page. Microsoft/Entra is the only identity provider — the LDAP
 * username/password form was removed with the rest of the LDAP stack.
 *
 * Who may sign in is decided server-side by `resolveMicrosoftAccess`: members
 * of the teacher group or of a synced class group. Everyone else is bounced by
 * the `signIn` callback, so there is nothing to gate here.
 */
export default function LoginPage() {
  const [error, setError] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const { t } = useTranslation()

  const handleMicrosoftLogin = async () => {
    setIsLoading(true)
    setError(null)
    try {
      await signIn('azure-ad', { callbackUrl: '/' })
    } catch (err) {
      console.error('Error during Microsoft login:', err)
      captureFrontendError(err, {
        location: 'login',
        type: 'microsoft-login',
      })
      setError(t('auth.error.generic'))
      setIsLoading(false)
    }
  }

  return (
    <div className="bg-background flex min-h-screen w-full flex-col items-center justify-center p-4">
      <Card className="w-full max-w-md shadow-sm">
        <CardHeader className="items-center text-center">
          <div className="bg-primary/10 text-primary mb-2 flex h-12 w-12 items-center justify-center rounded-lg">
            <LogIn className="h-6 w-6" />
          </div>
          <CardTitle>{t('auth.title')}</CardTitle>
          <CardDescription>{t('auth.description')}</CardDescription>
        </CardHeader>
        <CardContent>
          {error && (
            <Alert variant="destructive" className="mb-4">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          <Button
            type="button"
            className="w-full"
            disabled={isLoading}
            onClick={handleMicrosoftLogin}
          >
            <LogIn className="h-4 w-4" />
            {isLoading ? t('auth.button.signingIn') : t('auth.button.signInMicrosoft')}
          </Button>
        </CardContent>
      </Card>
    </div>
  )
}
