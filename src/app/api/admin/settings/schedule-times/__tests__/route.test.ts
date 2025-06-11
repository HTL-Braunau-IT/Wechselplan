import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GET, POST } from '../route';
import { prisma } from '@/lib/prisma';
import { captureError } from '@/lib/sentry';

// Mock prisma
vi.mock('@/lib/prisma', () => ({
  prisma: {
    scheduleTime: {
      findMany: vi.fn(),
      create: vi.fn(),
    },
  },
}));

// Mock sentry
vi.mock('@/lib/sentry', () => ({
  captureError: vi.fn(),
}));



describe('Schedule Times API', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('GET /api/admin/settings/schedule-times', () => {
    it('should return all schedule times ordered by start time', async () => {
      const mockScheduleTimes = [
        {
          id: 1,
          startTime: '08:00',
          endTime: '09:30',
          hours: 1.5,
          period: 'AM',
          createdAt: new Date('2024-03-20T09:30:00Z'),
          updatedAt: new Date('2024-03-20T09:30:00Z'),
        },
        {
          id: 2,
          startTime: '10:00',
          endTime: '11:30',
          hours: 1.5,
          period: 'AM',
          createdAt: new Date('2024-03-20T09:30:00Z'),
          updatedAt: new Date('2024-03-20T09:30:00Z'),
        },
      ];

      vi.mocked(prisma.scheduleTime.findMany).mockResolvedValue(mockScheduleTimes);

      const response = await GET();
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data).toEqual(mockScheduleTimes.map(time => ({
        ...time,
        createdAt: time.createdAt.toISOString(),
        updatedAt: time.updatedAt.toISOString(),
      })));
      expect(prisma.scheduleTime.findMany).toHaveBeenCalledWith({
        orderBy: { startTime: 'asc' },
      });
    });

    it('should handle database errors', async () => {
      const error = new Error('Database error');
      vi.mocked(prisma.scheduleTime.findMany).mockRejectedValue(error);

      const response = await GET();
      const data = await response.json();

      expect(response.status).toBe(500);
      expect(data).toEqual({ error: 'Failed to fetch schedule times' });
      
    });
  });

  describe('POST /api/admin/settings/schedule-times', () => {
    it('should create a new schedule time', async () => {
      const newScheduleTime = {
        startTime: '08:00',
        endTime: '09:30',
        hours: 1.5,
        period: 'AM',
      };

      const createdScheduleTime = {
        id: 1,
        ...newScheduleTime,
        createdAt: new Date('2024-03-20T09:30:00Z'),
        updatedAt: new Date('2024-03-20T09:30:00Z'),
      };

      vi.mocked(prisma.scheduleTime.create).mockResolvedValue(createdScheduleTime);

      const request = new Request('http://localhost/api/admin/settings/schedule-times', {
        method: 'POST',
        body: JSON.stringify(newScheduleTime),
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data).toEqual({
        ...createdScheduleTime,
        createdAt: createdScheduleTime.createdAt.toISOString(),
        updatedAt: createdScheduleTime.updatedAt.toISOString(),
      });
      expect(prisma.scheduleTime.create).toHaveBeenCalledWith({
        data: newScheduleTime,
      });
    });

    it('should validate required fields', async () => {
      const invalidScheduleTime = {
        startTime: '08:00',
        // Missing endTime
        hours: 1.5,
        // Missing period
      };

      const request = new Request('http://localhost/api/admin/settings/schedule-times', {
        method: 'POST',
        body: JSON.stringify(invalidScheduleTime),
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data).toEqual({ error: 'Missing required fields' });
      expect(prisma.scheduleTime.create).not.toHaveBeenCalled();
    });

    it('should validate hours is a positive number', async () => {
      const invalidScheduleTime = {
        startTime: '08:00',
        endTime: '09:30',
        hours: -1.5,
        period: 'AM',
      };

      const request = new Request('http://localhost/api/admin/settings/schedule-times', {
        method: 'POST',
        body: JSON.stringify(invalidScheduleTime),
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data).toEqual({ error: 'Hours must be a positive number' });
      expect(prisma.scheduleTime.create).not.toHaveBeenCalled();
    });

    it('should validate period is AM or PM', async () => {
      const invalidScheduleTime = {
        startTime: '08:00',
        endTime: '09:30',
        hours: 1.5,
        period: 'INVALID',
      };

      const request = new Request('http://localhost/api/admin/settings/schedule-times', {
        method: 'POST',
        body: JSON.stringify(invalidScheduleTime),
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data).toEqual({ error: 'Invalid period. Must be AM or PM' });
      expect(prisma.scheduleTime.create).not.toHaveBeenCalled();
    });

    it('should validate time format', async () => {
      const invalidScheduleTime = {
        startTime: '8:00', // Invalid format
        endTime: '09:30',
        hours: 1.5,
        period: 'AM',
      };

      const request = new Request('http://localhost/api/admin/settings/schedule-times', {
        method: 'POST',
        body: JSON.stringify(invalidScheduleTime),
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data).toEqual({ error: 'Invalid time format. Use HH:mm' });
      expect(prisma.scheduleTime.create).not.toHaveBeenCalled();
    });

    it('should handle database errors', async () => {
      const newScheduleTime = {
        startTime: '08:00',
        endTime: '09:30',
        hours: 1.5,
        period: 'AM',
      };

      const error = new Error('Database error');
      vi.mocked(prisma.scheduleTime.create).mockRejectedValue(error);

      const request = new Request('http://localhost/api/admin/settings/schedule-times', {
        method: 'POST',
        body: JSON.stringify(newScheduleTime),
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(500);
      expect(data).toEqual({ error: 'Failed to create schedule time' });
     
      expect(captureError).toHaveBeenCalledWith(error, {
        location: 'api/settings/schedule-times',
        type: 'create-schedule-time',
      });
    });
  });
}); 