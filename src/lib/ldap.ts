import * as ldap from 'ldapjs'

interface LDAPConfig {
	url: string
	baseDN: string
	bindDN: string
	bindPassword: string
}

interface LDAPUser {
	dn: string
	displayName: string
	mail: string
}

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

export class LDAPClient {
	private client: ldap.Client
	private config: LDAPConfig

	constructor(config: LDAPConfig) {
		this.config = config
		this.client = ldap.createClient({
			url: config.url,
		})
	}

	async authenticate(username: string, password: string): Promise<LDAPUser | null> {
		return new Promise((resolve, reject) => {
			// First bind with the service account
			this.client.bind(this.config.bindDN, this.config.bindPassword, (err: Error | null) => {
				if (err) {
					console.error('LDAP bind error:', err)
					reject(new Error('Failed to bind with service account'))
					return
				}

				// Search for the user
				const searchOptions: ldap.SearchOptions = {
					filter: `(sAMAccountName=${escapeLDAPFilterValue(username)})`,
					scope: 'sub' as const,
					attributes: ['dn', 'displayName', 'mail'],
				}

				console.log('LDAP Search Options:', JSON.stringify(searchOptions, null, 2))

				this.client.search(this.config.baseDN, searchOptions, (err: Error | null, res: ldap.SearchCallbackResponse) => {
					if (err) {
						console.error('LDAP search error:', err)
						reject(new Error('Failed to search for user'))
						return
					}

					let user: LDAPUser | null = null

					res.on('searchEntry', (entry: ldap.SearchEntry) => {
						const attributes = entry.attributes
						const rawDN = entry.dn.toString()
						const dn = decodeLDAPDN(rawDN)
						console.log('Found user DN (raw):', rawDN)
						console.log('Found user DN (decoded):', dn)
						user = {
							dn,
							displayName: attributes.find(attr => attr.type === 'displayName')?.values[0] as string,
							mail: attributes.find(attr => attr.type === 'mail')?.values[0] as string,
						}
					})

					res.on('error', (err: Error) => {
						console.error('LDAP search error:', err)
						reject(new Error('Error during user search'))
					})

					res.on('end', () => {
						if (!user) {
							resolve(null)
							return
						}

						// Try to bind with the user's credentials
						console.log('Attempting to bind with DN:', user.dn)
						this.client.bind(user.dn, password, (err: Error | null) => {
							if (err) {
								console.error('LDAP user bind error:', err)
								resolve(null)
								return
							}
							resolve(user)
						})
					})
				})
			})
		})
	}

	async getUserGroups(userDN: string): Promise<string[]> {
		return new Promise((resolve, reject) => {
			this.client.bind(this.config.bindDN, this.config.bindPassword, (err: Error | null) => {
				if (err) {
					console.error('LDAP bind error:', err)
					reject(new Error('Failed to bind with service account'))
					return
				}

				const searchOptions: ldap.SearchOptions = {
					filter: `(member=${escapeLDAPFilterValue(userDN)})`,
					scope: 'sub' as const,
					attributes: ['dn', 'cn'],
				}

				console.log('LDAP Group Search Options:', JSON.stringify(searchOptions, null, 2))

				this.client.search(this.config.baseDN, searchOptions, (err: Error | null, res: ldap.SearchCallbackResponse) => {
					if (err) {
						console.error('LDAP search error:', err)
						reject(new Error('Failed to search for groups'))
						return
					}

					const groups: string[] = []

					res.on('searchEntry', (entry: ldap.SearchEntry) => {
						const rawDN = entry.dn.toString()
						const dn = decodeLDAPDN(rawDN)
						const cn = entry.attributes.find(attr => attr.type === 'cn')?.values[0] as string
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
						console.error('LDAP search error:', err)
						reject(new Error('Error during group search'))
					})

					res.on('end', () => {
						console.log('All found groups:', groups)
						resolve(groups)
					})
				})
			})
		})
	}
} 