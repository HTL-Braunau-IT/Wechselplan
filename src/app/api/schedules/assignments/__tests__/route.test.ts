import { describe, test, expect, vi, beforeEach } from 'vitest';
import { GET } from '../route';
import { prisma } from '@/lib/prisma';
import type { TeacherAssignment } from '@prisma/client';



// Mock PrismaClient
vi.mock('@/lib/prisma', () => ({
  prisma: {
    teacherAssignment: {
      findMany: vi.fn(),
    },
  },
}));

describe('Schedule Assignments API', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('GET /api/schedules/assignments', () => {
    test('should return 400 if class parameter is missing', async () => {
      const request = new Request('http://localhost/api/schedules/assignments');
      const response = await GET(request);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data).toEqual({ error: 'Class ID is required' });
    });

    test('should return 400 if class ID is not a number', async () => {
      const request = new Request('http://localhost/api/schedules/assignments?class=abc');
      const response = await GET(request);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data).toEqual({ error: 'Class ID must be a number' });
    });

    test('should return assignments for a class', async () => {
      const mockAssignments = [
        { id: 1, period: '1' },
        { id: 2, period: '2' },
        { id: 3, period: '3' },
      ] as const;

      const findManyMock = vi.mocked(prisma.teacherAssignment.findMany);
      findManyMock.mockResolvedValue(mockAssignments as TeacherAssignment[]);

      const request = new Request('http://localhost/api/schedules/assignments?class=1');
      const response = await GET(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data).toEqual(mockAssignments);
      expect(findManyMock).toHaveBeenCalledWith({
        where: {
          classId: 1
        },
        select: {
          id: true,
          period: true
        }
      });
    });

    test('should handle database errors', async () => {
      const findManyMock = vi.mocked(prisma.teacherAssignment.findMany);
      findManyMock.mockRejectedValue(new Error('Database error'));

      const request = new Request('http://localhost/api/schedules/assignments?class=1');
      const response = await GET(request);
      const data = await response.json();

      expect(response.status).toBe(500);
      expect(data).toEqual({ error: 'Failed to fetch assignments' });
    });
  });
}); 