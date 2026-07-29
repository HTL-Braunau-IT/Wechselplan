'use client'

import { X } from 'lucide-react'
import { TableHead } from '@/components/ui/table'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import type { Teacher } from '../_lib/types'

/**
 * One teacher column heading, with the "delete all grades" affordance.
 *
 * The grid renders this four times (first/second semester x AM/PM); the markup
 * used to be copy-pasted into each of those branches.
 */
export function TeacherColumnHeader({
	teacher,
	isCurrentTeacher,
	onDelete,
	deleteLabel
}: {
	teacher: Teacher
	isCurrentTeacher: boolean
	onDelete: (teacher: Teacher) => void
	deleteLabel: string
}) {
	return (
		<TableHead
			className={cn(
				'w-16 min-w-16 p-1 text-center',
				isCurrentTeacher && 'bg-primary/20 font-semibold'
			)}
		>
			<div className="flex flex-col items-center gap-0.5">
				<span className="whitespace-nowrap text-sm [text-orientation:mixed] [writing-mode:vertical-rl]">
					{teacher.firstName} {teacher.lastName}
				</span>
				<Button
					variant="ghost"
					size="icon"
					className="h-4 w-4 opacity-60 hover:bg-destructive/10 hover:text-destructive hover:opacity-100"
					onClick={(e) => {
						e.stopPropagation()
						onDelete(teacher)
					}}
					title={deleteLabel}
				>
					<X className="h-3 w-3" />
				</Button>
			</div>
		</TableHead>
	)
}
