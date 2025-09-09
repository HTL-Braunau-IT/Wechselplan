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
import { generatePdf, generateSchedulePDF } from '@/lib/export-utils';


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
 * Renders the class schedule overview page, allowing users to review group and teacher assignments, manage teacher rotation planning, and export the schedule as a PDF.
 *
 * Fetches and displays schedule data for a selected class, including group assignments, rotation turns, class leadership, and additional details. Handles saving teacher rotations, exporting the schedule, and managing loading and error states throughout the workflow.
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
      // Save to backend
      const response = await fetch('/api/schedule/teacher-rotation', {        
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          className: classId,
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
        
        await fetch('/api/schedule/notify-teachers', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            classId: parseInt(classId || '0'),
            className: classId,
            teacherIds: allTeacherIds,
            scheduleLink
          })
        });
        
        console.log('Teacher notifications sent successfully');
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
