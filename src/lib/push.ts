/**
 * Outbound push notifications to the native app via Expo's push service.
 *
 * The device registers an Expo push token (see /api/push/register). Expo's
 * service is the single delivery hop: we POST messages to `exp.host` and Expo
 * fans them out to APNs (iOS) and FCM (Android) using the credentials uploaded
 * to the EAS project — so there is **no APNs key or FCM secret on this server**.
 *
 * Sending is best-effort and must never throw into a caller: a failed push can
 * never fail the save that triggered the notification (see notifications.ts).
 */

import { prisma } from '@/lib/prisma'
import { captureError } from '@/lib/sentry'

const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send'
const CHUNK_SIZE = 100

export interface PushMessage {
  title: string
  body: string
  data?: Record<string, unknown>
}

interface ExpoTicket {
  status: 'ok' | 'error'
  details?: { error?: string }
}

function chunk<T>(items: readonly T[], size: number): T[][] {
  const out: T[][] = []
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size))
  return out
}

/**
 * Sends one push per registered device of the given teachers. Never throws.
 * Tokens Expo reports as `DeviceNotRegistered` are deleted so the table does not
 * accumulate dead devices.
 */
export async function sendPushToTeachers(
  teacherIds: readonly number[],
  message: PushMessage,
): Promise<void> {
  try {
    const ids = [...new Set(teacherIds)]
    if (ids.length === 0) return

    const rows = await prisma.pushToken.findMany({
      where: { teacherId: { in: ids } },
      select: { token: true },
    })
    const tokens = rows.map(row => row.token)
    if (tokens.length === 0) return

    for (const group of chunk(tokens, CHUNK_SIZE)) {
      const messages = group.map(to => ({
        to,
        title: message.title,
        body: message.body,
        data: message.data,
        sound: 'default' as const,
      }))

      const response = await fetch(EXPO_PUSH_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify(messages),
      })

      if (!response.ok) {
        captureError(new Error(`Expo push responded ${response.status}`), {
          location: 'lib/push',
          type: 'expo_push_http_error',
        })
        continue
      }

      const payload = (await response.json().catch(() => null)) as { data?: ExpoTicket[] } | null
      const tickets = payload?.data ?? []

      // Tickets come back positionally aligned with the messages we sent.
      const dead = group.filter(
        (_token, index) =>
          tickets[index]?.status === 'error' &&
          tickets[index]?.details?.error === 'DeviceNotRegistered',
      )
      if (dead.length > 0) {
        await prisma.pushToken.deleteMany({ where: { token: { in: dead } } })
      }
    }
  } catch (error) {
    captureError(error, { location: 'lib/push', type: 'send_push_error' })
  }
}
