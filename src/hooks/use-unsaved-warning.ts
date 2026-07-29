'use client'

import { useEffect } from 'react'

/**
 * Warns the user before they close/reload the tab (or navigate to an external URL)
 * while there is unsaved work in the current step.
 *
 * The schedule-creation wizard persists each step when the user clicks "Next", so
 * edits made within a step (dragging students into groups, typing teacher
 * assignments, the not-yet-finished final step) are lost if the tab is closed
 * first. Enable this while such edits are pending.
 *
 * Note: this only covers hard unloads (close/reload/external navigation). In-app
 * route changes are not blocked.
 */
export function useUnsavedWarning(when: boolean) {
  useEffect(() => {
    if (!when) return

    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault()
      // Legacy browsers require returnValue to be set to trigger the prompt.
      e.returnValue = ''
    }

    window.addEventListener('beforeunload', handler)
    return () => window.removeEventListener('beforeunload', handler)
  }, [when])
}
