'use client'

import { useCallback, useEffect, useState } from 'react'
import { Bell, AlertCircle } from 'lucide-react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Spinner } from '@/components/ui/spinner'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { PageContainer } from '@/components/ui/page-container'
import { PageHeader } from '@/components/ui/page-header'
import { toast } from 'sonner'

interface NotificationSettings {
  emailDigestEnabled: boolean
  lastDigestRunAt: string | null
  lastDigestStatus: string | null
  lastDigestSummary: unknown
}

const formatDateTime = (iso: string | null): string => {
  if (!iso) return '—'
  return new Date(iso).toLocaleString('de-AT', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'Europe/Vienna',
  })
}

/**
 * Notification settings (admin). Currently the single master switch for the
 * daily e-mail digest of unacknowledged notifications (issue #96).
 */
export default function NotificationSettingsPage() {
  const [settings, setSettings] = useState<NotificationSettings | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/admin/notification-settings', { cache: 'no-store' })
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string }
        throw new Error(body.error ?? `Einstellungen konnten nicht geladen werden (${res.status})`)
      }
      setSettings((await res.json()) as NotificationSettings)
      setError(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Einstellungen konnten nicht geladen werden')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const handleToggle = async (enabled: boolean) => {
    setSaving(true)
    setError(null)
    // Optimistic: reflect the flip immediately, roll back if the save fails.
    setSettings(prev => (prev ? { ...prev, emailDigestEnabled: enabled } : prev))
    try {
      const res = await fetch('/api/admin/notification-settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ emailDigestEnabled: enabled }),
      })
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string }
        throw new Error(body.error ?? `Speichern fehlgeschlagen (${res.status})`)
      }
      setSettings((await res.json()) as NotificationSettings)
      toast.success(enabled ? 'E-Mail-Digest aktiviert' : 'E-Mail-Digest deaktiviert')
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Speichern fehlgeschlagen'
      setError(message)
      toast.error(message)
      setSettings(prev => (prev ? { ...prev, emailDigestEnabled: !enabled } : prev))
    } finally {
      setSaving(false)
    }
  }

  return (
    <PageContainer size="wide" className="space-y-6">
      <PageHeader
        icon={Bell}
        title="Benachrichtigungen"
        description="Einstellungen für die In-App-Benachrichtigungen und den E-Mail-Digest."
      />

      {error && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Fehler</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {loading ? (
        <Card>
          <CardContent className="text-muted-foreground flex items-center gap-2 py-6">
            <Spinner className="h-4 w-4" />
            Einstellungen werden geladen …
          </CardContent>
        </Card>
      ) : settings ? (
        <Card>
          <CardHeader>
            <CardTitle>E-Mail-Digest</CardTitle>
            <CardDescription>
              Wer neue Benachrichtigungen länger als 24 Stunden nicht bestätigt, bekommt eine
              E-Mail mit einer Zusammenfassung. Ein externer Zeitplan (Cron) muss den Digest-Lauf
              täglich auslösen.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between gap-4">
              <div className="space-y-0.5">
                <Label htmlFor="email-digest" className="text-sm font-medium">
                  E-Mail-Digest aktiv
                </Label>
                <p className="text-muted-foreground text-xs">
                  Master-Schalter für den täglichen E-Mail-Digest.
                </p>
              </div>
              <Switch
                id="email-digest"
                checked={settings.emailDigestEnabled}
                disabled={saving}
                onCheckedChange={checked => void handleToggle(checked)}
              />
            </div>

            <div className="text-muted-foreground border-t pt-3 text-xs">
              <p>
                Letzter Lauf: {formatDateTime(settings.lastDigestRunAt)}
                {settings.lastDigestStatus ? ` · Status: ${settings.lastDigestStatus}` : ''}
              </p>
            </div>
          </CardContent>
        </Card>
      ) : null}
    </PageContainer>
  )
}
