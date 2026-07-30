'use client'

import { useRouter, useSearchParams } from 'next/navigation'
import { useTranslation } from 'react-i18next'
import { AlertCircle, CalendarDays } from 'lucide-react'
import { useSchoolYear } from '@/contexts/school-year-context'
import { useScheduleOverview } from '@/hooks/use-schedule-overview'
import { ScheduleOverview } from '@/components/schedule-overview'
import { Spinner } from '@/components/ui/spinner'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { EmptyState } from '@/components/ui/empty-state'
import { PageContainer } from '@/components/ui/page-container'
import { PageHeader } from '@/components/ui/page-header'
import { TooltipProvider } from '@/components/ui/tooltip'
import { ClassPicker } from './_components/class-picker'
import { ScheduleExportMenu } from './_components/schedule-export-menu'
import { useSchedulesList } from './_hooks/use-schedules-list'
import { useScheduleExport } from './_hooks/use-schedule-export'

/**
 * Schedule overview — view and export any class's rotation plan.
 *
 * A class is picked from chips that carry each plan's availability, then its
 * plan is shown and can be exported. Previously the page rendered the export
 * buttons twice (its own row plus the overview's), and resolved the current
 * teacher's period assignment in three places; that is now one picker, one
 * export menu, and one teacher lookup.
 */
export default function SchedulesPage() {
  const { t } = useTranslation()
  const router = useRouter()
  const searchParams = useSearchParams()
  const { selectedYear } = useSchoolYear()
  const schoolYearId = selectedYear?.id

  const { classes, loading: listLoading, error: listError } = useSchedulesList(schoolYearId)

  const selectedClass = searchParams.get('class')
  const selectedOption = classes.find(cls => cls.name === selectedClass) ?? null
  const hasSchedule = selectedOption?.hasSchedule ?? false

  const overview = useScheduleOverview(hasSchedule ? selectedClass : null, schoolYearId)

  const exportState = useScheduleExport({
    className: selectedClass,
    weekday: overview.weekday,
    amAssignments: overview.amAssignments,
    pmAssignments: overview.pmAssignments,
  })

  const onSelect = (className: string) => {
    router.push(`/schedules?class=${encodeURIComponent(className)}`)
  }

  const showExport = hasSchedule && !overview.loading && !overview.error

  return (
    <TooltipProvider delayDuration={200}>
      <PageContainer size="wide" className="space-y-6">
        <PageHeader
          icon={CalendarDays}
          title={t('schedules.title', 'Wechselpläne')}
          description={t(
            'schedules.subtitle',
            'Wechselpläne aller Klassen einsehen und exportieren.',
          )}
          actions={
            showExport ? (
              <ScheduleExportMenu
                busy={exportState.busy}
                canExcelAm={exportState.canExcelAm}
                canExcelPm={exportState.canExcelPm}
                onExport={exportState.runExport}
              />
            ) : null
          }
        />

        {listError && (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertTitle>{t('schedules.loadErrorTitle', 'Fehler beim Laden')}</AlertTitle>
            <AlertDescription>{listError}</AlertDescription>
          </Alert>
        )}

        {listLoading ? (
          <div className="flex min-h-[240px] items-center justify-center">
            <Spinner size="lg" />
          </div>
        ) : classes.length === 0 ? (
          <EmptyState
            icon={CalendarDays}
            title={t('schedules.noClassesTitle', 'Keine Klassen gefunden')}
            description={t(
              'schedules.noClassesDesc',
              'Für das ausgewählte Schuljahr sind keine Klassen vorhanden.',
            )}
          />
        ) : (
          <>
            <ClassPicker classes={classes} selectedClassName={selectedClass} onSelect={onSelect} />

            {!selectedOption ? (
              <EmptyState
                icon={CalendarDays}
                title={t('schedules.noClassSelectedTitle', 'Keine Klasse ausgewählt')}
                description={t(
                  'schedules.noClassSelectedDesc',
                  'Wähle oben eine Klasse, um ihren Wechselplan einzusehen.',
                )}
              />
            ) : !hasSchedule || overview.error ? (
              <EmptyState
                icon={AlertCircle}
                title={t('schedules.noScheduleTitle', 'Kein Wechselplan für {{className}}', {
                  className: selectedOption.name,
                })}
                description={t(
                  'schedules.noScheduleDesc',
                  'Bitte den Klassenleiter auffordern, einen Wechselplan zu erstellen.',
                )}
              />
            ) : overview.loading ? (
              <div className="flex min-h-[240px] items-center justify-center">
                <Spinner size="lg" />
              </div>
            ) : (
              <ScheduleOverview
                groups={overview.groups}
                amAssignments={overview.amAssignments}
                pmAssignments={overview.pmAssignments}
                scheduleTimes={overview.scheduleTimes}
                breakTimes={overview.breakTimes}
                turns={overview.turns}
                classHead={overview.classHead}
                classLead={overview.classLead}
                additionalInfo={overview.additionalInfo}
                weekday={overview.weekday}
              />
            )}
          </>
        )}
      </PageContainer>
    </TooltipProvider>
  )
}
