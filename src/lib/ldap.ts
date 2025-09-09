import * as ldap from 'ldapjs'
import { captureError } from '@/lib/sentry'

interface LDAPConfig {
	url: string
	baseDN: string
	bindDN: string
	bindPassword: string
	timeout?: number
}

interface LDAPUser {
	dn: string
	displayName: string
	mail: string
	givenName: string
	sn: string
}

/**
 * Escapes special characters in a string for safe use in LDAP filter values.
 *
 * Special characters such as `\`, `*`, `(`, `)`, and null bytes are prefixed with a backslash to prevent LDAP injection or filter parsing errors.
 *
 * @param value - The string to escape for use in an LDAP filter.
 * @returns The escaped string suitable for LDAP filter usage.
 */
function escapeLDAPFilterValue(value: string): string {
	return value.replace(/[\\*()\0]/g, char => `\\${char}`)
}

function decodeLDAPDN(dn: string): string {
	// Convert escaped UTF-8 sequences back to their original characters
	return dn.replace(/\\c3\\b6/g, 'ö')
		.replace(/\\c3\\a4/g, 'ä')
		.replace(/\\c3\\bc/g, 'ü')
		.replace(/\\c3\\96/g, 'Ö')
		.replace(/\\c3\\84/g, 'Ä')
		.replace(/\\c3\\9c/g, 'Ü')
		.replace(/\\c3\\9f/g, 'ß')
}

function tryDifferentDNFormats(username: string, baseDN: string): string[] {
	// Extract just the username part (before @)
	const userPart = username.split('@')[0]
	
	const formats = [
		// Use the actual DN we discovered from PowerShell
		`CN=WECHSELPLAN,OU=AD-SYNC,OU=SERVICE-ACCOUNTS,OU=HTL-BRAUNAU,DC=ad,DC=htl-braunau,DC=at`,
		username, // Original format
		`CN=${userPart},CN=Users,${baseDN}`, // Standard AD Users container
		`CN=${userPart},${baseDN}`, // Direct CN format
		`${userPart}@ad.htl-braunau.at`, // UPN format
		`${userPart}@htl-braunau.at`, // Alternative UPN format
		`CN=${userPart},OU=Service Accounts,${baseDN}`, // Service account format
		`CN=${userPart},OU=Administrators,${baseDN}`, // Admin account format
		`${userPart}`, // Just username
	]
	return formats
}

export class LDAPClient {
	private client: ldap.Client
	private config: LDAPConfig
	private readonly DEFAULT_TIMEOUT = 5000 // 5 seconds

	constructor(config: LDAPConfig) {
		this.config = config
		console.log('Initializing LDAP client with URL:', config.url)
		this.client = ldap.createClient({
			url: config.url,
			timeout: config.timeout ?? this.DEFAULT_TIMEOUT,
			connectTimeout: config.timeout ?? this.DEFAULT_TIMEOUT,
			reconnect: true,
			// Add additional options for Active Directory
			strictDN: false,
			// Try different authentication methods
			tlsOptions: {
				rejectUnauthorized: false
			}
		})

		// Add error event listener
		this.client.on('error', (err) => {
			console.error('LDAP client error:', err)
			captureError(err, {
				location: 'LDAPClient',
				type: 'client_error'
			})
		})

		// Add connect event listener
		this.client.on('connect', () => {
			console.log('LDAP client connected successfully')
		})

		// Add connectTimeout event listener
		this.client.on('connectTimeout', () => {
			console.error('LDAP connection timeout')
			captureError(new Error('LDAP connection timeout'), {
				location: 'LDAPClient',
				type: 'connection_timeout'
			})
		})

		// Add timeout event listener
		this.client.on('timeout', () => {
			console.error('LDAP operation timeout')
			captureError(new Error('LDAP operation timeout'), {
				location: 'LDAPClient',
				type: 'operation_timeout'
			})
		})
	}

	private tryBindWithFormats(formats: string[], password: string, callback: (err: Error | null) => void): void {
		let currentIndex = 0
		
		const tryNextFormat = () => {
			if (currentIndex >= formats.length) {
				callback(new Error('All bind formats failed'))
				return
			}
			
			const currentFormat = formats[currentIndex]
			if (!currentFormat) {
				callback(new Error('Invalid bind format'))
				return
			}
			console.log(`Trying bind format ${currentIndex + 1}/${formats.length}: ${currentFormat}`)
			
			this.client.bind(currentFormat, password, (err: Error | null) => {
				if (err) {
					console.log(`Bind format ${currentIndex + 1} failed:`, err.message)
					currentIndex++
					tryNextFormat()
				} else {
					console.log(`Bind format ${currentIndex + 1} succeeded: ${currentFormat}`)
					callback(null)
				}
			})
		}
		
		tryNextFormat()
	}

	async authenticate(username: string, password: string): Promise<LDAPUser | null> {
		return new Promise((resolve, reject) => {
			const timeout = setTimeout(() => {
				console.error('LDAP authentication timeout')
				captureError(new Error('LDAP authentication timeout'), {
					location: 'LDAPClient',
					type: 'authentication_timeout',
					extra: { username }
				})
				reject(new Error('Authentication timeout'))
			}, this.config.timeout ?? this.DEFAULT_TIMEOUT)

		console.log('Starting LDAP authentication for user:', username)
		// First bind with the service account
		console.log('Attempting to bind with service account:', this.config.bindDN)
		console.log('LDAP URL:', this.config.url)
		console.log('Base DN:', this.config.baseDN)
		console.log('Bind DN:', this.config.bindDN)
		console.log('Password length:', this.config.bindPassword?.length || 0)
		console.log('Password value (first 3 chars):', this.config.bindPassword?.substring(0, 3) || 'undefined')
		console.log('Password value (last 3 chars):', this.config.bindPassword?.substring(this.config.bindPassword.length - 3) || 'undefined')
		
		// Test basic connectivity first
		console.log('Testing LDAP server connectivity...')
		this.client.search(this.config.baseDN, { scope: 'base', filter: '(objectClass=*)' }, (err, _res) => {
			if (err) {
				console.error('LDAP server connectivity test failed:', err)
			} else {
				console.log('LDAP server connectivity test passed')
			}
		})
		
		// Try different DN formats for the service account
		const bindFormats = tryDifferentDNFormats(this.config.bindDN, this.config.baseDN)
		console.log('Trying bind formats:', bindFormats)
		
		this.tryBindWithFormats(bindFormats, this.config.bindPassword, (err: Error | null) => {
				if (err) {
					clearTimeout(timeout)
					console.error('LDAP bind error with service account:', err)
					captureError(err, {
						location: 'LDAPClient',
						type: 'service_account_bind_error',
						extra: { username }
					})
					reject(new Error('Failed to bind with service account'))
					return
				}
				console.log('Successfully bound with service account')

				// Search for the user - extract username part from UPN
				const userPart = username.split('@')[0]
				if (!userPart) {
					clearTimeout(timeout)
					console.error('Invalid username format')
					reject(new Error('Invalid username format'))
					return
				}
				const searchOptions: ldap.SearchOptions = {
					filter: `(sAMAccountName=${escapeLDAPFilterValue(userPart)})`,
					scope: 'sub' as const,
					attributes: ['dn', 'displayName', 'mail', 'givenName', 'sn'],
					timeLimit: 5 // 5 seconds timeout for search
				}

				console.log('LDAP Search Options:', JSON.stringify(searchOptions, null, 2))
				console.log('Searching in base DN:', this.config.baseDN)
				console.log('Searching for user part:', userPart)

				this.client.search(this.config.baseDN, searchOptions, (err: Error | null, res: ldap.SearchCallbackResponse) => {
					if (err) {
						clearTimeout(timeout)
						console.error('LDAP search error:', err)
						captureError(err, {
							location: 'LDAPClient',
							type: 'user_search_error',
							extra: { username }
						})
						reject(new Error('Failed to search for user'))
						return
					}

					let user: LDAPUser | null = null

					res.on('searchEntry', (entry: ldap.SearchEntry) => {
						console.log('Received search entry with DN:', entry.dn)
						const attributes = entry.attributes
						const rawDN = entry.dn.toString()
						const dn = decodeLDAPDN(rawDN)
						console.log('Found user DN (raw):', rawDN)
						console.log('Found user DN (decoded):', dn)
						const displayName = attributes.find(attr => attr.type === 'displayName')?.values[0]
						const mail = attributes.find(attr => attr.type === 'mail')?.values[0]
						const givenName = attributes.find(attr => attr.type === 'givenName')?.values[0]
						const sn = attributes.find(attr => attr.type === 'sn')?.values[0]
						console.log('Found attributes:', { displayName, mail, givenName, sn })
						if (!displayName || !mail || !givenName || !sn) {
							console.log('Missing required attributes (displayName, mail, givenName, or sn)')
							captureError(new Error('Missing required LDAP attributes'), {
								location: 'LDAPClient',
								type: 'missing_attributes',
								extra: {
									username,
									hasDisplayName: !!displayName,
									hasMail: !!mail,
									hasGivenName: !!givenName,
									hasSn: !!sn
								}
							})
							return
						}
						user = {
							dn,
							displayName,
							mail,
							givenName,
							sn
						}
					})

					res.on('error', (err: Error) => {
						clearTimeout(timeout)
						console.error('LDAP search error:', err)
						captureError(err, {
							location: 'LDAPClient',
							type: 'search_error',
							extra: { username }
						})
						reject(new Error('Error during user search'))
					})

					res.on('end', () => {
						if (!user) {
							clearTimeout(timeout)
							console.log('No user found with username:', username)
							captureError(new Error('User not found in LDAP'), {
								location: 'LDAPClient',
								type: 'user_not_found',
								extra: { username }
							})
							resolve(null)
							return
						}

						// Try to bind with the user's credentials
						console.log('Attempting to bind with user DN:', user.dn)
						this.client.bind(user.dn, password, (err: Error | null) => {
							clearTimeout(timeout)
							if (err) {
								console.error('LDAP user bind error:', err)
								captureError(err, {
									location: 'LDAPClient',
									type: 'user_bind_error',
									extra: { username }
								})
								resolve(null)
								return
							}
							console.log('Successfully authenticated user:', username)
							resolve(user)
						})
					})
				})
			})
		})
	}

	async getUserGroups(userDN: string): Promise<string[]> {
		return new Promise((resolve, reject) => {
			const timeout = setTimeout(() => {
				console.error('LDAP group search timeout')
				captureError(new Error('LDAP group search timeout'), {
					location: 'LDAPClient',
					type: 'group_search_timeout',
					extra: { userDN }
				})
				reject(new Error('Group search timeout'))
			}, this.config.timeout ?? this.DEFAULT_TIMEOUT)

			this.client.bind(this.config.bindDN, this.config.bindPassword, (err: Error | null) => {
				if (err) {
					clearTimeout(timeout)
					console.error('LDAP bind error:', err)
					captureError(err, {
						location: 'LDAPClient',
						type: 'group_search_bind_error',
						extra: { userDN }
					})
					reject(new Error('Failed to bind with service account'))
					return
				}

				const searchOptions: ldap.SearchOptions = {
					filter: `(member=${escapeLDAPFilterValue(userDN)})`,
					scope: 'sub' as const,
					attributes: ['dn', 'cn'],
					timeLimit: 5 // 5 seconds timeout for search
				}

				console.log('LDAP Group Search Options:', JSON.stringify(searchOptions, null, 2))

				this.client.search(this.config.baseDN, searchOptions, (err: Error | null, res: ldap.SearchCallbackResponse) => {
					if (err) {
						clearTimeout(timeout)
						console.error('LDAP search error:', err)
						captureError(err, {
							location: 'LDAPClient',
							type: 'group_search_error',
							extra: { userDN }
						})
						reject(new Error('Failed to search for groups'))
						return
					}

					const groups: string[] = []

					res.on('searchEntry', (entry: ldap.SearchEntry) => {
						const rawDN = entry.dn.toString()
						const dn = decodeLDAPDN(rawDN)
						const cn = entry.attributes.find(attr => attr.type === 'cn')?.values[0]
						if (!cn) return
						console.log('Found group DN (raw):', rawDN)
						console.log('Found group DN (decoded):', dn)
						console.log('Found group CN:', cn)
						// Add both the full DN and the CN to the groups array
						groups.push(dn)
						if (cn) {
							groups.push(cn)
						}
					})

					res.on('error', (err: Error) => {
						clearTimeout(timeout)
						console.error('LDAP search error:', err)
						captureError(err, {
							location: 'LDAPClient',
							type: 'group_search_error',
							extra: { userDN }
						})
						reject(new Error('Error during group search'))
					})

					res.on('end', () => {
						clearTimeout(timeout)
						console.log('All found groups:', groups)
						resolve(groups)
					})
				})
			})
		})
	}
} 