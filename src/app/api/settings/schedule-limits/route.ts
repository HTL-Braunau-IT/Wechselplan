export const runtime = 'nodejs'

import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { getGeneralSettings } from '@/lib/general-settings'
import { captureError } from '@/lib/sentry'
import { ok, unauthorized, serverError } from '@/lib/api-response'

export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session?.user?.name) {
    return unauthorized('Unauthorized')
  }

  try {
    const settings = await getGeneralSettings()
    return ok(settings)
  } catch (error) {
    captureError(error, {
      location: 'api/settings/schedule-limits',
      type: 'get_schedule_limits_error',
    })
    const message = error instanceof Error ? error.message : 'Failed to load schedule limits'
    return serverError(message)
  }
}
