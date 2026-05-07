import { prisma } from '@/lib/prisma'
import { sendEmail } from '@/server/send-support-email-graph'
import { captureError } from '@/lib/sentry'
import { badRequest, ok, serverError } from '@/lib/api-response'

interface NotifyTeachersRequest {
  classId: number
  className: string
  teacherIds: number[]
  scheduleLink: string
}

/**
 * Sends email notifications to all teachers included in a schedule rotation.
 * 
 * Fetches teacher details from the database and sends personalized German emails
 * notifying them about the new schedule for their class.
 * 
 * @param request - The HTTP request containing class and teacher information
 * @returns A JSON response indicating success or providing an error message
 */
export async function POST(request: Request) {
  let requestBody: NotifyTeachersRequest | Record<string, unknown> = {}
  try {
    const data = await request.json() as NotifyTeachersRequest
    requestBody = data
    const { classId, className, teacherIds, scheduleLink } = data

    if (!classId || typeof classId !== 'number' || !className || !teacherIds || !Array.isArray(teacherIds)) {
      return badRequest('Missing required fields')
    }

    // Fetch teacher details from database
    const teachers = await prisma.teacher.findMany({
      where: {
        id: {
          in: teacherIds
        }
      },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        email: true
      }
    })

    // Filter teachers with valid email addresses
    const teachersWithEmails = teachers.filter(teacher => teacher.email)

    if (teachersWithEmails.length === 0) {
      return badRequest('No teachers with valid email addresses found')
    }

    // Send emails to all teachers
    let failedCount = 0
    const emailPromises = teachersWithEmails.map(async (teacher) => {
      const subject = `Wechselplan ${className}`
      const message = `Hallo ${teacher.firstName} ${teacher.lastName}!\n\nEs wurde ein Wechselplan für Klasse ${className} erstellt. Du findest den Plan unter ${scheduleLink}.\n\nViele Grüße,\nDas Wechselplan-Team`

      try {
        await sendEmail(teacher.email!, subject, message)
        console.log(`Email sent successfully to ${teacher.email}`)
      } catch (emailError) {
        console.error(`Failed to send email to ${teacher.email}:`, emailError)
        // Don't throw here, we want to continue with other teachers
        failedCount++
        captureError(emailError, {
          location: 'api/schedules/notify-teachers',
          type: 'send-teacher-email',
          extra: {
            teacherId: teacher.id,
            teacherEmail: teacher.email,
            className
          }
        })
      }
    })

    // Wait for all emails to be sent (or fail)
    await Promise.allSettled(emailPromises)

    return ok({
      emailsSent: teachersWithEmails.length,
      totalTeachers: teachers.length,
      failedEmails: failedCount
    })

  } catch (error) {
    console.error('Error in notify-teachers API:', error)
    captureError(error, {
      location: 'api/schedules/notify-teachers',
      type: 'notify-teachers',
      extra: { requestBody }
    })
    return serverError('Failed to send teacher notifications')
  }
}

