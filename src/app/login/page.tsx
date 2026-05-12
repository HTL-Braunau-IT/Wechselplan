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
				setError('Ungültiger Benutzername oder Passwort')
				return
			}

			router.push('/')
		} catch (err) {
			console.error('Error during LDAP login:', err)
			captureFrontendError(err, {
				location: 'login',
				type: 'ldap-login',
			})
			setError('Bei der Anmeldung ist ein Fehler aufgetreten')
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
			setError('Bei der Anmeldung ist ein Fehler aufgetreten')
			setIsLoading(false)
		}
	}

	

	return (
		<div className="container flex h-screen w-screen flex-col items-center justify-center">
			<Card className="w-full max-w-md">
				<CardHeader>
					<CardTitle>Anmelden</CardTitle>
					<CardDescription>
						Melden Sie sich mit Ihren Zugangsdaten an
					</CardDescription>
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
						{isLoading ? 'Anmeldung läuft...' : 'Mit Microsoft anmelden'}
					</Button>

					<div className="mb-4 border-t" />

					<form onSubmit={handleLDAPLogin} className="space-y-4">
						<div className="space-y-2">
							<Label htmlFor="username">Benutzername</Label>
							<Input
								id="username"
								value={username}
								onChange={(e) => setUsername(e.target.value)}
								placeholder="Geben Sie Ihren Benutzernamen ein"
								required
							/>
						</div>

						<div className="space-y-2">
							<Label htmlFor="password">Passwort</Label>
							<Input
								id="password"
								type="password"
								value={password}
								onChange={(e) => setPassword(e.target.value)}
								placeholder="Geben Sie Ihr Passwort ein"
								required
							/>
						</div>

						<Button
							type="submit"
							className="w-full"
							disabled={isLoading}
						>
							{isLoading ? 'Anmeldung läuft...' : 'Anmelden'}
						</Button>
					</form>
				</CardContent>
			</Card>
		</div>
	)
} 