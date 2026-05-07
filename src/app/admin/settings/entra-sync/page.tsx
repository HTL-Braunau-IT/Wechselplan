'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Checkbox } from '@/components/ui/checkbox'
import { Spinner } from '@/components/ui/spinner'
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
import { AlertCircle, CheckCircle2, RefreshCw, Save, Search, Image as ImageIcon } from 'lucide-react'
import { toast } from 'sonner'
import { getApiErrorMessage, parseJsonSafe, unwrapData } from '@/lib/api-client'

interface EntraGroup {
  id: string
  displayName: string | null
  description: string | null
  mailNickname: string | null
}

interface DirectorySyncSettings {
  syncedClassGroupIds: string[]
  syncMode: 'hybrid' | 'nightly_only'
  syncEnabled: boolean
  studentFotoQuellePriority: 'manual_first' | 'o365_first'
  teacherPhotoSourcePriority: 'manual_first' | 'o365_first'
  lastSyncAt: string | null
  lastSyncStatus: string | null
  lastSyncSummary: unknown
}

interface CompiledFilter {
  regex: RegExp | null
  error: string | null
}

function compileRegexFilter(input: string): CompiledFilter {
  const raw = input.trim()
  if (!raw) return { regex: null, error: null }

  // Supported syntaxes:
  // - plain text (fallback substring search)
  // - re:<pattern>
  // - /pattern/flags
  const isRegexMode = raw.startsWith('re:') || (raw.startsWith('/') && raw.lastIndexOf('/') > 0)
  if (!isRegexMode) {
    return { regex: null, error: null }
  }

  try {
    if (raw.startsWith('re:')) {
      return { regex: new RegExp(raw.slice(3), 'i'), error: null }
    }

    const lastSlash = raw.lastIndexOf('/')
    const pattern = raw.slice(1, lastSlash)
    const flags = raw.slice(lastSlash + 1)
    return { regex: new RegExp(pattern, flags), error: null }
  } catch (error) {
    return {
      regex: null,
      error: error instanceof Error ? error.message : 'Invalid regex',
    }
  }
}

export default function EntraSyncSettingsPage() {
  const [groups, setGroups] = useState<EntraGroup[]>([])
  const [isLoadingGroups, setIsLoadingGroups] = useState(true)
  const [settings, setSettings] = useState<DirectorySyncSettings | null>(null)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [photoQuellePriority, setFotoQuellePriority] = useState<'manual_first' | 'o365_first'>(
    'manual_first',
  )
  const [teacherPhotoSourcePriority, setTeacherPhotoQuellePriority] = useState<
    'manual_first' | 'o365_first'
  >('manual_first')
  const [isLoadingSettings, setIsLoadingSettings] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const [isRefreshingFotos, setIsRefreshingFotos] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [filter, setFilter] = useState('')

  const loadSettings = useCallback(async () => {
    setIsLoadingSettings(true)
    try {
      const res = await fetch('/api/admin/directory-sync-settings', { cache: 'no-store' })
      const payload = await parseJsonSafe(res)
      if (!res.ok) {
        throw new Error(getApiErrorMessage(payload, `Einstellungen konnten nicht geladen werden (${res.status})`))
      }
      const data = unwrapData<DirectorySyncSettings>(payload)
      setSettings(data)
      setSelectedIds(new Set(data.syncedClassGroupIds))
      setFotoQuellePriority(data.studentFotoQuellePriority ?? 'manual_first')
      setTeacherPhotoQuellePriority(data.teacherPhotoSourcePriority ?? 'manual_first')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Einstellungen konnten nicht geladen werden')
    } finally {
      setIsLoadingSettings(false)
    }
  }, [])

  const loadGroups = useCallback(async () => {
    setIsLoadingGroups(true)
    setError(null)
    try {
      const res = await fetch('/api/admin/entra/groups', { cache: 'no-store' })
      const payload = await parseJsonSafe(res)
      if (!res.ok) {
        throw new Error(getApiErrorMessage(payload, `Gruppen konnten nicht geladen werden (${res.status})`))
      }
      const data = unwrapData<EntraGroup[]>(payload)
      setGroups(data)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gruppen konnten nicht geladen werden')
    } finally {
      setIsLoadingGroups(false)
    }
  }, [])

  useEffect(() => {
    void loadSettings()
    void loadGroups()
  }, [loadSettings, loadGroups])

  const teacherGroupId = process.env.NEXT_PUBLIC_ENTRA_TEACHER_GROUP_ID ?? ''

  const compiledFilter = useMemo(() => compileRegexFilter(filter), [filter])

  const filteredGroups = useMemo(() => {
    const q = filter.trim().toLowerCase()
    if (!q) return groups
    if (compiledFilter.error) return []

    const fieldsFor = (g: EntraGroup): string[] => [
      g.displayName ?? '',
      g.description ?? '',
      g.mailNickname ?? '',
      g.id,
    ]

    if (compiledFilter.regex) {
      return groups.filter(g => fieldsFor(g).some(value => compiledFilter.regex?.test(value)))
    }

    return groups.filter(
      g =>
        (g.displayName ?? '').toLowerCase().includes(q) ||
        (g.description ?? '').toLowerCase().includes(q) ||
        (g.mailNickname ?? '').toLowerCase().includes(q) ||
        g.id.toLowerCase().includes(q),
    )
  }, [groups, filter, compiledFilter])

  const groupById = useMemo(() => {
    const map = new Map<string, EntraGroup>()
    for (const group of groups) {
      map.set(group.id, group)
    }
    return map
  }, [groups])

  const selectedGroups = useMemo(
    () =>
      Array.from(selectedIds).map(id => ({
        id,
        group: groupById.get(id),
      })),
    [selectedIds, groupById],
  )

  const unavailableSelectedIds = useMemo(
    () => selectedGroups.filter(({ group }) => !group).map(({ id }) => id),
    [selectedGroups],
  )

  const selectableFilteredIds = useMemo(
    () =>
      filteredGroups
        .filter(group => !teacherGroupId || group.id !== teacherGroupId)
        .map(group => group.id),
    [filteredGroups, teacherGroupId],
  )

  const selectedFilteredCount = useMemo(
    () => selectableFilteredIds.filter(id => selectedIds.has(id)).length,
    [selectableFilteredIds, selectedIds],
  )

  const allFilteredChecked =
    selectableFilteredIds.length > 0 && selectedFilteredCount === selectableFilteredIds.length
  const someFilteredChecked = selectedFilteredCount > 0 && !allFilteredChecked

  const toggleGroup = (id: string, checked: boolean) => {
    setSelectedIds(prev => {
      const next = new Set(prev)
      if (checked) {
        next.add(id)
      } else {
        next.delete(id)
      }
      return next
    })
  }

  const removeSelectedGroupId = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev)
      next.delete(id)
      return next
    })
  }

  const removeUnavailableSelectedGroups = () => {
    if (unavailableSelectedIds.length === 0) return
    setSelectedIds(prev => {
      const next = new Set(prev)
      for (const id of unavailableSelectedIds) {
        next.delete(id)
      }
      return next
    })
  }

  const toggleAllFiltered = (checked: boolean) => {
    setSelectedIds(prev => {
      const next = new Set(prev)
      for (const id of selectableFilteredIds) {
        if (checked) {
          next.add(id)
        } else {
          next.delete(id)
        }
      }
      return next
    })
  }

  const handleSave = async () => {
    setIsSaving(true)
    setError(null)
    try {
      const res = await fetch('/api/admin/directory-sync-settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          syncedClassGroupIds: Array.from(selectedIds),
          studentFotoQuellePriority: photoQuellePriority,
          teacherPhotoSourcePriority,
        }),
      })
      const payload = await parseJsonSafe(res)
      if (!res.ok) {
        throw new Error(getApiErrorMessage(payload, `Save fehlgeschlagen (${res.status})`))
      }
      const data = unwrapData<DirectorySyncSettings>(payload)
      setSettings(data)
      setSelectedIds(new Set(data.syncedClassGroupIds))
      setFotoQuellePriority(data.studentFotoQuellePriority ?? 'manual_first')
      setTeacherPhotoQuellePriority(data.teacherPhotoSourcePriority ?? 'manual_first')
      toast.success('Synchronisierte Klassengruppen gespeichert')
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Einstellungen konnten nicht gespeichert werden'
      setError(message)
      toast.error(message)
    } finally {
      setIsSaving(false)
    }
  }

  const handleRefreshTeacherPhotos = async () => {
    setIsRefreshingFotos(true)
    setError(null)
    try {
      const res = await fetch('/api/admin/teacher-photos/o365-refresh', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      })
      const payload = await parseJsonSafe(res)
      if (!res.ok) {
        throw new Error(getApiErrorMessage(payload, `O365-Lehrerfotos konnten nicht aktualisiert werden (${res.status})`))
      }

      const body = unwrapData<{ refreshed: number; withPhoto: number }>(payload)
      toast.success(`${body.refreshed} Lehrkraft(en) aktualisiert, ${body.withPhoto} mit Foto`)
    } catch (err) {
      const message = err instanceof Error ? err.message : 'O365-Lehrerfotos konnten nicht aktualisiert werden'
      setError(message)
      toast.error(message)
    } finally {
      setIsRefreshingFotos(false)
    }
  }

  const handleRefreshStudentFotos = async () => {
    setIsRefreshingFotos(true)
    setError(null)
    try {
      const res = await fetch('/api/admin/student-photos/o365-refresh', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      })
      const payload = await parseJsonSafe(res)
      if (!res.ok) {
        throw new Error(getApiErrorMessage(payload, `O365-Schülerfotos konnten nicht aktualisiert werden (${res.status})`))
      }

      const body = unwrapData<{ refreshed: number; withPhoto: number }>(payload)
      toast.success(`${body.refreshed} Schüler(innen) aktualisiert, ${body.withPhoto} mit Foto`)
    } catch (err) {
      const message = err instanceof Error ? err.message : 'O365-Schülerfotos konnten nicht aktualisiert werden'
      setError(message)
      toast.error(message)
    } finally {
      setIsRefreshingFotos(false)
    }
  }

  const isDirty = useMemo(() => {
    if (!settings) return false
    const current = new Set(settings.syncedClassGroupIds)
    if (current.size !== selectedIds.size) return true
    for (const id of selectedIds) {
      if (!current.has(id)) return true
    }
    return (
      settings.studentFotoQuellePriority !== photoQuellePriority ||
      settings.teacherPhotoSourcePriority !== teacherPhotoSourcePriority
    )
  }, [photoQuellePriority, settings, selectedIds, teacherPhotoSourcePriority])

  return (
    <div className="space-y-6 p-6">
      <div className="flex items-center justify-between gap-2">
        <div>
          <h1 className="text-3xl font-bold">Entra-Synchronisierung</h1>
          <p className="text-muted-foreground">
            Wähle aus, welche Entra-Sicherheitsgruppen als Klassen gelten. Die Lehrkräfte-Gruppe
            wird über die Umgebungsvariable konfiguriert.
          </p>
        </div>
      </div>

      {error && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Error</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Aktueller Synchronisierungsstatus</CardTitle>
          <CardDescription>Metadaten des letzten Laufs aus dem Verzeichnis-Sync.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          {isLoadingSettings ? (
            <div className="flex items-center gap-2 text-muted-foreground">
              <Spinner className="h-4 w-4" />
              Lädt...
            </div>
          ) : settings ? (
            <>
              <div>
                <span className="text-muted-foreground">Modus: </span>
                <Badge variant="outline">{settings.syncMode}</Badge>
              </div>
              <div>
                <span className="text-muted-foreground">Auto-Sync: </span>
                <Badge variant={settings.syncEnabled ? 'default' : 'outline'}>
                  {settings.syncEnabled ? 'aktiv' : 'deaktiviert'}
                </Badge>
              </div>
              <div>
                <span className="text-muted-foreground">Letzter Lauf: </span>
                {settings.lastSyncAt ? new Date(settings.lastSyncAt).toLocaleString() : 'nie'}
                {settings.lastSyncStatus ? (
                  <Badge
                    className="ml-2"
                    variant={
                      settings.lastSyncStatus === 'success'
                        ? 'default'
                        : settings.lastSyncStatus === 'partial'
                          ? 'secondary'
                          : 'destructive'
                    }
                  >
                    {settings.lastSyncStatus}
                  </Badge>
                ) : null}
              </div>
              {teacherGroupId && (
                <div>
                  <span className="text-muted-foreground">Lehrkräfte-Gruppen-ID (aus Env): </span>
                  <code className="font-mono text-xs">{teacherGroupId}</code>
                </div>
              )}
            </>
          ) : (
            <p className="text-muted-foreground">Keine Einstellungen geladen.</p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Fotoquelle für Schüler</CardTitle>
          <CardDescription>
            Lege fest, ob manuelle Uploads oder O365-Profilfotos bevorzugt werden.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="max-w-md space-y-2">
            <Label htmlFor="photo-source-priority">Priorität</Label>
            <Select
              value={photoQuellePriority}
              onValueChange={value =>
                setFotoQuellePriority(value as 'manual_first' | 'o365_first')
              }
            >
              <SelectTrigger id="photo-source-priority">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="manual_first">Manueller Upload zuerst (Fallback O365)</SelectItem>
                <SelectItem value="o365_first">O365 zuerst (Fallback manueller Upload)</SelectItem>
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              Diese Einstellung steuert die Anzeige in Listen, Detailansichten und im Header-Profil.
            </p>
          </div>
          <div className="max-w-md space-y-2">
            <Label htmlFor="teacher-photo-source-priority">Priorität für Lehrkräfte</Label>
            <Select
              value={teacherPhotoSourcePriority}
              onValueChange={value =>
                setTeacherPhotoQuellePriority(value as 'manual_first' | 'o365_first')
              }
            >
              <SelectTrigger id="teacher-photo-source-priority">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="manual_first">Manueller Upload zuerst (Fallback O365)</SelectItem>
                <SelectItem value="o365_first">O365 zuerst (Fallback manueller Upload)</SelectItem>
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              Nutze O365 zuerst, wenn Profilbilder zentral verwaltet werden sollen.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              onClick={() => void handleRefreshStudentFotos()}
              disabled={isRefreshingFotos}
            >
              {isRefreshingFotos ? (
                <Spinner className="mr-2 h-4 w-4" />
              ) : (
                <ImageIcon className="mr-2 h-4 w-4" />
              )}
              O365-Schülerfoto-Cache aktualisieren
            </Button>
            <p className="text-xs text-muted-foreground">
              Lädt gecachte Profilfotos für Entra-synchronisierte Schüler neu.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              onClick={() => void handleRefreshTeacherPhotos()}
              disabled={isRefreshingFotos}
            >
              {isRefreshingFotos ? (
                <Spinner className="mr-2 h-4 w-4" />
              ) : (
                <ImageIcon className="mr-2 h-4 w-4" />
              )}
              O365-Lehrerfoto-Cache aktualisieren
            </Button>
            <p className="text-xs text-muted-foreground">
              Lädt gecachte Profilfotos für Entra-synchronisierte Lehrkräfte neu.
            </p>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between gap-2">
            <div>
              <CardTitle>Klassengruppen</CardTitle>
              <CardDescription>
                Ausgewählt: {selectedIds.size}. Nur Benutzer aus der Lehrkräfte-Gruppe oder einer
                dieser Gruppen können sich anmelden.
              </CardDescription>
            </div>
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" onClick={() => void loadGroups()}>
                <RefreshCw className="mr-2 h-4 w-4" />
                Reload
              </Button>
              <Button
                onClick={() => void handleSave()}
                disabled={!isDirty || isSaving || isLoadingSettings}
              >
                {isSaving ? (
                  <Spinner className="mr-2 h-4 w-4" />
                ) : (
                  <Save className="mr-2 h-4 w-4" />
                )}
                Save
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {selectedGroups.length > 0 && (
            <Alert>
              <CheckCircle2 className="h-4 w-4" />
              <AlertTitle>Aktuell ausgewählte Gruppen</AlertTitle>
              <AlertDescription className="space-y-1">
                {unavailableSelectedIds.length > 0 ? (
                  <div className="mb-2 flex items-center justify-between gap-2 rounded border border-amber-300/60 bg-amber-50/40 p-2 text-xs">
                    <span>
                      {unavailableSelectedIds.length} ausgewählte Gruppe(n) sind nicht in der
                      aktuellen Liste zulässiger Gruppen (Windows Server AD + mail-enabled security).
                    </span>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={removeUnavailableSelectedGroups}
                    >
                      Alle nicht verfügbaren entfernen
                    </Button>
                  </div>
                ) : null}
                {selectedGroups.map(({ id, group }) => (
                  <div key={id} className="flex items-center gap-2">
                    <Badge variant={group ? 'secondary' : 'outline'}>
                      {group?.displayName ?? (
                        <span className="text-muted-foreground">(nicht verfügbar)</span>
                      )}
                    </Badge>
                    <code className="font-mono text-xs text-muted-foreground">{id}</code>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-6 px-2 text-xs"
                      onClick={() => removeSelectedGroupId(id)}
                    >
                      Entfernen
                    </Button>
                  </div>
                ))}
              </AlertDescription>
            </Alert>
          )}

          <div className="space-y-2">
            <Label htmlFor="filter" className="flex items-center gap-2">
              <Search className="h-4 w-4" />
              Filter
            </Label>
            <Input
              id="filter"
              placeholder="Filtertext, re:<muster> oder /muster/flags"
              value={filter}
              onChange={e => setFilter(e.target.value)}
            />
            <p className="text-xs text-muted-foreground">
              Regex-Beispiele: <code>re:1-5.....?</code> oder <code>/1-5.....?/i</code>
            </p>
            <Label className="flex w-fit cursor-pointer items-center gap-2 text-xs text-muted-foreground">
              <Checkbox
                checked={allFilteredChecked ? true : someFilteredChecked ? 'indeterminate' : false}
                onCheckedChange={checked => toggleAllFiltered(Boolean(checked))}
                disabled={selectableFilteredIds.length === 0}
                aria-label="Alle gefilterten Gruppen auswählen"
              />
              Alle gefilterten auswählen
            </Label>
            {compiledFilter.error ? (
              <p className="text-xs text-destructive">Ungültiger Regex: {compiledFilter.error}</p>
            ) : null}
          </div>

          {isLoadingGroups ? (
            <div className="flex items-center justify-center gap-2 py-10 text-muted-foreground">
              <Spinner className="h-4 w-4" />
              Entra-Gruppen werden geladen...
            </div>
          ) : filteredGroups.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">
              {groups.length === 0
                ? 'Keine Gruppen gefunden. Bitte Graph-App-Berechtigungen prüfen.'
                : compiledFilter.error
                  ? 'Regex ist ungültig. Bitte Muster korrigieren.'
                  : 'Keine Gruppen passen zum aktuellen Filter.'}
            </p>
          ) : (
            <div className="max-h-[60vh] overflow-y-auto rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-14">Auswahl</TableHead>
                    <TableHead>Name</TableHead>
                    <TableHead>Beschreibung</TableHead>
                    <TableHead>Mail-Spitzname</TableHead>
                    <TableHead>ID</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredGroups.map(group => {
                    const isTeacherGroup =
                      teacherGroupId && group.id === teacherGroupId
                    return (
                      <TableRow key={group.id}>
                        <TableCell>
                          <Checkbox
                            checked={selectedIds.has(group.id)}
                            disabled={Boolean(isTeacherGroup)}
                            onCheckedChange={checked =>
                              toggleGroup(group.id, Boolean(checked))
                            }
                          />
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <span>{group.displayName ?? '(ohne Namen)'}</span>
                            {isTeacherGroup ? (
                              <Badge variant="outline">Lehrkräfte-Gruppe</Badge>
                            ) : null}
                          </div>
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground">
                          {group.description ?? '-'}
                        </TableCell>
                        <TableCell className="font-mono text-xs">
                          {group.mailNickname ?? '-'}
                        </TableCell>
                        <TableCell className="font-mono text-xs">{group.id}</TableCell>
                      </TableRow>
                    )
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
