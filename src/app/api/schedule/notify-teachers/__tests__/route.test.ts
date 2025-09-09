import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextResponse } from 'next/server'

// Mock the database
vi.mock('@/lib/db', () => ({
  db: {
    teacher: {
      findMany: vi.fn(),
    },
  },
}))

// Mock the email service
vi.mock('@/server/send-support-email-graph', () => ({
  sendEmail: vi.fn(),
}))

// Mock sentry
vi.mock('@/lib/sentry', () => ({
  captureError: vi.fn(),
}))

// Import after mocks
import { POST } from '../route'

describe('Notify Teachers API', () => {
  beforeEach(async () => {
    vi.clearAllMocks()
  })

  describe('POST /api/schedule/notify-teachers', () => {
    it('should send emails to all teachers with valid email addresses', async () => {
      const mockTeachers = [
        {
          id: 1,
          firstName: 'John',
          lastName: 'Doe',
          email: 'john.doe@example.com',
        },
        {
          id: 2,
          firstName: 'Jane',
          lastName: 'Smith',
          email: 'jane.smith@example.com',
        },
        {
          id: 3,
          firstName: 'Bob',
          lastName: 'Johnson',
          email: null, // No email address
        },
      ]

      // Get the mocked functions
      const { db } = await import('@/lib/db')
      const { sendEmail } = await import('@/server/send-support-email-graph')
      
      vi.mocked(db.teacher.findMany).mockResolvedValue(mockTeachers)
      vi.mocked(sendEmail).mockResolvedValue(undefined)

      const requestBody = {
        classId: 1,
        className: '1A',
        teacherIds: [1, 2, 3],
        scheduleLink: 'https://example.com/schedules?class=1A',
      }

      const request = new Request('http://localhost:3000/api/schedule/notify-teachers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestBody),
      })

      const response = await POST(request)
      const data = await response.json()

      expect(response.status).toBe(200)
      expect(data).toEqual({
        success: true,
        emailsSent: 2, // Only teachers with email addresses
        totalTeachers: 3,
      })

      // Verify database call
      expect(db.teacher.findMany).toHaveBeenCalledWith({
        where: {
          id: {
            in: [1, 2, 3],
          },
        },
        select: {
          id: true,
          firstName: true,
          lastName: true,
          email: true,
        },
      })

      // Verify email calls
      expect(sendEmail).toHaveBeenCalledTimes(2)
      expect(sendEmail).toHaveBeenCalledWith(
        'john.doe@example.com',
        'Wechselplan 1A',
        'Hallo John Doe!\n\nEs wurde ein Wechselplan für Klasse 1A erstellt. Du findest den Plan unter https://example.com/schedules?class=1A.\n\nViele Grüße,\nDas Wechselplan-Team'
      )
      expect(sendEmail).toHaveBeenCalledWith(
        'jane.smith@example.com',
        'Wechselplan 1A',
        'Hallo Jane Smith!\n\nEs wurde ein Wechselplan für Klasse 1A erstellt. Du findest den Plan unter https://example.com/schedules?class=1A.\n\nViele Grüße,\nDas Wechselplan-Team'
      )
    })

    it('should return 400 when required fields are missing', async () => {
      const requestBody = {
        classId: 1,
        // Missing className and teacherIds
      }

      const request = new Request('http://localhost:3000/api/schedule/notify-teachers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestBody),
      })

      const response = await POST(request)
      const data = await response.json()

      expect(response.status).toBe(400)
      expect(data).toEqual({ error: 'Missing required fields' })
    })

    it('should return 400 when no teachers with valid email addresses are found', async () => {
      const mockTeachers = [
        {
          id: 1,
          firstName: 'John',
          lastName: 'Doe',
          email: null,
        },
      ]

      const { db } = await import('@/lib/db')
      vi.mocked(db.teacher.findMany).mockResolvedValue(mockTeachers)

      const requestBody = {
        classId: 1,
        className: '1A',
        teacherIds: [1],
        scheduleLink: 'https://example.com/schedules?class=1A',
      }

      const request = new Request('http://localhost:3000/api/schedule/notify-teachers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestBody),
      })

      const response = await POST(request)
      const data = await response.json()

      expect(response.status).toBe(400)
      expect(data).toEqual({ error: 'No teachers with valid email addresses found' })
    })

    it('should handle email sending errors gracefully', async () => {
      const mockTeachers = [
        {
          id: 1,
          firstName: 'John',
          lastName: 'Doe',
          email: 'john.doe@example.com',
        },
        {
          id: 2,
          firstName: 'Jane',
          lastName: 'Smith',
          email: 'jane.smith@example.com',
        },
      ]

      const { db } = await import('@/lib/db')
      const { sendEmail } = await import('@/server/send-support-email-graph')
      
      vi.mocked(db.teacher.findMany).mockResolvedValue(mockTeachers)
      vi.mocked(sendEmail)
        .mockResolvedValueOnce(undefined) // First email succeeds
        .mockRejectedValueOnce(new Error('Email failed')) // Second email fails

      const requestBody = {
        classId: 1,
        className: '1A',
        teacherIds: [1, 2],
        scheduleLink: 'https://example.com/schedules?class=1A',
      }

      const request = new Request('http://localhost:3000/api/schedule/notify-teachers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestBody),
      })

      const response = await POST(request)
      const data = await response.json()

      // Should still return success even if some emails fail
      expect(response.status).toBe(200)
      expect(data).toEqual({
        success: true,
        emailsSent: 2,
        totalTeachers: 2,
      })
    })

    it('should handle database errors', async () => {
      const { db } = await import('@/lib/db')
      vi.mocked(db.teacher.findMany).mockRejectedValue(new Error('Database error'))

      const requestBody = {
        classId: 1,
        className: '1A',
        teacherIds: [1, 2],
        scheduleLink: 'https://example.com/schedules?class=1A',
      }

      const request = new Request('http://localhost:3000/api/schedule/notify-teachers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestBody),
      })

      const response = await POST(request)
      const data = await response.json()

      expect(response.status).toBe(500)
      expect(data).toEqual({ error: 'Failed to send teacher notifications' })
    })
  })
})
