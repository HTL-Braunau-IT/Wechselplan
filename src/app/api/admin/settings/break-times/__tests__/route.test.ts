import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GET, POST } from '../route';
import { prisma } from '@/lib/prisma';
import { captureError } from '@/lib/sentry';

// Mock prisma
vi.mock('@/lib/prisma', () => ({
  prisma: {
    breakTime: {
      findMany: vi.fn(),
      create: vi.fn(),
    },
  },
}));

// Mock sentry
vi.mock('~/lib/sentry', () => ({
  captureError: vi.fn(),
}));

describe('Break Times API', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('GET /api/admin/settings/break-times', () => {
    it('should return all break times ordered by start time', async () => {
      const mockBreakTimes = [
        {
          id: 1,
          name: 'Morning Break',
          startTime: '2024-03-20T09:30:00Z',
          endTime: '2024-03-20T09:45:00Z',
          period: '1',
          createdAt: new Date('2025-06-11T11:28:21.934Z'),
          updatedAt: new Date('2025-06-11T11:28:21.934Z'),
        },
        {
          id: 2,
          name: 'Lunch Break',
          startTime: '2024-03-20T12:00:00Z',
          endTime: '2024-03-20T12:30:00Z',
          period: '2',
          createdAt: new Date('2025-06-11T11:28:21.934Z'),
          updatedAt: new Date('2025-06-11T11:28:21.934Z'),
        },
      ];

      vi.mocked(prisma.breakTime.findMany).mockResolvedValue(mockBreakTimes);

      const response = await GET();
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data).toEqual([
        {
          ...mockBreakTimes[0]!,
          createdAt: mockBreakTimes[0]!.createdAt.toISOString(),
          updatedAt: mockBreakTimes[0]!.updatedAt.toISOString(),
        },
        {
          ...mockBreakTimes[1]!,
          createdAt: mockBreakTimes[1]!.createdAt.toISOString(),
          updatedAt: mockBreakTimes[1]!.updatedAt.toISOString(),
        },
      ]);
      expect(prisma.breakTime.findMany).toHaveBeenCalledWith({
        orderBy: { startTime: 'asc' },
      });
    });

    it('should handle database errors', async () => {
      const error = new Error('Database error');
      vi.mocked(prisma.breakTime.findMany).mockRejectedValue(error);

      const response = await GET();
      const data = await response.json();

      expect(response.status).toBe(500);
      expect(data).toEqual({ error: 'Failed to fetch break times' });
      expect(captureError).toHaveBeenCalledWith(error, {
        location: 'api/settings/break-times',
        type: 'fetch-break-times',
      });
    });
  });

  describe('POST /api/admin/settings/break-times', () => {
    it('should create a new break time', async () => {
      const newBreakTime = {
        name: 'Afternoon Break',
        startTime: '2024-03-20T14:00:00Z',
        endTime: '2024-03-20T14:15:00Z',
        period: '3',
      };

      const createdBreakTime = {
        id: 3,
        name: 'Afternoon Break',
        startTime: '2024-03-20T14:00:00Z',
        endTime: '2024-03-20T14:15:00Z',
        period: '3',
        createdAt: '2025-06-11T11:30:12.849Z',
        updatedAt: '2025-06-11T11:30:12.849Z',
      };

      vi.mocked(prisma.breakTime.create).mockResolvedValue({
        ...createdBreakTime,
        createdAt: new Date(createdBreakTime.createdAt),
        updatedAt: new Date(createdBreakTime.updatedAt),
      });

      const request = new Request('http://localhost/api/admin/settings/break-times', {
        method: 'POST',
        body: JSON.stringify(newBreakTime),
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data).toEqual({
        ...createdBreakTime,
        createdAt: new Date(createdBreakTime.createdAt).toISOString(),
        updatedAt: new Date(createdBreakTime.updatedAt).toISOString(),
      });
      expect(prisma.breakTime.create).toHaveBeenCalledWith({
        data: newBreakTime,
      });
    });

    it('should validate break time data', async () => {
      const invalidBreakTime = {
        name: '', // Empty name
        startTime: '2024-03-20T14:00:00Z',
        endTime: '2024-03-20T13:00:00Z', // End time before start time
        period: '0', // Invalid period
      };

      const request = new Request('http://localhost/api/admin/settings/break-times', {
        method: 'POST',
        body: JSON.stringify(invalidBreakTime),
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data).toHaveProperty('error', 'Validation failed');
      expect(data).toHaveProperty('details');
      expect(prisma.breakTime.create).not.toHaveBeenCalled();
    });

    it('should handle database errors during creation', async () => {
      const newBreakTime = {
        name: 'Afternoon Break',
        startTime: '2024-03-20T14:00:00Z',
        endTime: '2024-03-20T14:15:00Z',
        period: '3',
      };

      const error = new Error('Database error');
      vi.mocked(prisma.breakTime.create).mockRejectedValue(error);

      const request = new Request('http://localhost/api/admin/settings/break-times', {
        method: 'POST',
        body: JSON.stringify(newBreakTime),
      });

      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(500);
      expect(data).toEqual({ error: 'Failed to create break time' });
    });
  });
}); 