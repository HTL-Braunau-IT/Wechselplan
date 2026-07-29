'use client'

import { useTranslation } from 'react-i18next'
import { CheckCircle2 } from 'lucide-react'
import { cn } from '@/lib/utils'

/**
 * How far the signed-in teacher has got with their own column(s) for the class
 * and semester on screen.
 *
 * The grid answers this only by scanning it: rows with a gap float to the top,
 * but nothing says how many are left, so on a class of 24 you counted by eye.
 */
export function MyProgress({
  entered,
  total,
  semesterLabel,
  className,
}: {
  entered: number
  total: number
  semesterLabel: string
  className?: string
}) {
  const { t } = useTranslation()

  if (total === 0) return null

  const complete = entered >= total
  const percent = Math.round((entered / total) * 100)

  return (
    <div
      className={cn(
        'flex flex-wrap items-center gap-x-3 gap-y-2 rounded-lg border px-3 py-2',
        complete ? 'border-success/30 bg-success/5' : 'bg-muted/40',
        className,
      )}
    >
      <span className="flex items-center gap-1.5 text-sm font-medium">
        {complete && <CheckCircle2 className="text-success h-4 w-4" aria-hidden />}
        {t('notensammler.myGrades', 'Meine Noten')}
        <span className="text-muted-foreground font-normal">· {semesterLabel}</span>
      </span>

      <div className="bg-muted h-1.5 w-32 overflow-hidden rounded-full" aria-hidden>
        <div
          className={cn(
            'h-full rounded-full transition-all',
            complete ? 'bg-success' : 'bg-primary',
          )}
          style={{ width: `${percent}%` }}
        />
      </div>

      <span className="text-muted-foreground text-sm tabular-nums">
        {t('notensammler.progressCount', '{{entered}} von {{total}}', { entered, total })}
        {!complete && (
          <span className="text-destructive ml-2 font-medium">
            {t('notensammler.progressMissing', '{{count}} offen', { count: total - entered })}
          </span>
        )}
      </span>
    </div>
  )
}
