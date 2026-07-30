'use client'

import Link from 'next/link'
import { useTranslation } from 'react-i18next'
import { CheckCircle2, ExternalLink, Info } from 'lucide-react'
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Spinner } from '@/components/ui/spinner'
import { cn } from '@/lib/utils'
import type { EditableNote, PreviewStudent, Semester } from '@/lib/notenmanagement/types'
import type { useTransferFlow } from '../_hooks/use-transfer-flow'
import { NmCredentialsDialog } from './nm-credentials-dialog'

const OVERRIDE_OPTIONS = ['1', '2', '3', '4', '5', 'Nicht beurteilt', 'Gestundet'] as const

export type TransferDialogsProps = ReturnType<typeof useTransferFlow>

/** The mark shown for a ready row: the override, else the previewed value. */
function displayedValue(student: PreviewStudent, override: EditableNote | undefined): EditableNote {
  return override ?? student.note ?? student.nullNoteLabel ?? 'Nicht beurteilt'
}

/** Preview (loads without login) → credentials (only for the write) → result. */
export function TransferDialogs(props: TransferDialogsProps) {
  const { t } = useTranslation()
  const {
    step,
    setStep,
    close,
    semester,
    selectSemester,
    previewLoading,
    previewData,
    overrides,
    setOverride,
    transferLoading,
    transferResult,
    submit,
    username,
    setUsername,
    password,
    setPassword,
    credentialsError,
    submitCredentials,
  } = props

  const counts = previewData?.counts
  /** The chosen semester was already transferred, so this run updates it. */
  const isUpdate = Boolean(
    previewData?.transferStatus &&
      ((semester === 'first' && previewData.transferStatus.first.transferred) ||
        (semester === 'second' && previewData.transferStatus.second.transferred)),
  )

  const transfers = transferResult?.transfers ?? []
  const skippedUnlinked = transferResult?.unlinked ?? []
  const skippedNoEndnote = transferResult?.noEndnote ?? []

  return (
    <>
      <Dialog open={step === 'preview'} onOpenChange={open => !open && close()}>
        <DialogContent className="max-h-[85vh] max-w-3xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {t('notensammler.nmPreviewTitle', 'Vorschau: Übertragung an Notenmanagement')}
            </DialogTitle>
            {previewData && (
              <DialogDescription>
                {t('notensammler.nmPreviewMeta', 'Klasse')}: {previewData.className}
                {previewData.subjectTruncated
                  ? ` · ${t('notensammler.subject', 'Fach')}: ${previewData.subjectTruncated}`
                  : ''}
              </DialogDescription>
            )}
          </DialogHeader>

          <Tabs
            value={semester}
            onValueChange={value => selectSemester(value as Semester)}
            className="w-fit"
          >
            <TabsList>
              <TabsTrigger value="first">
                {t('notensammler.firstSemester', '1. Semester')}
              </TabsTrigger>
              <TabsTrigger value="second">
                {t('notensammler.secondSemester', '2. Semester')}
              </TabsTrigger>
            </TabsList>
          </Tabs>

          {counts && (
            <div className="space-y-1.5">
              <p className="text-sm font-medium">
                {t('notensammler.nmReadyCount', '{{ready}} von {{total}} Schüler:innen bereit', {
                  ready: counts.readyToSend,
                  total: counts.totalScoped,
                })}
              </p>
              {counts.unlinked > 0 && (
                <p className="text-muted-foreground flex flex-wrap items-center gap-1 text-sm">
                  <Info className="h-3.5 w-3.5 shrink-0" aria-hidden />
                  {t(
                    'notensammler.nmUnlinkedHint',
                    'Nicht verknüpfte Schüler:innen zuerst unter Admin → Notenmanagement verknüpfen.',
                  )}
                  <Link
                    href="/admin/notenmanagement"
                    className="text-primary inline-flex items-center gap-0.5 underline underline-offset-2"
                  >
                    {t('notensammler.nmAdminLink', 'Zur Verknüpfung')}
                    <ExternalLink className="h-3 w-3" aria-hidden />
                  </Link>
                </p>
              )}
              {counts.withoutEndnote > 0 && (
                <p className="text-muted-foreground text-sm">
                  {t(
                    'notensammler.nmWithoutEndnoteHint',
                    '{{count}} verknüpfte Schüler:innen brauchen zuerst eine Endnote.',
                    { count: counts.withoutEndnote },
                  )}
                </p>
              )}
            </div>
          )}

          {previewLoading && (
            <div className="flex items-center justify-center py-8">
              <Spinner size="lg" />
            </div>
          )}

          {previewData && !previewLoading && (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t('notensammler.student', 'Schüler')}</TableHead>
                    <TableHead className="w-52">{t('notensammler.grade', 'Note')}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {previewData.students.map(student => {
                    const ready = student.linked && student.hasEndnote
                    const changed = overrides[student.studentId] !== undefined
                    const value = displayedValue(student, overrides[student.studentId])
                    return (
                      <TableRow
                        key={student.studentId}
                        className={cn(!ready && 'opacity-60', changed && 'bg-info/5')}
                      >
                        <TableCell>
                          <span className="flex flex-wrap items-center gap-2">
                            <span>
                              {student.lastName}, {student.firstName}
                            </span>
                            {!student.linked && (
                              <Badge variant="soft-muted">
                                {t('notensammler.nmNotLinked', 'nicht verknüpft')}
                              </Badge>
                            )}
                            {student.linked && !student.hasEndnote && (
                              <Badge variant="soft-warning">
                                {t('notensammler.nmNoEndnote', 'keine Endnote')}
                              </Badge>
                            )}
                            {changed && (
                              <Badge variant="info">
                                {t('notensammler.nmChanged', 'geändert')}
                              </Badge>
                            )}
                          </span>
                        </TableCell>
                        <TableCell>
                          {ready ? (
                            <Select
                              value={typeof value === 'number' ? String(value) : value}
                              onValueChange={next =>
                                setOverride(
                                  student.studentId,
                                  next === 'Nicht beurteilt' || next === 'Gestundet'
                                    ? next
                                    : (parseInt(next, 10) as 1 | 2 | 3 | 4 | 5),
                                )
                              }
                            >
                              <SelectTrigger className="w-48">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                {OVERRIDE_OPTIONS.map(option => (
                                  <SelectItem key={option} value={option}>
                                    {option}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          ) : (
                            <span className="text-muted-foreground text-sm">
                              {t('notensammler.nmExcluded', 'wird nicht übertragen')}
                            </span>
                          )}
                        </TableCell>
                      </TableRow>
                    )
                  })}
                </TableBody>
              </Table>
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={close}>
              {t('common.cancel', 'Abbrechen')}
            </Button>
            <Button
              onClick={submit}
              disabled={previewLoading || transferLoading || !counts || counts.readyToSend === 0}
            >
              {transferLoading ? (
                <>
                  <Spinner size="sm" className="mr-2" />
                  {t('notensammler.transferring', 'Übertrage...')}
                </>
              ) : isUpdate ? (
                t('notensammler.nmUpdateTransfer', 'An Notenmanagement aktualisieren')
              ) : (
                t('notensammler.nmTransfer', 'An Notenmanagement übertragen')
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <NmCredentialsDialog
        open={step === 'credentials'}
        onOpenChange={open => !open && setStep('preview')}
        username={username}
        onUsernameChange={setUsername}
        password={password}
        onPasswordChange={setPassword}
        onSubmit={submitCredentials}
        loading={transferLoading}
        submitLabel={t('notensammler.nmTransfer', 'An Notenmanagement übertragen')}
        error={credentialsError}
      />

      <Dialog open={step === 'result'} onOpenChange={open => !open && close()}>
        <DialogContent className="max-h-[80vh] max-w-2xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {transferResult?.success
                ? t('notensammler.nmSuccessTitle', 'Übertragung erfolgreich')
                : t('notensammler.nmErrorTitle', 'Übertragung fehlgeschlagen')}
            </DialogTitle>
            <DialogDescription>
              {t('notensammler.nmSentCount', '{{count}} Note(n) übertragen.', {
                count: transferResult?.sentCount ?? 0,
              })}
            </DialogDescription>
          </DialogHeader>

          {transfers.length > 0 && (
            <div className="space-y-2">
              {transfers.map(transfer => (
                <div
                  key={transfer.lfId}
                  className="bg-muted flex items-center justify-between gap-3 rounded-md border px-3 py-2 text-sm"
                >
                  <span className="flex items-center gap-2">
                    <CheckCircle2 className="text-success h-4 w-4" aria-hidden />
                    {transfer.klasse}
                    <span className="text-muted-foreground">LF {transfer.lfId}</span>
                  </span>
                  <span className="font-medium">
                    {t('notensammler.nmTransferCount', '{{count}} Note(n)', {
                      count: transfer.count,
                    })}
                  </span>
                </div>
              ))}
            </div>
          )}

          {skippedUnlinked.length > 0 && (
            <div className="text-muted-foreground text-sm">
              <p className="font-medium">
                {t('notensammler.nmSkippedUnlinked', 'Nicht verknüpft (übersprungen):')}
              </p>
              <p>{skippedUnlinked.join(', ')}</p>
            </div>
          )}

          {skippedNoEndnote.length > 0 && (
            <div className="text-muted-foreground text-sm">
              <p className="font-medium">
                {t('notensammler.nmSkippedNoEndnote', 'Ohne Endnote (übersprungen):')}
              </p>
              <p>{skippedNoEndnote.join(', ')}</p>
            </div>
          )}

          <DialogFooter>
            <Button onClick={close}>{t('common.close', 'Schließen')}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
