import { prisma } from '@/lib/prisma'
import { captureError } from '@/lib/sentry'
import { badRequest, ok, notFound, serverError, unprocessable } from '@/lib/api-response'

interface TeacherRotationRequest {
  classId: number
  schoolYearId: number
  selectedWeekday: number
  /** Turn names (e.g. "TURNUS 1") OR turn ids — both supported for backwards compat. */
  turns: Array<string | number>
  amRotation: {
    groupId: number
    turns: (number | null)[]
  }[]
  pmRotation: {
    groupId: number
    turns: (number | null)[]
  }[]
}

/**
 * Handles a POST request to update the teacher rotation schedule for a class.
 *
 * Replaces all existing teacher rotation records for the specified class with new AM and PM rotation data provided in the request body. Responds with a JSON object indicating success, or an error message with an appropriate HTTP status code if validation fails, the class is not found, or an internal error occurs.
 *
 * @returns A JSON response indicating success or providing an error message.
 */
export async function POST(request: Request) {
  try {
    const data = await request.json() as TeacherRotationRequest
    const { classId, schoolYearId, selectedWeekday, turns, amRotation, pmRotation } = data

    if (
      !classId ||
      typeof classId !== 'number' ||
      !schoolYearId ||
      typeof schoolYearId !== 'number' ||
      !selectedWeekday ||
      typeof selectedWeekday !== 'number' ||
      selectedWeekday < 1 ||
      selectedWeekday > 5 ||
      !turns ||
      !amRotation ||
      !pmRotation
    ) {
      return badRequest('Missing required fields')
    }

    const classData = await prisma.class.findUnique({
      where: {
        id: classId
      }
    })

    if (!classData) {
      return notFound('Class not found')
    }

    // Resolve `turns` (either names like "TURNUS 1" or numeric ids) to ScheduleTurn ids
    // by looking up the active Schedule for (class, year, weekday).
    const schedule = await prisma.schedule.findFirst({
      where: { classId: classData.id, schoolYearId, selectedWeekday },
      orderBy: { createdAt: 'desc' },
      include: { turns: { select: { id: true, name: true } } }
    })
    if (!schedule || schedule.turns.length === 0) {
      return notFound('No schedule with turns found for this class/year/weekday')
    }

    const turnIdByName = new Map(schedule.turns.map(t => [t.name, t.id]))
    const turnIdSet = new Set(schedule.turns.map(t => t.id))
    const resolvedTurnIds: number[] = []
    for (const turn of turns) {
      if (typeof turn === 'number' && turnIdSet.has(turn)) {
        resolvedTurnIds.push(turn)
        continue
      }
      if (typeof turn === 'string') {
        const id = turnIdByName.get(turn)
        if (id != null) {
          resolvedTurnIds.push(id)
          continue
        }
      }
      return unprocessable(`Turn "${String(turn)}" not found in schedule`)
    }

    // Delete only the current class/school year/weekday scope
    await prisma.teacherRotation.deleteMany({
      where: {
        classId: classData.id,
        schoolYearId,
        selectedWeekday
      }
    })

    // Save AM rotation
    for (const groupRotation of amRotation) {
      for (let i = 0; i < resolvedTurnIds.length; i++) {
        const teacherId = groupRotation.turns[i]
        if (teacherId !== null && teacherId !== undefined) {
          await prisma.teacherRotation.create({
            data: {
              classId: classData.id,
              groupId: groupRotation.groupId,
              teacherId,
              turnId: resolvedTurnIds[i]!,
              period: 'AM',
              schoolYearId,
              selectedWeekday
            }
          })
        }
      }
    }

    // Save PM rotation
    for (const groupRotation of pmRotation) {
      for (let i = 0; i < resolvedTurnIds.length; i++) {
        const teacherId = groupRotation.turns[i]
        if (teacherId !== null && teacherId !== undefined) {
          await prisma.teacherRotation.create({
            data: {
              classId: classData.id,
              groupId: groupRotation.groupId,
              teacherId,
              turnId: resolvedTurnIds[i]!,
              period: 'PM',
              schoolYearId,
              selectedWeekday
            }
          })
        }
      }
    }

    return ok({ success: true })
  } catch (error) {
  
    captureError(error, {
      location: 'api/schedules/rotation',
      type: 'update-rotation'
    })
    return serverError('Failed to update teacher rotation')
  }
}

