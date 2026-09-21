'use client'

import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { LEVEL_KEYS, type LevelKey } from '@/lib/raumplan/levels'
import type { Period, RoomCell, WeekOccupancy } from '@/lib/raumplan/types'
import { FloorPlan } from './floor-plan'
import { Legend } from './legend'
import { RoomDetail } from './room-detail'

const WEEKDAYS = [1, 2, 3, 4, 5]
const PERIODS: Period[] = ['AM', 'PM']

/** Primary view: a level's floor plan for one weekday + half-day, with a detail
 * panel for the selected room. */
export function GrundrissView({ data }: { data: WeekOccupancy }) {
  const { t } = useTranslation()
  const [level, setLevel] = useState<LevelKey>('eg-e')
  const [weekday, setWeekday] = useState(defaultWeekday())
  const [period, setPeriod] = useState<Period>('AM')
  const [selectedRoom, setSelectedRoom] = useState<string | null>(null)

  const occupancy = useMemo(() => {
    const m = new Map<string, RoomCell>()
    for (const c of data.cells) {
      if (c.weekday === weekday && c.period === period) m.set(c.roomName, c)
    }
    return m
  }, [data.cells, weekday, period])

  const selectedCell = selectedRoom ? (occupancy.get(selectedRoom) ?? null) : null

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-4">
        <div className="space-y-1.5">
          <label className="text-muted-foreground text-xs font-medium">
            {t('raumplan.controls.level')}
          </label>
          <Select value={level} onValueChange={v => setLevel(v as LevelKey)}>
            <SelectTrigger className="w-[260px] max-w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {LEVEL_KEYS.map(key => (
                <SelectItem key={key} value={key}>
                  {t(`raumplan.levels.${key}`)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1.5">
          <label className="text-muted-foreground text-xs font-medium">
            {t('raumplan.controls.day')}
          </label>
          <Tabs value={String(weekday)} onValueChange={v => setWeekday(Number(v))}>
            <TabsList>
              {WEEKDAYS.map(wd => (
                <TabsTrigger key={wd} value={String(wd)}>
                  {t(`raumplan.weekdays.${wd}`).slice(0, 2)}
                </TabsTrigger>
              ))}
            </TabsList>
          </Tabs>
        </div>

        <div className="space-y-1.5">
          <label className="text-muted-foreground text-xs font-medium">
            {t('raumplan.controls.period')}
          </label>
          <Tabs value={period} onValueChange={v => setPeriod(v as Period)}>
            <TabsList>
              {PERIODS.map(p => (
                <TabsTrigger key={p} value={p}>
                  {t(`raumplan.periods.${p === 'AM' ? 'amShort' : 'pmShort'}`)}
                </TabsTrigger>
              ))}
            </TabsList>
          </Tabs>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-[1fr_300px]">
        <div className="bg-card overflow-hidden rounded-lg border p-2">
          <FloorPlan
            level={level}
            occupancy={occupancy}
            selectedRoom={selectedRoom}
            onSelectRoom={setSelectedRoom}
          />
          <div className="px-2 pt-2 pb-1">
            <Legend />
          </div>
        </div>
        <RoomDetail cell={selectedCell} />
      </div>
    </div>
  )
}

/** Default to today when it is a weekday, otherwise Monday. */
function defaultWeekday(): number {
  const js = new Date().getDay() // 0 = Sun
  return js >= 1 && js <= 5 ? js : 1
}
