'use client'

import { useTranslation } from 'react-i18next'
import { CalendarClock, DoorOpen, MapPin, Sun, Sunset } from 'lucide-react'
import { useSchoolYear } from '@/contexts/school-year-context'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Spinner } from '@/components/ui/spinner'
import { LEVELS } from '@/lib/raumplan/levels'
import type { StudentPlacementPeriod } from '@/lib/raumplan/types'
import { useMyRoom } from '@/app/raumplan/_hooks/use-raumplan'
import { GroupBadge } from '@/app/raumplan/_components/group-badge'
import { StudentFloorPlan } from './student-floor-plan'

function levelTitle(level: string | null): string | null {
  return LEVELS.find(l => l.key === level)?.title ?? null
}

/**
 * Prominent "your room" card on the student home: the room the student's group
 * is in today, or — when today is not a workshop day — the next scheduled day.
 * Resolved server-side from the session (accurate normalized-table resolution,
 * unlike the legacy scheduleData-blob card). Renders nothing for non-students or
 * when no profile matches, so it never breaks the home page.
 */
export function StudentRoomHighlight() {
  const { t } = useTranslation()
  const { selectedYear } = useSchoolYear()
  const { data, isLoading, isError } = useMyRoom(selectedYear?.id)

  if (isLoading) {
    return (
      <Card>
        <CardContent className="flex min-h-[120px] items-center justify-center">
          <Spinner size="lg" />
        </CardContent>
      </Card>
    )
  }

  if (isError || !data) return null

  const dateLabel = `${t(`raumplan.weekdays.${data.weekday}`, { defaultValue: '' })}, ${data.date}`
  const title = data.isToday ? t('raumplan.home.todayTitle') : t('raumplan.home.nextTitle')

  return (
    <Card className="border-primary/30">
      <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0">
        <CardTitle className="flex items-center gap-2 text-lg">
          <DoorOpen className="text-primary h-5 w-5" />
          {title}
        </CardTitle>
        <span className="text-muted-foreground flex items-center gap-1.5 text-sm">
          <CalendarClock className="h-4 w-4" />
          {dateLabel}
        </span>
      </CardHeader>
      <CardContent>
        {!data.hasUpcoming ? (
          <p className="text-muted-foreground py-2 text-sm">{t('raumplan.home.none')}</p>
        ) : (
          <>
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              {data.periods.map(p => (
                <PeriodTile key={p.period} period={p} />
              ))}
            </div>
            <StudentFloorPlan periods={data.periods} weekday={data.weekday} />
          </>
        )}
      </CardContent>
    </Card>
  )
}

function PeriodTile({ period }: { period: StudentPlacementPeriod }) {
  const { t } = useTranslation()
  const Icon = period.period === 'AM' ? Sun : Sunset
  const label = period.period === 'AM' ? t('raumplan.student.amRoom') : t('raumplan.student.pmRoom')

  return (
    <div className="bg-muted/40 rounded-lg border p-4">
      <div className="mb-3 flex items-center gap-2">
        <span className="bg-background text-muted-foreground flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border">
          <Icon className="h-4 w-4" />
        </span>
        <p className="text-foreground text-sm font-semibold">{label}</p>
      </div>

      {period.state === 'none' ? (
        <p className="text-muted-foreground text-sm italic">
          {t('raumplan.student.nothingScheduled')}
        </p>
      ) : (
        <div className="space-y-2">
          <div className="flex items-center gap-2 text-3xl font-bold tracking-tight">
            <DoorOpen className="text-primary h-6 w-6" />
            {period.roomName}
          </div>
          {levelTitle(period.level) && (
            <div className="text-muted-foreground flex items-center gap-1.5 text-sm">
              <MapPin className="h-4 w-4" />
              {levelTitle(period.level)}
            </div>
          )}
          <dl className="space-y-1 pt-1 text-sm">
            <Row label={t('raumplan.detail.teacher')} value={period.teacherName} />
            <Row label={t('raumplan.detail.subject')} value={period.subjectName} />
          </dl>
          {period.groupId != null && (
            <div className="pt-1">
              <GroupBadge groupId={period.groupId} />
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function Row({ label, value }: { label: string; value: string | null }) {
  if (!value) return null
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className="text-muted-foreground text-xs font-medium">{label}</dt>
      <dd className="text-right font-medium">{value}</dd>
    </div>
  )
}
