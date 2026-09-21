'use client'

import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { AlertCircle, DoorOpen } from 'lucide-react'
import { useSchoolYear } from '@/contexts/school-year-context'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { EmptyState } from '@/components/ui/empty-state'
import { PageContainer } from '@/components/ui/page-container'
import { PageHeader } from '@/components/ui/page-header'
import { Spinner } from '@/components/ui/spinner'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Input } from '@/components/ui/input'
import { formatPlanDate, parsePlanDate } from '@/lib/raumplan/resolve'
import { useWeekOccupancy } from './_hooks/use-raumplan'
import { GrundrissView } from './_components/grundriss-view'
import { RoomMatrix } from './_components/room-matrix'
import { StudentView } from './_components/student-view'

/** Convert a native <input type="date"> value (yyyy-mm-dd) to a Date. */
function fromInputValue(value: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value)
  if (!m) return null
  return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]))
}

/** Convert a "dd.MM.yy" plan date to a native date-input value (yyyy-mm-dd). */
function toInputValue(planDate: string): string {
  const d = parsePlanDate(planDate)
  if (!d) return ''
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}

/**
 * Raumplan — room-occupancy view. Three tabs (Grundriss / Matrix / Schüler) over
 * one week's occupancy data, resolved from the existing schedule/rotation tables.
 * Read-only; no bookings are edited here.
 */
export default function RaumplanPage() {
  const { t } = useTranslation()
  const { selectedYear } = useSchoolYear()
  const schoolYearId = selectedYear?.id

  const [refDate, setRefDate] = useState<string>(() => formatPlanDate(new Date()))
  const { data, isLoading, isError } = useWeekOccupancy(refDate, schoolYearId)

  return (
    <PageContainer size="wide" className="space-y-6">
      <PageHeader
        icon={DoorOpen}
        title={t('raumplan.title')}
        description={t('raumplan.description')}
        actions={
          <div className="flex items-center gap-2">
            <label className="text-muted-foreground text-sm whitespace-nowrap">
              {t('raumplan.controls.week')}
            </label>
            <Input
              type="date"
              className="w-[160px]"
              value={toInputValue(refDate)}
              onChange={e => {
                const d = fromInputValue(e.target.value)
                if (d) setRefDate(formatPlanDate(d))
              }}
            />
          </div>
        }
      />

      {isError && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>{t('raumplan.loadError')}</AlertTitle>
          <AlertDescription>{t('raumplan.loadError')}</AlertDescription>
        </Alert>
      )}

      {isLoading ? (
        <div className="flex min-h-[280px] items-center justify-center">
          <Spinner size="lg" />
        </div>
      ) : !data ? (
        !isError && (
          <EmptyState
            icon={DoorOpen}
            title={t('raumplan.empty.title')}
            description={t('raumplan.empty.description')}
          />
        )
      ) : (
        <Tabs defaultValue="grundriss">
          <TabsList>
            <TabsTrigger value="grundriss">{t('raumplan.views.grundriss')}</TabsTrigger>
            <TabsTrigger value="matrix">{t('raumplan.views.matrix')}</TabsTrigger>
            <TabsTrigger value="student">{t('raumplan.views.student')}</TabsTrigger>
          </TabsList>

          <TabsContent value="grundriss" className="mt-4">
            <GrundrissView data={data} />
          </TabsContent>
          <TabsContent value="matrix" className="mt-4">
            <RoomMatrix data={data} />
          </TabsContent>
          <TabsContent value="student" className="mt-4">
            <StudentView date={refDate} schoolYearId={schoolYearId} />
          </TabsContent>
        </Tabs>
      )}
    </PageContainer>
  )
}
