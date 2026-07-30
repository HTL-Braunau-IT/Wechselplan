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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Button } from '@/components/ui/button'
import type { LfViewNote } from '@/lib/notenmanagement/types'

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
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-20">
                      {t('notensammler.matrikelnummer', 'Matr.')}
                    </TableHead>
                    <TableHead>{t('notensammler.lastName', 'Nachname')}</TableHead>
                    <TableHead>{t('notensammler.firstName', 'Vorname')}</TableHead>
                    <TableHead className="w-16 text-center">
                      {t('notensammler.note', 'Note')}
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {notes.map((row, index) => {
                    // A null Note is meaningful: the Kommentar carries the reason.
                    const noteDisplay =
                      row.Note != null
                        ? String(row.Note)
                        : row.Kommentar === 'Nicht beurteilt' || row.Kommentar === 'Gestundet'
                          ? row.Kommentar
                          : t('notensammler.keineNote', 'Keine Note')
                    return (
                      <TableRow key={row.Matrikelnummer ?? index}>
                        <TableCell className="font-mono text-xs">{row.Matrikelnummer}</TableCell>
                        <TableCell>{row.Nachname}</TableCell>
                        <TableCell>{row.Vorname}</TableCell>
                        <TableCell className="text-center font-semibold">{noteDisplay}</TableCell>
                      </TableRow>
                    )
                  })}
                </TableBody>
              </Table>
            </div>
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
