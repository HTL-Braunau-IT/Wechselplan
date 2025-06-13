import { describe, test, expect, vi, beforeEach } from 'vitest';
import { GET, POST } from '../route';
import { captureError } from '@/lib/sentry';
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

// Mock sentry
vi.mock('@/lib/sentry', () => ({
  captureError: vi.fn(),
}));

// Mock NextResponse
vi.mock('next/server', () => ({
  NextResponse: {
    json: vi.fn().mockImplementation((data: unknown, init?: ResponseInit) => {
      return new Response(JSON.stringify(data), init);
    }),
  },
}));

// Mock Prisma
vi.mock('@/lib/prisma', () => ({
  prisma: {
    class: {
      findFirst: vi.fn(),
    },
    schedule: {
      findFirst: vi.fn(),
      update: vi.fn(),
    },
  },
}));

describe('Schedule Times API', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('GET /api/schedule/times', () => {
    test('should return 400 if class name is not provided', async () => {
      const request = new Request('http://localhost/api/schedule/times');
      const response = await GET(request);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data).toEqual({ error: 'Class name is required' });
    });

    test('should return 404 if no schedule found for class', async () => {
      const request = new Request('http://localhost/api/schedule/times?className=TestClass');
      
      const mockClass = {
        id: 1,
        name: 'TestClass',
        createdAt: new Date(),
        updatedAt: new Date(),
        description: null,
        classHeadId: null,
        classLeadId: null,
      };

      vi.mocked(prisma.class.findFirst).mockResolvedValueOnce(mockClass);
      vi.mocked(prisma.schedule.findFirst).mockResolvedValueOnce(null);

      const response = await GET(request);
      const data = await response.json();

      expect(response.status).toBe(404);
      expect(data).toEqual({ error: 'No schedule times found for this class' });
    });

    test('should return schedule times for class', async () => {
      const mockClass = {
        id: 1,
        name: 'TestClass',
        createdAt: new Date(),
        updatedAt: new Date(),
        description: null,
        classHeadId: null,
        classLeadId: null,
      };

      const mockSchedule = {
        id: 1,
        name: 'Test Schedule',
        classId: 1,
        createdAt: new Date(),
        updatedAt: new Date(),
        description: null,
        startDate: new Date(),
        endDate: new Date(),
        selectedWeekday: 1,
        scheduleData: {},
        additionalInfo: null,
        scheduleTimes: [
          { id: 1, startTime: '08:00', endTime: '08:50' },
          { id: 2, startTime: '08:50', endTime: '09:40' },
        ],
        breakTimes: [
          { id: 1, startTime: '08:45', endTime: '08:50' },
        ],
      };

      const request = new Request('http://localhost/api/schedule/times?className=TestClass');
      
      vi.mocked(prisma.class.findFirst).mockResolvedValueOnce(mockClass);
      vi.mocked(prisma.schedule.findFirst).mockResolvedValueOnce(mockSchedule);

      const response = await GET(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      // Convert dates to ISO strings for comparison
      const expectedSchedule = {
        ...mockSchedule,
        createdAt: mockSchedule.createdAt.toISOString(),
        updatedAt: mockSchedule.updatedAt.toISOString(),
        startDate: mockSchedule.startDate.toISOString(),
        endDate: mockSchedule.endDate.toISOString(),
      };
      expect(data).toEqual({ times: expectedSchedule });
    });
  });

  describe('POST /api/schedule/times', () => {
    test('should return 400 if class name is not provided', async () => {
      const request = new Request('http://localhost/api/schedule/times', {
        method: 'POST',
        body: JSON.stringify({ scheduleTimes: [], breakTimes: [] }),
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data).toEqual({ error: 'Class ID is required' });
    });

    test('should return 404 if no schedule found for class', async () => {
      const request = new Request('http://localhost/api/schedule/times', {
        method: 'POST',
        body: JSON.stringify({
          className: 'TestClass',
          scheduleTimes: [],
          breakTimes: [],
        }),
      });

      const mockClass = {
        id: 1,
        name: 'TestClass',
        createdAt: new Date(),
        updatedAt: new Date(),
        description: null,
        classHeadId: null,
        classLeadId: null,
      };

      vi.mocked(prisma.class.findFirst).mockResolvedValueOnce(mockClass);
      vi.mocked(prisma.schedule.findFirst).mockResolvedValueOnce(null);

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(404);
      expect(data).toEqual({ error: 'No schedule found for this class' });
    });

    test('should update schedule times successfully', async () => {
      const mockClass = {
        id: 1,
        name: 'TestClass',
        createdAt: new Date(),
        updatedAt: new Date(),
        description: null,
        classHeadId: null,
        classLeadId: null,
      };

      const mockSchedule = {
        id: 1,
        name: 'Test Schedule',
        classId: 1,
        createdAt: new Date(),
        updatedAt: new Date(),
        description: null,
        startDate: new Date(),
        endDate: new Date(),
        selectedWeekday: 1,
        scheduleData: {},
        additionalInfo: null,
        scheduleTimes: [],
        breakTimes: [],
      };

      const updatedSchedule = {
        ...mockSchedule,
        scheduleTimes: [{ id: 1 }],
        breakTimes: [{ id: 1 }],
      };

      const request = new Request('http://localhost/api/schedule/times', {
        method: 'POST',
        body: JSON.stringify({
          className: 'TestClass',
          scheduleTimes: [{ id: 1 }],
          breakTimes: [{ id: 1 }],
        }),
      });

      vi.mocked(prisma.class.findFirst).mockResolvedValueOnce(mockClass);
      vi.mocked(prisma.schedule.findFirst).mockResolvedValueOnce(mockSchedule);
      vi.mocked(prisma.schedule.update).mockResolvedValueOnce(updatedSchedule);

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      // Convert dates to ISO strings for comparison
      const expectedSchedule = {
        ...updatedSchedule,
        createdAt: updatedSchedule.createdAt.toISOString(),
        updatedAt: updatedSchedule.updatedAt.toISOString(),
        startDate: updatedSchedule.startDate.toISOString(),
        endDate: updatedSchedule.endDate.toISOString(),
      };
      expect(data).toEqual(expectedSchedule);
    });

    test('should handle errors during update', async () => {
      const request = new Request('http://localhost/api/schedule/times', {
        method: 'POST',
        body: JSON.stringify({
          className: 'TestClass',
          scheduleTimes: [{ id: 1 }],
          breakTimes: [{ id: 1 }],
        }),
      });

      const error = new Error('Database error');
      vi.mocked(prisma.class.findFirst).mockRejectedValueOnce(error);

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(500);
      expect(data).toEqual({ error: 'Failed to save times' });
      expect(captureError).toHaveBeenCalledWith(error, {
        location: 'api/schedule/times',
        type: 'save-times',
      });
    });
  });
}); 