'use client'

import { useState } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { useCachedData } from '@/hooks/use-cached-data';
import { useScheduleOverview } from '@/hooks/use-schedule-overview';
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
import { useTranslation } from 'react-i18next'
import { ScheduleOverview } from '@/components/schedule-overview'
import { Spinner } from '@/components/ui/spinner'
import { generatePdf, generateExcel, generateSchedulePDF } from '@/lib/export-utils';


/**
 * Renders a centered loading spinner with a localized loading message.
 */
function LoadingScreen() {
    const { t } = useTranslation()
    return (
        <div className="flex flex-col items-center justify-center min-h-[400px] gap-4">
            <Spinner size="lg" />
            <p className="text-lg text-muted-foreground">{t('schedule.loading')}</p>
        </div>
    )
}

/**
 * Displays the class schedule overview page, enabling users to review group and teacher assignments, manage teacher rotation planning, and export the schedule in PDF or Excel formats.
 *
 * Fetches and presents schedule data for a selected class, including group assignments, rotation turns, class leadership, and additional details. Provides actions to save teacher rotations and export the schedule, handling loading and error states throughout the workflow.
 *
 * @returns The React component for managing, viewing, and exporting the class schedule overview.
 */
export default function OverviewPage() {
  const searchParams = useSearchParams();
  const classId = searchParams.get('class');
  const { isLoading: isLoadingCachedData } = useCachedData();
  const router = useRouter();

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
  } = useScheduleOverview(classId);

  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [showPdfDialog, setShowPdfDialog] = useState(false);
  const [generatingPdf, setGeneratingPdf] = useState(false);
  const [, setGeneratingSchedulePDF] = useState(false);
  const [, setGeneratingExcel] = useState(false);

  /**
   * Saves the teacher rotation schedule for AM and PM periods to the backend and displays the PDF generation dialog upon success.
   *
   * Constructs round-robin teacher assignments for each group and turn, then sends them along with the class ID to the backend API.
   *
   * @throws {Error} If the backend request to save the teacher rotation fails.
   */
  async function handleSaveAndFinish() {
    setSaving(true);
    try {
      // Build round-robin teacher rotation for AM and PM
      const turnKeys = Object.keys(turns);
      const amRotation = groups.map((group, groupIdx) => ({
        groupId: group.id,
        turns: turnKeys.map((_, turnIdx) => {
          const teacherList = uniqueAmTeachers;
          const rotated = rotateArray(teacherList, turnIdx);
          const teacher = rotated[groupIdx];
          return teacher ? teacher.teacherId : null;
        })
      }));
      const pmRotation = groups.map((group, groupIdx) => ({
        groupId: group.id,
        turns: turnKeys.map((_, turnIdx) => {
          const teacherList = uniquePmTeachers;
          const rotated = rotateArray(teacherList, turnIdx);
          const teacher = rotated[groupIdx];
          return teacher ? teacher.teacherId : null;
        })
      }));

      // Save to backend
      const response = await fetch('/api/schedule/teacher-rotation', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          classId,
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
      setError('Failed to save.');
    } finally {
      setSaving(false);
    }
  }

  /**
   * Exports the class schedule and grades as an Excel file for the selected class and weekday.
   *
   * @remark If the export fails, the error is logged to the console and no file is downloaded.
   */
  async function handleGenerateExcel() {
    if (!classId) return;
    setGeneratingExcel(true);
    try {
      await generateExcel(classId, weekday ?? 0);
    } catch (err) {
      console.error('Error generating Excel:', err);
    } finally {
      setGeneratingExcel(false);
    }
  }



  /**
   * Generates and downloads a schedule PDF for the current class and weekday.
   *
   * Displays an error message if PDF generation fails.
   */

  async function handleGenerateSchedulePDF() {
    if (!classId) return;
    setGeneratingSchedulePDF(true);
    try {
      await generateSchedulePDF(classId, weekday ?? 0);
    } catch (err) {
      console.error('Error generating PDF:', err);
      setError('Failed to generate PDF.');
    } finally {
      setGeneratingSchedulePDF(false);
    }
  }

  /**
   * Generates and downloads a PDF export of the class schedule, then sequentially triggers downloads of the schedule PDF and Excel exports for the selected class and weekday.
   *
   * Closes the export dialog and navigates to the home page after successful exports.
   *
   * @remark Does nothing if {@link classId} is missing.
   */
  async function handleGeneratePdf() {
    if (!classId) return;
    setGeneratingPdf(true);
    try {
      await generatePdf(classId, weekday ?? 0);     
      // Only close the dialog after successful download
      await handleGenerateSchedulePDF();
      await handleGenerateExcel();
      setShowPdfDialog(false);
      router.push('/');
    } catch (err) {
      console.error('Error generating PDF:', err);
      setError('Failed to generate PDF.');
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

  if (isLoadingCachedData || overviewLoading) return <LoadingScreen />;
  if (error ?? overviewError) return <div className="p-8 text-center text-red-500">{error ?? overviewError}</div>;

  /**
   * Returns a new array with its elements rotated to the left by the specified number of positions.
   *
   * The rotation is performed in a round-robin fashion, moving the first {@link n} elements to the end of the array.
   *
   * @param arr - The array to rotate.
   * @param n - The number of positions to rotate the array.
   * @returns A new array with elements rotated by {@link n} positions.
   */
  function rotateArray<T>(arr: T[], n: number): T[] {
    const rotated = [...arr];
    for (let i = 0; i < n; i++) {
      const temp = rotated.shift();
      if (temp !== undefined) {
        rotated.push(temp);
      }
    }
    return rotated;
  }

  // Get unique teachers for AM and PM directly from assignments
  const uniqueAmTeachers = amAssignments
    .filter(a => a.teacherId !== 0)
    .filter((a, idx, arr) => arr.findIndex(b => b.teacherId === a.teacherId) === idx);

  const uniquePmTeachers = pmAssignments
    .filter(a => a.teacherId !== 0)
    .filter((a, idx, arr) => arr.findIndex(b => b.teacherId === a.teacherId) === idx);


  return (
    <>
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
      />

      {/* Custom blurred overlay for modal */}
      {showPdfDialog && (
        <div className="fixed inset-0 z-40 backdrop-blur-sm bg-background/80 transition-all" />
      )}
      <Dialog open={showPdfDialog} onOpenChange={setShowPdfDialog}>
        <DialogContent className="z-50">
          <DialogHeader>
            <DialogTitle>PDF erstellen?</DialogTitle>
            <DialogDescription>
              Möchten Sie eine PDF-Version des Stundenplans erstellen und herunterladen?
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="flex gap-2 justify-end">
            <Button
              variant="outline"
              onClick={handleSkipPdf}
              disabled={generatingPdf}
            >
              Überspringen
            </Button>
            <Button
              onClick={handleGeneratePdf}
              disabled={generatingPdf}
            >
              {generatingPdf ? 'Generating...' : 'Generate PDF'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <div className="flex justify-end mt-8">
        <button
          className="bg-primary text-primary-foreground px-6 py-2 rounded hover:bg-primary/90 disabled:opacity-50"
          onClick={handleSaveAndFinish}
          disabled={saving}
        >
          {saving ? 'Saving...' : 'Save & Finish'}
        </button>
      </div>
    </>
  );
}
