import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { captureError } from '@/lib/sentry'
import { denyUnlessAccess } from '@/lib/api-guard'
import { resolveSessionTeacher } from '@/lib/session-teacher'

/**
 * The Teacher record belonging to the signed-in user.
 *
 * Clients used to derive this themselves by calling
 * `/api/teachers/by-username?username=<session.user.name>`. After the Entra
 * migration `session.user.name` is the display name ("Anna Müller"), which does
 * not match the `username` stored from the UPN — the lookup 404s and the caller
 * silently behaves as if the user were not a teacher. `resolveSessionTeacher`
 * keys on the Entra object id first, so it resolves the same account either way.
 *
 * Returns `{ teacher: null }` with a 200 rather than a 404: an admin with no
 * Teacher row is a normal state, not an error the caller must handle.
 */
export async function GET() {
  const denied = await denyUnlessAccess('staff')
  if (denied) return denied

  try {
    const session = await getServerSession(authOptions)
    const teacher = await resolveSessionTeacher(session)

    if (!teacher) return NextResponse.json({ teacher: null })

    return NextResponse.json({
      teacher: {
        id: teacher.id,
        firstName: teacher.firstName,
        lastName: teacher.lastName,
        username: teacher.username,
        email: teacher.email,
      },
    })
  } catch (error) {
    captureError(error, { location: 'api/teachers/me', type: 'resolve-session-teacher' })
    return NextResponse.json({ error: 'Failed to resolve teacher' }, { status: 500 })
  }
}
