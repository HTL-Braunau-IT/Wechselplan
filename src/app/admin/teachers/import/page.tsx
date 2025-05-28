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

interface Teacher {
  firstName: string
  lastName: string
  schedules?: string[]
}

interface ImportData {
  teachers: Teacher[]
}

export default function ImportPage() {
  const { t } = useTranslation()
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const [importData, setImportData] = useState<ImportData | null>(null)
  const [selectedTeachers, setSelectedTeachers] = useState<Record<string, boolean>>({})

  const handlePreview = async () => {
    setIsLoading(true)
    setError(null)
    setSuccess(null)
    setImportData(null)
    setSelectedTeachers({})

    try {
      const response = await fetch('/api/teachers/import', {
        method: 'POST'
      })

      const data = await response.json() as { userMessage?: string; error?: string; details?: string; teachers?: Teacher[] }

      if (!response.ok) {
        // Handle specific error cases
        if (response.status === 401) {
          throw new Error(data.userMessage ?? t('admin.teachers.import.errors.invalidCredentials'))
        } else if (response.status === 404) {
          throw new Error(data.userMessage ?? t('admin.teachers.import.errors.ouNotFound'))
        } else if (response.status === 503) {
          throw new Error(data.userMessage ?? t('admin.teachers.import.errors.connectionFailed'))
        } else {
          const errorMessage = data.userMessage ?? data.error ?? data.details ?? t('admin.teachers.import.errors.fetchTeachers')
          console.error('Server error:', { status: response.status, data })
          throw new Error(errorMessage)
        }
      }

      if (!data || !Array.isArray(data.teachers)) {
        console.error('Invalid data format:', data)
        throw new Error(t('admin.teachers.import.errors.invalidDataFormat'))
      }

      if (data.teachers.length === 0) {
        console.error('No teachers found in data')
        throw new Error(t('admin.teachers.import.errors.noTeachersFound'))
      }

      // Create properly typed ImportData object
      const importData: ImportData = {
        teachers: data.teachers
      }
      setImportData(importData)

      // Initialize all teachers as selected
      const initialSelection = data.teachers.reduce((acc: Record<string, boolean>, teacher: Teacher) => {
        const key = `${teacher.firstName} ${teacher.lastName}`
        acc[key] = true
        return acc
      }, {})
      setSelectedTeachers(initialSelection)
    } catch (err) {
      console.error('Error fetching teachers:', err)
      setError(err instanceof Error ? err.message : t('admin.teachers.import.errors.fetchTeachers'))
    } finally {
      setIsLoading(false)
    }
  }

  const handleTeacherSelection = (teacherKey: string, checked: boolean) => {
    setSelectedTeachers(prev => ({
      ...prev,
      [teacherKey]: checked
    }))
  }

  const handleImport = async () => {
    if (!importData) return

    const selectedTeacherKeys = Object.entries(selectedTeachers)
      .filter(([_, selected]) => selected)
      .map(([key]) => key)

    if (selectedTeacherKeys.length === 0) {
      setError(t('admin.teachers.import.errors.noTeachersSelected'))
      return
    }

    setIsLoading(true)
    setError(null)
    setSuccess(null)

    try {
      const selectedTeachers = importData.teachers.filter(teacher => 
        selectedTeacherKeys.includes(`${teacher.firstName} ${teacher.lastName}`)
      )

      const response = await fetch('/api/teachers/import/save', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ teachers: selectedTeachers }),
      })

      const data = await response.json() as { userMessage?: string; error?: string; details?: string; teachers?: number; total?: number; skipped?: number }

      if (!response.ok) {
        const errorMessage = data.userMessage ?? data.error ?? data.details ?? t('admin.teachers.import.errors.importTeachers')
        console.error('Server error:', { status: response.status, data })
        throw new Error(errorMessage)
      }

      setSuccess(t('admin.teachers.import.success.importComplete', {
        teachers: data.teachers ?? 0
      }))
      setImportData(null)
      setSelectedTeachers({})
    } catch (err) {
      console.error('Error importing teachers:', err)
      setError(err instanceof Error ? err.message : t('admin.teachers.import.errors.importTeachers'))
    } finally {
      setIsLoading(false)
    }
  }

  const handleCSVImport = async (teachers: Teacher[]) => {
    setIsLoading(true)
    setError(null)
    setSuccess(null)

    try {
      const response = await fetch('/api/teachers', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ teachers }),
      })

      const data = await response.json() as { userMessage?: string; error?: string; details?: string }

      if (!response.ok) {
        const errorMessage = data.userMessage ?? data.error ?? data.details ?? t('admin.teachers.import.errors.importTeachers')
        console.error('Server error:', { status: response.status, data })
        throw new Error(errorMessage)
      }

      setSuccess(t('admin.teachers.import.success.importComplete', {
        teachers: teachers.length
      }))
    } catch (err) {
      console.error('Error importing teachers:', err)
      setError(err instanceof Error ? err.message : t('admin.teachers.import.errors.importTeachers'))
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="container mx-auto p-4">
      <Card>
        <CardHeader>
          <CardTitle>{t('admin.teachers.import.title')}</CardTitle>
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
                {t('admin.teachers.import.ldap')}
              </TabsTrigger>
              <TabsTrigger value="manual" className="data-[state=active]:bg-background data-[state=active]:text-foreground">
                {t('admin.teachers.import.manual')}
              </TabsTrigger>
            </TabsList>

            <TabsContent value="ldap">
              <Card>
                <CardHeader>
                  <CardTitle>{t('admin.teachers.import.ldapTitle')}</CardTitle>
                </CardHeader>
                <CardContent>
                  <Button onClick={handlePreview} disabled={isLoading} className="w-full md:w-auto">
                    {isLoading ? t('admin.teachers.import.loading') : t('admin.teachers.import.previewData')}
                  </Button>

                  {importData && (
                    <div className="space-y-4">
                      <h2 className="text-lg font-semibold">{t('admin.teachers.import.previewTitle')}</h2>
                      <div className="space-y-2">
                        {importData.teachers.map((teacher) => {
                          const teacherKey = `${teacher.firstName} ${teacher.lastName}`
                          return (
                            <div key={teacherKey} className="flex items-center space-x-2">
                              <Checkbox
                                id={teacherKey}
                                checked={selectedTeachers[teacherKey] ?? false}
                                onCheckedChange={(checked) => 
                                  handleTeacherSelection(teacherKey, checked as boolean)
                                }
                              />
                              <Label htmlFor={teacherKey} className="flex-1">
                                {teacher.firstName} {teacher.lastName}
                                {teacher.schedules && teacher.schedules.length > 0 && (
                                  <span className="text-sm text-gray-500 ml-2">
                                    ({teacher.schedules.join(', ')})
                                  </span>
                                )}
                              </Label>
                            </div>
                          )
                        })}
                      </div>
                      <Button 
                        onClick={handleImport} 
                        disabled={isLoading || Object.values(selectedTeachers).every(v => !v)}
                        className="w-full md:w-auto"
                      >
                        {isLoading ? t('admin.teachers.import.loading') : t('admin.teachers.import.importSelected')}
                      </Button>
                    </div>
                  )}
                </CardContent>
              </Card>
            </TabsContent>
            <TabsContent value="manual">
              <CSVImport onImport={async (classes: string[]) => {
                // Convert string[] to Teacher[] before calling handleCSVImport
                const teachers: Teacher[] = classes.map(c => ({
                  firstName: '',
                  lastName: c,
                  schedules: []
                }));
                await handleCSVImport(teachers);
              }} />
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
    </div>
  )
} 