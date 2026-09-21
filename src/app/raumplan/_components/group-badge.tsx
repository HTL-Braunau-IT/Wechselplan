'use client'

import { useTranslation } from 'react-i18next'

/**
 * A group chip coloured with the app's rotation-group tokens (--group-N-tint /
 * -ink), the same colours groups carry everywhere else in the product. The index
 * is dynamic, so the colour is set inline (a Tailwind class would not survive the
 * JIT scan — see the note in src/styles/globals.css).
 */
export function GroupBadge({ groupId }: { groupId: number | null }) {
  const { t } = useTranslation()

  if (groupId == null) {
    return (
      <span className="bg-muted text-muted-foreground inline-flex items-center rounded px-2 py-0.5 text-xs font-semibold">
        {t('raumplan.detail.noGroup')}
      </span>
    )
  }

  const idx = ((groupId - 1) % 6) + 1
  return (
    <span
      className="inline-flex items-center rounded px-2 py-0.5 text-xs font-semibold"
      style={{ backgroundColor: `var(--group-${idx}-tint)`, color: `var(--group-${idx}-ink)` }}
    >
      {t('raumplan.detail.group')} {groupId}
    </span>
  )
}
