'use client'

import { useTranslation } from 'next-i18next'
import { usePathname, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { Check } from 'lucide-react'
import { cn } from '@/lib/utils'

interface Step {
  id: string
  path: string
}

const steps: Step[] = [
  { id: 'class', path: '/schedule/create' },
  { id: 'groups', path: '/schedule/create/groups' },
  { id: 'teachers', path: '/schedule/create/teachers' },
  { id: 'rotation', path: '/schedule/create/rotation' },
  { id: 'times', path: '/schedule/create/times' },
  { id: 'overview', path: '/schedule/create/overview' },
]

/**
 * Horizontal step indicator for the schedule-creation wizard.
 *
 * Sits as a full-width bar directly under the app topbar (see the wizard
 * `layout.tsx`). Completed steps are clickable and marked with a check, the
 * current step is highlighted, and upcoming steps are disabled. The selected
 * class and weekday are kept in the URL so context survives back-navigation.
 * On narrow screens only the current step keeps its label; the bar scrolls
 * horizontally rather than forcing a page scroll.
 */
export function CreationProgress() {
  const { t } = useTranslation('schedule')
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const selectedClass = searchParams.get('class')
  const selectedWeekday = searchParams.get('weekday')

  const currentStepIndex = steps.findIndex(step => pathname === step.path)

  // Keep the class (and, once chosen, the weekday) in the URL as the user steps
  // back and forth — every step after the first is scoped to a single weekday.
  const hrefFor = (path: string) => {
    const params = new URLSearchParams()
    if (selectedClass) params.set('class', selectedClass)
    if (selectedWeekday) params.set('weekday', selectedWeekday)
    const query = params.toString()
    return query ? `${path}?${query}` : path
  }

  return (
    <nav
      aria-label={t('steps.class')}
      className="bg-card sticky top-16 z-20 flex h-14 items-center gap-2 overflow-x-auto border-b px-4 sm:px-8"
    >
      {steps.map((step, index) => {
        const isCompleted = index < currentStepIndex
        const isCurrent = index === currentStepIndex
        const isClickable = isCompleted || isCurrent
        const href = hrefFor(step.path)

        const inner = (
          <>
            <span
              className={cn(
                'flex h-6 w-6 shrink-0 items-center justify-center rounded-full border text-xs font-semibold tabular-nums transition-colors',
                isCompleted
                  ? 'border-primary bg-primary text-primary-foreground'
                  : isCurrent
                    ? 'border-primary bg-primary/10 text-primary'
                    : 'border-border text-muted-foreground',
              )}
            >
              {isCompleted ? <Check className="h-3.5 w-3.5" /> : index + 1}
            </span>
            <span
              className={cn(
                'text-sm whitespace-nowrap transition-colors',
                isCurrent
                  ? 'text-foreground font-semibold'
                  : isCompleted
                    ? 'text-foreground font-medium'
                    : 'text-muted-foreground font-medium',
                // Keep the bar compact on small screens: only the current step
                // shows its label until there is room for all of them.
                isCurrent ? 'inline' : 'hidden md:inline',
              )}
            >
              {t(`steps.${step.id}`)}
            </span>
          </>
        )

        return (
          <div key={step.id} className="flex shrink-0 items-center gap-2">
            {isClickable ? (
              <Link
                href={href}
                aria-current={isCurrent ? 'step' : undefined}
                className="flex items-center gap-2 rounded-md py-1"
              >
                {inner}
              </Link>
            ) : (
              <div aria-disabled="true" className="flex items-center gap-2 py-1 opacity-50">
                {inner}
              </div>
            )}
            {index < steps.length - 1 && (
              <span
                aria-hidden="true"
                className={cn(
                  'h-px w-6 shrink-0 sm:w-10',
                  isCompleted ? 'bg-primary' : 'bg-border',
                )}
              />
            )}
          </div>
        )
      })}
    </nav>
  )
}
