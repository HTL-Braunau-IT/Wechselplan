import { describe, expect, it, beforeEach, vi } from 'vitest'
import { GET, POST } from '../route'
import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { makeClass, makeSchedule } from '@/test/fixtures'

vi.mock('@/lib/prisma', () => ({
  prisma: {
    class: {
      findFirst: vi.fn(),
      findUnique: vi.fn(),
    },
    schedule: {
      findFirst: vi.fn(),
      findMany: vi.fn(),
      deleteMany: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
    // Both handlers resolve the active school year first, and POST replaces
    // normalised turns before writing. Missing either mock 500s every request.
    schoolYear: {
      findFirst: vi.fn(),
    },
    scheduleTurn: {
      deleteMany: vi.fn(),
    },
    // POST records who authored the plan and then notifies everyone attached to
    // the class (src/app/api/schedules/_notify.ts).
    teacher: {
      findUnique: vi.fn(),
    },
    teacherAssignment: {
      findMany: vi.fn(),
    },
    teacherRotation: {
      findMany: vi.fn(),
    },
    notification: {
      findMany: vi.fn(),
      createMany: vi.fn(),
      updateMany: vi.fn(),
      deleteMany: vi.fn(),
    },
  },
}))

// POST reads the session to record the plan's author. Without these mocks
// getServerSession() throws and every POST assertion collapses into a 500.
vi.mock('next-auth', () => ({
  getServerSession: vi.fn(async () => ({ user: { name: 'test.teacher', role: 'teacher' } })),
}))

vi.mock('@/lib/auth', () => ({
  authOptions: {},
}))

describe('Schedules API', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(prisma.schoolYear.findFirst).mockResolvedValue({ id: 1 } as never)
    vi.mocked(prisma.scheduleTurn.deleteMany).mockResolvedValue({ count: 0 })
    // No Teacher row behind the session and no class to notify about: the
    // notification pass then short-circuits and these tests stay about the
    // schedule write itself.
    vi.mocked(prisma.teacher.findUnique).mockResolvedValue(null as never)
    vi.mocked(prisma.class.findUnique).mockResolvedValue(null as never)
  })

  describe('GET /api/schedules', () => {
    it('should return schedules for a class and weekday', async () => {
      // Mock data
      const mockClass = makeClass({ id: 1, name: '1A' })

      // The route selects `turns` alongside the row, which the generated
      // findMany type does not describe, hence the cast.
      const mockSchedules = [
        {
          ...makeSchedule({
            id: 1,
            name: 'Schedule 1',
            description: 'Test schedule',
            startDate: new Date('2024-01-01T00:00:00.000Z'),
            endDate: new Date('2024-01-31T00:00:00.000Z'),
            classId: 1,
          }),
          turns: [],
        },
      ] as unknown as Awaited<ReturnType<typeof prisma.schedule.findMany>>

      // Mock the database responses
      vi.mocked(prisma.class.findFirst).mockResolvedValue(mockClass)
      vi.mocked(prisma.schedule.findMany).mockResolvedValue(mockSchedules)

      // Create request with query parameters
      const request = new Request('http://localhost/api/schedules?classId=1A&weekday=1')

      // Call the GET handler
      const response = await GET(request)
      const text = await response.text()
      const data = text === 'Internal Error' ? null : JSON.parse(text)

      // Verify the response (API returns JSON so dates are serialized as strings)
      expect(response).toBeInstanceOf(NextResponse)
      expect(response.status).toBe(200)
      expect(data).toHaveLength(1)
      expect(data[0]).toMatchObject({
        id: 1,
        name: 'Schedule 1',
        classId: 1,
        scheduleData: null,
        turns: [],
      })
      expect(typeof data[0].createdAt).toBe('string')
      expect(typeof data[0].updatedAt).toBe('string')

      // Verify the database calls
      expect(prisma.class.findFirst).toHaveBeenCalledWith({
        where: {
          name: '1A',
        },
      })

      expect(prisma.schedule.findMany).toHaveBeenCalledWith({
        where: {
          classId: 1,
          selectedWeekday: 1,
          schoolYearId: 1,
        },
        include: {
          turns: {
            include: {
              weeks: true,
              holidays: {
                include: {
                  holiday: true,
                },
              },
            },
            orderBy: [{ period: 'asc' }, { order: 'asc' }],
          },
        },
        orderBy: {
          createdAt: 'desc',
        },
      })
    })

    it('should handle database errors', async () => {
      // Mock database error
      const mockError = new Error('Database connection failed')
      vi.mocked(prisma.schedule.findMany).mockRejectedValue(mockError)

      // Create request with class name
      const request = new Request('http://localhost/api/schedules?classId=1')

      // Call the GET handler
      const response = await GET(request)

      // Verify the error response
      expect(response).toBeInstanceOf(NextResponse)
      expect(response.status).toBe(500)
      expect(await response.text()).toBe('Internal Error')
    })
  })

  describe('POST /api/schedules', () => {
    it('should create a new schedule', async () => {
      // Mock data
      const mockSchedule = makeSchedule({
        id: 1,
        name: 'New Schedule',
        description: 'Test schedule',
        startDate: new Date('2024-01-01T00:00:00.000Z'),
        endDate: new Date('2024-01-31T00:00:00.000Z'),
        classId: 1,
        scheduleData: {},
        semesterPlanning: null,
      })

      // Mock the database responses
      vi.mocked(prisma.schedule.findFirst).mockResolvedValue(null) // No existing schedule
      vi.mocked(prisma.schedule.deleteMany).mockResolvedValue({ count: 1 })
      vi.mocked(prisma.schedule.create).mockResolvedValue(mockSchedule)

      // Create request with valid data
      const request = new Request('http://localhost/api/schedules', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          name: 'New Schedule',
          description: 'Test schedule',
          startDate: '2024-01-01',
          endDate: '2024-01-31',
          selectedWeekday: 1,
          classId: '1',
          scheduleData: {},
          additionalInfo: null,
          semesterPlanning: null,
        }),
      })

      // Call the POST handler
      const response = await POST(request)
      const text = await response.text()
      const data = text === 'Internal Error' ? null : JSON.parse(text)

      // Verify the response (API returns JSON so dates are strings)
      expect(response).toBeInstanceOf(NextResponse)
      expect(response.status).toBe(200)
      expect(data).toMatchObject({
        id: 1,
        name: 'New Schedule',
        description: 'Test schedule',
        classId: 1,
        selectedWeekday: 1,
        scheduleData: {},
        additionalInfo: null,
        semesterPlanning: null,
      })
      expect(typeof data.createdAt).toBe('string')
      expect(typeof data.updatedAt).toBe('string')
      expect(typeof data.startDate).toBe('string')
      expect(typeof data.endDate).toBe('string')

      // Verify the database calls
      expect(prisma.schedule.findFirst).toHaveBeenCalledWith({
        where: {
          classId: 1,
          selectedWeekday: 1,
          schoolYearId: 1,
        },
        include: {
          scheduleTimes: true,
          breakTimes: true,
        },
      })

      expect(prisma.schedule.create).toHaveBeenCalledWith({
        data: {
          name: 'New Schedule',
          description: 'Test schedule',
          startDate: expect.any(Date),
          endDate: expect.any(Date),
          selectedWeekday: 1,
          classId: 1,
          schoolYearId: 1,
          // Per-period lane config. Empty scheduleData enables the AM lane by
          // default; no PM blob was sent, so PM stays off.
          amEnabled: true,
          pmEnabled: false,
          amWeekInterval: 1,
          amWeekOffset: 0,
          pmWeekInterval: 1,
          pmWeekOffset: 0,
          scheduleData: expect.anything(), // JsonNull after migration
          additionalInfo: null,
          semesterPlanning: null,
          // No Teacher row behind the mocked session, so the author is unknown.
          createdById: null,
          // No turns are created for an empty lane.
        },
        include: {
          scheduleTimes: true,
          breakTimes: true,
          turns: {
            include: {
              weeks: true,
              holidays: {
                include: {
                  holiday: true,
                },
              },
            },
            orderBy: [{ period: 'asc' }, { order: 'asc' }],
          },
        },
      })
    })

    it('should handle validation errors', async () => {
      // Create request with invalid data
      const request = new Request('http://localhost/api/schedules', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          name: '', // Invalid: empty name
          startDate: 'invalid-date', // Invalid date format
          endDate: '2024-01-31',
          selectedWeekday: 7, // Invalid: weekday out of range
        }),
      })

      // Call the POST handler
      const response = await POST(request)
      const data = await response.json()

      // Verify the error response
      expect(response).toBeInstanceOf(NextResponse)
      expect(response.status).toBe(400)
      expect(data).toHaveProperty('error', 'Invalid request data')
      expect(data).toHaveProperty('details')
    })

    it('should handle database errors', async () => {
      // Mock database error
      const mockError = new Error('Database connection failed')
      vi.mocked(prisma.schedule.findFirst).mockResolvedValue(null) // No existing schedule
      vi.mocked(prisma.schedule.create).mockRejectedValue(mockError)

      // Create request with valid data
      const request = new Request('http://localhost/api/schedules', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          name: 'New Schedule',
          description: 'Test schedule',
          startDate: '2024-01-01',
          endDate: '2024-01-31',
          selectedWeekday: 1,
          classId: '1',
          scheduleData: {},
          additionalInfo: null,
          semesterPlanning: null,
        }),
      })

      // Call the POST handler
      const response = await POST(request)

      // Verify the error response
      expect(response).toBeInstanceOf(NextResponse)
      expect(response.status).toBe(500)
      expect(await response.text()).toBe('Internal Error')
    })

    it('should create a schedule with first semester planning', async () => {
      // Mock data
      const mockSchedule = makeSchedule({
        id: 1,
        name: 'First Semester Schedule',
        description: 'Test first semester schedule',
        startDate: new Date('2024-01-01T00:00:00.000Z'),
        endDate: new Date('2024-01-31T00:00:00.000Z'),
        classId: 1,
        scheduleData: {},
        semesterPlanning: 'first',
      })

      // Mock the database responses
      vi.mocked(prisma.schedule.findFirst).mockResolvedValue(null) // No existing schedule
      vi.mocked(prisma.schedule.create).mockResolvedValue(mockSchedule)

      // Create request with first semester planning
      const request = new Request('http://localhost/api/schedules', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          name: 'First Semester Schedule',
          description: 'Test first semester schedule',
          startDate: '2024-01-01',
          endDate: '2024-01-31',
          selectedWeekday: 1,
          classId: '1',
          scheduleData: {},
          additionalInfo: null,
          semesterPlanning: 'first',
        }),
      })

      // Call the POST handler
      const response = await POST(request)
      const text = await response.text()
      const data = text === 'Internal Error' ? null : JSON.parse(text)

      // Verify the response (API returns JSON so dates are strings)
      expect(response).toBeInstanceOf(NextResponse)
      expect(response.status).toBe(200)
      expect(data).toMatchObject({
        id: 1,
        name: 'First Semester Schedule',
        description: 'Test first semester schedule',
        classId: 1,
        selectedWeekday: 1,
        scheduleData: {},
        additionalInfo: null,
        semesterPlanning: 'first',
      })
      expect(typeof data.createdAt).toBe('string')
      expect(typeof data.updatedAt).toBe('string')

      // Verify the database call includes semesterPlanning
      expect(prisma.schedule.create).toHaveBeenCalledWith({
        data: {
          name: 'First Semester Schedule',
          description: 'Test first semester schedule',
          startDate: expect.any(Date),
          endDate: expect.any(Date),
          selectedWeekday: 1,
          classId: 1,
          schoolYearId: 1,
          amEnabled: true,
          pmEnabled: false,
          amWeekInterval: 1,
          amWeekOffset: 0,
          pmWeekInterval: 1,
          pmWeekOffset: 0,
          scheduleData: expect.anything(), // JsonNull after migration
          additionalInfo: null,
          semesterPlanning: 'first',
          createdById: null,
        },
        include: {
          scheduleTimes: true,
          breakTimes: true,
          turns: {
            include: {
              weeks: true,
              holidays: {
                include: {
                  holiday: true,
                },
              },
            },
            orderBy: [{ period: 'asc' }, { order: 'asc' }],
          },
        },
      })
    })
  })
})
