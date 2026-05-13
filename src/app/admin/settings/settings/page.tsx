'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Spinner } from '@/components/ui/spinner'
import { AlertCircle, Save } from 'lucide-react'
import { toast } from 'sonner'
import { getApiErrorMessage, parseJsonSafe, unwrapData } from '@/lib/api-client'
import type { ScheduleLimitValues } from '@/lib/schedule-limits-shared'

export default function GeneralSettingsPage() {
  const [settings, setSettings] = useState<ScheduleLimitValues | null>(null)
  const [draft, setDraft] = useState<ScheduleLimitValues | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setIsLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/settings/schedule-limits', { cache: 'no-store' })
      const payload = await parseJsonSafe(res)
      if (!res.ok) {
        throw new Error(
          getApiErrorMessage(payload, `Einstellungen konnten nicht geladen werden (${res.status})`),
        )
      }
      const data = unwrapData<ScheduleLimitValues>(payload)
      setSettings(data)
      setDraft(data)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Einstellungen konnten nicht geladen werden')
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const capacity = useMemo(() => {
    if (!draft) return 0
    return draft.maxScheduleGroups * draft.maxStudentsPerGroup
  }, [draft])

  async function handleSave() {
    if (!draft || !settings) return
    setIsSaving(true)
    setError(null)
    try {
      const res = await fetch('/api/admin/general-settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          maxStudentsPerGroup: draft.maxStudentsPerGroup,
          maxScheduleGroups: draft.maxScheduleGroups,
          maxSupportedStudents: draft.maxSupportedStudents,
        }),
      })
      const payload = await parseJsonSafe(res)
      if (!res.ok) {
        throw new Error(getApiErrorMessage(payload, `Speichern fehlgeschlagen (${res.status})`))
      }
      const data = unwrapData<ScheduleLimitValues>(payload)
      setSettings(data)
      setDraft(data)
      toast.success('Einstellungen gespeichert')
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Speichern fehlgeschlagen'
      setError(msg)
      toast.error(msg)
    } finally {
      setIsSaving(false)
    }
  }

  const dirty =
    draft &&
    settings &&
    (draft.maxStudentsPerGroup !== settings.maxStudentsPerGroup ||
      draft.maxScheduleGroups !== settings.maxScheduleGroups ||
      draft.maxSupportedStudents !== settings.maxSupportedStudents)

  return (
    <div className="max-w-xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Generelle Einstellungen</h1>
        <p className="text-muted-foreground text-sm mt-1">
          Grenzen für die Schülergruppen beim Erstellen des Wechselplans (Zuweisung pro Wochentag).
        </p>
      </div>

      {error ? (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Fehler</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>Wechselplan / Gruppen</CardTitle>
          <CardDescription>
            Maximal möglich laut aktuellen Werten:{' '}
            <span className="font-medium text-foreground">{capacity} Schüler</span> (
            {draft?.maxScheduleGroups ?? '–'} Gruppen × {draft?.maxStudentsPerGroup ?? '–'} Schüler je
            Gruppe). Die Obergrenze pro Klasse darf diese Kapazität nicht überschreiten.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {isLoading || !draft ? (
            <div className="flex items-center gap-2 text-muted-foreground">
              <Spinner className="h-5 w-5" />
              <span>Lade Einstellungen…</span>
            </div>
          ) : (
            <>
              <div className="space-y-2">
                <Label htmlFor="maxStudentsPerGroup">Max. Schüler je Gruppe</Label>
                <Input
                  id="maxStudentsPerGroup"
                  type="number"
                  min={1}
                  max={50}
                  value={draft.maxStudentsPerGroup}
                  onChange={(e) =>
                    setDraft((d) =>
                      d ? { ...d, maxStudentsPerGroup: Number(e.target.value) || 0 } : d,
                    )
                  }
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="maxScheduleGroups">Max. Anzahl Gruppen (ohne „Nicht zugewiesen“)</Label>
                <Input
                  id="maxScheduleGroups"
                  type="number"
                  min={2}
                  max={10}
                  value={draft.maxScheduleGroups}
                  onChange={(e) =>
                    setDraft((d) =>
                      d ? { ...d, maxScheduleGroups: Number(e.target.value) || 0 } : d,
                    )
                  }
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="maxSupportedStudents">Max. Schüler pro Klasse (Wechselplan)</Label>
                <Input
                  id="maxSupportedStudents"
                  type="number"
                  min={1}
                  value={draft.maxSupportedStudents}
                  onChange={(e) =>
                    setDraft((d) =>
                      d ? { ...d, maxSupportedStudents: Number(e.target.value) || 0 } : d,
                    )
                  }
                />
              </div>
              <div className="flex gap-2">
                <Button type="button" onClick={() => void handleSave()} disabled={!dirty || isSaving}>
                  {isSaving ? (
                    <>
                      <Spinner className="h-4 w-4 mr-2" />
                      Speichern…
                    </>
                  ) : (
                    <>
                      <Save className="h-4 w-4 mr-2" />
                      Speichern
                    </>
                  )}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => settings && setDraft(settings)}
                  disabled={!dirty || isSaving}
                >
                  Zurücksetzen
                </Button>
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
