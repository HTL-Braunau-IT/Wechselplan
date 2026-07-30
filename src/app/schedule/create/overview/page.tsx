'use client'

import { useState } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import { useTranslation } from 'next-i18next'
import { useUnsavedWarning } from '@/hooks/use-unsaved-warning'
import { useCachedData } from '@/hooks/use-cached-data'
import { useScheduleOverview } from '@/hooks/use-schedule-overview'
import { captureFrontendError } from '@/lib/frontend-error'
import { captureError } from '@/lib/sentry'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { ScheduleOverview } from '@/components/schedule-overview'
import { Spinner } from '@/components/ui/spinner'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { PageContainer } from '@/components/ui/page-container'
import { WizardFooter } from '@/components/schedule/wizard-footer'
import { AlertCircle, ArrowLeft, Check, FileDown } from 'lucide-react'
import { generatePdf, generateSchedulePDF } from '@/lib/export-utils'
import { buildRotationForSave } from '@/lib/rotation'
import { useSchoolYear } from '@/contexts/school-year-context'

/**
 * Renders a centered loading spinner with a localized loading message.
 */
function LoadingScreen() {
  const { t } = useTranslation('schedule')
  return (
    <div className="flex min-h-[400px] flex-col items-center justify-center gap-4">
      <Spinner size="lg" />
      <p className="text-muted-foreground text-lg">{t('loadingData')}</p>
    </div>
  )
}

/**
 * Renders the class schedule overview page, allowing users to review group and teacher assignments, manage teacher rotation planning, and export the schedule as a PDF.
 *
 * Fetches and displays schedule data for a selected class, including group assignments, rotation turns, class leadership, and additional details. Handles saving teacher rotations, exporting the schedule, and managing loading and error states throughout the workflow.
 *
 * @returns The React component for managing, viewing, and exporting the class schedule overview.
 */
export default function OverviewPage() {
  const { t } = useTranslation('schedule')
  const searchParams = useSearchParams()
  const classId = searchParams.get('class')
  const weekdayParam = searchParams.get('weekday')
  const urlWeekday = weekdayParam ? Number(weekdayParam) : undefined
  const { isLoading: isLoadingCachedData } = useCachedData()
  const { selectedYear } = useSchoolYear()
  const schoolYearId = selectedYear?.id
  const router = useRouter()

  const {
    groups,
    amAssignments,
    pmAssignments,
    scheduleTimes,
    breakTimes,
    turns,
    amTurns,
    pmTurns,
    classHead,
    classLead,
    additionalInfo,
    weekday,
    loading: overviewLoading,
    error: overviewError,
  } = useScheduleOverview(classId, schoolYearId, urlWeekday)

  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  // Until the rotation is saved via "Save & Finish", leaving loses that final step.
  const [finished, setFinished] = useState(false)
  const [showPdfDialog, setShowPdfDialog] = useState(false)
  const [generatingPdf, setGeneratingPdf] = useState(false)
  const [, setGeneratingSchedulePDF] = useState(false)

  useUnsavedWarning(!finished)

  /**
   * Saves the round-robin teacher rotation schedule for AM and PM periods to the backend and, on success, displays the PDF generation dialog.
   *
   * Constructs teacher assignments for each group and turn, then sends them with the class name to the backend API.
   * After successful save, sends email notifications to all teachers included in the rotation.
   *
   * @throws {Error} If saving the teacher rotation to the backend fails.
   */
  async function handleSaveAndFinish() {
    setSaving(true)
    try {
      // Build round-robin teacher rotation for AM and PM using the shared helper,
      // so the persisted rotation always matches the on-screen preview. AM and PM
      // are independent lanes, so each rotates over its OWN Turnus count.
      const amTurnKeys = Object.keys(amTurns)
      const pmTurnKeys = Object.keys(pmTurns)
      const amRotation = buildRotationForSave(
        groups,
        uniqueAmTeachers.map(t => t.teacherId),
        amTurnKeys.length,
      )
      const pmRotation = buildRotationForSave(
        groups,
        uniquePmTeachers.map(t => t.teacherId),
        pmTurnKeys.length,
      )

      // Resolve className to classId if needed
      let resolvedClassId: number
      if (typeof classId === 'string') {
        const classRes = await fetch(`/api/classes/get-by-name?name=${classId}`)
        if (!classRes.ok) throw new Error('Failed to fetch class ID')
        const classData = (await classRes.json()) as { id: number }
        resolvedClassId = classData.id
      } else if (classId === null) {
        throw new Error('Class ID is required')
      } else {
        resolvedClassId = classId
      }

      // Save to backend — weekday- and year-scoped, with each lane's own Turnusse.
      const response = await fetch('/api/schedules/rotation', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          classId: resolvedClassId,
          selectedWeekday: urlWeekday ?? weekday,
          ...(schoolYearId != null ? { schoolYearId } : {}),
          amTurns: amTurnKeys,
          pmTurns: pmTurnKeys,
          amRotation,
          pmRotation,
        }),
      })

      if (!response.ok) {
        const error = new Error('Failed to save teacher rotation')
        captureError(error, {
          location: 'schedule/create/overview',
          type: 'save-overview',
        })
        throw new Error('Failed to save teacher rotation')
      }

      // Send email notifications to all teachers (don't block on this)
      try {
        const allTeacherIds = [
          ...uniqueAmTeachers.map(t => t.teacherId),
          ...uniquePmTeachers.map(t => t.teacherId),
        ].filter((id, index, arr) => arr.indexOf(id) === index) // Remove duplicates

        const scheduleLink = `${window.location.origin}/schedules?class=${classId}`
        const className = typeof classId === 'string' ? classId : ''

        await fetch('/api/schedules/notify-teachers', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            classId: resolvedClassId,
            className: className ?? classId?.toString() ?? '',
            teacherIds: allTeacherIds,
            scheduleLink,
          }),
        })
      } catch (emailError) {
        console.error('Failed to send teacher notifications:', emailError)
        // Don't throw here, we still want to show the PDF dialog
        captureFrontendError(emailError, {
          location: 'schedule/create/overview',
          type: 'notify-teachers',
          extra: {
            classId,
            teacherCount: uniqueAmTeachers.length + uniquePmTeachers.length,
          },
        })
      }

      // Rotation is persisted — the wizard is complete; drop the unsaved guard.
      setFinished(true)

      // Show PDF generation dialog
      setShowPdfDialog(true)
    } catch (err) {
      console.error('Error saving teacher rotation:', err)
      captureFrontendError(err, {
        location: 'schedule/create/overview',
        type: 'save-rotation',
        extra: {
          classId,
          turns: Object.keys(turns),
        },
      })
      setError(t('saveFailed'))
    } finally {
      setSaving(false)
    }
  }

  async function handleGenerateSchedulePDF() {
    if (!classId) return
    setGeneratingSchedulePDF(true)
    try {
      await generateSchedulePDF(classId, weekday ?? 0)
    } catch (err) {
      console.error('Error generating PDF:', err)
      setError(t('pdfFailed'))
    } finally {
      setGeneratingSchedulePDF(false)
    }
  }

  /**
   * Generates and downloads a PDF export of the class schedule, then triggers schedule PDF generation for the selected class and weekday.
   *
   * Closes the PDF export dialog and navigates to the home page upon successful completion.
   *
   * @remark Does nothing if the class ID is missing.
   */
  async function handleGeneratePdf() {
    if (!classId) return
    setGeneratingPdf(true)
    try {
      await generatePdf(classId, weekday ?? 0)
      // Only close the dialog after successful download
      await handleGenerateSchedulePDF()

      setShowPdfDialog(false)
      router.push('/')
    } catch (err) {
      console.error('Error generating PDF:', err)
      setError(t('pdfFailed'))
    } finally {
      setGeneratingPdf(false)
    }
  }

  /**
   * Closes the PDF export dialog and navigates to the home page without generating a PDF.
   */
  function handleSkipPdf() {
    setShowPdfDialog(false)
    router.push('/')
  }

  if (isLoadingCachedData || overviewLoading) return <LoadingScreen />
  if (error ?? overviewError)
    return (
      <PageContainer size="wide">
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>{error ?? overviewError}</AlertDescription>
        </Alert>
      </PageContainer>
    )

  const uniqueAmTeachers = amAssignments
    .filter(a => a.teacherId !== 0)
    .filter((a, idx, arr) => arr.findIndex(b => b.teacherId === a.teacherId) === idx)

  const uniquePmTeachers = pmAssignments
    .filter(a => a.teacherId !== 0)
    .filter((a, idx, arr) => arr.findIndex(b => b.teacherId === a.teacherId) === idx)

  return (
    <PageContainer size="wide" className="space-y-6">
      <ScheduleOverview
        groups={groups}
        amAssignments={amAssignments}
        pmAssignments={pmAssignments}
        scheduleTimes={scheduleTimes}
        breakTimes={breakTimes}
        turns={turns}
        amTurns={amTurns}
        pmTurns={pmTurns}
        classHead={classHead}
        classLead={classLead}
        additionalInfo={additionalInfo}
        weekday={weekday}
      />

      <Dialog open={showPdfDialog} onOpenChange={setShowPdfDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('createPdfTitle')}</DialogTitle>
            <DialogDescription>{t('createPdfDescription')}</DialogDescription>
          </DialogHeader>
          <DialogFooter className="flex justify-end gap-2">
            <Button variant="outline" onClick={handleSkipPdf} disabled={generatingPdf}>
              {t('skip')}
            </Button>
            <Button onClick={handleGeneratePdf} disabled={generatingPdf}>
              <FileDown className="h-4 w-4" />
              {generatingPdf ? t('generatingPdf') : t('generatePdf')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <WizardFooter
        back={
          <Button variant="outline" onClick={() => router.back()} disabled={saving}>
            <ArrowLeft className="h-4 w-4" />
            {t('back')}
          </Button>
        }
      >
        <Button onClick={handleSaveAndFinish} disabled={saving}>
          <Check className="h-4 w-4" />
          {saving ? t('finishing') : t('saveAndFinish')}
        </Button>
      </WizardFooter>
    </PageContainer>
  )
}
