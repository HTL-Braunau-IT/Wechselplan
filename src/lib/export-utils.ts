import { captureError } from '@/lib/sentry'
import { captureFrontendError } from '@/lib/frontend-error'

/**
 * Generates and downloads a schedule overview PDF for the specified class and weekday.
 *
 * Initiates a POST request to the schedule export API and triggers a browser download of the resulting PDF file, naming it with the class ID, German weekday name, and current date.
 *
 * @param classId - The identifier of the class for which to generate the schedule.
 * @param weekday - The weekday number (0 for Sonntag through 6 for Samstag).
 *
 * @throws {Error} If the PDF export fails or the download cannot be initiated.
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
    a.download = `${classId} - TURNUSTAGE ${getWeekday(weekday)} - ${today}.pdf`;
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
 * Generates and downloads an Excel file containing the grade list for a specific class, weekday, and teacher.
 *
 * Sends a POST request to the backend to retrieve the grade list as an Excel file, then triggers a browser download with a filename including the class ID and teacher.
 *
 * @param classId - Identifier of the class for which to generate the Excel file.
 * @param weekday - Numeric representation of the weekday (0 for Sunday through 6 for Saturday).
 * @param teacher - Name or identifier of the teacher whose grade list is being exported.
 *
 * @returns A promise that resolves when the Excel file download is initiated.
 *
 * @throws {Error} If the export request fails or the file cannot be generated.
 */
export async function generateExcel(classId: string, weekday: number, teacher: string) {
  try {
    const export_response = await fetch(`/api/export/notenliste?className=${classId}&selectedWeekday=${weekday}&teacher=${teacher}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    });
    
    if (!export_response.ok) throw new Error('Failed to export Excel');
    

    const blob = await export_response.blob();
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${classId} - Notenliste - ${teacher}.xlsm`;
    document.body.appendChild(a);
    a.click();
    window.URL.revokeObjectURL(url);
    document.body.removeChild(a);
  } catch (err) {
    console.error('Error generating Excel:', err);
    captureFrontendError(err, {
      location: 'schedule/create/overview',
      type: 'generate-excel'
    });
    throw new Error('Failed to generate Excel.');
  }
}

/**
 * Generates and downloads the main schedule PDF for a given class and weekday.
 *
 * Initiates a POST request to the `/api/export` endpoint with the specified class ID, then downloads the resulting PDF file with a filename containing the class ID, German weekday name, and current date.
 *
 * @param classId - The identifier of the class for which to generate the schedule PDF.
 * @param weekday - The weekday number (0 for Sonntag through 6 for Samstag).
 *
 * @throws {Error} If the export request fails or the PDF cannot be generated.
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
 * Returns the German name of the weekday for a given number.
 *
 * @param weekday - The weekday number, where 0 represents Sunday and 6 represents Saturday.
 * @returns The German name of the weekday, or 'Unbekannt' if the number is outside the 0–6 range.
 */
function getWeekday(weekday: number): string {
  const days = ['Sonntag', 'Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag'];
  return days[weekday] ?? 'Unbekannt';
} 