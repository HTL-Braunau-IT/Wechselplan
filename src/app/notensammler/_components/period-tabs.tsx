'use client'

import { useTranslation } from 'react-i18next'
import { Check, Sun, Sunset } from 'lucide-react'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { truncateSubject } from '@/lib/subject-utils'
import { cn } from '@/lib/utils'
import type { Period } from '../_lib/types'

/**
 * Whether the signed-in teacher has finished that period+semester. `null` means
 * the question does not apply — they teach the other period, and a red cross
 * against somebody else's subject only ever read as an error.
 */
export type PeriodCompletion = {
  amFirst: boolean | null
  amSecond: boolean | null
  pmFirst: boolean | null
  pmSecond: boolean | null
}

/** Semester completion chip, matching the markers on the class chips. */
function CompletionMark({ label, complete }: { label: string; complete: boolean | null }) {
  if (complete === null) return null
  return (
    <span
      className={cn(
        'inline-flex h-4 items-center gap-0.5 rounded-full px-1.5 text-[10px] leading-none font-semibold',
        complete ? 'bg-success/15 text-success' : 'bg-destructive/10 text-destructive',
      )}
    >
      {label}
      {complete && <Check className="h-2.5 w-2.5" aria-hidden />}
    </span>
  )
}

/** AM/PM switcher, shown only when a class has separate morning and afternoon subjects. */
export function PeriodTabs({
  value,
  onValueChange,
  subjectNameAm,
  subjectNamePm,
  showCompletion,
  completion,
}: {
  value: Period
  onValueChange: (period: Period) => void
  subjectNameAm?: string
  subjectNamePm?: string
  /** Completion is the signed-in teacher's own — hidden for anyone else. */
  showCompletion: boolean
  completion: PeriodCompletion
}) {
  const { t } = useTranslation()

  const periods = [
    {
      period: 'AM' as Period,
      icon: Sun,
      label: t('notensammler.vormittag', 'Vormittag'),
      subject: subjectNameAm,
      first: completion.amFirst,
      second: completion.amSecond,
    },
    {
      period: 'PM' as Period,
      icon: Sunset,
      label: t('notensammler.nachmittag', 'Nachmittag'),
      subject: subjectNamePm,
      first: completion.pmFirst,
      second: completion.pmSecond,
    },
  ]

  return (
    <Tabs value={value} onValueChange={v => onValueChange(v as Period)}>
      <TabsList className="flex h-auto flex-wrap justify-start">
        {periods.map(({ period, icon: Icon, label, subject, first, second }) => (
          <TabsTrigger key={period} value={period} className="gap-2 px-3 py-2">
            <Icon className="h-4 w-4 shrink-0" aria-hidden />
            <span className="font-semibold">{label}</span>
            {subject && (
              <span className="text-muted-foreground font-normal">{truncateSubject(subject)}</span>
            )}
            {showCompletion && (
              <span className="flex items-center gap-1">
                <CompletionMark label="1" complete={first} />
                <CompletionMark label="2" complete={second} />
              </span>
            )}
          </TabsTrigger>
        ))}
      </TabsList>
    </Tabs>
  )
}
