'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'
import {
  AlertCircle,
  CheckCircle2,
  GraduationCap,
  Link2,
  Play,
  PlugZap,
  Save,
  Search,
} from 'lucide-react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Checkbox } from '@/components/ui/checkbox'
import { Spinner } from '@/components/ui/spinner'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible'
import { PageContainer } from '@/components/ui/page-container'
import { PageHeader } from '@/components/ui/page-header'

interface NotenmanagementSettingsView {
  serviceUsername: string | null
  hasServicePassword: boolean
  lastLinkSyncAt: string | null
  lastLinkSyncStatus: string | null
  lastLinkSyncSummary: unknown
}

interface DiscoveredClassGroup {
  id: string
  displayName: string
  alreadySynced: boolean
}

interface NmLinkSyncSummary {
  totalActiveStudents: number
  withSokratesId: number
  linked: number
  updated: number
  unchanged: number
  missingSokratesId: number
  noNmMatch: number
  nmOnly: number
  missingSokratesIdSamples: string[]
  noNmMatchSamples: string[]
}

interface TestConnectionResult {
  ok: boolean
  role?: string | null
  userName?: string | null
  error?: string
}

async function readError(res: Response, fallback: string): Promise<string> {
  const body = (await res.json().catch(() => ({}))) as { error?: string }
  return body.error ?? `${fallback} (${res.status})`
}

export function NotenmanagementSettings() {
  return (
    <PageContainer size="wide" className="space-y-6">
      <PageHeader
        icon={GraduationCap}
        title="Notenmanagement"
        description="Dienstkonto, Klassengruppen und die Verknüpfung der Matrikelnummern verwalten."
      />
      <ServiceAccountCard />
      <ClassGroupsCard />
      <LinkSyncCard />
    </PageContainer>
  )
}

function ServiceAccountCard() {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [hasStoredPassword, setHasStoredPassword] = useState(false)
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const [isTesting, setIsTesting] = useState(false)
  const [testResult, setTestResult] = useState<TestConnectionResult | null>(null)

  const load = useCallback(async () => {
    setIsLoading(true)
    try {
      const res = await fetch('/api/admin/notenmanagement-settings', { cache: 'no-store' })
      if (!res.ok) throw new Error(await readError(res, 'Einstellungen konnten nicht geladen werden'))
      const data = (await res.json()) as NotenmanagementSettingsView
      setUsername(data.serviceUsername ?? '')
      setHasStoredPassword(data.hasServicePassword)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Einstellungen konnten nicht geladen werden')
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const handleSave = async () => {
    setIsSaving(true)
    setTestResult(null)
    try {
      const payload: { serviceUsername: string; servicePassword?: string } = {
        serviceUsername: username.trim(),
      }
      // Blank leaves the stored password untouched.
      if (password) payload.servicePassword = password

      const res = await fetch('/api/admin/notenmanagement-settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      if (!res.ok) throw new Error(await readError(res, 'Speichern fehlgeschlagen'))
      const data = (await res.json()) as NotenmanagementSettingsView
      setUsername(data.serviceUsername ?? '')
      setHasStoredPassword(data.hasServicePassword)
      setPassword('')
      toast.success('Dienstkonto gespeichert')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Speichern fehlgeschlagen')
    } finally {
      setIsSaving(false)
    }
  }

  const handleTest = async () => {
    setIsTesting(true)
    setTestResult(null)
    try {
      const res = await fetch('/api/admin/notenmanagement/test-connection', { method: 'POST' })
      if (res.status === 400) {
        throw new Error(await readError(res, 'Kein Dienstkonto konfiguriert'))
      }
      if (!res.ok) throw new Error(await readError(res, 'Verbindung fehlgeschlagen'))
      const data = (await res.json()) as TestConnectionResult
      setTestResult(data)
      if (data.ok) {
        toast.success('Verbindung erfolgreich')
      } else {
        toast.error(data.error ?? 'Authentifizierung fehlgeschlagen')
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Verbindung fehlgeschlagen')
    } finally {
      setIsTesting(false)
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Dienstkonto</CardTitle>
        <CardDescription>
          Das Notenmanagement-Lehrerkonto, mit dem die Matrikelnummern unbeaufsichtigt abgeglichen
          werden. Das Passwort wird verschlüsselt gespeichert und nie angezeigt.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {isLoading ? (
          <div className="text-muted-foreground flex items-center gap-2 py-2 text-sm">
            <Spinner className="h-4 w-4" />
            Wird geladen …
          </div>
        ) : (
          <>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="nm-username">Benutzername</Label>
                <Input
                  id="nm-username"
                  value={username}
                  onChange={e => setUsername(e.target.value)}
                  placeholder="z. B. lehrer.dienst"
                  autoComplete="off"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="nm-password">Passwort</Label>
                <Input
                  id="nm-password"
                  type="password"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  placeholder={hasStoredPassword ? '•••• (gespeichert)' : 'Passwort'}
                  autoComplete="new-password"
                />
                <p className="text-muted-foreground text-xs">
                  Leer lassen, um das gespeicherte Passwort beizubehalten.
                </p>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <Button onClick={() => void handleSave()} disabled={isSaving}>
                {isSaving ? <Spinner className="mr-2 h-4 w-4" /> : <Save className="mr-2 h-4 w-4" />}
                Speichern
              </Button>
              <Button variant="outline" onClick={() => void handleTest()} disabled={isTesting}>
                {isTesting ? (
                  <Spinner className="mr-2 h-4 w-4" />
                ) : (
                  <PlugZap className="mr-2 h-4 w-4" />
                )}
                Verbindung testen
              </Button>
            </div>

            {testResult ? (
              testResult.ok ? (
                <Alert>
                  <CheckCircle2 className="h-4 w-4" />
                  <AlertTitle>Verbindung erfolgreich</AlertTitle>
                  <AlertDescription>
                    Angemeldet als <span className="font-medium">{testResult.userName ?? '—'}</span>
                    {testResult.role ? (
                      <>
                        {' '}
                        (Rolle: <span className="font-medium">{testResult.role}</span>)
                      </>
                    ) : null}
                    .
                  </AlertDescription>
                </Alert>
              ) : (
                <Alert variant="destructive">
                  <AlertCircle className="h-4 w-4" />
                  <AlertTitle>Authentifizierung fehlgeschlagen</AlertTitle>
                  <AlertDescription>
                    {testResult.error ?? 'Benutzername oder Passwort ist ungültig.'}
                  </AlertDescription>
                </Alert>
              )
            ) : null}
          </>
        )}
      </CardContent>
    </Card>
  )
}

function ClassGroupsCard() {
  const [groups, setGroups] = useState<DiscoveredClassGroup[]>([])
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [hasSearched, setHasSearched] = useState(false)
  const [isSearching, setIsSearching] = useState(false)
  const [isSaving, setIsSaving] = useState(false)

  const handleSearch = async () => {
    setIsSearching(true)
    try {
      const res = await fetch('/api/admin/notenmanagement/class-groups', { cache: 'no-store' })
      if (!res.ok) throw new Error(await readError(res, 'Klassen konnten nicht gesucht werden'))
      const data = (await res.json()) as DiscoveredClassGroup[]
      setGroups(data)
      setSelectedIds(new Set(data.filter(g => g.alreadySynced).map(g => g.id)))
      setHasSearched(true)
      toast.success(`${data.length} Klassengruppe(n) gefunden`)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Klassen konnten nicht gesucht werden')
    } finally {
      setIsSearching(false)
    }
  }

  const toggle = (id: string, checked: boolean) => {
    setSelectedIds(prev => {
      const next = new Set(prev)
      if (checked) next.add(id)
      else next.delete(id)
      return next
    })
  }

  const handleSave = async () => {
    setIsSaving(true)
    try {
      const res = await fetch('/api/admin/notenmanagement/class-groups', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ groupIds: Array.from(selectedIds) }),
      })
      if (!res.ok) throw new Error(await readError(res, 'Übernehmen fehlgeschlagen'))
      setGroups(prev => prev.map(g => ({ ...g, alreadySynced: selectedIds.has(g.id) })))
      toast.success('Klassengruppen übernommen')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Übernehmen fehlgeschlagen')
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Klassen aus Entra</CardTitle>
        <CardDescription>
          Findet die Schüler-Klassengruppen in Entra automatisch anhand ihres Namens (Muster wie
          1AHITS, 2AHELS, 5HET). Die ausgewählten Gruppen werden als synchronisierte Klassengruppen
          gespeichert.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" onClick={() => void handleSearch()} disabled={isSearching}>
            {isSearching ? (
              <Spinner className="mr-2 h-4 w-4" />
            ) : (
              <Search className="mr-2 h-4 w-4" />
            )}
            Klassen suchen
          </Button>
          {hasSearched ? (
            <Button
              onClick={() => void handleSave()}
              disabled={isSaving || groups.length === 0}
            >
              {isSaving ? <Spinner className="mr-2 h-4 w-4" /> : <Save className="mr-2 h-4 w-4" />}
              Übernehmen ({selectedIds.size})
            </Button>
          ) : null}
        </div>

        {hasSearched ? (
          groups.length === 0 ? (
            <p className="text-muted-foreground py-4 text-center text-sm">
              Keine passenden Klassengruppen gefunden.
            </p>
          ) : (
            <div className="max-h-[50vh] space-y-1 overflow-y-auto rounded-md border p-2">
              {groups.map(group => (
                <Label
                  key={group.id}
                  className="hover:bg-accent flex cursor-pointer items-center gap-3 rounded-md px-2 py-1.5 text-sm font-normal"
                >
                  <Checkbox
                    checked={selectedIds.has(group.id)}
                    onCheckedChange={checked => toggle(group.id, Boolean(checked))}
                  />
                  <span className="font-medium">{group.displayName}</span>
                  {group.alreadySynced ? (
                    <Badge variant="secondary" className="ml-auto">
                      synchronisiert
                    </Badge>
                  ) : null}
                </Label>
              ))}
            </div>
          )
        ) : null}
      </CardContent>
    </Card>
  )
}

interface StatItem {
  label: string
  value: number
  emphasis?: 'default' | 'warning'
}

function LinkSyncCard() {
  const [settings, setSettings] = useState<NotenmanagementSettingsView | null>(null)
  const [summary, setSummary] = useState<NmLinkSyncSummary | null>(null)
  const [isPreviewing, setIsPreviewing] = useState(false)
  const [isRunning, setIsRunning] = useState(false)

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/notenmanagement-settings', { cache: 'no-store' })
      if (!res.ok) return
      setSettings((await res.json()) as NotenmanagementSettingsView)
    } catch {
      // Non-critical: the last-sync line simply stays empty.
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const runLinkSync = async (preview: boolean) => {
    if (preview) setIsPreviewing(true)
    else setIsRunning(true)
    try {
      const res = await fetch('/api/admin/notenmanagement/link-sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ preview }),
      })
      if (!res.ok) throw new Error(await readError(res, 'Verknüpfung fehlgeschlagen'))
      setSummary((await res.json()) as NmLinkSyncSummary)
      if (!preview) {
        toast.success('Matrikelnummern verknüpft')
        await load()
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Verknüpfung fehlgeschlagen')
    } finally {
      if (preview) setIsPreviewing(false)
      else setIsRunning(false)
    }
  }

  const stats: StatItem[] = useMemo(() => {
    if (!summary) return []
    return [
      { label: 'Gesamt', value: summary.totalActiveStudents },
      { label: 'mit Sokrates-ID', value: summary.withSokratesId },
      { label: 'neu verknüpft', value: summary.linked },
      { label: 'aktualisiert', value: summary.updated },
      { label: 'unverändert', value: summary.unchanged },
      {
        label: 'ohne Sokrates-ID',
        value: summary.missingSokratesId,
        emphasis: summary.missingSokratesId > 0 ? 'warning' : 'default',
      },
      {
        label: 'kein NM-Treffer',
        value: summary.noNmMatch,
        emphasis: summary.noNmMatch > 0 ? 'warning' : 'default',
      },
      { label: 'nur in NM', value: summary.nmOnly },
    ]
  }, [summary])

  return (
    <Card>
      <CardHeader>
        <CardTitle>Matrikelnummern verknüpfen</CardTitle>
        <CardDescription>
          Gleicht jede aktive Schülerin/jeden aktiven Schüler über die Sokrates-ID mit dem
          Notenmanagement ab und speichert die gefundene Matrikelnummer.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {settings?.lastLinkSyncAt ? (
          <p className="text-muted-foreground text-sm">
            Letzter Lauf:{' '}
            {new Date(settings.lastLinkSyncAt).toLocaleString('de-AT', {
              dateStyle: 'medium',
              timeStyle: 'short',
            })}
            {settings.lastLinkSyncStatus ? (
              <>
                {' '}
                <Badge variant="outline">{settings.lastLinkSyncStatus}</Badge>
              </>
            ) : null}
          </p>
        ) : (
          <p className="text-muted-foreground text-sm">Es wurde noch kein Abgleich ausgeführt.</p>
        )}

        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant="outline"
            onClick={() => void runLinkSync(true)}
            disabled={isPreviewing || isRunning}
          >
            {isPreviewing ? (
              <Spinner className="mr-2 h-4 w-4" />
            ) : (
              <Search className="mr-2 h-4 w-4" />
            )}
            Vorschau
          </Button>
          <Button onClick={() => void runLinkSync(false)} disabled={isPreviewing || isRunning}>
            {isRunning ? <Spinner className="mr-2 h-4 w-4" /> : <Play className="mr-2 h-4 w-4" />}
            Jetzt verknüpfen
          </Button>
        </div>

        {summary ? (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              {stats.map(stat => (
                <div
                  key={stat.label}
                  className="bg-muted/40 rounded-lg border p-3"
                >
                  <p
                    className={
                      stat.emphasis === 'warning'
                        ? 'text-destructive text-2xl font-semibold'
                        : 'text-2xl font-semibold'
                    }
                  >
                    {stat.value}
                  </p>
                  <p className="text-muted-foreground text-xs">{stat.label}</p>
                </div>
              ))}
            </div>

            {summary.missingSokratesId > 0 ? (
              <Alert variant="destructive">
                <AlertCircle className="h-4 w-4" />
                <AlertTitle>Fehlende Sokrates-IDs</AlertTitle>
                <AlertDescription>
                  Diese Schüler brauchen einen Directory-Sync (employeeId), bevor sie verknüpft
                  werden können.
                </AlertDescription>
              </Alert>
            ) : null}

            <SampleList
              label="Ohne Sokrates-ID"
              names={summary.missingSokratesIdSamples}
              total={summary.missingSokratesId}
            />
            <SampleList
              label="Kein NM-Treffer"
              names={summary.noNmMatchSamples}
              total={summary.noNmMatch}
            />
          </div>
        ) : null}
      </CardContent>
    </Card>
  )
}

function SampleList({
  label,
  names,
  total,
}: {
  label: string
  names: string[]
  total: number
}) {
  if (names.length === 0) return null
  return (
    <Collapsible className="rounded-md border">
      <CollapsibleTrigger asChild>
        <Button variant="ghost" className="w-full justify-start gap-2">
          <Link2 className="h-4 w-4" />
          {label} ({total})
        </Button>
      </CollapsibleTrigger>
      <CollapsibleContent>
        <ul className="text-muted-foreground max-h-48 space-y-1 overflow-y-auto px-4 pb-3 text-sm">
          {names.map(name => (
            <li key={name}>{name}</li>
          ))}
          {total > names.length ? <li>… und {total - names.length} weitere</li> : null}
        </ul>
      </CollapsibleContent>
    </Collapsible>
  )
}
