'use client'

import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/button'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Checkbox } from '@/components/ui/checkbox'
import { Label } from '@/components/ui/label'
import { Download, Upload } from 'lucide-react'

interface CSVStudent {
  firstName: string
  lastName: string
}

interface CSVClass {
  name: string
  students: CSVStudent[]
}

interface CSVImportProps {
  onImport: (classes: string[]) => Promise<void>
}

export function CSVImport({ onImport }: CSVImportProps) {
  const { t } = useTranslation()
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [csvData, setCSVData] = useState<Record<string, CSVClass> | null>(null)
  const [selectedClasses, setSelectedClasses] = useState<Record<string, boolean>>({})

  const handleDownloadSample = async () => {
    try {
      const response = await fetch('/api/students/import/sample')
      const blob = await response.blob()
      const url = window.URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = 'sample_students.csv'
      document.body.appendChild(a)
      a.click()
      window.URL.revokeObjectURL(url)
      document.body.removeChild(a)
    } catch (err) {
      console.error('Error downloading sample:', err)
      setError(t('admin.students.import.errors.downloadSample'))
    }
  }

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return

    setIsLoading(true)
    setError(null)
    setCSVData(null)
    setSelectedClasses({})

    try {
      const text = await file.text()
      const lines = text.split('\n')
      
      // Skip header row and empty lines
      const dataLines = lines.slice(1).filter(line => line.trim())
      
      const classes: Record<string, CSVClass> = {}
      
      for (const line of dataLines) {
        const [className, firstName, lastName] = line.split(',').map(field => field.trim())
        
        if (!className || !firstName || !lastName) {
          throw new Error('Invalid CSV format')
        }

        classes[className] ??= {
          name: className,
          students: []
        }

        classes[className].students.push({
          firstName,
          lastName
        })
      }

      setCSVData(classes)
      
      // Initialize all classes as selected
      const initialSelection = Object.keys(classes).reduce((acc, className) => {
        acc[className] = true
        return acc
      }, {} as Record<string, boolean>)
      setSelectedClasses(initialSelection)
    } catch (err) {
      console.error('Error parsing CSV:', err)
      setError(t('admin.students.import.errors.invalidCSV'))
    } finally {
      setIsLoading(false)
    }
  }

  const handleClassSelection = (className: string, checked: boolean) => {
    setSelectedClasses(prev => ({
      ...prev,
      [className]: checked
    }))
  }

  const handleImport = async () => {
    const selectedClassNames = Object.entries(selectedClasses)
      .filter(([_, selected]) => selected)
      .map(([className]) => className)

    if (selectedClassNames.length === 0) {
      setError(t('admin.students.import.errors.noClassesSelected'))
      return
    }

    setIsLoading(true)
    setError(null)

    try {
      await onImport(selectedClassNames)
      setCSVData(null)
      setSelectedClasses({})
    } catch (err) {
      console.error('Error importing CSV:', err)
      setError(t('admin.students.import.errors.importFailed'))
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
          <span>{t('admin.students.import.downloadSample')}</span>
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
            className="cursor-pointer inline-flex items-center justify-center px-4 py-2 border border-input rounded-md shadow-sm text-sm font-medium bg-background hover:bg-accent hover:text-accent-foreground"
          >
            <Upload className="h-4 w-4 mr-2" />
            {t('admin.students.import.uploadCSV')}
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
          <div className="flex justify-end space-x-4">
            <Button onClick={handleImport} disabled={isLoading}>
              {t('admin.students.import.importSelected')}
            </Button>
          </div>

          <h2 className="text-xl font-semibold">{t('admin.students.import.previewTitle')}</h2>
          <div className="space-y-4">
            {Object.entries(csvData).map(([className, data]) => (
              <div key={className} className="border rounded-lg p-4 bg-muted">
                <div className="flex items-center space-x-2 mb-2">
                  <Checkbox
                    id={`class-${className}`}
                    checked={selectedClasses[className] ?? false}
                    onCheckedChange={(checked) => handleClassSelection(className, checked as boolean)}
                  />
                  <Label htmlFor={`class-${className}`} className="font-medium">
                    {t('admin.students.import.classLabel', { name: className, count: data.students.length })}
                  </Label>
                </div>
                <div className="ml-6">
                  <ul className="space-y-1 text-muted-foreground">
                    {data.students.map((student, index) => (
                      <li key={index} className={`py-1 px-2 rounded ${index % 2 === 0 ? 'bg-muted/50' : 'bg-muted'}`}>
                        {student.firstName} {student.lastName}
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
} 