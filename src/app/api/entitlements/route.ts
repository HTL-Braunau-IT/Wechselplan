import { NextResponse } from 'next/server'
import { requireAccess } from '@/lib/api-guard'
import { isNotenmanagementConfigured } from '@/lib/notenmanagement/config'

/**
 * GET /api/entitlements
 *
 * Deprecated compatibility stub. The licence server is gone and every module is
 * always on; this answers in the old shape so a client that still reads it
 * (e.g. an older Wechselplan-App build) keeps showing all features. The web UI
 * no longer calls it. Remove once no client depends on it.
 */
export async function GET() {
  const gate = await requireAccess('session')
  if (!gate.ok) return gate.response

  const features = ['base', 'notensammler', 'student_photos', 'noten']
  if (isNotenmanagementConfigured()) features.push('notenmgmt_htl')
  return NextResponse.json({ features })
}
