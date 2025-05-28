'use client'

import { useEffect, useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { useRouter } from 'next/navigation'

interface Schedule {
  id: number
  name: string
  description: string | null
  startDate: string
  endDate: string
  selectedWeekday: number
  classId: number | null
  createdAt: string
  updatedAt: string
}

interface Class {
  id: number
  name: string
  description: string | null
}

export default function SchedulesPage() {
  const [schedules, setSchedules] = useState<Schedule[]>([])
  const [classes, setClasses] = useState<Class[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const router = useRouter()

  useEffect(() => {
    void fetchData()
  }, [])

  const fetchData = async () => {
    try {
      setLoading(true)
      setError(null)

      // Fetch all schedules
      const schedulesRes = await fetch('/api/schedules')
      if (!schedulesRes.ok) throw new Error('Failed to fetch schedules')
      const schedulesData = await schedulesRes.json() as Schedule[]
      setSchedules(schedulesData)

      // Fetch all classes
      const classesRes = await fetch('/api/classes')
      if (!classesRes.ok) throw new Error('Failed to fetch classes')
      const classesData = await classesRes.json() as Class[]
      setClasses(classesData)
    } catch (e) {
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

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('de-DE', {
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    })
  }

  const getWeekdayName = (weekday: number) => {
    const weekdays = ['Sonntag', 'Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag']
    return weekdays[weekday] ?? 'Unknown'
  }

  if (loading) return <div className="p-8 text-center">Loading...</div>
  if (error) return <div className="p-8 text-center text-red-500">{error}</div>

  // Group schedules by class
  const schedulesByClass = schedules.reduce((acc, schedule) => {
    const className = getClassName(schedule.classId)
    acc[className] ??= []
    acc[className].push(schedule)
    return acc
  }, {} as Record<string, Schedule[]>)

  return (
    <div className="container mx-auto p-4">
      <div className="mb-8">
        <h1 className="text-3xl font-bold mb-4">Schedules Overview</h1>
      </div>

      {Object.entries(schedulesByClass).map(([className, classSchedules]) => (
        <Card key={className} className="mb-8">
          <CardHeader>
            <CardTitle>{className}</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {classSchedules.map((schedule) => (
                <Card key={schedule.id} className="p-4 hover:bg-accent/50 cursor-pointer"
                  onClick={() => router.push(`/schedule/create/overview?class=${schedule.classId}`)}>
                  <div className="flex justify-between items-start">
                    <div>
                      <h3 className="font-semibold">{schedule.name}</h3>
                      {schedule.description && (
                        <p className="text-sm text-muted-foreground">{schedule.description}</p>
                      )}
                      <div className="mt-2 text-sm">
                        <p>Period: {formatDate(schedule.startDate)} - {formatDate(schedule.endDate)}</p>
                        <p>Weekday: {getWeekdayName(schedule.selectedWeekday)}</p>
                        <p className="text-muted-foreground">
                          Created: {new Date(schedule.createdAt).toLocaleDateString('de-DE')}
                        </p>
                      </div>
                    </div>
                    <Button variant="outline" size="sm">
                      View Details
                    </Button>
                  </div>
                </Card>
              ))}
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  )
} 