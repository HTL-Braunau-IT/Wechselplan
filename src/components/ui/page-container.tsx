import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

/**
 * Standard page wrapper: centers content, applies the shared responsive gutter
 * and vertical rhythm. Generous max width so 24"+ displays are used, while the
 * gutter tightens on 13" screens.
 *
 * `size="wide"` removes the max width for dense tools (schedule editor, grade
 * grids) that want the whole viewport.
 */
export function PageContainer({
  children,
  className,
  size = 'default',
}: {
  children: ReactNode
  className?: string
  size?: 'default' | 'narrow' | 'wide'
}) {
  return (
    <div
      className={cn(
        'mx-auto w-full px-4 py-6 sm:px-6 sm:py-8 xl:px-8',
        size === 'default' && 'max-w-[96rem]',
        size === 'narrow' && 'max-w-4xl',
        size === 'wide' && 'max-w-none',
        className,
      )}
    >
      {children}
    </div>
  )
}
