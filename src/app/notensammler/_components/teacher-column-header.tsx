'use client'

import type { CSSProperties } from 'react'
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
 * The name used to be set vertically, which cost ~150 px of header on every
 * class and still had to be read sideways. Stacking surname over forename in a
 * slightly wider column fits the same names in a third of the height.
 */
export function TeacherColumnHeader({
  teacher,
  isCurrentTeacher,
  onDelete,
  deleteLabel,
  stickyStyle,
  showLock = false,
  locked = false,
  onToggleLock,
}: {
  teacher: Teacher
  isCurrentTeacher: boolean
  onDelete: (teacher: Teacher) => void
  deleteLabel: string
  /** Pins the row beneath the period band; supplied by the grid. */
  stickyStyle?: CSSProperties
  /** Class lead + semester marked: offer to lock/unlock this single column. */
  showLock?: boolean
  locked?: boolean
  onToggleLock?: (locked: boolean) => void
}) {
  const { t } = useTranslation()
  return (
    <TableHead
      className={cn(
        'bg-muted sticky z-20 w-20 min-w-20 px-1 pt-1.5 pb-1 text-center align-bottom',
        isCurrentTeacher && 'bg-primary/15',
      )}
      style={stickyStyle}
      title={`${teacher.firstName} ${teacher.lastName}`}
    >
      <div className="flex flex-col items-center gap-px">
        <span
          className={cn(
            'w-full truncate text-xs leading-tight font-semibold',
            isCurrentTeacher ? 'text-primary' : 'text-foreground',
          )}
        >
          {teacher.lastName}
        </span>
        <span className="text-muted-foreground w-full truncate text-[10px] leading-tight font-normal">
          {teacher.firstName}
        </span>
        <div className="flex items-center gap-0.5">
          {showLock && (
            <Button
              variant="ghost"
              size="icon"
              className={cn(
                'h-5 w-5 opacity-60 hover:opacity-100',
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
              aria-label={
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
            className="hover:bg-destructive/10 hover:text-destructive h-5 w-5 opacity-60 hover:opacity-100"
            onClick={e => {
              e.stopPropagation()
              onDelete(teacher)
            }}
            title={deleteLabel}
            aria-label={`${deleteLabel} (${teacher.firstName} ${teacher.lastName})`}
          >
            <X className="h-3 w-3" />
          </Button>
        </div>
      </div>
    </TableHead>
  )
}
