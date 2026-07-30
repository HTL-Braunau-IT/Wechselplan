import { prisma } from '@/lib/prisma'

/**
 * App-wide notification settings (singleton row id = 1).
 *
 * Currently just the master switch for the daily e-mail digest of
 * unacknowledged in-app notifications (issue #96). Kept as a singleton to match
 * the other admin-editable settings (Directory sync, Notenmanagement) rather
 * than as a per-teacher preference — the school wanted one switch they control.
 */

const SETTINGS_ID = 1

export interface NotificationSettingsView {
  emailDigestEnabled: boolean
  lastDigestRunAt: string | null
  lastDigestStatus: string | null
  lastDigestSummary: unknown
}

async function ensureRow() {
  return prisma.notificationSettings.upsert({
    where: { id: SETTINGS_ID },
    create: { id: SETTINGS_ID },
    update: {},
  })
}

/** The current settings, creating the row on first read. */
export async function getNotificationSettings(): Promise<NotificationSettingsView> {
  const row = await ensureRow()
  return {
    emailDigestEnabled: row.emailDigestEnabled,
    lastDigestRunAt: row.lastDigestRunAt?.toISOString() ?? null,
    lastDigestStatus: row.lastDigestStatus ?? null,
    lastDigestSummary: row.lastDigestSummary ?? null,
  }
}

/** Flips the e-mail digest master switch. */
export async function setEmailDigestEnabled(enabled: boolean): Promise<NotificationSettingsView> {
  await prisma.notificationSettings.upsert({
    where: { id: SETTINGS_ID },
    create: { id: SETTINGS_ID, emailDigestEnabled: enabled },
    update: { emailDigestEnabled: enabled },
  })
  return getNotificationSettings()
}

/** Whether the digest feature is switched on. Cheap read used by the digest run. */
export async function isEmailDigestEnabled(): Promise<boolean> {
  const row = await ensureRow()
  return row.emailDigestEnabled
}

/** Records the outcome of a digest run for the admin settings page. */
export async function recordDigestRun(params: {
  runAt: Date
  status: string
  summary: unknown
}): Promise<void> {
  await prisma.notificationSettings.upsert({
    where: { id: SETTINGS_ID },
    create: {
      id: SETTINGS_ID,
      lastDigestRunAt: params.runAt,
      lastDigestStatus: params.status,
      lastDigestSummary: params.summary as never,
    },
    update: {
      lastDigestRunAt: params.runAt,
      lastDigestStatus: params.status,
      lastDigestSummary: params.summary as never,
    },
  })
}
