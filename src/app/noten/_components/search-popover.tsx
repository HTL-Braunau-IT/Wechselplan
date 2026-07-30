'use client'

import { useTranslation } from 'react-i18next'
import { CalendarSearch, Search } from 'lucide-react'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import type { SearchByDateMatch, Student } from '../_lib/types'

export type SearchPopoverProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  searchText: string
  setSearchText: (value: string) => void
  searchDate: string
  setSearchDate: (value: string) => void
  message: string | null
  onNameSearch: () => void
  onDateSearch: () => void
}

/**
 * Search over the teacher's groups, by student name or by date.
 *
 * This was a card pinned above the grid: a collapse toggle, a paragraph of
 * instructions and two rows of controls, taking a fifth of the screen to offer
 * something used a few times a term. It sits behind a toolbar button now, with
 * each instruction next to the field it describes.
 */
export function SearchPopover({
  open,
  onOpenChange,
  searchText,
  setSearchText,
  searchDate,
  setSearchDate,
  message,
  onNameSearch,
  onDateSearch,
}: SearchPopoverProps) {
  const { t } = useTranslation('common')

  return (
    <Popover open={open} onOpenChange={onOpenChange}>
      <PopoverTrigger asChild>
        <Button variant="outline">
          <Search className="h-4 w-4" />
          {t('noten.searchTitle', { defaultValue: 'Suche' })}
        </Button>
      </PopoverTrigger>

      <PopoverContent align="start" className="w-96">
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="noten-search-name" className="text-sm">
              {t('noten.searchNameAction', { defaultValue: 'Name suchen' })}
            </Label>
            <div className="flex gap-2">
              <Input
                id="noten-search-name"
                value={searchText}
                onChange={e => setSearchText(e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Enter') onNameSearch()
                }}
                placeholder={t('noten.searchNamePlaceholder', { defaultValue: 'Name suchen …' })}
                className="h-9"
              />
              <Button
                size="sm"
                variant="outline"
                onClick={onNameSearch}
                disabled={!searchText.trim()}
              >
                <Search className="h-4 w-4" />
              </Button>
            </div>
            <p className="text-muted-foreground text-xs">
              {t('noten.searchNameHelp', {
                defaultValue: 'Wechselt zur Klasse und Gruppe des Schülers.',
              })}
            </p>
          </div>

          <div className="space-y-1.5 border-t pt-3">
            <Label htmlFor="noten-search-date" className="text-sm">
              {t('noten.searchDateAction', { defaultValue: 'Datum suchen' })}
            </Label>
            <div className="flex gap-2">
              <Input
                id="noten-search-date"
                type="date"
                value={searchDate}
                onChange={e => setSearchDate(e.target.value)}
                className="h-9"
              />
              <Button size="sm" variant="outline" onClick={onDateSearch} disabled={!searchDate}>
                <CalendarSearch className="h-4 w-4" />
              </Button>
            </div>
            <p className="text-muted-foreground text-xs">
              {t('noten.searchDateHelp', {
                defaultValue: 'Listet alle Gruppen, die an diesem Tag Unterricht hatten.',
              })}
            </p>
          </div>

          {message && <p className="border-t pt-3 text-sm">{message}</p>}
        </div>
      </PopoverContent>
    </Popover>
  )
}

/** The class/group sections a date search turned up, shown under the toolbar. */
export function DateMatchList({
  matches,
  studentsByGroup,
  onOpenGroup,
  onDismiss,
}: {
  matches: SearchByDateMatch[]
  studentsByGroup: Record<string, Student[]>
  onOpenGroup: (classId: number, groupId: number) => void
  onDismiss: () => void
}) {
  const { t } = useTranslation('common')

  if (matches.length === 0) return null

  return (
    <section className="border-border/60 bg-card/40 space-y-3 rounded-xl border p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="flex items-center gap-2 text-sm font-medium">
          <CalendarSearch className="h-4 w-4" />
          {t('noten.searchDateSectionsTitle', {
            defaultValue: 'Klassen/Gruppen am gewählten Datum',
          })}
        </p>
        <Button variant="ghost" size="sm" onClick={onDismiss}>
          {t('common.close', 'Schließen')}
        </Button>
      </div>
      {matches.map(match => {
        const key = `${match.classId}-${match.groupId}`
        const sectionStudents = studentsByGroup[key] ?? []
        return (
          <div key={`${key}-${match.period}`} className="bg-background rounded-lg border p-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-sm font-medium">
                {match.className} · {t('noten.gruppe')} {match.groupId} ({match.period})
              </p>
              <Button
                variant="outline"
                size="sm"
                onClick={() => onOpenGroup(match.classId, match.groupId)}
              >
                {t('noten.searchOpenGroup', { defaultValue: 'In Tabelle öffnen' })}
              </Button>
            </div>
            <p className="text-muted-foreground mt-2 text-xs">
              {sectionStudents.length === 0
                ? t('noten.searchNoStudentsInGroup', {
                    defaultValue: 'Keine Schülerdaten für diese Gruppe gefunden.',
                  })
                : sectionStudents.map(s => `${s.lastName} ${s.firstName}`).join(', ')}
            </p>
          </div>
        )
      })}
    </section>
  )
}
