'use client'

import type { LucideIcon } from 'lucide-react'
import { useTranslation } from 'next-i18next'

import { Card, CardContent, CardHeader } from '@/components/ui/card'
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
 * One AM/PM lane on the "Tag & Perioden" step: an enable switch plus, once
 * enabled, its cadence — every week vs. every 2nd week, and (when biweekly) the
 * A-week/B-week start. Mirrors the Notensammler segmented-control styling.
 */
export function PeriodLaneCard({ title, icon: Icon, cadence, onChange }: PeriodLaneCardProps) {
  const { t } = useTranslation('schedule')
  const biweekly = cadence.interval > 1

  return (
    <Card className={cn('transition-colors', !cadence.enabled && 'opacity-70')}>
      <CardHeader className="gap-4">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <span className="bg-muted text-muted-foreground rounded-lg p-2">
              <Icon className="h-5 w-5" />
            </span>
            <h3 className="text-lg font-semibold tracking-tight">{title}</h3>
          </div>
          <label className="flex items-center gap-2 text-sm">
            <span className="text-muted-foreground">
              {cadence.enabled ? t('periodOn') : t('periodOff')}
            </span>
            <Switch
              checked={cadence.enabled}
              onCheckedChange={enabled => onChange({ ...cadence, enabled })}
              aria-label={title}
            />
          </label>
        </div>
      </CardHeader>
      {cadence.enabled && (
        <CardContent className="space-y-4">
          <div>
            <p className="text-muted-foreground mb-2 text-xs font-medium tracking-wide uppercase">
              {t('cadence')}
            </p>
            <Tabs
              value={biweekly ? 'biweekly' : 'weekly'}
              onValueChange={value =>
                onChange({ ...cadence, interval: value === 'biweekly' ? 2 : 1 })
              }
            >
              <TabsList>
                <TabsTrigger value="weekly">{t('everyWeek')}</TabsTrigger>
                <TabsTrigger value="biweekly">{t('everySecondWeek')}</TabsTrigger>
              </TabsList>
            </Tabs>
          </div>

          {biweekly && (
            <div>
              <p className="text-muted-foreground mb-2 text-xs font-medium tracking-wide uppercase">
                {t('startWeek')}
              </p>
              <Tabs
                value={cadence.offset === 1 ? 'b' : 'a'}
                onValueChange={value => onChange({ ...cadence, offset: value === 'b' ? 1 : 0 })}
              >
                <TabsList>
                  <TabsTrigger value="a">{t('aWeek')}</TabsTrigger>
                  <TabsTrigger value="b">{t('bWeek')}</TabsTrigger>
                </TabsList>
              </Tabs>
              <p className="text-muted-foreground mt-2 text-xs">{t('biweeklyHint')}</p>
            </div>
          )}
        </CardContent>
      )}
    </Card>
  )
}
