import { Button } from '@/components/ui/button'
import { Spinner } from '@/components/ui/spinner'

interface Props {
  onPdfExport: () => void
  onPdfDateExport: () => void
  onExcelAmExport: () => void
  onExcelPmExport: () => void
  savingPdf: boolean
  savingPdfDate: boolean
  savingExcelAm: boolean
  savingExcelPm: boolean
  showExcelAm: boolean
  showExcelPm: boolean
}

export function ScheduleExportActions({
  onPdfExport,
  onPdfDateExport,
  onExcelAmExport,
  onExcelPmExport,
  savingPdf,
  savingPdfDate,
  savingExcelAm,
  savingExcelPm,
  showExcelAm,
  showExcelPm
}: Props) {
  return (
    <div className="flex items-center gap-2 mt-4">
      <Button onClick={onPdfExport} disabled={savingPdf}>
        {savingPdf ? 'Exporting PDF...' : 'PDF Export'}
      </Button>
      <Button onClick={onPdfDateExport} disabled={savingPdfDate}>
        {savingPdfDate ? 'Exporting PDF Datum ...' : 'PDF Datum Export'}
      </Button>
      {showExcelAm && (
        <Button
          className="bg-primary text-primary-foreground hover:bg-primary/90"
          onClick={onExcelAmExport}
          disabled={savingExcelAm}
        >
          {savingExcelAm ? (
            <>
              <Spinner size="sm" />
              Exporting AM Excel ...
            </>
          ) : 'Export Notenliste Vormittag'}
        </Button>
      )}
      {showExcelPm && (
        <Button
          className="bg-primary text-primary-foreground hover:bg-primary/90"
          onClick={onExcelPmExport}
          disabled={savingExcelPm}
        >
          {savingExcelPm ? (
            <>
              <Spinner size="sm" />
              Exporting PM Excel ...
            </>
          ) : 'Export Notenliste Nachmittag'}
        </Button>
      )}
    </div>
  )
}
