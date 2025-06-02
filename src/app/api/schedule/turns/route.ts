import { NextResponse } from 'next/server'

export async function GET() {
  // Return default turns data
  const turns = {
    'turn1': {
      weeks: [
        { date: '2024-02-19' },
        { date: '2024-02-26' },
        { date: '2024-03-04' },
        { date: '2024-03-11' }
      ]
    },
    'turn2': {
      weeks: [
        { date: '2024-02-20' },
        { date: '2024-02-27' },
        { date: '2024-03-05' },
        { date: '2024-03-12' }
      ]
    },
    'turn3': {
      weeks: [
        { date: '2024-02-21' },
        { date: '2024-02-28' },
        { date: '2024-03-06' },
        { date: '2024-03-13' }
      ]
    },
    'turn4': {
      weeks: [
        { date: '2024-02-22' },
        { date: '2024-02-29' },
        { date: '2024-03-07' },
        { date: '2024-03-14' }
      ]
    }
  }

  return NextResponse.json(turns)
} 