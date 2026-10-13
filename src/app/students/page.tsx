'use client'

import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { AlertCircle, Search, Users } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { TableSkeleton } from '@/components/ui/skeleton'
import { PageContainer } from '@/components/ui/page-container'
import { PageHeader } from '@/components/ui/page-header'
import { EmptyState } from '@/components/ui/empty-state'
import { useSchoolYear } from '@/contexts/school-year-context'
import { captureFrontendError } from '@/lib/frontend-error'
import { StudentPhoto } from '@/components/student-photo'

interface Student {
  id: number
  firstName: string
  lastName: string
  classId: number | null
  /** Class-wide group — only the fallback now that groups are per weekday. */
  groupId: number | null
  /** The student's group on each planned weekday (see StudentWeekdayGroup). */
  weekdayGroups?: { weekday: number; groupId: number; planClassName: string | null }[]
  createdAt: string
  updatedAt: string
}

/** Sort key: the group on the first planned day (else the class-wide one), then name. */
const firstGroup = (s: Student) => s.weekdayGroups?.[0]?.groupId ?? s.groupId ?? Infinity

const ALL_CLASSES = '__all__'

/** True when every search term occurs in the student's name or class name. */
const matchesSearch = (student: Student, className: string, query: string) => {
  const terms = query
    .toLowerCase()
    .split(/[\s,]+/)
    .filter(Boolean)
  const haystack = `${student.firstName} ${student.lastName} ${className}`.toLowerCase()
  return terms.every(term => haystack.includes(term))
}

interface Class {
  id: number
  name: string
  description: string | null
}

/**
 * Displays an overview of students grouped by their classes and groups.
 *
 * Fetches student and class data from the backend, handles loading and error states, and renders students organized by class and group. Students are sorted alphabetically within each group, and classes are sorted alphabetically with unassigned students shown last.
 */
export default function StudentsPage() {
  const { t } = useTranslation()
  const { selectedYear } = useSchoolYear()
  const schoolYearId = selectedYear?.id
  const [students, setStudents] = useState<Student[]>([])
  const [classes, setClasses] = useState<Class[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [classFilter, setClassFilter] = useState(ALL_CLASSES)

  useEffect(() => {
    void fetchData()
  }, [schoolYearId])

  const fetchData = async () => {
    try {
      setLoading(true)
      setError(null)

      const yearQ = schoolYearId != null ? `?schoolYearId=${schoolYearId}` : ''
      const studentsRes = await fetch(`/api/students/all${yearQ}`, { cache: 'no-store' })
      if (!studentsRes.ok) throw new Error('Failed to fetch students')
      const studentsData = (await studentsRes.json()) as Student[]
      setStudents(studentsData)

      const classesRes = await fetch(`/api/classes${yearQ}`, { cache: 'no-store' })
      if (!classesRes.ok) throw new Error('Failed to fetch classes')
      const classesData = (await classesRes.json()) as Class[]
      setClasses(classesData)
    } catch (e) {
      console.error('Error fetching students data:', e)
      captureFrontendError(e, {
        location: 'students',
        type: 'fetch-data',
      })
      const errMsg = e instanceof Error ? e.message : 'Failed to load data'
      setError(errMsg)
    } finally {
      setLoading(false)
    }
  }

  const getClassName = (classId: number | null) => {
    if (!classId) return 'No Class'
    const classData = classes.find(c => c.id === classId)
    return classData?.name ?? 'Unknown Class'
  }

  if (loading)
    return (
      <PageContainer>
        <div className="space-y-6">
          <PageHeader
            icon={Users}
            title="Students Overview"
            description="All students by class, with their rotation group on each day."
          />
          <Card>
            <CardContent className="pt-6">
              <TableSkeleton rows={6} columns={2} />
            </CardContent>
          </Card>
        </div>
      </PageContainer>
    )

  if (error)
    return (
      <PageContainer>
        <div className="space-y-6">
          <PageHeader icon={Users} title="Students Overview" />
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertTitle>Error</AlertTitle>
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        </div>
      </PageContainer>
    )

  // Group students by class. Groups are per weekday, so a student is not filed
  // under one group any more — each row lists the student's group on every day.
  const studentsByClass = students.reduce(
    (acc, student) => {
      const className = getClassName(student.classId)
      ;(acc[className] ??= []).push(student)
      return acc
    },
    {} as Record<string, Student[]>,
  )

  Object.values(studentsByClass).forEach(classStudents => {
    classStudents.sort((a, b) => {
      // Ungrouped students (Infinity) sort last.
      const [ga, gb] = [firstGroup(a), firstGroup(b)]
      if (ga !== gb) return ga < gb ? -1 : 1
      const lastNameCompare = a.lastName.localeCompare(b.lastName)
      if (lastNameCompare !== 0) return lastNameCompare
      return a.firstName.localeCompare(b.firstName)
    })
  })

  // Sort classes alphabetically
  const sortedClassEntries = Object.entries(studentsByClass).sort(([classNameA], [classNameB]) => {
    // Put "No Class" at the end
    if (classNameA === 'No Class') return 1
    if (classNameB === 'No Class') return -1
    return classNameA.localeCompare(classNameB)
  })

  const filteredClassEntries = sortedClassEntries
    .filter(([className]) => classFilter === ALL_CLASSES || className === classFilter)
    .map(
      ([className, classStudents]) =>
        [className, classStudents.filter(s => matchesSearch(s, className, search))] as const,
    )
    .filter(([, classStudents]) => classStudents.length > 0)
  const filteredCount = filteredClassEntries.reduce((n, [, list]) => n + list.length, 0)

  return (
    <PageContainer>
      <div className="space-y-6">
        <PageHeader
          icon={Users}
          title="Students Overview"
          description="All students by class, with their rotation group on each day."
        />

        {sortedClassEntries.length === 0 ? (
          <EmptyState
            icon={Users}
            title="No students"
            description="No students were found for the selected school year."
          />
        ) : (
          <div className="space-y-6">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
              <div className="relative sm:w-72">
                <Search className="text-muted-foreground pointer-events-none absolute top-2.5 left-2.5 h-4 w-4" />
                <Input
                  type="search"
                  value={search}
                  onChange={event => setSearch(event.target.value)}
                  placeholder={t('studentsPage.searchPlaceholder')}
                  className="pl-8"
                  aria-label={t('studentsPage.searchPlaceholder')}
                />
              </div>
              <Select value={classFilter} onValueChange={setClassFilter}>
                <SelectTrigger className="sm:w-48" aria-label={t('studentsPage.classFilter')}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL_CLASSES}>{t('studentsPage.allClasses')}</SelectItem>
                  {sortedClassEntries.map(([className]) => (
                    <SelectItem key={className} value={className}>
                      {className}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-muted-foreground text-sm sm:ml-auto">
                {t('studentsPage.resultCount', { count: filteredCount, total: students.length })}
              </p>
            </div>

            {filteredClassEntries.length === 0 && (
              <EmptyState
                icon={Search}
                title={t('studentsPage.noResults.title')}
                description={t('studentsPage.noResults.description')}
              />
            )}

            {filteredClassEntries.map(([className, classStudents]) => (
              <Card key={className}>
                <CardHeader>
                  <CardTitle>{className}</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Student</TableHead>
                          <TableHead>Groups</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {classStudents.map(student => (
                          <TableRow key={student.id}>
                            <TableCell>
                              <StudentPhoto
                                studentId={student.id}
                                firstName={student.firstName}
                                lastName={student.lastName}
                                nameFormat="lastFirst"
                              />
                            </TableCell>
                            <TableCell>
                              <div className="flex flex-wrap gap-1.5">
                                {student.weekdayGroups && student.weekdayGroups.length > 0 ? (
                                  student.weekdayGroups.map(g => (
                                    <Badge
                                      key={`${g.weekday}-${g.planClassName ?? ''}`}
                                      variant="secondary"
                                    >
                                      {t(`raumplan.weekdays.${g.weekday}`)}
                                      {g.planClassName ? ` (${g.planClassName})` : ''} · Group{' '}
                                      {g.groupId}
                                    </Badge>
                                  ))
                                ) : student.groupId != null ? (
                                  <Badge variant="secondary">Group {student.groupId}</Badge>
                                ) : (
                                  <Badge variant="soft-muted">No Group Assigned</Badge>
                                )}
                              </div>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
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
