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
    teacherAssignment: {
      findMany: vi.fn(),
      deleteMany: vi.fn(),
      create: vi.fn(),
    },
    subject: {
      findUnique: vi.fn(),
    },
    learningContent: {
      findUnique: vi.fn(),
    },
    room: {
      findUnique: vi.fn(),
    },
  },
}));

// Mock sentry
vi.mock('@/lib/sentry', () => ({
  captureError: vi.fn(),
}));

describe('Teacher Assignments API', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('GET /api/schedule/teacher-assignments', () => {
    test('should return 400 if class parameter is missing', async () => {
      const request = new Request('http://localhost/api/schedule/teacher-assignments');
      const response = await GET(request);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data).toEqual({ error: 'Class parameter is required' });
    });

    test('should return 404 if class is not found', async () => {
      const findUniqueMock = vi.mocked(prisma.class.findUnique);
      findUniqueMock.mockResolvedValue(null);

      const request = new Request('http://localhost/api/schedule/teacher-assignments?class=1A');
      const response = await GET(request);
      const data = await response.json();

      expect(response.status).toBe(404);
      expect(data).toEqual({ error: 'Class not found' });
      expect(captureError).toHaveBeenCalledWith(
        expect.any(Error),
        expect.objectContaining({
          location: 'api/schedule/teacher-assignments',
          type: 'fetch-assignments',
        })
      );
    });

    test('should return assignments grouped by period', async () => {
      // Mock class data
      const findUniqueMock = vi.mocked(prisma.class.findUnique);
      findUniqueMock.mockResolvedValue({
        id: 1,
        name: '1A',
        description: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      // Mock assignments data
      const findManyAssignmentsMock = vi.mocked(prisma.teacherAssignment.findMany);
      findManyAssignmentsMock.mockResolvedValue([
        {
          id: 1,
          classId: 1,
          period: 'AM',
          groupId: 1,
          teacherId: 1,
          subjectId: 1,
          learningContentId: 1,
          roomId: 1,
          createdAt: new Date(),
          updatedAt: new Date(),
          teacher: {
            id: 1,
            firstName: 'John',
            lastName: 'Doe',
            createdAt: new Date(),
            updatedAt: new Date(),
          },
          subject: {
            id: 1,
            name: 'Math',
            createdAt: new Date(),
            updatedAt: new Date(),
          },
          learningContent: {
            id: 1,
            name: 'Algebra',
            createdAt: new Date(),
            updatedAt: new Date(),
          },
          room: {
            id: 1,
            name: 'Room 101',
            createdAt: new Date(),
            updatedAt: new Date(),
          },
        },
        {
          id: 2,
          classId: 1,
          period: 'PM',
          groupId: 2,
          teacherId: 2,
          subjectId: 2,
          learningContentId: 2,
          roomId: 2,
          createdAt: new Date(),
          updatedAt: new Date(),
          teacher: {
            id: 2,
            firstName: 'Jane',
            lastName: 'Smith',
            createdAt: new Date(),
            updatedAt: new Date(),
          },
          subject: {
            id: 2,
            name: 'Science',
            createdAt: new Date(),
            updatedAt: new Date(),
          },
          learningContent: {
            id: 2,
            name: 'Physics',
            createdAt: new Date(),
            updatedAt: new Date(),
          },
          room: {
            id: 2,
            name: 'Room 102',
            createdAt: new Date(),
            updatedAt: new Date(),
          },
        },
      ]);

      const request = new Request('http://localhost/api/schedule/teacher-assignments?class=1A');
      const response = await GET(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data).toEqual({
        amAssignments: [
          {
            groupId: 1,
            teacherId: 1,
            teacherFirstName: 'John',
            teacherLastName: 'Doe',
            subject: 'Math',
            learningContent: 'Algebra',
            room: 'Room 101',
          },
        ],
        pmAssignments: [
          {
            groupId: 2,
            teacherId: 2,
            teacherFirstName: 'Jane',
            teacherLastName: 'Smith',
            subject: 'Science',
            learningContent: 'Physics',
            room: 'Room 102',
          },
        ],
      });
    });

    test('should handle database errors', async () => {
      const findUniqueMock = vi.mocked(prisma.class.findUnique);
      findUniqueMock.mockRejectedValue(new Error('Database error'));

      const request = new Request('http://localhost/api/schedule/teacher-assignments?class=1A');
      const response = await GET(request);
      const data = await response.json();

      expect(response.status).toBe(500);
      expect(data).toEqual({ error: 'Failed to fetch teacher assignments' });
      expect(captureError).toHaveBeenCalledWith(
        expect.any(Error),
        expect.objectContaining({
          location: 'api/schedule/teacher-assignments',
          type: 'fetch-assignments',
        })
      );
    });
  });

  describe('POST /api/schedule/teacher-assignments', () => {
    test('should return 400 if class parameter is missing', async () => {
      const request = new Request('http://localhost/api/schedule/teacher-assignments', {
        method: 'POST',
        body: JSON.stringify({
          amAssignments: [],
          pmAssignments: [],
        }),
      });
      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data).toEqual({ error: 'Class parameter is required' });
    });

    test('should return 404 if class is not found', async () => {
      const findUniqueMock = vi.mocked(prisma.class.findUnique);
      findUniqueMock.mockResolvedValue(null);

      const request = new Request('http://localhost/api/schedule/teacher-assignments', {
        method: 'POST',
        body: JSON.stringify({
          class: '1A',
          amAssignments: [],
          pmAssignments: [],
        }),
      });
      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(404);
      expect(data).toEqual({ error: 'Class not found' });
    });

    test('should return 409 if assignments exist and updateExisting is false', async () => {
      // Mock class data
      const findUniqueMock = vi.mocked(prisma.class.findUnique);
      findUniqueMock.mockResolvedValue({
        id: 1,
        name: '1A',
        description: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      // Mock existing assignments
      const findManyAssignmentsMock = vi.mocked(prisma.teacherAssignment.findMany);
      findManyAssignmentsMock.mockResolvedValue([
        {
          id: 1,
          classId: 1,
          period: 'AM',
          groupId: 1,
          teacherId: 1,
          subjectId: 1,
          learningContentId: 1,
          roomId: 1,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ]);

      const request = new Request('http://localhost/api/schedule/teacher-assignments', {
        method: 'POST',
        body: JSON.stringify({
          class: '1A',
          amAssignments: [],
          pmAssignments: [],
        }),
      });
      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(409);
      expect(data).toEqual({ error: 'EXISTING_ASSIGNMENTS' });
    });

    test('should create new assignments successfully', async () => {
      // Mock class data
      const findUniqueMock = vi.mocked(prisma.class.findUnique);
      findUniqueMock.mockResolvedValue({
        id: 1,
        name: '1A',
        description: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      // Mock no existing assignments
      const findManyAssignmentsMock = vi.mocked(prisma.teacherAssignment.findMany);
      findManyAssignmentsMock.mockResolvedValue([]);

      // Mock subject, learning content, and room lookups
      const findUniqueSubjectMock = vi.mocked(prisma.subject.findUnique);
      findUniqueSubjectMock.mockResolvedValue({
        id: 1,
        name: 'Math',
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const findUniqueLearningContentMock = vi.mocked(prisma.learningContent.findUnique);
      findUniqueLearningContentMock.mockResolvedValue({
        id: 1,
        name: 'Algebra',
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const findUniqueRoomMock = vi.mocked(prisma.room.findUnique);
      findUniqueRoomMock.mockResolvedValue({
        id: 1,
        name: 'Room 101',
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      // Mock create
      const createMock = vi.mocked(prisma.teacherAssignment.create);
      createMock.mockResolvedValue({
        id: 1,
        classId: 1,
        period: 'AM',
        groupId: 1,
        teacherId: 1,
        subjectId: 1,
        learningContentId: 1,
        roomId: 1,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const request = new Request('http://localhost/api/schedule/teacher-assignments', {
        method: 'POST',
        body: JSON.stringify({
          class: '1A',
          amAssignments: [
            {
              groupId: 1,
              teacherId: 1,
              subject: 'Math',
              learningContent: 'Algebra',
              room: 'Room 101',
            },
          ],
          pmAssignments: [],
        }),
      });
      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data).toEqual({ message: 'Teacher assignments saved successfully' });
      expect(createMock).toHaveBeenCalledWith({
        data: {
          classId: 1,
          period: 'AM',
          groupId: 1,
          teacherId: 1,
          subjectId: 1,
          learningContentId: 1,
          roomId: 1,
        },
      });
    });

    test('should handle database errors', async () => {
      const findUniqueMock = vi.mocked(prisma.class.findUnique);
      findUniqueMock.mockRejectedValue(new Error('Database error'));

      const request = new Request('http://localhost/api/schedule/teacher-assignments', {
        method: 'POST',
        body: JSON.stringify({
          class: '1A',
          amAssignments: [],
          pmAssignments: [],
        }),
      });
      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(500);
      expect(data).toEqual({ error: 'Failed to update teacher assignments' });
      expect(captureError).toHaveBeenCalledWith(
        expect.any(Error),
        expect.objectContaining({
          location: 'api/schedule/teacher-assignments',
          type: 'update-assignments',
        })
      );
    });
  });
}); 