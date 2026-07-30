import type { Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { decryptSecret, encryptSecret } from '@/lib/crypto'

/**
 * Notenmanagement integration settings (singleton row id = 1).
 *
 * Stores the service Lehrer account used for the unattended Matrikelnummer link
 * sync. The password is encrypted at rest ({@link encryptSecret}); it is only
 * ever decrypted server-side to mint an NM token and is never returned to the
 * client. Individual teachers' credentials are never stored — the grade
 * transfer authenticates as the teacher for the duration of one request.
 */

const SETTINGS_ID = 1

export interface NotenmanagementSettingsView {
  serviceUsername: string | null
  /** Whether a service password is stored, without revealing it. */
  hasServicePassword: boolean
  lastLinkSyncAt: string | null
  lastLinkSyncStatus: string | null
  lastLinkSyncSummary: unknown
}

async function ensureRow() {
  return prisma.notenmanagementSettings.upsert({
    where: { id: SETTINGS_ID },
    create: { id: SETTINGS_ID },
    update: {},
  })
}

/** Client-safe view of the settings — never includes the password. */
export async function getNotenmanagementSettings(): Promise<NotenmanagementSettingsView> {
  const row = await ensureRow()
  return {
    serviceUsername: row.serviceUsername ?? null,
    hasServicePassword: Boolean(row.servicePasswordEnc),
    lastLinkSyncAt: row.lastLinkSyncAt?.toISOString() ?? null,
    lastLinkSyncStatus: row.lastLinkSyncStatus ?? null,
    lastLinkSyncSummary: row.lastLinkSyncSummary ?? null,
  }
}

export interface ServiceCredentialsUpdate {
  /** New username. Omit to leave unchanged. */
  username?: string
  /**
   * New password. Omit to leave the stored one unchanged; pass an empty string
   * to clear it.
   */
  password?: string
}

/** Update the service-account username and/or password. */
export async function updateServiceCredentials(update: ServiceCredentialsUpdate): Promise<void> {
  await ensureRow()
  const data: Prisma.NotenmanagementSettingsUpdateInput = {}
  if (update.username !== undefined) {
    data.serviceUsername = update.username.trim() || null
  }
  if (update.password !== undefined) {
    data.servicePasswordEnc = update.password ? encryptSecret(update.password) : null
  }
  if (Object.keys(data).length === 0) return
  await prisma.notenmanagementSettings.update({ where: { id: SETTINGS_ID }, data })
}

export interface ServiceCredentials {
  username: string
  password: string
}

/** Decrypt the stored service credentials, or null when not fully configured. */
export async function getServiceCredentials(): Promise<ServiceCredentials | null> {
  const row = await prisma.notenmanagementSettings.findUnique({ where: { id: SETTINGS_ID } })
  if (!row?.serviceUsername || !row.servicePasswordEnc) return null
  return { username: row.serviceUsername, password: decryptSecret(row.servicePasswordEnc) }
}

/** Persist the outcome of a link-sync run for display in the admin UI. */
export async function recordLinkSyncRun(status: string, summary: unknown): Promise<void> {
  await ensureRow()
  await prisma.notenmanagementSettings.update({
    where: { id: SETTINGS_ID },
    data: {
      lastLinkSyncAt: new Date(),
      lastLinkSyncStatus: status,
      lastLinkSyncSummary: (summary ?? null) as Prisma.InputJsonValue,
    },
  })
}
