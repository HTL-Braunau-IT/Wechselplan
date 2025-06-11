import { describe, test, expect, vi, beforeEach, beforeAll, afterAll } from 'vitest';
import { GET } from '../route';
import { captureError } from '@/lib/sentry';
import { NextResponse } from 'next/server';
import { Prisma } from '@prisma/client';

// Mock prisma
vi.mock('@/lib/prisma', () => ({
  prisma: {
    learningContent: {
      findMany: vi.fn(),
    },
  },
}));

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



describe('Learning Contents API', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('GET /api/learning-contents', () => {
    test('should return learning contents sorted by name', async () => {
      const mockContents = [
        { id: '1', name: 'Algebra' },
        { id: '2', name: 'Biology' },
        { id: '3', name: 'Chemistry' },
      ];

      const prisma = (await import('@/lib/prisma')).prisma;
      vi.mocked(prisma.learningContent.findMany).mockResolvedValue(mockContents);

      const response = await GET();
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data).toEqual({ learningContents: mockContents });
      expect(prisma.learningContent.findMany).toHaveBeenCalledWith({
        select: {
          id: true,
          name: true,
        },
        orderBy: {
          name: 'asc',
        },
      });
    });

    test('should handle Prisma errors', async () => {
      const prismaError = new Prisma.PrismaClientKnownRequestError('Test error', {
        code: 'P2002',
        clientVersion: '5.0.0',
      });

      const prisma = (await import('@/lib/prisma')).prisma;
      vi.mocked(prisma.learningContent.findMany).mockRejectedValue(prismaError);

      const response = await GET();
      const data = await response.json();

      expect(response.status).toBe(500);
      expect(data).toEqual({ error: 'Failed to fetch learning contents' });
      
      expect(captureError).toHaveBeenCalledWith(
        prismaError,
        expect.objectContaining({
          location: 'api/learning-contents',
          type: 'fetch-contents',
        })
      );
    });

    test('should handle general errors', async () => {
      const error = new Error('Test error');
      const prisma = (await import('@/lib/prisma')).prisma;
      vi.mocked(prisma.learningContent.findMany).mockRejectedValue(error);

      const response = await GET();
      const data = await response.json();

      expect(response.status).toBe(500);
      expect(data).toEqual({ error: 'Failed to fetch learning contents' });
      
      expect(captureError).toHaveBeenCalledWith(
        error,
        expect.objectContaining({
          location: 'api/learning-contents',
          type: 'fetch-contents',
        })
      );
    });

    test('should handle unknown errors', async () => {
      const unknownError = 'Unknown error';
      const prisma = (await import('@/lib/prisma')).prisma;
      vi.mocked(prisma.learningContent.findMany).mockRejectedValue(unknownError);

      const response = await GET();
      const data = await response.json();

      expect(response.status).toBe(500);
      expect(data).toEqual({ error: 'Failed to fetch learning contents' });

      expect(captureError).toHaveBeenCalledWith(
        unknownError,
        expect.objectContaining({
          location: 'api/learning-contents',
          type: 'fetch-contents',
        })
      );
    });
  });
}); 