export const runtime = 'nodejs'

import { NextResponse } from 'next/server'
import { captureError } from '@/lib/sentry'
import { requireAdmin } from '@/lib/require-admin'
import {
  getDirectorySyncSettings,
  updateDirectorySyncSettings,
  type DirectorySyncSettingsUpdate,
  type SyncMode,
  type StudentPhotoSourcePriority,
} from '@/lib/directory-sync-settings'

export async function GET() {
  const auth = await requireAdmin()
  if (!auth.ok) {
    return NextResponse.json({ error: 'Unauthorized: admin role required' }, { status: 403 })
  }

  try {
    const settings = await getDirectorySyncSettings()
    return NextResponse.json(settings)
  } catch (error) {
    captureError(error, {
      location: 'api/admin/directory-sync-settings',
      type: 'get_directory_sync_settings_error',
    })
    const message = error instanceof Error ? error.message : 'Failed to load sync settings'
    return NextResponse.json({ error: message }, { status: 500 })
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
    return NextResponse.json({ error: 'Unauthorized: admin role required' }, { status: 403 })
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
        return NextResponse.json(
          { error: 'syncedClassGroupIds must be an array of strings' },
          { status: 400 },
        )
      }
      update.syncedClassGroupIds = body.syncedClassGroupIds as string[]
    }

    if (body.syncMode !== undefined) {
      if (!isSyncMode(body.syncMode)) {
        return NextResponse.json(
          { error: "syncMode must be 'hybrid' or 'nightly_only'" },
          { status: 400 },
        )
      }
      update.syncMode = body.syncMode
    }

    if (body.syncEnabled !== undefined) {
      if (typeof body.syncEnabled !== 'boolean') {
        return NextResponse.json({ error: 'syncEnabled must be a boolean' }, { status: 400 })
      }
      update.syncEnabled = body.syncEnabled
    }

    if (body.studentPhotoSourcePriority !== undefined) {
      if (!isStudentPhotoSourcePriority(body.studentPhotoSourcePriority)) {
        return NextResponse.json(
          { error: "studentPhotoSourcePriority must be 'manual_first' or 'o365_first'" },
          { status: 400 },
        )
      }
      update.studentPhotoSourcePriority = body.studentPhotoSourcePriority
    }

    if (body.teacherPhotoSourcePriority !== undefined) {
      if (!isStudentPhotoSourcePriority(body.teacherPhotoSourcePriority)) {
        return NextResponse.json(
          { error: "teacherPhotoSourcePriority must be 'manual_first' or 'o365_first'" },
          { status: 400 },
        )
      }
      update.teacherPhotoSourcePriority = body.teacherPhotoSourcePriority
    }

    const settings = await updateDirectorySyncSettings(update)
    return NextResponse.json(settings)
  } catch (error) {
    captureError(error, {
      location: 'api/admin/directory-sync-settings',
      type: 'update_directory_sync_settings_error',
    })
    const message = error instanceof Error ? error.message : 'Failed to update sync settings'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
