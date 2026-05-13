import { prisma } from '@/lib/prisma'
import { captureError } from '@/lib/sentry'

import { SCHEDULE_LIMIT_DEFAULTS, type ScheduleLimitValues } from '@/lib/schedule-limits-shared'

const SETTINGS_ROW_ID = 1

export const GENERAL_SETTINGS_DEFAULTS: ScheduleLimitValues = SCHEDULE_LIMIT_DEFAULTS

export type GeneralSettings = ScheduleLimitValues

export interface GeneralSettingsUpdate {
  maxStudentsPerGroup?: number
  maxScheduleGroups?: number
  maxSupportedStudents?: number
}

export class GeneralSettingsValidationError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'GeneralSettingsValidationError'
  }
}

const MIN_GROUPS = 2
const MAX_GROUPS = 10
const MIN_PER_GROUP = 1
const MAX_PER_GROUP = 50

export function validateGeneralSettingsInput(input: {
  maxStudentsPerGroup: number
  maxScheduleGroups: number
  maxSupportedStudents: number
}): string | null {
  if (
    !Number.isInteger(input.maxScheduleGroups) ||
    input.maxScheduleGroups < MIN_GROUPS ||
    input.maxScheduleGroups > MAX_GROUPS
  ) {
    return `maxScheduleGroups must be an integer between ${MIN_GROUPS} and ${MAX_GROUPS}`
  }
  if (
    !Number.isInteger(input.maxStudentsPerGroup) ||
    input.maxStudentsPerGroup < MIN_PER_GROUP ||
    input.maxStudentsPerGroup > MAX_PER_GROUP
  ) {
    return `maxStudentsPerGroup must be an integer between ${MIN_PER_GROUP} and ${MAX_PER_GROUP}`
  }
  if (!Number.isInteger(input.maxSupportedStudents) || input.maxSupportedStudents < 1) {
    return 'maxSupportedStudents must be a positive integer'
  }
  const capacity = input.maxScheduleGroups * input.maxStudentsPerGroup
  if (input.maxSupportedStudents > capacity) {
    return `maxSupportedStudents must not exceed ${capacity} (Gruppen × Schüler je Gruppe)`
  }
  return null
}

/**
 * Returns general app settings (singleton row id = 1).
 * Upserts defaults if the row is missing.
 */
export async function getGeneralSettings(): Promise<GeneralSettings> {
  try {
    const row = await prisma.generalSettings.findUnique({
      where: { id: SETTINGS_ROW_ID },
    })
    if (!row) {
      const created = await prisma.generalSettings.upsert({
        where: { id: SETTINGS_ROW_ID },
        create: {
          id: SETTINGS_ROW_ID,
          ...GENERAL_SETTINGS_DEFAULTS,
        },
        update: {},
      })
      return {
        maxStudentsPerGroup: created.maxStudentsPerGroup,
        maxScheduleGroups: created.maxScheduleGroups,
        maxSupportedStudents: created.maxSupportedStudents,
      }
    }
    return {
      maxStudentsPerGroup: row.maxStudentsPerGroup,
      maxScheduleGroups: row.maxScheduleGroups,
      maxSupportedStudents: row.maxSupportedStudents,
    }
  } catch (error) {
    captureError(error, {
      location: 'general-settings',
      type: 'get_settings_error',
    })
    return { ...GENERAL_SETTINGS_DEFAULTS }
  }
}

export async function updateGeneralSettings(
  update: GeneralSettingsUpdate,
): Promise<GeneralSettings> {
  const current = await getGeneralSettings()
  const next = {
    maxStudentsPerGroup:
      update.maxStudentsPerGroup ?? current.maxStudentsPerGroup,
    maxScheduleGroups: update.maxScheduleGroups ?? current.maxScheduleGroups,
    maxSupportedStudents:
      update.maxSupportedStudents ?? current.maxSupportedStudents,
  }

  const err = validateGeneralSettingsInput(next)
  if (err) {
    throw new GeneralSettingsValidationError(err)
  }

  const row = await prisma.generalSettings.upsert({
    where: { id: SETTINGS_ROW_ID },
    create: {
      id: SETTINGS_ROW_ID,
      ...next,
    },
    update: next,
  })

  return {
    maxStudentsPerGroup: row.maxStudentsPerGroup,
    maxScheduleGroups: row.maxScheduleGroups,
    maxSupportedStudents: row.maxSupportedStudents,
  }
}
