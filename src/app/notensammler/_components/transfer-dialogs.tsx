'use client'

import { useTranslation } from 'react-i18next'
import { Check, X } from 'lucide-react'
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
import { Button } from '@/components/ui/button'
import { Spinner } from '@/components/ui/spinner'
import type {
  EditableNote,
  Semester,
  TransferPreviewResponse,
  TransferResultResponse,
} from '@/lib/notenmanagement/types'
import { NmCredentialsDialog } from './nm-credentials-dialog'
import { NmNotesTable, type NmNoteRow } from './nm-notes-table'

const NM_ONLY_NO_GRADE = 'keine'

export type TransferDialogsProps = {
  step: 'password' | 'semester' | 'preview' | 'result' | null
  setStep: (step: 'password' | 'semester' | 'preview' | 'result' | null) => void
  close: () => void
  username: string
  setUsername: (value: string) => void
  password: string
  setPassword: (value: string) => void
  selectSemester: (semester: Semester) => void
  previewLoading: boolean
  transferLoading: boolean
  previewData: TransferPreviewResponse | null
  editedNotes: Record<number, EditableNote>
  setEditedNotes: React.Dispatch<React.SetStateAction<Record<number, EditableNote>>>
  editedNotesNmOnly: Record<number, 1 | 2 | 3 | 4 | 5 | null>
  setEditedNotesNmOnly: React.Dispatch<
    React.SetStateAction<Record<number, 1 | 2 | 3 | 4 | 5 | null>>
  >
  transferResult: TransferResultResponse | null
  submit: () => void
  error: string | null
}

/** Credentials → semester → editable preview → result. */
export function TransferDialogs(props: TransferDialogsProps) {
  const { t } = useTranslation()
  const {
    step,
    setStep,
    close,
    username,
    setUsername,
    password,
    setPassword,
    selectSemester,
    previewLoading,
    transferLoading,
    previewData,
    editedNotes,
    setEditedNotes,
    editedNotesNmOnly,
    setEditedNotesNmOnly,
    transferResult,
    submit,
    error,
  } = props

  /** The chosen semester was already transferred, so this run updates it. */
  const isUpdate = Boolean(
    previewData?.transferStatus &&
      ((previewData.semester === 'first' && previewData.transferStatus.first.transferred) ||
        (previewData.semester === 'second' && previewData.transferStatus.second.transferred)),
  )

  const confirmation = Array.isArray(transferResult?.confirmation)
    ? (transferResult.confirmation as NmNoteRow[])
    : null

  return (
    <>
      <NmCredentialsDialog
        open={step === 'password'}
        onOpenChange={open => !open && close()}
        username={username}
        onUsernameChange={setUsername}
        password={password}
        onPasswordChange={setPassword}
        onSubmit={() => setStep('semester')}
      />

      <Dialog open={step === 'semester'} onOpenChange={open => !open && close()}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('notensammler.nmSemesterTitle', 'Semester auswählen')}</DialogTitle>
            <DialogDescription>
              {t('notensammler.nmSemesterDesc', 'Welches Semester möchtest du übertragen?')}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={close}>
              {t('common.cancel', 'Abbrechen')}
            </Button>
            {(['first', 'second'] as const).map(semester => (
              <Button
                key={semester}
                onClick={() => selectSemester(semester)}
                disabled={previewLoading}
              >
                {previewLoading ? (
                  <>
                    <Spinner size="sm" className="mr-2" />
                    {t('notensammler.loading', 'Lade...')}
                  </>
                ) : semester === 'first' ? (
                  t('notensammler.firstSemester', '1. Semester')
                ) : (
                  t('notensammler.secondSemester', '2. Semester')
                )}
              </Button>
            ))}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={step === 'preview'} onOpenChange={open => !open && close()}>
        <DialogContent className="max-h-[80vh] max-w-3xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {t('notensammler.nmPreviewTitle', 'Vorschau: Übertragung an Notenmanagement')}
            </DialogTitle>
            {previewData && (
              <DialogDescription className="whitespace-pre-line">
                {t('notensammler.nmPreviewMeta', 'Klasse')}: {previewData.className} ·{' '}
                {t('notensammler.subject', 'Fach')}: {previewData.subjectTruncated} ·{' '}
                {t('notensammler.teachers', 'Lehrer')}: {previewData.teacherCount}
                {previewData.counts.unmatchedCompleteStudents > 0
                  ? `\n${t('notensammler.nmUnmatchedWarning', 'Unmatched Schüler werden nicht übertragen.')}`
                  : ''}
              </DialogDescription>
            )}
          </DialogHeader>

          {previewLoading && (
            <div className="flex items-center justify-center py-8">
              <Spinner size="lg" />
            </div>
          )}

          {previewData && (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t('notensammler.student', 'Schüler')}</TableHead>
                    <TableHead className="w-32">{t('notensammler.grade', 'Note')}</TableHead>
                    <TableHead className="w-40">
                      {t('notensammler.matrikelnummer', 'Matrikelnummer')}
                    </TableHead>
                    <TableHead className="w-28">{t('notensammler.match', 'Match')}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {previewData.students.map(student => {
                    const noteValue: EditableNote =
                      editedNotes[student.studentId] ??
                      student.note ??
                      student.nullNoteLabel ??
                      'Nicht beurteilt'
                    return (
                      <TableRow key={student.studentId}>
                        <TableCell>
                          {student.lastName}, {student.firstName}
                        </TableCell>
                        <TableCell>
                          <Select
                            value={typeof noteValue === 'number' ? String(noteValue) : noteValue}
                            onValueChange={value => {
                              const note: EditableNote =
                                value === 'Nicht beurteilt' || value === 'Gestundet'
                                  ? value
                                  : (parseInt(value, 10) as 1 | 2 | 3 | 4 | 5)
                              setEditedNotes(prev => ({ ...prev, [student.studentId]: note }))
                            }}
                          >
                            <SelectTrigger className="w-40">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {['1', '2', '3', '4', '5'].map(value => (
                                <SelectItem key={value} value={value}>
                                  {value}
                                </SelectItem>
                              ))}
                              <SelectItem value="Nicht beurteilt">Nicht beurteilt</SelectItem>
                              <SelectItem value="Gestundet">Gestundet</SelectItem>
                            </SelectContent>
                          </Select>
                        </TableCell>
                        <TableCell>{student.matrikelnummer ?? '-'}</TableCell>
                        <TableCell>
                          {student.matched ? (
                            <Check
                              className="text-success h-4 w-4"
                              aria-label={t('notensammler.match', 'Match')}
                            />
                          ) : (
                            <X
                              className="text-destructive h-4 w-4"
                              aria-label={t('notensammler.match', 'Match')}
                            />
                          )}
                        </TableCell>
                      </TableRow>
                    )
                  })}
                </TableBody>
              </Table>
            </div>
          )}

          {previewData?.nmStudentsWithoutGradeOrMatch &&
            previewData.nmStudentsWithoutGradeOrMatch.length > 0 && (
              <div className="mt-6">
                <h3 className="mb-2 text-sm font-semibold">
                  {t(
                    'notensammler.nmStudentsWithoutGradeOrMatch',
                    'Schüler in Notenmanagement ohne Zuordnung oder Note',
                  )}
                </h3>
                <div className="max-h-48 overflow-y-auto rounded-md border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-24">
                          {t('notensammler.matrikelnummer', 'Matr.')}
                        </TableHead>
                        <TableHead>{t('notensammler.lastName', 'Nachname')}</TableHead>
                        <TableHead>{t('notensammler.firstName', 'Vorname')}</TableHead>
                        <TableHead className="w-24">{t('notensammler.class', 'Klasse')}</TableHead>
                        <TableHead className="w-32">{t('notensammler.grade', 'Note')}</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {previewData.nmStudentsWithoutGradeOrMatch.map(nm => {
                        const noteValue = editedNotesNmOnly[nm.Matrikelnummer] ?? null
                        return (
                          <TableRow key={nm.Matrikelnummer}>
                            <TableCell className="font-mono text-xs">{nm.Matrikelnummer}</TableCell>
                            <TableCell>{nm.Nachname}</TableCell>
                            <TableCell>{nm.Vorname}</TableCell>
                            <TableCell>{nm.Klasse ?? '-'}</TableCell>
                            <TableCell>
                              <Select
                                value={noteValue === null ? NM_ONLY_NO_GRADE : String(noteValue)}
                                onValueChange={value => {
                                  const note =
                                    value === NM_ONLY_NO_GRADE
                                      ? null
                                      : (parseInt(value, 10) as 1 | 2 | 3 | 4 | 5)
                                  setEditedNotesNmOnly(prev => ({
                                    ...prev,
                                    [nm.Matrikelnummer]: note,
                                  }))
                                }}
                              >
                                <SelectTrigger className="w-32">
                                  <SelectValue
                                    placeholder={t('notensammler.keineNote', 'Keine Note')}
                                  />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value={NM_ONLY_NO_GRADE}>
                                    {t('notensammler.keineNote', 'Keine Note')}
                                  </SelectItem>
                                  {['1', '2', '3', '4', '5'].map(value => (
                                    <SelectItem key={value} value={value}>
                                      {value}
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            </TableCell>
                          </TableRow>
                        )
                      })}
                    </TableBody>
                  </Table>
                </div>
              </div>
            )}

          <DialogFooter>
            <Button variant="outline" onClick={close}>
              {t('common.cancel', 'Abbrechen')}
            </Button>
            <Button onClick={submit} disabled={transferLoading || !previewData}>
              {transferLoading ? (
                <>
                  <Spinner size="sm" className="mr-2" />
                  {t('notensammler.transferring', 'Übertrage...')}
                </>
              ) : isUpdate ? (
                t('notensammler.updateTransfer', 'Aktualisieren')
              ) : (
                t('notensammler.transferNow', 'Jetzt übertragen')
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={step === 'result'} onOpenChange={open => !open && close()}>
        <DialogContent className="max-h-[80vh] max-w-3xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {transferResult?.success
                ? t('notensammler.nmSuccessTitle', 'Übertragung erfolgreich')
                : t('notensammler.nmErrorTitle', 'Übertragung fehlgeschlagen')}
            </DialogTitle>
            <DialogDescription className="whitespace-pre-line">
              {transferResult?.success
                ? `${t('notensammler.nmLfId', 'LF_ID')}: ${transferResult.lfId}\n${t('notensammler.nmSent', 'Übertragen')}: ${transferResult.sentCount}`
                : (error ?? t('notensammler.nmUnknownError', 'Unbekannter Fehler'))}
            </DialogDescription>
          </DialogHeader>

          {transferResult?.success && !!transferResult.confirmation && (
            <div className="bg-muted rounded-md border p-4">
              <h3 className="mb-3 text-sm font-semibold">
                {t('notensammler.nmConfirmation', 'Übertragene Noten')}
              </h3>
              {confirmation && confirmation.length > 0 ? (
                <NmNotesTable rows={confirmation} />
              ) : (
                <div className="text-muted-foreground text-sm">
                  <pre className="whitespace-pre-wrap">
                    {JSON.stringify(transferResult.confirmation, null, 2)}
                  </pre>
                </div>
              )}
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
