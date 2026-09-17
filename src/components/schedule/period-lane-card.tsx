'use client'

import type { LucideIcon } from 'lucide-react'
import { useTranslation } from 'next-i18next'

import { Switch } from '@/components/ui/switch'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { cn } from '@/lib/utils'

export interface LaneCadence {
  enabled: boolean
  /** 1 = every week, 2 = every 2nd week. */
  interval: number
  /** 0 = A-week start, 1 = B-week start. */
  offset: number
}

interface PeriodLaneCardProps {
  title: string
  icon: LucideIcon
  cadence: LaneCadence
  onChange: (next: LaneCadence) => void
}

/**
 * One AM/PM lane on the "Tag & Perioden" step, rendered as a single compact
 * row: an enable switch plus, once enabled, its inline cadence — every week vs.
 * every 2nd week, and (when biweekly) the A-week/B-week start. The segmented
 * controls reuse the Tabs primitive so they match the rest of the app.
 */
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
            value={biweekly ? 'biweekly' : 'weekly'}
            onValueChange={value =>
              onChange({ ...cadence, interval: value === 'biweekly' ? 2 : 1 })
            }
          >
            <TabsList className="h-8">
              <TabsTrigger value="weekly" className="text-xs">
                {t('everyWeek')}
              </TabsTrigger>
              <TabsTrigger value="biweekly" className="text-xs">
                {t('everySecondWeek')}
              </TabsTrigger>
            </TabsList>
          </Tabs>
          {biweekly && (
            <Tabs
              value={cadence.offset === 1 ? 'b' : 'a'}
              onValueChange={value => onChange({ ...cadence, offset: value === 'b' ? 1 : 0 })}
            >
              <TabsList className="h-8">
                <TabsTrigger value="a" className="text-xs">
                  {t('aWeek')}
                </TabsTrigger>
                <TabsTrigger value="b" className="text-xs">
                  {t('bWeek')}
                </TabsTrigger>
              </TabsList>
            </Tabs>
          )}
        </div>
      )}
    </div>
  )
}
