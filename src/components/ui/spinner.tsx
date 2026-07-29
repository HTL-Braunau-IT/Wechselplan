import { cn } from '@/lib/utils'

interface SpinnerProps {
  className?: string
  size?: 'sm' | 'md' | 'lg'
}

/**
 * Displays a loading spinner with customizable size and optional additional styling.
 *
 * @example
 * // Default spinner
 * <Spinner />
 *
 * @example
 * // Large spinner
 * <Spinner size="lg" />
 *
 * @param size - Spinner size; one of 'sm', 'md', or 'lg'. Defaults to 'md'.
 * @param className - Additional CSS classes to apply to the spinner.
 */
export function Spinner({ className, size = 'md' }: SpinnerProps) {
  const sizeClasses = {
    sm: 'h-4 w-4 border-2',
    md: 'h-8 w-8 border-[3px]',
    lg: 'h-12 w-12 border-4',
  }

  return (
    <div className="flex items-center justify-center" role="status" aria-label="Wird geladen">
      <div
        className={cn(
          'border-muted border-t-primary animate-spin rounded-full',
          sizeClasses[size],
          className,
        )}
      />
    </div>
  )
}
