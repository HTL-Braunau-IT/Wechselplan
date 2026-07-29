import type { LucideIcon } from 'lucide-react'
import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

/**
 * Consistent empty / zero-data state: centered icon, title, description and an
 * optional call to action. Use instead of ad-hoc "Keine Daten" paragraphs so
 * empty screens feel intentional rather than broken.
 */
export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  className,
}: {
  icon?: LucideIcon
  title: string
  description?: string
  action?: ReactNode
  className?: string
}) {
  return (
    <div
      className={cn(
        'border-border/60 bg-card/40 flex flex-col items-center justify-center rounded-xl border border-dashed px-6 py-16 text-center',
        className,
      )}
    >
      {Icon ? (
        <span className="bg-muted text-muted-foreground mb-4 flex h-12 w-12 items-center justify-center rounded-full">
          <Icon className="h-6 w-6" />
        </span>
      ) : null}
      <h3 className="text-foreground text-base font-semibold">{title}</h3>
      {description ? (
        <p className="text-muted-foreground mt-1.5 max-w-md text-sm">{description}</p>
      ) : null}
      {action ? <div className="mt-5">{action}</div> : null}
    </div>
  )
}
