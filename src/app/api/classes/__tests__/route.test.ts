import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GET } from '../route';
import { captureError } from '@/lib/sentry';


// Create hoisted mock function
const mockFindMany = vi.hoisted(() => vi.fn());

// Mock PrismaClient
vi.mock('@prisma/client', () => ({
  PrismaClient: vi.fn().mockImplementation(() => ({
    class: {
      findMany: mockFindMany,
    },
  })),
}));

// Mock sentry
vi.mock('@/lib/sentry', () => ({
  captureError: vi.fn(),
}));


describe('Classes API', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('GET /api/classes', () => {
    it('should return all classes ordered by name', async () => {
      const mockClasses = [
        {
          id: 1,
          name: '1AFELC',
          description: null,
        },
        {
          id: 2,
          name: '1AHELS',
          description: null,
        },
      ];

      mockFindMany.mockResolvedValue(mockClasses);

      const response = await GET(new Request('http://localhost:3000/api/classes'));
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data).toEqual(mockClasses);
      expect(mockFindMany).toHaveBeenCalledWith({
        where: undefined,
        select: {
          id: true,
          name: true,
          description: true,
          classHeadId: true,
          classLeadId: true,
        },
        orderBy: { name: 'asc' },
      });
    });

    it('should filter to active classes used in the requested school year', async () => {
      mockFindMany.mockResolvedValue([]);

      const response = await GET(
        new Request('http://localhost:3000/api/classes?schoolYearId=7')
      );

      expect(response.status).toBe(200);
      expect(mockFindMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            isActive: true,
            OR: [
              { schedules: { some: { schoolYearId: 7 } } },
              { classMemberships: { some: { schoolYearId: 7 } } },
              { assignments: { some: { schoolYearId: 7 } } },
            ],
          },
        })
      );
    });

    it('should ignore a non-numeric schoolYearId and return every class', async () => {
      mockFindMany.mockResolvedValue([]);

      const response = await GET(
        new Request('http://localhost:3000/api/classes?schoolYearId=abc')
      );

      expect(response.status).toBe(200);
      expect(mockFindMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: undefined })
      );
    });

    it('should handle database errors', async () => {
      const error = new Error('Database error');
      mockFindMany.mockRejectedValue(error);

      const response = await GET(new Request('http://localhost:3000/api/classes'));
      const data = await response.json();

      expect(response.status).toBe(500);
      expect(data).toEqual({ error: 'Failed to fetch classes' });
      expect(captureError).toHaveBeenCalledWith(error, {
        location: 'api/classes',
        type: 'fetch-classes',
      });
    });
  });
});
