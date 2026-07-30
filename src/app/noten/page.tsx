'use client'

import { useCallback, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  AlertCircle,
  CalendarClock,
  CalendarX,
  GraduationCap,
  Sun,
  Sunset,
  Users,
} from 'lucide-react'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Spinner } from '@/components/ui/spinner'
import { TooltipProvider } from '@/components/ui/tooltip'
import { PageContainer } from '@/components/ui/page-container'
import { PageHeader } from '@/components/ui/page-header'
import { EmptyState } from '@/components/ui/empty-state'
import { useSchoolYear } from '@/contexts/school-year-context'
import { useEntitlements } from '@/contexts/entitlements-context'
import { useUnsavedWarning } from '@/hooks/use-unsaved-warning'
import { entryKey, isSemester2 } from '@/lib/grades'
import {
  emptyEntry,
  type NotenEntryRow,
  type SearchByNameMatch,
  type WeightConfig,
} from './_lib/types'
import { computeStudentSummary } from './_lib/summary'
import { useNotenClasses } from './_hooks/use-noten-classes'
import { useNotenData } from './_hooks/use-noten-data'
import { useNotenSearch } from './_hooks/use-noten-search'
import { useStickyColumns } from './_hooks/use-sticky-columns'
import { useNmTransfer } from './_hooks/use-nm-transfer'
import { ClassGroupPicker } from './_components/class-group-picker'
import { NotenToolbar } from './_components/noten-toolbar'
import { DateMatchList } from './_components/search-popover'
import { NotenGrid } from './_components/noten-grid'
import { TextModal, type TextModalContentRef, type TextModalState } from './_components/text-modal'
import { NmTransferDialog } from './_components/nm-transfer-dialog'

/** Today as YYYY-MM-DD in local time (the dates from the API are local dates). */
function todayLocalYmd(): string {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
}

/**
 * Noten — per-lesson assessment for one class/group.
 *
 * A wide grid of teaching days against students, with attendance, four
 * assessment categories, notes and final grades. Class selection, data,
 * search, sticky-column measurement and the Notenmanagement transfer each live
 * in their own hook.
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
    currentSlot,
    selectClass,
  } = useNotenClasses(schoolYearId)

  const data = useNotenData({
    classId: selectedClassId,
    groupId: selectedGroupId,
    schoolYearId,
  })

  // Marks are written as they are entered, but a seat plan is debounced and a
  // failed write stays queued — closing the tab on either used to lose it.
  useUnsavedWarning(data.hasUnsavedWork)

  const [collapsedDays, setCollapsedDays] = useState<Set<string>>(new Set())
  // Fold away days that haven't happened yet the first time a class/group loads,
  // so the teacher lands on a compact "term so far" view instead of scrolling
  // past a hundred empty future columns. Re-applied only when the class/group
  // changes, never on a plain data refetch, so manual toggles are preserved.
  const collapseInitKey = `${selectedClassId}-${selectedGroupId}`
  const [collapseInitedFor, setCollapseInitedFor] = useState<string | null>(null)
  const [rowGradeVisibility, setRowGradeVisibility] = useState<Record<number, boolean>>({})
  const [textModal, setTextModal] = useState<TextModalState>(null)
  const textModalContentRef = useRef<TextModalContentRef | null>(null)

  const onSearchNavigate = useCallback(
    (match: SearchByNameMatch) => {
      setSelectedClassId(match.classId)
      setSelectedGroupId(match.groupId)
    },
    [setSelectedClassId, setSelectedGroupId],
  )
  const search = useNotenSearch({ schoolYearId, onNavigate: onSearchNavigate })

  const focusColumnKey = useMemo(() => {
    const target = search.focusDateYmd ?? todayYmd
    const day = data.teachingDays.find(d => d.date === target)
    return day ? `${day.date}-${day.period}` : null
  }, [data.teachingDays, search.focusDateYmd, todayYmd])

  const { nameColumnRef, sitzplatzLeft, registerDayColumn } = useStickyColumns({
    deps: [data.students, data.teachingDays],
    focusColumnKey,
    resetKey: `${selectedClassId}-${selectedGroupId}-${search.focusDateYmd}`,
  })

  const selectedClass = classes.find(cls => cls.id === selectedClassId)

  const transfer = useNmTransfer({
    classId: selectedClassId,
    schoolYearId,
    selectedGroupId,
    allGroupIds: selectedClass?.groupIds ?? [],
  })

  const { semester1DayKeys, semester2DayKeys, futureDayKeys } = useMemo(() => {
    const first: string[] = []
    const second: string[] = []
    const future: string[] = []
    for (const day of data.teachingDays) {
      const key = `${day.date}-${day.period}`
      if (isSemester2(day.date, semesterChangeDate)) second.push(key)
      else first.push(key)
      if (day.date > todayYmd) future.push(key)
    }
    return { semester1DayKeys: first, semester2DayKeys: second, futureDayKeys: future }
  }, [data.teachingDays, semesterChangeDate, todayYmd])

  const summary = useMemo(
    () =>
      computeStudentSummary(data.students, data.teachingDays, data.entries, data.weights, todayYmd),
    [data.students, data.teachingDays, data.entries, data.weights, todayYmd],
  )

  /**
   * Teaching days still to come. The header used to add a third figure for the
   * current half-day, counting only AM columns before noon — which is zero for
   * every afternoon group, all morning.
   */
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

  // Adjust during render (React's documented "reset state on key change"
  // pattern) rather than in an effect, so there's no extra commit/repaint.
  if (data.teachingDays.length > 0 && collapseInitedFor !== collapseInitKey) {
    setCollapseInitedFor(collapseInitKey)
    setCollapsedDays(new Set(futureDayKeys))
  }

  const allDaysCollapsed =
    data.teachingDays.length > 0 &&
    data.teachingDays.every(day => collapsedDays.has(`${day.date}-${day.period}`))
  const allRowsVisible =
    data.students.length > 0 &&
    data.students.every(student => rowGradeVisibility[student.id] ?? true)

  const toggleDayCollapsed = useCallback((date: string, period: string) => {
    setCollapsedDays(prev => {
      const next = new Set(prev)
      const key = `${date}-${period}`
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }, [])

  const setAllRowsVisible = useCallback(
    (visible: boolean) => {
      setRowGradeVisibility(Object.fromEntries(data.students.map(student => [student.id, visible])))
    },
    [data.students],
  )

  /** Apply a patch to one entry and persist it. */
  const handleEntryChange = useCallback(
    (entry: NotenEntryRow, patch: Partial<NotenEntryRow>) => {
      data.updateEntry(entry.studentId, entry.date, entry.period, patch)
      void data.saveEntries([{ ...entry, ...patch }])
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

  const textModalInitialValue = useMemo(() => {
    if (!textModal) return ''
    if (textModal.type === 'notizen') {
      return (
        data.entries[entryKey(textModal.studentId, textModal.date, textModal.period)]?.notizen ?? ''
      )
    }
    return data.lehrstoffByDay[`${textModal.date}-${textModal.period}`] ?? ''
  }, [textModal, data.entries, data.lehrstoffByDay])

  const closeTextModal = useCallback(() => {
    if (!textModal) return
    const value = textModalContentRef.current?.getValue() ?? ''

    if (textModal.type === 'notizen') {
      // The day may have no entry yet — the note itself is what creates it.
      const existing =
        data.entries[entryKey(textModal.studentId, textModal.date, textModal.period)] ??
        emptyEntry(textModal.studentId, textModal.date, textModal.period)
      data.updateEntry(textModal.studentId, textModal.date, textModal.period, { notizen: value })
      void data.saveEntries([{ ...existing, notizen: value }])
    } else {
      const key = `${textModal.date}-${textModal.period}`
      data.setLehrstoffByDay(prev => ({ ...prev, [key]: value }))
      void data.saveLehrstoff(textModal.date, textModal.period, value)
    }
    setTextModal(null)
  }, [textModal, data])

  const handleWeightChange = useCallback(
    (key: keyof WeightConfig, value: number) => {
      // Seed from the current weights (falling back to defaults) so the first
      // edit, made before any config is stored, starts from a full set.
      data.setWeightConfig(prev => ({ ...(prev ?? data.weights), [key]: value }))
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
  const groupPeriod = data.teachingDays[0]?.period
  const saving = data.saveState === 'saving'

  return (
    <TooltipProvider delayDuration={200}>
      <PageContainer size="wide" className="space-y-6">
        <PageHeader
          icon={GraduationCap}
          title={t('navigation.noten')}
          description={t('noten.subtitle', {
            defaultValue: 'Anwesenheit und Mitarbeit je Unterrichtstag erfassen.',
          })}
        />

        {/* A load failure is not dismissible: there is nothing behind it to
            get back to, and picking another group is what clears it. */}
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
              currentSlot={currentSlot}
              onSelectClass={selectClass}
              onSelectGroup={setSelectedGroupId}
            />

            {data.loading && (
              <div className="flex min-h-[240px] items-center justify-center">
                <Spinner size="lg" />
              </div>
            )}

            {!data.loading && !(selectedClass && selectedGroupId != null) && (
              <EmptyState
                icon={GraduationCap}
                title={t('noten.noGroupSelectedTitle', { defaultValue: 'Keine Gruppe ausgewählt' })}
                description={t('noten.noGroupSelectedDesc', {
                  defaultValue: 'Wähle oben eine Klasse und eine Gruppe.',
                })}
              />
            )}

            {selectedClass && selectedGroupId != null && !data.loading && (
              <Card>
                <CardHeader className="gap-4">
                  <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1.5">
                    <h2 className="truncate text-xl font-semibold tracking-tight">
                      {selectedClass.name} · {t('noten.gruppe')} {selectedGroupId}
                    </h2>
                    {groupPeriod && (
                      <Badge variant="secondary" className="gap-1">
                        {groupPeriod === 'AM' ? (
                          <Sun className="h-3 w-3" />
                        ) : (
                          <Sunset className="h-3 w-3" />
                        )}
                        {groupPeriod === 'AM'
                          ? t('noten.vormittag', { defaultValue: 'Vormittag' })
                          : t('noten.nachmittag', { defaultValue: 'Nachmittag' })}
                      </Badge>
                    )}
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
                        defaultValue:
                          'Noch {{semester}} Termine im Semester, {{fullYear}} im Schuljahr',
                        semester: remainingDays.semester,
                        fullYear: remainingDays.fullYear,
                      })}
                    </span>
                  </div>

                  <NotenToolbar
                    saveState={data.saveState}
                    saving={saving}
                    onSave={() => void data.saveAll()}
                    hasDays={data.teachingDays.length > 0}
                    allDaysCollapsed={allDaysCollapsed}
                    hasFutureDays={futureDayKeys.length > 0}
                    canCollapseSemester1={!!semesterChangeDate && semester1DayKeys.length > 0}
                    canCollapseSemester2={!!semesterChangeDate && semester2DayKeys.length > 0}
                    onExpandAllDays={() => setCollapsedDays(new Set())}
                    onCollapseAllDays={() =>
                      setCollapsedDays(
                        new Set(data.teachingDays.map(day => `${day.date}-${day.period}`)),
                      )
                    }
                    onCollapseFutureDays={() =>
                      setCollapsedDays(prev => new Set([...prev, ...futureDayKeys]))
                    }
                    onCollapseSemester1={() =>
                      setCollapsedDays(prev => new Set([...prev, ...semester1DayKeys]))
                    }
                    onCollapseSemester2={() =>
                      setCollapsedDays(prev => new Set([...prev, ...semester2DayKeys]))
                    }
                    gradesVisible={allRowsVisible}
                    hasStudents={data.students.length > 0}
                    onToggleGrades={() => setAllRowsVisible(!allRowsVisible)}
                    weights={data.weights}
                    weightsValid={data.weightsValid}
                    onWeightChange={handleWeightChange}
                    onWeightCommit={() => void data.saveWeights()}
                    search={{
                      open: search.open,
                      onOpenChange: search.setOpen,
                      searchText: search.searchText,
                      setSearchText: search.setSearchText,
                      searchDate: search.searchDate,
                      setSearchDate: search.setSearchDate,
                      message: search.message,
                      onNameSearch: () => void search.performNameSearch(),
                      onDateSearch: () => void search.performDateSearch(),
                    }}
                    nameMatchCount={search.nameMatches.length}
                    activeNameMatchIndex={search.activeNameMatchIndex}
                    nameMatchLabel={
                      search.activeNameMatch
                        ? `${search.activeNameMatch.lastName} ${search.activeNameMatch.firstName}`
                        : null
                    }
                    onNextNameMatch={search.gotoNextNameMatch}
                    onClearNameSearch={search.clearNameSearch}
                    canTransfer={canTransfer}
                    groupId={selectedGroupId}
                    canTransferAllGroups={selectedClass.groupIds.length > 0}
                    onTransferGroup={() => transfer.start('group')}
                    onTransferAllGroups={() => transfer.start('all')}
                  />
                </CardHeader>

                <CardContent className="space-y-4">
                  <DateMatchList
                    matches={search.dateMatches}
                    studentsByGroup={search.studentsByGroup}
                    onOpenGroup={(classId, groupId) => {
                      setSelectedClassId(classId)
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
                        defaultValue:
                          'Dieser Gruppe sind für dieses Schuljahr keine Schüler zugeordnet.',
                      })}
                    />
                  ) : data.teachingDays.length === 0 ? (
                    <EmptyState
                      icon={CalendarX}
                      title={t('noten.noTeachingDaysTitle', {
                        defaultValue: 'Keine Unterrichtstage',
                      })}
                      description={t('noten.noTeachingDaysDesc', {
                        defaultValue:
                          'Für diese Gruppe ist im gewählten Schuljahr kein Turnus geplant.',
                      })}
                    />
                  ) : (
                    <NotenGrid
                      teachingDays={data.teachingDays}
                      students={data.students}
                      entries={data.entries}
                      lehrstoffByDay={data.lehrstoffByDay}
                      finalGrades={data.finalGrades}
                      summary={summary}
                      collapsedDays={collapsedDays}
                      rowGradeVisibility={rowGradeVisibility}
                      highlightedStudentId={search.highlightedStudentId}
                      focusDateYmd={search.focusDateYmd}
                      todayYmd={todayYmd}
                      semesterChangeDate={semesterChangeDate}
                      saving={saving}
                      sitzplatzLeft={sitzplatzLeft}
                      nameColumnRef={nameColumnRef}
                      registerDayColumn={registerDayColumn}
                      studentRowRefs={search.studentRowRefs}
                      onToggleDay={toggleDayCollapsed}
                      onToggleRowVisible={(studentId, visible) =>
                        setRowGradeVisibility(prev => ({ ...prev, [studentId]: visible }))
                      }
                      onSetAllAnwesend={(date, period) => void data.setAllAnwesend(date, period)}
                      onEntryChange={handleEntryChange}
                      onSitzplatzChange={(studentId, value) =>
                        data.updateSitzplatz(studentId, value)
                      }
                      onFinalGradeChange={data.setFinalGrade}
                      onFinalGradeCommit={handleFinalGradeCommit}
                      onOpenNotizen={(studentId, date, period) =>
                        setTextModal({ type: 'notizen', studentId, date, period })
                      }
                      onOpenLehrstoff={(date, period) =>
                        setTextModal({ type: 'lehrstoff', date, period })
                      }
                    />
                  )}
                </CardContent>
              </Card>
            )}
          </>
        )}

        <TextModal
          state={textModal}
          initialValue={textModalInitialValue}
          contentRef={textModalContentRef}
          onClose={closeTextModal}
        />

        <NmTransferDialog {...transfer} />
      </PageContainer>
    </TooltipProvider>
  )
}
