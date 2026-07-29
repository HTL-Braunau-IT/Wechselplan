'use client'

import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { ArrowUpDown, CheckCircle2, Download, FileText, Save, Upload } from 'lucide-react'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { Button } from '@/components/ui/button'
import { Badge, badgeVariants } from '@/components/ui/badge'
import { Spinner } from '@/components/ui/spinner'
import { cn } from '@/lib/utils'
import type { Semester } from '@/lib/grades'
import type { ClassData, SemesterView, SortDirection, SortField } from '../_lib/types'
import type { SaveState } from '../_hooks/use-grade-editing'
import { SaveStatus } from './save-status'

/** One combined sort control instead of a field dropdown plus a direction dropdown. */
const SORT_OPTIONS: Array<{ value: string; field: SortField; direction: SortDirection }> = [
  { value: 'lastName-asc', field: 'lastName', direction: 'asc' },
  { value: 'lastName-desc', field: 'lastName', direction: 'desc' },
  { value: 'groupId-asc', field: 'groupId', direction: 'asc' },
  { value: 'groupId-desc', field: 'groupId', direction: 'desc' },
]

/** Wraps a button in a tooltip — the guidance that used to sit in a "Hinweise" block. */
function Hint({ label, children }: { label: string; children: ReactNode }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>{children}</TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  )
}

export type ClassToolbarProps = {
  classData: ClassData
  currentSemester: Semester | null
  semesterView: SemesterView
  onSemesterViewChange: (view: SemesterView) => void
  sortField: SortField
  sortDirection: SortDirection
  onSortChange: (field: SortField, direction: SortDirection) => void
  saveState: SaveState
  savingAll: boolean
  onSaveAll: () => void
  downloadingPdf: boolean
  onDownloadPdf: () => void
  downloadingAllPdf: boolean
  onDownloadAllPdf: () => void
  canDownloadAllPdf: boolean
  onOpenTransfer: () => void
  onViewLf: (lfId: string) => void
}

/**
 * Working controls for the open class: which semester the grid shows, how it is
 * sorted, whether everything is saved, and the three things a teacher does with
 * a finished list (save, export, transfer).
 *
 * These used to be spread over two rows above the card — a class dropdown next
 * to an unrelated "all classes" export, then a row mixing two checkboxes with
 * three differently-weighted buttons.
 */
export function ClassToolbar({
  classData,
  currentSemester,
  semesterView,
  onSemesterViewChange,
  sortField,
  sortDirection,
  onSortChange,
  saveState,
  savingAll,
  onSaveAll,
  downloadingPdf,
  onDownloadPdf,
  downloadingAllPdf,
  onDownloadAllPdf,
  canDownloadAllPdf,
  onOpenTransfer,
  onViewLf,
}: ClassToolbarProps) {
  const { t } = useTranslation()

  const sortLabels: Record<string, string> = {
    'lastName-asc': `${t('notensammler.sortByLastName', 'Nachname')} (A–Z)`,
    'lastName-desc': `${t('notensammler.sortByLastName', 'Nachname')} (Z–A)`,
    'groupId-asc': `${t('notensammler.sortByGroup', 'Gruppennummer')} ↑`,
    'groupId-desc': `${t('notensammler.sortByGroup', 'Gruppennummer')} ↓`,
  }

  const semesterLabel = (semester: Semester) =>
    semester === 'first'
      ? t('notensammler.firstSemester', '1. Semester')
      : t('notensammler.secondSemester', '2. Semester')

  const transferStatus = classData.transferStatus
  const transferred = (['first', 'second'] as const)
    .map(semester => ({ semester, state: transferStatus?.[semester] }))
    .filter(entry => entry.state?.transferred)

  const exporting = downloadingPdf || downloadingAllPdf

  return (
    <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-3">
      <div className="flex flex-wrap items-center gap-3">
        <Tabs
          value={semesterView}
          onValueChange={value => onSemesterViewChange(value as SemesterView)}
        >
          <TabsList>
            <TabsTrigger value="first">
              {t('notensammler.firstSemesterShort', '1. Sem')}
              {currentSemester === 'first' && (
                <span
                  className="bg-primary ml-1.5 h-1.5 w-1.5 rounded-full"
                  aria-label={t('notensammler.currentSemester', 'Aktuell')}
                />
              )}
            </TabsTrigger>
            <TabsTrigger value="second">
              {t('notensammler.secondSemesterShort', '2. Sem')}
              {currentSemester === 'second' && (
                <span
                  className="bg-primary ml-1.5 h-1.5 w-1.5 rounded-full"
                  aria-label={t('notensammler.currentSemester', 'Aktuell')}
                />
              )}
            </TabsTrigger>
            <TabsTrigger value="both">{t('notensammler.bothSemesters', 'Beide')}</TabsTrigger>
          </TabsList>
        </Tabs>

        {transferred.map(({ semester, state }) => {
          const lfId = state?.lfId
          const label = (
            <>
              <CheckCircle2 className="mr-1 h-3 w-3" />
              {semesterLabel(semester)} {t('notensammler.transferred', 'übertragen')}
              {lfId && <span className="ml-1 font-normal opacity-70">LF {lfId}</span>}
            </>
          )
          return lfId ? (
            <Hint key={semester} label={t('notensammler.viewLf', 'Übertragene Noten ansehen')}>
              <button
                type="button"
                onClick={() => onViewLf(lfId)}
                className={cn(
                  badgeVariants({ variant: 'soft-success' }),
                  'hover:bg-success/20 cursor-pointer',
                )}
              >
                {label}
              </button>
            </Hint>
          ) : (
            <Badge key={semester} variant="soft-success">
              {label}
            </Badge>
          )
        })}

        <div className="flex items-center gap-2">
          <ArrowUpDown className="text-muted-foreground h-4 w-4" aria-hidden />
          <Select
            value={`${sortField}-${sortDirection}`}
            onValueChange={value => {
              const option = SORT_OPTIONS.find(o => o.value === value)
              if (option) onSortChange(option.field, option.direction)
            }}
          >
            <SelectTrigger
              className="h-9 w-[13rem]"
              aria-label={t('notensammler.sortBy', 'Sortieren nach')}
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {SORT_OPTIONS.map(option => (
                <SelectItem key={option.value} value={option.value}>
                  {sortLabels[option.value]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <SaveStatus state={saveState} />

        <Hint
          label={t(
            'notensammler.tooltipSaveAll',
            'Schreibt alle offenen Änderungen sofort — Noten speichern sich sonst kurz nach der Eingabe von selbst.',
          )}
        >
          <Button onClick={onSaveAll} disabled={savingAll}>
            {savingAll ? <Spinner size="sm" className="mr-2" /> : <Save className="mr-2 h-4 w-4" />}
            {savingAll
              ? t('notensammler.savingAll', 'Speichere...')
              : t('notensammler.saveAll', 'Alle speichern')}
          </Button>
        </Hint>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" disabled={exporting}>
              {exporting ? (
                <Spinner size="sm" className="mr-2" />
              ) : (
                <Download className="mr-2 h-4 w-4" />
              )}
              {exporting
                ? t('notensammler.downloadingPdf', 'PDF wird erstellt...')
                : t('notensammler.export', 'Export')}
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-72">
            <DropdownMenuItem onSelect={onDownloadPdf}>
              <FileText className="mr-2 h-4 w-4" />
              <span className="flex flex-col">
                <span>{t('notensammler.downloadPdfItem', 'Notenliste dieser Klasse')}</span>
                <span className="text-muted-foreground text-xs">
                  {t(
                    'notensammler.tooltipDownloadPdf',
                    'Lädt die gesamte Notenliste der ausgewählten Klasse herunter.',
                  )}
                </span>
              </span>
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={onDownloadAllPdf} disabled={!canDownloadAllPdf}>
              <FileText className="mr-2 h-4 w-4" />
              <span className="flex flex-col">
                <span>
                  {t('notensammler.downloadAllPdfItem', 'Notenliste aller eigenen Klassen')}
                </span>
                <span className="text-muted-foreground text-xs">
                  {t(
                    'notensammler.tooltipAllClassesPdf',
                    'Lädt eine Datei mit allen eigenen Noten herunter.',
                  )}
                </span>
              </span>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>

        <Hint
          label={t('notensammler.tooltipTransfer', 'Überträgt die Noten an das Notenmanagement.')}
        >
          <Button variant="secondary" onClick={onOpenTransfer}>
            <Upload className="mr-2 h-4 w-4" />
            {t('notensammler.transferShort', 'Übertragen')}
          </Button>
        </Hint>
      </div>
    </div>
  )
}
