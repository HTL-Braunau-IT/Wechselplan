import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { env } from '~/env'
import { captureError } from '@/lib/sentry'

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
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    if (session.user?.role !== 'teacher' && session.user?.role !== 'admin') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
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
    const nmUsername = body.username
    const password = typeof body.password === 'string' ? body.password : null
    const providedToken = typeof body.token === 'string' ? body.token : null

    if (!providedToken && !password) {
      return NextResponse.json({ error: 'Either token or password is required' }, { status: 400 })
    }

    // Use provided token or get new one with password
    let accessToken: string
    let tokenExpiresIn: number | undefined
    if (providedToken) {
      accessToken = providedToken
    } else {
      if (!password) {
        return NextResponse.json({ error: 'Password required when token is not provided' }, { status: 400 })
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
      return NextResponse.json(
        { error: 'Failed to fetch LF data from Notenmanagement', details: errorText },
        { status: 502 }
      )
    }

    const data = (await res.json()) as NotenmanagementNote[]
    const notes = Array.isArray(data) ? data : []

    return NextResponse.json({
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
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to fetch LF data' },
      { status: 500 }
    )
  }
}

