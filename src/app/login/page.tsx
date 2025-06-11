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
				setError(t('login.error.invalidCredentials'))
				return
			}

			router.push('/')
		} catch (err) {
			console.error('Error during LDAP login:', err)
			captureFrontendError(err, {
				location: 'login',
				type: 'ldap-login',
			})
			setError(t('login.error.generic'))
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
				type: 'microsoft-login'
			})
			setError(t('login.error.generic'))
			setIsLoading(false)
		}
	}

	return (
		<div className="container flex h-screen w-screen flex-col items-center justify-center">
			<Card className="w-full max-w-md">
				<CardHeader>
					<CardTitle>{t('login.title')}</CardTitle>
					<CardDescription>
						{t('login.description')}
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
							<Label htmlFor="username">{t('login.username.label')}</Label>
							<Input
								id="username"
								value={username}
								onChange={(e) => setUsername(e.target.value)}
								placeholder={t('login.username.placeholder')}
								required
							/>
						</div>

						<div className="space-y-2">
							<Label htmlFor="password">{t('login.password.label')}</Label>
							<Input
								id="password"
								type="password"
								value={password}
								onChange={(e) => setPassword(e.target.value)}
								placeholder={t('login.password.placeholder')}
								required
							/>
						</div>

						<Button
							type="submit"
							className="w-full"
							disabled={isLoading}
						>
							{isLoading ? t('login.button.signingIn') : t('login.button.signInLDAP')}
						</Button>
					</form>

					<div className="relative my-4">
						<div className="absolute inset-0 flex items-center">
							<span className="w-full border-t" />
						</div>
						<div className="relative flex justify-center text-xs uppercase">
							<span className="bg-background px-2 text-muted-foreground">
								{t('login.orContinueWith')}
							</span>
						</div>
					</div>

					<Button
						variant="outline"
						className="w-full"
						onClick={handleMicrosoftLogin}
						disabled={isLoading}
					>
						<svg
							className="mr-2 h-4 w-4"
							aria-hidden="true"
							focusable="false"
							data-prefix="fab"
							data-icon="microsoft"
							role="img"
							xmlns="http://www.w3.org/2000/svg"
							viewBox="0 0 448 512"
						>
							<path
								fill="currentColor"
								d="M0 32h214.6v214.6H0V32zm233.4 0H448v214.6H233.4V32zM0 265.4h214.6V480H0V265.4zm233.4 0H448V480H233.4V265.4z"
							></path>
						</svg>
						{t('login.button.signInMicrosoft')}
					</Button>
				</CardContent>
			</Card>
		</div>
	)
} 