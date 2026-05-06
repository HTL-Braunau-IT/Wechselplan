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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
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
import { useSchoolYear } from '@/contexts/school-year-context'

/* ---------- Types mirroring lib/class-student-sync.ts ------------------------------- */

interface EntraUser {
  oid: string
  firstName: string
  lastName: string
  email: string | null
  username: string
  displayName: string | null
}

interface EntraClassGroup {
  id: string
  displayName: string
  description: string | null
}

interface ClassRowSummary {
  id: number
  name: string
  description: string | null
  externalId: string | null
  externalSource: string | null
  isActive: boolean
}

interface StudentRowSummary {
  id: number
  firstName: string
  lastName: string
  username: string
  email: string | null
  classId: number | null
  className: string | null
  externalId: string | null
  externalSource: string | null
  isActive: boolean
  syncStatus: string | null
}

interface StudentTargetClass {
  groupId: string
  groupDisplayName: string
}

interface ClassStudentSyncDiff {
  classes: {
    toCreate: { group: EntraClassGroup }[]
    toUpdate: {
      existing: ClassRowSummary
      group: EntraClassGroup
      changes: string[]
      willAdopt: boolean
    }[]
    toDeactivate: { existing: ClassRowSummary }[]
    toReactivate: {
      existing: ClassRowSummary
      group: EntraClassGroup
      changes: string[]
    }[]
    unchanged: { existing: ClassRowSummary }[]
  }
  students: {
    toCreate: { entra: EntraUser; target: StudentTargetClass }[]
    toUpdate: {
      existing: StudentRowSummary
      entra: EntraUser
      changes: string[]
      willAdopt: boolean
      target: StudentTargetClass
      classChange: {
        fromClassName: string | null
        toGroupDisplayName: string
      } | null
    }[]
    toDeactivate: { existing: StudentRowSummary }[]
    toReactivate: {
      existing: StudentRowSummary
      entra: EntraUser
      target: StudentTargetClass
      changes: string[]
    }[]
    unchanged: { existing: StudentRowSummary }[]
  }
  issues: Array<{ oid?: string; upn?: string; displayName?: string; reason: string }>
  schoolYearId: number
  schoolYearLabel: string
  fetchedAt: string
  syncedClassGroupIds: string[]
  unresolvedGroupIds: string[]
  debug: {
    resolvedGroupCount: number
    mappedGroupCount: number
    fetchedMemberCount: number
    mappedUserCount: number
    classRowCount: number
    studentRowCount: number
  }
}

interface ClassStudentSyncSummary {
  classes: {
    created: number
    updated: number
    adopted: number
    deactivated: number
    reactivated: number
    unchanged: number
  }
  students: {
    created: number
    updated: number
    adopted: number
    deactivated: number
    reactivated: number
    unchanged: number
  }
  issues: Array<{ oid?: string; upn?: string; displayName?: string; reason: string }>
  schoolYearId: number
  completedAt: string
}

interface ClassStudentSyncDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onCompleted: () => void
}

type DialogStage = 'loading' | 'preview' | 'applying' | 'done' | 'error'

interface SelectionState {
  classCreate: Record<string, boolean>
  classUpdate: Record<string, boolean>
  classReactivate: Record<string, boolean>
  classDeactivate: Record<number, boolean>
  studentCreate: Record<string, boolean>
  studentUpdate: Record<string, boolean>
  studentReactivate: Record<string, boolean>
  studentDeactivate: Record<number, boolean>
}

/* ---------- Dialog -------------------------------------------------------------------- */

export function ClassStudentSyncDialog({
  open,
  onOpenChange,
  onCompleted,
}: ClassStudentSyncDialogProps) {
  const { selectedYear, years } = useSchoolYear()
  const [stage, setStage] = useState<DialogStage>('loading')
  const [diff, setDiff] = useState<ClassStudentSyncDiff | null>(null)
  const [summary, setSummary] = useState<ClassStudentSyncSummary | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [schoolYearId, setSchoolYearId] = useState<number | null>(null)
  const [outerTab, setOuterTab] = useState<'classes' | 'students' | 'issues'>('classes')
  const [classTab, setClassTab] = useState<string>('create')
  const [studentTab, setStudentTab] = useState<string>('create')
  const [selection, setSelection] = useState<SelectionState>(emptySelection())

  const loadPreview = useCallback(
    async (year: number | null) => {
      setStage('loading')
      setError(null)
      try {
        const res = await fetch('/api/admin/class-sync/preview', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(year != null ? { schoolYearId: year } : {}),
        })
        if (!res.ok) {
          const body = (await res.json().catch(() => ({}))) as { error?: string }
          throw new Error(body.error ?? `Preview failed (${res.status})`)
        }
        const data = (await res.json()) as ClassStudentSyncDiff
        setDiff(data)
        setSchoolYearId(data.schoolYearId)
        setSelection(buildDefaultSelection(data))
        setStage('preview')
        setOuterTab(pickInitialOuterTab(data))
        setClassTab(pickInitialClassTab(data))
        setStudentTab(pickInitialStudentTab(data))
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Vorschau für Klassen-/Schülersync fehlgeschlagen')
        setStage('error')
      }
    },
    [],
  )

  useEffect(() => {
    if (open) {
      setSummary(null)
      setSchoolYearId(selectedYear?.id ?? null)
      void loadPreview(selectedYear?.id ?? null)
    }
  }, [open, loadPreview, selectedYear?.id])

  const handleApply = async () => {
    setStage('applying')
    setError(null)
    try {
      const payload = {
        schoolYearId: schoolYearId ?? undefined,
        selection: {
          classes: {
            createGroupIds: selectedKeys(selection.classCreate),
            updateGroupIds: selectedKeys(selection.classUpdate),
            reactivateGroupIds: selectedKeys(selection.classReactivate),
            deactivateClassIds: selectedKeys(selection.classDeactivate).map(Number),
          },
          students: {
            createOids: selectedKeys(selection.studentCreate),
            updateOids: selectedKeys(selection.studentUpdate),
            reactivateOids: selectedKeys(selection.studentReactivate),
            deactivateStudentIds: selectedKeys(selection.studentDeactivate).map(Number),
          },
        },
      }
      const res = await fetch('/api/admin/class-sync/apply', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string }
        throw new Error(body.error ?? `Anwenden fehlgeschlagen (${res.status})`)
      }
      const data = (await res.json()) as ClassStudentSyncSummary
      setSummary(data)
      setStage('done')
      toast.success(
        `Synchronisierung angewendet: ${data.classes.created + data.classes.updated + data.classes.adopted} Klassen geändert, ${data.students.created + data.students.updated + data.students.adopted} Schüler geändert`,
      )
      onCompleted()
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Anwenden der Klassen-/Schülersync fehlgeschlagen'
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
      classes: {
        create: diff.classes.toCreate.length,
        update: diff.classes.toUpdate.length,
        deactivate: diff.classes.toDeactivate.length,
        reactivate: diff.classes.toReactivate.length,
        unchanged: diff.classes.unchanged.length,
      },
      students: {
        create: diff.students.toCreate.length,
        update: diff.students.toUpdate.length,
        deactivate: diff.students.toDeactivate.length,
        reactivate: diff.students.toReactivate.length,
        unchanged: diff.students.unchanged.length,
      },
      issues: diff.issues.length,
    }
  }, [diff])

  const selectedActionCount = useMemo(() => {
    return (
      countTrue(selection.classCreate) +
      countTrue(selection.classUpdate) +
      countTrue(selection.classReactivate) +
      countTrue(selection.classDeactivate) +
      countTrue(selection.studentCreate) +
      countTrue(selection.studentUpdate) +
      countTrue(selection.studentReactivate) +
      countTrue(selection.studentDeactivate)
    )
  }, [selection])

  const cascadeStudentsForGroup = useCallback(
    (groupId: string, checked: boolean) => {
      setSelection(prev => {
        const next = { ...prev }

        const createNext = { ...next.studentCreate }
        for (const row of diff?.students.toCreate ?? []) {
          if (row.target.groupId === groupId) {
            createNext[row.entra.oid] = checked
          }
        }

        const updateNext = { ...next.studentUpdate }
        for (const row of diff?.students.toUpdate ?? []) {
          if (row.target.groupId === groupId) {
            updateNext[row.entra.oid] = checked
          }
        }

        const reactivateNext = { ...next.studentReactivate }
        for (const row of diff?.students.toReactivate ?? []) {
          if (row.target.groupId === groupId) {
            reactivateNext[row.entra.oid] = checked
          }
        }

        next.studentCreate = createNext
        next.studentUpdate = updateNext
        next.studentReactivate = reactivateNext
        return next
      })
    },
    [diff],
  )

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-5xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <RefreshCw className="h-4 w-4" />
            Synchronisieren Classes + Students from Entra
          </DialogTitle>
          <DialogDescription>
            Previews changes to Classes, Students, and ClassMembership rows for the selected
            school year. Profile fields are always overwritten from Entra.
          </DialogDescription>
        </DialogHeader>

        <div className="flex items-center gap-2 text-sm">
          <span className="text-muted-foreground">School year</span>
          <Select
            value={schoolYearId != null ? String(schoolYearId) : ''}
            onValueChange={value => {
              const id = Number(value)
              setSchoolYearId(id)
              void loadPreview(id)
            }}
            disabled={stage === 'applying' || stage === 'loading'}
          >
            <SelectTrigger className="h-8 w-[220px]">
              <SelectValue placeholder="Pick school year" />
            </SelectTrigger>
            <SelectContent>
              {years.map(y => (
                <SelectItem key={y.id} value={String(y.id)}>
                  {y.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {diff ? (
            <div className="ml-auto flex items-center gap-3 text-xs text-muted-foreground">
              <span>
                Scope: {diff.syncedClassGroupIds.length} configured /{' '}
                {diff.syncedClassGroupIds.length - diff.unresolvedGroupIds.length} resolved
              </span>
              <span>
                Debug: {diff.debug.mappedGroupCount} mapped groups, {diff.debug.fetchedMemberCount}{' '}
                members, {diff.debug.mappedUserCount} mapped users
              </span>
              <span>Fetched {new Date(diff.fetchedAt).toLocaleTimeString()}</span>
            </div>
          ) : null}
        </div>

        {stage === 'loading' && (
          <div className="flex items-center justify-center gap-2 py-10 text-muted-foreground">
            <Spinner className="h-4 w-4" />
            <span>Loading preview from Microsoft Graph...</span>
          </div>
        )}

        {stage === 'error' && (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertTitle>Synchronisieren failed</AlertTitle>
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        {stage === 'done' && summary && (
          <div className="space-y-4">
            <Alert>
              <CheckCircle2 className="h-4 w-4" />
              <AlertTitle>Synchronisieren applied</AlertTitle>
              <AlertDescription>
                <div>
                  <strong>Classes:</strong> {summary.classes.created} created,{' '}
                  {summary.classes.updated} updated, {summary.classes.adopted} adopted,{' '}
                  {summary.classes.deactivated} deactivated, {summary.classes.reactivated}{' '}
                  reactivated, {summary.classes.unchanged} unchanged.
                </div>
                <div>
                  <strong>Students:</strong> {summary.students.created} created,{' '}
                  {summary.students.updated} updated, {summary.students.adopted} adopted,{' '}
                  {summary.students.deactivated} deactivated, {summary.students.reactivated}{' '}
                  reactivated, {summary.students.unchanged} unchanged.
                </div>
                {summary.issues.length > 0 ? (
                  <div>{summary.issues.length} issue(s) recorded.</div>
                ) : null}
              </AlertDescription>
            </Alert>
            {summary.issues.length > 0 && <IssuesTable issues={summary.issues} />}
          </div>
        )}

        {stage === 'preview' && diff && counts && (
          <>
            {diff.unresolvedGroupIds.length > 0 && (
              <Alert variant="destructive">
                <AlertCircle className="h-4 w-4" />
                <AlertTitle>Some Entra groups could not be fetched</AlertTitle>
                <AlertDescription>
                  {diff.unresolvedGroupIds.length} group id(s) could not be resolved: {' '}
                  <code className="font-mono text-xs">{diff.unresolvedGroupIds.join(', ')}</code>
                </AlertDescription>
              </Alert>
            )}
            {diff.syncedClassGroupIds.length === 0 && (
              <Alert>
                <AlertCircle className="h-4 w-4" />
                <AlertTitle>No class groups configured</AlertTitle>
                <AlertDescription>
                  Pick Entra class groups under Admin / Settings / Entra Synchronisieren first.
                </AlertDescription>
              </Alert>
            )}

            <Tabs value={outerTab} onValueChange={v => setOuterTab(v as typeof outerTab)}>
              <TabsList className="grid w-full grid-cols-3">
                <OuterTrigger
                  value="classes"
                  label="Classes"
                  count={
                    counts.classes.create +
                    counts.classes.update +
                    counts.classes.deactivate +
                    counts.classes.reactivate
                  }
                />
                <OuterTrigger
                  value="students"
                  label="Students"
                  count={
                    counts.students.create +
                    counts.students.update +
                    counts.students.deactivate +
                    counts.students.reactivate
                  }
                />
                <OuterTrigger value="issues" label="Issues" count={counts.issues} />
              </TabsList>

              <TabsContent value="classes" className="mt-4">
                <Tabs value={classTab} onValueChange={setClassTab}>
                  <TabsList className="grid w-full grid-cols-5">
                    <InnerTrigger value="create" label="Create" count={counts.classes.create} />
                    <InnerTrigger value="update" label="Update" count={counts.classes.update} />
                    <InnerTrigger
                      value="deactivate"
                      label="Deactivate"
                      count={counts.classes.deactivate}
                    />
                    <InnerTrigger
                      value="reactivate"
                      label="Reactivate"
                      count={counts.classes.reactivate}
                    />
                    <InnerTrigger
                      value="unchanged"
                      label="Unchanged"
                      count={counts.classes.unchanged}
                    />
                  </TabsList>

                  <TabsContent value="create" className="mt-4 max-h-[45vh] overflow-y-auto">
                    {diff.classes.toCreate.length === 0 ? (
                      <EmptyState text="No new classes to create." />
                    ) : (
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead className="w-14">Sync</TableHead>
                            <TableHead>Name</TableHead>
                            <TableHead>Description</TableHead>
                            <TableHead>Entra group id</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {diff.classes.toCreate.map(c => (
                            <TableRow key={c.group.id}>
                              <TableCell>
                                <Checkbox
                                  checked={selection.classCreate[c.group.id] ?? true}
                                  onCheckedChange={checked => {
                                    const value = Boolean(checked)
                                    setSelection(prev => ({
                                      ...prev,
                                      classCreate: {
                                        ...prev.classCreate,
                                        [c.group.id]: value,
                                      },
                                    }))
                                    if (!value) {
                                      cascadeStudentsForGroup(c.group.id, false)
                                    }
                                  }}
                                />
                              </TableCell>
                              <TableCell>{c.group.displayName}</TableCell>
                              <TableCell className="text-xs text-muted-foreground">
                                {c.group.description ?? '-'}
                              </TableCell>
                              <TableCell className="font-mono text-xs">{c.group.id}</TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    )}
                  </TabsContent>

                  <TabsContent value="update" className="mt-4 max-h-[45vh] overflow-y-auto">
                    {diff.classes.toUpdate.length === 0 ? (
                      <EmptyState text="No existing classes need updates." />
                    ) : (
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead className="w-14">Sync</TableHead>
                            <TableHead>Existing</TableHead>
                            <TableHead>From Entra</TableHead>
                            <TableHead>Changes</TableHead>
                            <TableHead>Mode</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {diff.classes.toUpdate.map(u => (
                            <TableRow key={u.group.id}>
                              <TableCell>
                                <Checkbox
                                  checked={selection.classUpdate[u.group.id] ?? true}
                                  onCheckedChange={checked => {
                                    const value = Boolean(checked)
                                    setSelection(prev => ({
                                      ...prev,
                                      classUpdate: {
                                        ...prev.classUpdate,
                                        [u.group.id]: value,
                                      },
                                    }))
                                    if (!value) {
                                      cascadeStudentsForGroup(u.group.id, false)
                                    }
                                  }}
                                />
                              </TableCell>
                              <TableCell>{u.existing.name}</TableCell>
                              <TableCell>{u.group.displayName}</TableCell>
                              <TableCell>
                                <div className="flex flex-wrap gap-1">
                                  {u.changes.length === 0 ? (
                                    <span className="text-muted-foreground text-xs">
                                      (metadata only)
                                    </span>
                                  ) : (
                                    u.changes.map(c => (
                                      <Badge key={c} variant="outline">
                                        {c}
                                      </Badge>
                                    ))
                                  )}
                                </div>
                              </TableCell>
                              <TableCell>
                                {u.willAdopt ? (
                                  <Badge variant="secondary">adopt</Badge>
                                ) : (
                                  <Badge variant="outline">update</Badge>
                                )}
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    )}
                  </TabsContent>

                  <TabsContent value="deactivate" className="mt-4 max-h-[45vh] overflow-y-auto">
                    {diff.classes.toDeactivate.length === 0 ? (
                      <EmptyState text="No classes to deactivate." />
                    ) : (
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead className="w-14">Sync</TableHead>
                            <TableHead>Name</TableHead>
                            <TableHead>Entra group id</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {diff.classes.toDeactivate.map(d => (
                            <TableRow key={d.existing.id}>
                              <TableCell>
                                <Checkbox
                                  checked={selection.classDeactivate[d.existing.id] ?? true}
                                  onCheckedChange={checked =>
                                    setSelection(prev => ({
                                      ...prev,
                                      classDeactivate: {
                                        ...prev.classDeactivate,
                                        [d.existing.id]: Boolean(checked),
                                      },
                                    }))
                                  }
                                />
                              </TableCell>
                              <TableCell>{d.existing.name}</TableCell>
                              <TableCell className="font-mono text-xs">
                                {d.existing.externalId ?? '-'}
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    )}
                  </TabsContent>

                  <TabsContent value="reactivate" className="mt-4 max-h-[45vh] overflow-y-auto">
                    {diff.classes.toReactivate.length === 0 ? (
                      <EmptyState text="No classes to reactivate." />
                    ) : (
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead className="w-14">Sync</TableHead>
                            <TableHead>Existing</TableHead>
                            <TableHead>From Entra</TableHead>
                            <TableHead>Entra group id</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {diff.classes.toReactivate.map(r => (
                            <TableRow key={r.group.id}>
                              <TableCell>
                                <Checkbox
                                  checked={selection.classReactivate[r.group.id] ?? true}
                                  onCheckedChange={checked => {
                                    const value = Boolean(checked)
                                    setSelection(prev => ({
                                      ...prev,
                                      classReactivate: {
                                        ...prev.classReactivate,
                                        [r.group.id]: value,
                                      },
                                    }))
                                    if (!value) {
                                      cascadeStudentsForGroup(r.group.id, false)
                                    }
                                  }}
                                />
                              </TableCell>
                              <TableCell>{r.existing.name}</TableCell>
                              <TableCell>{r.group.displayName}</TableCell>
                              <TableCell className="font-mono text-xs">{r.group.id}</TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    )}
                  </TabsContent>

                  <TabsContent value="unchanged" className="mt-4 max-h-[45vh] overflow-y-auto">
                    {diff.classes.unchanged.length === 0 ? (
                      <EmptyState text="No unchanged classes." />
                    ) : (
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Name</TableHead>
                            <TableHead>Entra group id</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {diff.classes.unchanged.map(u => (
                            <TableRow key={u.existing.id}>
                              <TableCell>{u.existing.name}</TableCell>
                              <TableCell className="font-mono text-xs">
                                {u.existing.externalId ?? '-'}
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    )}
                  </TabsContent>
                </Tabs>
              </TabsContent>

              <TabsContent value="students" className="mt-4">
                <Tabs value={studentTab} onValueChange={setStudentTab}>
                  <TabsList className="grid w-full grid-cols-5">
                    <InnerTrigger value="create" label="Create" count={counts.students.create} />
                    <InnerTrigger value="update" label="Update" count={counts.students.update} />
                    <InnerTrigger
                      value="deactivate"
                      label="Deactivate"
                      count={counts.students.deactivate}
                    />
                    <InnerTrigger
                      value="reactivate"
                      label="Reactivate"
                      count={counts.students.reactivate}
                    />
                    <InnerTrigger
                      value="unchanged"
                      label="Unchanged"
                      count={counts.students.unchanged}
                    />
                  </TabsList>

                  <TabsContent value="create" className="mt-4 max-h-[45vh] overflow-y-auto">
                    {diff.students.toCreate.length === 0 ? (
                      <EmptyState text="No new students to create." />
                    ) : (
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead className="w-14">Sync</TableHead>
                            <TableHead>Name</TableHead>
                            <TableHead>Username</TableHead>
                            <TableHead>Target class</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {diff.students.toCreate.map((c, idx) => {
                            const next = diff.students.toCreate[idx + 1]
                            const isClassBoundary =
                              !next || next.target.groupDisplayName !== c.target.groupDisplayName
                            return (
                            <TableRow
                              key={c.entra.oid}
                              className={isClassBoundary ? 'border-b-4 border-b-muted' : undefined}
                            >
                              <TableCell>
                                <Checkbox
                                  checked={selection.studentCreate[c.entra.oid] ?? true}
                                  onCheckedChange={checked =>
                                    setSelection(prev => ({
                                      ...prev,
                                      studentCreate: {
                                        ...prev.studentCreate,
                                        [c.entra.oid]: Boolean(checked),
                                      },
                                    }))
                                  }
                                />
                              </TableCell>
                              <TableCell>
                                {c.entra.firstName} {c.entra.lastName}
                              </TableCell>
                              <TableCell className="font-mono text-xs">
                                {c.entra.username}
                              </TableCell>
                              <TableCell>
                                <Badge variant="secondary">{c.target.groupDisplayName}</Badge>
                              </TableCell>
                            </TableRow>
                          )})}
                        </TableBody>
                      </Table>
                    )}
                  </TabsContent>

                  <TabsContent value="update" className="mt-4 max-h-[45vh] overflow-y-auto">
                    {diff.students.toUpdate.length === 0 ? (
                      <EmptyState text="No existing students need updates." />
                    ) : (
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead className="w-14">Sync</TableHead>
                            <TableHead>Name</TableHead>
                            <TableHead>Username</TableHead>
                            <TableHead>Changes</TableHead>
                            <TableHead>Class change</TableHead>
                            <TableHead>Mode</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {diff.students.toUpdate.map((u, idx) => {
                            const next = diff.students.toUpdate[idx + 1]
                            const isClassBoundary =
                              !next || next.target.groupDisplayName !== u.target.groupDisplayName
                            return (
                            <TableRow
                              key={u.entra.oid}
                              className={isClassBoundary ? 'border-b-4 border-b-muted' : undefined}
                            >
                              <TableCell>
                                <Checkbox
                                  checked={selection.studentUpdate[u.entra.oid] ?? true}
                                  onCheckedChange={checked =>
                                    setSelection(prev => ({
                                      ...prev,
                                      studentUpdate: {
                                        ...prev.studentUpdate,
                                        [u.entra.oid]: Boolean(checked),
                                      },
                                    }))
                                  }
                                />
                              </TableCell>
                              <TableCell>
                                {u.entra.firstName} {u.entra.lastName}
                              </TableCell>
                              <TableCell className="font-mono text-xs">
                                {u.entra.username}
                              </TableCell>
                              <TableCell>
                                <div className="flex flex-wrap gap-1">
                                  {u.changes.length === 0 ? (
                                    <span className="text-muted-foreground text-xs">
                                      (metadata only)
                                    </span>
                                  ) : (
                                    u.changes.map(c => (
                                      <Badge key={c} variant="outline">
                                        {c}
                                      </Badge>
                                    ))
                                  )}
                                </div>
                              </TableCell>
                              <TableCell>
                                {u.classChange ? (
                                  <span className="text-xs">
                                    {u.classChange.fromClassName ?? '(none)'} {'->'}{' '}
                                    <Badge variant="secondary">
                                      {u.classChange.toGroupDisplayName}
                                    </Badge>
                                  </span>
                                ) : (
                                  <span className="text-xs text-muted-foreground">-</span>
                                )}
                              </TableCell>
                              <TableCell>
                                {u.willAdopt ? (
                                  <Badge variant="secondary">adopt</Badge>
                                ) : (
                                  <Badge variant="outline">update</Badge>
                                )}
                              </TableCell>
                            </TableRow>
                          )})}
                        </TableBody>
                      </Table>
                    )}
                  </TabsContent>

                  <TabsContent value="deactivate" className="mt-4 max-h-[45vh] overflow-y-auto">
                    {diff.students.toDeactivate.length === 0 ? (
                      <EmptyState text="No students to deactivate." />
                    ) : (
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead className="w-14">Sync</TableHead>
                            <TableHead>Name</TableHead>
                            <TableHead>Username</TableHead>
                            <TableHead>Class</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {diff.students.toDeactivate.map(d => (
                            <TableRow key={d.existing.id}>
                              <TableCell>
                                <Checkbox
                                  checked={selection.studentDeactivate[d.existing.id] ?? true}
                                  onCheckedChange={checked =>
                                    setSelection(prev => ({
                                      ...prev,
                                      studentDeactivate: {
                                        ...prev.studentDeactivate,
                                        [d.existing.id]: Boolean(checked),
                                      },
                                    }))
                                  }
                                />
                              </TableCell>
                              <TableCell>
                                {d.existing.firstName} {d.existing.lastName}
                              </TableCell>
                              <TableCell className="font-mono text-xs">
                                {d.existing.username}
                              </TableCell>
                              <TableCell>{d.existing.className ?? '-'}</TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    )}
                  </TabsContent>

                  <TabsContent value="reactivate" className="mt-4 max-h-[45vh] overflow-y-auto">
                    {diff.students.toReactivate.length === 0 ? (
                      <EmptyState text="No students to reactivate." />
                    ) : (
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead className="w-14">Sync</TableHead>
                            <TableHead>Name</TableHead>
                            <TableHead>Username</TableHead>
                            <TableHead>Target class</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {diff.students.toReactivate.map((r, idx) => {
                            const next = diff.students.toReactivate[idx + 1]
                            const isClassBoundary =
                              !next || next.target.groupDisplayName !== r.target.groupDisplayName
                            return (
                            <TableRow
                              key={r.entra.oid}
                              className={isClassBoundary ? 'border-b-4 border-b-muted' : undefined}
                            >
                              <TableCell>
                                <Checkbox
                                  checked={selection.studentReactivate[r.entra.oid] ?? true}
                                  onCheckedChange={checked =>
                                    setSelection(prev => ({
                                      ...prev,
                                      studentReactivate: {
                                        ...prev.studentReactivate,
                                        [r.entra.oid]: Boolean(checked),
                                      },
                                    }))
                                  }
                                />
                              </TableCell>
                              <TableCell>
                                {r.entra.firstName} {r.entra.lastName}
                              </TableCell>
                              <TableCell className="font-mono text-xs">
                                {r.entra.username}
                              </TableCell>
                              <TableCell>
                                <Badge variant="secondary">{r.target.groupDisplayName}</Badge>
                              </TableCell>
                            </TableRow>
                          )})}
                        </TableBody>
                      </Table>
                    )}
                  </TabsContent>

                  <TabsContent value="unchanged" className="mt-4 max-h-[45vh] overflow-y-auto">
                    {diff.students.unchanged.length === 0 ? (
                      <EmptyState text="No unchanged students." />
                    ) : (
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Name</TableHead>
                            <TableHead>Username</TableHead>
                            <TableHead>Class</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {diff.students.unchanged.map(u => (
                            <TableRow key={u.existing.id}>
                              <TableCell>
                                {u.existing.firstName} {u.existing.lastName}
                              </TableCell>
                              <TableCell className="font-mono text-xs">
                                {u.existing.username}
                              </TableCell>
                              <TableCell>{u.existing.className ?? '-'}</TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    )}
                  </TabsContent>
                </Tabs>
              </TabsContent>

              <TabsContent value="issues" className="mt-4 max-h-[55vh] overflow-y-auto">
                {diff.issues.length === 0 ? (
                  <EmptyState text="No issues detected." />
                ) : (
                  <IssuesTable issues={diff.issues} />
                )}
              </TabsContent>
            </Tabs>
          </>
        )}

        <DialogFooter className="gap-2">
          {stage === 'preview' && (
            <>
              <Button
                variant="outline"
                onClick={() => void loadPreview(schoolYearId)}
              >
                Refresh
              </Button>
              <span className="mr-auto text-xs text-muted-foreground">
                Selected for apply: {selectedActionCount}
              </span>
              <Button variant="ghost" onClick={handleClose}>
                Cancel
              </Button>
              <Button onClick={handleApply} disabled={!diff || selectedActionCount === 0}>
                Apply
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
            <Button onClick={handleClose}>Close</Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

/* ---------- Helpers ----------------------------------------------------------------- */

function emptySelection(): SelectionState {
  return {
    classCreate: {},
    classUpdate: {},
    classReactivate: {},
    classDeactivate: {},
    studentCreate: {},
    studentUpdate: {},
    studentReactivate: {},
    studentDeactivate: {},
  }
}

function buildDefaultSelection(diff: ClassStudentSyncDiff): SelectionState {
  return {
    classCreate: Object.fromEntries(diff.classes.toCreate.map(r => [r.group.id, true])),
    classUpdate: Object.fromEntries(diff.classes.toUpdate.map(r => [r.group.id, true])),
    classReactivate: Object.fromEntries(diff.classes.toReactivate.map(r => [r.group.id, true])),
    classDeactivate: Object.fromEntries(
      diff.classes.toDeactivate.map(r => [r.existing.id, true]),
    ),
    studentCreate: Object.fromEntries(diff.students.toCreate.map(r => [r.entra.oid, true])),
    studentUpdate: Object.fromEntries(diff.students.toUpdate.map(r => [r.entra.oid, true])),
    studentReactivate: Object.fromEntries(
      diff.students.toReactivate.map(r => [r.entra.oid, true]),
    ),
    studentDeactivate: Object.fromEntries(
      diff.students.toDeactivate.map(r => [r.existing.id, true]),
    ),
  }
}

function pickInitialOuterTab(diff: ClassStudentSyncDiff): 'classes' | 'students' | 'issues' {
  const classesTotal =
    diff.classes.toCreate.length +
    diff.classes.toUpdate.length +
    diff.classes.toDeactivate.length +
    diff.classes.toReactivate.length
  const studentsTotal =
    diff.students.toCreate.length +
    diff.students.toUpdate.length +
    diff.students.toDeactivate.length +
    diff.students.toReactivate.length
  if (classesTotal > 0) return 'classes'
  if (studentsTotal > 0) return 'students'
  if (diff.issues.length > 0) return 'issues'
  return 'classes'
}

function pickInitialClassTab(diff: ClassStudentSyncDiff): string {
  if (diff.classes.toCreate.length > 0) return 'create'
  if (diff.classes.toUpdate.length > 0) return 'update'
  if (diff.classes.toDeactivate.length > 0) return 'deactivate'
  if (diff.classes.toReactivate.length > 0) return 'reactivate'
  return 'unchanged'
}

function pickInitialStudentTab(diff: ClassStudentSyncDiff): string {
  if (diff.students.toCreate.length > 0) return 'create'
  if (diff.students.toUpdate.length > 0) return 'update'
  if (diff.students.toDeactivate.length > 0) return 'deactivate'
  if (diff.students.toReactivate.length > 0) return 'reactivate'
  return 'unchanged'
}

function selectedKeys<T extends string | number>(record: Record<T, boolean>): string[] {
  return Object.entries(record)
    .filter(([, checked]) => Boolean(checked))
    .map(([key]) => key)
}

function countTrue<T extends string | number>(record: Record<T, boolean>): number {
  return Object.values(record).filter(Boolean).length
}

function OuterTrigger({
  value,
  label,
  count,
}: {
  value: string
  label: string
  count: number
}) {
  return (
    <TabsTrigger value={value} className="gap-1.5">
      <span>{label}</span>
      <Badge variant={count > 0 ? 'default' : 'outline'} className="px-1.5 py-0 text-xs">
        {count}
      </Badge>
    </TabsTrigger>
  )
}

function InnerTrigger({
  value,
  label,
  count,
}: {
  value: string
  label: string
  count: number
}) {
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

function IssuesTable({
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
