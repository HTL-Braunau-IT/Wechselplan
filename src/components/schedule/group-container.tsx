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
		id: `group-${group.id}`
	})

	return (
		<div 
			ref={setNodeRef}
			className={`border border-border rounded-lg p-4 w-[320px] transition-colors bg-card min-h-[200px] ${
				isOver ? 'bg-accent/50 border-accent' : ''
			}`}
		>
			<h3 className="font-semibold mb-3 text-foreground text-center pb-2 border-b border-border/50">
				{group.id === UNASSIGNED_GROUP_ID ? t('unassigned') : `${t('group')} ${group.id}`}
			</h3>
			<div className="space-y-2">
				{children}
			</div>
		</div>
	)
}

