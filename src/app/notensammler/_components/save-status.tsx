'use client'

import { useTranslation } from 'react-i18next'
import { AlertTriangle, Check, CloudOff } from 'lucide-react'
import { Spinner } from '@/components/ui/spinner'
import { cn } from '@/lib/utils'
import type { SaveState } from '../_hooks/use-grade-editing'

/**
 * Autosave indicator for the grade grid.
 *
 * Marks save themselves half a second after they are typed, which previously
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
      label: t('notensammler.saveStatePending', 'Nicht gespeichert'),
      tone: 'text-muted-foreground bg-muted/60 border-border',
    },
    saving: {
      icon: <Spinner size="sm" />,
      label: t('notensammler.saveStateSaving', 'Speichert…'),
      tone: 'text-muted-foreground bg-muted/60 border-border',
    },
    saved: {
      icon: <Check className="h-3.5 w-3.5" />,
      label: t('notensammler.saveStateSaved', 'Gespeichert'),
      tone: 'text-success border-success/30 bg-success/10',
    },
    error: {
      icon: <AlertTriangle className="h-3.5 w-3.5" />,
      label: t('notensammler.saveStateError', 'Nicht gespeichert'),
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
