'use client'

import { useTranslation } from 'react-i18next'
import { CheckCircle2, Lock, LockOpen, ShieldCheck } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Spinner } from '@/components/ui/spinner'
import type { Semester } from '@/lib/grades'
import type { SokratesSemesterStatus, SokratesStatus } from '../_hooks/use-sokrates'

type Props = {
  status: SokratesStatus
  canManage: boolean
  busy: boolean
  onMark: (semester: Semester) => void
  onUnmark: (semester: Semester) => void
  onSetLockAll: (semester: Semester, locked: boolean) => void
}

const formatDate = (iso: string | null): string => {
  if (!iso) return ''
  const d = new Date(iso)
  // Pin the timezone so server and client render the same day (no hydration drift).
  return d.toLocaleDateString('de-AT', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    timeZone: 'Europe/Vienna',
  })
}

/** Mark/lock controls and status for one semester. */
function SemesterRow({
  semester,
  s,
  canManage,
  busy,
  onMark,
  onUnmark,
  onSetLockAll,
}: {
  semester: Semester
  s: SokratesSemesterStatus
} & Omit<Props, 'status'>) {
  const { t } = useTranslation()
  const semesterLabel =
    semester === 'first'
      ? t('notensammler.firstSemester', '1. Semester')
      : t('notensammler.secondSemester', '2. Semester')

  if (!s.marked) {
    if (!canManage) return null
    return (
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-muted-foreground text-sm font-medium">{semesterLabel}:</span>
        <Button size="sm" variant="outline" disabled={busy} onClick={() => onMark(semester)}>
          <ShieldCheck className="mr-1.5 h-4 w-4" />
          {t('notensammler.sokratesMark', 'In Sokrates eingetragen')}
        </Button>
      </div>
    )
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="text-muted-foreground text-sm font-medium">{semesterLabel}:</span>
      <Badge variant="outline" className="border-green-600/40 text-green-700 dark:text-green-400">
        <CheckCircle2 className="mr-1 h-3 w-3" />
        {t('notensammler.sokratesMarked', 'In Sokrates eingetragen')}
        <span className="text-muted-foreground ml-1">
          ({formatDate(s.markedAt)}
          {s.markedByName ? `, ${s.markedByName}` : ''})
        </span>
      </Badge>
      {s.lockedAll ? (
        <Badge variant="outline" className="border-destructive/40 text-destructive">
          <Lock className="mr-1 h-3 w-3" />
          {t('notensammler.sokratesLocked', 'Gesperrt')}
        </Badge>
      ) : (
        <span className="text-muted-foreground text-xs">
          {t('notensammler.sokratesSoftHint', 'Änderungen werden dem Klassenleiter gemeldet.')}
        </span>
      )}
      {canManage && (
        <>
          <Button
            size="sm"
            variant={s.lockedAll ? 'outline' : 'secondary'}
            disabled={busy}
            onClick={() => onSetLockAll(semester, !s.lockedAll)}
          >
            {s.lockedAll ? (
              <>
                <LockOpen className="mr-1.5 h-4 w-4" />
                {t('notensammler.sokratesUnlockAll', 'Sperre aufheben')}
              </>
            ) : (
              <>
                <Lock className="mr-1.5 h-4 w-4" />
                {t('notensammler.sokratesLockAll', 'Ganze Klasse sperren')}
              </>
            )}
          </Button>
          <Button
            size="sm"
            variant="ghost"
            disabled={busy}
            onClick={() => onUnmark(semester)}
            className="text-muted-foreground"
          >
            {t('notensammler.sokratesUnmark', 'Markierung aufheben')}
          </Button>
        </>
      )}
    </div>
  )
}

/**
 * Sokrates transfer marker & lock. Wechselplan cannot push grades to Sokrates,
 * so the Klassenleiter records here that a semester has been entered; after
 * that, changes are reported (soft) or blocked (hard lock).
 */
export function SokratesPanel({ status, canManage, busy, onMark, onUnmark, onSetLockAll }: Props) {
  const { t } = useTranslation()

  // Nothing to show to a plain teacher until something is marked.
  const anythingToShow = canManage || status.first.marked || status.second.marked
  if (!anythingToShow) return null

  return (
    <div className="bg-muted/40 mb-4 rounded-md border px-3 py-2.5">
      <div className="mb-1.5 flex items-center gap-2">
        <ShieldCheck className="text-muted-foreground h-4 w-4" />
        <p className="text-sm font-medium">{t('notensammler.sokratesTitle', 'Sokrates')}</p>
        {busy && <Spinner size="sm" />}
      </div>
      <div className="flex flex-col gap-2">
        <SemesterRow
          semester="first"
          s={status.first}
          canManage={canManage}
          busy={busy}
          onMark={onMark}
          onUnmark={onUnmark}
          onSetLockAll={onSetLockAll}
        />
        <SemesterRow
          semester="second"
          s={status.second}
          canManage={canManage}
          busy={busy}
          onMark={onMark}
          onUnmark={onUnmark}
          onSetLockAll={onSetLockAll}
        />
      </div>
    </div>
  )
}
