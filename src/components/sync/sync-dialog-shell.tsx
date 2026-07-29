'use client'

import type { ReactNode } from 'react'
import { AlertCircle, CheckCircle2, Loader2, RefreshCw } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Spinner } from '@/components/ui/spinner'
import type { SyncStage } from './use-sync-preview'

/**
 * Chrome for a directory sync dialog: header, the loading/error/done panes and
 * the footer. Callers supply only the preview body.
 */
export function SyncDialogShell({
  open,
  onOpenChange,
  title,
  description,
  stage,
  error,
  canClose,
  selectedCount,
  onReload,
  onApply,
  doneContent,
  children,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  description: string
  stage: SyncStage
  error: string | null
  canClose: boolean
  selectedCount: number
  onReload: () => void
  onApply: () => void
  /** Rendered in place of the preview once the apply has finished. */
  doneContent?: ReactNode
  /** The preview body, rendered only during the 'preview' stage. */
  children?: ReactNode
}) {
  const close = () => {
    if (!canClose) return
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent className="flex max-h-[85vh] max-w-5xl flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <RefreshCw className="h-4 w-4" />
            {title}
          </DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>

        <div className="min-h-0 flex-1 overflow-y-auto">
          {stage === 'loading' && (
            <div className="text-muted-foreground flex items-center justify-center gap-2 py-12">
              <Spinner className="h-4 w-4" />
              <span>Vorschau wird aus Microsoft Graph geladen …</span>
            </div>
          )}

          {stage === 'error' && (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertTitle>Synchronisierung fehlgeschlagen</AlertTitle>
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          {stage === 'done' && doneContent}

          {stage === 'preview' && children}
        </div>

        <DialogFooter className="gap-2">
          {stage === 'preview' && (
            <>
              <Button variant="outline" onClick={onReload}>
                Neu laden
              </Button>
              <span className="text-muted-foreground mr-auto text-xs">
                {selectedCount} zum Anwenden ausgewählt
              </span>
              <Button variant="ghost" onClick={close}>
                Abbrechen
              </Button>
              <Button onClick={onApply} disabled={selectedCount === 0}>
                Anwenden
              </Button>
            </>
          )}
          {stage === 'applying' && (
            <Button disabled>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Wird angewendet …
            </Button>
          )}
          {(stage === 'done' || stage === 'error') && <Button onClick={close}>Schließen</Button>}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

/** Success banner shown after a sync has been applied. */
export function SyncSummaryAlert({
  lines,
  issueCount,
}: {
  lines: string[]
  issueCount: number
}) {
  return (
    <Alert>
      <CheckCircle2 className="h-4 w-4" />
      <AlertTitle>Synchronisierung angewendet</AlertTitle>
      <AlertDescription>
        <ul className="space-y-0.5">
          {lines.map(line => (
            <li key={line}>{line}</li>
          ))}
        </ul>
        {issueCount > 0 ? <p className="mt-2">{issueCount} Problem(e) erfasst.</p> : null}
      </AlertDescription>
    </Alert>
  )
}
