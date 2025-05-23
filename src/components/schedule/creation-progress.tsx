'use client'

import { useTranslation } from 'next-i18next'
import { usePathname } from 'next/navigation'
import Link from 'next/link'

interface Step {
	id: string
	path: string
}

const steps: Step[] = [
	{ id: 'class', path: '/schedule/create' },
	{ id: 'teachers', path: '/schedule/create/teachers' },
	{ id: 'rotation', path: '/schedule/create/rotation' },
	{ id: 'times', path: '/schedule/create/times' },
	{ id: 'review', path: '/schedule/create/review' }
]

export function CreationProgress() {
	const { t } = useTranslation('schedule')
	const pathname = usePathname()
	const searchParams = new URLSearchParams(window.location.search)
	const selectedClass = searchParams.get('class')

	const currentStepIndex = steps.findIndex(step => pathname === step.path)

	return (
		<div className="flex flex-col items-start py-8 px-4">
			{steps.map((step, index) => {
				const isCompleted = index < currentStepIndex
				const isCurrent = index === currentStepIndex
				const isClickable = isCompleted || isCurrent
				const href = isClickable 
					? selectedClass 
						? `${step.path}?class=${selectedClass}`
						: step.path
					: '#'

				return (
					<Link
						key={step.id}
						href={href}
						className={`relative flex items-center w-full mb-8 group ${
							isClickable ? 'cursor-pointer' : 'cursor-not-allowed opacity-50'
						}`}
					>
						{/* Circle */}
						<div
							className={`w-8 h-8 rounded-full border-2 flex items-center justify-center transition-colors shrink-0 ${
								isCompleted
									? 'bg-green-500 border-green-500 text-white group-hover:bg-green-600 group-hover:border-green-600'
									: isCurrent
									? 'border-blue-500 text-blue-500 group-hover:border-blue-600 group-hover:text-blue-600'
									: 'border-gray-300 text-gray-300'
							}`}
						>
							{isCompleted ? (
								<svg
									xmlns="http://www.w3.org/2000/svg"
									className="h-5 w-5"
									viewBox="0 0 20 20"
									fill="currentColor"
								>
									<path
										fillRule="evenodd"
										d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
										clipRule="evenodd"
									/>
								</svg>
							) : (
								<span>{index + 1}</span>
							)}
						</div>

						{/* Label */}
						<div
							className={`ml-3 text-sm font-medium whitespace-nowrap transition-colors ${
								isCompleted
									? 'text-green-500 group-hover:text-green-600'
									: isCurrent
									? 'text-blue-500 group-hover:text-blue-600'
									: 'text-gray-500'
							}`}
						>
							{t(`steps.${step.id}`)}
						</div>

						{/* Connecting line */}
						{index < steps.length - 1 && (
							<div
								className={`absolute left-4 top-[32px] w-0.5 h-8 ${
									isCompleted ? 'bg-green-500 group-hover:bg-green-600' : 'bg-gray-200'
								}`}
							/>
						)}
					</Link>
				)
			})}
		</div>
	)
} 