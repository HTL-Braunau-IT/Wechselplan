'use client'

import Link from 'next/link'
import { useTranslation } from 'react-i18next'
import { CalendarOff, Clock, ListChecks, MapPin, Users } from 'lucide-react'
import { SaveStatus, type SaveState } from '@/components/save-status'
import { cn } from '@/lib/utils'
import { ATTENDANCE_OPTIONS } from '@/lib/grades'
import { groupTint } from './group-tint'
import type { ResolvedSlot } from './resolve-slot'

export type RosterEntry = { id: number; firstName: string; lastName: string }

/** Short label + colour tone per attendance state, in the app's canonical order. */
const ATT_META: Record<
  string,
  { short: string; tone: 'success' | 'info' | 'warning' | 'destructive' }
> = {
  Anwesend: { short: 'Anw.', tone: 'success' },
  Krank: { short: 'Krank', tone: 'info' },
  Entschuldigt: { short: 'Entsch.', tone: 'warning' },
  Unentschuldigt: { short: 'Unent.', tone: 'destructive' },
}

const TONE_ACTIVE: Record<string, string> = {
  success: 'border-success/45 bg-success/[.14] text-foreground',
  info: 'border-info/45 bg-info/[.14] text-foreground',
  warning: 'border-warning/50 bg-warning/[.16] text-foreground',
  destructive: 'border-destructive/45 bg-destructive/[.14] text-foreground',
}

function initials(first: string, last: string): string {
  return (first.charAt(0) + last.charAt(0)).toUpperCase()
}

export type TodayPanelProps = {
  slot: ResolvedSlot
  /** Whether the teacher has both halves this day, enabling the AM/PM toggle. */
  hasAM: boolean
  hasPM: boolean
  selectedPeriod: 'AM' | 'PM'
  onPickPeriod: (period: 'AM' | 'PM') => void
  roster: RosterEntry[]
  /** Whether attendance can be recorded (noten licensed + group resolved). */
  interactive: boolean
  saveState: SaveState
  attendanceOf: (studentId: number) => string | null
  missingGrade: (studentId: number) => boolean
  onSetAttendance: (studentId: number, value: string) => void
  onSetAllPresent: () => void
  notenHref: string
  studentHref: (studentId: number) => string
}

export function TodayPanel(props: TodayPanelProps) {
  const { t } = useTranslation('common')
  const {
    slot,
    hasAM,
    hasPM,
    selectedPeriod,
    onPickPeriod,
    roster,
    interactive,
    saveState,
    attendanceOf,
    missingGrade,
    onSetAttendance,
    onSetAllPresent,
    notenHref,
    studentHref,
  } = props

  const recorded = roster.filter(s => attendanceOf(s.id) != null).length
  const total = roster.length
  const open = total - recorded
  const tally =
    open > 0
      ? t('dashboard.tallyOpen', {
          done: recorded,
          total,
          defaultValue: '{{done}} von {{total}} erfasst',
        })
      : t('dashboard.tallyAllPresent', { total, defaultValue: 'Alle {{total}} erfasst' })

  const groupLabel =
    slot.period === 'AM'
      ? t('dashboard.amGroup', { defaultValue: 'Vormittagsgruppe' })
      : t('dashboard.pmGroup', { defaultValue: 'Nachmittagsgruppe' })

  return (
    <section
      data-screen-label="Heute"
      className="border-border bg-card flex min-w-[min(100%,480px)] flex-[3_1_560px] flex-col overflow-hidden rounded-lg border shadow-sm"
    >
      {/* Slot identity */}
      <div className="bg-muted/30 border-border flex flex-wrap items-center gap-3 border-b px-5 py-4">
        <span
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[14px] text-xl font-semibold tabular-nums"
          style={groupTint(slot.groupId)}
        >
          {slot.groupId ?? '—'}
        </span>
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <h2 className="truncate text-xl font-semibold tracking-tight">{slot.className}</h2>
            <span className="text-muted-foreground text-sm">{groupLabel}</span>
          </div>
          <p className="text-muted-foreground mt-0.5 flex items-center gap-3 text-sm tabular-nums">
            {slot.scheduleTime && (
              <span className="inline-flex items-center gap-1.5">
                <Clock className="h-3.5 w-3.5" aria-hidden />
                {slot.scheduleTime.startTime} – {slot.scheduleTime.endTime}
              </span>
            )}
            {slot.roomName && (
              <span className="inline-flex items-center gap-1.5">
                <MapPin className="h-3.5 w-3.5" aria-hidden />
                {slot.roomName}
              </span>
            )}
          </p>
        </div>
        <div className="ml-auto flex items-center gap-2">
          {hasAM && hasPM && (
            <div className="bg-muted flex rounded-md p-[3px]">
              {(['AM', 'PM'] as const).map(period => (
                <button
                  key={period}
                  type="button"
                  onClick={() => onPickPeriod(period)}
                  className={cn(
                    'rounded-sm px-3 py-[5px] text-xs font-medium transition-colors',
                    selectedPeriod === period
                      ? 'bg-background text-foreground shadow-sm'
                      : 'text-muted-foreground hover:text-foreground',
                  )}
                >
                  {period === 'AM'
                    ? t('dashboard.vormittag', { defaultValue: 'Vormittag' })
                    : t('dashboard.nachmittag', { defaultValue: 'Nachmittag' })}
                </button>
              ))}
            </div>
          )}
          <Link
            href={notenHref}
            className="bg-primary text-primary-foreground hover:bg-primary/90 inline-flex h-9 items-center gap-2 rounded-md px-4 text-sm font-medium shadow-sm transition-colors"
          >
            <ListChecks className="h-4 w-4" aria-hidden />
            {t('dashboard.gradeList', { defaultValue: 'Notenliste' })}
          </Link>
        </div>
      </div>

      {/* Attendance controls */}
      <div className="border-border flex flex-wrap items-center gap-x-4 gap-y-2 border-b px-5 py-2.5">
        <p className="flex items-center gap-1.5 text-sm font-medium">
          <Users className="text-muted-foreground h-4 w-4" aria-hidden />
          {t('dashboard.attendance', { defaultValue: 'Anwesenheit' })}
        </p>
        <span className="text-muted-foreground text-sm tabular-nums">{tally}</span>
        <div className="ml-auto flex items-center gap-3">
          <SaveStatus state={saveState} />
          {interactive && (
            <button
              type="button"
              onClick={onSetAllPresent}
              className="border-input bg-background text-foreground hover:bg-accent h-8 rounded-md border px-3 text-xs font-medium whitespace-nowrap shadow-xs transition-colors"
            >
              {t('dashboard.allPresent', { defaultValue: 'Alle anwesend' })}
            </button>
          )}
        </div>
      </div>

      {/* Roster */}
      {roster.length === 0 ? (
        <p className="text-muted-foreground px-5 py-10 text-center text-sm">
          {t('dashboard.noStudents', {
            defaultValue: 'Dieser Gruppe sind keine Schüler zugeordnet.',
          })}
        </p>
      ) : (
        <ul className="flex flex-col">
          {roster.map((student, i) => {
            const state = attendanceOf(student.id)
            const meta = state ? ATT_META[state] : null
            const rowTint =
              meta?.tone === 'destructive'
                ? 'color-mix(in oklab, var(--destructive) 6%, transparent)'
                : meta?.tone === 'warning' || meta?.tone === 'info'
                  ? 'color-mix(in oklab, var(--warning) 6%, transparent)'
                  : undefined
            return (
              <li
                key={student.id}
                className={cn(
                  'flex items-center gap-2.5 px-5 py-1.5',
                  i < roster.length - 1 && 'border-border/60 border-b',
                  !rowTint && i % 2 === 1 && 'bg-muted/25',
                )}
                style={rowTint ? { background: rowTint } : undefined}
              >
                <span className="text-muted-foreground w-[18px] shrink-0 text-right text-xs tabular-nums">
                  {i + 1}
                </span>
                <span className="bg-muted text-muted-foreground flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[11px] font-medium">
                  {initials(student.firstName, student.lastName)}
                </span>
                <Link
                  href={studentHref(student.id)}
                  title={t('dashboard.toStudentGrades', {
                    defaultValue: 'Zur Notenliste dieses Schülers',
                  })}
                  className="text-foreground hover:text-primary truncate text-sm no-underline hover:underline"
                >
                  {student.firstName} {student.lastName}
                </Link>
                {missingGrade(student.id) && (
                  <span
                    title={t('dashboard.missingGradeHint', {
                      defaultValue: 'Noch keine Note im laufenden Turnus',
                    })}
                    className="text-warning-foreground inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-px text-xs font-medium"
                    style={{ background: 'color-mix(in oklab, var(--warning) 15%, transparent)' }}
                  >
                    <span
                      className="h-1.5 w-1.5 rounded-full"
                      style={{ background: 'var(--warning)' }}
                    />
                    {t('dashboard.withoutGrade', { defaultValue: 'ohne Note' })}
                  </span>
                )}
                {interactive && (
                  <div className="ml-auto flex shrink-0 items-center gap-1">
                    {ATTENDANCE_OPTIONS.map(option => {
                      const active = state === option
                      const tone = ATT_META[option]?.tone ?? 'success'
                      return (
                        <button
                          key={option}
                          type="button"
                          title={option}
                          aria-pressed={active}
                          onClick={() => onSetAttendance(student.id, option)}
                          className={cn(
                            'h-[26px] rounded-sm border px-2 text-xs font-medium transition-colors',
                            active
                              ? TONE_ACTIVE[tone]
                              : 'border-border text-muted-foreground hover:bg-accent',
                            active && 'font-semibold',
                          )}
                        >
                          {ATT_META[option]?.short ?? option}
                        </button>
                      )
                    })}
                  </div>
                )}
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )
}

/** The "no slot today" empty state, shown in place of {@link TodayPanel}. */
export function FreeDayPanel({
  title,
  nextLabel,
  onGoNext,
}: {
  title: string
  nextLabel: string | null
  onGoNext?: () => void
}) {
  const { t } = useTranslation('common')
  return (
    <section
      data-screen-label="Heute"
      className="border-border bg-card flex min-w-[min(100%,480px)] flex-[3_1_560px] flex-col items-center gap-4 overflow-hidden rounded-lg border px-6 py-10 shadow-sm"
    >
      <span className="bg-muted text-muted-foreground flex h-14 w-14 items-center justify-center rounded-xl">
        <CalendarOff className="h-6 w-6" aria-hidden />
      </span>
      <div className="text-center">
        <p className="text-base font-semibold">{title}</p>
        <p className="text-muted-foreground mt-1 text-sm">
          {t('dashboard.freeDayHint', {
            defaultValue: 'Für diesen Tag ist im Wechselplan keine Gruppe für dich eingeteilt.',
          })}
        </p>
      </div>
      {nextLabel && (
        <div
          className="flex flex-wrap items-center justify-center gap-3 rounded-xl border px-4 py-3"
          style={{
            borderColor: 'color-mix(in oklab, var(--primary) 30%, transparent)',
            background: 'color-mix(in oklab, var(--primary) 5%, transparent)',
          }}
        >
          <span className="text-muted-foreground text-xs font-medium tracking-wide uppercase">
            {t('dashboard.nextAssignment', { defaultValue: 'Nächster Einsatz' })}
          </span>
          <span className="text-sm font-semibold tabular-nums">{nextLabel}</span>
          {onGoNext && (
            <button
              type="button"
              onClick={onGoNext}
              className="bg-primary text-primary-foreground inline-flex h-8 items-center gap-1.5 rounded-md px-3 text-xs font-medium"
            >
              {t('dashboard.jumpThere', { defaultValue: 'Hinspringen' })}
            </button>
          )}
        </div>
      )}
    </section>
  )
}
