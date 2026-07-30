'use client'

import { useSearchParams } from 'next/navigation'
import { RefreshCw } from 'lucide-react'

import { TurnusEditor } from '@/components/schedule/turnus-editor'
import { useSchoolYear } from '@/contexts/school-year-context'
import { PageContainer } from '@/components/ui/page-container'
import { PageHeader } from '@/components/ui/page-header'
import { EmptyState } from '@/components/ui/empty-state'
import { useTranslation } from 'next-i18next'

/**
 * The Turnus step: sets the number of Turnusse and their week lengths per period
 * (AM/PM independently), then persists the per-lane rotation weeks.
 */
export default function RotationPage() {
  const { t } = useTranslation('schedule')
  const searchParams = useSearchParams()
  const { selectedYear } = useSchoolYear()
  const className = searchParams.get('class')
  const weekdayParam = searchParams.get('weekday')
  const parsedWeekday = weekdayParam ? parseInt(weekdayParam, 10) : NaN
  const weekday =
    Number.isInteger(parsedWeekday) && parsedWeekday >= 0 && parsedWeekday <= 6 ? parsedWeekday : 1

  // Rotation dates are computed within the *selected* school year.
  const schoolYearStart = selectedYear ? new Date(selectedYear.startDate) : null
  const schoolYearEnd = selectedYear ? new Date(selectedYear.endDate) : null
  const schoolYearMiddle = selectedYear ? new Date(selectedYear.semesterChangeDate) : null

  return (
    <PageContainer size="wide" className="space-y-6">
      <PageHeader
        icon={RefreshCw}
        title={t('steps.rotation')}
        description={t('rotationDescription')}
      />
      {className ? (
        <TurnusEditor
          className={className}
          weekday={weekday}
          schoolYearId={selectedYear?.id}
          schoolYearStart={schoolYearStart}
          schoolYearEnd={schoolYearEnd}
          schoolYearMiddle={schoolYearMiddle}
        />
      ) : (
        <EmptyState icon={RefreshCw} title={t('noClassSelected')} />
      )}
    </PageContainer>
  )
}
