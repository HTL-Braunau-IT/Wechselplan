import { describe, test, expect, vi, beforeEach, beforeAll, afterAll } from 'vitest';
import { GET } from '../route';
import { captureError } from '@/lib/sentry';
import { NextResponse } from 'next/server';

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


describe('Schedule Times API', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('GET /api/schedule/times', () => {
    test('should return default schedule times', async () => {
      const response = await GET();
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data).toEqual([
        {
          id: '1',
          startTime: '08:00',
          endTime: '08:50',
          hours: 1,
          period: 'AM'
        },
        {
          id: '2',
          startTime: '08:50',
          endTime: '09:40',
          hours: 2,
          period: 'AM'
        },
        {
          id: '3',
          startTime: '09:55',
          endTime: '10:45',
          hours: 3,
          period: 'AM'
        },
        {
          id: '4',
          startTime: '10:45',
          endTime: '11:35',
          hours: 4,
          period: 'AM'
        },
        {
          id: '5',
          startTime: '11:50',
          endTime: '12:40',
          hours: 5,
          period: 'AM'
        },
        {
          id: '6',
          startTime: '12:40',
          endTime: '13:30',
          hours: 6,
          period: 'AM'
        },
        {
          id: '7',
          startTime: '13:30',
          endTime: '14:20',
          hours: 7,
          period: 'PM'
        },
        {
          id: '8',
          startTime: '14:20',
          endTime: '15:10',
          hours: 8,
          period: 'PM'
        },
        {
          id: '9',
          startTime: '15:25',
          endTime: '16:15',
          hours: 9,
          period: 'PM'
        },
        {
          id: '10',
          startTime: '16:15',
          endTime: '17:05',
          hours: 10,
          period: 'PM'
        }
      ]);
    });

    test('should handle errors', async () => {
      // Mock an error by throwing from NextResponse.json
      const error = new Error('Test error');
      vi.mocked(NextResponse.json).mockImplementationOnce(() => {
        throw error;
      });

      const response = await GET();
      const data = await response.json();

      expect(response.status).toBe(500);
      expect(data).toEqual({ error: 'Failed to fetch schedule times' });

      expect(captureError).toHaveBeenCalledWith(
        error,
        expect.objectContaining({
          location: 'api/schedule/times',
          type: 'fetch-schedule-times'
        })
      );
    });
  });
}); 