'use client'

import type { ReactNode } from 'react'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'

/**
 * Wraps a control in a tooltip explaining what it does.
 *
 * Both grade pages used to carry a block of "Hinweise" above the grid,
 * describing buttons that were somewhere else on the screen. The guidance lives
 * on the control itself now. Needs a `TooltipProvider` above it.
 */
export function Hint({ label, children }: { label: string; children: ReactNode }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>{children}</TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  )
}
