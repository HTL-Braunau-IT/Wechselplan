import { cn } from "@/lib/utils"

interface SpinnerProps {
  className?: string
  size?: 'sm' | 'md' | 'lg'
}

/**
 * A reusable loading spinner component with customizable size and styling.
 * 
 * @param {SpinnerProps} props - The component props
 * @param {string} [props.className] - Additional CSS classes to apply to the spinner
 * @param {'sm' | 'md' | 'lg'} [props.size='md'] - The size of the spinner
 * 
 * @example
 * // Default usage
 * <Spinner />
 * 
 * @example
 * // Custom size and styling
 * <Spinner size="lg" className="text-blue-500" />
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