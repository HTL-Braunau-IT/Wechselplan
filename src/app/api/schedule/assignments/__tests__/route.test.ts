import { describe, test, expect, vi, beforeEach } from 'vitest';
import { GET, POST } from '../route';
import { prisma } from '@/lib/prisma';
import { captureError } from '@/lib/sentry';



// Mock PrismaClient
vi.mock('@/lib/prisma', () => ({
  prisma: {
    class: {
      findUnique: vi.fn(),
    },
    student: {
      findMany: vi.fn(),
      updateMany: vi.fn(),
    },
  },
}));

// Mock sentry
vi.mock('@/lib/sentry', () => ({
  captureError: vi.fn(),
}));

describe('Schedule Assignments API', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('GET /api/schedule/assignments', () => {
    test('should return 400 if class parameter is missing', async () => {
      const request = new Request('http://localhost/api/schedule/assignments');
      const response = await GET(request);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data).toEqual({ error: 'Class parameter is required' });
      expect(captureError).toHaveBeenCalledWith(
        expect.any(Error),
        expect.objectContaining({
          location: 'api/schedule/assignments',
          type: 'validation-error',
        })
      );
    });

    test('should return 404 if class is not found', async () => {
      const findUniqueMock = vi.mocked(prisma.class.findUnique);
      findUniqueMock.mockResolvedValue(null);

      const request = new Request('http://localhost/api/schedule/assignments?class=1A');
      const response = await GET(request);
      const data = await response.json();

      expect(response.status).toBe(404);
      expect(data).toEqual({ error: 'Class not found' });
      expect(captureError).toHaveBeenCalledWith(
        expect.any(Error),
        expect.objectContaining({
          location: 'api/schedule/assignments',
          type: 'not-found',
        })
      );
    });

    test('should return assignments grouped by groupId', async () => {
      // Mock class data
      const findUniqueMock = vi.mocked(prisma.class.findUnique);
      findUniqueMock.mockResolvedValue({
        id: 1,
        name: '1A',
        description: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      // Mock students data
      const findManyStudentsMock = vi.mocked(prisma.student.findMany);
      findManyStudentsMock.mockResolvedValue([
        {
          id: 1,
          firstName: 'John',
          lastName: 'Doe',
          classId: 1,
          groupId: 1,
          username: 'john.doe',
          createdAt: new Date(),
          updatedAt: new Date(),
        },
        {
          id: 2,
          firstName: 'Jane',
          lastName: 'Smith',
          classId: 1,
          groupId: 1,
          username: 'jane.smith',
          createdAt: new Date(),
          updatedAt: new Date(),
        },
        {
          id: 3,
          firstName: 'Bob',
          lastName: 'Johnson',
          classId: 1,
          groupId: 2,
          username: 'bob.johnson',
          createdAt: new Date(),
          updatedAt: new Date(),
        },
        {
          id: 4,
          firstName: 'Alice',
          lastName: 'Brown',
          classId: 1,
          groupId: null,
          username: 'alice.brown',
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ]);

      const request = new Request('http://localhost/api/schedule/assignments?class=1A');
      const response = await GET(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data).toEqual({
        assignments: [
          { groupId: 1, studentIds: [1, 2] },
          { groupId: 2, studentIds: [3] },
        ],
        unassignedStudents: [{
          id: 4,
          firstName: 'Alice',
          lastName: 'Brown',
          classId: 1,
          groupId: null,
          username: 'alice.brown',
          createdAt: expect.any(String),
          updatedAt: expect.any(String),
        }],
      });
    });

    test('should handle database errors', async () => {
      const findUniqueMock = vi.mocked(prisma.class.findUnique);
      findUniqueMock.mockRejectedValue(new Error('Database error'));

      const request = new Request('http://localhost/api/schedule/assignments?class=1A');
      const response = await GET(request);
      const data = await response.json();

      expect(response.status).toBe(500);
      expect(data).toEqual({ error: 'Failed to fetch assignments' });
      expect(captureError).toHaveBeenCalledWith(
        expect.any(Error),
        expect.objectContaining({
          location: 'api/schedule/assignments',
          type: 'fetch-assignments',
        })
      );
    });
  });

  describe('POST /api/schedule/assignments', () => {
    test('should return 400 if class parameter is missing', async () => {
      const request = new Request('http://localhost/api/schedule/assignments', {
        method: 'POST',
        body: JSON.stringify({ assignments: [] }),
      });
      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data).toEqual({ error: 'Class parameter is required' });
      expect(captureError).toHaveBeenCalledWith(
        expect.any(Error),
        expect.objectContaining({
          location: 'api/schedule/assignments',
          type: 'validation-error',
        })
      );
    });

    test('should return 404 if class is not found', async () => {
      const findUniqueMock = vi.mocked(prisma.class.findUnique);
      findUniqueMock.mockResolvedValue(null);

      const request = new Request('http://localhost/api/schedule/assignments', {
        method: 'POST',
        body: JSON.stringify({
          class: '1A',
          assignments: [],
        }),
      });
      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(404);
      expect(data).toEqual({ error: 'Class not found' });
      expect(captureError).toHaveBeenCalledWith(
        expect.any(Error),
        expect.objectContaining({
          location: 'api/schedule/assignments',
          type: 'not-found',
        })
      );
    });

    test('should update student group assignments', async () => {
      // Mock class data
      const findUniqueMock = vi.mocked(prisma.class.findUnique);
      findUniqueMock.mockResolvedValue({
        id: 1,
        name: '1A',
        description: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      // Mock updateMany
      const updateManyMock = vi.mocked(prisma.student.updateMany);
      updateManyMock.mockResolvedValue({ count: 1 });

      const request = new Request('http://localhost/api/schedule/assignments', {
        method: 'POST',
        body: JSON.stringify({
          class: '1A',
          assignments: [
            { groupId: 1, studentIds: [1, 2] },
            { groupId: 2, studentIds: [3] },
            { groupId: 0, studentIds: [4] }, // Unassigned group
          ],
          removedStudentIds: [5],
        }),
      });
      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data).toEqual({ success: true });
      expect(updateManyMock).toHaveBeenCalledTimes(4);
      expect(updateManyMock).toHaveBeenCalledWith({
        where: { id: { in: [1, 2] } },
        data: { groupId: 1 },
      });
      expect(updateManyMock).toHaveBeenCalledWith({
        where: { id: { in: [3] } },
        data: { groupId: 2 },
      });
      expect(updateManyMock).toHaveBeenCalledWith({
        where: { id: { in: [4] } },
        data: { groupId: null },
      });
      expect(updateManyMock).toHaveBeenCalledWith({
        where: { id: { in: [5] } },
        data: { groupId: null },
      });
    });

    test('should handle database errors', async () => {
      const findUniqueMock = vi.mocked(prisma.class.findUnique);
      findUniqueMock.mockRejectedValue(new Error('Database error'));

      const request = new Request('http://localhost/api/schedule/assignments', {
        method: 'POST',
        body: JSON.stringify({
          class: '1A',
          assignments: [],
        }),
      });
      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(500);
      expect(data).toEqual({ error: 'Failed to create assignments' });
      expect(captureError).toHaveBeenCalledWith(
        expect.any(Error),
        expect.objectContaining({
          location: 'api/schedule/assignments',
          type: 'create-assignments',
        })
      );
    });

    test('should return 400 if request body is invalid JSON', async () => {
      const request = new Request('http://localhost/api/schedule/assignments', {
        method: 'POST',
        body: 'invalid json',
      });
      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data).toEqual({ error: 'Invalid request body' });
      expect(captureError).toHaveBeenCalledWith(
        expect.any(Error),
        expect.objectContaining({
          location: 'api/schedule/assignments',
          type: 'validation-error',
        })
      );
    });

    test('should return 400 if assignments is not an array', async () => {
      const request = new Request('http://localhost/api/schedule/assignments', {
        method: 'POST',
        body: JSON.stringify({
          class: '1A',
          assignments: 'not an array',
        }),
      });
      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data).toEqual({ error: 'Assignments must be an array' });
      expect(captureError).toHaveBeenCalledWith(
        expect.any(Error),
        expect.objectContaining({
          location: 'api/schedule/assignments',
          type: 'validation-error',
        })
      );
    });

    test('should return 400 if assignment is missing studentIds', async () => {
      const request = new Request('http://localhost/api/schedule/assignments', {
        method: 'POST',
        body: JSON.stringify({
          class: '1A',
          assignments: [
            { groupId: 1 }, // Missing studentIds
          ],
        }),
      });
      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data).toEqual({ error: 'Each assignment must have studentIds' });
      expect(captureError).toHaveBeenCalledWith(
        expect.any(Error),
        expect.objectContaining({
          location: 'api/schedule/assignments',
          type: 'validation-error',
        })
      );
    });

    test('should return 400 if groupId is not a number', async () => {
      const request = new Request('http://localhost/api/schedule/assignments', {
        method: 'POST',
        body: JSON.stringify({
          class: '1A',
          assignments: [
            { groupId: '1', studentIds: [1, 2] }, // groupId is a string
          ],
        }),
      });
      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data).toEqual({ error: 'groupId must be a number' });
      expect(captureError).toHaveBeenCalledWith(
        expect.any(Error),
        expect.objectContaining({
          location: 'api/schedule/assignments',
          type: 'validation-error',
        })
      );
    });

    test('should handle empty assignments array', async () => {
      const findUniqueMock = vi.mocked(prisma.class.findUnique);
      findUniqueMock.mockResolvedValue({
        id: 1,
        name: '1A',
        description: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const request = new Request('http://localhost/api/schedule/assignments', {
        method: 'POST',
        body: JSON.stringify({
          class: '1A',
          assignments: [],
        }),
      });
      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data).toEqual({ success: true });
    });
  });
}); 