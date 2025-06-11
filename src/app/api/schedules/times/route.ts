import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { captureError } from '~/lib/sentry'

/**
 * Updates the schedule times and break times for the latest schedule of a given class.
 *
 * Expects a JSON body containing `scheduleTimes`, `breakTimes`, and `classId`. If `classId` is missing, responds with a 400 error. If no schedule exists for the class, responds with a 404 error. On success, updates the latest schedule's times and returns the updated schedule as JSON.
 *
 * @returns A JSON response with the updated schedule, or an error message with the appropriate HTTP status code.
 */
export async function POST(request: Request) {
  try {
    const { scheduleTimes, breakTimes, classId } = await request.json()

    if (!classId) {
      return NextResponse.json(
        { error: 'Class ID is required' },
        { status: 400 }
      )
    }

    // Get the latest schedule for this class
    const latestSchedule = await prisma.schedule.findFirst({
      where: {
        classId: parseInt(classId as string)
      },
      orderBy: {
        createdAt: 'desc'
      }
    })

    if (!latestSchedule) {
      return NextResponse.json(
        { error: 'No schedule found for this class' },
        { status: 404 }
      )
    }

    // Update the schedule with the selected times
    const updatedSchedule = await prisma.schedule.update({
      where: {
        id: latestSchedule.id
      },
      data: {
        scheduleTimes: {
          set: scheduleTimes.map((id: string) => ({ id: parseInt(id) }))
        },
        breakTimes: {
          set: breakTimes.map((id: string) => ({ id: parseInt(id) }))
        }
      },
      include: {
        scheduleTimes: true,
        breakTimes: true
      }
    })

    return NextResponse.json(updatedSchedule)
  } catch (error) {
    captureError(error, {
      location: 'api/schedules/times',
      type: 'save-times'
    })
    return NextResponse.json(
      { error: 'Failed to save times' },
      { status: 500 }
    )
  }
}

/**
 * Retrieves the latest schedule times and break times for a specified class.
 *
 * Extracts the class ID from the request's query parameters and returns the most recent schedule's times and breaks. If no schedule exists for the class, returns empty arrays for both.
 *
 * @param request - The incoming HTTP request containing the class ID as a query parameter.
 * @returns A JSON response with `scheduleTimes` and `breakTimes` arrays, or an error message with the appropriate HTTP status code.
 */
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const classId = searchParams.get('class');

    if (!classId) {
      return NextResponse.json(
        { error: 'Class ID is required' },
        { status: 400 }
      );
    }

    // Get the latest schedule for this class
    const latestSchedule = await prisma.schedule.findFirst({
      where: {
        classId: parseInt(classId)
      },
      orderBy: {
        createdAt: 'desc'
      },
      include: {
        scheduleTimes: true,
        breakTimes: true
      }
    });

    if (!latestSchedule) {
      return NextResponse.json(
        { scheduleTimes: [], breakTimes: [] },
        { status: 200 }
      );
    }

    return NextResponse.json({
      scheduleTimes: latestSchedule.scheduleTimes,
      breakTimes: latestSchedule.breakTimes
    });
  } catch (error) {
    captureError(error, {
      location: 'api/schedules/times',
      type: 'fetch-times'
    })
    return NextResponse.json(
      { error: 'Failed to fetch times' },
      { status: 500 }
    );
  }
} 