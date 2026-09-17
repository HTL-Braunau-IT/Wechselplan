'use client'

import { useDraggable } from '@dnd-kit/core'
import { ArrowRightLeft, GripVertical, X } from 'lucide-react'
import { StudentPhoto } from '@/components/student-photo'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

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
  /** 'row' inside a group column, 'pill' inside the unassigned tray. */
  variant?: 'row' | 'pill'
}

/**
 * Draggable student entry.
 *
 * In `row` form (inside a group column) it shows a drag handle, the running
 * number, the student's avatar and name, and remove/transfer actions on hover.
 * In `pill` form (inside the unassigned tray) it is a compact rounded chip that
 * can be dragged into a group. Both forms carry the same @dnd-kit draggable id.
 */
export function StudentItem({
  student,
  index,
  onRemove,
  onTransfer,
  t,
  variant = 'row',
}: StudentItemProps) {
  const { attributes, listeners, setNodeRef, transform } = useDraggable({
    id: `student-${student.id}`,
  })

  const style = transform
    ? {
        transform: `translate3d(${transform.x}px, ${transform.y}px, 0)`,
      }
    : undefined

  if (variant === 'pill') {
    return (
      <span
        ref={setNodeRef}
        style={style}
        {...listeners}
        {...attributes}
        className="border-border bg-background inline-flex h-8 cursor-grab items-center gap-1.5 rounded-full border py-0 pr-3 pl-1.5 text-sm active:cursor-grabbing"
      >
        <StudentPhoto
          studentId={student.id}
          firstName={student.firstName}
          lastName={student.lastName}
          size={22}
          nameFormat="lastFirst"
        />
      </span>
    )
  }

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...listeners}
      {...attributes}
      className="group hover:bg-accent flex min-h-[34px] cursor-grab items-center gap-2 rounded-sm px-1.5 py-0.5 text-sm transition-colors active:cursor-grabbing"
    >
      <GripVertical className="text-muted-foreground h-3.5 w-3.5 shrink-0" />
      <span className="text-muted-foreground w-4 shrink-0 text-right text-xs tabular-nums">
        {index + 1}
      </span>
      <StudentPhoto
        studentId={student.id}
        firstName={student.firstName}
        lastName={student.lastName}
        size={22}
        nameFormat="lastFirst"
        className="min-w-0"
      />
      {student.originalClass && (
        <span className="text-muted-foreground bg-muted/50 shrink-0 rounded-md px-1.5 py-0.5 text-xs">
          {t('originallyFrom')}: {student.originalClass}
        </span>
      )}
      <div
        className={cn(
          'ml-auto flex shrink-0 items-center gap-0.5 opacity-0 transition-opacity',
          'group-hover:opacity-100 focus-within:opacity-100',
        )}
      >
        {onTransfer && (
          <Button
            variant="ghost"
            size="icon"
            className="text-muted-foreground hover:text-foreground h-6 w-6"
            onClick={e => {
              e.stopPropagation()
              onTransfer(student)
            }}
            onPointerDown={e => e.stopPropagation()}
            title={t('transferStudent')}
            aria-label={t('transferStudent')}
            type="button"
          >
            <ArrowRightLeft className="h-3.5 w-3.5" />
          </Button>
        )}
        <Button
          variant="ghost"
          size="icon"
          className="text-muted-foreground hover:text-destructive h-6 w-6"
          onClick={e => {
            e.stopPropagation()
            onRemove(student.id)
          }}
          onPointerDown={e => e.stopPropagation()}
          title={t('removeStudent')}
          aria-label={t('removeStudent')}
          type="button"
        >
          <X className="h-3.5 w-3.5" />
        </Button>
      </div>
    </div>
  )
}
