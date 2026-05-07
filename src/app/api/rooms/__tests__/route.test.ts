import { describe, expect, it, beforeEach, vi } from 'vitest'
import { GET } from '../route'
import { prisma } from '@/lib/prisma'
import { captureError } from '@/lib/sentry'
import { NextResponse } from 'next/server'

vi.mock('@/lib/prisma', () => ({
  prisma: {
    lookupValue: {
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
      const mockRooms = [
        { id: 1, name: 'Room A' },
        { id: 2, name: 'Room B' },
        { id: 3, name: 'Room C' }
      ]

      ;(prisma.lookupValue.findMany as any).mockResolvedValue(mockRooms)

      const response = await GET()
      const data = await response.json()

      expect(response).toBeInstanceOf(NextResponse)
      expect(response.status).toBe(200)
      expect(data).toEqual({ data: mockRooms })

      expect(prisma.lookupValue.findMany).toHaveBeenCalledWith({
        where: { kind: 'ROOM' },
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
      const mockError = new Error('Database connection failed')
      ;(prisma.lookupValue.findMany as any).mockRejectedValue(mockError)

      const response = await GET()
      const data = await response.json()

      expect(response).toBeInstanceOf(NextResponse)
      expect(response.status).toBe(500)
      expect(data).toEqual({
        error: {
          code: 'INTERNAL_ERROR',
          message: 'Failed to fetch rooms'
        }
      })

      expect(captureError).toHaveBeenCalledWith(mockError, {
        location: 'api/rooms',
        type: 'fetch-rooms'
      })
    })
  })
})
