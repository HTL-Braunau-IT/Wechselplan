'use client'

import type { LucideIcon } from 'lucide-react'
import { useTranslation } from 'next-i18next'

import { Input } from '@/components/ui/input'
import { Switch } from '@/components/ui/switch'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { cn } from '@/lib/utils'

export interface LaneCadence {
  enabled: boolean
  /** Meets every Nth week: 1 = weekly, 2 = every 2nd week … up to {@link MAX_WEEK_INTERVAL}. */
  interval: number
  /** 0 = A-week start, 1 = B-week start. Legacy anchor when no `startDate` is set. */
  offset: number
  /**
   * Optional "first meeting" date ("yyyy-MM-dd") for a biweekly lane: anchors the
   * rhythm and trims earlier weeks. Empty = start at the plan window (A-week).
   */
  startDate?: string
}

/** Largest cadence offered — the schedules API caps `*WeekInterval` at 4 too. */
export const MAX_WEEK_INTERVAL = 4

interface PeriodLaneCardProps {
  title: string
  icon: LucideIcon
  cadence: LaneCadence
  onChange: (next: LaneCadence) => void
}

/**
 * One AM/PM lane on the "Tag & Perioden" step, rendered as a single compact
 * row: an enable switch plus, once enabled, its inline cadence — every week or
 * every 2nd/3rd/4th week, and (when not weekly) the first meeting date. The segmented
 * controls reuse the Tabs primitive so they match the rest of the app.
 */
/** "Jede Woche" / "Alle 2 Wochen" / "Alle 3 Wochen" … for a cadence interval. */
export function cadenceLabel(interval: number, t: (key: string, options?: { count: number }) => string) {
  if (interval <= 1) return t('everyWeek')
  if (interval === 2) return t('everySecondWeek')
  return t('everyNthWeek', { count: interval })
}

export function PeriodLaneCard({ title, icon: Icon, cadence, onChange }: PeriodLaneCardProps) {
  const { t } = useTranslation('schedule')
  const biweekly = cadence.interval > 1

  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
      <Icon
        className={cn(
          'h-[18px] w-[18px] shrink-0',
          cadence.enabled ? 'text-muted-foreground' : 'text-muted-foreground/50',
        )}
      />
      <span className="w-24 text-sm font-semibold">{title}</span>
      <Switch
        checked={cadence.enabled}
        onCheckedChange={enabled => onChange({ ...cadence, enabled })}
        aria-label={title}
      />
      <span className="text-muted-foreground w-14 text-xs">
        {cadence.enabled ? t('periodOn') : t('periodOff')}
      </span>

      {cadence.enabled && (
        <div className="ml-1 flex flex-wrap items-center gap-2 sm:gap-3">
          <span className="text-muted-foreground text-xs font-medium tracking-wide uppercase">
            {t('cadence')}
          </span>
          <Tabs
            value={String(cadence.interval)}
            onValueChange={value => onChange({ ...cadence, interval: Number(value) })}
          >
            <TabsList className="h-8">
              {Array.from({ length: MAX_WEEK_INTERVAL }, (_, i) => i + 1).map(interval => (
                <TabsTrigger key={interval} value={String(interval)} className="text-xs">
                  {cadenceLabel(interval, t)}
                </TabsTrigger>
              ))}
            </TabsList>
          </Tabs>
          {biweekly && (
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-muted-foreground text-xs font-medium tracking-wide uppercase">
                {t('firstMeeting')}
              </span>
              <Input
                type="date"
                value={cadence.startDate ?? ''}
                onChange={event =>
                  onChange({ ...cadence, startDate: event.target.value, offset: 0 })
                }
                aria-label={`${title} · ${t('firstMeeting')}`}
                className="h-8 w-[9.5rem]"
              />
              <span className="text-muted-foreground text-xs">{t('firstMeetingHint')}</span>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
