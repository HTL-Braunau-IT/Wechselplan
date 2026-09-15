export const runtime = 'nodejs'

import { NextResponse } from 'next/server'
import { z } from 'zod'
import { requireAccess } from '@/lib/api-guard'
import { prisma } from '@/lib/prisma'
import { resolveSessionTeacher } from '@/lib/session-teacher'

/**
 * /api/push/register — the native app registers (POST) or removes (DELETE) an
 * Expo push token for the signed-in teacher's device.
 *
 * Tier is `session`: any signed-in user may register their own device. A caller
 * without a Teacher row (e.g. an admin) is a no-op rather than an error — there
 * is no teacher to attach the token to. See src/lib/push.ts for sending.
 */

const registerSchema = z.object({
  token: z.string().min(1),
  platform: z.string().max(20).optional(),
})

const deleteSchema = z.object({
  token: z.string().min(1),
})

export async function POST(request: Request) {
  const gate = await requireAccess('session')
  if (!gate.ok) return gate.response

  const parsed = registerSchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) {
    return NextResponse.json({ error: 'token is required' }, { status: 400 })
  }

  const teacher = await resolveSessionTeacher(gate.session)
  if (!teacher) {
    // No Teacher row to attach the device to (e.g. an admin). Not an error.
    return NextResponse.json({ ok: true, stored: false })
  }

  const { token, platform } = parsed.data
  await prisma.pushToken.upsert({
    where: { token },
    create: { token, teacherId: teacher.id, platform: platform ?? null },
    update: { teacherId: teacher.id, platform: platform ?? null, lastUsedAt: new Date() },
  })

  return NextResponse.json({ ok: true, stored: true })
}

export async function DELETE(request: Request) {
  const gate = await requireAccess('session')
  if (!gate.ok) return gate.response

  const parsed = deleteSchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) {
    return NextResponse.json({ error: 'token is required' }, { status: 400 })
  }

  const teacher = await resolveSessionTeacher(gate.session)
  if (teacher) {
    // Scope the delete to the caller's own token so one user cannot unregister
    // another's device by guessing a token.
    await prisma.pushToken.deleteMany({
      where: { token: parsed.data.token, teacherId: teacher.id },
    })
  }

  return new NextResponse(null, { status: 204 })
}
