import { useCallback, useState } from 'react'
import { captureFrontendError } from '@/lib/frontend-error'

/** Trigger a browser download for a fetched blob, cleaning up the object URL. */
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

type Params = {
  selectedClassId: string
  className: string | undefined
  schoolYearId: number | undefined
  setError: (message: string | null) => void
}

/** PDF exports for the selected class and for all of the teacher's classes. */
export function usePdfDownload({ selectedClassId, className, schoolYearId, setError }: Params) {
  const [downloadingPdf, setDownloadingPdf] = useState(false)
  const [downloadingAllPdf, setDownloadingAllPdf] = useState(false)

  const withYear = (path: string) =>
    schoolYearId != null
      ? `${path}${path.includes('?') ? '&' : '?'}schoolYearId=${schoolYearId}`
      : path

  const downloadClassPdf = useCallback(async () => {
    if (!selectedClassId || !className) return
    try {
      setDownloadingPdf(true)
      const response = await fetch(withYear(`/api/notensammler/pdf?classId=${selectedClassId}`))
      if (!response.ok) throw new Error('Failed to generate PDF')
      const today = new Date().toLocaleDateString('de-DE')
      await downloadBlob(response, `notensammler-${className}-${today}.pdf`)
    } catch (e) {
      captureFrontendError(e, { location: 'notensammler', type: 'download-pdf' })
      setError(e instanceof Error ? e.message : 'Failed to download PDF')
    } finally {
      setDownloadingPdf(false)
    }
  }, [selectedClassId, className, schoolYearId, setError])

  const downloadAllClassesPdf = useCallback(async () => {
    try {
      setDownloadingAllPdf(true)
      const response = await fetch(withYear('/api/notensammler/pdf/all'))
      if (!response.ok) throw new Error('Failed to generate PDF')
      const today = new Date().toLocaleDateString('de-DE')
      await downloadBlob(response, `notensammler-alle-klassen-${today}.pdf`)
    } catch (e) {
      captureFrontendError(e, { location: 'notensammler', type: 'download-all-pdf' })
      setError(e instanceof Error ? e.message : 'Failed to download PDF')
    } finally {
      setDownloadingAllPdf(false)
    }
  }, [schoolYearId, setError])

  return { downloadingPdf, downloadingAllPdf, downloadClassPdf, downloadAllClassesPdf }
}
