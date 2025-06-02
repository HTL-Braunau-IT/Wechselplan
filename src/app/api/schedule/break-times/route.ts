import { NextResponse } from 'next/server'

export async function GET() {
  // Return default break times
  const breakTimes = [
    {
      id: '1',
      name: 'Morning Break',
      startTime: '09:40',
      endTime: '09:55',
      period: 'AM'
    },
    {
      id: '2',
      name: 'Lunch Break',
      startTime: '11:35',
      endTime: '11:50',
      period: 'AM'
    },
    {
      id: '3',
      name: 'Afternoon Break',
      startTime: '15:10',
      endTime: '15:25',
      period: 'PM'
    }
  ]

  return NextResponse.json(breakTimes)
} 