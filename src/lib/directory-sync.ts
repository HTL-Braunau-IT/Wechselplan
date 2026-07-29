import { captureError } from '@/lib/sentry'
import { getDirectorySyncSettings, recordSyncRun } from '@/lib/directory-sync-settings'
import { applyTeacherSync, type TeacherSyncSummary } from '@/lib/teacher-sync'
import { applyClassStudentSync, type ClassStudentSyncSummary } from '@/lib/class-student-sync'
import { MassDeactivationError, resolveMaxDeactivationRatio } from '@/lib/sync-guard'

export type DirectorySyncTrigger = 'scheduled' | 'manual'

export interface DirectorySyncRunResult {
  status: 'success' | 'partial' | 'skipped' | 'failed'
  trigger: DirectorySyncTrigger
  startedAt: string
  completedAt: string
  /** Present when status is 'skipped'. */
  reason?: string
  teachers?: TeacherSyncSummary
  classesStudents?: ClassStudentSyncSummary
  errors: string[]
}

/**
 * Runs the full directory sync: teachers first, then classes and students.
 *
 * Order matters — class sync resolves head/lead teachers against rows that
 * teacher sync may have just created.
 *
 * Applies everything in the diff, since there is no human to make a selection.
 * The deactivation threshold in lib/sync-guard is what stands in for that
 * review: a run that would retire an implausible share of people fails loudly
 * instead of applying, and the failure is recorded on DirectorySyncSettings.
 */
export async function runFullDirectorySync(
  options: { trigger?: DirectorySyncTrigger; force?: boolean } = {},
): Promise<DirectorySyncRunResult> {
  const trigger = options.trigger ?? 'scheduled'
  const startedAt = new Date().toISOString()
  const errors: string[] = []

  const settings = await getDirectorySyncSettings()

  if (!settings.syncEnabled && !options.force) {
    return {
      status: 'skipped',
      trigger,
      startedAt,
      completedAt: new Date().toISOString(),
      reason: 'Directory sync is disabled in the admin settings.',
      errors,
    }
  }

  if (settings.syncedClassGroupIds.length === 0) {
    return {
      status: 'skipped',
      trigger,
      startedAt,
      completedAt: new Date().toISOString(),
      reason: 'No Entra class groups are configured; nothing to sync.',
      errors,
    }
  }

  const maxDeactivationRatio = resolveMaxDeactivationRatio()

  let teachers: TeacherSyncSummary | undefined
  let classesStudents: ClassStudentSyncSummary | undefined

  // The two scopes are independent: a teacher-group problem should not stop
  // class and student sync from running, so failures are collected rather than
  // thrown.
  try {
    teachers = await applyTeacherSync(undefined, { maxDeactivationRatio })
  } catch (error) {
    errors.push(describeError('teachers', error))
    captureError(error, { location: 'lib/directory-sync', type: 'scheduled_teacher_sync_error' })
  }

  try {
    classesStudents = await applyClassStudentSync(undefined, { maxDeactivationRatio })
  } catch (error) {
    errors.push(describeError('classes/students', error))
    captureError(error, {
      location: 'lib/directory-sync',
      type: 'scheduled_class_student_sync_error',
    })
  }

  const issueCount = (teachers?.issues.length ?? 0) + (classesStudents?.issues.length ?? 0)
  const status: DirectorySyncRunResult['status'] =
    errors.length > 0 && !teachers && !classesStudents
      ? 'failed'
      : errors.length > 0 || issueCount > 0
        ? 'partial'
        : 'success'

  const result: DirectorySyncRunResult = {
    status,
    trigger,
    startedAt,
    completedAt: new Date().toISOString(),
    teachers,
    classesStudents,
    errors,
  }

  // The individual apply calls each record their own scope; this final write is
  // what the admin UI shows as "last run".
  await recordSyncRun({
    status,
    summary: { scope: 'full', ...result },
  })

  return result
}

function describeError(scope: string, error: unknown): string {
  if (error instanceof MassDeactivationError) {
    return `${scope}: ${error.message}`
  }
  return `${scope}: ${error instanceof Error ? error.message : String(error)}`
}
