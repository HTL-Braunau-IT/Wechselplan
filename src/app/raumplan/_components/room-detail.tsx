'use client'

import { useTranslation } from 'react-i18next'
import { DoorOpen } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import type { PlacedGroup, RoomCell } from '@/lib/raumplan/types'
import { GroupBadge } from './group-badge'

/** Detail panel for the room currently selected on the floor plan. */
export function RoomDetail({ cell }: { cell: RoomCell | null }) {
  const { t } = useTranslation()

  if (!cell) {
    return (
      <Card className="h-full">
        <CardContent className="text-muted-foreground flex h-full min-h-[160px] items-center justify-center px-6 text-center text-sm">
          {t('raumplan.detail.selectHint')}
        </CardContent>
      </Card>
    )
  }

  const stateLabel = t(`raumplan.state.${cell.state}`)

  return (
    <Card className="h-full">
      <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0">
        <CardTitle className="flex items-center gap-2 text-lg">
          <DoorOpen className="h-5 w-5" />
          {cell.roomName}
        </CardTitle>
        <span className="text-muted-foreground text-xs font-medium tracking-wide uppercase">
          {stateLabel}
        </span>
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        {cell.state === 'occupied' ? (
          <>
            <Row label={t('raumplan.detail.teacher')} value={cell.teacherName} />
            <Row label={t('raumplan.detail.subject')} value={cell.subjectName} />
            <div>
              <div className="text-muted-foreground mb-1 text-xs font-medium">
                {cell.groups.length === 1
                  ? t('raumplan.detail.group')
                  : t('raumplan.detail.groups')}
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
          </>
        ) : (
          <p className="text-muted-foreground">
            {t(`raumplan.state.${cell.state}`)}
            {cell.state === 'unused' ? ' — ' + t('raumplan.empty.description') : ''}
          </p>
        )}
      </CardContent>
    </Card>
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
