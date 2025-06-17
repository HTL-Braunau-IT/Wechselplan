import { describe, test, expect, vi, beforeEach, beforeAll, afterAll } from 'vitest';
import { POST } from '../route';
import { db } from '@/lib/db';
import { captureError } from '@/lib/sentry';

// Mock database
vi.mock('@/lib/db', () => ({
  db: {
    teacherRotation: {
      deleteMany: vi.fn(),
      create: vi.fn(),
    },
    class: {
      findUnique: vi.fn().mockResolvedValue({
        id: 1,
        name: '1',
      }),
    },
  },
}));

// Mock sentry
vi.mock('@/lib/sentry', () => ({
  captureError: vi.fn(),
}));



describe('Teacher Rotation API', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('POST /api/schedule/teacher-rotation', () => {
    test('should return 400 if required fields are missing', async () => {
      const request = new Request('http://localhost/api/schedule/teacher-rotation', {
        method: 'POST',
        body: JSON.stringify({
          className: '1',
          // Missing turns, amRotation, pmRotation
        }),
      });
      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data).toEqual({ error: 'Missing required fields' });
    });

    test('should delete existing rotations and create new ones', async () => {
      // Mock deleteMany
      const deleteManyMock = vi.mocked(db.teacherRotation.deleteMany);
      deleteManyMock.mockResolvedValue({ count: 2 });

      // Mock create
      const createMock = vi.mocked(db.teacherRotation.create);
      createMock.mockResolvedValue({
        id: 1,
        classId: 1,
        groupId: 1,
        teacherId: 1,
        turnId: 'turn1',
        period: 'AM',
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const request = new Request('http://localhost/api/schedule/teacher-rotation', {
        method: 'POST',
        body: JSON.stringify({
          className: '1',
          turns: ['turn1', 'turn2'],
          amRotation: [
            {
              groupId: 1,
              turns: [1, null], // Teacher 1 in turn1, no teacher in turn2
            },
          ],
          pmRotation: [
            {
              groupId: 1,
              turns: [null, 2], // No teacher in turn1, Teacher 2 in turn2
            },
          ],
        }),
      });
      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data).toEqual({ success: true });

      // Verify deleteMany was called
      expect(deleteManyMock).toHaveBeenCalledWith({
        where: {
          classId: 1,
        },
      });

      // Verify create was called for AM rotation
      expect(createMock).toHaveBeenCalledWith({
        data: {
          classId: 1,
          groupId: 1,
          teacherId: 1,
          turnId: 'turn1',
          period: 'AM',
        },
      });

      // Verify create was called for PM rotation
      expect(createMock).toHaveBeenCalledWith({
        data: {
          classId: 1,
          groupId: 1,
          teacherId: 2,
          turnId: 'turn2',
          period: 'PM',
        },
      });
    });

    test('should handle database errors', async () => {
      const dbError = new Error('Database error');
      const deleteManyMock = vi.mocked(db.teacherRotation.deleteMany);
      deleteManyMock.mockRejectedValue(dbError);

      const request = new Request('http://localhost/api/schedule/teacher-rotation', {
        method: 'POST',
        body: JSON.stringify({
          className: '1',
          turns: ['turn1'],
          amRotation: [
            {
              groupId: 1,
              turns: [1],
            },
          ],
          pmRotation: [
            {
              groupId: 1,
              turns: [1],
            },
          ],
        }),
      });
      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(500);
      expect(data).toEqual({ error: 'Failed to update teacher rotation' });

      expect(captureError).toHaveBeenCalledWith(
        dbError,
        expect.objectContaining({
          location: 'api/schedule/teacher-rotation',
          type: 'update-rotation',
        })
      );
    });

    test('should handle multiple groups and turns', async () => {
      // Mock deleteMany
      const deleteManyMock = vi.mocked(db.teacherRotation.deleteMany);
      deleteManyMock.mockResolvedValue({ count: 4 });

      // Mock create
      const createMock = vi.mocked(db.teacherRotation.create);
      createMock.mockResolvedValue({
        id: 1,
        classId: 1,
        groupId: 1,
        teacherId: 1,
        turnId: 'turn1',
        period: 'AM',
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const request = new Request('http://localhost/api/schedule/teacher-rotation', {
        method: 'POST',
        body: JSON.stringify({
          className: '1',
          turns: ['turn1', 'turn2', 'turn3'],
          amRotation: [
            {
              groupId: 1,
              turns: [1, 2, null], // Teacher 1 in turn1, Teacher 2 in turn2, no teacher in turn3
            },
            {
              groupId: 2,
              turns: [null, 3, 4], // No teacher in turn1, Teacher 3 in turn2, Teacher 4 in turn3
            },
          ],
          pmRotation: [
            {
              groupId: 1,
              turns: [5, null, 6], // Teacher 5 in turn1, no teacher in turn2, Teacher 6 in turn3
            },
            {
              groupId: 2,
              turns: [null, 7, 8], // No teacher in turn1, Teacher 7 in turn2, Teacher 8 in turn3
            },
          ],
        }),
      });
      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data).toEqual({ success: true });

      // Verify deleteMany was called
      expect(deleteManyMock).toHaveBeenCalledWith({
        where: {
          classId: 1,
        },
      });

      // Verify create was called for each non-null turn
      expect(createMock).toHaveBeenCalledTimes(8);
      expect(createMock).toHaveBeenCalledWith({
        data: {
          classId: 1,
          groupId: 1,
          teacherId: 1,
          turnId: 'turn1',
          period: 'AM',
        },
      });
      expect(createMock).toHaveBeenCalledWith({
        data: {
          classId: 1,
          groupId: 1,
          teacherId: 2,
          turnId: 'turn2',
          period: 'AM',
        },
      });
      // ... and so on for all other combinations
    });
  });
}); 