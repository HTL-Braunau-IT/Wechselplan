import { Spinner } from '@/components/ui/spinner'
import type { ReactNode } from 'react'

interface Props {
  loading?: boolean
  error?: string | null
  empty?: boolean
  emptyMessage?: string
  children: ReactNode
}

export function PageState({ loading, error, empty, emptyMessage = 'No data available', children }: Props) {
  if (loading) {
    return (
      <div className="p-8 flex items-center justify-center min-h-[200px]">
        <Spinner size="lg" />
      </div>
    )
  }

  if (error) {
    return <div className="p-8 text-center text-red-500">{error}</div>
  }

  if (empty) {
    return <div className="p-8 text-center text-muted-foreground">{emptyMessage}</div>
  }

  return <>{children}</>
}
