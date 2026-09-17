'use client'

import { CreationProgress } from '@/components/schedule/creation-progress'

export default function ScheduleCreationLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-w-0 flex-col">
      {/* Full-width step bar directly under the app topbar, then the step body. */}
      <CreationProgress />
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  )
}
