'use client'

import { CreationProgress } from '@/components/schedule/creation-progress'

export default function ScheduleCreationLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex flex-col lg:flex-row">
      {/* Progress: top strip on small screens, sidebar on large so step context
          and back-navigation stay available at every width. */}
      <div className="border-b lg:hidden">
        <CreationProgress />
      </div>
      <div className="hidden w-64 shrink-0 border-r lg:block">
        <CreationProgress />
      </div>

      {/* Main content */}
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  )
}
