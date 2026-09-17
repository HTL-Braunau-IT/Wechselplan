'use client'

import type { ReactNode } from 'react'
import type { LucideIcon } from 'lucide-react'
import { CircleAlert, X } from 'lucide-react'
import { useTranslation } from 'next-i18next'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { cn } from '@/lib/utils'
import { groupColor } from '@/lib/group-colors'
import { TeacherSelect } from '@/components/schedule/teacher-select'
import { SubjectSelect } from '@/components/schedule/subject-select'
import { LearningContentSelect } from '@/components/schedule/learning-content-select'
import { RoomSelect } from '@/components/schedule/room-select'

export interface TeacherAssignment {
  groupId: number
  teacherId: number
  subjectId: number
  learningContentId: number
  roomId: number
  // Custom values for when the user types their own text
  customSubject?: string
  customLearningContent?: string
  customRoom?: string
}

interface Option {
  id: number
  name: string
}

interface Teacher {
  id: number
  firstName: string
  lastName: string
}

export type Period = 'am' | 'pm'

interface PeriodAssignmentsProps {
  period: Period
  title: string
  icon: LucideIcon
  /** Optional right-aligned header action (e.g. the PM "copy from AM" button). */
  headerAction?: ReactNode
  groups: { id: number }[]
  assignments: TeacherAssignment[]
  teachers: Teacher[]
  subjects: Option[]
  learningContents: Option[]
  rooms: Option[]
  onAssignmentChange: (
    period: Period,
    groupId: number,
    field: keyof TeacherAssignment,
    value: string | number,
  ) => void
  onStringFieldChange: (
    period: Period,
    groupId: number,
    field: 'subject' | 'learningContent' | 'room',
    value: string,
  ) => void
  onClearRow: (period: Period, groupId: number) => void
}

const EMPTY_ASSIGNMENT: TeacherAssignment = {
  groupId: 0,
  teacherId: 0,
  subjectId: 0,
  learningContentId: 0,
  roomId: 0,
}

const GRID_HEAD = 'text-muted-foreground h-9 px-3 text-xs font-medium tracking-wide uppercase'
const CELL = 'px-3 py-2.5 align-middle'

/**
 * Renders the teacher/subject/content/room assignments for a single period
 * (AM or PM) as one table — a row per group instead of a stack of repeated
 * field-label blocks. Once a row is touched, its still-empty required cells are
 * marked so the missing information is visible at a glance.
 *
 * Both the morning and afternoon sections share this identical layout —
 * extracting it keeps the two in lockstep.
 */
export function PeriodAssignments({
  period,
  title,
  icon: Icon,
  headerAction,
  groups,
  assignments,
  teachers,
  subjects,
  learningContents,
  rooms,
  onAssignmentChange,
  onStringFieldChange,
  onClearRow,
}: PeriodAssignmentsProps) {
  const { t } = useTranslation('schedule')

  const displayValue = (
    assignment: TeacherAssignment,
    field: 'subject' | 'learningContent' | 'room',
  ) => {
    if (field === 'subject') {
      return (
        assignment.customSubject ?? subjects.find(s => s.id === assignment.subjectId)?.name ?? ''
      )
    }
    if (field === 'learningContent') {
      return (
        assignment.customLearningContent ??
        learningContents.find(lc => lc.id === assignment.learningContentId)?.name ??
        ''
      )
    }
    return assignment.customRoom ?? rooms.find(r => r.id === assignment.roomId)?.name ?? ''
  }

  const rows = groups.map((group, idx) => {
    const assignment = assignments.find(a => a.groupId === group.id) ?? {
      ...EMPTY_ASSIGNMENT,
      groupId: group.id,
    }
    const hasTeacher = assignment.teacherId !== 0
    const hasSubject = displayValue(assignment, 'subject') !== ''
    const hasContent = displayValue(assignment, 'learningContent') !== ''
    const hasRoom = displayValue(assignment, 'room') !== ''
    // A row counts as "started" once any field is filled; from then on the
    // remaining fields are required, mirroring the step's save-time validation.
    const active = hasTeacher || hasSubject || hasContent || hasRoom
    const complete = hasTeacher && hasSubject && hasContent && hasRoom
    return { group, idx, assignment, hasTeacher, hasSubject, hasContent, hasRoom, active, complete }
  })

  const completeCount = rows.filter(r => r.complete).length
  const gapCount = rows.filter(r => r.active && !r.complete).length

  // Highlight a cell only once its row has been started — an all-empty grid
  // should not look like an error.
  const missingRing = (active: boolean, filled: boolean) =>
    cn('rounded-md', active && !filled && 'ring-destructive/50 ring-1')

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-3">
            <span className="bg-muted text-muted-foreground flex rounded-lg p-2">
              <Icon className="h-5 w-5" />
            </span>
            <CardTitle className="text-lg">{title}</CardTitle>
            <span className="text-muted-foreground text-sm tabular-nums">
              {completeCount} / {groups.length}
            </span>
          </div>
          {headerAction}
        </div>
      </CardHeader>
      <CardContent>
        <div className="overflow-hidden rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/50 hover:bg-muted/50">
                <TableHead className={cn(GRID_HEAD, 'w-[150px]')}>{t('group')}</TableHead>
                <TableHead className={GRID_HEAD}>{t('teacher')}</TableHead>
                <TableHead className={GRID_HEAD}>{t('subject')}</TableHead>
                <TableHead className={GRID_HEAD}>{t('learningContent')}</TableHead>
                <TableHead className={cn(GRID_HEAD, 'w-[180px]')}>{t('room')}</TableHead>
                <TableHead className="h-9 w-11" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map(
                ({
                  group,
                  idx,
                  assignment,
                  hasTeacher,
                  hasSubject,
                  hasContent,
                  hasRoom,
                  active,
                }) => (
                  <TableRow key={group.id}>
                    <TableCell className={CELL}>
                      <span className="inline-flex items-center gap-2">
                        <span
                          className={cn(
                            'inline-flex h-[22px] min-w-[26px] items-center justify-center rounded-full px-1.5 text-xs font-semibold tabular-nums',
                            groupColor(idx),
                          )}
                        >
                          {group.id}
                        </span>
                        <span className="text-sm font-medium whitespace-nowrap">
                          {t('group')} {group.id}
                        </span>
                      </span>
                    </TableCell>
                    <TableCell className={CELL}>
                      <div className={missingRing(active, hasTeacher)}>
                        <TeacherSelect
                          value={assignment.teacherId}
                          onChange={value =>
                            onAssignmentChange(period, group.id, 'teacherId', value)
                          }
                          teachers={teachers}
                        />
                      </div>
                    </TableCell>
                    <TableCell className={CELL}>
                      <SubjectSelect
                        value={displayValue(assignment, 'subject')}
                        onChange={value => onStringFieldChange(period, group.id, 'subject', value)}
                        subjects={subjects}
                        className={missingRing(active, hasSubject)}
                      />
                    </TableCell>
                    <TableCell className={CELL}>
                      <LearningContentSelect
                        value={displayValue(assignment, 'learningContent')}
                        onChange={value =>
                          onStringFieldChange(period, group.id, 'learningContent', value)
                        }
                        learningContents={learningContents}
                        className={missingRing(active, hasContent)}
                      />
                    </TableCell>
                    <TableCell className={CELL}>
                      <RoomSelect
                        value={displayValue(assignment, 'room')}
                        onChange={value => onStringFieldChange(period, group.id, 'room', value)}
                        rooms={rooms}
                        className={missingRing(active, hasRoom)}
                      />
                    </TableCell>
                    <TableCell className={cn(CELL, 'text-center')}>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="text-muted-foreground hover:text-destructive h-7 w-7"
                        onClick={() => onClearRow(period, group.id)}
                        aria-label={t('clearRow')}
                        title={t('clearRow')}
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ),
              )}
            </TableBody>
          </Table>
        </div>
        {gapCount > 0 && (
          <div className="text-destructive mt-3 flex items-center gap-2 text-sm">
            <CircleAlert className="h-4 w-4 shrink-0" />
            {t('assignmentGapHint', { count: gapCount })}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
