export const runtime = 'nodejs'

import { NextResponse } from 'next/server'
import { requireAccess } from '@/lib/api-guard'
import { recordError } from '@/lib/error-log'

/**
 * POST /api/client-errors — ingest a browser-side error into the same
 * `ErrorLog` table the server writes to, so admins see server and client
 * failures in one place (Admin → Fehlerprotokoll).
 *
 * Any signed-in user may report (the tier is `session`). Persistence is
 * best-effort; a bad body is a 400, never a 500.
 */
export async function POST(request: Request) {
  const gate = await requireAccess('session')
  if (!gate.ok) return gate.response

  const body = (await request.json().catch(() => null)) as {
    location?: unknown
    type?: unknown
    message?: unknown
    stack?: unknown
    context?: unknown
    path?: unknown
  } | null

  if (
    !body ||
    typeof body.location !== 'string' ||
    typeof body.type !== 'string' ||
    typeof body.message !== 'string'
  ) {
    return NextResponse.json({ error: 'location, type and message are required' }, { status: 400 })
  }

  await recordError({
    source: 'client',
    location: body.location,
    type: body.type,
    message: body.message,
    stack: typeof body.stack === 'string' ? body.stack : null,
    context:
      body.context && typeof body.context === 'object'
        ? (body.context as Record<string, unknown>)
        : null,
    path: typeof body.path === 'string' ? body.path : null,
    actorName: gate.session.user?.name ?? null,
  })

  return NextResponse.json({ ok: true })
}
