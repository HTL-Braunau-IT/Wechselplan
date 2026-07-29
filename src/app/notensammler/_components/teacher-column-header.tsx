'use client'

import { useTranslation } from 'react-i18next'
import { Lock, LockOpen, X } from 'lucide-react'
import { TableHead } from '@/components/ui/table'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import type { Teacher } from '../_lib/types'

/**
 * One teacher column heading, with the "delete all grades" affordance and —
 * once the class lead has marked the semester as entered into Sokrates — a
 * per-column lock toggle (hybrid escalation).
 *
 * The grid renders this four times (first/second semester x AM/PM); the markup
 * used to be copy-pasted into each of those branches.
 */
export function TeacherColumnHeader({
  teacher,
  isCurrentTeacher,
  onDelete,
  deleteLabel,
  showLock = false,
  locked = false,
  onToggleLock,
}: {
  teacher: Teacher
  isCurrentTeacher: boolean
  onDelete: (teacher: Teacher) => void
  deleteLabel: string
  /** Class lead + semester marked: offer to lock/unlock this single column. */
  showLock?: boolean
  locked?: boolean
  onToggleLock?: (locked: boolean) => void
}) {
  const { t } = useTranslation()
  return (
    <TableHead
      className={cn(
        'w-16 min-w-16 p-1 text-center',
        isCurrentTeacher && 'bg-primary/20 font-semibold',
      )}
    >
      <div className="flex flex-col items-center gap-0.5">
        <span className="text-sm whitespace-nowrap [text-orientation:mixed] [writing-mode:vertical-rl]">
          {teacher.firstName} {teacher.lastName}
        </span>
        <div className="flex items-center gap-0.5">
          {showLock && (
            <Button
              variant="ghost"
              size="icon"
              className={cn(
                'h-4 w-4 opacity-60 hover:opacity-100',
                locked
                  ? 'text-destructive hover:bg-destructive/10'
                  : 'hover:bg-primary/10 hover:text-primary',
              )}
              onClick={e => {
                e.stopPropagation()
                onToggleLock?.(!locked)
              }}
              title={
                locked
                  ? t('notensammler.sokratesUnlockColumn', 'Spalte entsperren')
                  : t('notensammler.sokratesLockColumn', 'Spalte sperren (Sokrates)')
              }
            >
              {locked ? <Lock className="h-3 w-3" /> : <LockOpen className="h-3 w-3" />}
            </Button>
          )}
          <Button
            variant="ghost"
            size="icon"
            className="hover:bg-destructive/10 hover:text-destructive h-4 w-4 opacity-60 hover:opacity-100"
            onClick={e => {
              e.stopPropagation()
              onDelete(teacher)
            }}
            title={deleteLabel}
          >
            <X className="h-3 w-3" />
          </Button>
        </div>
      </div>
    </TableHead>
  )
}
