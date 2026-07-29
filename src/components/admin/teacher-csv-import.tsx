'use client'

import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/button'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Card, CardContent } from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import { AlertCircle, Download, Upload } from 'lucide-react'
import { captureFrontendError } from '@/lib/frontend-error'

interface Teacher {
  firstName: string
  lastName: string
  schedules?: string[]
}

interface TeacherCSVImportProps {
  onImport: (teachers: Teacher[]) => Promise<void>
}

export function TeacherCSVImport({ onImport }: TeacherCSVImportProps) {
  const { t } = useTranslation()
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [csvData, setCSVData] = useState<Teacher[] | null>(null)

  const handleDownloadSample = async () => {
    try {
      const response = await fetch('/api/teachers/import/sample')
      const blob = await response.blob()
      const url = window.URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = 'sample_teachers.csv'
      document.body.appendChild(a)
      a.click()
      window.URL.revokeObjectURL(url)
      document.body.removeChild(a)
    } catch (err) {
      console.error('Error downloading sample:', err)
      setError(t('admin.teachers.import.errors.downloadSample'))
    }
  }

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return

    setIsLoading(true)
    setError(null)
    setCSVData(null)

    try {
      const text = await file.text()
      const lines = text.split('\n')

      // Skip header row and empty lines
      const dataLines = lines.slice(1).filter(line => line.trim())

      const teachers: Teacher[] = []

      for (const line of dataLines) {
        const [firstName, lastName, schedules] = line.split(',').map(field => field.trim())

        if (!firstName || !lastName) {
          throw new Error('Invalid CSV format')
        }

        const teacher: Teacher = {
          firstName,
          lastName,
        }

        if (schedules) {
          teacher.schedules = schedules.split(';').map(s => s.trim())
        }

        teachers.push(teacher)
      }

      setCSVData(teachers)
    } catch (err) {
      console.error('Error parsing CSV:', err)
      captureFrontendError(err, {
        location: 'admin/teacher-csv-import',
        type: 'parse-csv',
        extra: {
          fileName: file.name,
          fileSize: file.size,
        },
      })
      setError(t('admin.teachers.import.errors.invalidCSV'))
    } finally {
      setIsLoading(false)
    }
  }

  const handleImport = async () => {
    if (!csvData) return

    setIsLoading(true)
    setError(null)

    try {
      await onImport(csvData)
      setCSVData(null)
    } catch (err) {
      console.error('Error importing CSV:', err)
      captureFrontendError(err, {
        location: 'admin/teacher-csv-import',
        type: 'import-csv',
        extra: {
          teachersCount: csvData.length,
        },
      })
      setError(t('admin.teachers.import.errors.importFailed'))
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-4">
        <Button onClick={handleDownloadSample} variant="outline">
          <Download className="mr-2 h-4 w-4" />
          {t('admin.teachers.import.downloadSample')}
        </Button>
        <div className="flex-1">
          <input
            type="file"
            accept=".csv"
            onChange={handleFileUpload}
            className="hidden"
            id="csv-upload"
          />
          <Label
            htmlFor="csv-upload"
            className="border-input bg-background hover:bg-accent hover:text-accent-foreground inline-flex cursor-pointer items-center justify-center rounded-md border px-4 py-2 text-sm font-medium shadow-sm"
          >
            <Upload className="mr-2 h-4 w-4" />
            {t('admin.teachers.import.uploadCSV')}
          </Label>
        </div>
      </div>

      {error && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {csvData && (
        <div className="space-y-4">
          <h2 className="text-lg font-semibold">{t('admin.teachers.import.previewTitle')}</h2>
          <Card>
            <CardContent className="divide-border divide-y p-0">
              {csvData.map((teacher, index) => (
                <div key={index} className="flex items-center px-4 py-2 text-sm">
                  <span className="flex-1">
                    {teacher.firstName} {teacher.lastName}
                    {teacher.schedules && teacher.schedules.length > 0 && (
                      <span className="text-muted-foreground ml-2">
                        ({teacher.schedules.join(', ')})
                      </span>
                    )}
                  </span>
                </div>
              ))}
            </CardContent>
          </Card>
          <Button onClick={handleImport} disabled={isLoading} className="w-full md:w-auto">
            {isLoading
              ? t('admin.teachers.import.loading')
              : t('admin.teachers.import.importSelected')}
          </Button>
        </div>
      )}
    </div>
  )
}
