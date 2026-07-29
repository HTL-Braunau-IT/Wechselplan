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

  const handleSave = () => {
    router.push(`/schedule/create/overview?class=${className}`)
  }

  const handleCancel = () => {
    router.back()
  }

  return (
    <div className="container mx-auto p-4">
      <ScheduleTimesSelector className={className} onSave={handleSave} onCancel={handleCancel} />
    </div>
  )
}
