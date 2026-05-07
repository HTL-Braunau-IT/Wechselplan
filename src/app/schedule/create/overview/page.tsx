'use client'

import { useState } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { useTranslation } from 'next-i18next';
import { useCachedData } from '@/hooks/use-cached-data';
import { useScheduleOverview } from '@/hooks/use-schedule-overview';
import { useSchoolYear } from '@/contexts/school-year-context';
import { captureFrontendError } from '@/lib/frontend-error'
import { captureError } from '@/lib/sentry'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { ScheduleOverview } from '@/components/schedule-overview'
import { Spinner } from '@/components/ui/spinner'
import { generatePdf, generateSchedulePDF } from '@/lib/export-utils';
import { fetchAndUnwrap, getApiErrorMessage, parseJsonSafe, unwrapData } from '@/lib/api-client'


/**
 * Renders a centered loading spinner with a localized loading message.
 */
function LoadingScreen() {
    const { t } = useTranslation('schedule')
    return (
        <div className="flex flex-col items-center justify-center min-h-[400px] gap-4">
            <Spinner size="lg" />
            <p className="text-lg text-muted-foreground">{t('loadingOverviewData')}</p>
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
  const searchParams = useSearchParams();
  const { t } = useTranslation('schedule')
  const classId = searchParams.get('class');
  const { isLoading: isLoadingCachedData } = useCachedData();
  const router = useRouter();
  const { selectedYear } = useSchoolYear();
  const schoolYearId = selectedYear?.id;
  const weekdayParam = searchParams.get('weekday');
  const parsedW = weekdayParam ? parseInt(weekdayParam, 10) : NaN;
  const overviewWeekdayOverride =
    !Number.isNaN(parsedW) && parsedW >= 1 && parsedW <= 5 ? parsedW : null;

  const {
    groups,
    amAssignments,
    pmAssignments,
    scheduleTimes,
    breakTimes,
    turns,
    classHead,
    classLead,
    additionalInfo,
    weekday,
    loading: overviewLoading,
    error: overviewError
  } = useScheduleOverview(classId, schoolYearId, overviewWeekdayOverride);

  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [showPdfDialog, setShowPdfDialog] = useState(false);
  const [generatingPdf, setGeneratingPdf] = useState(false);
  const [, setGeneratingSchedulePDF] = useState(false);


  /**
   * Saves the round-robin teacher rotation schedule for AM and PM periods to the backend and, on success, displays the PDF generation dialog.
   *
   * Constructs teacher assignments for each group and turn, then sends them with the class name to the backend API.
   * After successful save, sends email notifications to all teachers included in the rotation.
   *
   * @throws {Error} If saving the teacher rotation to the backend fails.
   */
  async function handleSaveAndFinish() {
    setSaving(true);
    try {
      // Build round-robin teacher rotation for AM and PM
      const turnKeys = Object.keys(turns);
      
      // Helper function to create rotation for a period
      const createRotation = (teachers: typeof uniqueAmTeachers) => {
        return groups.map((group, groupIdx) => ({
          groupId: group.id,
          turns: turnKeys.map((_, turnIdx) => {
            // Calculate which teacher should be assigned to this group for this turn
            // For turns 1-4, 5-8, etc., we want the same pattern
            const normalizedTurn = turnIdx % teachers.length;
            // The teacher index is based on the group and turn offset
            const teacherIndex = (groupIdx - normalizedTurn + teachers.length) % teachers.length;
            const teacher = teachers[teacherIndex];
            return teacher ? teacher.teacherId : null;
          })
        }));
      };

      const amRotation = createRotation(uniqueAmTeachers);
      const pmRotation = createRotation(uniquePmTeachers);

      console.log("classId", classId)  
      // Resolve className to classId if needed
      let resolvedClassId: number
      if (typeof classId === 'string') {
        const classData = await fetchAndUnwrap<{ id: number }>(`/api/classes/get-by-name?name=${classId}`)
        resolvedClassId = classData.id
      } else if (classId === null) {
        throw new Error('Class ID is required')
      } else {
        resolvedClassId = classId
      }

      // Save to backend
      if (schoolYearId == null) {
        throw new Error('School year is required')
      }
      if (weekday == null) {
        throw new Error('Weekday is required')
      }
      const response = await fetch('/api/schedules/rotation', {        
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          classId: resolvedClassId,
          schoolYearId,
          selectedWeekday: weekday,
          turns: turnKeys,
          amRotation,
          pmRotation
        })
      });

      if (!response.ok) {
        const error = new Error('Failed to save teacher rotation');
        captureError(error, {
          location: 'schedule/create/overview',
          type: 'save-overview'
        })
        throw new Error('Failed to save teacher rotation');
      }

      // Send email notifications to all teachers (don't block on this)
      try {
        const allTeacherIds = [
          ...uniqueAmTeachers.map(t => t.teacherId),
          ...uniquePmTeachers.map(t => t.teacherId)
        ].filter((id, index, arr) => arr.indexOf(id) === index); // Remove duplicates

        const scheduleLink = `${window.location.origin}/schedules?class=${classId}`;
        const className = typeof classId === 'string' ? classId : ''
        
        const notifyResponse = await fetch('/api/schedules/notify-teachers', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            classId: resolvedClassId,
            className: className ?? classId?.toString() ?? '',
            teacherIds: allTeacherIds,
            scheduleLink
          })
        });
        if (!notifyResponse.ok) {
          const notifyPayload = await parseJsonSafe(notifyResponse)
          throw new Error(getApiErrorMessage(notifyPayload, 'Failed to notify teachers'))
        }
        const notifyPayload = unwrapData<{ failedEmails?: number; totalTeachers?: number }>(await parseJsonSafe(notifyResponse))
        if ((notifyPayload.failedEmails ?? 0) > 0) {
          console.warn(`Teacher notifications partially failed (${notifyPayload.failedEmails}/${notifyPayload.totalTeachers ?? 0})`)
        }
      } catch (emailError) {
        console.error('Failed to send teacher notifications:', emailError);
        // Don't throw here, we still want to show the PDF dialog
        captureFrontendError(emailError, {
          location: 'schedule/create/overview',
          type: 'notify-teachers',
          extra: {
            classId,
            teacherCount: uniqueAmTeachers.length + uniquePmTeachers.length
          }
        });
      }

      // Show PDF generation dialog
      setShowPdfDialog(true);
    } catch (err) {
      console.error('Error saving teacher rotation:', err);
      captureFrontendError(err, {
        location: 'schedule/create/overview',
        type: 'save-rotation',
        extra: {
          classId,
          turns: Object.keys(turns)
        }
      });
      setError(t('errors.saveOverview'));
    } finally {
      setSaving(false);
    }
  }

  

  async function handleGenerateSchedulePDF() {
    if (!classId) return;
    setGeneratingSchedulePDF(true);
    try {
      await generateSchedulePDF(classId, weekday ?? 0);
    } catch (err) {
      console.error('Error generating PDF:', err);
      setError(t('errors.generatePdf'));
    } finally {
      setGeneratingSchedulePDF(false);
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
    if (!classId) return;
    setGeneratingPdf(true);
    try {
      await generatePdf(classId, weekday ?? 0);     
      // Only close the dialog after successful download
      await handleGenerateSchedulePDF();

      setShowPdfDialog(false);
      router.push('/');
    } catch (err) {
      console.error('Error generating PDF:', err);
      setError(t('errors.generatePdf'));
    } finally {
      setGeneratingPdf(false);
    }
  }

  /**
   * Closes the PDF export dialog and navigates to the home page without generating a PDF.
   */
  function handleSkipPdf() {
    setShowPdfDialog(false);
    router.push('/');
  }

  function handleBack() {
    const wq = weekday != null ? `&weekday=${weekday}` : ''
    router.push(`/schedule/create/times?class=${classId}${wq}`)
  }

  if (isLoadingCachedData || overviewLoading) return <LoadingScreen />;
  if (error ?? overviewError) return <div className="p-8 text-center text-red-500">{error ?? overviewError}</div>;


  const uniqueAmTeachers = amAssignments
    .filter(a => a.teacherId !== 0)
    .filter((a, idx, arr) => arr.findIndex(b => b.teacherId === a.teacherId) === idx);

  const uniquePmTeachers = pmAssignments
    .filter(a => a.teacherId !== 0)
    .filter((a, idx, arr) => arr.findIndex(b => b.teacherId === a.teacherId) === idx);


  return (
    <>
      <div className="mb-4 rounded-lg border bg-muted/50 p-4 text-sm text-muted-foreground">
        {t('help.overview')}
      </div>
      <ScheduleOverview
        groups={groups}
        amAssignments={amAssignments}
        pmAssignments={pmAssignments}
        scheduleTimes={scheduleTimes}
        breakTimes={breakTimes}
        turns={turns}
        classHead={classHead}
        classLead={classLead}
        additionalInfo={additionalInfo}
        weekday={weekday}
        className={classId ?? undefined}
        showExportButtons={true}
      />

      <Dialog open={showPdfDialog} onOpenChange={setShowPdfDialog}>
        <DialogContent className="z-50">
          <DialogHeader>
            <DialogTitle>{t('pdfDialog.title')}</DialogTitle>
            <DialogDescription>
              {t('pdfDialog.description')}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="flex gap-2 justify-end">
            <Button
              variant="outline"
              onClick={handleSkipPdf}
              disabled={generatingPdf}
            >
              {t('pdfDialog.skip')}
            </Button>
            <Button
              onClick={handleGeneratePdf}
              disabled={generatingPdf}
            >
              {generatingPdf ? t('pdfDialog.generating') : t('pdfDialog.generate')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <div className="mt-8 flex justify-end gap-4">
        <Button variant="outline" onClick={handleBack}>
          {t('back')}
        </Button>
        <Button onClick={handleSaveAndFinish} disabled={saving}>
          {saving ? t('saving') : t('finish')}
        </Button>
      </div>
    </>
  );
}
