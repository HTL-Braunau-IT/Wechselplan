'use client'

import type { ReactNode } from 'react'

/**
 * Consistent footer for every step of the schedule-creation wizard.
 *
 * Layout is fixed across all steps so button placement never shifts:
 * the "back" action sits on the left, the primary action (and any
 * secondary actions) sit on the right. When there is no back action a
 * spacer keeps the primary action right-aligned.
 */
export function WizardFooter({
  back,
  secondary,
  children,
}: {
  /** Left-aligned back action (omit on the first step). */
  back?: ReactNode
  /** Extra right-aligned actions rendered before the primary action. */
  secondary?: ReactNode
  /** The primary (right-most) action for the step. */
  children: ReactNode
}) {
  return (
    <div className="mt-8 flex items-center justify-between gap-3 border-t pt-6">
      <div>{back}</div>
      <div className="flex flex-wrap items-center justify-end gap-3">
        {secondary}
        {children}
      </div>
    </div>
  )
}
