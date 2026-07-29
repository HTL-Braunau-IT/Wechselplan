import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { denyUnlessAccess } from '@/lib/api-guard'

/**
 * GET /api/health
 *
 * Unauthenticated liveness/readiness probe for the container healthcheck and
 * for the deploy workflow's post-rollout gate. It deliberately exposes nothing
 * beyond "the process is up and can reach its database" — no env values, no
 * row counts, no version detail that is not already public in the UI header.
 */
export const dynamic = 'force-dynamic'

export async function GET() {
  const denied = await denyUnlessAccess('public')
  if (denied) return denied

  try {
    await prisma.$queryRaw`SELECT 1`
  } catch {
    return NextResponse.json({ status: 'error', database: 'unreachable' }, { status: 503 })
  }

  return NextResponse.json({
    status: 'ok',
    version: process.env.NEXT_PUBLIC_APP_VERSION ?? 'dev',
  })
}
