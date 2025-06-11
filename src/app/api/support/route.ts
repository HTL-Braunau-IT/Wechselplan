import { NextResponse } from 'next/server'
import { prisma } from '~/lib/prisma'
import { sendSupportEmail } from '~/server/send-support-email-graph'
import { captureError } from '@/lib/sentry'

/**
 * Processes a support message submitted via HTTP POST, validating input, storing it in the database, and attempting to notify the admin.
 *
 * Accepts a JSON payload with `name`, `message`, and optionally `currentUri`. Returns the created support message as JSON on success. Responds with a 400 error if required fields are missing, or a 500 error for unexpected failures.
 *
 * @param request - The HTTP request containing the support message data.
 * @returns A JSON response with the created support message, or an error message with the appropriate HTTP status.
 */
export async function POST(request: Request) {
  // Store request body as string before parsing
  const requestBody = await request.text()
  let body: { name?: string; message?: string; currentUri?: string }

  try {
    body = JSON.parse(requestBody)
    const { name, message, currentUri } = body

    if (!name || !message) {
      captureError(new Error('Missing required fields'), {
        location: 'api/support',
        type: 'missing-required-fields'
      })
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
    
    captureError(error, {
      location: 'api/support',
      type: 'send-support-email',
      extra: {
        requestBody
      }
    })
    return NextResponse.json(
      { error: 'Failed to process support request' },
      { status: 500 }
    )
  }
} 