'use client'

import { CreationProgress } from '@/components/schedule/creation-progress'

export default function ScheduleCreationLayout({
	children,
}: {
	children: React.ReactNode
}) {
	return (
		<div className="flex mt-8">
			{/* Progress bar sidebar */}
			<div className="w-64 max-h-[360px] ml-4 border-r bg-background sticky top-24 border ">
				<CreationProgress />
			</div>

      		{/* Main content */}
      		<div className="flex-1">{children}</div>
    	</div>
  );
}