import { NextResponse } from 'next/server'
import { captureError } from '@/lib/sentry'
import { prisma } from '@/lib/prisma'

/**
 * Handles HTTP OPTIONS requests for the schedule times API route.
 *
 * Returns a 204 No Content response with an 'Allow' header specifying the permitted HTTP methods.
 */
export async function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: {
      'Allow': 'GET, POST, OPTIONS',
    },
  })
}

/**
   * Retrieves the latest schedule times and break times for a class by name.
   *
   * Expects a `className` query parameter in the request URL. Returns a 400 error if `className` is missing, or a 404 error if no schedule is found for the specified class.
   *
   * @returns A JSON response containing the latest schedule and break times for the class.
   */
  export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const className = searchParams.get('className')

  if (!className) {
    return NextResponse.json({ error: 'Class name is required' }, { status: 400 })
  }

    const classId = await prisma.class.findFirst({
        where: {
          name: className
        }
      })
  
      // Get the latest schedule for this class
      const times = await prisma.schedule.findFirst({
        where: {
          classId: classId?.id
        },
        orderBy: {
          createdAt: 'desc'
        },
        include: {
          scheduleTimes: true,
          breakTimes: true
        }
      })
  
      if (!times) {
        return NextResponse.json(
          { error: 'No schedule times found for this class' },
          { status: 404 }
        )
      }

      return NextResponse.json({ times })

  }


/**
 * Updates the latest schedule for a class with new schedule and break times.
 *
 * Expects a JSON body containing `scheduleTimes`, `breakTimes`, and `className`. Validates the presence of `className`, retrieves the latest schedule for the specified class, and updates its associated times. Returns the updated schedule in JSON format, or an error response if validation fails, the class or schedule is not found, or an internal error occurs.
 */
export async function POST(request: Request) {
  try {
    const { scheduleTimes, breakTimes, className } = await request.json()

    if (!className) {
      return NextResponse.json(
        { error: 'Class ID is required' },
        { status: 400 }
      )
    }

    const classId = await prisma.class.findFirst({
      where: {
        name: className
      }
    })

    // Get the latest schedule for this class
    const latestSchedule = await prisma.schedule.findFirst({
      where: {
        classId: classId?.id
      },
      orderBy: {
        createdAt: 'desc'
      },
      include: {
        scheduleTimes: true,
        breakTimes: true
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
          set: scheduleTimes.map((time: { id: number }) => ({ id: time.id }))
        },
        breakTimes: {
          set: breakTimes.map((time: { id: number }) => ({ id: time.id }))
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
      location: 'api/schedule/times',
      type: 'save-times'
    })
    return NextResponse.json(
      { error: 'Failed to save times' },
      { status: 500 }
    )
  }
} 