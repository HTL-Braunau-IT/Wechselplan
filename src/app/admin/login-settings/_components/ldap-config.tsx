'use client'

import { useState, useEffect } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import { Switch } from '@/components/ui/switch'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { AlertCircle } from 'lucide-react'

interface LDAPConfigProps {
	onSave: (config: LDAPConfig) => Promise<void>
	initialConfig?: LDAPConfig
}

export interface LDAPConfig {
	serverUrl: string
	baseDN: string
	bindDN: string
	bindPassword: string
	userSearchBase: string
	userSearchFilter: string
	enabled: boolean
	studentGroups: string[]
	teacherGroups: string[]
}

export function LDAPConfig({ onSave, initialConfig }: LDAPConfigProps) {
	const [config, setConfig] = useState<LDAPConfig | null>(null)
	const [isSaving, setIsSaving] = useState(false)
	const [error, setError] = useState<string | null>(null)
	const [isLoading, setIsLoading] = useState(true)
	const [newStudentGroup, setNewStudentGroup] = useState('')
	const [newTeacherGroup, setNewTeacherGroup] = useState('')

	useEffect(() => {
		async function fetchConfig() {
			try {
				const response = await fetch('/api/auth/ldap-config')
				if (!response.ok) throw new Error('Failed to fetch LDAP configuration')
				const data = await response.json() as LDAPConfig
				setConfig({
					serverUrl: data.serverUrl ?? '',
					baseDN: data.baseDN ?? '',
					bindDN: data.bindDN ?? '',
					bindPassword: data.bindPassword ?? '',
					userSearchBase: data.userSearchBase ?? '',
					userSearchFilter: data.userSearchFilter ?? '(sAMAccountName={0})',
					enabled: data.enabled ?? false,
					studentGroups: data.studentGroups ?? [],
					teacherGroups: data.teacherGroups ?? [],
				})
			} catch (err) {
				setError(err instanceof Error ? err.message : 'Failed to load configuration')
			} finally {
				setIsLoading(false)
			}
		}

		if (
			initialConfig &&
			Object.values(initialConfig).some((v) => v !== '' && v !== false)
		) {
			setConfig(initialConfig)
			setIsLoading(false)
		} else {
			void fetchConfig()
		}
	}, [initialConfig])

	const handleAddStudentGroup = () => {
		if (!newStudentGroup.trim() || !config) return
		setConfig({
			...config,
			studentGroups: [...config.studentGroups, newStudentGroup.trim()]
		})
		setNewStudentGroup('')
	}

	const handleAddTeacherGroup = () => {
		if (!newTeacherGroup.trim() || !config) return
		setConfig({
			...config,
			teacherGroups: [...config.teacherGroups, newTeacherGroup.trim()]
		})
		setNewTeacherGroup('')
	}

	const handleRemoveStudentGroup = (index: number) => {
		if (!config) return
		setConfig({
			...config,
			studentGroups: config.studentGroups.filter((_, i) => i !== index)
		})
	}

	const handleRemoveTeacherGroup = (index: number) => {
		if (!config) return
		setConfig({
			...config,
			teacherGroups: config.teacherGroups.filter((_, i) => i !== index)
		})
	}

	const handleSave = async () => {
		if (!config) return
		setIsSaving(true)
		setError(null)

		try {
			console.log('Saving LDAP config:', config)
			await onSave(config)
			console.log('LDAP config saved successfully')
		} catch (err) {
			console.error('Error saving LDAP config:', err)
			setError(err instanceof Error ? err.message : 'Failed to save configuration')
		} finally {
			setIsSaving(false)
		}
	}

	if (isLoading) {
		return (
			<Card>
				<CardContent className="p-6">
					<div className="text-sm text-muted-foreground">Loading configuration...</div>
				</CardContent>
			</Card>
		)
	}

	console.log('LDAP config state:', config)

	if (!config) {
		return (
			<Card>
				<CardContent className="p-6">
					<div className="text-sm text-muted-foreground">Failed to load configuration</div>
				</CardContent>
			</Card>
		)
	}

	return (
		<Card>
			<CardHeader>
				<CardTitle>LDAP Configuration</CardTitle>
				<CardDescription>
					Configure LDAP authentication settings for your application
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
					<Label htmlFor="serverUrl">Server URL</Label>
					<Input
						id="serverUrl"
						value={config.serverUrl}
						onChange={(e) =>
							setConfig((prev) => prev && { ...prev, serverUrl: e.target.value })
						}
						placeholder="ldap://your-ldap-server:389"
					/>
				</div>

				<div className="space-y-2">
					<Label htmlFor="baseDN">Base DN</Label>
					<Input
						id="baseDN"
						value={config.baseDN}
						onChange={(e) =>
							setConfig((prev) => prev && { ...prev, baseDN: e.target.value })
						}
						placeholder="dc=example,dc=com"
					/>
				</div>

				<div className="space-y-2">
					<Label htmlFor="bindDN">Bind DN</Label>
					<Input
						id="bindDN"
						value={config.bindDN}
						onChange={(e) =>
							setConfig((prev) => prev && { ...prev, bindDN: e.target.value })
						}
						placeholder="cn=admin,dc=example,dc=com"
					/>
				</div>

				<div className="space-y-2">
					<Label htmlFor="bindPassword">Bind Password</Label>
					<Input
						id="bindPassword"
						type="password"
						value={config.bindPassword}
						onChange={(e) =>
							setConfig((prev) => prev && { ...prev, bindPassword: e.target.value })
						}
						placeholder="Enter bind password"
					/>
				</div>

				<div className="space-y-2">
					<Label htmlFor="userSearchBase">User Search Base</Label>
					<Input
						id="userSearchBase"
						value={config.userSearchBase}
						onChange={(e) =>
							setConfig((prev) => prev && { ...prev, userSearchBase: e.target.value })
						}
						placeholder="ou=users,dc=example,dc=com"
					/>
				</div>

				<div className="space-y-2">
					<Label htmlFor="userSearchFilter">User Search Filter</Label>
					<Input
						id="userSearchFilter"
						value={config.userSearchFilter}
						onChange={(e) =>
							setConfig((prev) => prev && { ...prev, userSearchFilter: e.target.value })
						}
						placeholder="(uid={0})"
					/>
				</div>

				<div className="flex items-center space-x-2">
					<Switch
						id="enabled"
						checked={config.enabled}
						onCheckedChange={(checked: boolean) =>
							setConfig((prev) => prev && { ...prev, enabled: checked })
						}
					/>
					<Label htmlFor="enabled">Enable LDAP Authentication</Label>
				</div>

				<div className="space-y-4">
					<div className="space-y-2">
						<Label>Student Groups</Label>
						<div className="flex gap-2">
							<Input
								value={newStudentGroup}
								onChange={(e) => setNewStudentGroup(e.target.value)}
								placeholder="Enter LDAP group DN"
							/>
							<Button onClick={handleAddStudentGroup} type="button">
								Add
							</Button>
						</div>
						<div className="space-y-2 mt-2">
							{config.studentGroups.map((group, index) => (
								<div key={index} className="flex items-center gap-2">
									<span className="text-sm">{group}</span>
									<Button
										variant="ghost"
										size="sm"
										onClick={() => handleRemoveStudentGroup(index)}
									>
										Remove
									</Button>
								</div>
							))}
						</div>
					</div>

					<div className="space-y-2">
						<Label>Teacher Groups</Label>
						<div className="flex gap-2">
							<Input
								value={newTeacherGroup}
								onChange={(e) => setNewTeacherGroup(e.target.value)}
								placeholder="Enter LDAP group DN"
							/>
							<Button onClick={handleAddTeacherGroup} type="button">
								Add
							</Button>
						</div>
						<div className="space-y-2 mt-2">
							{config.teacherGroups.map((group, index) => (
								<div key={index} className="flex items-center gap-2">
									<span className="text-sm">{group}</span>
									<Button
										variant="ghost"
										size="sm"
										onClick={() => handleRemoveTeacherGroup(index)}
									>
										Remove
									</Button>
								</div>
							))}
						</div>
					</div>
				</div>

				<div className="flex justify-end">
					<Button onClick={handleSave} disabled={isSaving}>
						{isSaving ? 'Saving...' : 'Save Configuration'}
					</Button>
				</div>
			</CardContent>
		</Card>
	)
} 