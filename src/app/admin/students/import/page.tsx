'use client'

import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/button'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Checkbox } from '@/components/ui/checkbox'
import { CSVImport } from '@/components/admin/csv-import'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Label } from '@/components/ui/label'

interface Student {
  givenName: string
  sn: string
}

interface ClassData {
  students: Student[]
}

type ImportData = Record<string, ClassData>

interface APIImportData {
  classes: Array<{
    name: string
    students: Array<{
      firstName: string
      lastName: string
    }>
  }>
}

export default function ImportPage() {
  const { t } = useTranslation()
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const [importData, setImportData] = useState<ImportData | null>(null)
  const [selectedClasses, setSelectedClasses] = useState<Record<string, boolean>>({})

  const handlePreview = async () => {
    setIsLoading(true)
    setError(null)
    setSuccess(null)

    try {
      const response = await fetch('/api/students/import', {
        method: 'POST'
      })

      if (!response.ok) throw new Error()

      const data = await response.json() as APIImportData
      console.log('Received data from server:', data)
      
      // Validate the data structure
      if (!data || !Array.isArray(data.classes)) {
        console.error('Invalid data format:', data)
        throw new Error('Invalid data format received')
      }

      // Transform the data to match our frontend structure
      const validatedData = data.classes.reduce((acc, classData) => {
        if (classData.name && Array.isArray(classData.students)) {
          acc[classData.name] = {
            students: classData.students.map(student => ({
              givenName: student.firstName || '',
              sn: student.lastName || ''
            }))
          }
        }
        return acc
      }, {} as ImportData)

      console.log('Validated data:', validatedData)

      if (Object.keys(validatedData).length === 0) {
        console.error('No valid classes found in data')
        throw new Error('No valid class data found')
      }

      setImportData(validatedData)
      
      // Initialize all classes as selected
      const initialSelection = Object.keys(validatedData).reduce((acc, className) => {
        acc[className] = true
        return acc
      }, {} as Record<string, boolean>)
      setSelectedClasses(initialSelection)
    } catch (err) {
      console.error('Error fetching students:', err)
      setError(t('admin.students.import.errors.fetchStudents'))
    } finally {
      setIsLoading(false)
    }
  }

  const handleImport = async (selectedClassNames: string[]) => {
    setIsLoading(true)
    setError(null)
    setSuccess(null)

    try {
      const response = await fetch('/api/students/import/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          classes: selectedClassNames
        })
      })

      if (!response.ok) throw new Error()

      const data = await response.json() as { students: number; classes: number }
      setSuccess(t('admin.students.import.success.importComplete', {
        students: data.students,
        classes: data.classes
      }))
      setImportData(null)
      setSelectedClasses({})
    } catch (err) {
      console.error('Error importing students:', err)
      setError(t('admin.students.import.errors.importStudents'))
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

  return (
    <>
      <h1 className="text-2xl font-bold mb-6">{t('admin.students.import.title')}</h1>

      <div className="space-y-6">
        {error && (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        {success && (
          <Alert>
            <AlertDescription>{success}</AlertDescription>
          </Alert>
        )}

        <Tabs defaultValue="ldap" className="bg-white rounded-lg shadow p-6">
          <TabsList className="mb-4">
            <TabsTrigger value="ldap">{t('admin.students.import.ldapTab')}</TabsTrigger>
            <TabsTrigger value="csv">{t('admin.students.import.csvTab')}</TabsTrigger>
          </TabsList>
          
          <TabsContent value="ldap" className="space-y-4">
            <Button onClick={handlePreview} disabled={isLoading} className="w-full md:w-auto">
              {isLoading ? t('admin.students.import.loading') : t('admin.students.import.previewData')}
            </Button>

            {importData && (
              <div className="space-y-4">
                <h2 className="text-xl font-semibold">{t('admin.students.import.previewTitle')}</h2>
                <div className="space-y-4">
                  {Object.entries(importData).map(([className, data]) => (
                    <div key={className} className="border rounded-lg p-4 bg-gray-50">
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
                        <ul className="space-y-1 text-gray-600">
                          {data.students.map((student, index) => (
                            <li key={index} className={`py-1 px-2 rounded ${index % 2 === 0 ? 'bg-gray-100' : 'bg-gray-50'}`}>
                              {student.givenName} {student.sn}
                            </li>
                          ))}
                        </ul>
                      </div>
                    </div>
                  ))}
                </div>
                <div className="flex justify-end">
                  <Button onClick={() => handleImport(Object.keys(selectedClasses).filter(key => selectedClasses[key]))} disabled={isLoading}>
                    {t('admin.students.import.importSelected')}
                  </Button>
                </div>
              </div>
            )}
          </TabsContent>

          <TabsContent value="csv">
            <CSVImport onImport={handleImport} />
          </TabsContent>
        </Tabs>
      </div>
    </>
  )
} 