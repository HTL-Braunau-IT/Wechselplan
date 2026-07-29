'use client'

import type { ReactNode } from 'react'
import type { LucideIcon } from 'lucide-react'
import { X } from 'lucide-react'
import { useTranslation } from 'next-i18next'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
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

/**
 * Renders the teacher/subject/content/room grid for a single period (AM or PM).
 *
 * Both the morning and afternoon sections of the teacher-assignment step share
 * this identical layout — extracting it keeps the two in lockstep.
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
      return assignment.customSubject ?? subjects.find(s => s.id === assignment.subjectId)?.name ?? ''
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

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <CardTitle className="flex items-center gap-2 text-xl">
            <Icon className="text-muted-foreground h-5 w-5" />
            {title}
          </CardTitle>
          {headerAction}
        </div>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          {groups.map(group => {
            const assignment = assignments.find(a => a.groupId === group.id) ?? {
              ...EMPTY_ASSIGNMENT,
              groupId: group.id,
            }
            return (
              <div key={group.id} className="rounded-lg border p-4">
                <div className="mb-4 flex items-center justify-between">
                  <h3 className="font-semibold">
                    {t('group')} {group.id}
                  </h3>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => onClearRow(period, group.id)}
                    className="text-destructive hover:text-destructive/90"
                  >
                    <X className="h-4 w-4" />
                    {t('clearRow')}
                  </Button>
                </div>
                <div className="grid [grid-template-columns:repeat(auto-fit,minmax(200px,1fr))] gap-4">
                  <div>
                    <Label className="mb-1 block text-sm font-medium">{t('teacher')}</Label>
                    <TeacherSelect
                      value={assignment.teacherId}
                      onChange={value => onAssignmentChange(period, group.id, 'teacherId', value)}
                      teachers={teachers}
                    />
                  </div>
                  <div>
                    <Label className="mb-1 block text-sm font-medium">{t('subject')}</Label>
                    <SubjectSelect
                      value={displayValue(assignment, 'subject')}
                      onChange={value => onStringFieldChange(period, group.id, 'subject', value)}
                      subjects={subjects}
                    />
                  </div>
                  <div>
                    <Label className="mb-1 block text-sm font-medium">{t('learningContent')}</Label>
                    <LearningContentSelect
                      value={displayValue(assignment, 'learningContent')}
                      onChange={value =>
                        onStringFieldChange(period, group.id, 'learningContent', value)
                      }
                      learningContents={learningContents}
                    />
                  </div>
                  <div>
                    <Label className="mb-1 block text-sm font-medium">{t('room')}</Label>
                    <RoomSelect
                      value={displayValue(assignment, 'room')}
                      onChange={value => onStringFieldChange(period, group.id, 'room', value)}
                      rooms={rooms}
                    />
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      </CardContent>
    </Card>
  )
}
