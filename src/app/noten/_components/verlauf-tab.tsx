'use client'

import { useTranslation } from 'react-i18next'
import { CalendarRange } from 'lucide-react'
import { entryKey, getGradeBoxClass } from '@/lib/grades'
import { cn } from '@/lib/utils'
import { PERIOD_SHORT, fmtGrade, roundHalf } from '../_lib/erfassen'
import { dayGradeValue } from '../_lib/summary'
import type { NotenEntryRow, Student, TeachingDay, WeightConfig } from '../_lib/types'

const HEAD =
  'bg-muted border-border sticky top-0 z-[5] flex items-center border-b px-2 text-[11px] font-medium'

function shortDate(date: string): string {
  const [, m, d] = date.split('-')
  return `${d}.${m}.`
}

/**
 * A compact term history: one row per student, one column per teaching day,
 * showing the day's average (tinted) or an attendance initial for absences.
 * Frozen Name column, the two totals pinned to the right.
 */
export function VerlaufTab({
  teachingDays,
  students,
  entries,
  weights,
  hideGrades,
  todayYmd,
}: {
  teachingDays: TeachingDay[]
  students: Student[]
  entries: Record<string, NotenEntryRow>
  weights: WeightConfig
  hideGrades: boolean
  todayYmd: string
}) {
  const { t } = useTranslation('common')

  const cols = `220px repeat(${teachingDays.length},52px) 70px 70px`

  return (
    <div className="border-border bg-card overflow-hidden rounded-lg border shadow-sm">
      <div className="border-border flex items-center gap-2 border-b px-5 py-4">
        <CalendarRange className="h-4 w-4" />
        <span className="text-base font-semibold">
          {t('noten.verlaufTitle', { defaultValue: 'Verlauf' })}
        </span>
        <span className="text-muted-foreground ml-auto text-xs">
          {t('noten.verlaufHint', {
            defaultValue: 'Zahlen sind Tagesdurchschnitte, Buchstaben stehen für die Abwesenheit',
          })}
        </span>
      </div>

      <div className="overflow-x-auto">
        <div className="grid text-sm" style={{ gridTemplateColumns: cols, width: 'max-content', minWidth: '100%' }}>
          <div className={cn(HEAD, 'left-0 z-[6] h-9')}>{t('noten.name')}</div>
          {teachingDays.map(day => {
            return (
              <div
                key={`${day.date}-${day.period}`}
                className={cn(HEAD, 'h-9 flex-col items-center justify-center gap-px tabular-nums')}
              >
                <span className="leading-none">{shortDate(day.date)}</span>
                <span className="text-muted-foreground text-[10px] leading-none tracking-wide">
                  {PERIOD_SHORT[day.period] ?? day.period}
                </span>
              </div>
            )
          })}
          <div className={cn(HEAD, 'h-9 justify-center')}>
            {t('noten.verlaufFehlt', { defaultValue: 'Fehlt' })}
          </div>
          <div className={cn(HEAD, 'h-9 justify-center')}>
            {t('noten.verlaufAvg', { defaultValue: 'Ø Note' })}
          </div>

          {students.map(student => {
            let absent = 0
            const dayVals: number[] = []
            const cells = teachingDays.map(day => {
              const entry = entries[entryKey(student.id, day.date, day.period)]
              const att = entry?.attendance ?? null
              const isAbsent = att != null && att !== 'Anwesend'
              if (isAbsent) absent++
              const avg = dayGradeValue(entry, weights)
              if (avg != null) dayVals.push(avg)
              const isToday = day.date === todayYmd
              const tinted = !hideGrades && !isAbsent && avg != null
              const label =
                att == null
                  ? '·'
                  : att === 'Anwesend'
                    ? hideGrades
                      ? '•'
                      : fmtGrade(avg)
                    : att.charAt(0)
              return (
                <div
                  key={`${day.date}-${day.period}`}
                  title={`${shortDate(day.date)} · ${att ?? t('noten.notRecorded', { defaultValue: 'nicht erfasst' })}`}
                  className={cn(
                    'border-border/60 flex h-10 items-center justify-center border-r border-b text-xs tabular-nums',
                    isAbsent && 'bg-destructive/10',
                    tinted && getGradeBoxClass(roundHalf(avg!)),
                    !isAbsent && avg == null && isToday && 'bg-accent',
                    att == null ? 'text-muted-foreground' : 'text-foreground',
                  )}
                >
                  {label}
                </div>
              )
            })
            const rowAvg = dayVals.length
              ? roundHalf(dayVals.reduce((a, b) => a + b, 0) / dayVals.length)
              : null
            return (
              <div key={student.id} className="contents">
                <div className="bg-card border-border/60 sticky left-0 z-[2] flex h-10 items-center overflow-hidden border-b px-3 text-ellipsis whitespace-nowrap shadow-[1px_0_0_0_var(--color-border)]">
                  {student.lastName}, {student.firstName}
                </div>
                {cells}
                <div
                  className={cn(
                    'border-border/60 flex h-10 items-center justify-center border-b tabular-nums',
                    absent > 1 ? 'text-destructive' : 'text-muted-foreground',
                  )}
                >
                  {absent}
                </div>
                <div className="border-border/60 flex h-10 items-center justify-center border-b font-medium tabular-nums">
                  {hideGrades ? '•••' : fmtGrade(rowAvg)}
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
