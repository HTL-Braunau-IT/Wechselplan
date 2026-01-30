'use client'

import { useDraggable } from '@dnd-kit/core'

interface Student {
	id: number
	firstName: string
	lastName: string
	class: string
	originalClass?: string // For combined classes, shows which class the student originally came from
}

interface StudentItemProps {
	student: Student
	index: number
	onRemove: (studentId: number) => void
	t: (key: string) => string
}

/**
 * Renders a draggable student item with the student's name and index, and provides a button to remove the student from the group.
 *
 * @param student - The student to display.
 * @param index - The position of the student in the list.
 * @param onRemove - Callback invoked with the student's ID when the remove button is clicked.
 */
export function StudentItem({ student, index, onRemove, t }: StudentItemProps) {
	const { attributes, listeners, setNodeRef, transform } = useDraggable({
		id: `student-${student.id}`
	})

	const style = transform ? {
		transform: `translate3d(${transform.x}px, ${transform.y}px, 0)`,
	} : undefined

	return (
		<div
			ref={setNodeRef}
			style={style}
			{...listeners}
			{...attributes}
			className="text-sm p-3 bg-card border border-border rounded-lg cursor-move hover:bg-accent transition-all duration-200 flex items-start justify-between group min-h-[60px]"
		>
			<div className="flex-1 min-w-0 pr-2">
				<div className="flex items-center mb-1">
					<span className="text-muted-foreground mr-2 text-xs font-medium">{index + 1}.</span>
					<span className="font-medium truncate">{`${student.lastName}, ${student.firstName}`}</span>
				</div>
				{student.originalClass && (
					<div className="text-xs text-muted-foreground ml-4 bg-muted/50 px-2 py-1 rounded-md inline-block">
						{t('originallyFrom')}: {student.originalClass}
					</div>
				)}
			</div>
			<button
				onClick={(e) => {
					e.stopPropagation()
					onRemove(student.id)
				}}
				className="text-destructive hover:text-destructive/80 opacity-0 group-hover:opacity-100 transition-opacity"
				title="Remove student"
			>
				<svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
					<path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
				</svg>
			</button>
		</div>
	)
}

