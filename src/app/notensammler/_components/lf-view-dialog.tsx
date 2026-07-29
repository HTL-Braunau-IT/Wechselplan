'use client'

import { useTranslation } from 'react-i18next'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import type { LfViewNote } from '@/lib/notenmanagement/types'
import { NmNotesTable } from './nm-notes-table'

/** Read-back of the notes Notenmanagement holds for an already transferred LF. */
export function LfViewDialog({
  open,
  onOpenChange,
  lfId,
  notes,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  lfId: string | null
  notes: LfViewNote[] | null
}) {
  const { t } = useTranslation()

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[80vh] max-w-4xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {t('notensammler.lfViewTitle', 'LF Daten')} {lfId && `(LF: ${lfId})`}
          </DialogTitle>
          <DialogDescription>
            {t('notensammler.lfViewDesc', 'Übertragene Noten aus Notenmanagement')}
          </DialogDescription>
        </DialogHeader>

        {notes && notes.length > 0 ? (
          <div className="bg-muted rounded-md border p-4">
            <NmNotesTable rows={notes} />
          </div>
        ) : (
          <div className="text-muted-foreground text-sm">
            {t('notensammler.noData', 'Keine Daten verfügbar')}
          </div>
        )}

        <DialogFooter>
          <Button onClick={() => onOpenChange(false)}>{t('common.close', 'Schließen')}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
