'use client'

import { CreationProgress } from '@/components/schedule/creation-progress'

export default function ScheduleCreationLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex">
      {/* Progress bar sidebar */}
      <div className="hidden w-64 shrink-0 border-r lg:block">
        <CreationProgress />
      </div>

      {/* Main content */}
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  )
}
