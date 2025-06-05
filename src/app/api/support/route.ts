import { NextResponse } from 'next/server'
import { prisma } from '~/lib/prisma'
import { sendSupportEmail } from '~/server/send-support-email-graph'

export async function POST(request: Request) {
  try {
    const { name, message, currentUri } = await request.json()

    if (!name || !message) {
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
    sendSupportEmail(
      `New support message from ${name}`,
      `Name: ${name}\nMessage: ${message}\nLocation: ${currentUri ?? 'Not specified'}`
    ).catch(console.error)

    return NextResponse.json(supportMessage)
  } catch (error) {
    console.error('Error creating support message:', error)
    return NextResponse.json(
      { error: 'Failed to create support message' },
      { status: 500 }
    )
  }
} 