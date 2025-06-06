import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { captureError } from '@/lib/sentry'

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const userId = searchParams.get('userId')

    if (!userId) {
      return NextResponse.json(
        { error: 'User ID is required' },
        { status: 400 }
      )
    }

    const userRoles = await prisma.userRole.findMany({
      where: {
        userId
      },
      include: {
        role: true
      }
    })

    return NextResponse.json(userRoles)
  } catch (error) {
    console.error('Error fetching user roles:', error)
    captureError(error, {
      location: 'api/user-roles',
      type: 'fetch-user-roles',
      extra: {
        searchParams: Object.fromEntries(new URL(request.url).searchParams)
      }
    })
    return NextResponse.json(
      { error: 'Failed to fetch user roles' },
      { status: 500 }
    )
  }
}

export async function POST(request: Request) {
  try {
    const { userId, roleId } = await request.json()

    if (!userId || !roleId) {
      return NextResponse.json(
        { error: 'User ID and Role ID are required' },
        { status: 400 }
      )
    }

    // Check if the role exists
    const role = await prisma.role.findUnique({
      where: { id: roleId }
    })

    if (!role) {
      return NextResponse.json(
        { error: 'Role not found' },
        { status: 404 }
      )
    }

    // Check if the user exists (either as a teacher or student)
    const teacher = await prisma.teacher.findUnique({
      where: { username: userId }
    })

    const student = await prisma.student.findUnique({
      where: { username: userId }
    })

    if (!teacher && !student) {
      return NextResponse.json(
        { error: 'User not found' },
        { status: 404 }
      )
    }

    // Create the user role assignment
    const userRole = await prisma.userRole.create({
      data: {
        userId,
        roleId
      },
      include: {
        role: true
      }
    })

    return NextResponse.json(userRole)
  } catch (error) {
    console.error('Error assigning role to user:', error)
    captureError(error, {
      location: 'api/user-roles',
      type: 'assign-role',
      extra: {
        requestBody: await request.text()
      }
    })
    return NextResponse.json(
      { error: 'Failed to assign role to user' },
      { status: 500 }
    )
  }
}

export async function DELETE(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const userId = searchParams.get('userId')
    const roleId = searchParams.get('roleId')

    if (!userId || !roleId) {
      return NextResponse.json(
        { error: 'User ID and Role ID are required' },
        { status: 400 }
      )
    }

    await prisma.userRole.delete({
      where: {
        userId_roleId: {
          userId,
          roleId: parseInt(roleId)
        }
      }
    })

    return NextResponse.json({ message: 'Role assignment removed successfully' })
  } catch (error) {
    console.error('Error removing role assignment:', error)
    captureError(error, {
      location: 'api/user-roles',
      type: 'remove-role',
      extra: {
        requestBody: await request.text()
      }
    })
    return NextResponse.json(
      { error: 'Failed to remove role assignment' },
      { status: 500 }
    )
  }
} 