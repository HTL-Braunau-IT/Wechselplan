import { NextResponse } from 'next/server'
import { hasRole } from '@/lib/auth'
import { getEnabledFeatures } from '@/lib/entitlements'
import { requireAccess } from '@/lib/api-guard'

/**
 * GET /api/entitlements/health
 * Admin-only. Verifies the entitlements client can return a feature list (from cache or license server).
 * Returns { ok: true, features: [...] } or an error. Useful for debugging license server connectivity.
 */
export async function GET() {
  const gate = await requireAccess('session')
  if (!gate.ok) return gate.response

  const session = gate.session
  if (!session?.user?.name) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const isAdmin = session.user?.role === 'admin' || (await hasRole(session.user.name, 'admin'))
  if (!isAdmin) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  try {
    const features = await getEnabledFeatures()
    return NextResponse.json({ ok: true, features })
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : 'Unknown error' },
      { status: 500 },
    )
  }
}
