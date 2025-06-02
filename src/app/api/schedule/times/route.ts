import { NextResponse } from 'next/server'

export async function GET() {
  // Return default schedule times
  const scheduleTimes = [
    {
      id: '1',
      startTime: '08:00',
      endTime: '08:50',
      hours: 1,
      period: 'AM'
    },
    {
      id: '2',
      startTime: '08:50',
      endTime: '09:40',
      hours: 2,
      period: 'AM'
    },
    {
      id: '3',
      startTime: '09:55',
      endTime: '10:45',
      hours: 3,
      period: 'AM'
    },
    {
      id: '4',
      startTime: '10:45',
      endTime: '11:35',
      hours: 4,
      period: 'AM'
    },
    {
      id: '5',
      startTime: '11:50',
      endTime: '12:40',
      hours: 5,
      period: 'AM'
    },
    {
      id: '6',
      startTime: '12:40',
      endTime: '13:30',
      hours: 6,
      period: 'AM'
    },
    {
      id: '7',
      startTime: '13:30',
      endTime: '14:20',
      hours: 7,
      period: 'PM'
    },
    {
      id: '8',
      startTime: '14:20',
      endTime: '15:10',
      hours: 8,
      period: 'PM'
    },
    {
      id: '9',
      startTime: '15:25',
      endTime: '16:15',
      hours: 9,
      period: 'PM'
    },
    {
      id: '10',
      startTime: '16:15',
      endTime: '17:05',
      hours: 10,
      period: 'PM'
    }
  ]

  return NextResponse.json(scheduleTimes)
} 