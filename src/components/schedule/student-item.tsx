'use client'

import { useDraggable } from '@dnd-kit/core'
import { ArrowRightLeft, X } from 'lucide-react'
import { StudentPhoto } from '@/components/student-photo'
import { Button } from '@/components/ui/button'

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
  onTransfer?: (student: Student) => void
  t: (key: string) => string
}

/**
 * Renders a draggable student item with the student's name and index, and provides buttons to remove or transfer the student.
 *
 * @param student - The student to display.
 * @param index - The position of the student in the list.
 * @param onRemove - Callback invoked with the student's ID when the remove button is clicked.
 * @param onTransfer - Optional callback invoked with the student when the transfer button is clicked.
 */
export function StudentItem({ student, index, onRemove, onTransfer, t }: StudentItemProps) {
  const { attributes, listeners, setNodeRef, transform } = useDraggable({
    id: `student-${student.id}`,
  })

  const style = transform
    ? {
        transform: `translate3d(${transform.x}px, ${transform.y}px, 0)`,
      }
    : undefined

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...listeners}
      {...attributes}
      className="bg-card border-border hover:bg-accent group flex min-h-[60px] cursor-move items-start justify-between rounded-lg border p-3 text-sm transition-all duration-200"
    >
      <div className="min-w-0 flex-1 pr-2">
        <div className="mb-1 flex items-center gap-2">
          <span className="text-muted-foreground shrink-0 text-xs font-medium">{index + 1}.</span>
          <StudentPhoto
            studentId={student.id}
            firstName={student.firstName}
            lastName={student.lastName}
            size={32}
            nameFormat="lastFirst"
          />
        </div>
        {student.originalClass && (
          <div className="text-muted-foreground bg-muted/50 ml-4 inline-block rounded-md px-2 py-1 text-xs">
            {t('originallyFrom')}: {student.originalClass}
          </div>
        )}
      </div>
      <div className="flex items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100">
        {onTransfer && (
          <Button
            variant="ghost"
            size="icon"
            className="text-muted-foreground hover:text-foreground h-7 w-7"
            onClick={e => {
              e.stopPropagation()
              onTransfer(student)
            }}
            onPointerDown={e => e.stopPropagation()}
            title={t('transferStudent')}
            aria-label={t('transferStudent')}
            type="button"
          >
            <ArrowRightLeft className="h-4 w-4" />
          </Button>
        )}
        <Button
          variant="ghost"
          size="icon"
          className="text-destructive hover:text-destructive h-7 w-7"
          onClick={e => {
            e.stopPropagation()
            onRemove(student.id)
          }}
          onPointerDown={e => e.stopPropagation()}
          title={t('removeStudent')}
          aria-label={t('removeStudent')}
          type="button"
        >
          <X className="h-4 w-4" />
        </Button>
      </div>
    </div>
  )
}
