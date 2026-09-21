'use client'

import { useTranslation } from 'react-i18next'
import { DoorOpen } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import type { Period, PlacedGroup, RoomCell } from '@/lib/raumplan/types'
import { GroupBadge } from './group-badge'

const PERIOD_ORDER: Period[] = ['AM', 'PM']

/**
 * Detail panel for the room selected on the floor plan. Shows both half-days
 * (Vormittag + Nachmittag) at once, so occupancy for the whole day is visible
 * without switching the period toggle.
 */
export function RoomDetail({
  roomName,
  periods,
}: {
  roomName: string | null
  periods: RoomCell[]
}) {
  const { t } = useTranslation()

  if (!roomName || periods.length === 0) {
    return (
      <Card className="h-full">
        <CardContent className="text-muted-foreground flex h-full min-h-[160px] items-center justify-center px-6 text-center text-sm">
          {t('raumplan.detail.selectHint')}
        </CardContent>
      </Card>
    )
  }

  const cellFor = (period: Period) => periods.find(c => c.period === period) ?? null
  const level = periods[0]?.level ?? null

  return (
    <Card className="h-full">
      <CardHeader className="space-y-1">
        <CardTitle className="flex items-center gap-2 text-lg">
          <DoorOpen className="h-5 w-5" />
          {roomName}
        </CardTitle>
        {level && <p className="text-muted-foreground text-xs">{t(`raumplan.levels.${level}`)}</p>}
      </CardHeader>
      <CardContent className="space-y-4 text-sm">
        {PERIOD_ORDER.map(period => (
          <PeriodBlock key={period} period={period} cell={cellFor(period)} />
        ))}
      </CardContent>
    </Card>
  )
}

function PeriodBlock({ period, cell }: { period: Period; cell: RoomCell | null }) {
  const { t } = useTranslation()
  const state = cell?.state ?? 'free'

  return (
    <div className="border-t pt-3 first:border-t-0 first:pt-0">
      <div className="mb-2 flex items-center justify-between gap-2">
        <span className="font-semibold">{t(`raumplan.periods.${period}`)}</span>
        <span className="text-muted-foreground text-xs font-medium tracking-wide uppercase">
          {t(`raumplan.state.${state}`)}
        </span>
      </div>

      {cell?.state === 'occupied' ? (
        <div className="space-y-2">
          <Row label={t('raumplan.detail.teacher')} value={cell.teacherName} />
          <Row label={t('raumplan.detail.subject')} value={cell.subjectName} />
          <div>
            <div className="text-muted-foreground mb-1 text-xs font-medium">
              {cell.groups.length === 1 ? t('raumplan.detail.group') : t('raumplan.detail.groups')}
            </div>
            {cell.groups.length === 0 ? (
              <span className="text-muted-foreground">{t('raumplan.detail.noGroup')}</span>
            ) : (
              <ul className="space-y-1">
                {cell.groups.map((g, i) => (
                  <GroupRow key={i} group={g} />
                ))}
              </ul>
            )}
          </div>
        </div>
      ) : (
        <p className="text-muted-foreground text-xs">
          {state === 'unused' ? t('raumplan.empty.description') : t('raumplan.detail.freeHint')}
        </p>
      )}
    </div>
  )
}

function Row({ label, value }: { label: string; value: string | null }) {
  if (!value) return null
  return (
    <div className="flex items-baseline justify-between gap-3">
      <span className="text-muted-foreground text-xs font-medium">{label}</span>
      <span className="text-right font-medium">{value}</span>
    </div>
  )
}

function GroupRow({ group }: { group: PlacedGroup }) {
  return (
    <li className="flex items-center gap-2">
      <GroupBadge groupId={group.groupId} />
      <span className="text-muted-foreground">{group.className}</span>
    </li>
  )
}
