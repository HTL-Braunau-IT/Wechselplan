'use client'

import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { DoorOpen, MapPin } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Spinner } from '@/components/ui/spinner'
import { LEVELS } from '@/lib/raumplan/levels'
import type { StudentPlacementPeriod } from '@/lib/raumplan/types'
import { useClassList, useClassStudents, useStudentPlacement } from '../_hooks/use-raumplan'
import { GroupBadge } from './group-badge'

function levelTitle(level: string | null): string | null {
  return LEVELS.find(l => l.key === level)?.title ?? null
}

/** "Where should I be?" — pick a class + student and see their VM / NM rooms. */
export function StudentView({ date, schoolYearId }: { date: string; schoolYearId?: number }) {
  const { t } = useTranslation()
  const [className, setClassName] = useState<string | null>(null)
  const [studentId, setStudentId] = useState<number | null>(null)

  const classes = useClassList()
  const students = useClassStudents(className)
  const placement = useStudentPlacement(studentId, date, schoolYearId)

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t('raumplan.student.pickTitle')}</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <label className="text-muted-foreground text-xs font-medium">
              {t('raumplan.student.pickClass')}
            </label>
            <Select
              value={className ?? ''}
              onValueChange={value => {
                setClassName(value)
                setStudentId(null)
              }}
            >
              <SelectTrigger className="w-full">
                <SelectValue placeholder={t('raumplan.student.pickClass')} />
              </SelectTrigger>
              <SelectContent>
                {(classes.data ?? []).map(c => (
                  <SelectItem key={c.id} value={c.name}>
                    {c.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <label className="text-muted-foreground text-xs font-medium">
              {t('raumplan.student.pickStudent')}
            </label>
            <Select
              value={studentId != null ? String(studentId) : ''}
              onValueChange={value => setStudentId(Number(value))}
              disabled={!className || students.isLoading}
            >
              <SelectTrigger className="w-full">
                <SelectValue placeholder={t('raumplan.student.pickPlaceholder')} />
              </SelectTrigger>
              <SelectContent>
                {(students.data ?? []).map(s => (
                  <SelectItem key={s.id} value={String(s.id)}>
                    {s.lastName} {s.firstName}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {studentId == null ? (
        <p className="text-muted-foreground py-6 text-center text-sm">
          {t('raumplan.student.pickPlaceholder')}
        </p>
      ) : placement.isLoading ? (
        <div className="flex justify-center py-8">
          <Spinner size="lg" />
        </div>
      ) : placement.data ? (
        <div>
          <div className="mb-3 flex items-baseline justify-between gap-3">
            <h3 className="text-lg font-semibold">
              {placement.data.student.name}
              {placement.data.student.className && (
                <span className="text-muted-foreground ml-2 text-sm font-normal">
                  {placement.data.student.className}
                </span>
              )}
            </h3>
            <span className="text-muted-foreground text-sm">{placement.data.date}</span>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            {placement.data.periods.map(p => (
              <PeriodCard key={p.period} period={p} />
            ))}
          </div>
        </div>
      ) : null}
    </div>
  )
}

function PeriodCard({ period }: { period: StudentPlacementPeriod }) {
  const { t } = useTranslation()
  const title = period.period === 'AM' ? t('raumplan.student.amRoom') : t('raumplan.student.pmRoom')

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-muted-foreground text-sm font-medium">{title}</CardTitle>
      </CardHeader>
      <CardContent>
        {period.state === 'none' ? (
          <p className="text-muted-foreground py-2">{t('raumplan.student.nothingScheduled')}</p>
        ) : (
          <div className="space-y-2">
            <div className="flex items-center gap-2 text-2xl font-bold">
              <DoorOpen className="h-6 w-6" />
              {period.roomName}
            </div>
            {levelTitle(period.level) && (
              <div className="text-muted-foreground flex items-center gap-1.5 text-sm">
                <MapPin className="h-4 w-4" />
                {levelTitle(period.level)}
              </div>
            )}
            <dl className="space-y-1 pt-1 text-sm">
              <DetailRow label={t('raumplan.detail.teacher')} value={period.teacherName} />
              <DetailRow label={t('raumplan.detail.subject')} value={period.subjectName} />
              <DetailRow label={t('raumplan.detail.turnus')} value={period.turnName} />
            </dl>
            {period.groupId != null && (
              <div className="pt-1">
                <GroupBadge groupId={period.groupId} />
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  )
}

function DetailRow({ label, value }: { label: string; value: string | null }) {
  if (!value) return null
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className="text-muted-foreground text-xs font-medium">{label}</dt>
      <dd className="text-right font-medium">{value}</dd>
    </div>
  )
}
