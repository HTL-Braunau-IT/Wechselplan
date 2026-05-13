import { describe, expect, it, beforeEach, afterAll, vi } from 'vitest'
import { GET, POST } from '../route'
import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'





vi.mock('@/lib/prisma', () => ({
  prisma: {
    class: {
      findFirst: vi.fn()
    },
    schedule: {
      findFirst: vi.fn(),
      findMany: vi.fn(),
      deleteMany: vi.fn(),
      create: vi.fn(),
      update: vi.fn()
    },
    schoolYear: {
      findFirst: vi.fn()
    },
    scheduleTurn: {
      deleteMany: vi.fn()
    },
    teacherRotation: {
      findMany: vi.fn(),
      createMany: vi.fn()
    }
  }
}))

describe('Schedules API', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(prisma.schoolYear.findFirst).mockResolvedValue({ id: 1 } as never)
  })


  describe('GET /api/schedules', () => {
    it('should return schedules for a class and weekday', async () => {
      // Mock data
      const mockClass = {
        id: 1,
        name: '1A',
        createdAt: new Date(),
        updatedAt: new Date(),
        description: null,
        classHeadId: null,
        classLeadId: null
      }

      const mockSchedules = [
        {
          id: 1,
          name: 'Schedule 1',
          description: 'Test schedule',
          startDate: new Date('2024-01-01T00:00:00.000Z'),
          endDate: new Date('2024-01-31T00:00:00.000Z'),
          selectedWeekday: 1,
          classId: 1,
          schoolYearId: 1,
          additionalInfo: null,
          semesterPlanning: null,
          createdAt: new Date('2025-06-11T11:56:57.353Z'),
          updatedAt: new Date('2025-06-11T11:56:57.353Z'),
          turns: []
        }
      ] as never[]

      // Mock the database responses
      vi.mocked(prisma.class.findFirst).mockResolvedValue(mockClass as never)
      vi.mocked(prisma.schedule.findMany).mockResolvedValue(mockSchedules)

      // Create request with query parameters
      const request = new Request('http://localhost/api/schedules?classId=1A&weekday=1')

      // Call the GET handler
      const response = await GET(request)
      const data = await response.json()

      // Verify the response (API returns JSON so dates are serialized as strings)
      expect(response).toBeInstanceOf(NextResponse)
      expect(response.status).toBe(200)
      expect(data.data).toHaveLength(1)
      expect(data.data[0]).toMatchObject({
        id: 1,
        name: 'Schedule 1',
        classId: 1,
        turns: []
      })
      expect(typeof data.data[0].createdAt).toBe('string')
      expect(typeof data.data[0].updatedAt).toBe('string')

      // Verify the database calls
      expect(prisma.class.findFirst).toHaveBeenCalledWith({
        where: {
          name: '1A'
        }
      })

      expect(prisma.schedule.findMany).toHaveBeenCalledWith({
        where: {
          classId: 1,
          schoolYearId: 1,
          selectedWeekday: 1
        },
        include: {
          turns: {
            include: {
              weeks: true,
              holidays: {
                include: {
                  holiday: true
                }
              }
            },
            orderBy: {
              order: 'asc'
            }
          }
        },
        orderBy: {
          createdAt: 'desc'
        }
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
      const data = await response.json()

      // Verify the error response
      expect(response).toBeInstanceOf(NextResponse)
      expect(response.status).toBe(500)
      expect(data).toEqual({
        error: {
          code: 'INTERNAL_ERROR',
          message: 'Failed to fetch schedules'
        }
      })
    })
  })

  describe('POST /api/schedules', () => {
    it('should create a new schedule', async () => {
      // Mock data
      const mockSchedule = {
        id: 1,
        name: 'New Schedule',
        description: 'Test schedule',
        startDate: new Date('2024-01-01T00:00:00.000Z'),
        endDate: new Date('2024-01-31T00:00:00.000Z'),
        selectedWeekday: 1,
        classId: 1,
        schoolYearId: 1,
        additionalInfo: null,
        semesterPlanning: null,
        createdAt: new Date('2025-06-11T11:56:57.353Z'),
        updatedAt: new Date('2025-06-11T11:56:57.353Z')
      }

      // Mock the database responses
      vi.mocked(prisma.schedule.findFirst).mockResolvedValue(null) // No existing schedule
      vi.mocked(prisma.schedule.deleteMany).mockResolvedValue({ count: 1 })
      vi.mocked(prisma.schedule.create).mockResolvedValue(mockSchedule as never)

      // Create request with valid data
      const request = new Request('http://localhost/api/schedules', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
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
          semesterPlanning: null
        })
      })

      // Call the POST handler
      const response = await POST(request)
      const data = await response.json()


      // Verify the response (API returns JSON so dates are strings)
      expect(response).toBeInstanceOf(NextResponse)
      expect(response.status).toBe(201)
      expect(data.data).toMatchObject({
        id: 1,
        name: 'New Schedule',
        description: 'Test schedule',
        classId: 1,
        selectedWeekday: 1,
        additionalInfo: null,
        semesterPlanning: null,
      })
      expect(typeof data.data.createdAt).toBe('string')
      expect(typeof data.data.updatedAt).toBe('string')
      expect(typeof data.data.startDate).toBe('string')
      expect(typeof data.data.endDate).toBe('string')

      // Verify the database calls
      expect(prisma.schedule.findFirst).toHaveBeenCalledWith({
        where: {
          classId: 1,
          selectedWeekday: 1,
          schoolYearId: 1
        },
        include: {
          scheduleTimes: true,
          breakTimes: true
        }
      })

      expect(prisma.schedule.create).toHaveBeenCalledWith({
        data: {
          name: 'New Schedule',
          description: 'Test schedule',
          startDate: new Date('2024-01-01'),
          endDate: new Date('2024-01-31'),
          selectedWeekday: 1,
          schoolYearId: 1,
          classId: 1,
          additionalInfo: null,
          semesterPlanning: null,
          pmBiweeklyAnchor: null,
          turns: {
            create: []
          }
        },
        include: {
          scheduleTimes: true,
          breakTimes: true,
          turns: {
            include: {
              weeks: true,
              holidays: {
                include: {
                  holiday: true
                }
              }
            },
            orderBy: {
              order: 'asc'
            }
          }
        }
      })
    })

    it('should handle validation errors', async () => {
      // Create request with invalid data
      const request = new Request('http://localhost/api/schedules', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          name: '', // Invalid: empty name
          startDate: 'invalid-date', // Invalid date format
          endDate: '2024-01-31',
          selectedWeekday: 7 // Invalid: weekday out of range
        })
      })

      // Call the POST handler
      const response = await POST(request)
      const data = await response.json()

      // Verify the error response
      expect(response).toBeInstanceOf(NextResponse)
      expect(response.status).toBe(422)
      expect(data).toHaveProperty('error.code', 'UNPROCESSABLE')
      expect(data).toHaveProperty('error.message', 'Invalid request data')
      expect(data).toHaveProperty('error.details')
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
          'Content-Type': 'application/json'
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
          semesterPlanning: null
        })
      })

      // Call the POST handler
      const response = await POST(request)
      const data = await response.json()

      // Verify the error response
      expect(response).toBeInstanceOf(NextResponse)
      expect(response.status).toBe(500)
      expect(data).toEqual({
        error: {
          code: 'INTERNAL_ERROR',
          message: 'Failed to create schedule'
        }
      })
    })

    it('should create a schedule with first semester planning', async () => {
      // Mock data
      const mockSchedule = {
        id: 1,
        name: 'First Semester Schedule',
        description: 'Test first semester schedule',
        startDate: new Date('2024-01-01T00:00:00.000Z'),
        endDate: new Date('2024-01-31T00:00:00.000Z'),
        selectedWeekday: 1,
        classId: 1,
        schoolYearId: 1,
        additionalInfo: null,
        semesterPlanning: 'first',
        createdAt: new Date('2025-06-11T11:56:57.353Z'),
        updatedAt: new Date('2025-06-11T11:56:57.353Z')
      }

      // Mock the database responses
      vi.mocked(prisma.schedule.findFirst).mockResolvedValue(null) // No existing schedule
      vi.mocked(prisma.schedule.create).mockResolvedValue(mockSchedule as never)

      // Create request with first semester planning
      const request = new Request('http://localhost/api/schedules', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
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
          semesterPlanning: 'first'
        })
      })

      // Call the POST handler
      const response = await POST(request)
      const data = await response.json()

      // Verify the response (API returns JSON so dates are strings)
      expect(response).toBeInstanceOf(NextResponse)
      expect(response.status).toBe(201)
      expect(data.data).toMatchObject({
        id: 1,
        name: 'First Semester Schedule',
        description: 'Test first semester schedule',
        classId: 1,
        selectedWeekday: 1,
        additionalInfo: null,
        semesterPlanning: 'first',
      })
      expect(typeof data.data.createdAt).toBe('string')
      expect(typeof data.data.updatedAt).toBe('string')

      // Verify the database call includes semesterPlanning
      expect(prisma.schedule.create).toHaveBeenCalledWith({
        data: {
          name: 'First Semester Schedule',
          description: 'Test first semester schedule',
          startDate: new Date('2024-01-01'),
          endDate: new Date('2024-01-31'),
          selectedWeekday: 1,
          schoolYearId: 1,
          classId: 1,
          additionalInfo: null,
          semesterPlanning: 'first',
          pmBiweeklyAnchor: null,
          turns: {
            create: []
          }
        },
        include: {
          scheduleTimes: true,
          breakTimes: true,
          turns: {
            include: {
              weeks: true,
              holidays: {
                include: {
                  holiday: true
                }
              }
            },
            orderBy: {
              order: 'asc'
            }
          }
        }
      })
    })

    it('should relink teacher rotations after updating an existing schedule', async () => {
      const existing = {
        id: 10,
        name: 'Old',
        description: null,
        startDate: new Date('2024-01-01'),
        endDate: new Date('2024-06-30'),
        selectedWeekday: 1,
        classId: 1,
        schoolYearId: 1,
        additionalInfo: null,
        semesterPlanning: null,
        pmBiweeklyAnchor: null,
        createdAt: new Date(),
        updatedAt: new Date(),
        scheduleTimes: [],
        breakTimes: []
      }
      vi.mocked(prisma.schedule.findFirst).mockResolvedValue(existing as never)
      vi.mocked(prisma.teacherRotation.findMany).mockResolvedValue([
        {
          groupId: 2,
          teacherId: 7,
          period: 'AM',
          schoolYearId: 1,
          selectedWeekday: 1,
          turn: { name: 'TURNUS 1', order: 0 }
        }
      ] as never)
      vi.mocked(prisma.scheduleTurn.deleteMany).mockResolvedValue({ count: 1 })
      vi.mocked(prisma.schedule.update).mockResolvedValue({
        ...existing,
        turns: [
          {
            id: 501,
            name: 'TURNUS 1',
            order: 0,
            customLength: null,
            scheduleId: 10,
            createdAt: new Date(),
            updatedAt: new Date(),
            weeks: [],
            holidays: []
          }
        ]
      } as never)
      vi.mocked(prisma.teacherRotation.createMany).mockResolvedValue({ count: 1 })

      const request = new Request('http://localhost/api/schedules', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: 'Updated',
          description: 'd',
          startDate: '2024-01-01',
          endDate: '2024-06-30',
          selectedWeekday: 1,
          classId: '1',
          schoolYearId: 1,
          scheduleData: {
            'TURNUS 1': {
              weeks: [{ date: '02.09.24', week: 'KW36', isHoliday: false }]
            }
          },
          additionalInfo: null,
          semesterPlanning: null
        })
      })

      const response = await POST(request)
      expect(response.status).toBe(201)
      expect(prisma.teacherRotation.findMany).toHaveBeenCalled()
      expect(prisma.teacherRotation.createMany).toHaveBeenCalledWith({
        data: [
          {
            classId: 1,
            groupId: 2,
            teacherId: 7,
            period: 'AM',
            schoolYearId: 1,
            selectedWeekday: 1,
            turnId: 501
          }
        ]
      })
    })
  })
}) 