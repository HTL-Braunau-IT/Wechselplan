import { describe, test, expect, vi, beforeEach } from 'vitest'
import { GET } from '../route'
import { prisma } from '@/lib/prisma'
import type { TeacherAssignment } from '@prisma/client'

// Mock PrismaClient
vi.mock('@/lib/prisma', () => ({
  prisma: {
    class: {
      findUnique: vi.fn(),
    },
    student: {
      findMany: vi.fn(),
    },
    groupAssignment: {
      findMany: vi.fn(),
      upsert: vi.fn(),
    },
  },
}))

// Mock sentry
vi.mock('@/lib/sentry', () => ({
  captureError: vi.fn(),
}))

describe('Schedule Assignments API', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('GET /api/schedules/assignments', () => {
    test('should return 400 if class parameter is missing', async () => {
      const request = new Request('http://localhost/api/schedules/assignments')
      const response = await GET(request)
      const data = await response.json()

      expect(response.status).toBe(400)
      expect(data).toEqual({ error: 'Class ID parameter is required' })
    })

    test('should return 400 if class ID is not a number', async () => {
      const request = new Request('http://localhost/api/schedules/assignments?classId=abc')
      const response = await GET(request)
      const data = await response.json()

      expect(response.status).toBe(400)
      expect(data).toEqual({ error: 'Class ID must be a number' })
    })

    test('should return assignments for a class', async () => {
      const mockClass = {
        id: 1,
        name: '1A',
        createdAt: new Date(),
        updatedAt: new Date(),
        description: null,
        classHeadId: null,
        classLeadId: null,
      }

      const mockStudents: Array<{ id: number; groupId: number | null }> = []
      const mockGroupAssignments: Array<{ groupId: number; class: string }> = []

      // Mock Prisma methods
      vi.mocked(prisma.class.findUnique).mockResolvedValue(mockClass as any)
      vi.mocked(prisma.student.findMany).mockResolvedValue(mockStudents as any)
      vi.mocked(prisma.groupAssignment.findMany).mockResolvedValue(mockGroupAssignments as any)
      vi.mocked(prisma.groupAssignment.upsert).mockResolvedValue({} as any)

      const request = new Request('http://localhost/api/schedules/assignments?classId=1')
      const response = await GET(request)
      const data = await response.json()

      expect(response.status).toBe(200)
      expect(data).toEqual({
        assignments: [],
        unassignedStudents: [],
      })
    })

    test('should handle database errors', async () => {
      vi.mocked(prisma.class.findUnique).mockRejectedValue(new Error('Database error'))

      const request = new Request('http://localhost/api/schedules/assignments?classId=1')
      const response = await GET(request)
      const data = await response.json()

      expect(response.status).toBe(500)
      expect(data).toEqual({ error: 'Failed to fetch assignments' })
    })
  })
})
