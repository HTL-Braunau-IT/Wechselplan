'use client'

import { useState } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
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
import { Loader2 } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { ScheduleOverview } from '@/components/schedule-overview'
import { Spinner } from '@/components/ui/spinner'

import type { ScheduleResponse, ScheduleTime, BreakTime } from '@/types/types'

const GROUP_COLORS = [
  'bg-yellow-200', // Gruppe 1
  'bg-green-200',  // Gruppe 2
  'bg-blue-200',   // Gruppe 3
  'bg-red-200',    // Gruppe 4
];

const DARK_GROUP_COLORS = [
  'dark:bg-yellow-900/60',
  'dark:bg-green-900/60',
  'dark:bg-blue-900/60',
  'dark:bg-red-900/60',
];

/**
 * Displays a centered loading spinner and a localized loading message.
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
 * Displays the class schedule overview page, enabling users to view group assignments, teacher schedules, rotation planning, and export the schedule as a PDF.
 *
 * Fetches and presents group and teacher assignments, rotation turns, class leadership information, and additional schedule details for a selected class. Provides actions to save teacher rotations and generate a downloadable PDF. Handles loading and error states, and manages navigation after user actions.
 *
 * @returns The React UI for managing and exporting the class schedule overview.
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

  // Save handler for teacher rotation (if needed)
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

  async function handleGenerateExcel() {
    setGeneratingExcel(true);
    try {
      const export_response = await fetch(`/api/export/excel?className=${classId}&selectedWeekday=${weekday}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      });
      const today = new Date().toLocaleDateString('de-DE');
      if (!export_response.ok) throw new Error('Failed to export Excel');
      const blob = await export_response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${classId} - ${getWeekday()} Notenliste - ${today}.xlsm`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);

    } catch (err) {
      console.error('Error generating Excel:', err);
    } finally {
      setGeneratingExcel(false);
    }
  }

  async function handleGenerateSchedulePDF() {
    setGeneratingSchedulePDF(true);
    try {
      const export_response = await fetch(`/api/export/schedule-dates?className=${classId}&selectedWeekday=${weekday}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      });

      if (!export_response.ok) throw new Error('Failed to export PDF');

      const today = new Date().toLocaleDateString('de-DE');
      const blob = await export_response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${classId} - TURNUSTAGE ${getWeekday()} - ${today}-.pdf`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    } catch (err) {
      console.error('Error generating PDF:', err);
      setError('Failed to generate PDF.');
    } finally {
      setGeneratingSchedulePDF(false);
    }
  }

  async function handleGeneratePdf() {
    setGeneratingPdf(true);
    try {
      const export_response = await fetch(`/api/export?className=${classId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      });

      if (!export_response.ok) {
        const error = new Error('Failed to export schedule');
        captureError(error, {
          location: 'schedule/create/overview',
          type: 'export-schedule'
        })
        throw new Error('Failed to export schedule');
      }

      // Handle PDF download
      const today = new Date().toLocaleDateString('de-DE');
      const blob = await export_response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${classId} - ${getWeekday()} Wechselplan - ${today}.pdf`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);

      // Only close the dialog after successful download
      setShowPdfDialog(true);
      await handleGenerateSchedulePDF();
      await handleGenerateExcel();
    } catch (err) {
      console.error('Error generating PDF:', err);
      captureFrontendError(err, {
        location: 'schedule/create/overview',
        type: 'generate-pdf'
      });
      setError('Failed to generate PDF.');
    } finally {
      setGeneratingPdf(false);
    }
  }

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

  function getWeekday() {
    const days = ['Sonntag', 'Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag'];
    return weekday === undefined ? '' : days[weekday];
  }

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
