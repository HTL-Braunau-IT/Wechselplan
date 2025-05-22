'use client'

import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/button'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Checkbox } from '@/components/ui/checkbox'
import { CSVImport } from '@/components/admin/csv-import'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Label } from '@/components/ui/label'

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
      if (!response.ok) {
        throw new Error(t('admin.teachers.import.errors.fetchTeachers'))
      }

      const data = await response.json() as ImportData
      setImportData(data)

      // Initialize all teachers as selected
      const initialSelection = data.teachers.reduce((acc: Record<string, boolean>, teacher: Teacher) => {
        const key = `${teacher.firstName} ${teacher.lastName}`
        acc[key] = true
        return acc
      }, {})
      setSelectedTeachers(initialSelection)
    } catch (err) {
      console.error('Error fetching teachers:', err)
      setError(t('admin.teachers.import.errors.fetchTeachers'))
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
        selectedTeacherKeys.includes(`${teacher.firstName} ${teacher.lastName}-${importData.teachers.indexOf(teacher)}`)
      )

      const response = await fetch('/api/teachers/import/save', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ teachers: selectedTeachers }),
      })

      if (!response.ok) {
        throw new Error(t('admin.teachers.import.errors.importTeachers'))
      }

      const responseData = await response.json() as { teachers: number, total: number, skipped: number }
      setSuccess(t('admin.teachers.import.success.importComplete', {
        teachers: responseData.teachers
      }))
      setImportData(null)
      setSelectedTeachers({})
    } catch (err) {
      console.error('Error importing teachers:', err)
      setError(t('admin.teachers.import.errors.importTeachers'))
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

      if (!response.ok) {
        throw new Error(t('admin.teachers.import.errors.importTeachers'))
      }

      setSuccess(t('admin.teachers.import.success.importComplete', {
        teachers: teachers.length
      }))
    } catch (err) {
      console.error('Error importing teachers:', err)
      setError(t('admin.teachers.import.errors.importTeachers'))
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <>
      <h1 className="text-2xl font-bold mb-6">{t('admin.teachers.import.title')}</h1>

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
            <TabsTrigger value="ldap">{t('admin.teachers.import.ldapTab')}</TabsTrigger>
            <TabsTrigger value="csv">{t('admin.teachers.import.csvTab')}</TabsTrigger>
          </TabsList>
          
          <TabsContent value="ldap" className="space-y-4">
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
          </TabsContent>
          <TabsContent value="csv">
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
      </div>
    </>
  )
} 