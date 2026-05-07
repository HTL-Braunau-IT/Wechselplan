import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GET } from '../route';
import { captureError } from '@/lib/sentry';

const mockFindManyClasses = vi.hoisted(() => vi.fn());
const mockFindFirstSchoolYear = vi.hoisted(() => vi.fn());
const mockFindManyClassYearStaff = vi.hoisted(() => vi.fn());

vi.mock('@/lib/prisma', () => ({
  prisma: {
    class: {
      findMany: mockFindManyClasses,
    },
    schoolYear: {
      findFirst: mockFindFirstSchoolYear,
    },
    classYearStaff: {
      findMany: mockFindManyClassYearStaff,
    },
  },
}));

vi.mock('@/lib/sentry', () => ({
  captureError: vi.fn(),
}));

describe('Classes API', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockFindFirstSchoolYear.mockResolvedValue({ id: 1 });
    mockFindManyClassYearStaff.mockResolvedValue([]);
  });

  describe('GET /api/classes', () => {
    it('should return all classes ordered by name with year-scoped staff', async () => {
      const mockClasses = [
        { id: 1, name: '1AFELC', description: null },
        { id: 2, name: '1AHELS', description: null },
      ];

      mockFindManyClasses.mockResolvedValue(mockClasses);
      mockFindManyClassYearStaff.mockResolvedValue([
        { classId: 1, classHeadId: 10, classLeadId: 11 },
      ]);

      const response = await GET(new Request('http://localhost/api/classes'));
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data).toEqual({
        data: [
          { id: 1, name: '1AFELC', description: null, classHeadId: 10, classLeadId: 11 },
          { id: 2, name: '1AHELS', description: null, classHeadId: null, classLeadId: null },
        ],
      });
      expect(mockFindManyClasses).toHaveBeenCalledWith({
        where: undefined,
        select: {
          id: true,
          name: true,
          description: true,
        },
        orderBy: { name: 'asc' },
      });
    });

    it('should handle database errors', async () => {
      const error = new Error('Database error');
      mockFindManyClasses.mockRejectedValue(error);

      const response = await GET(new Request('http://localhost/api/classes'));
      const data = await response.json();

      expect(response.status).toBe(500);
      expect(data).toEqual({
        error: {
          code: 'INTERNAL_ERROR',
          message: 'Failed to fetch classes',
        },
      });
      expect(captureError).toHaveBeenCalledWith(error, {
        location: 'api/classes',
        type: 'fetch-classes',
      });
    });
  });
});
