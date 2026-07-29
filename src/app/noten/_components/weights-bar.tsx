'use client'

import { useTranslation } from 'react-i18next'
import { Input } from '@/components/ui/input'
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
    <div className="mb-4 flex flex-wrap items-center gap-4 rounded-lg border p-2">
      <span className="text-sm font-medium">{t('noten.weights')}</span>
      {WEIGHT_FIELDS.map(({ key, labelKey }) => (
        <label key={key} className="flex items-center gap-1">
          <span className="text-xs">{t(labelKey)}</span>
          <Input
            type="number"
            min={0}
            max={100}
            className="h-8 w-20 min-w-[5rem]"
            value={weights[key] ?? DEFAULT_WEIGHTS[key]}
            onChange={e => onChange(key, parseInt(e.target.value, 10) || 0)}
            onBlur={onCommit}
          />
          %
        </label>
      ))}
      {!weightsValid && (
        <span className="text-destructive text-sm">{t('noten.weightsMustSum100')}</span>
      )}
      {saving && <span className="text-muted-foreground text-sm">{t('common.saving')}</span>}
      {saveError && <span className="text-destructive text-sm">{saveError}</span>}
    </div>
  )
}
