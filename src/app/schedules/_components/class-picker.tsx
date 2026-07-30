'use client'

import { useTranslation } from 'react-i18next'
import { CalendarDays, CheckCircle2, ChevronsUpDown, XCircle } from 'lucide-react'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'

export type ScheduleClassOption = { id: number; name: string; hasSchedule: boolean }

/** A class's rotation-plan availability, shown on its chip and in the dropdown. */
function PlanMarker({ hasSchedule, title }: { hasSchedule: boolean; title: string }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span role="img" aria-label={title} className="inline-flex">
          {hasSchedule ? (
            <CheckCircle2 className="text-success h-4 w-4" aria-hidden />
          ) : (
            <XCircle className="text-muted-foreground/60 h-4 w-4" aria-hidden />
          )}
        </span>
      </TooltipTrigger>
      <TooltipContent>{title}</TooltipContent>
    </Tooltip>
  )
}

/**
 * Class selection for the schedule overview.
 *
 * Every class is a chip that carries its rotation-plan availability, so the
 * picker doubles as the at-a-glance overview the old "Alle Klassen" mode tried
 * to be — without stacking every class's full schedule (and its fetch cascade)
 * on one screen. A dropdown mirrors the same list for keyboard use and long
 * class lists. Mirrors the Notensammler picker.
 */
export function ClassPicker({
  classes,
  selectedClassName,
  onSelect,
}: {
  classes: ScheduleClassOption[]
  selectedClassName: string | null
  onSelect: (className: string) => void
}) {
  const { t } = useTranslation()

  const hasPlanLabel = t('schedules.hasPlan', 'Wechselplan vorhanden')
  const noPlanLabel = t('schedules.noPlan', 'Kein Wechselplan')

  return (
    <div className="border-border/60 bg-card/40 flex flex-wrap items-end justify-between gap-x-6 gap-y-4 rounded-xl border p-4">
      <div className="min-w-0 flex-1">
        <p className="text-muted-foreground mb-2 flex items-center gap-1.5 text-xs font-medium tracking-wide uppercase">
          <CalendarDays className="h-3.5 w-3.5" />
          {t('schedules.classLabel', 'Klasse')}
        </p>
        <div className="flex flex-wrap gap-2">
          {classes.map(cls => {
            const active = cls.name === selectedClassName
            return (
              <button
                key={cls.id}
                type="button"
                aria-current={active ? 'true' : undefined}
                onClick={() => onSelect(cls.name)}
                className={cn(
                  'focus-visible:ring-ring flex items-center gap-2 rounded-lg border px-3 py-2 text-sm transition-colors focus-visible:ring-2 focus-visible:outline-none',
                  active
                    ? 'border-primary bg-primary/10 text-foreground'
                    : 'border-border bg-background hover:bg-muted/60',
                )}
              >
                <span className="font-semibold">{cls.name}</span>
                <PlanMarker
                  hasSchedule={cls.hasSchedule}
                  title={cls.hasSchedule ? hasPlanLabel : noPlanLabel}
                />
              </button>
            )
          })}
        </div>
      </div>

      <div className="w-full sm:w-auto sm:min-w-[16rem]">
        <label
          htmlFor="schedules-class-select"
          className="text-muted-foreground mb-2 flex items-center gap-1.5 text-xs font-medium tracking-wide uppercase"
        >
          <ChevronsUpDown className="h-3.5 w-3.5" />
          {t('schedules.otherClass', 'Weitere Klasse')}
        </label>
        <Select value={selectedClassName ?? ''} onValueChange={onSelect}>
          <SelectTrigger id="schedules-class-select" className="w-full">
            <SelectValue
              placeholder={t('schedules.selectClassPlaceholder', 'Klasse auswählen...')}
            />
          </SelectTrigger>
          <SelectContent>
            {classes.map(cls => (
              <SelectItem key={cls.id} value={cls.name}>
                <span className="flex items-center gap-2">
                  <PlanMarker
                    hasSchedule={cls.hasSchedule}
                    title={cls.hasSchedule ? hasPlanLabel : noPlanLabel}
                  />
                  {cls.name}
                </span>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    </div>
  )
}
