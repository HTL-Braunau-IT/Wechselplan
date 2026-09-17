'use client'

import { useTranslation } from 'react-i18next'
import { ArrowDownUp } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { WeekDay } from './use-teacher-week'

function SlotPill({ label, on }: { label: string; on: boolean }) {
  return (
    <span
      className={cn(
        'inline-flex h-[18px] items-center rounded-full px-1.5 text-[11px]',
        on
          ? 'border-primary/30 bg-primary/[.12] text-foreground border font-semibold'
          : 'border-border text-muted-foreground border border-dashed font-medium',
      )}
    >
      {label}
    </span>
  )
}

export type WeekStripProps = {
  days: WeekDay[]
  selectedWeekday: number
  onSelect: (weekday: number) => void
  turnus: { name: string; range: string; remainingWeeks: number } | null
}

/**
 * The Wochenleiste: a turnus summary followed by one button per weekday, each
 * flagging its Vormittag/Nachmittag slots and any turnus that begins that day.
 */
export function WeekStrip({ days, selectedWeekday, onSelect, turnus }: WeekStripProps) {
  const { t } = useTranslation('common')

  return (
    <div
      data-screen-label="Wochenleiste"
      className="border-border bg-card flex items-stretch gap-2 rounded-lg border p-2 shadow-sm"
    >
      {turnus && (
        <div className="border-border flex shrink-0 flex-col justify-center gap-0.5 border-r pr-3 pl-2">
          <span className="text-muted-foreground text-xs font-medium tracking-wide uppercase">
            {turnus.name}
          </span>
          <span className="text-sm font-medium whitespace-nowrap tabular-nums">{turnus.range}</span>
          <span className="text-muted-foreground text-xs whitespace-nowrap tabular-nums">
            {t('dashboard.weeksRemaining', {
              count: turnus.remainingWeeks,
              defaultValue: 'noch {{count}} Wochen',
            })}
          </span>
        </div>
      )}

      <div className="flex min-w-0 flex-1 flex-wrap gap-2">
        {days.map(day => {
          const isActive = day.weekday === selectedWeekday
          const hasSlot = day.hasAM || day.hasPM
          return (
            <button
              key={day.weekday}
              type="button"
              onClick={() => onSelect(day.weekday)}
              className={cn(
                'flex min-w-0 flex-1 basis-[110px] flex-col gap-1 overflow-hidden rounded-md border px-2.5 py-2 text-left transition-colors',
                isActive
                  ? 'border-primary/30 bg-primary/[.08]'
                  : hasSlot
                    ? 'bg-muted/40 hover:bg-muted/70 border-transparent'
                    : 'hover:bg-muted/30 border-transparent bg-transparent',
              )}
            >
              <span className="flex items-baseline gap-1.5">
                <span
                  className={cn(
                    'text-sm font-medium',
                    hasSlot ? 'text-foreground' : 'text-muted-foreground',
                  )}
                >
                  {day.short}
                </span>
                <span
                  className={cn(
                    'text-xs tabular-nums',
                    isActive ? 'text-foreground' : 'text-muted-foreground',
                  )}
                >
                  {String(day.date.getDate()).padStart(2, '0')}.
                  {String(day.date.getMonth() + 1).padStart(2, '0')}.
                </span>
              </span>
              <span className="flex min-h-[18px] items-center gap-1.5">
                <SlotPill label="VM" on={day.hasAM} />
                <SlotPill label="NM" on={day.hasPM} />
                {day.turnStartName && (
                  <span
                    title={t('dashboard.turnusStarts', {
                      name: day.turnStartName,
                      defaultValue: '{{name}} beginnt',
                    })}
                    className="text-warning-foreground ml-auto inline-flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-full"
                    style={{ background: 'color-mix(in oklab, var(--warning) 18%, transparent)' }}
                  >
                    <ArrowDownUp className="h-3 w-3" aria-hidden />
                  </span>
                )}
              </span>
            </button>
          )
        })}
      </div>
    </div>
  )
}
