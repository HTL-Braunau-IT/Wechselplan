'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { useTranslation } from 'react-i18next'
import { AlertCircle, FileText } from 'lucide-react'
import { useSchoolYear } from '@/contexts/school-year-context'
import { PageContainer } from '@/components/ui/page-container'
import { PageHeader } from '@/components/ui/page-header'
import { Spinner } from '@/components/ui/spinner'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { EmptyState } from '@/components/ui/empty-state'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { captureFrontendError } from '@/lib/frontend-error'
import { errorMessageOf } from '@/lib/api-client'
import { formatDateGerman } from '@/lib/pdf-helpers'
import { ClassChips } from './_components/class-chips'
import { DownloadMenu } from './_components/download-menu'
import { KlassenlistePreview } from './_components/klassenliste-preview'
import { useKlassenlisteClasses, useKlassenlisteData } from './_hooks/use-klassenliste'
import type { WritingSpace } from './_lib/types'

async function downloadBlob(response: Response, filename: string) {
  const blob = await response.blob()
  const blobUrl = window.URL.createObjectURL(blob)
  try {
    const link = document.createElement('a')
    link.href = blobUrl
    link.download = filename
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
  } finally {
    window.URL.revokeObjectURL(blobUrl)
  }
}

/**
 * Klassenlisten — download a class's roster as a printable A4 PDF with space to
 * tick attendance or take notes. Pick a class, choose which rotation groups and
 * how much writing space to print, preview the sheet, and download it.
 */
export default function KlassenlistenPage() {
  const { t } = useTranslation()
  const router = useRouter()
  const searchParams = useSearchParams()
  const { selectedYear } = useSchoolYear()
  const schoolYearId = selectedYear?.id

  const classesQuery = useKlassenlisteClasses(schoolYearId)
  const classes = useMemo(() => classesQuery.data ?? [], [classesQuery.data])

  const classParam = searchParams.get('class')
  const selectedClassId = classParam ? parseInt(classParam, 10) : null
  const selectedValid = selectedClassId != null && classes.some(c => c.id === selectedClassId)

  // Groups are per weekday: `?day=` picks whose groups the list is split into.
  const dayParam = Number(searchParams.get('day'))
  const requestedDay =
    Number.isInteger(dayParam) && dayParam >= 1 && dayParam <= 5 ? dayParam : null
  const dataQuery = useKlassenlisteData(
    selectedValid ? selectedClassId : null,
    schoolYearId,
    requestedDay,
  )
  const data = dataQuery.data

  const [space, setSpace] = useState<WritingSpace>('split')
  const [selectedGroupIds, setSelectedGroupIds] = useState<number[]>([])
  const [downloading, setDownloading] = useState(false)
  const [downloadError, setDownloadError] = useState<string | null>(null)

  // Reset the group selection to "all" whenever a different class's data arrives.
  useEffect(() => {
    if (!data) return
    setSelectedGroupIds(data.hasPlan ? data.sections.map(s => s.id) : [])
  }, [data])

  const onSelectClass = useCallback(
    (classId: number) => {
      setDownloadError(null)
      router.push(`/klassenlisten?class=${classId}`)
    },
    [router],
  )

  const toggleGroup = useCallback((id: number) => {
    setSelectedGroupIds(prev =>
      prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id].sort((a, b) => a - b),
    )
  }, [])

  const toggleAll = useCallback(() => {
    if (!data) return
    const allIds = data.sections.map(s => s.id)
    setSelectedGroupIds(prev => (prev.length === allIds.length ? [] : allIds))
  }, [data])

  const onDownload = useCallback(async () => {
    if (selectedClassId == null || !data) return
    setDownloadError(null)
    setDownloading(true)
    try {
      const params = new URLSearchParams({ classId: String(selectedClassId), space })
      if (schoolYearId != null) params.set('schoolYearId', String(schoolYearId))
      if (data.groupWeekday != null) params.set('weekday', String(data.groupWeekday))
      if (data.hasPlan && selectedGroupIds.length > 0) {
        params.set('groups', selectedGroupIds.join(','))
      }
      const response = await fetch(`/api/klassenliste/pdf?${params.toString()}`)
      if (!response.ok) throw new Error('Failed to generate PDF')
      const today = new Date().toLocaleDateString('de-DE')
      await downloadBlob(response, `Klassenliste-${data.className}-${today}.pdf`)
    } catch (e) {
      captureFrontendError(e, { location: 'klassenlisten', type: 'download-pdf' })
      setDownloadError(errorMessageOf(e, 'PDF konnte nicht erstellt werden.'))
    } finally {
      setDownloading(false)
    }
  }, [selectedClassId, data, space, schoolYearId, selectedGroupIds])

  const createdAt = formatDateGerman(new Date())

  return (
    <PageContainer size="wide" className="space-y-6">
      <PageHeader
        icon={FileText}
        title={t('klassenlisten.title', 'Klassenlisten')}
        description={t(
          'klassenlisten.subtitle',
          'Klassenliste als PDF herunterladen — mit Platz zum Abhaken und Mitschreiben.',
        )}
        actions={
          data && !dataQuery.isLoading ? (
            <DownloadMenu
              data={data}
              selectedGroupIds={selectedGroupIds}
              onToggleGroup={toggleGroup}
              onToggleAll={toggleAll}
              space={space}
              onSpaceChange={setSpace}
              onDownload={onDownload}
              downloading={downloading}
            />
          ) : null
        }
      />

      {(classesQuery.isError || downloadError) && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>{t('klassenlisten.errorTitle', 'Fehler')}</AlertTitle>
          <AlertDescription>
            {downloadError ??
              errorMessageOf(classesQuery.error, 'Klassen konnten nicht geladen werden.')}
          </AlertDescription>
        </Alert>
      )}

      {classesQuery.isLoading ? (
        <div className="flex min-h-[240px] items-center justify-center">
          <Spinner size="lg" />
        </div>
      ) : classes.length === 0 ? (
        <EmptyState
          icon={FileText}
          title={t('klassenlisten.noClassesTitle', 'Keine Klassen gefunden')}
          description={t(
            'klassenlisten.noClassesDesc',
            'Für das ausgewählte Schuljahr sind keine Klassen vorhanden.',
          )}
        />
      ) : (
        <>
          <ClassChips
            classes={classes}
            selectedClassId={selectedValid ? selectedClassId : null}
            onSelect={onSelectClass}
          />

          {selectedValid && data && data.weekdays.length > 1 && (
            <Tabs
              value={String(data.groupWeekday ?? '')}
              onValueChange={v => router.push(`/klassenlisten?class=${selectedClassId}&day=${v}`)}
            >
              <TabsList>
                {data.weekdays.map(day => (
                  <TabsTrigger key={day} value={String(day)}>
                    {t('klassenlisten.groupsOnDay', 'Gruppen {{day}}', {
                      day: t(`raumplan.weekdays.${day}`),
                    })}
                  </TabsTrigger>
                ))}
              </TabsList>
            </Tabs>
          )}

          {!selectedValid ? (
            <EmptyState
              icon={FileText}
              title={t('klassenlisten.noClassSelectedTitle', 'Keine Klasse ausgewählt')}
              description={t(
                'klassenlisten.noClassSelectedDesc',
                'Wähle oben eine Klasse, um ihre Liste als PDF herunterzuladen.',
              )}
            />
          ) : dataQuery.isLoading ? (
            <div className="flex min-h-[240px] items-center justify-center">
              <Spinner size="lg" />
            </div>
          ) : dataQuery.isError ? (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertTitle>{t('klassenlisten.errorTitle', 'Fehler')}</AlertTitle>
              <AlertDescription>
                {errorMessageOf(dataQuery.error, 'Klassenliste konnte nicht geladen werden.')}
              </AlertDescription>
            </Alert>
          ) : data ? (
            <div className="space-y-3">
              <div className="flex items-baseline gap-2">
                <h2 className="text-base font-semibold tracking-tight">
                  {t('klassenlisten.preview', 'Vorschau')}
                </h2>
                <span className="text-muted-foreground text-xs">
                  {t('klassenlisten.previewHint', 'A4 hoch · verkleinert dargestellt')}
                </span>
              </div>
              <div className="border-border bg-muted/40 rounded-xl border p-6">
                <KlassenlistePreview
                  data={data}
                  selectedGroupIds={selectedGroupIds}
                  space={space}
                  createdAt={createdAt}
                />
              </div>
            </div>
          ) : null}
        </>
      )}
    </PageContainer>
  )
}
