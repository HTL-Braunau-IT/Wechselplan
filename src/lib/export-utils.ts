import { captureError } from '@/lib/sentry'
import { captureFrontendError } from '@/lib/frontend-error'

/**
 * Generates and downloads a PDF of the schedule overview.
 * @param classId - The ID of the class to generate the schedule for
 * @param weekday - The weekday number (0-6)
 * @returns Promise that resolves when the PDF is generated and downloaded
 */
export async function generateSchedulePDF(classId: string, weekday: number) {
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
    a.download = `${classId} - TURNUSTAGE ${getWeekday(weekday)} - ${today}-.pdf`;
    document.body.appendChild(a);
    a.click();
    window.URL.revokeObjectURL(url);
    document.body.removeChild(a);
  } catch (err) {
    console.error('Error generating PDF:', err);
    throw new Error('Failed to generate PDF.');
  }
}

/**
 * Generates and downloads an Excel file of the schedule.
 * @param classId - The ID of the class to generate the Excel for
 * @param weekday - The weekday number (0-6)
 * @returns Promise that resolves when the Excel is generated and downloaded
 */
export async function generateExcel(classId: string, weekday: number) {
  try {
    const export_response = await fetch(`/api/export/excel?className=${classId}&selectedWeekday=${weekday}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    });
    
    if (!export_response.ok) throw new Error('Failed to export Excel');
    
    const today = new Date().toLocaleDateString('de-DE');
    const blob = await export_response.blob();
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${classId} - ${getWeekday(weekday)} Notenliste - ${today}.xlsm`;
    document.body.appendChild(a);
    a.click();
    window.URL.revokeObjectURL(url);
    document.body.removeChild(a);
  } catch (err) {
    console.error('Error generating Excel:', err);
    throw new Error('Failed to generate Excel.');
  }
}

/**
 * Generates and downloads the main schedule PDF and triggers additional exports.
 * @param classId - The ID of the class to generate the schedule for
 * @param weekday - The weekday number (0-6)
 * @returns Promise that resolves when all exports are complete
 */
export async function generatePdf(classId: string, weekday: number) {
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

    const today = new Date().toLocaleDateString('de-DE');
    const blob = await export_response.blob();
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${classId} - ${getWeekday(weekday)} Wechselplan - ${today}.pdf`;
    document.body.appendChild(a);
    a.click();
    window.URL.revokeObjectURL(url);
    document.body.removeChild(a);

  } catch (err) {
    console.error('Error generating PDF:', err);
    captureFrontendError(err, {
      location: 'schedule/create/overview',
      type: 'generate-pdf'
    });
    throw new Error('Failed to generate PDF.');
  }
}

/**
 * Helper function to get the weekday name in German
 * @param weekday - The weekday number (0-6)
 * @returns The name of the weekday in German
 */
function getWeekday(weekday: number): string {
  const days = ['Sonntag', 'Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag'];
  return days[weekday] ?? 'Unbekannt';
} 