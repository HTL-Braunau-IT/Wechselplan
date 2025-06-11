import { NextResponse } from 'next/server'
import { captureError } from '@/lib/sentry'

/**
 * Handles GET requests by returning a JSON object containing predefined turn schedules.
 *
 * Each turn includes an array of weeks with associated date strings. If an error occurs, returns a JSON error message with a 500 status code.
 *
 * @returns A JSON response with turn schedules or an error message.
 */
export async function GET() {
  try {
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
  } catch (error) {

    captureError(error, {
      location: 'api/schedule/turns',
      type: 'fetch-turns'
    })
    return NextResponse.json(
      { error: 'Failed to fetch turns' },
      { status: 500 }
    )
  }
} 