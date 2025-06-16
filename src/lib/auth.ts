import { type NextAuthOptions } from 'next-auth'
import CredentialsProvider from 'next-auth/providers/credentials'
import AzureADProvider from 'next-auth/providers/azure-ad'
import { LDAPClient } from '@/lib/ldap'
import { prisma } from '@/lib/prisma'
import type { User } from 'next-auth'
import { captureError } from '@/lib/sentry'

async function ensureRolesExist() {
  try {
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
  } catch (error) {
    console.error('Error ensuring roles exist:', error)
    captureError(error, {
      location: 'auth',
      type: 'ensure_roles_error'
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
      captureError(new Error(`Role ${role} not found in database`), {
        location: 'auth',
        type: 'role_not_found',
        extra: { username, role }
      })
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
    captureError(error, {
      location: 'auth',
      type: 'save_user_role_error',
      extra: { username, role }
    })
  }
}

interface LDAPUser extends User {
  role: 'admin' | 'teacher' | 'student' | 'user'
  firstName?: string | null
  lastName?: string | null
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
            timeout: 3000 // 3 seconds timeout for initial auth
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

          // Create a new client instance for group search to avoid connection issues
          const groupClient = new LDAPClient({
            url: process.env.LDAP_URL!,
            baseDN: process.env.LDAP_BASE_DN!,
            bindDN: process.env.LDAP_USERNAME!,
            bindPassword: process.env.LDAP_PASSWORD!,
            timeout: 3000 // 3 seconds timeout for group search
          })

          const userGroups = await groupClient.getUserGroups(user.dn)
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
          
          // Save the role to the database asynchronously
          saveUserRole(credentials.username, role).catch(error => {
            console.error('Error saving user role:', error)
            captureError(error, {
              location: 'auth',
              type: 'async_save_user_role_error',
              extra: { username: credentials.username, role }
            })
          })

          return {
            id: credentials.username,
            name: credentials.username,
            firstName: user.givenName,
            lastName: user.sn,
            email: user.mail,
            role,
          } as LDAPUser
        } catch (error) {
          console.error('LDAP authentication error:', error)
          captureError(error, {
            location: 'auth',
            type: 'ldap_authentication_error',
            extra: { username: credentials.username }
          })
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
            token.firstName = (user as LDAPUser)?.firstName
            token.lastName = (user as LDAPUser)?.lastName
          } else {
            console.error(`Microsoft Graph API error: ${response.status} ${response.statusText}`)
            captureError(new Error(`Microsoft Graph API returned ${response.status}`), {
              location: 'auth',
              type: 'azure_ad_api_error',
              extra: { 
                status: response.status,
                statusText: response.statusText,
                userId: token.sub 
              }
            })
          }
        } catch (error) {
          console.error('Error fetching Microsoft groups:', error)
          captureError(error, {
            location: 'auth',
            type: 'azure_ad_groups_error',
            extra: { userId: token.sub }
          })
        }
      }

      if (user) {
        token.role = (user as LDAPUser).role
        token.firstName = (user as LDAPUser)?.firstName
        token.lastName = (user as LDAPUser)?.lastName
      }

      return token
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.role = token.role as 'admin' | 'teacher' | 'student'
        session.user.firstName = token.firstName as string | null
        session.user.lastName = token.lastName as string | null
      }
      return session
    },
  },
  pages: {
    signIn: '/login',
  },
}

export async function hasRole(userId: string, roleName: string): Promise<boolean> {
  try {
    const userRole = await prisma.userRole.findFirst({
      where: {
        userId,
        role: {
          name: roleName
        }
      }
    })
    return !!userRole
  } catch (error) {
    console.error('Error checking user role:', error)
    captureError(error, {
      location: 'auth',
      type: 'check_role_error',
      extra: { userId, roleName }
    })
    return false
  }
}

export async function getUserRoles(userId: string): Promise<string[]> {
  try {
    const userRoles = await prisma.userRole.findMany({
      where: {
        userId
      },
      include: {
        role: true
      }
    })
    return userRoles.map(ur => ur.role.name)
  } catch (error) {
    console.error('Error getting user roles:', error)
    captureError(error, {
      location: 'auth',
      type: 'get_user_roles_error',
      extra: { userId }
    })
    return []
  }
}

export async function requireRole(userId: string, roleName: string): Promise<boolean> {
  try {
    const hasRequiredRole = await hasRole(userId, roleName)
    if (!hasRequiredRole) {
      const error = new Error(`User does not have required role: ${roleName}`)
      captureError(error, {
        location: 'auth',
        type: 'missing_required_role',
        extra: { userId, roleName }
      })
      throw error
    }
    return true
  } catch (error) {
    if (error instanceof Error && error.message.includes('required role')) {
      throw error
    }
    captureError(error, {
      location: 'auth',
      type: 'require_role_error',
      extra: { userId, roleName }
    })
    throw error
  }
} 