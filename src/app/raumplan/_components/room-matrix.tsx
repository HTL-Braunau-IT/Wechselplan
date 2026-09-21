'use client'

import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import type { Period, RoomCell, WeekOccupancy } from '@/lib/raumplan/types'
import { GroupBadge } from './group-badge'

const WEEKDAYS = [1, 2, 3, 4, 5]
const PERIODS: Period[] = ['AM', 'PM']

/** Rooms (rows) × (weekday, half-day) (columns). Unused rooms are omitted. */
export function RoomMatrix({ data }: { data: WeekOccupancy }) {
  const { t } = useTranslation()

  // roomName → `${weekday}-${period}` → cell
  const index = useMemo(() => {
    const m = new Map<string, Map<string, RoomCell>>()
    for (const cell of data.cells) {
      const bySlot = m.get(cell.roomName) ?? new Map<string, RoomCell>()
      bySlot.set(`${cell.weekday}-${cell.period}`, cell)
      m.set(cell.roomName, bySlot)
    }
    return m
  }, [data.cells])

  // Only rooms used somewhere this week (skip fully unused rooms).
  const rooms = useMemo(() => {
    const names = [...index.keys()].filter(name => {
      const slots = index.get(name)!
      return [...slots.values()].some(c => c.state !== 'unused')
    })
    return names.sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))
  }, [index])

  if (rooms.length === 0) {
    return (
      <p className="text-muted-foreground py-8 text-center text-sm">
        {t('raumplan.empty.description')}
      </p>
    )
  }

  return (
    <div className="overflow-x-auto rounded-md border">
      <table className="w-full border-collapse text-sm">
        <thead>
          <tr className="bg-muted/50">
            <th className="sticky left-0 z-10 bg-inherit px-3 py-2 text-left font-semibold">
              {t('raumplan.matrix.room')}
            </th>
            {WEEKDAYS.map(wd =>
              PERIODS.map(p => (
                <th
                  key={`${wd}-${p}`}
                  className="border-l px-2 py-2 text-center font-medium whitespace-nowrap"
                >
                  <div>{t(`raumplan.weekdays.${wd}`).slice(0, 2)}</div>
                  <div className="text-muted-foreground text-xs">
                    {t(`raumplan.periods.${p === 'AM' ? 'amShort' : 'pmShort'}`)}
                  </div>
                </th>
              )),
            )}
          </tr>
        </thead>
        <tbody>
          {rooms.map(name => {
            const slots = index.get(name)!
            return (
              <tr key={name} className="border-t">
                <th className="bg-background sticky left-0 z-10 px-3 py-2 text-left font-semibold">
                  {name}
                </th>
                {WEEKDAYS.map(wd =>
                  PERIODS.map(p => {
                    const cell = slots.get(`${wd}-${p}`)
                    return (
                      <td key={`${wd}-${p}`} className="border-l px-2 py-1.5 align-top">
                        <MatrixCell cell={cell} />
                      </td>
                    )
                  }),
                )}
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

function MatrixCell({ cell }: { cell: RoomCell | undefined }) {
  const { t } = useTranslation()
  if (cell?.state !== 'occupied') {
    return <span className="text-muted-foreground/50">{t('raumplan.matrix.empty')}</span>
  }
  return (
    <div className="space-y-1">
      {cell.teacherName && <div className="font-medium whitespace-nowrap">{cell.teacherName}</div>}
      {cell.subjectName && (
        <div className="text-muted-foreground text-xs whitespace-nowrap">{cell.subjectName}</div>
      )}
      <div className="flex flex-wrap gap-1">
        {cell.groups.map((g, i) => (
          <GroupBadge key={i} groupId={g.groupId} />
        ))}
      </div>
    </div>
  )
}
