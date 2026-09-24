'use client'

import { useCallback, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { AlertCircle, ArrowRight, CalendarClock, CalendarX, GraduationCap, Sun, Sunset, Users, X } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Spinner } from '@/components/ui/spinner'
import { TooltipProvider } from '@/components/ui/tooltip'
import { PageContainer } from '@/components/ui/page-container'
import { PageHeader } from '@/components/ui/page-header'
import { EmptyState } from '@/components/ui/empty-state'
import { SaveStatus } from '@/components/save-status'
import { useSchoolYear } from '@/contexts/school-year-context'
import { useEntitlements } from '@/contexts/entitlements-context'
import { useUnsavedWarning } from '@/hooks/use-unsaved-warning'
import { entryKey, isSemester2 } from '@/lib/grades'
import {
  emptyEntry,
  groupIdsOn,
  type NotenEntryRow,
  type SearchByNameMatch,
  type TeachingDay,
} from './_lib/types'
import { computeStudentSummary } from './_lib/summary'
import { useNotenClasses } from './_hooks/use-noten-classes'
import { useNotenData } from './_hooks/use-noten-data'
import { useNotenViewPreference } from './_hooks/use-noten-view-preference'
import { useNotenSearch } from './_hooks/use-noten-search'
import { useNmTransfer } from './_hooks/use-nm-transfer'
import { ClassGroupPicker } from './_components/class-group-picker'
import { SearchPopover, DateMatchList } from './_components/search-popover'
import { NmTransferDialog } from './_components/nm-transfer-dialog'
import { NotenViewTabs, type NotenTab } from './_components/noten-view-tabs'
import { TransferMenu } from './_components/transfer-menu'
import { ErfassenTab } from './_components/erfassen-tab'
import { VerlaufTab } from './_components/verlauf-tab'
import { EndnotenTab } from './_components/endnoten-tab'

/** Today as YYYY-MM-DD in local time (the dates from the API are local dates). */
function todayLocalYmd(): string {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
}

/**
 * Noten — per-lesson assessment for one class/group.
 *
 * Three views over the same data (class/group selection, entries, weighting,
 * final grades — all owned by `useNotenData`): a per-half-day tile grid for
 * capture, a term history, and the final grades. Search and the Notenmanagement
 * transfer sit in their own hooks and dialogs.
 */
export default function NotenPage() {
  const { t } = useTranslation('common')
  const { selectedYear } = useSchoolYear()
  const { isFeatureEnabled } = useEntitlements()

  const schoolYearId = selectedYear?.id ?? null
  const semesterChangeDate = selectedYear?.semesterChangeDate
  const todayYmd = todayLocalYmd()

  const {
    classes,
    loadingClasses,
    selectedClassId,
    setSelectedClassId,
    selectedGroupId,
    setSelectedGroupId,
    selectedWeekday,
    setSelectedWeekday,
    currentSlot,
    selectClass,
    selectWeekday,
  } = useNotenClasses(schoolYearId)

  const data = useNotenData({
    classId: selectedClassId,
    groupId: selectedGroupId,
    schoolYearId,
    weekday: selectedWeekday,
  })

  // Marks are written as they are entered, but a seat plan is debounced and a
  // failed write stays queued — closing the tab on either used to lose it.
  useUnsavedWarning(data.hasUnsavedWork)

  // Whether the Sitzplan view opens by default, remembered per teacher.
  const viewPref = useNotenViewPreference()

  const [tab, setTab] = useState<NotenTab>('erfassen')
  const [hideGrades, setHideGrades] = useState(false)
  const [dayIndex, setDayIndex] = useState(0)

  // Land on today's half-day (or the most recent past one) the first time a
  // class/group loads. Re-applied only when the class/group changes, using the
  // documented render-time "reset state on key change" pattern, so paging
  // through days is preserved across a plain refetch.
  const dayInitKey = `${selectedClassId}-${selectedWeekday}-${selectedGroupId}`
  const [dayInitedFor, setDayInitedFor] = useState<string | null>(null)
  if (data.teachingDays.length > 0 && dayInitedFor !== dayInitKey) {
    setDayInitedFor(dayInitKey)
    let idx = data.teachingDays.findIndex(day => day.date === todayYmd)
    if (idx < 0) {
      for (let i = data.teachingDays.length - 1; i >= 0; i--) {
        if (data.teachingDays[i]!.date <= todayYmd) {
          idx = i
          break
        }
      }
    }
    setDayIndex(idx < 0 ? 0 : idx)
  }

  const onSearchNavigate = useCallback(
    (match: SearchByNameMatch) => {
      setSelectedClassId(match.classId)
      setSelectedWeekday(match.weekday)
      setSelectedGroupId(match.groupId)
    },
    [setSelectedClassId, setSelectedGroupId, setSelectedWeekday],
  )
  const search = useNotenSearch({ schoolYearId, onNavigate: onSearchNavigate })

  const selectedClass = classes.find(cls => cls.id === selectedClassId)

  const transfer = useNmTransfer({
    classId: selectedClassId,
    schoolYearId,
    selectedGroupId,
    allGroupIds: groupIdsOn(selectedClass, selectedWeekday),
    weekday: selectedWeekday,
  })

  const summary = useMemo(() => {
    // Attendance stays full-year, but the displayed calculatedGrade is scoped to
    // the current semester's teaching days — blending both made the figure
    // diverge from the per-semester Endnote and the transfer prefill (finding 19).
    const full = computeStudentSummary(
      data.students,
      data.teachingDays,
      data.entries,
      data.weights,
      todayYmd,
    )
    const todayIsSecondSemester = isSemester2(todayYmd, semesterChangeDate)
    const currentSemesterDays = data.teachingDays.filter(
      day => isSemester2(day.date, semesterChangeDate) === todayIsSecondSemester,
    )
    const scoped = computeStudentSummary(
      data.students,
      currentSemesterDays,
      data.entries,
      data.weights,
      todayYmd,
    )
    const out: typeof full = {}
    for (const id of Object.keys(full)) {
      const key = Number(id)
      out[key] = { ...full[key]!, calculatedGrade: scoped[key]?.calculatedGrade ?? null }
    }
    return out
  }, [data.students, data.teachingDays, data.entries, data.weights, todayYmd, semesterChangeDate])

  const remainingDays = useMemo(() => {
    const upcoming = data.teachingDays.filter(day => day.date > todayYmd)
    const todayIsSecondSemester = isSemester2(todayYmd, semesterChangeDate)
    return {
      fullYear: upcoming.length,
      semester: upcoming.filter(
        day => isSemester2(day.date, semesterChangeDate) === todayIsSecondSemester,
      ).length,
    }
  }, [data.teachingDays, todayYmd, semesterChangeDate])

  /** Apply a patch to one entry and persist it. */
  const handleEntryChange = useCallback(
    (entry: NotenEntryRow, patch: Partial<NotenEntryRow>) => {
      data.updateEntry(entry.studentId, entry.date, entry.period, patch)
      void data.saveEntries([{ ...entry, ...patch }])
    },
    [data],
  )

  /** Copy just the attendance of the other half-day onto this one; marks untouched. */
  const handleCopyAttendance = useCallback(
    (from: TeachingDay, to: TeachingDay) => {
      const payload: NotenEntryRow[] = []
      for (const student of data.students) {
        const source = data.entries[entryKey(student.id, from.date, from.period)]
        const attendance = source?.attendance
        if (!attendance) continue
        const existing =
          data.entries[entryKey(student.id, to.date, to.period)] ??
          emptyEntry(student.id, to.date, to.period)
        data.updateEntry(student.id, to.date, to.period, { attendance })
        payload.push({ ...existing, attendance })
      }
      if (payload.length > 0) void data.saveEntries(payload)
    },
    [data],
  )

  const handleCommitLehrstoff = useCallback(
    (date: string, period: string, value: string) => {
      data.setLehrstoffByDay(prev => ({ ...prev, [`${date}-${period}`]: value }))
      void data.saveLehrstoff(date, period, value)
    },
    [data],
  )

  const handleFinalGradeCommit = useCallback(
    (studentId: number) => {
      const latest = data.finalGradesRef.current[studentId]
      if (!latest) return
      void data.saveFinalGrades([
        {
          studentId,
          semester: 'first',
          grade: latest.first.grade,
          conductNoteWish: latest.first.conductNoteWish,
        },
        {
          studentId,
          semester: 'second',
          grade: latest.second.grade,
          conductNoteWish: latest.second.conductNoteWish,
        },
      ])
    },
    [data],
  )


  if (!isFeatureEnabled('noten')) return null

  if (!schoolYearId) {
    return (
      <PageContainer>
        <EmptyState icon={CalendarX} title={t('noten.noSchoolYear')} />
      </PageContainer>
    )
  }

  const canTransfer = isFeatureEnabled('notenmgmt_htl') && selectedClassId != null
  const periods = Array.from(new Set(data.teachingDays.map(day => day.period)))
  const safeDayIndex = Math.min(dayIndex, Math.max(0, data.teachingDays.length - 1))
  const groupSelected = !!(selectedClass && selectedGroupId != null)

  const tabs: Array<{ value: NotenTab; label: string }> = [
    { value: 'erfassen', label: t('noten.tabErfassen', { defaultValue: 'Erfassen' }) },
    { value: 'verlauf', label: t('noten.tabVerlauf', { defaultValue: 'Verlauf' }) },
    { value: 'endnoten', label: t('noten.tabEndnoten', { defaultValue: 'Endnoten' }) },
  ]

  return (
    <TooltipProvider delayDuration={200}>
      <PageContainer size="wide" className="space-y-6">
        <PageHeader
          icon={GraduationCap}
          title={t('navigation.noten')}
          description={t('noten.subtitle', {
            defaultValue: 'Anwesenheit und Mitarbeit je Unterrichtstag erfassen.',
          })}
          actions={
            groupSelected ? (
              <>
                <SaveStatus state={data.saveState} />
                {canTransfer && (
                  <TransferMenu
                    groupId={selectedGroupId}
                    canTransferAllGroups={(selectedClass?.groupIds.length ?? 0) > 0}
                    onTransferGroup={() => transfer.start('group')}
                    onTransferAllGroups={() => transfer.start('all')}
                  />
                )}
              </>
            ) : undefined
          }
        />

        {/* A load failure is not dismissible: there is nothing behind it to get
            back to, and picking another group is what clears it. */}
        {data.loadError && (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>{data.loadError}</AlertDescription>
          </Alert>
        )}

        {data.saveError && (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription className="flex items-start justify-between gap-4">
              <span className="whitespace-pre-line">{data.saveError}</span>
              <Button
                variant="outline"
                size="sm"
                className="shrink-0"
                onClick={() => data.setSaveError(null)}
              >
                {t('common.close', 'Schließen')}
              </Button>
            </AlertDescription>
          </Alert>
        )}

        {loadingClasses ? (
          <div className="flex min-h-[240px] items-center justify-center">
            <Spinner size="lg" />
          </div>
        ) : classes.length === 0 ? (
          <EmptyState icon={GraduationCap} title={t('noten.noClasses')} />
        ) : (
          <>
            <ClassGroupPicker
              classes={classes}
              selectedClassId={selectedClassId}
              selectedGroupId={selectedGroupId}
              selectedWeekday={selectedWeekday}
              currentSlot={currentSlot}
              onSelectClass={selectClass}
              onSelectGroup={setSelectedGroupId}
              onSelectWeekday={selectWeekday}
            />

            {data.loading && (
              <div className="flex min-h-[240px] items-center justify-center">
                <Spinner size="lg" />
              </div>
            )}

            {!data.loading && !groupSelected && (
              <EmptyState
                icon={GraduationCap}
                title={t('noten.noGroupSelectedTitle', { defaultValue: 'Keine Gruppe ausgewählt' })}
                description={t('noten.noGroupSelectedDesc', {
                  defaultValue: 'Wähle oben eine Klasse und eine Gruppe.',
                })}
              />
            )}

            {groupSelected && !data.loading && (
              <div className="space-y-6">
                <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1.5">
                  <h2 className="truncate text-xl font-semibold tracking-tight">
                    {selectedClass!.name} · {t('noten.gruppe')} {selectedGroupId}
                  </h2>
                  {periods.map(period => (
                    <Badge key={period} variant="secondary" className="gap-1">
                      {period === 'AM' ? <Sun className="h-3 w-3" /> : <Sunset className="h-3 w-3" />}
                      {period === 'AM'
                        ? t('noten.vormittag', { defaultValue: 'Vormittag' })
                        : t('noten.nachmittag', { defaultValue: 'Nachmittag' })}
                    </Badge>
                  ))}
                  <span className="text-muted-foreground flex items-center gap-1.5 text-sm">
                    <Users className="h-3.5 w-3.5" />
                    {t('noten.studentCount', {
                      defaultValue: '{{count}} Schüler',
                      count: data.students.length,
                    })}
                  </span>
                  <span className="text-muted-foreground flex items-center gap-1.5 text-sm">
                    <CalendarClock className="h-3.5 w-3.5" />
                    {t('noten.remainingSummary', {
                      defaultValue: 'Noch {{semester}} Termine im Semester, {{fullYear}} im Schuljahr',
                      semester: remainingDays.semester,
                      fullYear: remainingDays.fullYear,
                    })}
                  </span>

                  <span className="ml-auto flex items-center gap-2">
                    {search.activeNameMatch && (
                      <span className="border-border bg-muted/60 flex items-center gap-2 rounded-full border py-1 pr-1 pl-3 text-xs">
                        <span className="font-medium">
                          {search.activeNameMatch.lastName} {search.activeNameMatch.firstName}
                        </span>
                        {search.nameMatches.length > 1 && (
                          <>
                            <span className="text-muted-foreground tabular-nums">
                              {search.activeNameMatchIndex + 1}/{search.nameMatches.length}
                            </span>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-5 w-5"
                              onClick={search.gotoNextNameMatch}
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
                          onClick={search.clearNameSearch}
                          aria-label={t('noten.searchClear', { defaultValue: 'Suche zurücksetzen' })}
                        >
                          <X className="h-3.5 w-3.5" />
                        </Button>
                      </span>
                    )}
                    <SearchPopover
                      open={search.open}
                      onOpenChange={search.setOpen}
                      searchText={search.searchText}
                      setSearchText={search.setSearchText}
                      searchDate={search.searchDate}
                      setSearchDate={search.setSearchDate}
                      message={search.message}
                      onNameSearch={() => void search.performNameSearch()}
                      onDateSearch={() => void search.performDateSearch()}
                    />
                  </span>
                </div>

                <NotenViewTabs value={tab} onValueChange={setTab} tabs={tabs} />

                <DateMatchList
                  matches={search.dateMatches}
                  studentsByGroup={search.studentsByGroup}
                  onOpenGroup={(classId, groupId, weekday) => {
                    setSelectedClassId(classId)
                    setSelectedWeekday(weekday)
                    setSelectedGroupId(groupId)
                  }}
                  onDismiss={search.clearDateSearch}
                />

                {data.students.length === 0 ? (
                  <EmptyState
                    icon={Users}
                    title={t('noten.noStudentsTitle', {
                      defaultValue: 'Keine Schüler in dieser Gruppe',
                    })}
                    description={t('noten.noStudentsDesc', {
                      defaultValue: 'Dieser Gruppe sind für dieses Schuljahr keine Schüler zugeordnet.',
                    })}
                  />
                ) : tab === 'endnoten' ? (
                  <EndnotenTab
                    students={data.students}
                    finalGrades={data.finalGrades}
                    summary={summary}
                    hideGrades={hideGrades}
                    onFinalGradeChange={data.setFinalGrade}
                    onFinalGradeCommit={handleFinalGradeCommit}
                  />
                ) : data.teachingDays.length === 0 ? (
                  <EmptyState
                    icon={CalendarX}
                    title={t('noten.noTeachingDaysTitle', { defaultValue: 'Keine Unterrichtstage' })}
                    description={t('noten.noTeachingDaysDesc', {
                      defaultValue: 'Für diese Gruppe ist im gewählten Schuljahr kein Turnus geplant.',
                    })}
                  />
                ) : tab === 'erfassen' ? (
                  <ErfassenTab
                    teachingDays={data.teachingDays}
                    students={data.students}
                    seating={data.seating}
                    entries={data.entries}
                    summary={summary}
                    lehrstoffByDay={data.lehrstoffByDay}
                    weightLevels={data.weightLevels}
                    weights={data.weights}
                    weightsValid={data.weightsValid}
                    classLabel={selectedClass!.name}
                    groupLabel={`${t('noten.gruppe')} ${selectedGroupId}`}
                    dayIndex={safeDayIndex}
                    hideGrades={hideGrades}
                    saving={data.saveState === 'saving'}
                    todayYmd={todayYmd}
                    semesterChangeDate={semesterChangeDate}
                    onSelectDay={setDayIndex}
                    onToggleHide={() => setHideGrades(h => !h)}
                    onEntryChange={handleEntryChange}
                    onSetAllAnwesend={(date, period) => void data.setAllAnwesend(date, period)}
                    onCopyAttendance={handleCopyAttendance}
                    onSitzplatzChange={(studentId, value) => data.updateSitzplatz(studentId, value)}
                    onSeatChange={(studentId, position) => data.updateSeat(studentId, position)}
                    seatingDefault={viewPref.loaded ? viewPref.seatingDefault : null}
                    onSeatingModeChange={viewPref.saveSeatingDefault}
                    onCommitLehrstoff={handleCommitLehrstoff}
                    onWeightChange={data.setWeightLevel}
                    onWeightEnableOverride={data.enableWeightOverride}
                    onWeightClearOverride={level => void data.clearWeightOverride(level)}
                    onWeightCommit={() => void data.saveWeights()}
                  />
                ) : (
                  <VerlaufTab
                    teachingDays={data.teachingDays}
                    students={data.students}
                    entries={data.entries}
                    weights={data.weights}
                    hideGrades={hideGrades}
                    todayYmd={todayYmd}
                  />
                )}
              </div>
            )}
          </>
        )}

        <NmTransferDialog {...transfer} />
      </PageContainer>
    </TooltipProvider>
  )
}
