'use client'

import { useTranslation } from 'react-i18next'
import { AlertTriangle, Check, CloudOff } from 'lucide-react'
import { Spinner } from '@/components/ui/spinner'
import { cn } from '@/lib/utils'

/** How far a debounced autosave has got. */
export type SaveState = 'idle' | 'pending' | 'saving' | 'saved' | 'error'

/**
 * Autosave indicator for the grade grids (Notensammler and Noten).
 *
 * Marks save themselves shortly after they are entered, which previously
 * showed only as a "Speichere..." line at the very bottom of the card — off
 * screen for any class longer than a viewport. A teacher had no way to tell a
 * saved mark from one still sitting in the debounce.
 */
export function SaveStatus({ state, className }: { state: SaveState; className?: string }) {
  const { t } = useTranslation()

  if (state === 'idle') return null

  const content = {
    pending: {
      icon: <CloudOff className="h-3.5 w-3.5" />,
      label: t('common.saveStatePending', 'Nicht gespeichert'),
      tone: 'text-muted-foreground bg-muted/60 border-border',
    },
    saving: {
      icon: <Spinner size="sm" />,
      label: t('common.saveStateSaving', 'Speichert…'),
      tone: 'text-muted-foreground bg-muted/60 border-border',
    },
    saved: {
      icon: <Check className="h-3.5 w-3.5" />,
      label: t('common.saveStateSaved', 'Gespeichert'),
      tone: 'text-success border-success/30 bg-success/10',
    },
    error: {
      icon: <AlertTriangle className="h-3.5 w-3.5" />,
      label: t('common.saveStateError', 'Nicht gespeichert'),
      tone: 'text-destructive border-destructive/30 bg-destructive/10',
    },
  }[state]

  return (
    <span
      role="status"
      aria-live="polite"
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium',
        content.tone,
        className,
      )}
    >
      {content.icon}
      {content.label}
    </span>
  )
}
