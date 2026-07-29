'use client'

import { useTranslation } from 'react-i18next'
import { CheckCircle2, X } from 'lucide-react'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import type { TeacherClassSummary } from '../_lib/types'

/** Tick or cross for one semester's completion state. */
function CompletionBadge({
  label,
  complete,
  className,
}: {
  label: string
  complete: boolean
  className: string
}) {
  return (
    <span className={className}>
      {label}
      {complete ? (
        <CheckCircle2
          className="h-3.5 w-3.5 shrink-0 text-green-600 dark:text-green-400"
          aria-hidden
        />
      ) : (
        <X className="text-destructive h-3.5 w-3.5 shrink-0" aria-hidden />
      )}
    </span>
  )
}

/** Quick switcher across the classes the signed-in teacher is assigned to. */
export function ClassTabBar({
  teacherClasses,
  selectedClassId,
  onSelect,
}: {
  teacherClasses: TeacherClassSummary[]
  selectedClassId: string
  onSelect: (classId: string) => void
}) {
  const { t } = useTranslation()

  if (teacherClasses.length === 0) return null

  const activeValue = teacherClasses.some(cls => cls.id.toString() === selectedClassId)
    ? selectedClassId
    : ''

  return (
    <Tabs value={activeValue} onValueChange={onSelect} className="mb-4">
      <TabsList className="text-foreground flex h-auto flex-wrap gap-2 bg-transparent p-0">
        {teacherClasses.map(cls => (
          <TabsTrigger
            key={cls.id}
            value={cls.id.toString()}
            className="group hover:bg-muted/80 data-[state=active]:ring-primary flex items-center gap-3 rounded-lg px-4 py-2.5 text-sm font-medium shadow-sm transition-all data-[state=active]:shadow-md data-[state=active]:ring-2 data-[state=active]:ring-inset"
          >
            <span className="font-semibold">{cls.name}</span>
            <span className="flex items-center gap-2 text-xs font-normal opacity-90">
              <CompletionBadge
                label={t('notensammler.firstSemesterShort', '1. Sem')}
                complete={cls.allGradesEnteredFirst}
                className="bg-background/60 flex items-center gap-1 rounded-md px-2 py-0.5"
              />
              <CompletionBadge
                label={t('notensammler.secondSemesterShort', '2. Sem')}
                complete={cls.allGradesEnteredSecond}
                className="bg-background/60 flex items-center gap-1 rounded-md px-2 py-0.5"
              />
            </span>
          </TabsTrigger>
        ))}
      </TabsList>
    </Tabs>
  )
}
