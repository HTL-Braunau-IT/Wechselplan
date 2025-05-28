'use client'

import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/button'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Checkbox } from '@/components/ui/checkbox'
import { CSVImport } from '@/components/admin/csv-import'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Label } from '@/components/ui/label'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'

interface Student {
  givenName: string
  sn: string
}

interface ClassData {
  students: Student[]
}

type ImportData = Record<string, ClassData>

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

      const data = await response.json() as { userMessage?: string; error?: string; details?: string; classes?: Array<{ name: string; students: Array<{ firstName: string; lastName: string }> }> }

      if (!response.ok) {
        // Handle specific error cases
        if (response.status === 401) {
          throw new Error(data.userMessage ?? 'Invalid LDAP credentials. Please check your username and password.')
        } else if (response.status === 404) {
          throw new Error(data.userMessage ?? 'Students OU not found. Please check your LDAP configuration.')
        } else if (response.status === 503) {
          throw new Error(data.userMessage ?? 'Failed to connect to LDAP server. Please try again later.')
        } else {
          const errorMessage = data.userMessage ?? data.error ?? data.details ?? t('admin.students.import.errors.fetchStudents')
          console.error('Server error:', { status: response.status, data })
          throw new Error(errorMessage)
        }
      }

      console.log('Received data from server:', data)
      
      // Validate the data structure
      if (!data || !Array.isArray(data.classes)) {
        console.error('Invalid data format:', data)
        throw new Error(t('admin.students.import.errors.invalidDataFormat'))
      }

      // Transform the data to match our frontend structure
      const validatedData = data.classes.reduce((acc, classData) => {
        if (classData.name && Array.isArray(classData.students)) {
          acc[classData.name] = {
            students: classData.students.map(student => ({
              givenName: student.firstName ?? '',
              sn: student.lastName ?? ''
            }))
          }
        }
        return acc
      }, {} as ImportData)

      console.log('Validated data:', validatedData)

      if (Object.keys(validatedData).length === 0) {
        console.error('No valid classes found in data')
        throw new Error(t('admin.students.import.errors.noClassesFound'))
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
      setError(err instanceof Error ? err.message : t('admin.students.import.errors.fetchStudents'))
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

      const data = await response.json() as { userMessage?: string; error?: string; details?: string; students?: number; classes?: number }

      if (!response.ok) {
        const errorMessage = data.userMessage ?? data.error ?? data.details ?? t('admin.students.import.errors.importStudents')
        console.error('Server error:', { status: response.status, data })
        throw new Error(errorMessage)
      }

      setSuccess(t('admin.students.import.success.importComplete', {
        students: data.students ?? 0,
        classes: data.classes ?? 0
      }))
      setImportData(null)
      setSelectedClasses({})
    } catch (err) {
      console.error('Error importing students:', err)
      setError(err instanceof Error ? err.message : t('admin.students.import.errors.importStudents'))
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
    <div className="container mx-auto p-4">
      <Card>
        <CardHeader>
          <CardTitle>{t('admin.students.import.title')}</CardTitle>
        </CardHeader>
        <CardContent>
          {error && (
            <Alert variant="destructive" className="mb-4">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          {success && (
            <Alert className="mb-4">
              <AlertDescription>{success}</AlertDescription>
            </Alert>
          )}

          <Tabs defaultValue="ldap" className="space-y-4">
            <TabsList className="bg-muted/50">
              <TabsTrigger value="ldap" className="data-[state=active]:bg-background data-[state=active]:text-foreground">
                {t('admin.students.import.ldap')}
              </TabsTrigger>
              <TabsTrigger value="manual" className="data-[state=active]:bg-background data-[state=active]:text-foreground">
                {t('admin.students.import.manual')}
              </TabsTrigger>
            </TabsList>

            <TabsContent value="ldap">
              <Card>
                <CardHeader>
                  <CardTitle>{t('admin.students.import.ldapTitle')}</CardTitle>
                </CardHeader>
                <CardContent>
                  <Button onClick={handlePreview} disabled={isLoading} className="w-full md:w-auto">
                    {isLoading ? t('admin.students.import.loading') : t('admin.students.import.previewData')}
                  </Button>

                  {importData && (
                    <div className="space-y-4">
                      <h2 className="text-xl font-semibold">{t('admin.students.import.previewTitle')}</h2>
                      <div className="flex justify-begin">
                        <Button onClick={() => handleImport(Object.keys(selectedClasses).filter(key => selectedClasses[key]))} disabled={isLoading}>
                          {t('admin.students.import.importSelected')}
                        </Button>
                      </div>
                      <div className="space-y-4">
                        {Object.entries(importData).map(([className, data]) => (
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
                                    {student.givenName} {student.sn}
                                  </li>
                                ))}
                              </ul>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="manual">
              <CSVImport onImport={handleImport} />
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
    </div>
  )
} 