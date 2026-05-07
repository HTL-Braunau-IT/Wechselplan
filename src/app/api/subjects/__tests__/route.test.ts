import { describe, test, expect, vi, beforeEach } from 'vitest';
import { GET } from '../route';
import { prisma } from '@/lib/prisma';
import { captureError } from '@/lib/sentry';

vi.mock('@/lib/prisma', () => ({
  prisma: {
    lookupValue: {
      findMany: vi.fn(),
    },
  },
}));

vi.mock('@/lib/sentry', () => ({
  captureError: vi.fn(),
}));

describe('Subjects API', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('GET', () => {
    test('should return subjects ordered by name', async () => {
      const mockSubjects = [
        { id: 1, name: 'Biology' },
        { id: 2, name: 'Chemistry' },
        { id: 3, name: 'Physics' },
      ];

      vi.mocked(prisma.lookupValue.findMany).mockResolvedValue(mockSubjects as never);

      const response = await GET();
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.data).toHaveLength(3);
      expect(data.data.map((s: { id: number; name: string }) => ({ id: s.id, name: s.name }))).toEqual([
        { id: 1, name: 'Biology' },
        { id: 2, name: 'Chemistry' },
        { id: 3, name: 'Physics' },
      ]);

      expect(prisma.lookupValue.findMany).toHaveBeenCalledWith({
        where: { kind: 'SUBJECT' },
        select: {
          id: true,
          name: true,
        },
        orderBy: {
          name: 'asc',
        },
      });

      expect(captureError).not.toHaveBeenCalled();
    });

    test('should handle database errors', async () => {
      const error = new Error('Database connection failed');
      vi.mocked(prisma.lookupValue.findMany).mockRejectedValue(error);

      const response = await GET();
      const data = await response.json();

      expect(response.status).toBe(500);
      expect(data).toEqual({
        error: {
          code: 'INTERNAL_ERROR',
          message: 'Failed to fetch subjects',
        },
      });

      expect(captureError).toHaveBeenCalledWith(error, {
        location: 'api/subjects',
        type: 'fetch-subjects',
      });
    });

    test('should return empty array when no subjects exist', async () => {
      vi.mocked(prisma.lookupValue.findMany).mockResolvedValue([] as never);

      const response = await GET();
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data).toEqual({ data: [] });

      expect(captureError).not.toHaveBeenCalled();
    });
  });
});
