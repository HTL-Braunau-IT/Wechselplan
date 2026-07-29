'use client'

import { AlertTriangle, CheckCircle2, CircleSlash, Clock, XCircle } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'

/**
 * Shows the outcome of the most recent directory sync.
 *
 * `DirectorySyncSettings.lastSyncAt/Status/Summary` were written on every run
 * but never displayed anywhere, so the only way to tell whether the nightly
 * sync had worked was to read the database.
 */

interface ScopeCounts {
  created?: number
  updated?: number
  adopted?: number
  deactivated?: number
  reactivated?: number
  unassigned?: number
  unchanged?: number
}

interface SyncSummary {
  scope?: string
  errors?: string[]
  reason?: string
  teachers?: ScopeCounts & { issues?: unknown[] }
  classesStudents?: {
    classes?: ScopeCounts
    students?: ScopeCounts
    issues?: unknown[]
  }
  // Single-scope runs (a manual apply from one of the dialogs) put the counts
  // at the top level instead of nesting them.
  classes?: ScopeCounts
  students?: ScopeCounts
  issues?: unknown[]
}

const STATUS_META: Record<
  string,
  {
    label: string
    icon: typeof CheckCircle2
    variant: 'default' | 'secondary' | 'destructive' | 'outline'
  }
> = {
  success: { label: 'Erfolgreich', icon: CheckCircle2, variant: 'default' },
  partial: { label: 'Mit Hinweisen', icon: AlertTriangle, variant: 'secondary' },
  failed: { label: 'Fehlgeschlagen', icon: XCircle, variant: 'destructive' },
  skipped: { label: 'Übersprungen', icon: CircleSlash, variant: 'outline' },
}

function formatCounts(label: string, counts: ScopeCounts | undefined): string | null {
  if (!counts) return null
  const parts = [
    counts.created ? `${counts.created} neu` : null,
    counts.updated ? `${counts.updated} aktualisiert` : null,
    counts.adopted ? `${counts.adopted} übernommen` : null,
    counts.reactivated ? `${counts.reactivated} reaktiviert` : null,
    counts.deactivated ? `${counts.deactivated} deaktiviert` : null,
    counts.unassigned ? `${counts.unassigned} ohne Klasse` : null,
  ].filter(Boolean)

  return `${label}: ${parts.length > 0 ? parts.join(', ') : 'keine Änderungen'}`
}

export function LastSyncCard({
  lastSyncAt,
  lastSyncStatus,
  lastSyncSummary,
  syncEnabled,
}: {
  lastSyncAt: string | null
  lastSyncStatus: string | null
  lastSyncSummary: unknown
  syncEnabled: boolean
}) {
  const summary = (lastSyncSummary ?? {}) as SyncSummary
  const meta = STATUS_META[lastSyncStatus ?? ''] ?? {
    label: lastSyncStatus ?? 'Unbekannt',
    icon: Clock,
    variant: 'outline' as const,
  }
  const Icon = meta.icon

  const lines = [
    formatCounts('Lehrkräfte', summary.teachers),
    formatCounts('Klassen', summary.classesStudents?.classes ?? summary.classes),
    formatCounts('Schüler', summary.classesStudents?.students ?? summary.students),
  ].filter((line): line is string => Boolean(line))

  const issueCount =
    (summary.teachers?.issues?.length ?? 0) +
    (summary.classesStudents?.issues?.length ?? 0) +
    (summary.issues?.length ?? 0)

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex flex-wrap items-center gap-2">
          <Icon className="h-4 w-4" />
          Letzte Synchronisierung
          <Badge variant={meta.variant}>{meta.label}</Badge>
          {!syncEnabled && (
            <Badge variant="outline" title="Automatische Synchronisierung ist deaktiviert">
              automatisch aus
            </Badge>
          )}
        </CardTitle>
        <CardDescription>
          {lastSyncAt
            ? new Date(lastSyncAt).toLocaleString('de-AT', {
                dateStyle: 'full',
                timeStyle: 'short',
              })
            : 'Es wurde noch keine Synchronisierung ausgeführt.'}
        </CardDescription>
      </CardHeader>

      {(lines.length > 0 ||
        issueCount > 0 ||
        Boolean(summary.reason) ||
        Boolean(summary.errors?.length)) && (
        <CardContent className="space-y-2 text-sm">
          {summary.reason ? <p className="text-muted-foreground">{summary.reason}</p> : null}

          {lines.map(line => (
            <p key={line}>{line}</p>
          ))}

          {issueCount > 0 ? (
            <p className="text-muted-foreground">{issueCount} Problem(e) erfasst.</p>
          ) : null}

          {summary.errors?.length ? (
            <ul className="text-destructive space-y-1">
              {summary.errors.map(error => (
                <li key={error}>{error}</li>
              ))}
            </ul>
          ) : null}
        </CardContent>
      )}
    </Card>
  )
}
