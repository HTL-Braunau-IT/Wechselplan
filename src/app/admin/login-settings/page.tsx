'use client'

import { useState } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Button } from '@/components/ui/button'
import { PlusCircle } from 'lucide-react'
import { MicrosoftOAuthConfig, type MicrosoftOAuthConfig as MicrosoftOAuthConfigType } from './_components/microsoft-oauth-config'
import { LDAPConfig, type LDAPConfig as LDAPConfigType } from './_components/ldap-config'

export default function LoginSettingsPage() {
	const [activeTab, setActiveTab] = useState('active')
	const [activeProviders, setActiveProviders] = useState<{
		microsoft?: MicrosoftOAuthConfigType
		ldap?: LDAPConfigType
	}>({})

	const handleMicrosoftSave = async (config: MicrosoftOAuthConfigType) => {
		// TODO: Implement API call to save Microsoft OAuth configuration
		setActiveProviders((prev) => ({ ...prev, microsoft: config }))
	}

	const handleLDAPSave = async (config: LDAPConfigType) => {
		try {
			console.log('Making API call to save LDAP config:', config)
			const response = await fetch('/api/auth/ldap-config', {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
				},
				body: JSON.stringify(config),
			})

			if (!response.ok) {
				console.error('API call failed:', response.status, response.statusText)
				throw new Error('Failed to save LDAP configuration')
			}

			console.log('LDAP config saved successfully')
			setActiveProviders((prev) => ({ ...prev, ldap: config }))
		} catch (error) {
			console.error('Error saving LDAP configuration:', error)
			throw error
		}
	}

	const addMicrosoftProvider = () => {
		setActiveProviders((prev) => ({
			...prev,
			microsoft: {
				clientId: '',
				clientSecret: '',
				tenantId: '',
				redirectUri: '',
				enabled: false,
			},
		}))
		setActiveTab('active')
	}

	const addLDAPProvider = () => {
		setActiveProviders((prev) => ({
			...prev,
			ldap: {
				serverUrl: '',
				baseDN: '',
				bindDN: '',
				bindPassword: '',
				userSearchBase: '',
				userSearchFilter: '',
				enabled: false,
				studentGroups: [],
				teacherGroups: [],
			},
		}))
		setActiveTab('active')
	}

	return (
		<div className="container mx-auto py-6">
			<div className="flex justify-between items-center mb-6">
				<h1 className="text-3xl font-bold">Login Settings</h1>
				<Button>
					<PlusCircle className="mr-2 h-4 w-4" />
					Add Provider
				</Button>
			</div>

			<Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
				<TabsList>
					<TabsTrigger value="active">Active Providers</TabsTrigger>
					<TabsTrigger value="available">Available Providers</TabsTrigger>
				</TabsList>

				<TabsContent value="active" className="space-y-4">
					<Card>
						<CardHeader>
							<CardTitle>Active Authentication Providers</CardTitle>
							<CardDescription>
								Manage your currently active authentication providers
							</CardDescription>
						</CardHeader>
						<CardContent className="space-y-4">
							{activeProviders.microsoft && (
								<MicrosoftOAuthConfig
									onSave={handleMicrosoftSave}
									initialConfig={activeProviders.microsoft}
								/>
							)}
							{activeProviders.ldap && (
								<LDAPConfig
									onSave={handleLDAPSave}
									initialConfig={activeProviders.ldap}
								/>
							)}
							{!activeProviders.microsoft && !activeProviders.ldap && (
								<div className="text-sm text-muted-foreground">
									No active providers configured yet.
								</div>
							)}
						</CardContent>
					</Card>
				</TabsContent>

				<TabsContent value="available" className="space-y-4">
					<Card>
						<CardHeader>
							<CardTitle>Available Providers</CardTitle>
							<CardDescription>
								Configure new authentication providers
							</CardDescription>
						</CardHeader>
						<CardContent>
							<div className="grid gap-4">
								<Card>
									<CardHeader>
										<CardTitle>Microsoft 365 (OAuth)</CardTitle>
										<CardDescription>
											Configure Microsoft 365 authentication using OAuth 2.0
										</CardDescription>
									</CardHeader>
									<CardContent>
										<Button variant="outline" onClick={addMicrosoftProvider}>
											Configure
										</Button>
									</CardContent>
								</Card>

								<Card>
									<CardHeader>
										<CardTitle>LDAP</CardTitle>
										<CardDescription>
											Configure LDAP authentication for your organization
										</CardDescription>
									</CardHeader>
									<CardContent>
										<Button variant="outline" onClick={addLDAPProvider}>
											Configure
										</Button>
									</CardContent>
								</Card>
							</div>
						</CardContent>
					</Card>
				</TabsContent>
			</Tabs>
		</div>
	)
} 