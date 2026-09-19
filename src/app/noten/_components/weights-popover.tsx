'use client'

import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { AlertTriangle, RotateCcw, Scale } from 'lucide-react'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import { Switch } from '@/components/ui/switch'
import { cn } from '@/lib/utils'
import {
  inheritedWeights,
  WEIGHT_KEYS,
  weightSum,
  type WeightConfig,
  type WeightLevel,
} from '@/lib/noten-weights'
import type { WeightLevels } from '../_hooks/use-noten-data'

const WEIGHT_FIELDS: Array<{ key: keyof WeightConfig; labelKey: string }> = [
  { key: 'weightWiederholung', labelKey: 'noten.wiederholung' },
  { key: 'weightBericht', labelKey: 'noten.bericht' },
  { key: 'weightMitarbeit', labelKey: 'noten.mitarbeit' },
  { key: 'weightPraktischeArbeit', labelKey: 'noten.praktischeArbeit' },
]

const LEVELS: WeightLevel[] = ['global', 'class', 'group']

/** The most specific level the teacher has actually set, else group (what they work in). */
function initialLevel(levels: WeightLevels): WeightLevel {
  if (levels.group) return 'group'
  if (levels.class) return 'class'
  if (levels.global) return 'global'
  return 'group'
}

/**
 * How the four assessment categories are weighted; must total 100.
 *
 * The split resolves per teacher along a chain — a group's own weights win, else
 * the class default, else the teacher's global default, else 25/25/25/25. This
 * popover edits any level: Global is always editable; Klasse and Gruppe carry an
 * "eigene Gewichtung" switch and, while off, show the value they inherit. The
 * trigger button shows the effective split so it still reads at a glance.
 */
export function WeightsPopover({
  levels,
  effective,
  weightsValid,
  classLabel,
  groupLabel,
  onChange,
  onEnableOverride,
  onClearOverride,
  onCommit,
}: {
  levels: WeightLevels
  effective: WeightConfig
  weightsValid: boolean
  classLabel: string
  groupLabel: string
  onChange: (level: WeightLevel, key: keyof WeightConfig, value: number) => void
  /** Turn on a class/group override (seeded from what it inherits). */
  onEnableOverride: (level: WeightLevel) => void
  /** Clear a level back to inheriting; for global this resets to 25/25/25/25. */
  onClearOverride: (level: WeightLevel) => void
  /** Called when the popover closes — the fields have no separate save. */
  onCommit: () => void
}) {
  const { t } = useTranslation('common')
  const [level, setLevel] = useState<WeightLevel>(() => initialLevel(levels))

  const tabLabel = (l: WeightLevel) =>
    l === 'global'
      ? t('noten.weightLevelGlobal', { defaultValue: 'Global' })
      : l === 'class'
        ? classLabel
        : groupLabel

  const raw = levels[level]
  const overridden = raw != null
  // Global is always "on" (it has no parent to inherit from); class/group show
  // the value they inherit while their override is off.
  const shown = raw ?? inheritedWeights(level, levels)
  const editable = level === 'global' || overridden
  const sum = weightSum(shown)
  const sumValid = sum === 100

  // Where an inheriting level takes its value from, for the hint line.
  const inheritSource =
    level === 'group'
      ? levels.class
        ? classLabel
        : t('noten.weightLevelGlobal', { defaultValue: 'Global' })
      : t('noten.weightLevelGlobal', { defaultValue: 'Global' })

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
            {WEIGHT_FIELDS.map(({ key }) => effective[key]).join('/')}
          </span>
        </Button>
      </PopoverTrigger>

      <PopoverContent align="start" className="w-80">
        <p className="text-sm font-medium">{t('noten.weights')}</p>
        <p className="text-muted-foreground mt-1 mb-3 text-xs">
          {t('noten.weightsHierarchyDescription', {
            defaultValue:
              'Gilt global, je Klasse oder je Gruppe. Die feinste eigene Einstellung zählt.',
          })}
        </p>

        {/* Level switcher */}
        <div className="bg-muted mb-3 grid grid-cols-3 gap-1 rounded-md p-1">
          {LEVELS.map(l => (
            <button
              key={l}
              type="button"
              onClick={() => setLevel(l)}
              className={cn(
                'truncate rounded-sm px-2 py-1 text-xs font-medium transition-colors',
                level === l
                  ? 'bg-background text-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground',
                levels[l] && level !== l && 'text-foreground',
              )}
              title={tabLabel(l)}
            >
              {tabLabel(l)}
              {levels[l] && <span className="text-primary ml-0.5">•</span>}
            </button>
          ))}
        </div>

        {/* Override switch for class/group */}
        {level !== 'global' && (
          <div className="mb-3 flex items-center justify-between gap-3">
            <Label htmlFor="weight-override" className="text-sm font-normal">
              {level === 'class'
                ? t('noten.weightOverrideClass', { defaultValue: 'Eigene Gewichtung für die Klasse' })
                : t('noten.weightOverrideGroup', { defaultValue: 'Eigene Gewichtung für die Gruppe' })}
            </Label>
            <Switch
              id="weight-override"
              checked={overridden}
              onCheckedChange={checked =>
                checked ? onEnableOverride(level) : onClearOverride(level)
              }
            />
          </div>
        )}

        {!editable && (
          <p className="text-muted-foreground mb-3 text-xs">
            {t('noten.weightInheritsFrom', {
              defaultValue: 'Erbt von {{source}}.',
              source: inheritSource,
            })}
          </p>
        )}

        <div className={cn('space-y-2.5', !editable && 'opacity-50')}>
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
                  disabled={!editable}
                  className="h-8 w-20"
                  value={shown[key]}
                  onChange={e => onChange(level, key, parseInt(e.target.value, 10) || 0)}
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
              sumValid ? 'text-success font-medium' : 'text-destructive font-semibold',
            )}
          >
            {sum} %
          </span>
        </div>
        {editable && !sumValid && (
          <p className="text-destructive mt-1 text-xs">{t('noten.weightsMustSum100')}</p>
        )}

        {level === 'global' && (
          <Button
            variant="ghost"
            size="sm"
            className="text-muted-foreground mt-2 w-full"
            onClick={() => onClearOverride('global')}
          >
            <RotateCcw className="h-4 w-4" />
            {t('noten.weightsReset', { defaultValue: 'Auf 25/25/25/25 zurücksetzen' })}
          </Button>
        )}
      </PopoverContent>
    </Popover>
  )
}
