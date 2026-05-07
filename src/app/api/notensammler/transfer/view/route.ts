import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { isFeatureEnabled } from '@/lib/entitlements'
import { env } from '~/env'
import { captureError } from '@/lib/sentry'
import { badRequest, forbidden, ok, serverError, unauthorized } from '@/lib/api-response'

type NotenmanagementTokenResponse = {
  expires_in: number
  access_token?: string
}

type NotenmanagementNote = {
  Matrikelnummer: number
  Nachname: string
  Vorname: string
  Note: number
  Punkte: number
  Kommentar: string
}

async function getNotenmanagementAccessToken(
  username: string,
  password: string
): Promise<{ token: string; expiresIn: number }> {
  const tokenUrl = new URL('Token', env.NOTENMANAGEMENT_BASE_URL).toString()
  const body = new URLSearchParams({
    grant_type: 'password',
    username,
    password,
  })

  const res = await fetch(tokenUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  })

  const data = (await res.json()) as NotenmanagementTokenResponse
  if (!res.ok || !data.access_token) {
    throw new Error('Notenmanagement authentication failed')
  }
  return {
    token: data.access_token,
    expiresIn: data.expires_in ?? 3600, // Default to 1 hour if not provided
  }
}

export async function POST(request: Request) {
  try {
    const session = await getServerSession(authOptions)
    const username = session?.user?.name
    if (!username) {
      return unauthorized('Unauthorized')
    }
    if (session.user?.role !== 'teacher' && session.user?.role !== 'admin') {
      return forbidden('Forbidden')
    }
    if (!(await isFeatureEnabled('notensammler'))) {
      return forbidden('Feature not available')
    }
    if (!(await isFeatureEnabled('notenmgmt_htl'))) {
      return forbidden('Feature not available')
    }

    const body = (await request.json()) as {
      lfId?: unknown
      username?: unknown
      password?: unknown
      token?: unknown
    }

    if (typeof body.lfId !== 'string' || !body.lfId) {
      return badRequest('Invalid lfId')
    }
    if (typeof body.username !== 'string' || !body.username) {
      return badRequest('Username required')
    }

    const lfId = body.lfId
    const nmUsername = body.username
    const password = typeof body.password === 'string' ? body.password : null
    const providedToken = typeof body.token === 'string' ? body.token : null

    if (!providedToken && !password) {
      return badRequest('Either token or password is required')
    }

    // Use provided token or get new one with password
    let accessToken: string
    let tokenExpiresIn: number | undefined
    if (providedToken) {
      accessToken = providedToken
    } else {
      if (!password) {
        return badRequest('Password required when token is not provided')
      }
      const tokenData = await getNotenmanagementAccessToken(nmUsername, password)
      accessToken = tokenData.token
      tokenExpiresIn = tokenData.expiresIn
    }

    // Fetch LF data from Notenmanagement
    const getUrl = new URL(
      `api/LFs/${encodeURIComponent(lfId)}/Noten?sort=Nachname|Vorname`,
      env.NOTENMANAGEMENT_BASE_URL
    ).toString()

    const res = await fetch(getUrl, {
      headers: {
        Authorization: `bearer ${accessToken}`,
      },
    })

    if (!res.ok) {
      const errorText = await res.text()
      return serverError('Failed to fetch LF data from Notenmanagement', errorText)
    }

    const data = (await res.json()) as NotenmanagementNote[]
    const notes = Array.isArray(data) ? data : []

    return ok({
      success: true,
      notes,
      // Include token data if a new token was generated
      ...(tokenExpiresIn && { token: accessToken, tokenExpiresIn }),
    })
  } catch (error) {
    captureError(error, {
      location: 'api/notensammler/transfer/view',
      type: 'view',
    })
    return serverError(error instanceof Error ? error.message : 'Failed to fetch LF data')
  }
}

