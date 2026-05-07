import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { getEnabledFeatures } from '@/lib/entitlements'
import { ok, unauthorized } from '@/lib/api-response'

/**
 * GET /api/entitlements
 * Returns the list of enabled feature keys for this instance (from server-side cache).
 * No secrets are exposed. Optionally only for authenticated users.
 */
export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session?.user?.name) {
    return unauthorized('Unauthorized')
  }

  const features = await getEnabledFeatures()
  return ok({ features })
}
