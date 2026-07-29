'use client'

import { useEffect, useState } from 'react'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import { PageContainer } from '@/components/ui/page-container'
import { PageHeader } from '@/components/ui/page-header'
import { EmptyState } from '@/components/ui/empty-state'
import { toast } from 'sonner'
import type { Teacher, Class } from '@/types/types.ts'
import { Loader2, School } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Spinner } from '@/components/ui/spinner'
import { useSchoolYear } from '@/contexts/school-year-context'

const NONE_VALUE = 'none'

interface ErrorResponse {
  error: string
}

/**
 * Renders a centered loading spinner with a localized loading message.
 */
function LoadingScreen() {
  const { t } = useTranslation()
  return (
    <div className="flex min-h-[400px] flex-col items-center justify-center gap-4">
      <Spinner size="lg" />
      <p className="text-muted-foreground text-lg">{t('classSettings.loading')}</p>
    </div>
  )
}

/**
 * Displays and manages class settings, allowing assignment of teachers as class heads or leads.
 *
 * Fetches class and teacher data, displays a list of classes with dropdowns to select or remove class heads and leads, and updates assignments via API requests. Provides loading and updating indicators, and shows notifications for success or error states.
 */
export default function ClassSettingsPage() {
  const { t } = useTranslation()
  const { selectedYear } = useSchoolYear()
  const schoolYearId = selectedYear?.id
  const [classes, setClasses] = useState<Class[]>([])
  const [teachers, setTeachers] = useState<Teacher[]>([])
  const [loading, setLoading] = useState(true)
  const [updatingClassId, setUpdatingClassId] = useState<number | null>(null)
  const [updatingField, setUpdatingField] = useState<'head' | 'lead' | null>(null)

  useEffect(() => {
    const fetchData = async () => {
      try {
        // Start both requests simultaneously
        const classesUrl =
          schoolYearId != null ? `/api/classes?schoolYearId=${schoolYearId}` : '/api/classes'
        const [classesPromise, teachersPromise] = [fetch(classesUrl), fetch('/api/teachers')]

        // Wait for both requests to complete, regardless of success/failure
        const [classesResult, teachersResult] = await Promise.allSettled([
          classesPromise,
          teachersPromise,
        ])

        // Handle classes result
        if (classesResult.status === 'fulfilled' && classesResult.value.ok) {
          const classesData = await classesResult.value.json()
          setClasses(classesData as Class[])
        } else {
          throw new Error('Failed to fetch classes')
        }

        // Handle teachers result
        if (teachersResult.status === 'fulfilled' && teachersResult.value.ok) {
          const teachersData = await teachersResult.value.json()
          setTeachers(teachersData as Teacher[])
        } else {
          throw new Error('Failed to fetch teachers')
        }
      } catch (error) {
        toast.error(t('classSettings.error.load'))
        console.error(error)
      } finally {
        setLoading(false)
      }
    }

    void fetchData()
  }, [t, schoolYearId])

  const handleTeacherChange = async (
    classId: number,
    teacherId: number | null,
    type: 'head' | 'lead',
  ) => {
    if (updatingClassId !== null) {
      return // Prevent multiple simultaneous updates
    }

    setUpdatingClassId(classId)
    setUpdatingField(type)

    try {
      const response = await fetch(`/api/classes/${classId}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          [type === 'head' ? 'classHeadId' : 'classLeadId']: teacherId,
        }),
      })

      if (!response.ok) {
        const errorData = (await response.json()) as ErrorResponse
        throw new Error(errorData.error ?? t('classSettings.error.update'))
      }

      const updatedClass = (await response.json()) as Class
      setClasses(prevClasses => prevClasses.map(c => (c.id === classId ? updatedClass : c)))

      toast.success(t('classSettings.success'))
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t('classSettings.error.update'))
      console.error(error)
    } finally {
      setUpdatingClassId(null)
      setUpdatingField(null)
    }
  }

  if (loading) {
    return <LoadingScreen />
  }

  return (
    <PageContainer>
      <div className="space-y-6">
        <PageHeader icon={School} title={t('classSettings.title')} />
        {classes.length === 0 ? (
          <EmptyState icon={School} title={t('classSettings.title')} />
        ) : (
          <div className="grid gap-6 xl:grid-cols-2">
            {classes.map(cls => (
              <Card key={cls.id}>
                <CardHeader>
                  <CardTitle>{cls.name}</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div className="space-y-2">
                      <Label htmlFor={`class-head-${cls.id}`}>{t('classSettings.classHead')}</Label>
                      <div className="relative">
                        <Select
                          value={cls.classHeadId ? cls.classHeadId.toString() : NONE_VALUE}
                          onValueChange={value =>
                            handleTeacherChange(
                              cls.id,
                              value === NONE_VALUE ? null : parseInt(value),
                              'head',
                            )
                          }
                        >
                          <SelectTrigger id={`class-head-${cls.id}`}>
                            <SelectValue placeholder={t('classSettings.selectClassHead')} />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value={NONE_VALUE}>{t('classSettings.none')}</SelectItem>
                            {teachers.map(teacher => (
                              <SelectItem key={teacher.id} value={teacher.id.toString()}>
                                {teacher.firstName} {teacher.lastName}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        {updatingClassId === cls.id && updatingField === 'head' && (
                          <div className="text-muted-foreground absolute top-1/2 right-8 flex -translate-y-1/2 items-center gap-2 text-sm">
                            <Loader2 className="h-4 w-4 animate-spin" />
                            <span>{t('classSettings.updating')}</span>
                          </div>
                        )}
                      </div>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor={`class-lead-${cls.id}`}>{t('classSettings.classLead')}</Label>
                      <div className="relative">
                        <Select
                          value={cls.classLeadId ? cls.classLeadId.toString() : NONE_VALUE}
                          onValueChange={value =>
                            handleTeacherChange(
                              cls.id,
                              value === NONE_VALUE ? null : parseInt(value),
                              'lead',
                            )
                          }
                        >
                          <SelectTrigger id={`class-lead-${cls.id}`}>
                            <SelectValue placeholder={t('classSettings.selectClassLead')} />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value={NONE_VALUE}>{t('classSettings.none')}</SelectItem>
                            {teachers.map(teacher => (
                              <SelectItem key={teacher.id} value={teacher.id.toString()}>
                                {teacher.firstName} {teacher.lastName}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        {updatingClassId === cls.id && updatingField === 'lead' && (
                          <div className="text-muted-foreground absolute top-1/2 right-8 flex -translate-y-1/2 items-center gap-2 text-sm">
                            <Loader2 className="h-4 w-4 animate-spin" />
                            <span>{t('classSettings.updating')}</span>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </PageContainer>
  )
}
