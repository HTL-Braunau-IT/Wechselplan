'use client'

import { CreationProgress } from '@/components/schedule/creation-progress'

export default function ScheduleCreationLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="bg-background flex min-h-screen">
      {/* Progress bar sidebar */}
      <div className="bg-background w-64 border-r">
        <CreationProgress />
      </div>

      {/* Main content */}
      <div className="flex-1 p-8">{children}</div>
    </div>
  )
}
