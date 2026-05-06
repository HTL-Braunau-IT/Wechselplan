'use client'

import { useState } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import { Switch } from '@/components/ui/switch'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { AlertCircle } from 'lucide-react'

interface MicrosoftOAuthConfigProps {
	onSave: (config: MicrosoftOAuthConfig) => Promise<void>
	initialConfig?: MicrosoftOAuthConfig
}

export interface MicrosoftOAuthConfig {
	clientId: string
	clientSecret: string
	tenantId: string
	redirectUri: string
	enabled: boolean
}

export function MicrosoftOAuthConfig({ onSave, initialConfig }: MicrosoftOAuthConfigProps) {
	const [config, setConfig] = useState<MicrosoftOAuthConfig>(
		initialConfig ?? {
			clientId: '',
			clientSecret: '',
			tenantId: '',
			redirectUri: '',
			enabled: false,
		}
	)
	const [isSaving, setIsSaving] = useState(false)
	const [error, setError] = useState<string | null>(null)

	const handleSave = async () => {
		setIsSaving(true)
		setError(null)

		try {
			await onSave(config)
		} catch (err) {
			setError(err instanceof Error ? err.message : 'Konfiguration konnte nicht gespeichert werden')
		} finally {
			setIsSaving(false)
		}
	}

	return (
		<Card>
			<CardHeader>
				<CardTitle>Microsoft 365 OAuth-Konfiguration</CardTitle>
				<CardDescription>
					Microsoft 365-Authentifizierungseinstellungen für die Anwendung konfigurieren
				</CardDescription>
			</CardHeader>
			<CardContent className="space-y-4">
				{error && (
					<Alert variant="destructive">
						<AlertCircle className="h-4 w-4" />
						<AlertDescription>{error}</AlertDescription>
					</Alert>
				)}

				<div className="space-y-2">
					<Label htmlFor="clientId">Client ID</Label>
					<Input
						id="clientId"
						value={config.clientId}
						onChange={(e) =>
							setConfig((prev) => ({ ...prev, clientId: e.target.value }))
						}
						placeholder="Azure AD Client-ID eingeben"
					/>
				</div>

				<div className="space-y-2">
					<Label htmlFor="clientSecret">Client Secret</Label>
					<Input
						id="clientSecret"
						type="password"
						value={config.clientSecret}
						onChange={(e) =>
							setConfig((prev) => ({ ...prev, clientSecret: e.target.value }))
						}
						placeholder="Azure AD Client-Secret eingeben"
					/>
				</div>

				<div className="space-y-2">
					<Label htmlFor="tenantId">Tenant ID</Label>
					<Input
						id="tenantId"
						value={config.tenantId}
						onChange={(e) =>
							setConfig((prev) => ({ ...prev, tenantId: e.target.value }))
						}
						placeholder="Azure AD Tenant-ID eingeben"
					/>
				</div>

				<div className="space-y-2">
					<Label htmlFor="redirectUri">Redirect URI</Label>
					<Input
						id="redirectUri"
						value={config.redirectUri}
						onChange={(e) =>
							setConfig((prev) => ({ ...prev, redirectUri: e.target.value }))
						}
						placeholder="Redirect-URI eingeben"
					/>
				</div>

				<div className="flex items-center space-x-2">
					<Switch
						id="enabled"
						checked={config.enabled}
						onCheckedChange={(checked: boolean) =>
							setConfig((prev) => ({ ...prev, enabled: checked }))
						}
					/>
					<Label htmlFor="enabled">Microsoft 365-Authentifizierung aktivieren</Label>
				</div>

				<div className="flex justify-end">
					<Button onClick={handleSave} disabled={isSaving}>
						{isSaving ? 'Speichert...' : 'Konfiguration speichern'}
					</Button>
				</div>
			</CardContent>
		</Card>
	)
} 