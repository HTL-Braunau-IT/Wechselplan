'use client'

import { useRouter, useSearchParams } from 'next/navigation'
import { Clock } from 'lucide-react'
import { ScheduleTimesSelector } from '@/components/schedule/schedule-times-selector'
import { PageContainer } from '@/components/ui/page-container'
import { PageHeader } from '@/components/ui/page-header'

/**
 * Page component for managing schedule and break times.
 *
 * Wraps the ScheduleTimesSelector component and handles navigation after save.
 */
export default function TimesPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const className = searchParams.get('class')
  const weekdayParam = searchParams.get('weekday')
  const weekday = weekdayParam ? parseInt(weekdayParam, 10) : null

  const handleSave = () => {
    const query = new URLSearchParams()
    if (className) query.set('class', className)
    if (weekday != null) query.set('weekday', String(weekday))
    router.push(`/schedule/create/overview?${query.toString()}`)
  }

  const handleCancel = () => {
    router.back()
  }

  return (
    <PageContainer size="wide" className="space-y-6">
      <PageHeader
        icon={Clock}
        title="Zeiten festlegen"
        description="Unterrichts- und Pausenzeiten für den Stundenplan auswählen"
      />
      <ScheduleTimesSelector
        className={className}
        weekday={weekday}
        onSave={handleSave}
        onCancel={handleCancel}
      />
    </PageContainer>
  )
}
