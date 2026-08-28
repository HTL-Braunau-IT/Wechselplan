import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { sendSupportEmail } from '@/server/send-support-email-graph'
import { captureError } from '@/lib/sentry'
import { denyUnlessAccess } from '@/lib/api-guard'

/**
 * Processes a support message submitted via HTTP POST, validating input, storing it in the database, and attempting to notify the admin.
 *
 * Accepts a JSON payload with `name`, `message`, and optionally `currentUri`. Returns the created support message as JSON on success. Responds with a 400 error if required fields are missing, or a 500 error for unexpected failures.
 *
 * @param request - The HTTP request containing the support message data.
 * @returns A JSON response with the created support message, or an error message with the appropriate HTTP status.
 */
export async function POST(request: Request) {
  const denied = await denyUnlessAccess('session')
  if (denied) return denied

  // Store request body as string before parsing
  const requestBody = await request.text()
  let body: { name?: string; message?: string; currentUri?: string }

  try {
    body = JSON.parse(requestBody)
    const { name, message, currentUri } = body

    if (!name || !message) {
      captureError(new Error('Missing required fields'), {
        location: 'api/support',
        type: 'missing-required-fields',
      })
      return NextResponse.json({ error: 'Name and message are required' }, { status: 400 })
    }

    // Cap sizes before persisting/e-mailing: the route is session-tier, so any
    // student can call it, and message is an unbounded TEXT column that also gets
    // forwarded verbatim in an admin e-mail (finding 43).
    if (name.length > 200 || message.length > 5000) {
      return NextResponse.json(
        { error: 'Name or message too long' },
        { status: 400 },
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
        `Name: ${name}\nMessage: ${message}\nLocation: ${currentUri ?? 'Not specified'}`,
      )
    } catch (emailError) {
      // Log only non-PII metadata — the support name/message are user free-text
      // and are already persisted in SupportMessage; they must not be duplicated
      // into the admin-visible error log (finding 40).
      captureError(emailError, {
        location: 'api/support',
        type: 'send-support-email',
        extra: {
          messageLength: message.length,
          hasCurrentUri: Boolean(currentUri),
        },
      })
      // Don't throw here, we still want to return success to the user
    }

    return NextResponse.json(supportMessage)
  } catch (error) {
    // Never persist the raw body (user free-text / PII) — only its size (finding 40).
    captureError(error, {
      location: 'api/support',
      type: 'send-support-email',
      extra: {
        requestBodyBytes: requestBody.length,
      },
    })
    return NextResponse.json({ error: 'Failed to process support request' }, { status: 500 })
  }
}
