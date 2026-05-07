import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GET } from '../route';
import { prisma } from '@/lib/prisma';
import { captureError } from '@/lib/sentry';

vi.mock('@/lib/prisma', () => ({
  prisma: {
    class: {
      findUnique: vi.fn(),
    },
    schoolYear: {
      findFirst: vi.fn(),
    },
    classYearStaff: {
      findUnique: vi.fn(),
    },
  },
}));

vi.mock('@/lib/sentry', () => ({
  captureError: vi.fn(),
}));

describe('Classes Get By Name API', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('GET /api/classes/get-by-name', () => {
    it('should return class by name with year-scoped staff', async () => {
      const mockClass = {
        id: 1,
        name: 'Class A',
        description: 'Description A',
        createdAt: new Date('2024-03-20T09:30:00Z'),
        updatedAt: new Date('2024-03-20T09:30:00Z'),
      };

      vi.mocked(prisma.class.findUnique).mockResolvedValue(mockClass as never);
      vi.mocked(prisma.schoolYear.findFirst).mockResolvedValue({ id: 1 } as never);
      vi.mocked(prisma.classYearStaff.findUnique).mockResolvedValue({
        classHeadId: 1,
        classLeadId: 2,
        classHead: { firstName: 'John', lastName: 'Doe' },
        classLead: { firstName: 'Jane', lastName: 'Smith' },
      } as never);

      const request = new Request('http://localhost/api/classes/get-by-name?name=Class%20A');
      const response = await GET(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data).toEqual({
        data: {
          ...mockClass,
          createdAt: mockClass.createdAt.toISOString(),
          updatedAt: mockClass.updatedAt.toISOString(),
          classHeadId: 1,
          classLeadId: 2,
          classHead: { firstName: 'John', lastName: 'Doe' },
          classLead: { firstName: 'Jane', lastName: 'Smith' },
        },
      });
      expect(prisma.class.findUnique).toHaveBeenCalledWith({
        where: { name: 'Class A' },
      });
    });

    it('should return 400 when name is missing', async () => {
      const request = new Request('http://localhost/api/classes/get-by-name');
      const response = await GET(request);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data).toEqual({ error: { code: 'BAD_REQUEST', message: 'Class name is required' } });
      expect(prisma.class.findUnique).not.toHaveBeenCalled();
    });

    it('should return 404 when class is not found', async () => {
      vi.mocked(prisma.class.findUnique).mockResolvedValue(null);

      const request = new Request('http://localhost/api/classes/get-by-name?name=NonexistentClass');
      const response = await GET(request);
      const data = await response.json();

      expect(response.status).toBe(404);
      expect(data).toEqual({ error: { code: 'NOT_FOUND', message: 'Class not found' } });
      expect(prisma.class.findUnique).toHaveBeenCalledWith({
        where: { name: 'NonexistentClass' },
      });
    });

    it('should handle database errors', async () => {
      const error = new Error('Database error');
      vi.mocked(prisma.class.findUnique).mockRejectedValue(error);

      const request = new Request('http://localhost/api/classes/get-by-name?name=Class%20A');
      const response = await GET(request);
      const data = await response.json();

      expect(response.status).toBe(500);
      expect(data).toEqual({ error: { code: 'INTERNAL_ERROR', message: 'Failed to fetch class' } });
      expect(captureError).toHaveBeenCalledWith(error, {
        location: 'api/classes/get-by-name',
        type: 'fetch-class-by-name',
        extra: {
          searchParams: { name: 'Class A' },
        },
      });
    });
  });
});
