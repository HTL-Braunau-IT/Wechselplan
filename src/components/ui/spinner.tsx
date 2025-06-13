import { cn } from "@/lib/utils"

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
 * // Large blue spinner
 * <Spinner size="lg" className="text-blue-500" />
 *
 * @param size - Spinner size; one of 'sm', 'md', or 'lg'. Defaults to 'md'.
 * @param className - Additional CSS classes to apply to the spinner.
 */
export function Spinner({ className, size = 'md' }: SpinnerProps) {
  const sizeClasses = {
    sm: 'h-4 w-4',
    md: 'h-8 w-8',
    lg: 'h-12 w-12'
  }

  return (
    <div className="flex items-center justify-center">
      <div
        className={cn(
          'animate-spin rounded-full border-4 border-gray-200 border-t-primary',
          sizeClasses[size],
          className
        )}
      />
    </div>
  )
} 