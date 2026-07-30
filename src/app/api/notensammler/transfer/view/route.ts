import { NextResponse } from 'next/server'
import { isFeatureEnabled } from '@/lib/entitlements'
import { captureError } from '@/lib/sentry'
import { requireAccess } from '@/lib/api-guard'
import { getNmToken, nmGet, NmApiError } from '@/lib/notenmanagement/server-client'

type NotenmanagementNote = {
  Matrikelnummer: number
  Nachname: string
  Vorname: string
  Note: number
  Punkte: number
  Kommentar: string
}

export async function POST(request: Request) {
  const gate = await requireAccess('staff')
  if (!gate.ok) return gate.response

  try {
    const session = gate.session
    if (!session?.user?.name) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    if (!(await isFeatureEnabled('notensammler'))) {
      return NextResponse.json({ error: 'Feature not available' }, { status: 403 })
    }

    const body = (await request.json()) as {
      lfId?: unknown
      username?: unknown
      password?: unknown
      token?: unknown
    }

    if (typeof body.lfId !== 'string' || !body.lfId) {
      return NextResponse.json({ error: 'Invalid lfId' }, { status: 400 })
    }
    if (typeof body.username !== 'string' || !body.username) {
      return NextResponse.json({ error: 'Username required' }, { status: 400 })
    }

    const lfId = body.lfId
    const password = typeof body.password === 'string' ? body.password : null
    const providedToken = typeof body.token === 'string' ? body.token : null
    if (!providedToken && !password) {
      return NextResponse.json({ error: 'Either token or password is required' }, { status: 400 })
    }

    let accessToken = providedToken
    let tokenExpiresIn: number | undefined
    if (!accessToken) {
      const tokenData = await getNmToken(body.username, password!)
      accessToken = tokenData.token
      tokenExpiresIn = tokenData.expiresIn
    }

    const data = await nmGet<NotenmanagementNote[]>(
      `api/LFs/${encodeURIComponent(lfId)}/Noten?sort=Nachname|Vorname`,
      accessToken,
    )
    const notes = Array.isArray(data) ? data : []

    return NextResponse.json({
      success: true,
      notes,
      ...(tokenExpiresIn && { token: accessToken, tokenExpiresIn }),
    })
  } catch (error) {
    const status = error instanceof NmApiError ? (error.status === 401 ? 401 : 502) : 500
    captureError(error, { location: 'api/notensammler/transfer/view', type: 'view' })
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to fetch LF data' },
      { status },
    )
  }
}
