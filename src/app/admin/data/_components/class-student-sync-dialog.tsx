'use client'

import { useCallback, useMemo, useState } from 'react'
import { Tabs, TabsContent, TabsList } from '@/components/ui/tabs'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { AlertCircle } from 'lucide-react'
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
import { useSchoolYear } from '@/contexts/school-year-context'
import type { ClassStudentSyncDiff, ClassStudentSyncSummary } from '@/lib/class-student-sync'

type Bucket =
  | 'classCreate'
  | 'classUpdate'
  | 'classReactivate'
  | 'classDeactivate'
  | 'studentCreate'
  | 'studentUpdate'
  | 'studentReactivate'
  | 'studentDeactivate'
  | 'studentUnassigned'

interface ClassStudentSyncDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onCompleted: () => void
}

export function ClassStudentSyncDialog({
  open,
  onOpenChange,
  onCompleted,
}: ClassStudentSyncDialogProps) {
  const { selectedYear } = useSchoolYear()
  const [outerTab, setOuterTab] = useState<string | null>(null)
  const [classTab, setClassTab] = useState('create')
  const [studentTab, setStudentTab] = useState('create')

  const buildSelection = useCallback(
    (diff: ClassStudentSyncDiff) => ({
      classCreate: selectAll(diff.classes.toCreate, r => r.group.id),
      classUpdate: selectAll(diff.classes.toUpdate, r => r.group.id),
      classReactivate: selectAll(diff.classes.toReactivate, r => r.group.id),
      classDeactivate: selectAll(diff.classes.toDeactivate, r => r.existing.id),
      studentCreate: selectAll(diff.students.toCreate, r => r.entra.oid),
      studentUpdate: selectAll(diff.students.toUpdate, r => r.entra.oid),
      studentReactivate: selectAll(diff.students.toReactivate, r => r.entra.oid),
      studentDeactivate: selectAll(diff.students.toDeactivate, r => r.existing.id),
      studentUnassigned: selectAll(diff.students.toMarkUnassigned, r => r.entra.oid),
    }),
    [],
  )

  const buildPayload = useCallback(
    (selection: Record<Bucket, Record<string, boolean>>) => ({
      selection: {
        classes: {
          createGroupIds: checkedKeys(selection.classCreate),
          updateGroupIds: checkedKeys(selection.classUpdate),
          reactivateGroupIds: checkedKeys(selection.classReactivate),
          deactivateClassIds: checkedNumericKeys(selection.classDeactivate),
        },
        students: {
          createOids: checkedKeys(selection.studentCreate),
          updateOids: checkedKeys(selection.studentUpdate),
          reactivateOids: checkedKeys(selection.studentReactivate),
          unassignedOids: checkedKeys(selection.studentUnassigned),
          deactivateStudentIds: checkedNumericKeys(selection.studentDeactivate),
        },
      },
      schoolYearId: selectedYear?.id,
    }),
    [selectedYear?.id],
  )

  const describeSummary = useCallback(
    (summary: ClassStudentSyncSummary) =>
      `Synchronisierung angewendet: ${summary.classes.created} Klassen neu, ` +
      `${summary.students.created} Schüler neu, ${summary.students.deactivated} deaktiviert`,
    [],
  )

  const sync = useSyncPreview<ClassStudentSyncDiff, ClassStudentSyncSummary, Bucket>({
    queryKey: 'classes-students',
    previewUrl: '/api/admin/class-sync/preview',
    applyUrl: '/api/admin/class-sync/apply',
    buildSelection,
    buildPayload,
    describeSummary,
    onCompleted,
    open,
  })

  const { diff, summary } = sync

  const counts = useMemo(() => {
    if (!diff) return null
    const classes = diff.classes
    const students = diff.students
    return {
      classes: {
        create: classes.toCreate.length,
        update: classes.toUpdate.length,
        deactivate: classes.toDeactivate.length,
        reactivate: classes.toReactivate.length,
        unchanged: classes.unchanged.length,
        total:
          classes.toCreate.length +
          classes.toUpdate.length +
          classes.toDeactivate.length +
          classes.toReactivate.length,
      },
      students: {
        create: students.toCreate.length,
        update: students.toUpdate.length,
        deactivate: students.toDeactivate.length,
        reactivate: students.toReactivate.length,
        unassigned: students.toMarkUnassigned.length,
        unchanged: students.unchanged.length,
        total:
          students.toCreate.length +
          students.toUpdate.length +
          students.toDeactivate.length +
          students.toReactivate.length +
          students.toMarkUnassigned.length,
      },
      issues: diff.issues.length,
    }
  }, [diff])

  const initialOuterTab = useMemo(() => {
    if (!counts) return 'classes'
    if (counts.classes.total > 0) return 'classes'
    if (counts.students.total > 0) return 'students'
    if (counts.issues > 0) return 'issues'
    return 'classes'
  }, [counts])

  /** Selects/clears every bucket, so an admin need not click through 300 rows. */
  const keysOf = <T,>(rows: T[], key: (row: T) => string | number) => rows.map(key)

  return (
    <SyncDialogShell
      open={open}
      onOpenChange={onOpenChange}
      title="Klassen und Schüler mit Entra synchronisieren"
      description="Vorschau der Änderungen an Klassen und Schülern. Profilfelder werden immer aus Entra übernommen; entfernte Personen werden deaktiviert, nicht gelöscht."
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
                `Klassen: ${summary.classes.created} erstellt, ${summary.classes.updated} aktualisiert, ` +
                  `${summary.classes.deactivated} deaktiviert, ${summary.classes.reactivated} reaktiviert`,
                `Schüler: ${summary.students.created} erstellt, ${summary.students.updated} aktualisiert, ` +
                  `${summary.students.deactivated} deaktiviert, ${summary.students.reactivated} reaktiviert`,
                `${summary.students.unassigned} Schüler ohne eindeutige Klasse`,
              ]}
            />
            {summary.issues.length > 0 && <IssuesTable issues={summary.issues} />}
          </div>
        ) : null
      }
    >
      {diff && counts && (
        <div className="space-y-4">
          {diff.unresolvedGroupIds.length > 0 && (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertTitle>Gruppen nicht erreichbar</AlertTitle>
              <AlertDescription>
                {diff.unresolvedGroupIds.length} konfigurierte Entra-Gruppe(n) konnten nicht gelesen
                werden. Betroffene Klassen erscheinen dadurch als &bdquo;zu deaktivieren&ldquo;.
                Bitte vor dem Anwenden prüfen.
              </AlertDescription>
            </Alert>
          )}

          <p className="text-muted-foreground text-xs">
            Schuljahr: {diff.schoolYearLabel} · {diff.debug.mappedGroupCount} Gruppen ·{' '}
            {diff.debug.mappedUserCount} Personen aus Graph
          </p>

          <Tabs value={outerTab ?? initialOuterTab} onValueChange={setOuterTab} className="w-full">
            <TabsList className="grid w-full grid-cols-3">
              <CountTabTrigger value="classes" label="Klassen" count={counts.classes.total} />
              <CountTabTrigger value="students" label="Schüler" count={counts.students.total} />
              <CountTabTrigger value="issues" label="Probleme" count={counts.issues} />
            </TabsList>

            <TabsContent value="classes" className="mt-4">
              <Tabs value={classTab} onValueChange={setClassTab}>
                <TabsList className="grid w-full grid-cols-5">
                  <CountTabTrigger value="create" label="Erstellen" count={counts.classes.create} />
                  <CountTabTrigger
                    value="update"
                    label="Aktualisieren"
                    count={counts.classes.update}
                  />
                  <CountTabTrigger
                    value="deactivate"
                    label="Deaktivieren"
                    count={counts.classes.deactivate}
                  />
                  <CountTabTrigger
                    value="reactivate"
                    label="Reaktivieren"
                    count={counts.classes.reactivate}
                  />
                  <CountTabTrigger
                    value="unchanged"
                    label="Unverändert"
                    count={counts.classes.unchanged}
                  />
                </TabsList>

                <TabsContent value="create" className="mt-4">
                  {counts.classes.create === 0 ? (
                    <EmptyState text="Keine neuen Klassen zum Erstellen." />
                  ) : (
                    <SyncSelectionTable
                      rows={diff.classes.toCreate}
                      rowKey={r => r.group.id}
                      selection={sync.selection.classCreate}
                      allSelected={sync.isBucketFull(
                        'classCreate',
                        keysOf(diff.classes.toCreate, r => r.group.id),
                      )}
                      onSelectAll={checked =>
                        sync.setBucket(
                          'classCreate',
                          keysOf(diff.classes.toCreate, r => r.group.id),
                          checked,
                        )
                      }
                      onToggle={(key, checked) => sync.toggle('classCreate', key, checked)}
                      columns={[
                        { header: 'Name', cell: r => r.group.displayName },
                        { header: 'Beschreibung', cell: r => r.group.description ?? '–' },
                        { header: 'Entra-Gruppen-ID', cell: r => <Mono>{r.group.id}</Mono> },
                      ]}
                    />
                  )}
                </TabsContent>

                <TabsContent value="update" className="mt-4">
                  {counts.classes.update === 0 ? (
                    <EmptyState text="Keine bestehenden Klassen benötigen Aktualisierungen." />
                  ) : (
                    <SyncSelectionTable
                      rows={diff.classes.toUpdate}
                      rowKey={r => r.group.id}
                      selection={sync.selection.classUpdate}
                      allSelected={sync.isBucketFull(
                        'classUpdate',
                        keysOf(diff.classes.toUpdate, r => r.group.id),
                      )}
                      onSelectAll={checked =>
                        sync.setBucket(
                          'classUpdate',
                          keysOf(diff.classes.toUpdate, r => r.group.id),
                          checked,
                        )
                      }
                      onToggle={(key, checked) => sync.toggle('classUpdate', key, checked)}
                      columns={[
                        { header: 'Bisher', cell: r => r.existing.name },
                        { header: 'Neu', cell: r => r.group.displayName },
                        { header: 'Änderungen', cell: r => <ChangeBadges changes={r.changes} /> },
                        { header: 'Modus', cell: r => <AdoptBadge willAdopt={r.willAdopt} /> },
                      ]}
                    />
                  )}
                </TabsContent>

                <TabsContent value="deactivate" className="mt-4">
                  {counts.classes.deactivate === 0 ? (
                    <EmptyState text="Keine Klassen zum Deaktivieren." />
                  ) : (
                    <SyncSelectionTable
                      rows={diff.classes.toDeactivate}
                      rowKey={r => r.existing.id}
                      selection={sync.selection.classDeactivate}
                      allSelected={sync.isBucketFull(
                        'classDeactivate',
                        keysOf(diff.classes.toDeactivate, r => r.existing.id),
                      )}
                      onSelectAll={checked =>
                        sync.setBucket(
                          'classDeactivate',
                          keysOf(diff.classes.toDeactivate, r => r.existing.id),
                          checked,
                        )
                      }
                      onToggle={(key, checked) => sync.toggle('classDeactivate', key, checked)}
                      columns={[
                        { header: 'Name', cell: r => r.existing.name },
                        {
                          header: 'Entra-Gruppen-ID',
                          cell: r => <Mono>{r.existing.externalId}</Mono>,
                        },
                      ]}
                    />
                  )}
                </TabsContent>

                <TabsContent value="reactivate" className="mt-4">
                  {counts.classes.reactivate === 0 ? (
                    <EmptyState text="Keine Klassen zum Reaktivieren." />
                  ) : (
                    <SyncSelectionTable
                      rows={diff.classes.toReactivate}
                      rowKey={r => r.group.id}
                      selection={sync.selection.classReactivate}
                      allSelected={sync.isBucketFull(
                        'classReactivate',
                        keysOf(diff.classes.toReactivate, r => r.group.id),
                      )}
                      onSelectAll={checked =>
                        sync.setBucket(
                          'classReactivate',
                          keysOf(diff.classes.toReactivate, r => r.group.id),
                          checked,
                        )
                      }
                      onToggle={(key, checked) => sync.toggle('classReactivate', key, checked)}
                      columns={[
                        { header: 'Name', cell: r => r.group.displayName },
                        { header: 'Entra-Gruppen-ID', cell: r => <Mono>{r.group.id}</Mono> },
                      ]}
                    />
                  )}
                </TabsContent>

                <TabsContent value="unchanged" className="mt-4">
                  {counts.classes.unchanged === 0 ? (
                    <EmptyState text="Keine unveränderten Klassen." />
                  ) : (
                    <SyncSelectionTable
                      rows={diff.classes.unchanged}
                      rowKey={r => r.existing.id}
                      columns={[
                        { header: 'Name', cell: r => r.existing.name },
                        {
                          header: 'Entra-Gruppen-ID',
                          cell: r => <Mono>{r.existing.externalId}</Mono>,
                        },
                      ]}
                    />
                  )}
                </TabsContent>
              </Tabs>
            </TabsContent>

            <TabsContent value="students" className="mt-4">
              <Tabs value={studentTab} onValueChange={setStudentTab}>
                <TabsList className="grid w-full grid-cols-3 sm:grid-cols-6">
                  <CountTabTrigger
                    value="create"
                    label="Erstellen"
                    count={counts.students.create}
                  />
                  <CountTabTrigger
                    value="update"
                    label="Aktualisieren"
                    count={counts.students.update}
                  />
                  <CountTabTrigger
                    value="deactivate"
                    label="Deaktivieren"
                    count={counts.students.deactivate}
                  />
                  <CountTabTrigger
                    value="reactivate"
                    label="Reaktivieren"
                    count={counts.students.reactivate}
                  />
                  <CountTabTrigger
                    value="unassigned"
                    label="Ohne Klasse"
                    count={counts.students.unassigned}
                  />
                  <CountTabTrigger
                    value="unchanged"
                    label="Unverändert"
                    count={counts.students.unchanged}
                  />
                </TabsList>

                <TabsContent value="create" className="mt-4">
                  {counts.students.create === 0 ? (
                    <EmptyState text="Keine neuen Schüler zum Erstellen." />
                  ) : (
                    <SyncSelectionTable
                      rows={diff.students.toCreate}
                      rowKey={r => r.entra.oid}
                      selection={sync.selection.studentCreate}
                      allSelected={sync.isBucketFull(
                        'studentCreate',
                        keysOf(diff.students.toCreate, r => r.entra.oid),
                      )}
                      onSelectAll={checked =>
                        sync.setBucket(
                          'studentCreate',
                          keysOf(diff.students.toCreate, r => r.entra.oid),
                          checked,
                        )
                      }
                      onToggle={(key, checked) => sync.toggle('studentCreate', key, checked)}
                      columns={[
                        { header: 'Klasse', cell: r => r.target.groupDisplayName },
                        { header: 'Name', cell: r => `${r.entra.firstName} ${r.entra.lastName}` },
                        { header: 'Benutzername', cell: r => <Mono>{r.entra.username}</Mono> },
                        { header: 'E-Mail', cell: r => r.entra.email ?? '–' },
                      ]}
                    />
                  )}
                </TabsContent>

                <TabsContent value="update" className="mt-4">
                  {counts.students.update === 0 ? (
                    <EmptyState text="Keine bestehenden Schüler benötigen Aktualisierungen." />
                  ) : (
                    <SyncSelectionTable
                      rows={diff.students.toUpdate}
                      rowKey={r => r.entra.oid}
                      selection={sync.selection.studentUpdate}
                      allSelected={sync.isBucketFull(
                        'studentUpdate',
                        keysOf(diff.students.toUpdate, r => r.entra.oid),
                      )}
                      onSelectAll={checked =>
                        sync.setBucket(
                          'studentUpdate',
                          keysOf(diff.students.toUpdate, r => r.entra.oid),
                          checked,
                        )
                      }
                      onToggle={(key, checked) => sync.toggle('studentUpdate', key, checked)}
                      columns={[
                        { header: 'Name', cell: r => `${r.entra.firstName} ${r.entra.lastName}` },
                        { header: 'Benutzername', cell: r => <Mono>{r.entra.username}</Mono> },
                        {
                          header: 'Klassenwechsel',
                          cell: r =>
                            r.classChange ? (
                              <span className="text-xs">
                                {r.classChange.fromClassName ?? '–'} →{' '}
                                {r.classChange.toGroupDisplayName}
                              </span>
                            ) : (
                              <span className="text-muted-foreground text-xs">–</span>
                            ),
                        },
                        { header: 'Änderungen', cell: r => <ChangeBadges changes={r.changes} /> },
                        { header: 'Modus', cell: r => <AdoptBadge willAdopt={r.willAdopt} /> },
                      ]}
                    />
                  )}
                </TabsContent>

                <TabsContent value="deactivate" className="mt-4">
                  {counts.students.deactivate === 0 ? (
                    <EmptyState text="Keine Schüler zum Deaktivieren." />
                  ) : (
                    <SyncSelectionTable
                      rows={diff.students.toDeactivate}
                      rowKey={r => r.existing.id}
                      selection={sync.selection.studentDeactivate}
                      allSelected={sync.isBucketFull(
                        'studentDeactivate',
                        keysOf(diff.students.toDeactivate, r => r.existing.id),
                      )}
                      onSelectAll={checked =>
                        sync.setBucket(
                          'studentDeactivate',
                          keysOf(diff.students.toDeactivate, r => r.existing.id),
                          checked,
                        )
                      }
                      onToggle={(key, checked) => sync.toggle('studentDeactivate', key, checked)}
                      columns={[
                        {
                          header: 'Name',
                          cell: r => `${r.existing.firstName} ${r.existing.lastName}`,
                        },
                        { header: 'Benutzername', cell: r => <Mono>{r.existing.username}</Mono> },
                        { header: 'Klasse', cell: r => r.existing.className ?? '–' },
                      ]}
                    />
                  )}
                </TabsContent>

                <TabsContent value="reactivate" className="mt-4">
                  {counts.students.reactivate === 0 ? (
                    <EmptyState text="Keine Schüler zum Reaktivieren." />
                  ) : (
                    <SyncSelectionTable
                      rows={diff.students.toReactivate}
                      rowKey={r => r.entra.oid}
                      selection={sync.selection.studentReactivate}
                      allSelected={sync.isBucketFull(
                        'studentReactivate',
                        keysOf(diff.students.toReactivate, r => r.entra.oid),
                      )}
                      onSelectAll={checked =>
                        sync.setBucket(
                          'studentReactivate',
                          keysOf(diff.students.toReactivate, r => r.entra.oid),
                          checked,
                        )
                      }
                      onToggle={(key, checked) => sync.toggle('studentReactivate', key, checked)}
                      columns={[
                        { header: 'Klasse', cell: r => r.target.groupDisplayName },
                        { header: 'Name', cell: r => `${r.entra.firstName} ${r.entra.lastName}` },
                        { header: 'Benutzername', cell: r => <Mono>{r.entra.username}</Mono> },
                      ]}
                    />
                  )}
                </TabsContent>

                <TabsContent value="unassigned" className="mt-4">
                  {counts.students.unassigned === 0 ? (
                    <EmptyState text="Alle Schüler lassen sich eindeutig einer Klasse zuordnen." />
                  ) : (
                    <>
                      <Alert className="mb-3">
                        <AlertCircle className="h-4 w-4" />
                        <AlertTitle>Mehrdeutige Klassenzugehörigkeit</AlertTitle>
                        <AlertDescription>
                          Diese Schüler sind in mehreren synchronisierten Klassengruppen. Sie werden
                          angelegt bzw. beibehalten, aber ohne Klasse und mit dem Sync-Status
                          &bdquo;keine Klasse&ldquo;. Die Zugehörigkeit muss in Entra bereinigt
                          werden.
                        </AlertDescription>
                      </Alert>
                      <SyncSelectionTable
                        rows={diff.students.toMarkUnassigned}
                        rowKey={r => r.entra.oid}
                        selection={sync.selection.studentUnassigned}
                        allSelected={sync.isBucketFull(
                          'studentUnassigned',
                          keysOf(diff.students.toMarkUnassigned, r => r.entra.oid),
                        )}
                        onSelectAll={checked =>
                          sync.setBucket(
                            'studentUnassigned',
                            keysOf(diff.students.toMarkUnassigned, r => r.entra.oid),
                            checked,
                          )
                        }
                        onToggle={(key, checked) => sync.toggle('studentUnassigned', key, checked)}
                        columns={[
                          { header: 'Name', cell: r => `${r.entra.firstName} ${r.entra.lastName}` },
                          { header: 'Benutzername', cell: r => <Mono>{r.entra.username}</Mono> },
                          {
                            header: 'Gruppen',
                            cell: r => (
                              <div className="flex flex-wrap gap-1">
                                {r.groupDisplayNames.map(name => (
                                  <Badge key={name} variant="outline">
                                    {name}
                                  </Badge>
                                ))}
                              </div>
                            ),
                          },
                        ]}
                      />
                    </>
                  )}
                </TabsContent>

                <TabsContent value="unchanged" className="mt-4">
                  {counts.students.unchanged === 0 ? (
                    <EmptyState text="Keine unveränderten Schüler." />
                  ) : (
                    <SyncSelectionTable
                      rows={diff.students.unchanged}
                      rowKey={r => r.existing.id}
                      columns={[
                        {
                          header: 'Name',
                          cell: r => `${r.existing.firstName} ${r.existing.lastName}`,
                        },
                        { header: 'Benutzername', cell: r => <Mono>{r.existing.username}</Mono> },
                        { header: 'Klasse', cell: r => r.existing.className ?? '–' },
                      ]}
                    />
                  )}
                </TabsContent>
              </Tabs>
            </TabsContent>

            <TabsContent value="issues" className="mt-4">
              {counts.issues === 0 ? (
                <EmptyState text="Keine Probleme erkannt." />
              ) : (
                <IssuesTable issues={diff.issues} />
              )}
            </TabsContent>
          </Tabs>
        </div>
      )}
    </SyncDialogShell>
  )
}
