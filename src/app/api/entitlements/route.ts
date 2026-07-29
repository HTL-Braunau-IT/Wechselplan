import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { getEnabledFeatures } from '@/lib/entitlements'
import { denyUnlessAccess } from '@/lib/api-guard'

/**
 * GET /api/entitlements
 * Returns the list of enabled feature keys for this instance (from server-side cache).
 * No secrets are exposed. Optionally only for authenticated users.
 */
export async function GET() {
  const denied = await denyUnlessAccess('session')
  if (denied) return denied

  const session = await getServerSession(authOptions)
  if (!session?.user?.name) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const features = await getEnabledFeatures()
  return NextResponse.json({ features })
}
