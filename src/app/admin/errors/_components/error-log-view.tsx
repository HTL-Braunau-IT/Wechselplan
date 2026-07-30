'use client'

import { useCallback, useEffect, useState } from 'react'
import { AlertTriangle, Check, ChevronDown, RotateCcw, Trash2 } from 'lucide-react'
import { apiFetch, apiSend, errorMessageOf } from '@/lib/api-client'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { EmptyState } from '@/components/ui/empty-state'
import { PageContainer } from '@/components/ui/page-container'
import { PageHeader } from '@/components/ui/page-header'
import { Spinner } from '@/components/ui/spinner'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { cn } from '@/lib/utils'

interface ErrorRow {
  id: number
  source: string
  level: string
  location: string
  type: string
  message: string
  stack: string | null
  context: unknown
  path: string | null
  method: string | null
  actorName: string | null
  count: number
  firstSeenAt: string
  lastSeenAt: string
  acknowledgedAt: string | null
}

type StatusFilter = 'unresolved' | 'resolved' | 'all'

function formatWhen(iso: string): string {
  return new Date(iso).toLocaleString('de-AT', {
    day: '2-digit',
    month: '2-digit',
    year: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export function ErrorLogView() {
  const [status, setStatus] = useState<StatusFilter>('unresolved')
  const [rows, setRows] = useState<ErrorRow[]>([])
  const [unresolvedCount, setUnresolvedCount] = useState(0)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [expanded, setExpanded] = useState<number | null>(null)
  const [busyId, setBusyId] = useState<number | null>(null)

  const load = useCallback(async () => {
    setIsLoading(true)
    setError(null)
    try {
      const data = await apiFetch<{ errors: ErrorRow[]; unresolvedCount: number }>(
        `/api/admin/error-logs?status=${status}&limit=200`,
        { cache: 'no-store' },
      )
      setRows(data.errors)
      setUnresolvedCount(data.unresolvedCount)
    } catch (err) {
      setError(errorMessageOf(err, 'Fehlerprotokoll konnte nicht geladen werden'))
    } finally {
      setIsLoading(false)
    }
  }, [status])

  useEffect(() => {
    void load()
  }, [load])

  const setAcknowledged = async (id: number, acknowledged: boolean) => {
    setBusyId(id)
    try {
      await apiSend('/api/admin/error-logs', 'PATCH', { id, acknowledged })
      await load()
    } catch (err) {
      setError(errorMessageOf(err, 'Aktion fehlgeschlagen'))
    } finally {
      setBusyId(null)
    }
  }

  const acknowledgeAll = async () => {
    try {
      await apiSend('/api/admin/error-logs', 'PATCH', { action: 'acknowledgeAll' })
      await load()
    } catch (err) {
      setError(errorMessageOf(err, 'Aktion fehlgeschlagen'))
    }
  }

  const clearResolved = async () => {
    try {
      await apiSend('/api/admin/error-logs', 'DELETE')
      await load()
    } catch (err) {
      setError(errorMessageOf(err, 'Löschen fehlgeschlagen'))
    }
  }

  return (
    <PageContainer>
      <PageHeader
        icon={AlertTriangle}
        title="Fehlerprotokoll"
        description="Server- und Browser-Fehler aus der App — ohne Zugriff auf den Host."
        actions={
          <div className="flex flex-wrap gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={acknowledgeAll}
              disabled={unresolvedCount === 0}
            >
              <Check className="mr-1.5 h-4 w-4" />
              Alle erledigen
            </Button>
            <Button variant="outline" size="sm" onClick={clearResolved}>
              <Trash2 className="mr-1.5 h-4 w-4" />
              Erledigte löschen
            </Button>
          </div>
        }
      />

      <div className="mt-6 flex items-center justify-between gap-4">
        <Tabs value={status} onValueChange={value => setStatus(value as StatusFilter)}>
          <TabsList>
            <TabsTrigger value="unresolved">
              Offen{unresolvedCount > 0 ? ` (${unresolvedCount})` : ''}
            </TabsTrigger>
            <TabsTrigger value="resolved">Erledigt</TabsTrigger>
            <TabsTrigger value="all">Alle</TabsTrigger>
          </TabsList>
        </Tabs>
      </div>

      {error ? (
        <p className="text-destructive mt-6 text-sm" role="alert">
          {error}
        </p>
      ) : null}

      {isLoading ? (
        <div className="mt-16 flex justify-center">
          <Spinner />
        </div>
      ) : rows.length === 0 ? (
        <div className="mt-10">
          <EmptyState
            icon={AlertTriangle}
            title="Keine Fehler"
            description={
              status === 'unresolved'
                ? 'Aktuell sind keine offenen Fehler protokolliert.'
                : 'Keine Einträge für diesen Filter.'
            }
          />
        </div>
      ) : (
        <ul className="mt-6 space-y-2">
          {rows.map(row => {
            const isOpen = expanded === row.id
            return (
              <li
                key={row.id}
                className={cn(
                  'rounded-lg border',
                  row.acknowledgedAt ? 'bg-muted/30 border-border' : 'border-border bg-background',
                )}
              >
                <button
                  type="button"
                  onClick={() => setExpanded(isOpen ? null : row.id)}
                  className="hover:bg-accent/40 flex w-full items-start gap-3 rounded-lg px-4 py-3 text-left"
                  aria-expanded={isOpen}
                >
                  <ChevronDown
                    className={cn(
                      'text-muted-foreground mt-0.5 h-4 w-4 shrink-0 transition-transform',
                      isOpen && 'rotate-180',
                    )}
                  />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge variant={row.source === 'client' ? 'secondary' : 'outline'}>
                        {row.source}
                      </Badge>
                      <code className="text-muted-foreground text-xs">{row.location}</code>
                      <span className="text-muted-foreground text-xs">·</span>
                      <code className="text-muted-foreground text-xs">{row.type}</code>
                      {row.count > 1 ? <Badge variant="destructive">×{row.count}</Badge> : null}
                    </div>
                    <p className="mt-1 truncate text-sm font-medium">{row.message}</p>
                    <p className="text-muted-foreground mt-0.5 text-xs">
                      zuletzt {formatWhen(row.lastSeenAt)}
                      {row.actorName ? ` · ${row.actorName}` : ''}
                    </p>
                  </div>
                </button>

                {isOpen ? (
                  <div className="border-border space-y-3 border-t px-4 py-3">
                    {row.path ? (
                      <p className="text-xs">
                        <span className="text-muted-foreground">Pfad: </span>
                        <code>
                          {row.method ? `${row.method} ` : ''}
                          {row.path}
                        </code>
                      </p>
                    ) : null}
                    {row.stack ? (
                      <pre className="bg-muted text-muted-foreground max-h-64 overflow-auto rounded-md p-3 text-xs">
                        {row.stack}
                      </pre>
                    ) : null}
                    {row.context ? (
                      <pre className="bg-muted text-muted-foreground max-h-48 overflow-auto rounded-md p-3 text-xs">
                        {JSON.stringify(row.context, null, 2)}
                      </pre>
                    ) : null}
                    <div className="flex gap-2">
                      {row.acknowledgedAt ? (
                        <Button
                          variant="outline"
                          size="sm"
                          disabled={busyId === row.id}
                          onClick={() => setAcknowledged(row.id, false)}
                        >
                          <RotateCcw className="mr-1.5 h-4 w-4" />
                          Wieder öffnen
                        </Button>
                      ) : (
                        <Button
                          variant="outline"
                          size="sm"
                          disabled={busyId === row.id}
                          onClick={() => setAcknowledged(row.id, true)}
                        >
                          <Check className="mr-1.5 h-4 w-4" />
                          Erledigt
                        </Button>
                      )}
                    </div>
                  </div>
                ) : null}
              </li>
            )
          })}
        </ul>
      )}
    </PageContainer>
  )
}
