import { NextResponse } from 'next/server'
import { prisma } from '~/lib/prisma'
import { sendSupportEmail } from '~/server/send-support-email-graph'
import { captureError } from '@/lib/sentry'

/**
 * Handles support message submissions via POST request.
 *
 * Parses the incoming request for a support message, validates required fields, stores the message in the database, and attempts to notify the admin via email. Returns the created support message as JSON. If required fields are missing, responds with a 400 error. If an unexpected error occurs, responds with a 500 error.
 *
 * @param request - The incoming HTTP request containing the support message data.
 * @returns A JSON response with the created support message, or an error message with appropriate HTTP status.
 */
export async function POST(request: Request) {
  try {
    const body = await request.json()


    const { name, message, currentUri } = body

    if (!name || !message) {
      console.error('Missing required fields:', { name, message })
      return NextResponse.json(
        { error: 'Name and message are required' },
        { status: 400 }
      )
    }

    const supportMessage = await prisma.supportMessage.create({
      data: {
        name,
        message,
        currentUri: currentUri ?? null,
      },
    })

    // Send email notification to admin (do not block user if this fails)
    try {
      await sendSupportEmail(
        `New support message from ${name}`,
        `Name: ${name}\nMessage: ${message}\nLocation: ${currentUri ?? 'Not specified'}`
      )
    } catch (emailError) {
      console.error('Failed to send support email:', emailError)
      captureError(emailError, {
        location: 'api/support',
        type: 'send-support-email',
        extra: {
          name,
          message,
          currentUri
        }
      })
      // Don't throw here, we still want to return success to the user
    }

    return NextResponse.json(supportMessage)
  } catch (error) {
    console.error('Error processing support request:', error)
    captureError(error, {
      location: 'api/support',
      type: 'send-support-email',
      extra: {
        requestBody: await request.text()
      }
    })
    return NextResponse.json(
      { error: 'Failed to process support request' },
      { status: 500 }
    )
  }
} 