import { prisma } from '@/lib/prisma'
import { captureError } from '@/lib/sentry'

export type SyncMode = 'hybrid' | 'nightly_only'
export type StudentPhotoSourcePriority = 'manual_first' | 'o365_first'

export interface DirectorySyncSettings {
  syncedClassGroupIds: string[]
  syncMode: SyncMode
  syncEnabled: boolean
  studentPhotoSourcePriority: StudentPhotoSourcePriority
  teacherPhotoSourcePriority: StudentPhotoSourcePriority
  lastSyncAt: Date | null
  lastSyncStatus: string | null
  lastSyncSummary: unknown | null
}

const SETTINGS_ROW_ID = 1

function parseCsvEnv(value: string | undefined): string[] {
  return (value ?? '')
    .split(',')
    .map(entry => entry.trim())
    .filter(Boolean)
}

function parseSyncMode(value: string | undefined | null): SyncMode {
  return value === 'nightly_only' ? 'nightly_only' : 'hybrid'
}

function parseSyncEnabled(value: string | undefined): boolean {
  if (value === undefined) return false
  const normalized = value.trim().toLowerCase()
  return ['1', 'true', 'on', 'yes'].includes(normalized)
}

function parseStudentPhotoSourcePriority(
  value: string | undefined | null,
): StudentPhotoSourcePriority {
  return value === 'o365_first' ? 'o365_first' : 'manual_first'
}

function envFallbackSettings(): DirectorySyncSettings {
  return {
    syncedClassGroupIds: parseCsvEnv(process.env.ENTRA_SYNC_CLASS_GROUP_IDS),
    syncMode: parseSyncMode(process.env.ENTRA_SYNC_MODE),
    syncEnabled: parseSyncEnabled(process.env.ENTRA_SYNC_ENABLED),
    studentPhotoSourcePriority: parseStudentPhotoSourcePriority(
      process.env.ENTRA_STUDENT_PHOTO_SOURCE_PRIORITY,
    ),
    teacherPhotoSourcePriority: parseStudentPhotoSourcePriority(
      process.env.ENTRA_TEACHER_PHOTO_SOURCE_PRIORITY,
    ),
    lastSyncAt: null,
    lastSyncStatus: null,
    lastSyncSummary: null,
  }
}

/**
 * Returns the current directory sync settings.
 *
 * Reads from the DB singleton row first. If no DB row exists (first run),
 * falls back to env defaults. The env fallback is only used for bootstrap;
 * once settings are persisted via {@link updateDirectorySyncSettings}, the
 * DB value is always authoritative.
 */
export async function getDirectorySyncSettings(): Promise<DirectorySyncSettings> {
  try {
    const row = await prisma.directorySyncSettings.findUnique({
      where: { id: SETTINGS_ROW_ID },
    })

    if (!row) {
      return envFallbackSettings()
    }
    const rowWithPhotoSettings = row as typeof row & {
      studentPhotoSourcePriority?: string | null
      teacherPhotoSourcePriority?: string | null
    }

    return {
      syncedClassGroupIds: row.syncedClassGroupIds ?? [],
      syncMode: parseSyncMode(row.syncMode),
      syncEnabled: row.syncEnabled,
      studentPhotoSourcePriority: parseStudentPhotoSourcePriority(
        rowWithPhotoSettings.studentPhotoSourcePriority,
      ),
      teacherPhotoSourcePriority: parseStudentPhotoSourcePriority(
        rowWithPhotoSettings.teacherPhotoSourcePriority,
      ),
      lastSyncAt: row.lastSyncAt,
      lastSyncStatus: row.lastSyncStatus,
      lastSyncSummary: row.lastSyncSummary as unknown,
    }
  } catch (error) {
    captureError(error, {
      location: 'directory-sync-settings',
      type: 'get_settings_error',
    })
    return envFallbackSettings()
  }
}

/**
 * Convenience accessor used in auth path to decide whether a user
 * belongs to a configured class group.
 */
export async function getSyncedClassGroupIds(): Promise<string[]> {
  const settings = await getDirectorySyncSettings()
  return settings.syncedClassGroupIds
}

const GROUP_ID_CACHE_TTL_MS = 60_000
let cachedGroupIds: { value: string[]; expiresAt: number } | null = null

/**
 * Same as {@link getSyncedClassGroupIds}, but memoised for a minute.
 *
 * The sign-in path needs this on every authentication; without the cache each
 * login adds a settings query. A minute of staleness is acceptable because the
 * admin UI changes this list rarely and a newly added class group only delays
 * that class's first login by up to a minute.
 */
export async function getSyncedClassGroupIdsCached(): Promise<string[]> {
  const now = Date.now()
  if (cachedGroupIds && now < cachedGroupIds.expiresAt) {
    return cachedGroupIds.value
  }

  const value = await getSyncedClassGroupIds()
  cachedGroupIds = { value, expiresAt: now + GROUP_ID_CACHE_TTL_MS }
  return value
}

/** Drops the memoised group ids so the next read hits the DB. */
export function invalidateSyncedClassGroupIdsCache(): void {
  cachedGroupIds = null
}

export interface DirectorySyncSettingsUpdate {
  syncedClassGroupIds?: string[]
  syncMode?: SyncMode
  syncEnabled?: boolean
  studentPhotoSourcePriority?: StudentPhotoSourcePriority
  teacherPhotoSourcePriority?: StudentPhotoSourcePriority
}

/**
 * Upserts the singleton settings row.
 * Only the fields present in {@link update} are changed.
 */
export async function updateDirectorySyncSettings(
  update: DirectorySyncSettingsUpdate,
): Promise<DirectorySyncSettings> {
  const cleanedGroupIds = update.syncedClassGroupIds
    ?.map(id => id.trim())
    .filter(Boolean)

  invalidateSyncedClassGroupIdsCache()

  const row = await prisma.directorySyncSettings.upsert({
    where: { id: SETTINGS_ROW_ID },
    update: {
      ...(cleanedGroupIds !== undefined ? { syncedClassGroupIds: cleanedGroupIds } : {}),
      ...(update.syncMode !== undefined ? { syncMode: update.syncMode } : {}),
      ...(update.syncEnabled !== undefined ? { syncEnabled: update.syncEnabled } : {}),
      ...(update.studentPhotoSourcePriority !== undefined
        ? { studentPhotoSourcePriority: update.studentPhotoSourcePriority }
        : {}),
      ...(update.teacherPhotoSourcePriority !== undefined
        ? { teacherPhotoSourcePriority: update.teacherPhotoSourcePriority }
        : {}),
    } as never,
    create: {
      id: SETTINGS_ROW_ID,
      syncedClassGroupIds: cleanedGroupIds ?? parseCsvEnv(process.env.ENTRA_SYNC_CLASS_GROUP_IDS),
      syncMode: update.syncMode ?? parseSyncMode(process.env.ENTRA_SYNC_MODE),
      syncEnabled: update.syncEnabled ?? parseSyncEnabled(process.env.ENTRA_SYNC_ENABLED),
      studentPhotoSourcePriority:
        update.studentPhotoSourcePriority ??
        parseStudentPhotoSourcePriority(process.env.ENTRA_STUDENT_PHOTO_SOURCE_PRIORITY),
      teacherPhotoSourcePriority:
        update.teacherPhotoSourcePriority ??
        parseStudentPhotoSourcePriority(process.env.ENTRA_TEACHER_PHOTO_SOURCE_PRIORITY),
    } as never,
  })
  const rowWithPhotoSettings = row as typeof row & {
    studentPhotoSourcePriority?: string | null
    teacherPhotoSourcePriority?: string | null
  }

  return {
    syncedClassGroupIds: row.syncedClassGroupIds ?? [],
    syncMode: parseSyncMode(row.syncMode),
    syncEnabled: row.syncEnabled,
    studentPhotoSourcePriority: parseStudentPhotoSourcePriority(
      rowWithPhotoSettings.studentPhotoSourcePriority,
    ),
    teacherPhotoSourcePriority: parseStudentPhotoSourcePriority(
      rowWithPhotoSettings.teacherPhotoSourcePriority,
    ),
    lastSyncAt: row.lastSyncAt,
    lastSyncStatus: row.lastSyncStatus,
    lastSyncSummary: row.lastSyncSummary as unknown,
  }
}

/**
 * Records metadata about the most recent sync run. Used by the sync worker.
 */
export async function recordSyncRun(result: {
  status: 'success' | 'partial' | 'failed'
  summary: unknown
}): Promise<void> {
  try {
    await prisma.directorySyncSettings.upsert({
      where: { id: SETTINGS_ROW_ID },
      update: {
        lastSyncAt: new Date(),
        lastSyncStatus: result.status,
        lastSyncSummary: result.summary as never,
      },
      create: {
        id: SETTINGS_ROW_ID,
        syncedClassGroupIds: parseCsvEnv(process.env.ENTRA_SYNC_CLASS_GROUP_IDS),
        syncMode: parseSyncMode(process.env.ENTRA_SYNC_MODE),
        syncEnabled: parseSyncEnabled(process.env.ENTRA_SYNC_ENABLED),
        studentPhotoSourcePriority: parseStudentPhotoSourcePriority(
          process.env.ENTRA_STUDENT_PHOTO_SOURCE_PRIORITY,
        ),
        teacherPhotoSourcePriority: parseStudentPhotoSourcePriority(
          process.env.ENTRA_TEACHER_PHOTO_SOURCE_PRIORITY,
        ),
        lastSyncAt: new Date(),
        lastSyncStatus: result.status,
        lastSyncSummary: result.summary as never,
      } as never,
    })
  } catch (error) {
    captureError(error, {
      location: 'directory-sync-settings',
      type: 'record_sync_run_error',
    })
  }
}
