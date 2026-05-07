export const runtime = 'nodejs'

import { captureError } from '@/lib/sentry'
import { requireAdmin } from '@/lib/require-admin'
import {
  getDirectorySyncSettings,
  updateDirectorySyncSettings,
  type DirectorySyncSettingsUpdate,
  type SyncMode,
  type StudentPhotoSourcePriority,
} from '@/lib/directory-sync-settings'
import { badRequest, forbidden, ok, serverError } from '@/lib/api-response'

export async function GET() {
  const auth = await requireAdmin()
  if (!auth.ok) {
    return forbidden('Unauthorized: admin role required')
  }

  try {
    const settings = await getDirectorySyncSettings()
    return ok(settings)
  } catch (error) {
    captureError(error, {
      location: 'api/admin/directory-sync-settings',
      type: 'get_directory_sync_settings_error',
    })
    const message = error instanceof Error ? error.message : 'Failed to load sync settings'
    return serverError(message)
  }
}

function isSyncMode(value: unknown): value is SyncMode {
  return value === 'hybrid' || value === 'nightly_only'
}

function isStudentPhotoSourcePriority(value: unknown): value is StudentPhotoSourcePriority {
  return value === 'manual_first' || value === 'o365_first'
}

export async function PUT(request: Request) {
  const auth = await requireAdmin()
  if (!auth.ok) {
    return forbidden('Unauthorized: admin role required')
  }

  try {
    const body = (await request.json().catch(() => ({}))) as {
      syncedClassGroupIds?: unknown
      syncMode?: unknown
      syncEnabled?: unknown
      studentPhotoSourcePriority?: unknown
      teacherPhotoSourcePriority?: unknown
    }

    const update: DirectorySyncSettingsUpdate = {}

    if (body.syncedClassGroupIds !== undefined) {
      if (
        !Array.isArray(body.syncedClassGroupIds) ||
        !body.syncedClassGroupIds.every(id => typeof id === 'string')
      ) {
        return badRequest('syncedClassGroupIds must be an array of strings')
      }
      update.syncedClassGroupIds = body.syncedClassGroupIds as string[]
    }

    if (body.syncMode !== undefined) {
      if (!isSyncMode(body.syncMode)) {
        return badRequest("syncMode must be 'hybrid' or 'nightly_only'")
      }
      update.syncMode = body.syncMode
    }

    if (body.syncEnabled !== undefined) {
      if (typeof body.syncEnabled !== 'boolean') {
        return badRequest('syncEnabled must be a boolean')
      }
      update.syncEnabled = body.syncEnabled
    }

    if (body.studentPhotoSourcePriority !== undefined) {
      if (!isStudentPhotoSourcePriority(body.studentPhotoSourcePriority)) {
        return badRequest("studentPhotoSourcePriority must be 'manual_first' or 'o365_first'")
      }
      update.studentPhotoSourcePriority = body.studentPhotoSourcePriority
    }

    if (body.teacherPhotoSourcePriority !== undefined) {
      if (!isStudentPhotoSourcePriority(body.teacherPhotoSourcePriority)) {
        return badRequest("teacherPhotoSourcePriority must be 'manual_first' or 'o365_first'")
      }
      update.teacherPhotoSourcePriority = body.teacherPhotoSourcePriority
    }

    const settings = await updateDirectorySyncSettings(update)
    return ok(settings)
  } catch (error) {
    captureError(error, {
      location: 'api/admin/directory-sync-settings',
      type: 'update_directory_sync_settings_error',
    })
    const message = error instanceof Error ? error.message : 'Failed to update sync settings'
    return serverError(message)
  }
}
