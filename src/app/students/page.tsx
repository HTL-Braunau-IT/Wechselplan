'use client'

import { useEffect, useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { captureFrontendError } from '@/lib/frontend-error'

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

export default function StudentsPage() {
  const [students, setStudents] = useState<Student[]>([])
  const [classes, setClasses] = useState<Class[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    void fetchData()
  }, [])

  const fetchData = async () => {
    try {
      setLoading(true)
      setError(null)

      // Fetch all students
      const studentsRes = await fetch('/api/students/all')
      if (!studentsRes.ok) throw new Error('Failed to fetch students')
      const studentsData = await studentsRes.json() as Student[]
      setStudents(studentsData)

      // Fetch all classes
      const classesRes = await fetch('/api/classes')
      if (!classesRes.ok) throw new Error('Failed to fetch classes')
      const classesData = await classesRes.json() as Class[]
      setClasses(classesData)
    } catch (e) {
      console.error('Error fetching students data:', e)
      captureFrontendError(e, {
        location: 'students',
        type: 'fetch-data'
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

  if (loading) return <div className="p-8 text-center">Loading...</div>
  if (error) return <div className="p-8 text-center text-red-500">{error}</div>

  // Group students by class and then by group
  const studentsByClass = students.reduce((acc, student) => {
    const className = getClassName(student.classId)
    acc[className] ??= {}
    const groupId = student.groupId ?? 'No Group'
    acc[className][groupId] ??= []
    acc[className][groupId].push(student)
    return acc
  }, {} as Record<string, Record<string | number, Student[]>>)

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
    <div className="container mx-auto p-4">
      <div className="mb-8">
        <h1 className="text-3xl font-bold mb-4">Students Overview</h1>
      </div>

      {sortedClassEntries.map(([className, classGroups]) => (
        <Card key={className} className="mb-8">
          <CardHeader>
            <CardTitle>{className}</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-6">
              {Object.entries(classGroups).map(([groupId, groupStudents]) => (
                <div key={groupId} className="space-y-2">
                  <h3 className="text-lg font-semibold">
                    {groupId === 'No Group' ? 'No Group Assigned' : `Group ${groupId}`}
                  </h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {groupStudents.map((student) => (
                      <Card key={student.id} className="p-4">
                        <div className="flex flex-col">
                          <span className="font-medium">
                            {student.lastName}, {student.firstName}
                          </span>
                        </div>
                      </Card>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  )
} 