import NextAuth from 'next-auth'
import { type NextAuthOptions } from 'next-auth'
import CredentialsProvider from 'next-auth/providers/credentials'
import AzureADProvider from 'next-auth/providers/azure-ad'
import { LDAPClient } from '@/lib/ldap'
import { prisma } from '@/lib/prisma'
import type { User } from 'next-auth'
import type { SearchEntry } from 'ldapjs'

// Map AD group DNs to app roles
const AD_ROLE_MAP: Record<string, string> = {
  'CN=Admins,OU=Groups,DC=example,DC=com': 'admin',
  'CN=Teachers,OU=Groups,DC=example,DC=com': 'teacher',
  'CN=Students,OU=Groups,DC=example,DC=com': 'student',
}

async function ensureRolesExist() {
  const roles = ['admin', 'teacher', 'student', 'user']
  for (const role of roles) {
    await prisma.role.upsert({
      where: { name: role },
      update: {},
      create: {
        name: role,
        description: `${role.charAt(0).toUpperCase() + role.slice(1)} role`
      }
    })
  }
}

async function saveUserRole(username: string, role: 'admin' | 'teacher' | 'student' | 'user') {
  try {
    console.log('Saving role for user:', { username, role })
    
    // Ensure roles exist
    await ensureRolesExist()
    
    // Get the role ID
    const roleRecord = await prisma.role.findUnique({
      where: { name: role }
    })

    console.log('Found role record:', roleRecord)

    if (!roleRecord) {
      console.error(`Role ${role} not found in database`)
      return
    }

    // Remove existing roles for this user
    console.log('Removing existing roles for user:', username)
    await prisma.userRole.deleteMany({
      where: { userId: username }
    })

    // Create new role assignment
    console.log('Creating new role assignment:', { userId: username, roleId: roleRecord.id })
    const userRole = await prisma.userRole.create({
      data: {
        userId: username,
        roleId: roleRecord.id
      }
    })

    console.log('Created user role:', userRole)
  } catch (error) {
    console.error('Error saving user role:', error)
  }
}

interface LDAPUser extends User {
  role: 'admin' | 'teacher' | 'student' | 'user'
}

async function authenticateLDAP(username: string, password: string) {
  return new Promise<{
    username: string
    firstName: string
    lastName: string
    memberOf: string[]
  } | null>((resolve, reject) => {
    const client = ldap.createClient({
      url: process.env.LDAP_URL ?? '',
      timeout: 5000,
      connectTimeout: 10000,
      idleTimeout: 5000,
      reconnect: true,
      strictDN: false,
      tlsOptions: { rejectUnauthorized: false },
    })

    // Bind as the user
    const userDN = `CN=${username},${process.env.LDAP_USER_SEARCH_BASE ?? ''}`
    client.bind(userDN, password, (err) => {
      if (err) {
        client.unbind()
        return resolve(null)
      }

      // Search for user to get attributes
      const searchOptions: ldap.SearchOptions = {
        filter: `(sAMAccountName=${username})`,
        scope: 'sub',
        attributes: ['givenName', 'sn', 'sAMAccountName', 'memberOf'],
      }
      client.search(process.env.LDAP_USER_SEARCH_BASE ?? '', searchOptions, (err, res) => {
        if (err) {
          client.unbind()
          return resolve(null)
        }
        let found = false
        res.on('searchEntry', (entry: any) => {
          found = true
          const attrs = entry.attributes.reduce((acc: any, attr: any) => {
            acc[attr.type] = attr.vals
            return acc
          }, {})
          resolve({
            username: attrs.sAMAccountName[0],
            firstName: attrs.givenName[0],
            lastName: attrs.sn[0],
            memberOf: attrs.memberOf || [],
          })
        })
        res.on('end', () => {
          client.unbind()
          if (!found) resolve(null)
        })
        res.on('error', () => {
          client.unbind()
          resolve(null)
        })
      })
    })
  })
}

async function assignRolesFromAD(username: string, memberOf: string[]) {
  const allRoles = await prisma.role.findMany()
  const userRolesToAssign: number[] = []
  for (const groupDn of memberOf) {
    const roleName = AD_ROLE_MAP[groupDn]
    if (roleName) {
      const role = allRoles.find(r => r.name === roleName)
      if (role) userRolesToAssign.push(role.id)
    }
  }
  // Remove existing roles for this user
  await prisma.userRole.deleteMany({ where: { userId: username } })
  // Assign new roles
  for (const roleId of userRolesToAssign) {
    await prisma.userRole.create({ data: { userId: username, roleId } })
  }
  // Return role names
  return allRoles.filter(r => userRolesToAssign.includes(r.id)).map(r => r.name)
}

export const authOptions: NextAuthOptions = {
	providers: [
		CredentialsProvider({
			id: 'ldap',
			name: 'LDAP',
			credentials: {
				username: { label: 'Username', type: 'text' },
				password: { label: 'Password', type: 'password' },
			},
			async authorize(credentials) {
				if (!credentials?.username || !credentials?.password) {
					return null
				}

				try {
					const client = new LDAPClient({
						url: process.env.LDAP_URL!,
						baseDN: process.env.LDAP_BASE_DN!,
						bindDN: process.env.LDAP_USERNAME!,
						bindPassword: process.env.LDAP_PASSWORD!,
					})

					const user = await client.authenticate(
						credentials.username,
						credentials.password
					)

					if (!user) {
						return null
					}

					// Check if user is in student or teacher groups
					const studentGroups = process.env.LDAP_STUDENT_GROUPS?.split(',') ?? []
					const teacherGroups = process.env.LDAP_TEACHER_GROUPS?.split(',') ?? []

					const userGroups = await client.getUserGroups(user.dn)
					console.log('User groups from LDAP:', userGroups)
					console.log('Student groups from env:', studentGroups)
					console.log('Teacher groups from env:', teacherGroups)

					const isStudent = userGroups.some((group) =>
						studentGroups.includes(group)
					)
					const isTeacher = userGroups.some((group) =>
						teacherGroups.includes(group)
					)

					console.log('Role determination:', { isStudent, isTeacher })
					const role = isTeacher ? 'teacher' : isStudent ? 'student' : 'user'
					console.log('Assigned role:', role)
					
					// Save the role to the database
					await saveUserRole(credentials.username, role)

					return {
						id: credentials.username,
						name: credentials.username,
						email: user.mail,
						role,
					} as LDAPUser
				} catch (error) {
					console.error('LDAP authentication error:', error)
					return null
				}
			},
		}),
		AzureADProvider({
			clientId: process.env.AZURE_AD_CLIENT_ID!,
			clientSecret: process.env.AZURE_AD_CLIENT_SECRET!,
			tenantId: process.env.AZURE_AD_TENANT_ID,
			authorization: {
				params: {
					scope: 'openid profile email',
				},
			},
		}),
	],
	callbacks: {
		async jwt({ token, user, account }) {
			if (account?.provider === 'azure-ad') {
				// For Microsoft OAuth, we'll get the user's groups from Microsoft Graph API
				// and determine their role based on group membership
				try {
					const response = await fetch(
						'https://graph.microsoft.com/v1.0/me/memberOf',
						{
							headers: {
								Authorization: `Bearer ${account.access_token}`,
							},
						}
					)

					if (response.ok) {
						const data = await response.json()
						const groups = data.value.map((group: { id: string }) => group.id)

						const studentGroups = process.env.MS_STUDENT_GROUPS?.split(',') ?? []
						const teacherGroups = process.env.MS_TEACHER_GROUPS?.split(',') ?? []

						let role: 'admin' | 'teacher' | 'student' | 'user' = 'user'
						if (groups.some((id: string) => teacherGroups.includes(id))) {
							role = 'teacher'
						} else if (groups.some((id: string) => studentGroups.includes(id))) {
							role = 'student'
						}

						// Save the role to the database
						if (token.sub) {
							await saveUserRole(token.sub, role)
						}

						token.role = role
					}
				} catch (error) {
					console.error('Error fetching Microsoft groups:', error)
				}
			}

			if (user) {
				token.role = (user as LDAPUser).role
			}

			return token
		},
		async session({ session, token }) {
			if (session.user) {
				session.user.role = token.role as 'admin' | 'teacher' | 'student'
			}
			return session
		},
	},
	pages: {
		signIn: '/login',
	},
}

const handler = NextAuth(authOptions)
export { handler as GET, handler as POST } 