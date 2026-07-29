'use client'

import { useDroppable } from '@dnd-kit/core'
import { useTranslation } from 'next-i18next'

interface Group {
  id: number
  students: unknown[]
}

interface GroupContainerProps {
  group: Group
  children: React.ReactNode
}

const UNASSIGNED_GROUP_ID = 0

/**
 * Renders a droppable container for a group, displaying its title and containing student items.
 *
 * Highlights the container when a draggable item is hovered over it. Shows "Unassigned" for the unassigned group or "Group X" for other groups.
 *
 * @param group - The group to display, including its ID.
 * @param children - The student items or other elements to render inside the group container.
 */
export function GroupContainer({ group, children }: GroupContainerProps) {
  const { t } = useTranslation('schedule')
  const { setNodeRef, isOver } = useDroppable({
    id: `group-${group.id}`,
  })

  return (
    <div
      ref={setNodeRef}
      className={`border-border bg-card min-h-[200px] w-[320px] rounded-lg border p-4 transition-colors ${
        isOver ? 'bg-accent/50 border-accent' : ''
      }`}
    >
      <h3 className="text-foreground border-border/50 mb-3 border-b pb-2 text-center font-semibold">
        {group.id === UNASSIGNED_GROUP_ID ? t('unassigned') : `${t('group')} ${group.id}`}
      </h3>
      <div className="space-y-2">{children}</div>
    </div>
  )
}
