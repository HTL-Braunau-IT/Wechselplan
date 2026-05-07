import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions, hasRole } from '@/lib/auth'
import { getEnabledFeatures } from '@/lib/entitlements'
import { forbidden, ok, serverError, unauthorized } from '@/lib/api-response'

/**
 * GET /api/entitlements/health
 * Admin-only. Verifies the entitlements client can return a feature list (from cache or license server).
 * Returns { ok: true, features: [...] } or an error. Useful for debugging license server connectivity.
 */
export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session?.user?.name) {
    return unauthorized('Unauthorized')
  }
  const isAdmin = session.user?.role === 'admin' || (await hasRole(session.user.name, 'admin'))
  if (!isAdmin) {
    return forbidden('Forbidden')
  }

  try {
    const features = await getEnabledFeatures()
    return ok({ ok: true, features })
  } catch (err) {
    return serverError(err instanceof Error ? err.message : 'Unknown error', { ok: false })
  }
}
