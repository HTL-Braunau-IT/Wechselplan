'use client'

import { useTranslation } from 'react-i18next'
import { CheckCircle2 } from 'lucide-react'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Checkbox } from '@/components/ui/checkbox'
import { Label } from '@/components/ui/label'
import { Spinner } from '@/components/ui/spinner'
import type { Semester } from '@/lib/grades'
import type { ClassData } from '../_lib/types'

type ClassOption = { id: number; name: string }

/** Renders the multi-line "Hinweise" block, bolding each leading label. */
function InfoPanel() {
  const { t } = useTranslation()
  const text = t(
    'notensammler.infoText',
    'Betragensnote: Hier kann jeder Lehrer seinen Wunsch eintragen.\nNotenliste alle Klassen als PDF: Lädt eine Datei mit allen eigenen Noten herunter.\nPDF Herunterladen: Lädt die gesamte Notenliste der ausgewählten Klasse herunter.\nAn Notenmanagement übertragen: Überträgt die Noten an das Notenmanagement.',
  )

  return (
    <div className="bg-muted/50 mt-3 rounded-md border px-3 py-2.5">
      <p className="text-muted-foreground mb-1.5 text-sm font-medium">
        {t('notensammler.infoTitle', 'Hinweise')}
      </p>
      <div className="text-muted-foreground space-y-1 text-sm">
        {text
          .split('\n')
          .filter(Boolean)
          .map((line, index) => {
            const separator = line.indexOf(': ')
            const label = separator >= 0 ? line.slice(0, separator) : line
            const description = separator >= 0 ? line.slice(separator + 2) : ''
            return (
              <p key={index}>
                <strong className="text-foreground font-semibold">{label}</strong>
                {description ? `: ${description}` : ''}
              </p>
            )
          })}
      </div>
    </div>
  )
}

/** Checkbox for one semester, with the "already transferred" badge when applicable. */
function SemesterToggle({
  id,
  label,
  checked,
  onCheckedChange,
  transferred,
  lfId,
  onViewLf,
}: {
  id: string
  label: string
  checked: boolean
  onCheckedChange: (checked: boolean) => void
  transferred: boolean
  lfId: string | null
  onViewLf: (lfId: string) => void
}) {
  const { t } = useTranslation()

  return (
    <div className="flex items-center space-x-2">
      <Checkbox id={id} checked={checked} onCheckedChange={v => onCheckedChange(v === true)} />
      <Label htmlFor={id} className="flex cursor-pointer items-center gap-2">
        {label}
        {transferred && (
          <Badge
            variant="outline"
            className="hover:bg-accent cursor-pointer text-xs"
            onClick={e => {
              e.stopPropagation()
              if (lfId) onViewLf(lfId)
            }}
          >
            <CheckCircle2 className="mr-1 h-3 w-3" />
            {t('notensammler.transferred', 'Übertragen')}
            {lfId && <span className="text-muted-foreground ml-1">(LF: {lfId})</span>}
          </Badge>
        )}
      </Label>
    </div>
  )
}

export type NotensammlerToolbarProps = {
  classes: ClassOption[]
  selectedClassId: string
  onClassChange: (classId: string) => void
  classData: ClassData | null
  currentSemester: Semester | null
  showFirstSemester: boolean
  setShowFirstSemester: (value: boolean) => void
  showSecondSemester: boolean
  setShowSecondSemester: (value: boolean) => void
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

/** Class picker, guidance panel and the page's primary actions. */
export function NotensammlerToolbar(props: NotensammlerToolbarProps) {
  const { t } = useTranslation()
  const {
    classes,
    selectedClassId,
    onClassChange,
    classData,
    currentSemester,
    showFirstSemester,
    setShowFirstSemester,
    showSecondSemester,
    setShowSecondSemester,
    savingAll,
    onSaveAll,
    downloadingPdf,
    onDownloadPdf,
    downloadingAllPdf,
    onDownloadAllPdf,
    canDownloadAllPdf,
    onOpenTransfer,
    onViewLf,
  } = props

  return (
    <>
      <div className="mb-4">
        <div className="flex flex-wrap items-center gap-3">
          <div>
            <label className="mb-2 block text-sm font-medium">
              {t('notensammler.selectClass', 'Klasse auswählen')}
            </label>
            <Select value={selectedClassId} onValueChange={onClassChange}>
              <SelectTrigger className="w-[300px]">
                <SelectValue
                  placeholder={t(
                    'notensammler.selectClassPlaceholder',
                    'Bitte Klasse auswählen...',
                  )}
                />
              </SelectTrigger>
              <SelectContent>
                {classes.map(cls => (
                  <SelectItem key={cls.id} value={cls.id.toString()}>
                    {cls.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <Button
            variant="secondary"
            onClick={onDownloadAllPdf}
            disabled={downloadingAllPdf || !canDownloadAllPdf}
            className="self-end"
            title={t(
              'notensammler.tooltipAllClassesPdf',
              'Lädt eine Datei mit allen eigenen Noten herunter.',
            )}
          >
            {downloadingAllPdf ? (
              <>
                <Spinner size="sm" className="mr-2" />
                {t('notensammler.downloadingAllClassesPdf', 'PDF wird erstellt...')}
              </>
            ) : (
              t('notensammler.downloadAllClassesPdf', 'Notenliste alle eigenen Klassen als PDF')
            )}
          </Button>
        </div>
        <InfoPanel />
      </div>

      {classData && (
        <div className="mb-4 flex items-center gap-6">
          {currentSemester != null && (
            <span className="text-muted-foreground text-sm">
              {t('notensammler.currentSemester', 'Aktuell')}:{' '}
              {currentSemester === 'first'
                ? t('notensammler.firstSemester', '1. Semester')
                : t('notensammler.secondSemester', '2. Semester')}
            </span>
          )}
          <SemesterToggle
            id="show-first-semester"
            label={t('notensammler.showFirstSemester', '1. Semester anzeigen')}
            checked={showFirstSemester}
            onCheckedChange={setShowFirstSemester}
            transferred={Boolean(classData.transferStatus?.first.transferred)}
            lfId={classData.transferStatus?.first.lfId ?? null}
            onViewLf={onViewLf}
          />
          <SemesterToggle
            id="show-second-semester"
            label={t('notensammler.showSecondSemester', '2. Semester anzeigen')}
            checked={showSecondSemester}
            onCheckedChange={setShowSecondSemester}
            transferred={Boolean(classData.transferStatus?.second.transferred)}
            lfId={classData.transferStatus?.second.lfId ?? null}
            onViewLf={onViewLf}
          />
          <Button onClick={onSaveAll} disabled={savingAll || !selectedClassId}>
            {savingAll ? (
              <>
                <Spinner size="sm" className="mr-2" />
                {t('notensammler.savingAll', 'Speichere...')}
              </>
            ) : (
              t('notensammler.saveAll', 'Alle speichern')
            )}
          </Button>
          <Button
            onClick={onDownloadPdf}
            disabled={downloadingPdf || !selectedClassId}
            title={t(
              'notensammler.tooltipDownloadPdf',
              'Lädt die gesamte Notenliste der ausgewählten Klasse herunter.',
            )}
          >
            {downloadingPdf ? (
              <>
                <Spinner size="sm" className="mr-2" />
                {t('notensammler.downloadingPdf', 'PDF wird erstellt...')}
              </>
            ) : (
              t('notensammler.downloadPdf', 'PDF herunterladen')
            )}
          </Button>
          <Button
            variant="secondary"
            onClick={onOpenTransfer}
            disabled={!selectedClassId}
            title={t('notensammler.tooltipTransfer', 'Überträgt die Noten an das Notenmanagement.')}
          >
            {t('notensammler.transferToNotenmanagement', 'An Notenmanagement übertragen')}
          </Button>
        </div>
      )}
    </>
  )
}
