'use client'

import { useTranslation } from 'react-i18next'
import { Download, FileDown, FileSpreadsheet } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Spinner } from '@/components/ui/spinner'
import type { ScheduleExportKind } from '../_hooks/use-schedule-export'

export type ScheduleExportMenuProps = {
  busy: boolean
  canExcelAm: boolean
  canExcelPm: boolean
  onExport: (kind: ScheduleExportKind) => void
}

/** One labelled export row: a title with a line of explanation underneath. */
function ExportItem({
  icon: Icon,
  title,
  desc,
  onSelect,
}: {
  icon: typeof FileDown
  title: string
  desc: string
  onSelect: () => void
}) {
  return (
    <DropdownMenuItem onSelect={onSelect}>
      <Icon className="mr-2 h-4 w-4 shrink-0" />
      <span className="flex flex-col">
        <span>{title}</span>
        <span className="text-muted-foreground text-xs">{desc}</span>
      </span>
    </DropdownMenuItem>
  )
}

/**
 * The single "Export" control for a class's rotation plan.
 *
 * Replaces the row of up to four equally loud buttons (two PDF variants and,
 * for an assigned teacher, two Excel grade lists) that the page and the overview
 * component each rendered — the page rendered them twice. The two Excel exports
 * are a teacher's own blank grade list, so they only appear for the period the
 * signed-in teacher actually teaches.
 */
export function ScheduleExportMenu({
  busy,
  canExcelAm,
  canExcelPm,
  onExport,
}: ScheduleExportMenuProps) {
  const { t } = useTranslation()

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button disabled={busy}>
          {busy ? <Spinner size="sm" className="mr-2" /> : <Download className="mr-2 h-4 w-4" />}
          {busy ? t('schedules.exporting', 'Wird erstellt...') : t('schedules.export', 'Export')}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-80">
        <ExportItem
          icon={FileDown}
          title={t('schedules.exportPdf', 'Wechselplan (PDF)')}
          desc={t('schedules.exportPdfDesc', 'Gruppen, Lehrer und Turnusse als PDF.')}
          onSelect={() => onExport('pdf')}
        />
        <ExportItem
          icon={FileDown}
          title={t('schedules.exportPdfDated', 'Wechselplan mit Datum (PDF)')}
          desc={t(
            'schedules.exportPdfDatedDesc',
            'Wie der Wechselplan, zusätzlich mit den Terminen je Turnus.',
          )}
          onSelect={() => onExport('pdfDated')}
        />
        {(canExcelAm || canExcelPm) && <DropdownMenuSeparator />}
        {canExcelAm && (
          <ExportItem
            icon={FileSpreadsheet}
            title={t('schedules.exportExcelAm', 'Notenliste Vormittag (Excel)')}
            desc={t('schedules.exportExcelDesc', 'Leere Notenliste deiner Gruppe zum Ausfüllen.')}
            onSelect={() => onExport('excelAm')}
          />
        )}
        {canExcelPm && (
          <ExportItem
            icon={FileSpreadsheet}
            title={t('schedules.exportExcelPm', 'Notenliste Nachmittag (Excel)')}
            desc={t('schedules.exportExcelDesc', 'Leere Notenliste deiner Gruppe zum Ausfüllen.')}
            onSelect={() => onExport('excelPm')}
          />
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
