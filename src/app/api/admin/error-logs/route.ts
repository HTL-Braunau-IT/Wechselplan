export const runtime = 'nodejs'

import { NextResponse } from 'next/server'
import { requireAccess } from '@/lib/api-guard'
import { captureError } from '@/lib/sentry'
import { prisma } from '@/lib/prisma'
import type { Prisma } from '@prisma/client'

/**
 * GET /api/admin/error-logs — the Fehlerprotokoll feed.
 *
 * Query params: `status` (all | unresolved | resolved, default unresolved),
 * `source` (server | client), `location` (substring), `limit` (default 100).
 */
export async function GET(request: Request) {
  const gate = await requireAccess('admin')
  if (!gate.ok) return gate.response

  try {
    const { searchParams } = new URL(request.url)
    const status = searchParams.get('status') ?? 'unresolved'
    const source = searchParams.get('source')
    const location = searchParams.get('location')?.trim()
    const limit = Math.min(Math.max(Number(searchParams.get('limit')) || 100, 1), 500)

    const where: Prisma.ErrorLogWhereInput = {}
    if (status === 'unresolved') where.acknowledgedAt = null
    else if (status === 'resolved') where.acknowledgedAt = { not: null }
    if (source === 'server' || source === 'client') where.source = source
    if (location) where.location = { contains: location, mode: 'insensitive' }

    const [errors, unresolvedCount] = await Promise.all([
      prisma.errorLog.findMany({
        where,
        orderBy: { lastSeenAt: 'desc' },
        take: limit,
      }),
      prisma.errorLog.count({ where: { acknowledgedAt: null } }),
    ])

    return NextResponse.json({ errors, unresolvedCount })
  } catch (error) {
    captureError(error, { location: 'api/admin/error-logs', type: 'list-errors' })
    return NextResponse.json({ error: 'Failed to load error log' }, { status: 500 })
  }
}

/**
 * PATCH /api/admin/error-logs — acknowledge (resolve) or reopen rows.
 *
 * Body: `{ id, acknowledged }` for one row, or `{ action: 'acknowledgeAll' }`.
 */
export async function PATCH(request: Request) {
  const gate = await requireAccess('admin')
  if (!gate.ok) return gate.response

  try {
    const body = (await request.json().catch(() => null)) as {
      id?: unknown
      acknowledged?: unknown
      action?: unknown
    } | null

    if (body?.action === 'acknowledgeAll') {
      const { count } = await prisma.errorLog.updateMany({
        where: { acknowledgedAt: null },
        data: { acknowledgedAt: new Date() },
      })
      return NextResponse.json({ updated: count })
    }

    if (typeof body?.id !== 'number' || typeof body?.acknowledged !== 'boolean') {
      return NextResponse.json(
        { error: 'id (number) and acknowledged (boolean) required' },
        { status: 400 },
      )
    }

    const updated = await prisma.errorLog.update({
      where: { id: body.id },
      data: { acknowledgedAt: body.acknowledged ? new Date() : null },
    })
    return NextResponse.json(updated)
  } catch (error) {
    captureError(error, { location: 'api/admin/error-logs', type: 'update-error' })
    return NextResponse.json({ error: 'Failed to update error log' }, { status: 500 })
  }
}

/** DELETE /api/admin/error-logs — clear resolved rows (or `?all=true` for all). */
export async function DELETE(request: Request) {
  const gate = await requireAccess('admin')
  if (!gate.ok) return gate.response

  try {
    const clearAll = new URL(request.url).searchParams.get('all') === 'true'
    const { count } = await prisma.errorLog.deleteMany(
      clearAll ? {} : { where: { acknowledgedAt: { not: null } } },
    )
    return NextResponse.json({ deleted: count })
  } catch (error) {
    captureError(error, { location: 'api/admin/error-logs', type: 'clear-errors' })
    return NextResponse.json({ error: 'Failed to clear error log' }, { status: 500 })
  }
}
