import { cn } from '@/lib/utils'

/**
 * Placeholder block shown while content loads.
 *
 * Preferred over a spinner wherever the final layout is known, because it
 * reserves the space and avoids the jump when data arrives.
 */
function Skeleton({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('bg-muted animate-pulse rounded-md', className)} {...props} />
}

/** Skeleton rows sized to a table, so the page does not resize on load. */
function TableSkeleton({ rows = 6, columns = 5 }: { rows?: number; columns?: number }) {
  return (
    <div className="space-y-2" aria-busy="true" aria-label="Wird geladen">
      <div className="flex gap-3 border-b pb-2">
        {Array.from({ length: columns }).map((_, index) => (
          <Skeleton key={index} className="h-4 flex-1" />
        ))}
      </div>
      {Array.from({ length: rows }).map((_, rowIndex) => (
        <div key={rowIndex} className="flex gap-3 py-1">
          {Array.from({ length: columns }).map((_, columnIndex) => (
            <Skeleton key={columnIndex} className="h-8 flex-1" />
          ))}
        </div>
      ))}
    </div>
  )
}

export { Skeleton, TableSkeleton }
