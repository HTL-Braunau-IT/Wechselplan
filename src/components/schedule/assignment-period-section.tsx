import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { TeacherSelect } from '@/components/schedule/teacher-select'
import { SubjectSelect } from '@/components/schedule/subject-select'
import { LearningContentSelect } from '@/components/schedule/learning-content-select'
import { RoomSelect } from '@/components/schedule/room-select'
import type { ReactNode } from 'react'

interface Assignment {
  groupId: number
  teacherId: number
  subjectId: number
  learningContentId: number
  roomId: number
  customSubject?: string
  customLearningContent?: string
  customRoom?: string
}

interface NamedOption {
  id: number
  name: string
}

interface Teacher {
  id: number
  firstName: string
  lastName: string
}

interface Props {
  title: string
  groups: Array<{ id: number }>
  assignments: Assignment[]
  teachers: Teacher[]
  subjects: NamedOption[]
  learningContents: NamedOption[]
  rooms: NamedOption[]
  onAssignmentChange: (groupId: number, field: keyof Assignment, value: string | number) => void
  onStringFieldChange: (groupId: number, field: 'subject' | 'learningContent' | 'room', value: string) => void
  onClearRow: (groupId: number) => void
  getDisplayValue: (assignment: Assignment, field: 'subject' | 'learningContent' | 'room') => string
  t: (key: string) => string
  rightAction?: ReactNode
}

const defaultAssignmentFor = (groupId: number): Assignment => ({
  groupId,
  teacherId: 0,
  subjectId: 0,
  learningContentId: 0,
  roomId: 0
})

export function AssignmentPeriodSection({
  title,
  groups,
  assignments,
  teachers,
  subjects,
  learningContents,
  rooms,
  onAssignmentChange,
  onStringFieldChange,
  onClearRow,
  getDisplayValue,
  t,
  rightAction
}: Props) {
  return (
    <Card className="mb-8">
      <CardHeader>
        <div className="flex justify-between items-center">
          <CardTitle>{title}</CardTitle>
          {rightAction}
        </div>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          {groups.map((group) => {
            const assignment = assignments.find(a => a.groupId === group.id) ?? defaultAssignmentFor(group.id)
            return (
              <div key={group.id} className="p-4 border rounded-lg">
                <div className="flex justify-between items-center mb-4">
                  <h3 className="font-semibold">{t('group')} {group.id}</h3>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => onClearRow(group.id)}
                    className="text-destructive hover:text-destructive/90"
                  >
                    {t('clearRow')}
                  </Button>
                </div>
                <div className="grid gap-4 [grid-template-columns:repeat(auto-fit,minmax(200px,1fr))]">
                  <div>
                    <Label className="block text-sm font-medium mb-1">{t('teacher')}</Label>
                    <TeacherSelect
                      value={assignment.teacherId}
                      onChange={(value) => onAssignmentChange(group.id, 'teacherId', value)}
                      teachers={teachers}
                    />
                  </div>
                  <div>
                    <Label className="block text-sm font-medium mb-1">{t('subject')}</Label>
                    <SubjectSelect
                      value={getDisplayValue(assignment, 'subject')}
                      onChange={(value) => onStringFieldChange(group.id, 'subject', value)}
                      subjects={subjects}
                    />
                  </div>
                  <div>
                    <Label className="block text-sm font-medium mb-1">{t('learningContent')}</Label>
                    <LearningContentSelect
                      value={getDisplayValue(assignment, 'learningContent')}
                      onChange={(value) => onStringFieldChange(group.id, 'learningContent', value)}
                      learningContents={learningContents}
                    />
                  </div>
                  <div>
                    <Label className="block text-sm font-medium mb-1">{t('room')}</Label>
                    <RoomSelect
                      value={getDisplayValue(assignment, 'room')}
                      onChange={(value) => onStringFieldChange(group.id, 'room', value)}
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
