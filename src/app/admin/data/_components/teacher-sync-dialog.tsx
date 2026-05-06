'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Checkbox } from '@/components/ui/checkbox'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Spinner } from '@/components/ui/spinner'
import { AlertCircle, CheckCircle2, Loader2, RefreshCw } from 'lucide-react'

interface EntraTeacher {
  oid: string
  firstName: string
  lastName: string
  email: string | null
  username: string
  displayName: string | null
}

interface ExistingSummary {
  id: number
  firstName: string
  lastName: string
  email: string | null
  username: string
  externalId: string | null
}

interface TeacherSyncDiff {
  toCreate: Array<{ entra: EntraTeacher }>
  toUpdate: Array<{
    existing: ExistingSummary & { externalSource: string | null; isActive: boolean }
    entra: EntraTeacher
    changes: string[]
    willAdopt: boolean
  }>
  toDeactivate: Array<{ existing: ExistingSummary }>
  toReactivate: Array<{
    existing: ExistingSummary
    entra: EntraTeacher
    changes: string[]
  }>
  unchanged: Array<{ existing: ExistingSummary }>
  issues: Array<{ oid?: string; upn?: string; displayName?: string; reason: string }>
  fetchedAt: string
}

interface TeacherSyncSummary {
  created: number
  updated: number
  adopted: number
  deactivated: number
  reactivated: number
  unchanged: number
  issues: Array<{ oid?: string; upn?: string; displayName?: string; reason: string }>
  completedAt: string
}

interface TeacherSyncDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onCompleted: () => void
}

type DialogStage = 'loading' | 'preview' | 'applying' | 'done' | 'error'

interface TeacherSyncSelectionState {
  create: Record<string, boolean>
  update: Record<string, boolean>
  reactivate: Record<string, boolean>
  deactivate: Record<number, boolean>
}

export function TeacherSyncDialog({ open, onOpenChange, onCompleted }: TeacherSyncDialogProps) {
  const [stage, setStage] = useState<DialogStage>('loading')
  const [diff, setDiff] = useState<TeacherSyncDiff | null>(null)
  const [summary, setSummary] = useState<TeacherSyncSummary | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [activeTab, setActiveTab] = useState<string>('create')
  const [selection, setSelection] = useState<TeacherSyncSelectionState>({
    create: {},
    update: {},
    reactivate: {},
    deactivate: {},
  })

  const loadPreview = useCallback(async () => {
    setStage('loading')
    setError(null)
    try {
      const res = await fetch('/api/admin/teachers/sync/preview', { method: 'POST' })
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string }
        throw new Error(body.error ?? `Vorschau fehlgeschlagen (${res.status})`)
      }
      const data = (await res.json()) as TeacherSyncDiff
      setDiff(data)
      setSelection(buildDefaultSelection(data))
      setStage('preview')
      setActiveTab(pickInitialTab(data))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Vorschau für Lehrkräftesync fehlgeschlagen')
      setStage('error')
    }
  }, [])

  useEffect(() => {
    if (open) {
      setSummary(null)
      void loadPreview()
    }
  }, [open, loadPreview])

  const handleApply = async () => {
    setStage('applying')
    setError(null)
    try {
      const payload = {
        selection: {
          createOids: Object.entries(selection.create)
            .filter(([, checked]) => checked)
            .map(([oid]) => oid),
          updateOids: Object.entries(selection.update)
            .filter(([, checked]) => checked)
            .map(([oid]) => oid),
          reactivateOids: Object.entries(selection.reactivate)
            .filter(([, checked]) => checked)
            .map(([oid]) => oid),
          deactivateTeacherIds: Object.entries(selection.deactivate)
            .filter(([, checked]) => checked)
            .map(([id]) => Number(id)),
        },
      }

      const res = await fetch('/api/admin/teachers/sync/apply', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string }
        throw new Error(body.error ?? `Anwenden fehlgeschlagen (${res.status})`)
      }
      const data = (await res.json()) as TeacherSyncSummary
      setSummary(data)
      setStage('done')
      toast.success(
        `Synchronisierung angewendet: ${data.created} new, ${data.updated + data.adopted} updated, ${data.deactivated} deactivated, ${data.reactivated} reactivated`,
      )
      onCompleted()
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Anwenden der Lehrkräftesync fehlgeschlagen'
      setError(message)
      setStage('error')
      toast.error(message)
    }
  }

  const handleClose = () => {
    if (stage === 'applying') return
    onOpenChange(false)
  }

  const counts = useMemo(() => {
    if (!diff) return null
    return {
      create: diff.toCreate.length,
      update: diff.toUpdate.length,
      deactivate: diff.toDeactivate.length,
      reactivate: diff.toReactivate.length,
      unchanged: diff.unchanged.length,
      issues: diff.issues.length,
    }
  }, [diff])

  const selectedActionCount = useMemo(() => {
    const selectedCreates = Object.values(selection.create).filter(Boolean).length
    const selectedUpdates = Object.values(selection.update).filter(Boolean).length
    const selectedReactivations = Object.values(selection.reactivate).filter(Boolean).length
    const selectedDeactivations = Object.values(selection.deactivate).filter(Boolean).length
    return selectedCreates + selectedUpdates + selectedReactivations + selectedDeactivations
  }, [selection])

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-4xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <RefreshCw className="h-4 w-4" />
            Lehrkräfte mit Entra synchronisieren
          </DialogTitle>
          <DialogDescription>
            Preview the changes that will be made to the local Teacher table,
            then apply them. Profile fields are always overwritten from Entra.
          </DialogDescription>
        </DialogHeader>

        {stage === 'loading' && (
          <div className="flex items-center justify-center gap-2 py-10 text-muted-foreground">
            <Spinner className="h-4 w-4" />
            <span>Vorschau wird aus Microsoft Graph geladen...</span>
          </div>
        )}

        {stage === 'error' && (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertTitle>Synchronisierung fehlgeschlagen</AlertTitle>
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        {stage === 'done' && summary && (
          <div className="space-y-4">
            <Alert>
              <CheckCircle2 className="h-4 w-4" />
              <AlertTitle>Synchronisierung angewendet</AlertTitle>
              <AlertDescription>
                {summary.created} created, {summary.updated} updated,{' '}
                {summary.adopted} adopted, {summary.deactivated} deactivated,{' '}
                {summary.reactivated} reactivated, {summary.unchanged} unchanged.
                {summary.issues.length > 0 ? ` ${summary.issues.length} issue(s) recorded.` : ''}
              </AlertDescription>
            </Alert>
            {summary.issues.length > 0 && <ProblemeTable issues={summary.issues} />}
          </div>
        )}

        {stage === 'preview' && diff && counts && (
          <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
            <TabsList className="grid w-full grid-cols-6">
              <TabTrigger value="create" label="Erstellen" count={counts.create} />
              <TabTrigger value="update" label="Aktualisieren" count={counts.update} />
              <TabTrigger value="deactivate" label="Deaktivieren" count={counts.deactivate} />
              <TabTrigger value="reactivate" label="Reaktivieren" count={counts.reactivate} />
              <TabTrigger value="unchanged" label="Unverändert" count={counts.unchanged} />
              <TabTrigger value="issues" label="Probleme" count={counts.issues} />
            </TabsList>

            <TabsContent value="create" className="mt-4 max-h-[50vh] overflow-y-auto">
              {diff.toCreate.length === 0 ? (
                <EmptyState text="Keine neuen Lehrkräfte zum Erstellen." />
              ) : (
                <EntraTeacherTable
                  rows={diff.toCreate.map(r => r.entra)}
                  selection={selection.create}
                  onToggle={(oid, checked) =>
                    setSelection(prev => ({
                      ...prev,
                      create: { ...prev.create, [oid]: checked },
                    }))
                  }
                />
              )}
            </TabsContent>

            <TabsContent value="update" className="mt-4 max-h-[50vh] overflow-y-auto">
              {diff.toUpdate.length === 0 ? (
                <EmptyState text="Keine bestehenden Lehrkräfte benötigen Aktualisierungen." />
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-14">Sync</TableHead>
                      <TableHead>Name</TableHead>
                      <TableHead>Username</TableHead>
                      <TableHead>Changes</TableHead>
                      <TableHead>Mode</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {diff.toUpdate.map(u => (
                      <TableRow key={u.existing.id}>
                        <TableCell>
                          <Checkbox
                            checked={selection.update[u.entra.oid] ?? true}
                            onCheckedChange={checked =>
                              setSelection(prev => ({
                                ...prev,
                                update: { ...prev.update, [u.entra.oid]: Boolean(checked) },
                              }))
                            }
                          />
                        </TableCell>
                        <TableCell>{u.entra.firstName} {u.entra.lastName}</TableCell>
                        <TableCell className="font-mono text-xs">{u.entra.username}</TableCell>
                        <TableCell>
                          <div className="flex flex-wrap gap-1">
                            {u.changes.length === 0 ? (
                              <span className="text-muted-foreground text-xs">(metadata only)</span>
                            ) : (
                              u.changes.map(c => (
                                <Badge key={c} variant="outline">{c}</Badge>
                              ))
                            )}
                          </div>
                        </TableCell>
                        <TableCell>
                          {u.willAdopt ? <Badge variant="secondary">adopt</Badge> : <Badge variant="outline">update</Badge>}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </TabsContent>

            <TabsContent value="deactivate" className="mt-4 max-h-[50vh] overflow-y-auto">
              {diff.toDeactivate.length === 0 ? (
                <EmptyState text="Keine Lehrkräfte zum Deaktivieren." />
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-14">Sync</TableHead>
                      <TableHead>Name</TableHead>
                      <TableHead>Username</TableHead>
                      <TableHead>Entra oid</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {diff.toDeactivate.map(d => (
                      <TableRow key={d.existing.id}>
                        <TableCell>
                          <Checkbox
                            checked={selection.deactivate[d.existing.id] ?? true}
                            onCheckedChange={checked =>
                              setSelection(prev => ({
                                ...prev,
                                deactivate: { ...prev.deactivate, [d.existing.id]: Boolean(checked) },
                              }))
                            }
                          />
                        </TableCell>
                        <TableCell>{d.existing.firstName} {d.existing.lastName}</TableCell>
                        <TableCell className="font-mono text-xs">{d.existing.username}</TableCell>
                        <TableCell className="font-mono text-xs">{d.existing.externalId ?? '-'}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </TabsContent>

            <TabsContent value="reactivate" className="mt-4 max-h-[50vh] overflow-y-auto">
              {diff.toReactivate.length === 0 ? (
                <EmptyState text="Keine Lehrkräfte zum Reaktivieren." />
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-14">Sync</TableHead>
                      <TableHead>Name</TableHead>
                      <TableHead>Username</TableHead>
                      <TableHead>Entra oid</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {diff.toReactivate.map(r => (
                      <TableRow key={r.existing.id}>
                        <TableCell>
                          <Checkbox
                            checked={selection.reactivate[r.entra.oid] ?? true}
                            onCheckedChange={checked =>
                              setSelection(prev => ({
                                ...prev,
                                reactivate: { ...prev.reactivate, [r.entra.oid]: Boolean(checked) },
                              }))
                            }
                          />
                        </TableCell>
                        <TableCell>{r.entra.firstName} {r.entra.lastName}</TableCell>
                        <TableCell className="font-mono text-xs">{r.entra.username}</TableCell>
                        <TableCell className="font-mono text-xs">{r.entra.oid}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </TabsContent>

            <TabsContent value="unchanged" className="mt-4 max-h-[50vh] overflow-y-auto">
              {diff.unchanged.length === 0 ? (
                <EmptyState text="Every teacher either needs changes or a new entry." />
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Name</TableHead>
                      <TableHead>Username</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {diff.unchanged.map(u => (
                      <TableRow key={u.existing.id}>
                        <TableCell>{u.existing.firstName} {u.existing.lastName}</TableCell>
                        <TableCell className="font-mono text-xs">{u.existing.username}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </TabsContent>

            <TabsContent value="issues" className="mt-4 max-h-[50vh] overflow-y-auto">
              {diff.issues.length === 0 ? (
                <EmptyState text="Keine Probleme erkannt." />
              ) : (
                <ProblemeTable issues={diff.issues} />
              )}
            </TabsContent>
          </Tabs>
        )}

        <DialogFooter className="gap-2">
          {stage === 'preview' && (
            <>
              <Button variant="outline" onClick={() => void loadPreview()}>
                Neu laden
              </Button>
              <span className="mr-auto text-xs text-muted-foreground">
                Für Anwenden ausgewählt: {selectedActionCount}
              </span>
              <Button variant="ghost" onClick={handleClose}>
                Abbrechen
              </Button>
              <Button onClick={handleApply} disabled={!diff || selectedActionCount === 0}>
                Anwenden
              </Button>
            </>
          )}
          {stage === 'applying' && (
            <Button disabled>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Applying...
            </Button>
          )}
          {(stage === 'done' || stage === 'error') && (
            <Button onClick={handleClose}>Schließen</Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function pickInitialTab(diff: TeacherSyncDiff): string {
  if (diff.toCreate.length > 0) return 'create'
  if (diff.toUpdate.length > 0) return 'update'
  if (diff.toDeactivate.length > 0) return 'deactivate'
  if (diff.toReactivate.length > 0) return 'reactivate'
  if (diff.issues.length > 0) return 'issues'
  return 'unchanged'
}

function isNoop(diff: TeacherSyncDiff): boolean {
  return (
    diff.toCreate.length === 0 &&
    diff.toUpdate.length === 0 &&
    diff.toDeactivate.length === 0 &&
    diff.toReactivate.length === 0
  )
}

function buildDefaultSelection(diff: TeacherSyncDiff): TeacherSyncSelectionState {
  return {
    create: Object.fromEntries(diff.toCreate.map(row => [row.entra.oid, true])),
    update: Object.fromEntries(diff.toUpdate.map(row => [row.entra.oid, true])),
    reactivate: Object.fromEntries(diff.toReactivate.map(row => [row.entra.oid, true])),
    deactivate: Object.fromEntries(diff.toDeactivate.map(row => [row.existing.id, true])),
  }
}

function TabTrigger({ value, label, count }: { value: string; label: string; count: number }) {
  return (
    <TabsTrigger value={value} className="gap-1.5">
      <span>{label}</span>
      <Badge variant={count > 0 ? 'default' : 'outline'} className="px-1.5 py-0 text-xs">
        {count}
      </Badge>
    </TabsTrigger>
  )
}

function EmptyState({ text }: { text: string }) {
  return <p className="py-6 text-center text-sm text-muted-foreground">{text}</p>
}

function EntraTeacherTable({
  rows,
  selection,
  onToggle,
}: {
  rows: EntraTeacher[]
  selection: Record<string, boolean>
  onToggle: (oid: string, checked: boolean) => void
}) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead className="w-14">Sync</TableHead>
          <TableHead>Name</TableHead>
          <TableHead>Username</TableHead>
          <TableHead>Email</TableHead>
          <TableHead>Entra oid</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map(row => (
          <TableRow key={row.oid}>
            <TableCell>
              <Checkbox
                checked={selection[row.oid] ?? true}
                onCheckedChange={checked => onToggle(row.oid, Boolean(checked))}
              />
            </TableCell>
            <TableCell>{row.firstName} {row.lastName}</TableCell>
            <TableCell className="font-mono text-xs">{row.username}</TableCell>
            <TableCell className="text-xs">{row.email ?? '-'}</TableCell>
            <TableCell className="font-mono text-xs">{row.oid}</TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  )
}

function ProblemeTable({
  issues,
}: {
  issues: Array<{ oid?: string; upn?: string; displayName?: string; reason: string }>
}) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Entra oid</TableHead>
          <TableHead>UPN</TableHead>
          <TableHead>Display name</TableHead>
          <TableHead>Reason</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {issues.map((issue, idx) => (
          <TableRow key={`${issue.oid ?? 'noid'}-${idx}`}>
            <TableCell className="font-mono text-xs">{issue.oid ?? '-'}</TableCell>
            <TableCell className="font-mono text-xs">{issue.upn ?? '-'}</TableCell>
            <TableCell>{issue.displayName ?? '-'}</TableCell>
            <TableCell>{issue.reason}</TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  )
}
