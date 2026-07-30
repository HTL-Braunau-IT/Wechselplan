'use client'

import { useTranslation } from 'react-i18next'
import {
  ArrowRight,
  CalendarDays,
  FoldHorizontal,
  Eye,
  EyeOff,
  Save,
  UnfoldHorizontal,
  Upload,
  X,
} from 'lucide-react'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Button } from '@/components/ui/button'
import { Spinner } from '@/components/ui/spinner'
import { Hint } from '@/components/hint'
import { SaveStatus, type SaveState } from '@/components/save-status'
import type { WeightConfig } from '../_lib/types'
import { SearchPopover, type SearchPopoverProps } from './search-popover'
import { WeightsPopover } from './weights-popover'

export type NotenToolbarProps = {
  saveState: SaveState
  saving: boolean
  onSave: () => void

  hasDays: boolean
  allDaysCollapsed: boolean
  hasFutureDays: boolean
  canCollapseSemester1: boolean
  canCollapseSemester2: boolean
  onExpandAllDays: () => void
  onCollapseAllDays: () => void
  onCollapseFutureDays: () => void
  onCollapseSemester1: () => void
  onCollapseSemester2: () => void

  gradesVisible: boolean
  hasStudents: boolean
  onToggleGrades: () => void

  weights: WeightConfig
  weightsValid: boolean
  onWeightChange: (key: keyof WeightConfig, value: number) => void
  onWeightCommit: () => void

  search: SearchPopoverProps
  /** The name-search result chip: how many students matched and which is shown. */
  nameMatchCount: number
  activeNameMatchIndex: number
  nameMatchLabel: string | null
  onNextNameMatch: () => void
  onClearNameSearch: () => void

  canTransfer: boolean
  groupId: number | null
  canTransferAllGroups: boolean
  onTransferGroup: () => void
  onTransferAllGroups: () => void
}

/**
 * Working controls for the open group.
 *
 * These used to be two rows of buttons under a search card and a weights bar:
 * a save next to two different "collapse days" controls, a red destructive
 * button that only hid grades on screen, and two long Notenmanagement buttons —
 * five equally loud things with no hierarchy. What a teacher does constantly
 * (save) is the only primary now; the rest is grouped by what it acts on.
 */
export function NotenToolbar(props: NotenToolbarProps) {
  const { t } = useTranslation('common')
  const {
    saveState,
    saving,
    onSave,
    hasDays,
    allDaysCollapsed,
    hasFutureDays,
    canCollapseSemester1,
    canCollapseSemester2,
    onExpandAllDays,
    onCollapseAllDays,
    onCollapseFutureDays,
    onCollapseSemester1,
    onCollapseSemester2,
    gradesVisible,
    hasStudents,
    onToggleGrades,
    weights,
    weightsValid,
    onWeightChange,
    onWeightCommit,
    search,
    nameMatchCount,
    activeNameMatchIndex,
    nameMatchLabel,
    onNextNameMatch,
    onClearNameSearch,
    canTransfer,
    groupId,
    canTransferAllGroups,
    onTransferGroup,
    onTransferAllGroups,
  } = props

  return (
    <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <SearchPopover {...search} />

        {nameMatchLabel && (
          <span className="border-border bg-muted/60 flex items-center gap-2 rounded-full border py-1 pr-1 pl-3 text-xs">
            <span className="font-medium">{nameMatchLabel}</span>
            {nameMatchCount > 1 && (
              <>
                <span className="text-muted-foreground tabular-nums">
                  {activeNameMatchIndex + 1}/{nameMatchCount}
                </span>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-5 w-5"
                  onClick={onNextNameMatch}
                  aria-label={t('noten.searchNextMatch', { defaultValue: 'Nächster Treffer' })}
                >
                  <ArrowRight className="h-3.5 w-3.5" />
                </Button>
              </>
            )}
            <Button
              variant="ghost"
              size="icon"
              className="h-5 w-5"
              onClick={onClearNameSearch}
              aria-label={t('noten.searchClear', { defaultValue: 'Suche zurücksetzen' })}
            >
              <X className="h-3.5 w-3.5" />
            </Button>
          </span>
        )}

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" disabled={!hasDays}>
              <CalendarDays className="h-4 w-4" />
              {t('noten.daysMenu', { defaultValue: 'Tage' })}
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-64">
            <DropdownMenuItem onSelect={allDaysCollapsed ? onExpandAllDays : onCollapseAllDays}>
              {allDaysCollapsed ? (
                <UnfoldHorizontal className="h-4 w-4" />
              ) : (
                <FoldHorizontal className="h-4 w-4" />
              )}
              {allDaysCollapsed
                ? t('noten.expandAllDays', { defaultValue: 'Alle aufklappen' })
                : t('noten.collapseAllDays', { defaultValue: 'Alle Tage zuklappen' })}
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={onCollapseFutureDays} disabled={!hasFutureDays}>
              <FoldHorizontal className="h-4 w-4" />
              {t('noten.collapseFutureDays', { defaultValue: 'Künftige Tage zuklappen' })}
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={onCollapseSemester1} disabled={!canCollapseSemester1}>
              <FoldHorizontal className="h-4 w-4" />
              {t('noten.collapseSemester1', { defaultValue: '1. Semester zuklappen' })}
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={onCollapseSemester2} disabled={!canCollapseSemester2}>
              <FoldHorizontal className="h-4 w-4" />
              {t('noten.collapseSemester2', { defaultValue: '2. Semester zuklappen' })}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>

        <Hint
          label={t('noten.tooltipToggleGrades', {
            defaultValue:
              'Blendet die Noten nur auf diesem Bildschirm aus — für die Besprechung vor der Klasse. Gespeichert bleibt alles.',
          })}
        >
          <Button variant="outline" onClick={onToggleGrades} disabled={!hasStudents}>
            {gradesVisible ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            {gradesVisible
              ? t('noten.hideAllGrades', { defaultValue: 'Noten ausblenden' })
              : t('noten.showAllGrades', { defaultValue: 'Noten einblenden' })}
          </Button>
        </Hint>

        <WeightsPopover
          weights={weights}
          weightsValid={weightsValid}
          onChange={onWeightChange}
          onCommit={onWeightCommit}
        />
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <SaveStatus state={saveState} />

        <Hint
          label={t('noten.tooltipSave', {
            defaultValue:
              'Einträge speichern sich beim Eintippen von selbst. Hier werden noch offene Änderungen sofort geschrieben.',
          })}
        >
          <Button onClick={onSave} disabled={saving}>
            {saving ? <Spinner size="sm" /> : <Save className="h-4 w-4" />}
            {t('common.save')}
          </Button>
        </Hint>

        {canTransfer && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="secondary">
                <Upload className="h-4 w-4" />
                {t('noten.transferShort', { defaultValue: 'Übertragen' })}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-80">
              <DropdownMenuItem onSelect={onTransferGroup} disabled={groupId == null}>
                <span className="flex flex-col">
                  <span>
                    {t('noten.notenmanagementEintragGruppe', {
                      n: groupId,
                      defaultValue: `Notenmanagement Eintrag Gruppe ${groupId}`,
                    })}
                  </span>
                  <span className="text-muted-foreground text-xs">
                    {t('noten.transferGroupDescription', {
                      defaultValue: 'Überträgt nur die offene Gruppe.',
                    })}
                  </span>
                </span>
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={onTransferAllGroups} disabled={!canTransferAllGroups}>
                <span className="flex flex-col">
                  <span>
                    {t('noten.notenmanagementEintragAlle', {
                      defaultValue: 'Notenmanagement Eintrag – Alle Gruppen',
                    })}
                  </span>
                  <span className="text-muted-foreground text-xs">
                    {t('noten.transferAllDescription', {
                      defaultValue: 'Überträgt alle Gruppen dieser Klasse in einem Durchgang.',
                    })}
                  </span>
                </span>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>
    </div>
  )
}
