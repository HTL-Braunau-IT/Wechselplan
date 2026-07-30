import { NextResponse } from 'next/server'
import { getEnabledFeatures } from '@/lib/entitlements'
import { requireAccess } from '@/lib/api-guard'

/**
 * GET /api/entitlements
 * Returns the list of enabled feature keys for this instance (from server-side cache).
 * No secrets are exposed. Optionally only for authenticated users.
 */
export async function GET() {
  const gate = await requireAccess('session')
  if (!gate.ok) return gate.response

  const session = gate.session
  if (!session?.user?.name) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const features = await getEnabledFeatures()
  return NextResponse.json({ features })
}
