'use client'

import { useTranslation } from 'react-i18next'
import { Check, ChevronsUpDown, Users } from 'lucide-react'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'
import type { TeacherClassSummary } from '../_lib/types'

export type ClassOption = { id: number; name: string }

/**
 * One semester's completion marker on a class chip: filled when this teacher
 * has a mark for every student, hollow otherwise.
 */
function SemesterDot({
  label,
  complete,
  title,
}: {
  label: string
  complete: boolean
  title: string
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span
          // Without a role the label is not exposed, and the state is carried
          // by colour alone — the chip would read as a bare "1" or "2".
          role="img"
          aria-label={title}
          className={cn(
            'inline-flex h-5 min-w-5 items-center justify-center gap-0.5 rounded-full px-1.5 text-[11px] leading-none font-semibold tabular-nums',
            complete
              ? 'bg-success/15 text-success ring-success/30 ring-1 ring-inset'
              : 'bg-muted text-muted-foreground ring-border ring-1 ring-inset',
          )}
        >
          {label}
          {complete && <Check className="h-2.5 w-2.5" aria-hidden />}
        </span>
      </TooltipTrigger>
      <TooltipContent>{title}</TooltipContent>
    </Tooltip>
  )
}

/**
 * Class selection for the Notensammler.
 *
 * The teacher's own classes are the ones they open every day, so they are
 * buttons — one click, with their completion visible before the click. The full
 * class list stays available as a secondary dropdown for a class lead or admin
 * looking at somebody else's class. These used to be a dropdown at the top and
 * a separate tab strip below, which read as two unrelated controls.
 */
export function ClassPicker({
  classes,
  teacherClasses,
  selectedClassId,
  onSelect,
}: {
  classes: ClassOption[]
  teacherClasses: TeacherClassSummary[]
  selectedClassId: string
  onSelect: (classId: string) => void
}) {
  const { t } = useTranslation()

  const firstLabel = t('notensammler.firstSemesterShort', '1. Sem')
  const secondLabel = t('notensammler.secondSemesterShort', '2. Sem')
  const completeLabel = t('notensammler.completionComplete', 'vollständig')
  const incompleteLabel = t('notensammler.completionIncomplete', 'unvollständig')

  return (
    <div className="border-border/60 bg-card/40 flex flex-wrap items-end justify-between gap-x-6 gap-y-4 rounded-xl border p-4">
      {teacherClasses.length > 0 && (
        <div className="min-w-0 flex-1">
          <p className="text-muted-foreground mb-2 flex items-center gap-1.5 text-xs font-medium tracking-wide uppercase">
            <Users className="h-3.5 w-3.5" />
            {t('notensammler.myClasses', 'Meine Klassen')}
          </p>
          <div className="flex flex-wrap gap-2">
            {teacherClasses.map(cls => {
              const active = cls.id.toString() === selectedClassId
              return (
                <button
                  key={cls.id}
                  type="button"
                  aria-current={active ? 'true' : undefined}
                  onClick={() => onSelect(cls.id.toString())}
                  className={cn(
                    'focus-visible:ring-ring flex items-center gap-2.5 rounded-lg border px-3 py-2 text-sm transition-colors focus-visible:ring-2 focus-visible:outline-none',
                    active
                      ? 'border-primary bg-primary/10 text-foreground'
                      : 'border-border bg-background hover:bg-muted/60',
                  )}
                >
                  <span className="font-semibold">{cls.name}</span>
                  <span className="flex items-center gap-1">
                    <SemesterDot
                      label="1"
                      complete={cls.allGradesEnteredFirst}
                      title={`${firstLabel}: ${cls.allGradesEnteredFirst ? completeLabel : incompleteLabel}`}
                    />
                    <SemesterDot
                      label="2"
                      complete={cls.allGradesEnteredSecond}
                      title={`${secondLabel}: ${cls.allGradesEnteredSecond ? completeLabel : incompleteLabel}`}
                    />
                  </span>
                </button>
              )
            })}
          </div>
        </div>
      )}

      <div className="w-full sm:w-auto sm:min-w-[16rem]">
        <label
          htmlFor="notensammler-class-select"
          className="text-muted-foreground mb-2 flex items-center gap-1.5 text-xs font-medium tracking-wide uppercase"
        >
          <ChevronsUpDown className="h-3.5 w-3.5" />
          {teacherClasses.length > 0
            ? t('notensammler.otherClass', 'Andere Klasse')
            : t('notensammler.selectClass', 'Klasse auswählen')}
        </label>
        <Select value={selectedClassId} onValueChange={onSelect}>
          <SelectTrigger id="notensammler-class-select" className="w-full">
            <SelectValue
              placeholder={t('notensammler.selectClassPlaceholder', 'Bitte Klasse auswählen...')}
            />
          </SelectTrigger>
          <SelectContent>
            {classes.map(cls => (
              <SelectItem key={cls.id} value={cls.id.toString()}>
                {cls.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    </div>
  )
}
