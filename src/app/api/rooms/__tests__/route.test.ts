import { describe, expect, it, beforeEach, afterAll, vi } from 'vitest'
import { GET } from '../route'
import { prisma } from '@/lib/prisma'
import { captureError } from '@/lib/sentry'
import { NextResponse } from 'next/server'


// Mock the dependencies
vi.mock('@/lib/prisma', () => ({
  prisma: {
    room: {
      findMany: vi.fn()
    }
  }
}))

vi.mock('@/lib/sentry', () => ({
  captureError: vi.fn()
}))

describe('Rooms API', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })



  describe('GET /api/rooms', () => {
    it('should return rooms ordered by name', async () => {
      // Mock data
      const mockRooms = [
        { id: '1', name: 'Room A' },
        { id: '2', name: 'Room B' },
        { id: '3', name: 'Room C' }
      ]

      // Mock the database response
      ;(prisma.room.findMany as any).mockResolvedValue(mockRooms)

      // Call the GET handler
      const response = await GET()
      const data = await response.json()

      // Verify the response
      expect(response).toBeInstanceOf(NextResponse)
      expect(response.status).toBe(200)
      expect(data).toEqual({ rooms: mockRooms })

      // Verify the database call
      expect(prisma.room.findMany).toHaveBeenCalledWith({
        select: {
          id: true,
          name: true
        },
        orderBy: {
          name: 'asc'
        }
      })
    })

    it('should handle database errors', async () => {
      // Mock database error
      const mockError = new Error('Database connection failed')
      ;(prisma.room.findMany as any).mockRejectedValue(mockError)

      // Call the GET handler
      const response = await GET()
      const data = await response.json()

      // Verify the error response
      expect(response).toBeInstanceOf(NextResponse)
      expect(response.status).toBe(500)
      expect(data).toEqual({ error: 'Failed to fetch rooms' })

      // Verify error was captured
      expect(captureError).toHaveBeenCalledWith(mockError, {
        location: 'api/rooms',
        type: 'fetch-rooms'
      })
    })
  })
}) 