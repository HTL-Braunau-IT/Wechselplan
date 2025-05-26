'use client'

import { CreationProgress } from '@/components/schedule/creation-progress'

export default function ScheduleCreationLayout({
	children,
}: {
	children: React.ReactNode
}) {
	return (
		<div className="flex min-h-screen bg-background">
			{/* Progress bar sidebar */}
			<div className="w-64 border-r bg-background">
				<CreationProgress />
			</div>

			{/* Main content */}
			<div className="flex-1 p-8">
				{children}
			</div>
		</div>
	)
} 