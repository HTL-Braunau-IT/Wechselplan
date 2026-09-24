'use client'

import { useMemo, useState } from 'react'
import { useSession } from 'next-auth/react'
import { useTranslation } from 'react-i18next'
import { CalendarX2 } from 'lucide-react'
import { EmptyState } from '@/components/ui/empty-state'
import { Spinner } from '@/components/ui/spinner'
import { useSchoolYear } from '@/contexts/school-year-context'
import { useEntitlements } from '@/contexts/entitlements-context'
import { useUnsavedWarning } from '@/hooks/use-unsaved-warning'
import { entryKey } from '@/lib/grades'
import { useNotenData } from '@/app/noten/_hooks/use-noten-data'
import { emptyEntry } from '@/app/noten/_lib/types'
import { computeStudentSummary } from '@/app/noten/_lib/summary'
import { useTeacherWeek } from './use-teacher-week'
import { turnusSummary } from './resolve-slot'
import { WeekStrip } from './week-strip'
import { TodayPanel, FreeDayPanel, type RosterEntry } from './today-panel'
import { OffenCard, type OpenTask } from './offen-card'
import { KlasseCard } from './klasse-card'

const WEEKDAY_LONG = ['Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag']

function todayLocalYmd(now: Date): string {
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(
    now.getDate(),
  ).padStart(2, '0')}`
}

/**
 * The teacher/admin home screen: a week strip to pick a day, today's teaching
 * slot with live attendance, and the open-tasks and class-info cards beside it.
 * Attendance and the derived counts run through {@link useNotenData}, the same
 * source the Notenliste writes with, so a mark taken here shows there too.
 */
export function TeacherDashboard() {
  const { t } = useTranslation('common')
  const { data: session } = useSession()
  const { selectedYear, currentSemester } = useSchoolYear()
  const { isFeatureEnabled } = useEntitlements()

  const schoolYearId = selectedYear?.id ?? null
  const notenEnabled = isFeatureEnabled('noten')

  const week = useTeacherWeek(session?.user?.name, schoolYearId)
  const { now, days } = week
  const todayYmd = todayLocalYmd(now)

  const initialWeekday = now.getDay() >= 1 && now.getDay() <= 5 ? now.getDay() : 1
  const [selectedWeekday, setSelectedWeekday] = useState(initialWeekday)
  const [preferredPeriod, setPreferredPeriod] = useState<'AM' | 'PM'>(
    now.getHours() < 12 ? 'AM' : 'PM',
  )

  const day = days[selectedWeekday - 1] ?? null
  const hasAM = day?.hasAM ?? false
  const hasPM = day?.hasPM ?? false
  const effectivePeriod: 'AM' | 'PM' =
    hasAM && hasPM ? preferredPeriod : hasAM ? 'AM' : hasPM ? 'PM' : preferredPeriod
  const activeSlot = day?.slots.find(s => s.period === effectivePeriod) ?? day?.slots[0] ?? null

  // Only touch the noten APIs when the feature is on and a group is resolved;
  // passing null ids keeps useNotenData idle otherwise (no 403 noise).
  const notenClassId = notenEnabled ? (activeSlot?.classId ?? null) : null
  const notenGroupId = notenEnabled ? (activeSlot?.groupId ?? null) : null
  const data = useNotenData({
    classId: notenClassId,
    groupId: notenGroupId,
    schoolYearId,
    // The slot's group is that weekday's group (groups are per weekday).
    weekday: selectedWeekday,
  })
  useUnsavedWarning(data.hasUnsavedWork)

  const selectedDate = day?.ymd ?? todayYmd
  const canRecord = notenEnabled && activeSlot?.groupId != null

  const roster: RosterEntry[] = useMemo(() => {
    if (canRecord && data.students.length > 0) {
      return data.students.map(s => ({ id: s.id, firstName: s.firstName, lastName: s.lastName }))
    }
    return (activeSlot?.students ?? []).map(s => ({
      id: s.id,
      firstName: s.firstName,
      lastName: s.lastName,
    }))
  }, [canRecord, data.students, activeSlot])

  const summary = useMemo(
    () =>
      computeStudentSummary(data.students, data.teachingDays, data.entries, data.weights, todayYmd),
    [data.students, data.teachingDays, data.entries, data.weights, todayYmd],
  )

  const attendanceOf = (studentId: number): string | null =>
    data.entries[entryKey(studentId, selectedDate, effectivePeriod)]?.attendance ?? null

  const missingGrade = (studentId: number): boolean =>
    canRecord && summary[studentId] ? summary[studentId]!.calculatedGrade == null : false

  const handleSetAttendance = (studentId: number, value: string) => {
    const key = entryKey(studentId, selectedDate, effectivePeriod)
    const existing = data.entries[key] ?? emptyEntry(studentId, selectedDate, effectivePeriod)
    const next = existing.attendance === value ? null : value
    data.updateEntry(studentId, selectedDate, effectivePeriod, { attendance: next })
    void data.saveEntries([{ ...existing, attendance: next }])
  }

  const notenHref = activeSlot
    ? `/noten?classId=${activeSlot.classId}${
        activeSlot.groupId != null ? `&groupId=${activeSlot.groupId}` : ''
      }`
    : '/noten'

  // Turnus summary for the strip: prefer the selected day's class, else any day
  // that has a slot, so a free day still shows the running turnus.
  const turnus = useMemo(() => {
    const dayWithSlot = activeSlot ? day : days.find(d => d.slots.length > 0)
    const classId = (activeSlot ?? dayWithSlot?.slots[0])?.classId
    const idx = (dayWithSlot?.weekday ?? selectedWeekday) - 1
    return turnusSummary(week.rawByWeekday[idx] ?? null, classId, now)
  }, [activeSlot, day, days, selectedWeekday, week.rawByWeekday, now])

  // Next teaching slot from the selected day forward, for the free-day card.
  const nextAssignment = ((): { label: string; weekday: number; period: 'AM' | 'PM' } | null => {
    for (let i = 0; i < days.length; i++) {
      const candidate = days[(selectedWeekday - 1 + i) % days.length]
      if (!candidate || candidate.slots.length === 0) continue
      if (candidate.weekday === selectedWeekday && i === 0) continue
      const slot = candidate.slots[0]!
      const dd = `${String(candidate.date.getDate()).padStart(2, '0')}.${String(
        candidate.date.getMonth() + 1,
      ).padStart(2, '0')}.`
      const label = `${WEEKDAY_LONG[candidate.weekday - 1] ?? ''}, ${dd}, ${slot.className}, ${t(
        'dashboard.groupWithNumber',
        { group: slot.groupId ?? '—', defaultValue: 'Gruppe {{group}}' },
      )}${slot.scheduleTime ? `, ${slot.scheduleTime.startTime}` : ''}`
      return { label, weekday: candidate.weekday, period: slot.period }
    }
    return null
  })()

  const openTasks: OpenTask[] = (() => {
    if (!activeSlot) return []
    const tasks: OpenTask[] = []
    const recorded = roster.filter(s => attendanceOf(s.id) != null).length
    const open = roster.length - recorded
    tasks.push({
      key: 'attendance',
      tone: open > 0 ? 'warning' : 'success',
      title:
        open > 0
          ? t('dashboard.taskAttendanceOpen', {
              count: open,
              defaultValue: 'Anwesenheit: {{count}} offen',
            })
          : t('dashboard.taskAttendanceDone', { defaultValue: 'Anwesenheit erfasst' }),
      detail: t('dashboard.taskAttendanceDetail', {
        class: activeSlot.className,
        group: activeSlot.groupId ?? '—',
        defaultValue: '{{class}}, Gruppe {{group}}',
      }),
      href: notenHref,
    })

    if (canRecord) {
      const missing = roster.filter(s => missingGrade(s.id)).length
      if (missing > 0) {
        tasks.push({
          key: 'missing-grades',
          tone: 'warning',
          title: t('dashboard.taskMissingGrades', {
            count: missing,
            defaultValue: '{{count}} Schüler ohne Note',
          }),
          detail: t('dashboard.taskMissingGradesDetail', {
            defaultValue: 'Im laufenden Turnus noch nicht beurteilt',
          }),
          href: notenHref,
        })
      }

      if (currentSemester) {
        const missingFinals = roster.filter(
          s => data.finalGrades[s.id]?.[currentSemester]?.grade == null,
        ).length
        if (missingFinals > 0) {
          tasks.push({
            key: 'endnoten',
            tone: 'destructive',
            title: activeSlot.turnName
              ? t('dashboard.taskEndnotenNamed', {
                  turnus: activeSlot.turnName,
                  defaultValue: 'Endnoten für {{turnus}}',
                })
              : t('dashboard.taskEndnoten', { defaultValue: 'Endnoten offen' }),
            detail: t('dashboard.taskEndnotenDetail', {
              count: missingFinals,
              defaultValue: '{{count}} Endnoten fehlen',
            }),
            href: notenHref,
          })
        }
      }
    }
    return tasks
  })()

  // ---- render ------------------------------------------------------------

  if (!schoolYearId) {
    return (
      <div className="w-full px-4 py-6 sm:px-6">
        <EmptyState
          icon={CalendarX2}
          title={t('noten.noSchoolYear', { defaultValue: 'Kein Schuljahr' })}
        />
      </div>
    )
  }

  const greeting = session?.user?.firstName
    ? t('dashboard.greeting', {
        name: session.user.firstName,
        defaultValue: 'Hallo {{name}}',
      })
    : ''
  const todayLong = now.toLocaleDateString('de-DE', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  })

  const noSchedule = !week.isLoading && days.every(d => d.slots.length === 0)
  const freeDayTitle = t('dashboard.freeDayTitle', {
    weekday: WEEKDAY_LONG[selectedWeekday - 1] ?? '',
    defaultValue: 'Kein Einsatz am {{weekday}}',
  })

  return (
    <div className="flex w-full flex-col gap-4 px-4 py-5 sm:px-6">
      <header className="flex flex-wrap items-baseline gap-x-2.5 gap-y-1">
        <h1 className="text-base font-semibold tracking-tight">{todayLong}</h1>
        {greeting && <span className="text-muted-foreground text-sm">{greeting}</span>}
      </header>

      {week.isLoading ? (
        <div className="flex min-h-[320px] items-center justify-center">
          <Spinner size="lg" />
        </div>
      ) : noSchedule ? (
        <EmptyState
          icon={CalendarX2}
          title={t('overview.teacher.noSchedule', {
            defaultValue: 'Kein Wechselplan für diese Woche gefunden',
          })}
          description={t('overview.teacher.noScheduleHint', {
            defaultValue: 'Für dich ist in diesem Schuljahr kein Wechselplan hinterlegt.',
          })}
        />
      ) : (
        <>
          <WeekStrip
            days={days}
            selectedWeekday={selectedWeekday}
            onSelect={setSelectedWeekday}
            turnus={turnus}
          />

          <div className="flex flex-wrap items-start gap-4">
            {activeSlot ? (
              <TodayPanel
                slot={activeSlot}
                hasAM={hasAM}
                hasPM={hasPM}
                selectedPeriod={effectivePeriod}
                onPickPeriod={setPreferredPeriod}
                roster={roster}
                interactive={Boolean(canRecord) && !data.loading}
                saveState={data.saveState}
                attendanceOf={attendanceOf}
                missingGrade={missingGrade}
                onSetAttendance={handleSetAttendance}
                onSetAllPresent={() => void data.setAllAnwesend(selectedDate, effectivePeriod)}
                notenHref={notenHref}
                studentHref={() => notenHref}
              />
            ) : (
              <FreeDayPanel
                title={freeDayTitle}
                nextLabel={nextAssignment?.label ?? null}
                onGoNext={
                  nextAssignment
                    ? () => {
                        setSelectedWeekday(nextAssignment.weekday)
                        setPreferredPeriod(nextAssignment.period)
                      }
                    : undefined
                }
              />
            )}

            <div className="flex min-w-[min(100%,300px)] flex-[2_1_320px] flex-wrap items-start gap-4">
              {activeSlot && <OffenCard tasks={openTasks} />}
              {activeSlot && (
                <KlasseCard
                  className={activeSlot.className}
                  classHead={activeSlot.classHead}
                  classLead={activeSlot.classLead}
                  otherGroups={activeSlot.otherGroups}
                  breaks={activeSlot.breakTimes}
                  additionalInfo={activeSlot.additionalInfo}
                />
              )}
            </div>
          </div>
        </>
      )}
    </div>
  )
}
