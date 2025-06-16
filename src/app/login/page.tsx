'use client'

import { useState } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { AlertCircle } from 'lucide-react'
import { signIn } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import { captureFrontendError } from '@/lib/frontend-error'
import { useTranslation } from 'react-i18next'

/**
 * Renders a localized login page supporting LDAP and Microsoft (Azure AD) authentication.
 *
 * Provides form fields for LDAP login and a button for Microsoft login, displaying error messages and loading states as appropriate. All user-facing text is internationalized.
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

	

	return (
		<div className="container flex h-screen w-screen flex-col items-center justify-center">
			<Card className="w-full max-w-md">
				<CardHeader>
					<CardTitle>{t('auth.title')}</CardTitle>
					<CardDescription>
						{t('auth.description')}
					</CardDescription>
				</CardHeader>
				<CardContent>
					{error && (
						<Alert variant="destructive" className="mb-4">
							<AlertCircle className="h-4 w-4" />
							<AlertDescription>{error}</AlertDescription>
						</Alert>
					)}

					<form onSubmit={handleLDAPLogin} className="space-y-4">
						<div className="space-y-2">
							<Label htmlFor="username">{t('auth.username.label')}</Label>
							<Input
								id="username"
								value={username}
								onChange={(e) => setUsername(e.target.value)}
								placeholder={t('auth.username.placeholder')}
								required
							/>
						</div>

						<div className="space-y-2">
							<Label htmlFor="password">{t('auth.password.label')}</Label>
							<Input
								id="password"
								type="password"
								value={password}
								onChange={(e) => setPassword(e.target.value)}
								placeholder={t('auth.password.placeholder')}
								required
							/>
						</div>

						<Button
							type="submit"
							className="w-full"
							disabled={isLoading}
						>
							{isLoading ? t('auth.button.signingIn') : t('auth.button.signInLDAP')}
						</Button>
					</form>
				</CardContent>
			</Card>
		</div>
	)
} 