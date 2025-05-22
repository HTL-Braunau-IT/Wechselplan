'use client'

import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/button'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Label } from '@/components/ui/label'
import { Download, Upload } from 'lucide-react'

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
          lastName
        }

        if (schedules) {
          teacher.schedules = schedules.split(';').map(s => s.trim())
        }

        teachers.push(teacher)
      }

      setCSVData(teachers)
    } catch (err) {
      console.error('Error parsing CSV:', err)
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
      setError(t('admin.teachers.import.errors.importFailed'))
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center space-x-4">
        <Button
          onClick={handleDownloadSample}
          variant="outline"
          className="flex items-center space-x-2"
        >
          <Download className="h-4 w-4" />
          <span>{t('admin.teachers.import.downloadSample')}</span>
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
            className="cursor-pointer inline-flex items-center justify-center px-4 py-2 border border-gray-300 rounded-md shadow-sm text-sm font-medium text-gray-700 bg-white hover:bg-gray-50"
          >
            <Upload className="h-4 w-4 mr-2" />
            {t('admin.teachers.import.uploadCSV')}
          </Label>
        </div>
      </div>

      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {csvData && (
        <div className="space-y-4">
          <h2 className="text-lg font-semibold">{t('admin.teachers.import.previewTitle')}</h2>
          <div className="space-y-2">
            {csvData.map((teacher, index) => (
              <div key={index} className="flex items-center space-x-2">
                <span className="flex-1">
                  {teacher.firstName} {teacher.lastName}
                  {teacher.schedules && teacher.schedules.length > 0 && (
                    <span className="text-sm text-gray-500 ml-2">
                      ({teacher.schedules.join(', ')})
                    </span>
                  )}
                </span>
              </div>
            ))}
          </div>
          <Button 
            onClick={handleImport} 
            disabled={isLoading}
            className="w-full md:w-auto"
          >
            {isLoading ? t('admin.teachers.import.loading') : t('admin.teachers.import.importSelected')}
          </Button>
        </div>
      )}
    </div>
  )
} 