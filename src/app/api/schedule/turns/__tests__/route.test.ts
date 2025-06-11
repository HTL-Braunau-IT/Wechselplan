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



describe('Schedule Turns API', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('GET /api/schedule/turns', () => {
    test('should return default turns data', async () => {
      const response = await GET();
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data).toEqual({
        'turn1': {
          weeks: [
            { date: '2024-02-19' },
            { date: '2024-02-26' },
            { date: '2024-03-04' },
            { date: '2024-03-11' }
          ]
        },
        'turn2': {
          weeks: [
            { date: '2024-02-20' },
            { date: '2024-02-27' },
            { date: '2024-03-05' },
            { date: '2024-03-12' }
          ]
        },
        'turn3': {
          weeks: [
            { date: '2024-02-21' },
            { date: '2024-02-28' },
            { date: '2024-03-06' },
            { date: '2024-03-13' }
          ]
        },
        'turn4': {
          weeks: [
            { date: '2024-02-22' },
            { date: '2024-02-29' },
            { date: '2024-03-07' },
            { date: '2024-03-14' }
          ]
        }
      });
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
      expect(data).toEqual({ error: 'Failed to fetch turns' });

      expect(captureError).toHaveBeenCalledWith(
        error,
        expect.objectContaining({
          location: 'api/schedule/turns',
          type: 'fetch-turns'
        })
      );
    });
  });
}); 