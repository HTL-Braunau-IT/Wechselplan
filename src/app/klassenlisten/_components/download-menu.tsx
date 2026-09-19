'use client'

import { useTranslation } from 'react-i18next'
import { ChevronDown, Download, Info } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Spinner } from '@/components/ui/spinner'
import { cn } from '@/lib/utils'
import type { KlassenlisteData, WritingSpace, WritingSpaceOption } from '../_lib/types'
import { sectionColor, sectionTitle } from '../_lib/section-color'

const SPACE_OPTIONS: WritingSpaceOption[] = [
  { key: 'columns', label: '10 Spalten über die ganze Breite' },
  { key: 'split', label: '10 Spalten + Notizfeld' },
  { key: 'notes', label: 'Nur Notizfeld' },
  { key: 'blank', label: 'Ganz leer, keine Trennlinien' },
]

/** Small colored pill mirroring the PDF group badge. */
function GroupPill({ id }: { id: number }) {
  const palette = sectionColor(id)
  return (
    <span
      className="inline-flex h-5 items-center rounded-md px-2 text-xs font-semibold"
      style={{ backgroundColor: palette.tint, color: palette.ink }}
    >
      {sectionTitle(id)}
    </span>
  )
}

export function DownloadMenu({
  data,
  selectedGroupIds,
  onToggleGroup,
  onToggleAll,
  space,
  onSpaceChange,
  onDownload,
  downloading,
}: {
  data: KlassenlisteData
  selectedGroupIds: number[]
  onToggleGroup: (id: number) => void
  onToggleAll: () => void
  space: WritingSpace
  onSpaceChange: (space: WritingSpace) => void
  onDownload: () => void
  downloading: boolean
}) {
  const { t } = useTranslation()

  const allSelected = data.hasPlan && selectedGroupIds.length === data.sections.length
  const selectedCount = data.hasPlan
    ? data.sections
        .filter(s => selectedGroupIds.includes(s.id))
        .reduce((sum, s) => sum + s.students.length, 0)
    : data.plain.length
  const spaceLabel = SPACE_OPTIONS.find(o => o.key === space)?.label ?? ''

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button>
          <Download className="mr-2 h-4 w-4" />
          {t('klassenlisten.download', 'Klassenliste')}
          <ChevronDown className="ml-2 h-4 w-4 opacity-70" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-[22rem] p-0">
        <div className="px-3.5 pt-3 pb-1">
          <p className="text-muted-foreground text-xs font-medium tracking-wide uppercase">
            {t('klassenlisten.groups', 'Gruppen')}
          </p>
        </div>

        {data.hasPlan ? (
          <div className="flex flex-col px-1.5 pb-1.5">
            <button
              type="button"
              onClick={onToggleAll}
              className="hover:bg-accent flex h-9 items-center gap-2.5 rounded-md px-2 text-left"
            >
              <Checkbox checked={allSelected} className="pointer-events-none" />
              <span className="text-sm font-medium">
                {t('klassenlisten.allGroups', 'Alle Gruppen')}
              </span>
              <span className="text-muted-foreground ml-auto text-xs tabular-nums">
                {data.total}
              </span>
            </button>
            {data.sections.map(section => (
              <button
                key={section.id}
                type="button"
                onClick={() => onToggleGroup(section.id)}
                className="hover:bg-accent flex h-9 items-center gap-2.5 rounded-md px-2 text-left"
              >
                <Checkbox
                  checked={selectedGroupIds.includes(section.id)}
                  className="pointer-events-none"
                />
                <GroupPill id={section.id} />
                <span className="text-muted-foreground ml-auto text-xs tabular-nums">
                  {section.students.length}
                </span>
              </button>
            ))}
          </div>
        ) : (
          <div className="bg-muted/40 text-muted-foreground mx-1.5 mb-2 flex gap-2.5 rounded-md border p-3 text-xs leading-relaxed">
            <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            <span>
              {t(
                'klassenlisten.noPlanHint',
                'Für diese Klasse gibt es keinen Wechselplan. Die Liste enthält alle Schüler der Klasse, ohne Gruppen.',
              )}
            </span>
          </div>
        )}

        <div className="bg-border h-px" />

        <div className="px-3.5 pt-3 pb-1">
          <p className="text-muted-foreground text-xs font-medium tracking-wide uppercase">
            {t('klassenlisten.writingSpace', 'Schreibraum')}
          </p>
        </div>
        <div className="flex flex-col px-1.5 pb-2">
          {SPACE_OPTIONS.map(option => {
            const active = option.key === space
            return (
              <button
                key={option.key}
                type="button"
                onClick={() => onSpaceChange(option.key)}
                className="hover:bg-accent flex min-h-8 items-center gap-2.5 rounded-md px-2 py-1 text-left"
              >
                <span
                  className={cn(
                    'flex h-4 w-4 shrink-0 items-center justify-center rounded-full border',
                    active ? 'border-primary' : 'border-input',
                  )}
                >
                  {active ? <span className="bg-primary h-2 w-2 rounded-full" /> : null}
                </span>
                <span className="text-sm">{option.label}</span>
              </button>
            )
          })}
        </div>

        <div className="bg-muted text-muted-foreground flex gap-2.5 border-t px-3.5 py-3 text-xs">
          <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <div className="min-w-0">
            <p className="text-foreground tabular-nums">
              {data.className} ·{' '}
              {data.hasPlan
                ? allSelected
                  ? t('klassenlisten.allGroups', 'Alle Gruppen')
                  : `${selectedGroupIds.length} ${t('klassenlisten.groupsShort', 'Gruppen')}`
                : t('klassenlisten.withoutGroups', 'ohne Gruppen')}{' '}
              · {selectedCount} {t('klassenlisten.studentsShort', 'Schüler')}
            </p>
            <p>A4 hoch · {spaceLabel}</p>
          </div>
        </div>

        <div className="border-t p-3">
          <Button
            className="w-full"
            onClick={onDownload}
            disabled={downloading || selectedCount === 0}
          >
            {downloading ? (
              <Spinner size="sm" className="mr-2" />
            ) : (
              <Download className="mr-2 h-4 w-4" />
            )}
            {t('klassenlisten.downloadPdf', 'PDF herunterladen')}
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  )
}
