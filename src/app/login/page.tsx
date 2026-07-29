'use client'

import { useState } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Separator } from '@/components/ui/separator'
import { AlertCircle, LogIn, Lock, User } from 'lucide-react'
import { signIn } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import { captureFrontendError } from '@/lib/frontend-error'
import { useTranslation } from 'react-i18next'

/**
 * Renders a localized login page with LDAP authentication.
 *
 * Displays a form for users to enter their username and password, handles authentication via LDAP, and shows relevant error or loading states. All user-facing text is internationalized.
 */
export default function LoginPage() {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const router = useRouter()
  const { t } = useTranslation()

  const handleLDAPLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsLoading(true)
    setError(null)

    try {
      const result = await signIn('ldap', {
        username,
        password,
        redirect: false,
      })

      if (result?.error) {
        setError(t('auth.error.invalidCredentials'))
        return
      }

      router.push('/')
    } catch (err) {
      console.error('Error during LDAP login:', err)
      captureFrontendError(err, {
        location: 'login',
        type: 'ldap-login',
      })
      setError(t('auth.error.generic'))
    } finally {
      setIsLoading(false)
    }
  }

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
            className="mb-4 w-full"
            disabled={isLoading}
            onClick={handleMicrosoftLogin}
          >
            <LogIn className="h-4 w-4" />
            {isLoading ? t('auth.button.signingIn') : t('auth.button.signInMicrosoft')}
          </Button>

          <Separator className="mb-4" />

          <form onSubmit={handleLDAPLogin} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="username">{t('auth.username.label')}</Label>
              <div className="relative">
                <User className="text-muted-foreground pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2" />
                <Input
                  id="username"
                  value={username}
                  onChange={e => setUsername(e.target.value)}
                  placeholder={t('auth.username.placeholder')}
                  className="pl-9"
                  required
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="password">{t('auth.password.label')}</Label>
              <div className="relative">
                <Lock className="text-muted-foreground pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2" />
                <Input
                  id="password"
                  type="password"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  placeholder={t('auth.password.placeholder')}
                  className="pl-9"
                  required
                />
              </div>
            </div>

            <Button type="submit" variant="secondary" className="w-full" disabled={isLoading}>
              <LogIn className="h-4 w-4" />
              {isLoading ? t('auth.button.signingIn') : t('auth.button.signInLDAP')}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}
