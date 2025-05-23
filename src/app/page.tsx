'use client'

import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'

interface Week {
  week: string;
  date: string;
  isHoliday: boolean;
}

interface Holiday {
  name: string;
  startDate: string;
  endDate: string;
}

interface ScheduleData {
  weeks: Week[];
  holidays: Holiday[];
}

interface Schedule {
  id: number;
  name: string;
  createdAt: string;
  scheduleData: Record<string, ScheduleData>;
}

export default function Home() {
  const { t } = useTranslation()
  const [classes, setClasses] = useState<string[]>([])
  const [selectedClass, setSelectedClass] = useState<string>('')
  const [schedules, setSchedules] = useState<Schedule[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    void fetchClasses()
  }, [])

  useEffect(() => {
    if (selectedClass) {
      void fetchSchedules(selectedClass)
    }
  }, [selectedClass])

  const fetchClasses = async () => {
    try {
      setLoading(true)
      const response = await fetch('/api/classes')
      if (!response.ok) throw new Error('Failed to fetch classes')
      const data = await response.json() as string[]
      console.log('Fetched classes:', data) // Debug log
      setClasses(data)
    } catch (err) {
      console.error('Error fetching classes:', err) // Debug log
      setError('Failed to load classes')
    } finally {
      setLoading(false)
    }
  }

  const fetchSchedules = async (classId: string) => {
    try {
      setLoading(true)
      const response = await fetch(`/api/schedules?classId=${classId}`)
      if (!response.ok) throw new Error('Failed to fetch schedules')
      const data = await response.json() as Schedule[]
      console.log('Fetched schedules:', data) // Debug log
      setSchedules(data)
    } catch {
      setError('Failed to load schedules')
    } finally {
      setLoading(false)
    }
  }

  // Helper function to get unique schedules based on their data
  const getUniqueSchedules = (schedules: Schedule[]): Schedule[] => {
    const uniqueSchedules = new Map<string, Schedule>();
    
    schedules.forEach(schedule => {
      // Create a key based on the schedule data
      const scheduleKey = JSON.stringify(schedule.scheduleData);
      
      // Only add if we haven't seen this schedule data before
      if (!uniqueSchedules.has(scheduleKey)) {
        uniqueSchedules.set(scheduleKey, schedule);
      }
    });
    
    return Array.from(uniqueSchedules.values());
  };

  if (loading && !selectedClass) return <div className="p-8 text-center">Loading...</div>
  if (error) return <div className="p-8 text-center text-red-500">{error}</div>

  const uniqueSchedules = getUniqueSchedules(schedules);

  return (
    <main className="flex min-h-screen flex-col items-center p-24">
      <div className="z-10 max-w-5xl w-full space-y-8">
        <h1 className="text-4xl font-bold mb-8">{t('common.welcome')}</h1>
        
        <Card>
          <CardHeader>
            <CardTitle>Select Class</CardTitle>
          </CardHeader>
          <CardContent>
            <Select value={selectedClass} onValueChange={setSelectedClass}>
              <SelectTrigger className="w-[200px]">
                <SelectValue placeholder="Select a class" />
              </SelectTrigger>
              <SelectContent>
                {classes && classes.length > 0 ? (
                  classes.map((className) => (
                    <SelectItem 
                      key={className} 
                      value={className}
                    >
                      {className}
                    </SelectItem>
                  ))
                ) : (
                  <SelectItem value="no-classes" disabled>
                    No classes available
                  </SelectItem>
                )}
              </SelectContent>
            </Select>
            {classes.length === 0 && !loading && (
              <p className="mt-2 text-sm text-gray-500">No classes found</p>
            )}
          </CardContent>
        </Card>

        {selectedClass && (
          <Card>
            <CardHeader>
              <CardTitle>Schedule Overview</CardTitle>
            </CardHeader>
            <CardContent>
              {loading ? (
                <div className="text-center">Loading schedules...</div>
              ) : uniqueSchedules.length > 0 ? (
                <div className="space-y-4">
                  {uniqueSchedules.map((schedule, scheduleIndex) => (
                    <Card key={`schedule-${schedule?.id ?? scheduleIndex}`}>
                      <CardHeader>
                        <CardTitle>{schedule?.name ?? 'Unnamed Schedule'}</CardTitle>
                      </CardHeader>
                      <CardContent>
                        <div className="overflow-x-auto">
                          <table className="w-full border-collapse">
                            <thead>
                              <tr>
                                {Object.entries(schedule?.scheduleData ?? {}).map(([turnus, entry], turnusIndex) => (
                                  <th key={`turnus-${turnus}-${turnusIndex}`} className="border p-2">
                                    <div>{turnus}</div>
                                    <div className="text-sm font-normal text-gray-500">
                                      {entry?.weeks?.length ?? 0} weeks
                                    </div>
                                  </th>
                                ))}
                              </tr>
                            </thead>
                            <tbody>
                              {Object.values(schedule?.scheduleData ?? {})[0]?.weeks?.map((_, weekIndex: number) => (
                                <tr key={`week-${weekIndex}`}>
                                  {Object.values(schedule?.scheduleData ?? {}).map((entry, turnusIndex) => (
                                    <td key={`cell-${weekIndex}-${turnusIndex}`} className="border p-2">
                                      {entry?.weeks?.[weekIndex] && (
                                        <>
                                          {entry.weeks[weekIndex].week}
                                          <br />
                                          <span className={entry.weeks[weekIndex].isHoliday ? 'text-red-500' : undefined}>
                                            {entry.weeks[weekIndex].date}
                                          </span>
                                        </>
                                      )}
                                    </td>
                                  ))}
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              ) : (
                <div className="text-center text-gray-500">No schedules found for this class</div>
              )}
            </CardContent>
          </Card>
        )}
      </div>
    </main>
  )
}
