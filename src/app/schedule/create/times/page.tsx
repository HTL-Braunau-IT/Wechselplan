'use client'

import { useRouter, useSearchParams } from 'next/navigation'
import { ScheduleTimesSelector } from '@/components/schedule/schedule-times-selector'

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
  const parsed = weekdayParam ? parseInt(weekdayParam, 10) : NaN
  const weekday = !Number.isNaN(parsed) && parsed >= 1 && parsed <= 5 ? parsed : null

  const handleSave = () => {
    const wq = weekday != null ? `&weekday=${weekday}` : ''
    router.push(`/schedule/create/overview?class=${className}${wq}`)
  }

  const handleCancel = () => {
    router.back()
  }

  return (
    <div className="container mx-auto p-4">
      <ScheduleTimesSelector
        className={className}
        weekday={weekday}
        onSave={handleSave}
        onCancel={handleCancel}
      />
    </div>
  )
} 
