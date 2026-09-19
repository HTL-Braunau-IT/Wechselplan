'use client'

import { useTranslation } from 'react-i18next'
import { School } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { ClassOption } from '../_lib/types'

/** Chip row for picking the class whose list to print. */
export function ClassChips({
  classes,
  selectedClassId,
  onSelect,
}: {
  classes: ClassOption[]
  selectedClassId: number | null
  onSelect: (classId: number) => void
}) {
  const { t } = useTranslation()

  return (
    <div className="border-border/60 bg-card/40 flex flex-col gap-3 rounded-xl border p-4">
      <p className="text-muted-foreground flex items-center gap-1.5 text-xs font-medium tracking-wide uppercase">
        <School className="h-3.5 w-3.5" />
        {t('klassenlisten.classesLabel', 'Klassen')}
      </p>
      <div className="flex flex-wrap gap-2">
        {classes.map(cls => {
          const active = cls.id === selectedClassId
          return (
            <button
              key={cls.id}
              type="button"
              aria-current={active ? 'true' : undefined}
              onClick={() => onSelect(cls.id)}
              className={cn(
                'focus-visible:ring-ring rounded-lg border px-3.5 py-2 text-sm font-semibold tabular-nums transition-colors focus-visible:ring-2 focus-visible:outline-none',
                active
                  ? 'border-primary bg-primary/10 text-foreground'
                  : 'border-border bg-background hover:bg-muted/60',
              )}
            >
              {cls.name}
            </button>
          )
        })}
      </div>
    </div>
  )
}
