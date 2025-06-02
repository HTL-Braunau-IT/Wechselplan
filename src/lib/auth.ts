import { type NextAuthOptions } from 'next-auth'
import CredentialsProvider from 'next-auth/providers/credentials'
import AzureADProvider from 'next-auth/providers/azure-ad'
import { LDAPClient } from '@/lib/ldap'
import { prisma } from '@/lib/prisma'
import type { User } from 'next-auth'

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
    return []
  }
}

export async function requireRole(userId: string, roleName: string): Promise<boolean> {
  const hasRequiredRole = await hasRole(userId, roleName)
  if (!hasRequiredRole) {
    throw new Error(`User does not have required role: ${roleName}`)
  }
  return true
} 