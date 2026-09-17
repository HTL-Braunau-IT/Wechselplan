'use client'

import { useTranslation } from 'react-i18next'
import { MoreHorizontal } from 'lucide-react'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { cn } from '@/lib/utils'
import { getGradeBoxClass } from '@/lib/grades'

const WHOLE_GRADES = [1, 2, 3, 4, 5] as const

/**
 * The 1–5 grade palette for the focused entry row: one tinted button per whole
 * mark, a ½ toggle that turns the current mark into its half step, and an
 * overflow menu for the two sentinels (nicht beurteilt / gestunden) and clear.
 *
 * Values are handed back as strings so the caller can feed them straight to the
 * page's `handleGradeChange` / `parseGradeInput` — 'nb'/'gs' are the shorthands
 * that parser already understands, '' clears.
 */
export function GradeButtons({
  value,
  onPick,
  disabled = false,
}: {
  value: number | null
  onPick: (value: string) => void
  disabled?: boolean
}) {
  const { t } = useTranslation()

  const whole = value == null ? null : Math.floor(value)
  const isHalf = value != null && value % 1 === 0.5
  // 4.5 is the largest half step; 5.5 is not a grade, so ½ is a no-op on a 5.
  const canHalve = value != null && Number.isInteger(value) && value <= 4

  const toggleHalf = () => {
    if (value == null) return
    if (isHalf) onPick(String(Math.floor(value)))
    else if (canHalve) onPick(String(value + 0.5))
  }

  return (
    <span className="flex items-center gap-1">
      {WHOLE_GRADES.map(grade => {
        const active = whole === grade
        return (
          <button
            key={grade}
            type="button"
            disabled={disabled}
            aria-pressed={active}
            onClick={() => onPick(String(grade))}
            className={cn(
              'inline-flex h-[34px] w-[38px] items-center justify-center rounded-md border text-base font-semibold tabular-nums transition-colors disabled:pointer-events-none disabled:opacity-50',
              getGradeBoxClass(grade),
              active
                ? 'ring-ring border-primary ring-2'
                : 'hover:brightness-95 dark:hover:brightness-110',
            )}
          >
            {grade}
          </button>
        )
      })}

      <button
        type="button"
        disabled={disabled || (!isHalf && !canHalve)}
        aria-pressed={isHalf}
        onClick={toggleHalf}
        title={t('notensammler.halfStep', 'Halbe Note')}
        className={cn(
          'border-input bg-background text-muted-foreground shadow-xs ml-1 inline-flex h-[34px] items-center rounded-md border px-2.5 text-xs font-medium transition-colors disabled:pointer-events-none disabled:opacity-50',
          isHalf && 'border-primary text-foreground',
        )}
      >
        ½
      </button>

      <DropdownMenu>
        <DropdownMenuTrigger asChild disabled={disabled}>
          <button
            type="button"
            title={t('notensammler.sentinelMenu', 'nicht beurteilt · gestunden')}
            className="border-input bg-background text-muted-foreground shadow-xs inline-flex h-[34px] w-[34px] items-center justify-center rounded-md border transition-colors disabled:pointer-events-none disabled:opacity-50"
          >
            <MoreHorizontal className="h-4 w-4" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onSelect={() => onPick('nb')}>
            {t('notensammler.nichtBeurteilt', 'nicht beurteilt')}
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => onPick('gs')}>
            {t('notensammler.gestunden', 'gestunden')}
          </DropdownMenuItem>
          {value != null && (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem onSelect={() => onPick('')}>
                {t('notensammler.clearMark', 'Note löschen')}
              </DropdownMenuItem>
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
    </span>
  )
}
