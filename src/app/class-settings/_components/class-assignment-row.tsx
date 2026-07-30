'use client'

import { CheckCircle2, School } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import type { Class, Teacher } from '@/types/types'
import { TeacherCombobox } from './teacher-combobox'
import { pendingKeyOf, type AssignmentField } from '../_hooks/use-class-settings'

interface ClassAssignmentRowProps {
  cls: Class
  teachers: Teacher[]
  pendingKeys: ReadonlySet<string>
  onUpdate: (classId: number, field: AssignmentField, teacherId: number | null) => void
}

/** One class with its two role pickers (Klassenvorstand + Klassenleiter). */
export function ClassAssignmentRow({
  cls,
  teachers,
  pendingKeys,
  onUpdate,
}: ClassAssignmentRowProps) {
  const { t } = useTranslation()
  const complete = cls.classHeadId != null && cls.classLeadId != null

  return (
    <div className="border-border/60 bg-card flex flex-col gap-4 rounded-xl border p-4 lg:flex-row lg:items-center lg:justify-between">
      <div className="flex items-center gap-3">
        <span
          className={cn(
            'flex h-9 w-9 shrink-0 items-center justify-center rounded-lg',
            complete ? 'bg-success/12 text-success' : 'bg-muted text-muted-foreground',
          )}
        >
          {complete ? <CheckCircle2 className="h-5 w-5" /> : <School className="h-5 w-5" />}
        </span>
        <div className="min-w-0">
          <p className="truncate font-semibold">{cls.name}</p>
          <Badge variant={complete ? 'soft-success' : 'soft-warning'} className="mt-1">
            {complete ? t('classSettings.status.complete') : t('classSettings.status.incomplete')}
          </Badge>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:w-[32rem]">
        <div className="space-y-1.5">
          <span className="text-muted-foreground text-xs font-medium tracking-wide uppercase">
            {t('classSettings.classHead')}
          </span>
          <TeacherCombobox
            teachers={teachers}
            value={cls.classHeadId}
            onChange={id => onUpdate(cls.id, 'head', id)}
            placeholder={t('classSettings.selectClassHead')}
            noneLabel={t('classSettings.none')}
            searchPlaceholder={t('classSettings.searchTeacher')}
            emptyLabel={t('classSettings.noTeachers')}
            ariaLabel={`${t('classSettings.classHead')} – ${cls.name}`}
            loading={pendingKeys.has(pendingKeyOf(cls.id, 'head'))}
          />
        </div>
        <div className="space-y-1.5">
          <span className="text-muted-foreground text-xs font-medium tracking-wide uppercase">
            {t('classSettings.classLead')}
          </span>
          <TeacherCombobox
            teachers={teachers}
            value={cls.classLeadId}
            onChange={id => onUpdate(cls.id, 'lead', id)}
            placeholder={t('classSettings.selectClassLead')}
            noneLabel={t('classSettings.none')}
            searchPlaceholder={t('classSettings.searchTeacher')}
            emptyLabel={t('classSettings.noTeachers')}
            ariaLabel={`${t('classSettings.classLead')} – ${cls.name}`}
            loading={pendingKeys.has(pendingKeyOf(cls.id, 'lead'))}
          />
        </div>
      </div>
    </div>
  )
}
