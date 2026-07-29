'use client'

import { useTranslation } from 'react-i18next'
import { CheckCircle2, Info, Lock, LockOpen, ShieldCheck } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Spinner } from '@/components/ui/spinner'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
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

  if (!s.marked && !canManage) return null

  return (
    <div className="border-border/60 flex flex-wrap items-center gap-2 border-t pt-2.5 first:border-t-0 first:pt-0">
      <span className="w-24 shrink-0 text-sm font-medium">{semesterLabel}</span>

      {!s.marked ? (
        <>
          <Badge variant="soft-muted">{t('notensammler.sokratesOpen', 'Offen')}</Badge>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button size="sm" variant="outline" disabled={busy} onClick={() => onMark(semester)}>
                <ShieldCheck className="mr-1.5 h-4 w-4" />
                {t('notensammler.sokratesMarkShort', 'Als eingetragen markieren')}
              </Button>
            </TooltipTrigger>
            <TooltipContent>
              {t(
                'notensammler.sokratesMarkHint',
                'Sperrt alle Noten dieses Semesters für alle Lehrer.',
              )}
            </TooltipContent>
          </Tooltip>
        </>
      ) : (
        <>
          <Badge variant="soft-success">
            <CheckCircle2 className="mr-1 h-3 w-3" />
            {t('notensammler.sokratesMarked', 'In Sokrates eingetragen')}
          </Badge>
          <span className="text-muted-foreground text-xs">
            {formatDate(s.markedAt)}
            {s.markedByName ? ` · ${s.markedByName}` : ''}
          </span>

          {s.lockedAll ? (
            <Badge variant="soft-destructive">
              <Lock className="mr-1 h-3 w-3" />
              {t('notensammler.sokratesLocked', 'Gesperrt')}
            </Badge>
          ) : (
            <Tooltip>
              <TooltipTrigger asChild>
                <Badge variant="soft-warning" className="cursor-default">
                  <Info className="mr-1 h-3 w-3" />
                  {t('notensammler.sokratesSoftLabel', 'Änderungen gemeldet')}
                </Badge>
              </TooltipTrigger>
              <TooltipContent>
                {t(
                  'notensammler.sokratesSoftHint',
                  'Änderungen werden dem Klassenleiter gemeldet.',
                )}
              </TooltipContent>
            </Tooltip>
          )}

          {canManage && (
            <div className="ml-auto flex items-center gap-2">
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
            </div>
          )}
        </>
      )}
    </div>
  )
}

/**
 * Sokrates transfer marker & lock. Wechselplan cannot push grades to Sokrates,
 * so the Klassenleiter records here that a semester has been entered — which
 * locks the whole semester for every teacher at once. Lifting that lock leaves
 * the mark in place and drops back to reporting changes instead of blocking
 * them, with individual columns still lockable.
 */
export function SokratesPanel({ status, canManage, busy, onMark, onUnmark, onSetLockAll }: Props) {
  const { t } = useTranslation()

  // Nothing to show to a plain teacher until something is marked.
  const anythingToShow = canManage || status.first.marked || status.second.marked
  if (!anythingToShow) return null

  return (
    <section className="border-border/60 bg-card/40 rounded-xl border p-3">
      <div className="mb-2 flex items-center gap-2">
        <ShieldCheck className="text-muted-foreground h-4 w-4" />
        <h2 className="text-sm font-semibold">{t('notensammler.sokratesTitle', 'Sokrates')}</h2>
        <Tooltip>
          <TooltipTrigger asChild>
            {/* A button, not a focusable span: it needs button semantics, and
                the label has to describe the tooltip rather than repeat the
                heading next to it. */}
            <Button
              variant="ghost"
              size="icon"
              className="text-muted-foreground hover:text-foreground h-5 w-5"
              aria-label={t('notensammler.sokratesExplainerLabel', 'Was ist Sokrates?')}
            >
              <Info className="h-3.5 w-3.5" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>
            {t(
              'notensammler.sokratesExplainer',
              'Noten werden in Sokrates von Hand eingetragen. Die Klassenleitung hält hier fest, dass das erledigt ist — die Noten werden dabei gesperrt, die Sperre kann aber wieder aufgehoben werden.',
            )}
          </TooltipContent>
        </Tooltip>
        {busy && <Spinner size="sm" />}
      </div>
      <div className="flex flex-col gap-2.5">
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
    </section>
  )
}
