'use client'

import { useEffect, useState } from 'react'
import { AlertCircle, Users } from 'lucide-react'
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
  groupId: number | null
  createdAt: string
  updatedAt: string
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
  const { selectedYear } = useSchoolYear()
  const schoolYearId = selectedYear?.id
  const [students, setStudents] = useState<Student[]>([])
  const [classes, setClasses] = useState<Class[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

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
            description="All students grouped by class and rotation group."
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

  // Group students by class and then by group
  const studentsByClass = students.reduce(
    (acc, student) => {
      const className = getClassName(student.classId)
      acc[className] ??= {}
      const groupId = student.groupId ?? 'No Group'
      acc[className][groupId] ??= []
      acc[className][groupId].push(student)
      return acc
    },
    {} as Record<string, Record<string | number, Student[]>>,
  )

  // Sort students within each group by last name, then first name
  Object.values(studentsByClass).forEach(classGroups => {
    Object.values(classGroups).forEach(groupStudents => {
      groupStudents.sort((a, b) => {
        const lastNameCompare = a.lastName.localeCompare(b.lastName)
        if (lastNameCompare !== 0) return lastNameCompare
        return a.firstName.localeCompare(b.firstName)
      })
    })
  })

  // Sort classes alphabetically
  const sortedClassEntries = Object.entries(studentsByClass).sort(([classNameA], [classNameB]) => {
    // Put "No Class" at the end
    if (classNameA === 'No Class') return 1
    if (classNameB === 'No Class') return -1
    return classNameA.localeCompare(classNameB)
  })

  return (
    <PageContainer>
      <div className="space-y-6">
        <PageHeader
          icon={Users}
          title="Students Overview"
          description="All students grouped by class and rotation group."
        />

        {sortedClassEntries.length === 0 ? (
          <EmptyState
            icon={Users}
            title="No students"
            description="No students were found for the selected school year."
          />
        ) : (
          <div className="space-y-6">
            {sortedClassEntries.map(([className, classGroups]) => (
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
                          <TableHead>Group</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {Object.entries(classGroups).flatMap(([groupId, groupStudents]) =>
                          groupStudents.map(student => (
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
                                {groupId === 'No Group' ? (
                                  <Badge variant="soft-muted">No Group Assigned</Badge>
                                ) : (
                                  <Badge variant="secondary">Group {groupId}</Badge>
                                )}
                              </TableCell>
                            </TableRow>
                          )),
                        )}
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
