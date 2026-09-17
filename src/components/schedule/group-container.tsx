'use client'

import { useDroppable } from '@dnd-kit/core'
import { useTranslation } from 'next-i18next'
import { cn } from '@/lib/utils'
import { groupColor } from '@/lib/group-colors'

interface Group {
  id: number
  students: unknown[]
}

interface GroupContainerProps {
  group: Group
  children: React.ReactNode
  /** Zero-based index into the group palette; defaults to `group.id - 1`. */
  colorIndex?: number
  /** Capacity denominator for the fill bar / count; defaults to 12. */
  maxSize?: number
}

const UNASSIGNED_GROUP_ID = 0

/**
 * Droppable column for a rotation group.
 *
 * Renders as an equal-width card: a tinted header carrying the group number,
 * name and live capacity, a capacity fill bar, then the draggable student rows.
 * Highlights while a student is dragged over it. The tint follows the shared
 * rotation-group palette so a group keeps the same colour across the app.
 */
export function GroupContainer({ group, children, colorIndex, maxSize = 12 }: GroupContainerProps) {
  const { t } = useTranslation('schedule')
  const { setNodeRef, isOver } = useDroppable({
    id: `group-${group.id}`,
  })

  const isUnassigned = group.id === UNASSIGNED_GROUP_ID
  const count = group.students.length
  const tint = groupColor(colorIndex ?? Math.max(0, group.id - 1))
  const fillPercent = Math.min(100, Math.round((count / maxSize) * 100))

  return (
    <div
      ref={setNodeRef}
      className={cn(
        'bg-card border-border min-w-0 flex-1 overflow-hidden rounded-lg border shadow-sm transition-colors',
        isOver && 'ring-primary/40 ring-2',
      )}
    >
      <div className={cn('flex items-center gap-2 px-3 py-2.5', isUnassigned ? 'bg-muted' : tint)}>
        <span className="bg-background/70 flex h-5 min-w-5 items-center justify-center rounded-full px-1.5 text-xs font-semibold tabular-nums">
          {isUnassigned ? '·' : group.id}
        </span>
        <span className="text-sm font-semibold">
          {isUnassigned ? t('unassigned') : `${t('group')} ${group.id}`}
        </span>
        <span className="ml-auto text-xs font-medium tabular-nums opacity-75">
          {count} / {maxSize}
        </span>
      </div>
      <div className="bg-border/60 h-[3px]">
        <div
          className="bg-primary h-full transition-[width]"
          style={{ width: `${fillPercent}%` }}
        />
      </div>
      <div className="flex flex-col gap-0.5 p-2">{children}</div>
    </div>
  )
}
