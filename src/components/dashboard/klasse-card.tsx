'use client'

import { useTranslation } from 'react-i18next'
import { Coffee, Info, MapPin, School, Users } from 'lucide-react'
import { groupTint } from './group-tint'
import type { BreakTime } from '@/types/types'
import type { OtherGroup } from './resolve-slot'

export type KlasseCardProps = {
  className: string
  classHead: string
  classLead: string
  otherGroups: OtherGroup[]
  breaks: BreakTime[]
  additionalInfo: string
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-muted-foreground text-xs font-medium">{label}</p>
      <p className="mt-0.5 text-sm font-medium">{value}</p>
    </div>
  )
}

export function KlasseCard({
  className,
  classHead,
  classLead,
  otherGroups,
  breaks,
  additionalInfo,
}: KlasseCardProps) {
  const { t } = useTranslation('common')

  return (
    <section
      data-screen-label="Klasse"
      className="border-border bg-card min-w-[min(100%,280px)] flex-1 overflow-hidden rounded-lg border shadow-sm"
    >
      <div className="border-border flex items-center gap-2 border-b px-4 py-3">
        <School className="text-muted-foreground h-4 w-4" aria-hidden />
        <h3 className="text-base font-semibold">{className}</h3>
      </div>

      <div className="flex flex-col gap-4 p-4">
        <div className="grid grid-cols-2 gap-3">
          <Field
            label={t('dashboard.classHead', { defaultValue: 'Klassenvorstand' })}
            value={classHead}
          />
          <Field
            label={t('dashboard.classLead', { defaultValue: 'Klassenleiter' })}
            value={classLead}
          />
        </div>

        {otherGroups.length > 0 && (
          <div>
            <p className="text-muted-foreground mb-2 flex items-center gap-1.5 text-xs font-medium">
              <Users className="h-3.5 w-3.5" aria-hidden />
              {t('dashboard.otherGroups', { defaultValue: 'Andere Gruppen' })}
            </p>
            <div className="flex flex-col gap-1">
              {otherGroups.map(group => (
                <div
                  key={group.groupId}
                  className="bg-muted/40 flex items-center gap-2 rounded-sm px-2 py-1.5 text-sm"
                >
                  <span
                    className="flex h-[22px] w-[22px] shrink-0 items-center justify-center rounded-sm text-xs font-semibold tabular-nums"
                    style={groupTint(group.groupId)}
                  >
                    {group.groupId}
                  </span>
                  <span className="truncate">{group.teacher}</span>
                  {group.room && (
                    <span className="text-muted-foreground ml-auto inline-flex items-center gap-1 text-xs">
                      <MapPin className="h-3 w-3" aria-hidden />
                      {group.room}
                    </span>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {breaks.length > 0 && (
          <div>
            <p className="text-muted-foreground mb-2 flex items-center gap-1.5 text-xs font-medium">
              <Coffee className="h-3.5 w-3.5" aria-hidden />
              {t('dashboard.breakTimes', { defaultValue: 'Pausenzeiten' })}
            </p>
            <div className="flex flex-wrap gap-1.5">
              {breaks.map(b => (
                <span
                  key={b.id}
                  className="bg-muted text-muted-foreground inline-flex items-center rounded-full px-2.5 py-0.5 text-xs tabular-nums"
                >
                  {b.name}: {b.startTime} – {b.endTime}
                </span>
              ))}
            </div>
          </div>
        )}

        {additionalInfo && (
          <div
            className="flex gap-2.5 rounded-lg p-3"
            style={{ background: 'color-mix(in oklab, var(--info) 10%, transparent)' }}
          >
            <Info className="text-info mt-0.5 h-4 w-4 shrink-0" aria-hidden />
            <div>
              <p className="text-muted-foreground text-xs font-medium">
                {t('dashboard.extraInfo', { defaultValue: 'Zusatzinfo' })}
              </p>
              <p className="mt-0.5 text-sm font-medium">{additionalInfo}</p>
            </div>
          </div>
        )}
      </div>
    </section>
  )
}
