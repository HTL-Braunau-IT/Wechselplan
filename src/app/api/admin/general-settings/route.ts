export const runtime = 'nodejs'

import { captureError } from '@/lib/sentry'
import { requireAdmin } from '@/lib/require-admin'
import {
  GeneralSettingsValidationError,
  updateGeneralSettings,
} from '@/lib/general-settings'
import { badRequest, forbidden, ok, serverError } from '@/lib/api-response'

export async function PUT(request: Request) {
  const auth = await requireAdmin()
  if (!auth.ok) {
    return forbidden('Unauthorized: admin role required')
  }

  try {
    const body = (await request.json().catch(() => ({}))) as {
      maxStudentsPerGroup?: unknown
      maxScheduleGroups?: unknown
      maxSupportedStudents?: unknown
    }

    const update: {
      maxStudentsPerGroup?: number
      maxScheduleGroups?: number
      maxSupportedStudents?: number
    } = {}

    if (body.maxStudentsPerGroup !== undefined) {
      if (typeof body.maxStudentsPerGroup !== 'number') {
        return badRequest('maxStudentsPerGroup must be a number')
      }
      update.maxStudentsPerGroup = body.maxStudentsPerGroup
    }
    if (body.maxScheduleGroups !== undefined) {
      if (typeof body.maxScheduleGroups !== 'number') {
        return badRequest('maxScheduleGroups must be a number')
      }
      update.maxScheduleGroups = body.maxScheduleGroups
    }
    if (body.maxSupportedStudents !== undefined) {
      if (typeof body.maxSupportedStudents !== 'number') {
        return badRequest('maxSupportedStudents must be a number')
      }
      update.maxSupportedStudents = body.maxSupportedStudents
    }

    if (
      update.maxStudentsPerGroup === undefined &&
      update.maxScheduleGroups === undefined &&
      update.maxSupportedStudents === undefined
    ) {
      return badRequest('No fields to update')
    }

    const settings = await updateGeneralSettings(update)
    return ok(settings)
  } catch (error) {
    if (error instanceof GeneralSettingsValidationError) {
      return badRequest(error.message)
    }
    captureError(error, {
      location: 'api/admin/general-settings',
      type: 'update_general_settings_error',
    })
    const message = error instanceof Error ? error.message : 'Failed to update general settings'
    return serverError(message)
  }
}
