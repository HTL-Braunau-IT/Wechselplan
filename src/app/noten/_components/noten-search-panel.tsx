'use client'

import { useTranslation } from 'react-i18next'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import type { SearchByDateMatch, Student } from '../_lib/types'

export type NotenSearchPanelProps = {
  open: boolean
  setOpen: (open: boolean) => void
  searchText: string
  setSearchText: (value: string) => void
  searchDate: string
  setSearchDate: (value: string) => void
  message: string | null
  nameMatchCount: number
  activeNameMatchIndex: number
  onNameSearch: () => void
  onNextNameMatch: () => void
  onDateSearch: () => void
  dateMatches: SearchByDateMatch[]
  studentsByGroup: Record<string, Student[]>
  onOpenGroup: (classId: number, groupId: number) => void
}

/** Collapsible search over the teacher's groups, by name or by date. */
export function NotenSearchPanel(props: NotenSearchPanelProps) {
  const { t } = useTranslation('common')
  const {
    open,
    setOpen,
    searchText,
    setSearchText,
    searchDate,
    setSearchDate,
    message,
    nameMatchCount,
    activeNameMatchIndex,
    onNameSearch,
    onNextNameMatch,
    onDateSearch,
    dateMatches,
    studentsByGroup,
    onOpenGroup,
  } = props

  return (
    <>
      <div className="mb-4 space-y-2 rounded-md border p-3">
        <div className="flex items-center justify-between gap-2">
          <p className="text-sm font-medium">{t('noten.searchTitle', { defaultValue: 'Suche' })}</p>
          <Button variant="outline" size="sm" onClick={() => setOpen(!open)}>
            {open
              ? t('noten.searchCollapse', { defaultValue: 'Suche ausblenden' })
              : t('noten.searchExpand', { defaultValue: 'Suche einblenden' })}
          </Button>
        </div>

        {open && (
          <>
            <p className="text-muted-foreground text-xs">
              {t('noten.searchHelp', {
                defaultValue:
                  'Suche nach Name (wechselt zur Klasse/Gruppe) oder nach Datum (zeigt alle Klassen/Gruppen dieses Tages).',
              })}
            </p>
            <div className="flex flex-wrap gap-2">
              <Input
                value={searchText}
                onChange={e => setSearchText(e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Enter') onNameSearch()
                }}
                placeholder={t('noten.searchNamePlaceholder', { defaultValue: 'Name suchen …' })}
                className="w-full max-w-xs"
              />
              <Button variant="outline" size="sm" onClick={onNameSearch}>
                {t('noten.searchNameAction', { defaultValue: 'Name suchen' })}
              </Button>
              {nameMatchCount > 1 && (
                <Button variant="outline" size="sm" onClick={onNextNameMatch}>
                  {t('noten.searchNextMatch', { defaultValue: 'Nächster Treffer' })} (
                  {activeNameMatchIndex + 1}/{nameMatchCount})
                </Button>
              )}
            </div>
            <div className="flex flex-wrap gap-2">
              <Input
                type="date"
                value={searchDate}
                onChange={e => setSearchDate(e.target.value)}
                className="w-full max-w-xs"
              />
              <Button variant="outline" size="sm" onClick={onDateSearch}>
                {t('noten.searchDateAction', { defaultValue: 'Datum suchen' })}
              </Button>
            </div>
            {message && <p className="text-muted-foreground text-sm">{message}</p>}
          </>
        )}
      </div>

      {dateMatches.length > 0 && (
        <div className="mb-4 space-y-3 rounded-md border p-3">
          <p className="text-sm font-medium">
            {t('noten.searchDateSectionsTitle', {
              defaultValue: 'Klassen/Gruppen am gewählten Datum',
            })}
          </p>
          {dateMatches.map(match => {
            const key = `${match.classId}-${match.groupId}`
            const sectionStudents = studentsByGroup[key] ?? []
            return (
              <div key={`${key}-${match.period}`} className="rounded border p-2">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-sm font-medium">
                    {match.className} - {t('noten.gruppe')} {match.groupId} ({match.period})
                  </p>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => onOpenGroup(match.classId, match.groupId)}
                  >
                    {t('noten.searchOpenGroup', { defaultValue: 'In Tabelle öffnen' })}
                  </Button>
                </div>
                {sectionStudents.length === 0 ? (
                  <p className="text-muted-foreground mt-2 text-xs">
                    {t('noten.searchNoStudentsInGroup', {
                      defaultValue: 'Keine Schülerdaten für diese Gruppe gefunden.',
                    })}
                  </p>
                ) : (
                  <div className="text-muted-foreground mt-2 text-xs">
                    {sectionStudents.map(s => `${s.lastName} ${s.firstName}`).join(', ')}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </>
  )
}
