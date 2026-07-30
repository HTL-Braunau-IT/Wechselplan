'use client'

import { useTranslation } from 'react-i18next'
import { ArrowRight, CheckCircle2, ClipboardCheck } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Spinner } from '@/components/ui/spinner'
import type { Semester } from '@/lib/grades'
import type { SokratesChange } from '../_hooks/use-sokrates-changes'

type Props = {
  changes: SokratesChange[]
  /** The class lead may acknowledge the whole list; a teacher only reads it. */
  canAcknowledge: boolean
  busy: boolean
  onAcknowledge: () => void
}

const formatDateTime = (iso: string): string => {
  const d = new Date(iso)
  return d.toLocaleString('de-AT', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'Europe/Vienna',
  })
}

/**
 * The "what changed" rundown a grade notification links to (issue #96): the
 * grade edits made after this class was entered into Sokrates that nobody has
 * acknowledged yet — student, subject column, old → new, and who changed it —
 * so the reader does not have to hunt the drift rings across the grid.
 *
 * The class lead gets a single "Gesehen" button that acknowledges the lot,
 * clearing the markers and telling each teacher their change was seen.
 */
export function SokratesChangesPanel({ changes, canAcknowledge, busy, onAcknowledge }: Props) {
  const { t } = useTranslation()
  if (changes.length === 0) return null

  const semesterLabel = (semester: Semester) =>
    semester === 'first'
      ? t('notensammler.firstSemester', '1. Semester')
      : t('notensammler.secondSemester', '2. Semester')

  return (
    <section className="border-warning/40 bg-warning/5 rounded-xl border p-3">
      <div className="mb-2 flex items-center gap-2">
        <ClipboardCheck className="text-warning h-4 w-4" />
        <h2 className="text-sm font-semibold">
          {t('notensammler.changesTitle', 'Notenänderungen nach der Sokrates-Übertragung')}
        </h2>
        {busy && <Spinner size="sm" />}
        {canAcknowledge && (
          <Button
            size="sm"
            variant="outline"
            disabled={busy}
            onClick={onAcknowledge}
            className="ml-auto"
          >
            <CheckCircle2 className="mr-1.5 h-4 w-4" />
            {t('notensammler.changesAcknowledge', 'Alle gesehen')}
          </Button>
        )}
      </div>

      <p className="text-muted-foreground mb-2 text-xs">
        {canAcknowledge
          ? t(
              'notensammler.changesHintLead',
              'Diese Noten wurden nach der Sokrates-Übertragung geändert. Prüfe, ob sie in Sokrates nachgezogen werden müssen, und bestätige mit „Alle gesehen".',
            )
          : t(
              'notensammler.changesHintTeacher',
              'Deine Änderungen nach der Sokrates-Übertragung. Der Klassenvorstand wird informiert, sobald er sie gesehen hat.',
            )}
      </p>

      <ul className="flex flex-col gap-1.5">
        {changes.map(change => (
          <li
            key={change.id}
            className="border-border/50 flex flex-wrap items-center gap-x-2 gap-y-1 border-t pt-1.5 text-sm first:border-t-0 first:pt-0"
          >
            <span className="font-medium">{change.studentName}</span>
            <span className="text-muted-foreground">· {change.subjectTeacherName}</span>
            <span className="text-muted-foreground">· {semesterLabel(change.semester)}</span>
            <span className="ml-auto flex items-center gap-1 font-mono">
              <span className="text-muted-foreground">{change.oldGrade}</span>
              <ArrowRight className="h-3 w-3" />
              <span className="font-semibold">{change.newGrade}</span>
            </span>
            <span className="text-muted-foreground w-full text-xs">
              {t('notensammler.changesBy', 'Geändert von {{name}} · {{when}}', {
                name: change.changedByName,
                when: formatDateTime(change.changedAt),
              })}
            </span>
          </li>
        ))}
      </ul>
    </section>
  )
}
