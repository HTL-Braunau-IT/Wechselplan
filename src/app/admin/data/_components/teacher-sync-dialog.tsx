'use client'

import { useCallback, useMemo, useState } from 'react'
import { Tabs, TabsContent, TabsList } from '@/components/ui/tabs'
import { SyncDialogShell, SyncSummaryAlert } from '@/components/sync/sync-dialog-shell'
import {
  AdoptBadge,
  ChangeBadges,
  CountTabTrigger,
  EmptyState,
  IssuesTable,
  Mono,
  SyncSelectionTable,
} from '@/components/sync/sync-primitives'
import {
  checkedKeys,
  checkedNumericKeys,
  selectAll,
  useSyncPreview,
} from '@/components/sync/use-sync-preview'
import type { TeacherSyncDiff, TeacherSyncSummary } from '@/lib/teacher-sync'

type Bucket = 'create' | 'update' | 'reactivate' | 'deactivate'

interface TeacherSyncDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onCompleted: () => void
}

export function TeacherSyncDialog({ open, onOpenChange, onCompleted }: TeacherSyncDialogProps) {
  // Null means "not chosen yet", so the first render can fall back to the
  // first tab that actually has rows.
  const [activeTab, setActiveTab] = useState<string | null>(null)

  const buildSelection = useCallback(
    (diff: TeacherSyncDiff) => ({
      create: selectAll(diff.toCreate, row => row.entra.oid),
      update: selectAll(diff.toUpdate, row => row.entra.oid),
      reactivate: selectAll(diff.toReactivate, row => row.entra.oid),
      deactivate: selectAll(diff.toDeactivate, row => row.existing.id),
    }),
    [],
  )

  const buildPayload = useCallback(
    (selection: Record<Bucket, Record<string, boolean>>) => ({
      selection: {
        createOids: checkedKeys(selection.create),
        updateOids: checkedKeys(selection.update),
        reactivateOids: checkedKeys(selection.reactivate),
        deactivateTeacherIds: checkedNumericKeys(selection.deactivate),
      },
    }),
    [],
  )

  const describeSummary = useCallback(
    (summary: TeacherSyncSummary) =>
      `Synchronisierung angewendet: ${summary.created} neu, ${summary.updated + summary.adopted} aktualisiert, ` +
      `${summary.deactivated} deaktiviert, ${summary.reactivated} reaktiviert`,
    [],
  )

  const sync = useSyncPreview<TeacherSyncDiff, TeacherSyncSummary, Bucket>({
    queryKey: 'teachers',
    previewUrl: '/api/admin/teachers/sync/preview',
    applyUrl: '/api/admin/teachers/sync/apply',
    buildSelection,
    buildPayload,
    describeSummary,
    onCompleted,
    open,
  })

  const { diff, summary } = sync

  const counts = useMemo(
    () =>
      diff
        ? {
            create: diff.toCreate.length,
            update: diff.toUpdate.length,
            deactivate: diff.toDeactivate.length,
            reactivate: diff.toReactivate.length,
            unchanged: diff.unchanged.length,
            issues: diff.issues.length,
          }
        : null,
    [diff],
  )

  // Open on the first tab that has something in it, so an admin is not greeted
  // by an empty "Erstellen" list when the interesting changes are elsewhere.
  const initialTab = useMemo(() => {
    if (!diff) return 'create'
    if (diff.toCreate.length) return 'create'
    if (diff.toUpdate.length) return 'update'
    if (diff.toDeactivate.length) return 'deactivate'
    if (diff.toReactivate.length) return 'reactivate'
    if (diff.issues.length) return 'issues'
    return 'unchanged'
  }, [diff])


  return (
    <SyncDialogShell
      open={open}
      onOpenChange={onOpenChange}
      title="Lehrkräfte mit Entra synchronisieren"
      description="Vorschau der Änderungen an der lokalen Lehrkräfte-Tabelle. Profilfelder werden immer aus Entra übernommen."
      stage={sync.stage}
      error={sync.error}
      canClose={sync.canClose}
      selectedCount={sync.selectedCount}
      onReload={sync.reload}
      onApply={sync.apply}
      doneContent={
        summary ? (
          <div className="space-y-4">
            <SyncSummaryAlert
              issueCount={summary.issues.length}
              lines={[
                `${summary.created} erstellt`,
                `${summary.updated} aktualisiert, ${summary.adopted} übernommen`,
                `${summary.deactivated} deaktiviert, ${summary.reactivated} reaktiviert`,
                `${summary.unchanged} unverändert`,
              ]}
            />
            {summary.issues.length > 0 && <IssuesTable issues={summary.issues} />}
          </div>
        ) : null
      }
    >
      {diff && counts && (
        <Tabs value={activeTab ?? initialTab} onValueChange={setActiveTab} className="w-full">
          <TabsList className="grid w-full grid-cols-3 sm:grid-cols-6">
            <CountTabTrigger value="create" label="Erstellen" count={counts.create} />
            <CountTabTrigger value="update" label="Aktualisieren" count={counts.update} />
            <CountTabTrigger value="deactivate" label="Deaktivieren" count={counts.deactivate} />
            <CountTabTrigger value="reactivate" label="Reaktivieren" count={counts.reactivate} />
            <CountTabTrigger value="unchanged" label="Unverändert" count={counts.unchanged} />
            <CountTabTrigger value="issues" label="Probleme" count={counts.issues} />
          </TabsList>

          <TabsContent value="create" className="mt-4">
            {diff.toCreate.length === 0 ? (
              <EmptyState text="Keine neuen Lehrkräfte zum Erstellen." />
            ) : (
              <SyncSelectionTable
                rows={diff.toCreate}
                rowKey={row => row.entra.oid}
                selection={sync.selection.create}
                allSelected={sync.isBucketFull(
                  'create',
                  diff.toCreate.map(r => r.entra.oid),
                )}
                onSelectAll={checked =>
                  sync.setBucket(
                    'create',
                    diff.toCreate.map(r => r.entra.oid),
                    checked,
                  )
                }
                onToggle={(key, checked) => sync.toggle('create', key, checked)}
                columns={[
                  { header: 'Name', cell: r => `${r.entra.firstName} ${r.entra.lastName}` },
                  { header: 'Benutzername', cell: r => <Mono>{r.entra.username}</Mono> },
                  { header: 'E-Mail', cell: r => r.entra.email ?? '–' },
                  { header: 'Entra-Objekt-ID', cell: r => <Mono>{r.entra.oid}</Mono> },
                ]}
              />
            )}
          </TabsContent>

          <TabsContent value="update" className="mt-4">
            {diff.toUpdate.length === 0 ? (
              <EmptyState text="Keine bestehenden Lehrkräfte benötigen Aktualisierungen." />
            ) : (
              <SyncSelectionTable
                rows={diff.toUpdate}
                rowKey={row => row.entra.oid}
                selection={sync.selection.update}
                allSelected={sync.isBucketFull(
                  'update',
                  diff.toUpdate.map(r => r.entra.oid),
                )}
                onSelectAll={checked =>
                  sync.setBucket(
                    'update',
                    diff.toUpdate.map(r => r.entra.oid),
                    checked,
                  )
                }
                onToggle={(key, checked) => sync.toggle('update', key, checked)}
                columns={[
                  { header: 'Name', cell: r => `${r.entra.firstName} ${r.entra.lastName}` },
                  { header: 'Benutzername', cell: r => <Mono>{r.entra.username}</Mono> },
                  { header: 'Änderungen', cell: r => <ChangeBadges changes={r.changes} /> },
                  { header: 'Modus', cell: r => <AdoptBadge willAdopt={r.willAdopt} /> },
                ]}
              />
            )}
          </TabsContent>

          <TabsContent value="deactivate" className="mt-4">
            {diff.toDeactivate.length === 0 ? (
              <EmptyState text="Keine Lehrkräfte zum Deaktivieren." />
            ) : (
              <SyncSelectionTable
                rows={diff.toDeactivate}
                rowKey={row => row.existing.id}
                selection={sync.selection.deactivate}
                allSelected={sync.isBucketFull(
                  'deactivate',
                  diff.toDeactivate.map(r => r.existing.id),
                )}
                onSelectAll={checked =>
                  sync.setBucket(
                    'deactivate',
                    diff.toDeactivate.map(r => r.existing.id),
                    checked,
                  )
                }
                onToggle={(key, checked) => sync.toggle('deactivate', key, checked)}
                columns={[
                  { header: 'Name', cell: r => `${r.existing.firstName} ${r.existing.lastName}` },
                  { header: 'Benutzername', cell: r => <Mono>{r.existing.username}</Mono> },
                  { header: 'Entra-Objekt-ID', cell: r => <Mono>{r.existing.externalId}</Mono> },
                ]}
              />
            )}
          </TabsContent>

          <TabsContent value="reactivate" className="mt-4">
            {diff.toReactivate.length === 0 ? (
              <EmptyState text="Keine Lehrkräfte zum Reaktivieren." />
            ) : (
              <SyncSelectionTable
                rows={diff.toReactivate}
                rowKey={row => row.entra.oid}
                selection={sync.selection.reactivate}
                allSelected={sync.isBucketFull(
                  'reactivate',
                  diff.toReactivate.map(r => r.entra.oid),
                )}
                onSelectAll={checked =>
                  sync.setBucket(
                    'reactivate',
                    diff.toReactivate.map(r => r.entra.oid),
                    checked,
                  )
                }
                onToggle={(key, checked) => sync.toggle('reactivate', key, checked)}
                columns={[
                  { header: 'Name', cell: r => `${r.entra.firstName} ${r.entra.lastName}` },
                  { header: 'Benutzername', cell: r => <Mono>{r.entra.username}</Mono> },
                  { header: 'Entra-Objekt-ID', cell: r => <Mono>{r.entra.oid}</Mono> },
                ]}
              />
            )}
          </TabsContent>

          <TabsContent value="unchanged" className="mt-4">
            {diff.unchanged.length === 0 ? (
              <EmptyState text="Alle Lehrkräfte benötigen Änderungen oder einen neuen Eintrag." />
            ) : (
              <SyncSelectionTable
                rows={diff.unchanged}
                rowKey={row => row.existing.id}
                columns={[
                  { header: 'Name', cell: r => `${r.existing.firstName} ${r.existing.lastName}` },
                  { header: 'Benutzername', cell: r => <Mono>{r.existing.username}</Mono> },
                ]}
              />
            )}
          </TabsContent>

          <TabsContent value="issues" className="mt-4">
            {diff.issues.length === 0 ? (
              <EmptyState text="Keine Probleme erkannt." />
            ) : (
              <IssuesTable issues={diff.issues} />
            )}
          </TabsContent>
        </Tabs>
      )}
    </SyncDialogShell>
  )
}
