'use client'

import { useRouter, useSearchParams } from 'next/navigation'
import { RefreshCw } from 'lucide-react'
import { RotationScheduleEditor } from '@/components/schedule/rotation-schedule-editor'
import type { Schedule } from '@/components/schedule/rotation-schedule-editor'
import { useSchoolYear } from '@/contexts/school-year-context'
import { PageContainer } from '@/components/ui/page-container'
import { PageHeader } from '@/components/ui/page-header'

/**
 * Page component for creating and editing rotation schedules.
 *
 * Wraps the RotationScheduleEditor component and handles navigation after save.
 */
export default function RotationPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const { selectedYear } = useSchoolYear()
  const schoolYearId = selectedYear?.id
  const className = searchParams.get('class')
  const weekdayParam = searchParams.get('weekday')

  // The rotation dates must be computed within the *selected* school year, not a
  // hardcoded one — otherwise a plan created for a future year lands on wrong weeks.
  const schoolYearStart = selectedYear ? new Date(selectedYear.startDate) : null
  const schoolYearEnd = selectedYear ? new Date(selectedYear.endDate) : null
  const schoolYearMiddle = selectedYear ? new Date(selectedYear.semesterChangeDate) : null

  const handleSave = async (
    schedule: Schedule,
    selectedWeekday: number,
    additionalInfo: string,
    semesterPlanning: 'first' | 'second' | null,
  ) => {
    // First, get the numeric class ID from the class name
    const classResponse = await fetch(`/api/classes/get-by-name?name=${className}`)
    if (!classResponse.ok) {
      throw new Error('Failed to fetch class information')
    }
    const classData = await classResponse.json()
    if (!classData?.id) {
      throw new Error('Class not found')
    }

    const response = await fetch('/api/schedules', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        name: 'Rotation Schedule',
        description: `Rotation schedule for class ${className}`,
        startDate: new Date().toISOString(),
        endDate: new Date().toISOString(),
        selectedWeekday: selectedWeekday,
        scheduleData: schedule,
        additionalInfo,
        classId: classData.id.toString(),
        ...(schoolYearId != null && { schoolYearId }),
        semesterPlanning,
      }),
    })

    if (!response.ok) {
      throw new Error('Failed to save schedule')
    }

    // Navigate to the times page with both class and weekday parameters
    router.push(`/schedule/create/times?class=${className}&weekday=${selectedWeekday}`)
  }

  const handleCancel = () => {
    window.history.back()
  }

  return (
    <PageContainer size="wide" className="space-y-6">
      <PageHeader
        icon={RefreshCw}
        title="Rotationsplan"
        description="Turnusse, Rotationstag und individuelle Wochenlängen festlegen"
      />
      <RotationScheduleEditor
        className={className}
        initialWeekday={weekdayParam ? parseInt(weekdayParam) : null}
        schoolYearStart={schoolYearStart}
        schoolYearEnd={schoolYearEnd}
        schoolYearMiddle={schoolYearMiddle}
        onSave={handleSave}
        onCancel={handleCancel}
      />
    </PageContainer>
  )
}
