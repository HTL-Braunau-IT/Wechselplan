import { prisma } from './prisma'

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