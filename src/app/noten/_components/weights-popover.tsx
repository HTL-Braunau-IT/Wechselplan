'use client'

import { useTranslation } from 'react-i18next'
import { AlertTriangle, RotateCcw, Scale } from 'lucide-react'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { DEFAULT_WEIGHTS, type WeightConfig } from '../_lib/types'

const WEIGHT_FIELDS: Array<{ key: keyof WeightConfig; labelKey: string }> = [
  { key: 'weightWiederholung', labelKey: 'noten.wiederholung' },
  { key: 'weightBericht', labelKey: 'noten.bericht' },
  { key: 'weightMitarbeit', labelKey: 'noten.mitarbeit' },
  { key: 'weightPraktischeArbeit', labelKey: 'noten.praktischeArbeit' },
]

/**
 * How the four assessment categories are weighted; must total 100.
 *
 * This was a permanent full-width bar of number fields above the grid — four
 * inputs a teacher touches once a term, sitting between them and the thing they
 * came to do. It is behind a toolbar button now, which shows the current split
 * so it still reads at a glance.
 */
export function WeightsPopover({
  weights,
  weightsValid,
  onChange,
  onCommit,
}: {
  weights: WeightConfig
  weightsValid: boolean
  onChange: (key: keyof WeightConfig, value: number) => void
  /** Called when the popover closes — the fields have no separate save. */
  onCommit: () => void
}) {
  const { t } = useTranslation('common')

  const valueOf = (key: keyof WeightConfig) => weights[key] ?? DEFAULT_WEIGHTS[key]
  const sum = WEIGHT_FIELDS.reduce((total, { key }) => total + valueOf(key), 0)

  return (
    <Popover
      onOpenChange={open => {
        if (!open) onCommit()
      }}
    >
      <PopoverTrigger asChild>
        <Button variant="outline" className={cn(!weightsValid && 'border-destructive')}>
          {weightsValid ? (
            <Scale className="h-4 w-4" />
          ) : (
            <AlertTriangle className="text-destructive h-4 w-4" />
          )}
          {t('noten.weights')}
          <span className="text-muted-foreground ml-1 tabular-nums">
            {WEIGHT_FIELDS.map(({ key }) => valueOf(key)).join('/')}
          </span>
        </Button>
      </PopoverTrigger>

      <PopoverContent align="start" className="w-80">
        <p className="text-sm font-medium">{t('noten.weights')}</p>
        <p className="text-muted-foreground mt-1 mb-3 text-xs">
          {t('noten.weightsDescription', {
            defaultValue:
              'Anteil jeder Kategorie an der berechneten Note. Kategorien ohne Eintrag zählen an dem Tag nicht mit.',
          })}
        </p>

        <div className="space-y-2.5">
          {WEIGHT_FIELDS.map(({ key, labelKey }) => (
            <div key={key} className="flex items-center justify-between gap-3">
              <Label htmlFor={`weight-${key}`} className="text-sm font-normal">
                {t(labelKey)}
              </Label>
              <div className="flex items-center gap-1.5">
                <Input
                  id={`weight-${key}`}
                  type="number"
                  min={0}
                  max={100}
                  className="h-8 w-20"
                  value={valueOf(key)}
                  onChange={e => onChange(key, parseInt(e.target.value, 10) || 0)}
                />
                <span className="text-muted-foreground w-3 text-xs">%</span>
              </div>
            </div>
          ))}
        </div>

        <div className="mt-3 flex items-center justify-between border-t pt-3 text-sm">
          <span className="font-medium">{t('noten.weightsSum', { defaultValue: 'Summe' })}</span>
          <span
            className={cn(
              'tabular-nums',
              weightsValid ? 'text-success font-medium' : 'text-destructive font-semibold',
            )}
          >
            {sum} %
          </span>
        </div>
        {!weightsValid && (
          <p className="text-destructive mt-1 text-xs">{t('noten.weightsMustSum100')}</p>
        )}

        <Button
          variant="ghost"
          size="sm"
          className="text-muted-foreground mt-2 w-full"
          onClick={() => WEIGHT_FIELDS.forEach(({ key }) => onChange(key, DEFAULT_WEIGHTS[key]))}
        >
          <RotateCcw className="h-4 w-4" />
          {t('noten.weightsReset', { defaultValue: 'Auf 25/25/25/25 zurücksetzen' })}
        </Button>
      </PopoverContent>
    </Popover>
  )
}
