import { timingSafeEqual } from 'node:crypto'
import { NextResponse } from 'next/server'
import type { Session } from 'next-auth'
import type { Teacher } from '@prisma/client'
import { resolveSessionTeacher } from '@/lib/session-teacher'

/**
 * Server-to-server auth for the Online-Shell integration
 * (`/api/integrations/online-shell/*`).
 *
 * Online-Shell is a separate app with its own Entra sign-in; it calls these
 * routes from its server with a shared secret (`ONLINE_SHELL_API_SECRET`) and
 * names the teacher it acts for. Without the secret set the routes stay off —
 * they never fall back to running unauthenticated.
 */
export function denyUnlessOnlineShell(request: Request): Response | null {
  const configured = process.env.ONLINE_SHELL_API_SECRET?.trim()
  if (!configured) {
    return NextResponse.json(
      { error: 'Online-Shell integration is not configured (ONLINE_SHELL_API_SECRET is unset).' },
      { status: 503 },
    )
  }
  const header = request.headers.get('x-online-shell-secret')
  const bearer = request.headers.get('authorization')?.replace(/^Bearer\s+/i, '')
  const presented = (header ?? bearer ?? '').trim()
  const a = Buffer.from(presented)
  const b = Buffer.from(configured)
  // Compare lengths first; timingSafeEqual throws on a length mismatch.
  if (!presented || a.length !== b.length || !timingSafeEqual(a, b)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  return null
}

export type IntegrationTeacherRef = { oid?: string | null; email?: string | null }

/**
 * The active Teacher an integration call acts for, matched like a signed-in
 * session: Entra object id first, then the e-mail (local part as username, then
 * the full address). Null when nobody matches or the teacher is deactivated.
 */
export async function resolveIntegrationTeacher(
  ref: IntegrationTeacherRef | null | undefined,
): Promise<Teacher | null> {
  const oid = typeof ref?.oid === 'string' ? ref.oid.trim() : ''
  const email = typeof ref?.email === 'string' ? ref.email.trim() : ''
  if (!oid && !email) return null
  const teacher = await resolveSessionTeacher({
    user: { id: oid, email, name: '' },
    expires: '',
  } as unknown as Session)
  return teacher?.isActive ? teacher : null
}
