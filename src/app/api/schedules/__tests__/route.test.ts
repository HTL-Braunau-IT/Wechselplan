import { describe, expect, it, beforeEach, afterAll, vi } from 'vitest'
import { GET, POST } from '../route'
import { db } from '@/lib/db'
import { NextResponse } from 'next/server'



// Mock the dependencies
vi.mock('@/lib/db', () => ({
  db: {
    schedule: {
      findMany: vi.fn(),
      deleteMany: vi.fn(),
      create: vi.fn()
    }
  }
}))

describe('Schedules API', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })


  describe('GET /api/schedules', () => {
    it('should return schedules for a class and weekday', async () => {
      // Mock data
      const mockSchedules = [
        {
          id: 1,
          name: 'Schedule 1',
          description: 'Test schedule',
          startDate: '2024-01-01T00:00:00.000Z',
          endDate: '2024-01-31T00:00:00.000Z',
          selectedWeekday: 1,
          classId: 1,
          scheduleData: {},
          additionalInfo: null,
          createdAt: '2025-06-11T11:56:57.353Z',
          updatedAt: '2025-06-11T11:56:57.353Z'
        }
      ]

      // Mock the database response
      ;(db.schedule.findMany as any).mockResolvedValue(mockSchedules)

      // Create request with query parameters
      const request = new Request('http://localhost/api/schedules?classId=1&weekday=1')

      // Call the GET handler
      const response = await GET(request)
      const data = await response.json()

      // Verify the response
      expect(response).toBeInstanceOf(NextResponse)
      expect(response.status).toBe(200)
      expect(data).toEqual(mockSchedules)

      // Verify the database call
      expect(db.schedule.findMany).toHaveBeenCalledWith({
        where: {
          classId: 1,
          selectedWeekday: 1
        },
        orderBy: {
          createdAt: 'desc'
        }
      })
    })

    it('should return all schedules when no filters are provided', async () => {
      // Mock data
      const mockSchedules = [
        {
          id: 1,
          name: 'Schedule 1',
          description: 'Test schedule',
          startDate: '2024-01-01T00:00:00.000Z',
          endDate: '2024-01-31T00:00:00.000Z',
          selectedWeekday: 1,
          classId: 1,
          scheduleData: {},
          additionalInfo: null,
          createdAt: '2025-06-11T11:56:57.353Z',
          updatedAt: '2025-06-11T11:56:57.353Z'
        }
      ]

      // Mock the database response
      ;(db.schedule.findMany as any).mockResolvedValue(mockSchedules)

      // Create request without query parameters
      const request = new Request('http://localhost/api/schedules')

      // Call the GET handler
      const response = await GET(request)
      const data = await response.json()

      // Verify the response
      expect(response).toBeInstanceOf(NextResponse)
      expect(response.status).toBe(200)
      expect(data).toEqual(mockSchedules)

      // Verify the database call
      expect(db.schedule.findMany).toHaveBeenCalledWith({
        where: {
          classId: undefined,
          selectedWeekday: undefined
        },
        orderBy: {
          createdAt: 'desc'
        }
      })
    })

    it('should handle database errors', async () => {
      // Mock database error
      const mockError = new Error('Database connection failed')
      ;(db.schedule.findMany as any).mockRejectedValue(mockError)

      // Create request
      const request = new Request('http://localhost/api/schedules')

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
      const mockSchedule = {
        id: 1,
        name: 'New Schedule',
        description: 'Test schedule',
        startDate: '2024-01-01T00:00:00.000Z',
        endDate: '2024-01-31T00:00:00.000Z',
        selectedWeekday: 1,
        classId: 1,
        scheduleData: {},
        additionalInfo: null,
        createdAt: '2025-06-11T11:56:57.353Z',
        updatedAt: '2025-06-11T11:56:57.353Z'
      }

      // Mock the database responses
      ;(db.schedule.deleteMany as any).mockResolvedValue({ count: 1 })
      ;(db.schedule.create as any).mockResolvedValue(mockSchedule)

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
          additionalInfo: null
        })
      })

      // Call the POST handler
      const response = await POST(request)
      const data = await response.json()

      // Verify the response
      expect(response).toBeInstanceOf(NextResponse)
      expect(response.status).toBe(200)
      expect(data).toEqual(mockSchedule)

      // Verify the database calls
      expect(db.schedule.deleteMany).toHaveBeenCalledWith({
        where: {
          classId: 1,
          selectedWeekday: 1
        }
      })

      expect(db.schedule.create).toHaveBeenCalledWith({
        data: {
          name: 'New Schedule',
          description: 'Test schedule',
          startDate: expect.any(Date),
          endDate: expect.any(Date),
          selectedWeekday: 1,
          classId: 1,
          scheduleData: {},
          additionalInfo: null
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
      expect(response.status).toBe(400)
      expect(data).toHaveProperty('error', 'Invalid request data')
      expect(data).toHaveProperty('details')
    })

    it('should handle database errors', async () => {
      // Mock database error
      const mockError = new Error('Database connection failed')
      ;(db.schedule.deleteMany as any).mockRejectedValue(mockError)

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
          additionalInfo: null
        })
      })

      // Call the POST handler
      const response = await POST(request)

      // Verify the error response
      expect(response).toBeInstanceOf(NextResponse)
      expect(response.status).toBe(500)
      expect(await response.text()).toBe('Internal Error')
    })
  })
}) 