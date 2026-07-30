'use client'

import { useTranslation } from 'react-i18next'
import { Layers, Users } from 'lucide-react'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'
import type { ClassItem } from '../_lib/types'

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
  currentSlot,
  onSelectClass,
  onSelectGroup,
}: {
  classes: ClassItem[]
  selectedClassId: number | null
  selectedGroupId: number | null
  /** The class/group the rotation puts the teacher in right now, if known. */
  currentSlot: { classId: number | null; groupId: number | null }
  onSelectClass: (classId: number) => void
  onSelectGroup: (groupId: number) => void
}) {
  const { t } = useTranslation('common')

  const selectedClass = classes.find(cls => cls.id === selectedClassId)
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

      {selectedClass && selectedClass.groupIds.length > 0 && (
        <div className="min-w-0">
          <p className={SECTION_LABEL_CLASS}>
            <Layers className="h-3.5 w-3.5" />
            {t('noten.group', { defaultValue: 'Gruppe' })}
          </p>
          <div className="flex flex-wrap gap-2">
            {selectedClass.groupIds.map(groupId => {
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
                  {currentSlot.classId === selectedClass.id &&
                    currentSlot.groupId === groupId &&
                    nowDot}
                </button>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
