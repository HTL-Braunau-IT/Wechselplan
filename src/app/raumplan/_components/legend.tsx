'use client'

import { useTranslation } from 'react-i18next'

/** Colour key for the floor-plan occupancy states. */
export function Legend() {
  const { t } = useTranslation()
  return (
    <div className="text-muted-foreground flex flex-wrap items-center gap-x-4 gap-y-1 text-xs">
      <Swatch
        label={t('raumplan.state.occupied')}
        style={{
          backgroundColor: 'color-mix(in oklch, var(--success) 22%, var(--card))',
          borderColor: 'var(--success)',
        }}
      />
      <Swatch
        label={t('raumplan.state.free')}
        style={{ backgroundColor: 'var(--card)', borderColor: 'var(--border)' }}
      />
      <Swatch
        label={t('raumplan.state.unused')}
        style={{
          backgroundImage:
            'repeating-linear-gradient(45deg, var(--muted-foreground) 0 1px, transparent 1px 5px)',
          borderColor: 'var(--border)',
        }}
      />
    </div>
  )
}

function Swatch({ label, style }: { label: string; style: React.CSSProperties }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className="inline-block h-3.5 w-3.5 rounded-sm border" style={style} />
      {label}
    </span>
  )
}
