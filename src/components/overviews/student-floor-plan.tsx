'use client'

import { useTranslation } from 'react-i18next'
import { FloorPlan } from '@/app/raumplan/_components/floor-plan'
import type { LevelKey } from '@/lib/raumplan/levels'
import type { RoomCell, StudentPlacementPeriod } from '@/lib/raumplan/types'

// The locator plan is read-only — rooms are not selectable here.
const noop = () => undefined

/**
 * A locator floor plan for the student home: the workshop level(s) with the
 * student's own room(s) highlighted. Fed only by the student's own placement
 * (no other rooms' occupancy), so it never reveals classmates' rosters.
 */
export function StudentFloorPlan({
  periods,
  weekday,
}: {
  periods: StudentPlacementPeriod[]
  weekday: number
}) {
  const { t } = useTranslation()

  const placed = periods.filter(
    (p): p is StudentPlacementPeriod & { roomName: string; level: LevelKey } =>
      p.state === 'placed' && p.roomName != null && p.level != null,
  )
  if (placed.length === 0) return null

  // Distinct levels, AM first.
  const levels: LevelKey[] = []
  for (const p of placed) if (!levels.includes(p.level)) levels.push(p.level)

  return (
    <div className="mt-4 space-y-4 border-t pt-4">
      <p className="text-muted-foreground text-sm font-medium">{t('raumplan.home.mapTitle')}</p>
      {levels.map(level => {
        const onLevel = placed.filter(p => p.level === level)
        const occupancy = new Map<string, RoomCell>()
        for (const p of onLevel) {
          occupancy.set(p.roomName, {
            roomName: p.roomName,
            level,
            state: 'occupied',
            period: p.period,
            weekday,
            teacherName: p.teacherName,
            subjectName: p.subjectName,
            groups: p.groupId != null ? [{ classId: 0, className: '', groupId: p.groupId }] : [],
          })
        }
        return (
          <div key={level} className="space-y-1.5">
            <p className="text-muted-foreground text-xs">
              {t(`raumplan.levels.${level}`)} · {onLevel.map(p => p.roomName).join(' · ')}
            </p>
            <div className="bg-card mx-auto max-w-2xl overflow-hidden rounded-lg border p-2">
              <FloorPlan
                level={level}
                occupancy={occupancy}
                selectedRoom={onLevel[0]?.roomName ?? null}
                onSelectRoom={noop}
              />
            </div>
          </div>
        )
      })}
    </div>
  )
}
