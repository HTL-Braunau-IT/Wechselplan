'use client'

import { useTranslation } from 'react-i18next'
import { CalendarDays, Layers, Users } from 'lucide-react'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'
import { groupIdsOn, type ClassItem } from '../_lib/types'

const CHIP_CLASS =
  'focus-visible:ring-ring flex items-center gap-2 rounded-lg border px-3 py-2 text-sm transition-colors focus-visible:ring-2 focus-visible:outline-none'
const CHIP_ACTIVE = 'border-primary bg-primary/10 text-foreground'
const CHIP_IDLE = 'border-border bg-background hover:bg-muted/60'

const SECTION_LABEL_CLASS =
  'text-muted-foreground mb-2 flex items-center gap-1.5 text-xs font-medium tracking-wide uppercase'

/**
 * Class and group selection for the Noten grid.
 *
 * Both used to be tab strips — two rows of identically styled pills, centred in
 * the page, with nothing to say which was which or which group the teacher was
 * actually standing in front of. They are one labelled block now, matching the
 * Notensammler picker, with the rotation's current slot marked.
 */
export function ClassGroupPicker({
  classes,
  selectedClassId,
  selectedGroupId,
  selectedWeekday,
  currentSlot,
  onSelectClass,
  onSelectGroup,
  onSelectWeekday,
}: {
  classes: ClassItem[]
  selectedClassId: number | null
  selectedGroupId: number | null
  /** Groups are per weekday; the day whose groups are shown. */
  selectedWeekday: number | null
  /** The class/group the rotation puts the teacher in right now, if known. */
  currentSlot: { classId: number | null; groupId: number | null; weekday?: number | null }
  onSelectClass: (classId: number) => void
  onSelectGroup: (groupId: number) => void
  onSelectWeekday: (weekday: number) => void
}) {
  const { t } = useTranslation('common')

  const selectedClass = classes.find(cls => cls.id === selectedClassId)
  const dayGroupIds = groupIdsOn(selectedClass, selectedWeekday)
  // Only a teacher with this class on several days needs to pick one.
  const days = selectedClass?.weekdays ?? []
  const isCurrentDay = (day: number | null) =>
    currentSlot.classId === selectedClass?.id &&
    (currentSlot.weekday == null || currentSlot.weekday === day)
  const nowLabel = t('noten.currentSlot', { defaultValue: 'Findet gerade statt' })

  const nowDot = (
    <Tooltip>
      <TooltipTrigger asChild>
        <span
          // The state is otherwise carried by colour alone, and a bare dot next
          // to "Gruppe 2" reads as decoration.
          role="img"
          aria-label={nowLabel}
          className="bg-primary h-1.5 w-1.5 shrink-0 rounded-full"
        />
      </TooltipTrigger>
      <TooltipContent>{nowLabel}</TooltipContent>
    </Tooltip>
  )

  return (
    <div className="border-border/60 bg-card/40 flex flex-wrap items-start justify-between gap-x-8 gap-y-4 rounded-xl border p-4">
      <div className="min-w-0 flex-1">
        <p className={SECTION_LABEL_CLASS}>
          <Users className="h-3.5 w-3.5" />
          {t('noten.myClasses', { defaultValue: 'Meine Klassen' })}
        </p>
        <div className="flex flex-wrap gap-2">
          {classes.map(cls => {
            const active = cls.id === selectedClassId
            return (
              <button
                key={cls.id}
                type="button"
                aria-current={active ? 'true' : undefined}
                onClick={() => onSelectClass(cls.id)}
                className={cn(CHIP_CLASS, active ? CHIP_ACTIVE : CHIP_IDLE)}
              >
                <span className="font-semibold">{cls.name}</span>
                {currentSlot.classId === cls.id && nowDot}
              </button>
            )
          })}
        </div>
      </div>

      {selectedClass && days.length > 1 && (
        <div className="min-w-0">
          <p className={SECTION_LABEL_CLASS}>
            <CalendarDays className="h-3.5 w-3.5" />
            {t('noten.day', { defaultValue: 'Tag' })}
          </p>
          <div className="flex flex-wrap gap-2">
            {days.map(day => {
              const active = day === selectedWeekday
              return (
                <button
                  key={day}
                  type="button"
                  aria-current={active ? 'true' : undefined}
                  onClick={() => onSelectWeekday(day)}
                  className={cn(CHIP_CLASS, active ? CHIP_ACTIVE : CHIP_IDLE)}
                >
                  <span className="font-semibold">{t(`raumplan.weekdays.${day}`)}</span>
                  {currentSlot.classId === selectedClass.id &&
                    currentSlot.weekday === day &&
                    nowDot}
                </button>
              )
            })}
          </div>
        </div>
      )}

      {selectedClass && dayGroupIds.length > 0 && (
        <div className="min-w-0">
          <p className={SECTION_LABEL_CLASS}>
            <Layers className="h-3.5 w-3.5" />
            {t('noten.group', { defaultValue: 'Gruppe' })}
          </p>
          <div className="flex flex-wrap gap-2">
            {dayGroupIds.map(groupId => {
              const active = groupId === selectedGroupId
              return (
                <button
                  key={groupId}
                  type="button"
                  aria-current={active ? 'true' : undefined}
                  onClick={() => onSelectGroup(groupId)}
                  className={cn(CHIP_CLASS, active ? CHIP_ACTIVE : CHIP_IDLE)}
                >
                  <span className="font-semibold">
                    {t('noten.gruppe')} {groupId}
                  </span>
                  {isCurrentDay(selectedWeekday) && currentSlot.groupId === groupId && nowDot}
                </button>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
