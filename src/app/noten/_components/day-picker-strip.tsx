'use client'

import { useTranslation } from 'react-i18next'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { cn } from '@/lib/utils'
import { PERIOD_SHORT } from '../_lib/erfassen'
import type { TeachingDay } from '../_lib/types'

/** dd.mm. from a YYYY-MM-DD date. */
function shortDate(date: string): string {
  const [, m, d] = date.split('-')
  return `${d}.${m}.`
}

type Half = { index: number; period: string }
type Group = { date: string; isToday: boolean; halves: Half[] }

/**
 * Horizontal picker over the term's teaching days. Each date is a card; a date
 * scheduled both halves shows a Vormittag and a Nachmittag button side by side,
 * because a group can be taught morning *and* afternoon on the same day and the
 * two are recorded independently. A small dot per half signals how far its
 * attendance has been recorded.
 */
export function DayPickerStrip({
  teachingDays,
  dayIndex,
  todayYmd,
  dayStats,
  onSelect,
  onPrev,
  onNext,
}: {
  teachingDays: TeachingDay[]
  dayIndex: number
  todayYmd: string
  dayStats: (index: number) => { done: number; total: number }
  onSelect: (index: number) => void
  onPrev: () => void
  onNext: () => void
}) {
  const { t } = useTranslation('common')

  const groups: Group[] = []
  teachingDays.forEach((day, index) => {
    const last = groups[groups.length - 1]
    if (last?.date === day.date) {
      last.halves.push({ index, period: day.period })
      return
    }
    groups.push({ date: day.date, isToday: day.date === todayYmd, halves: [{ index, period: day.period }] })
  })

  return (
    <div className="flex items-center gap-2">
      <button
        type="button"
        aria-label={t('noten.prevDay', { defaultValue: 'Vorheriger Unterrichtstag' })}
        onClick={onPrev}
        disabled={dayIndex <= 0}
        className="border-input bg-background text-muted-foreground hover:bg-accent hover:text-accent-foreground flex h-14 w-9 shrink-0 items-center justify-center rounded-md border shadow-sm transition-colors disabled:opacity-50"
      >
        <ChevronLeft className="h-5 w-5" aria-hidden />
      </button>

      <div className="flex flex-1 gap-1.5 overflow-x-auto p-0.5">
        {groups.map(group => (
          <div
            key={group.date}
            className={cn(
              'bg-card flex shrink-0 flex-col gap-1 rounded-md border p-1.5 shadow-sm',
              group.isToday ? 'border-primary/35' : 'border-border',
            )}
            style={{ minWidth: 76 }}
          >
            <span className="text-center text-sm font-semibold tabular-nums">
              {shortDate(group.date)}
            </span>
            <div className="flex gap-1">
              {group.halves.map(half => {
                const selected = half.index === dayIndex
                const stats = dayStats(half.index)
                const tone =
                  stats.done === 0
                    ? 'idle'
                    : stats.done === stats.total
                      ? 'done'
                      : 'partial'
                const stateLabel =
                  stats.done === 0
                    ? t('noten.notRecorded', { defaultValue: 'nicht erfasst' })
                    : stats.done === stats.total
                      ? t('noten.fullyRecorded', { defaultValue: 'vollständig erfasst' })
                      : t('noten.partiallyRecorded', { defaultValue: 'teilweise erfasst' })
                const periodLong =
                  half.period === 'AM'
                    ? t('noten.vormittag', { defaultValue: 'Vormittag' })
                    : t('noten.nachmittag', { defaultValue: 'Nachmittag' })
                return (
                  <button
                    key={half.index}
                    type="button"
                    onClick={() => onSelect(half.index)}
                    aria-current={selected ? 'true' : undefined}
                    title={`${shortDate(group.date)} · ${periodLong} · ${t('noten.progressRecorded', {
                      done: stats.done,
                      total: stats.total,
                      defaultValue: `${stats.done} von ${stats.total} erfasst`,
                    })}`}
                    className={cn(
                      'flex min-w-[30px] flex-1 flex-col items-center gap-1 rounded-sm border px-1.5 py-1 text-[11px] font-semibold tracking-wide transition-colors',
                      selected
                        ? 'border-primary bg-primary/10 text-foreground'
                        : 'border-input text-muted-foreground hover:bg-accent',
                    )}
                  >
                    {PERIOD_SHORT[half.period] ?? half.period}
                    <span
                      role="img"
                      aria-label={stateLabel}
                      className={cn(
                        'h-1.5 w-1.5 rounded-full border',
                        tone === 'idle' && 'border-muted-foreground bg-transparent',
                        tone === 'partial' && 'border-warning bg-warning',
                        tone === 'done' && 'border-success bg-success',
                      )}
                    />
                  </button>
                )
              })}
            </div>
          </div>
        ))}
      </div>

      <button
        type="button"
        aria-label={t('noten.nextDay', { defaultValue: 'Nächster Unterrichtstag' })}
        onClick={onNext}
        disabled={dayIndex >= teachingDays.length - 1}
        className="border-input bg-background text-muted-foreground hover:bg-accent hover:text-accent-foreground flex h-14 w-9 shrink-0 items-center justify-center rounded-md border shadow-sm transition-colors disabled:opacity-50"
      >
        <ChevronRight className="h-5 w-5" aria-hidden />
      </button>
    </div>
  )
}
