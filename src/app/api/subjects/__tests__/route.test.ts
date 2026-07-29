import { describe, test, expect, vi, beforeEach, afterAll } from 'vitest'
import { GET } from '../route'
import { prisma } from '@/lib/prisma'
import { captureError } from '@/lib/sentry'

// Mock prisma
vi.mock('@/lib/prisma', () => ({
  prisma: {
    subject: {
      findMany: vi.fn(),
    },
  },
}))

// Mock sentry
vi.mock('@/lib/sentry', () => ({
  captureError: vi.fn(),
}))

describe('Subjects API', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('GET', () => {
    test('should return subjects ordered by name', async () => {
      const mockSubjects = [
        {
          id: 1,
          name: 'Biology',
          description: null,
          isCustom: false,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
        {
          id: 2,
          name: 'Chemistry',
          description: null,
          isCustom: false,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
        {
          id: 3,
          name: 'Physics',
          description: null,
          isCustom: false,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ]

      vi.mocked(prisma.subject.findMany).mockResolvedValue(mockSubjects)

      const response = await GET()
      const data = await response.json()

      expect(response.status).toBe(200)
      expect(data.subjects).toHaveLength(3)
      expect(
        data.subjects.map((s: { id: number; name: string }) => ({ id: s.id, name: s.name })),
      ).toEqual([
        { id: 1, name: 'Biology' },
        { id: 2, name: 'Chemistry' },
        { id: 3, name: 'Physics' },
      ])

      // Verify prisma call
      expect(prisma.subject.findMany).toHaveBeenCalledWith({
        select: {
          id: true,
          name: true,
        },
        orderBy: {
          name: 'asc',
        },
      })

      // Verify no errors were logged

      expect(captureError).not.toHaveBeenCalled()
    })

    test('should handle database errors', async () => {
      const error = new Error('Database connection failed')
      vi.mocked(prisma.subject.findMany).mockRejectedValue(error)

      const response = await GET()
      const data = await response.json()

      expect(response.status).toBe(500)
      expect(data).toEqual({
        error: 'Failed to fetch subjects',
      })

      // Verify error was logged and captured

      expect(captureError).toHaveBeenCalledWith(error, {
        location: 'api/subjects',
        type: 'fetch-subjects',
      })
    })

    test('should return empty array when no subjects exist', async () => {
      vi.mocked(prisma.subject.findMany).mockResolvedValue([])

      const response = await GET()
      const data = await response.json()

      expect(response.status).toBe(200)
      expect(data).toEqual({ subjects: [] })

      // Verify no errors were logged

      expect(captureError).not.toHaveBeenCalled()
    })
  })
})
