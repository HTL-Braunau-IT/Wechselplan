'use client'

import { useTranslation } from 'react-i18next'
import { CheckCircle2, X } from 'lucide-react'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { truncateSubject } from '@/lib/subject-utils'
import type { Period } from '../_lib/types'

export type PeriodCompletion = {
  amFirst: boolean
  amSecond: boolean
  pmFirst: boolean
  pmSecond: boolean
}

function CompletionMark({ complete }: { complete: boolean }) {
  return complete ? (
    <CheckCircle2 className="text-success h-3.5 w-3.5 shrink-0" aria-hidden />
  ) : (
    <X className="text-destructive h-3.5 w-3.5 shrink-0" aria-hidden />
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
  showCompletion: boolean
  completion: PeriodCompletion
}) {
  const { t } = useTranslation()

  const periods: Array<{
    period: Period
    label: string
    subject?: string
    first: boolean
    second: boolean
  }> = [
    {
      period: 'AM',
      label: t('notensammler.vormittag', 'Vormittag'),
      subject: subjectNameAm,
      first: completion.amFirst,
      second: completion.amSecond,
    },
    {
      period: 'PM',
      label: t('notensammler.nachmittag', 'Nachmittag'),
      subject: subjectNamePm,
      first: completion.pmFirst,
      second: completion.pmSecond,
    },
  ]

  return (
    <Tabs value={value} onValueChange={v => onValueChange(v as Period)}>
      <TabsList className="text-foreground mb-2 flex h-auto flex-wrap justify-start gap-2 bg-transparent p-0">
        {periods.map(({ period, label, subject, first, second }) => (
          <TabsTrigger
            key={period}
            value={period}
            className="group hover:bg-muted/60 data-[state=active]:border-primary data-[state=active]:bg-muted/60 flex items-center gap-3 rounded-lg border-2 border-transparent px-4 py-2.5 text-sm font-medium transition-all data-[state=active]:shadow-none"
          >
            <span className="font-semibold">
              {label} – {subject ? truncateSubject(subject) : ''}
            </span>
            {showCompletion && (
              <span className="flex items-center gap-2 text-xs font-normal opacity-90">
                <span className="bg-muted/80 flex items-center gap-1 rounded-md px-2 py-0.5">
                  {t('notensammler.firstSemesterShort', '1. Sem')}
                  <CompletionMark complete={first} />
                </span>
                <span className="bg-muted/80 flex items-center gap-1 rounded-md px-2 py-0.5">
                  {t('notensammler.secondSemesterShort', '2. Sem')}
                  <CompletionMark complete={second} />
                </span>
              </span>
            )}
          </TabsTrigger>
        ))}
      </TabsList>
    </Tabs>
  )
}
