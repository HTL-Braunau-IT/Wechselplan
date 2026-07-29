'use client'

import { useTranslation } from 'next-i18next'
import { usePathname, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { Check } from 'lucide-react'

interface Step {
  id: string
  path: string
}

const steps: Step[] = [
  { id: 'class', path: '/schedule/create' },
  { id: 'teachers', path: '/schedule/create/teachers' },
  { id: 'rotation', path: '/schedule/create/rotation' },
  { id: 'times', path: '/schedule/create/times' },
  { id: 'overview', path: '/schedule/create/overview' },
]

/**
 * Renders a vertical progress indicator for the schedule creation process, visually displaying completed, current, and upcoming steps.
 *
 * The progress indicator highlights the user's current position in the multi-step schedule creation flow, disables navigation to future steps, and preserves the selected class in the URL when navigating between steps.
 */
export function CreationProgress() {
  const { t } = useTranslation('schedule')
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const selectedClass = searchParams.get('class')

  const currentStepIndex = steps.findIndex(step => pathname === step.path)

  return (
    <div className="sticky top-16 flex flex-col items-start px-4 py-8">
      {steps.map((step, index) => {
        const isCompleted = index < currentStepIndex
        const isCurrent = index === currentStepIndex
        const isClickable = isCompleted || isCurrent
        const href = selectedClass ? `${step.path}?class=${selectedClass}` : step.path

        const stepInner = (
          <>
            {/* Circle */}
            <div
              className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full border-2 transition-colors ${
                isCompleted
                  ? 'border-success bg-success text-success-foreground'
                  : isCurrent
                    ? 'border-primary text-primary bg-primary/10'
                    : 'border-muted text-muted-foreground'
              }`}
            >
              {isCompleted ? <Check className="h-5 w-5" /> : <span>{index + 1}</span>}
            </div>

            {/* Label */}
            <div
              className={`ml-3 text-sm font-medium whitespace-nowrap transition-colors ${
                isCompleted
                  ? 'text-success'
                  : isCurrent
                    ? 'text-primary font-semibold'
                    : 'text-muted-foreground'
              }`}
            >
              {t(`steps.${step.id}`)}
            </div>

            {/* Connecting line */}
            {index < steps.length - 1 && (
              <div
                className={`absolute top-[32px] left-4 h-8 w-0.5 ${
                  isCompleted ? 'bg-success' : 'bg-muted'
                }`}
              />
            )}
          </>
        )

        const stepClasses = `group relative mb-8 flex w-full items-center ${
          isClickable ? 'cursor-pointer' : 'cursor-not-allowed opacity-50'
        }`

        return isClickable ? (
          <Link key={step.id} href={href} className={stepClasses}>
            {stepInner}
          </Link>
        ) : (
          <div key={step.id} className={stepClasses} aria-disabled="true">
            {stepInner}
          </div>
        )
      })}
    </div>
  )
}
