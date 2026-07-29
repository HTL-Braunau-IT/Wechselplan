'use client'

import { useTranslation } from 'react-i18next'
import { Scale } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { DEFAULT_WEIGHTS, type WeightConfig } from '../_lib/types'

const WEIGHT_FIELDS: Array<{ key: keyof WeightConfig; labelKey: string }> = [
  { key: 'weightWiederholung', labelKey: 'noten.wiederholung' },
  { key: 'weightBericht', labelKey: 'noten.bericht' },
  { key: 'weightMitarbeit', labelKey: 'noten.mitarbeit' },
  { key: 'weightPraktischeArbeit', labelKey: 'noten.praktischeArbeit' },
]

/** How the four assessment categories are weighted; must total 100. */
export function WeightsBar({
  weights,
  weightsValid,
  saving,
  saveError,
  onChange,
  onCommit,
}: {
  weights: WeightConfig
  weightsValid: boolean
  saving: boolean
  saveError: string | null
  onChange: (key: keyof WeightConfig, value: number) => void
  onCommit: () => void
}) {
  const { t } = useTranslation('common')

  return (
    <div className="bg-card mb-4 flex flex-wrap items-center gap-4 rounded-lg border p-2 shadow-sm">
      <span className="flex items-center gap-2 text-sm font-medium">
        <Scale className="h-4 w-4" />
        {t('noten.weights')}
      </span>
      {WEIGHT_FIELDS.map(({ key, labelKey }) => (
        <Label key={key} htmlFor={`weight-${key}`} className="flex items-center gap-1 font-normal">
          <span className="text-xs">{t(labelKey)}</span>
          <Input
            id={`weight-${key}`}
            type="number"
            min={0}
            max={100}
            className="h-8 w-20 min-w-[5rem]"
            value={weights[key] ?? DEFAULT_WEIGHTS[key]}
            onChange={e => onChange(key, parseInt(e.target.value, 10) || 0)}
            onBlur={onCommit}
          />
          <span className="text-muted-foreground text-xs">%</span>
        </Label>
      ))}
      {!weightsValid && (
        <span className="text-destructive text-sm">{t('noten.weightsMustSum100')}</span>
      )}
      {saving && <span className="text-muted-foreground text-sm">{t('common.saving')}</span>}
      {saveError && <span className="text-destructive text-sm">{saveError}</span>}
    </div>
  )
}
