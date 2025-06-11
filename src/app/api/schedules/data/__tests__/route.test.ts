import { describe, test, expect, vi, beforeEach } from 'vitest';
import { GET } from '../route';
import { prisma } from '@/lib/prisma';
import { captureError } from '@/lib/sentry';



vi.mock('@/lib/prisma', () => ({
  prisma: {
    teacher: { findUnique: vi.fn() },
    teacherAssignment: { findMany: vi.fn() },
    teacherRotation: { findMany: vi.fn() },
    class: { findUnique: vi.fn() },
    schedule: { findFirst: vi.fn() },
    student: { findMany: vi.fn() },
  },
}));
vi.mock('@/lib/sentry', () => ({ captureError: vi.fn() }));

describe('Schedule Data API', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  test('should return 400 if teacher username is missing', async () => {
    const req = new Request('http://localhost/api/schedules/data');
    const res = await GET(req);
    const data = await res.json();
    expect(res.status).toBe(400);
    expect(data).toEqual({ error: 'Teacher username is required' });
  });

  test('should return 404 if teacher not found', async () => {
    vi.mocked(prisma.teacher.findUnique).mockResolvedValue(null);
    const req = new Request('http://localhost/api/schedules/data?teacher=foo');
    const res = await GET(req);
    const data = await res.json();
    expect(res.status).toBe(404);
    expect(data).toEqual({ error: 'Teacher not found' });
  });

  test('should return 404 if no assignments for teacher', async () => {
    vi.mocked(prisma.teacher.findUnique).mockResolvedValue({
      id: 1,
      firstName: 'T',
      lastName: 'E',
      createdAt: new Date(),
      updatedAt: new Date(),
      username: 'foo',
      email: null,
    });
    vi.mocked(prisma.teacherAssignment.findMany).mockResolvedValue([]);
    const req = new Request('http://localhost/api/schedules/data?teacher=foo');
    const res = await GET(req);
    const data = await res.json();
    expect(res.status).toBe(404);
    expect(data).toEqual({ error: 'No classes assigned to teacher' });
  });

  test('should return 404 if no teacher rotation found', async () => {
    vi.mocked(prisma.teacher.findUnique).mockResolvedValue({
      id: 1,
      firstName: 'T',
      lastName: 'E',
      createdAt: new Date(),
      updatedAt: new Date(),
      username: 'foo',
      email: null,
    });
    vi.mocked(prisma.teacherAssignment.findMany).mockResolvedValue([
      {
        id: 1,
        classId: 1,
        groupId: 1,
        createdAt: new Date(),
        updatedAt: new Date(),
        period: '1',
        teacherId: 1,
        subjectId: 1,
        learningContentId: 1,
        roomId: 1,
      },
    ]);
    vi.mocked(prisma.teacherRotation.findMany).mockResolvedValue([]);
    const req = new Request('http://localhost/api/schedules/data?teacher=foo');
    const res = await GET(req);
    const data = await res.json();
    expect(res.status).toBe(404);
    expect(data).toEqual({ error: 'No teacher rotation found' });
  });

  test('should return 404 if no students found', async () => {
    vi.mocked(prisma.teacher.findUnique).mockResolvedValue({
      id: 1,
      firstName: 'T',
      lastName: 'E',
      createdAt: new Date(),
      updatedAt: new Date(),
      username: 'foo',
      email: null,
    });
    vi.mocked(prisma.teacherAssignment.findMany).mockResolvedValue([
      {
        id: 1,
        classId: 1,
        groupId: 1,
        createdAt: new Date(),
        updatedAt: new Date(),
        period: '1',
        teacherId: 1,
        subjectId: 1,
        learningContentId: 1,
        roomId: 1,
      },
    ]);
    vi.mocked(prisma.teacherRotation.findMany).mockResolvedValue([
      {
        id: 1,
        classId: 1,
        groupId: 1,
        createdAt: new Date(),
        updatedAt: new Date(),
        period: '1',
        teacherId: 1,
        turnId: 'turn1',
      },
    ]);
    vi.mocked(prisma.class.findUnique).mockResolvedValue({
      id: 1,
      name: '1A',
      createdAt: new Date(),
      updatedAt: new Date(),
      description: null,
    });
    vi.mocked(prisma.schedule.findFirst).mockResolvedValue({
      id: 1,
      name: 'Schedule',
      classId: 1,
      createdAt: new Date(),
      updatedAt: new Date(),
      description: null,
      startDate: new Date(),
      endDate: new Date(),
      selectedWeekday: 0,
      scheduleData: {},
      additionalInfo: null,
    });
    vi.mocked(prisma.student.findMany).mockResolvedValue([]);
    const req = new Request('http://localhost/api/schedules/data?teacher=foo');
    const res = await GET(req);
    const data = await res.json();
    expect(res.status).toBe(404);
    expect(data).toEqual({ error: 'No students found' });
  });

  test('should return 200 and correct structure if all data is present', async () => {
    vi.mocked(prisma.teacher.findUnique).mockResolvedValue({
      id: 1,
      firstName: 'T',
      lastName: 'E',
      createdAt: new Date(),
      updatedAt: new Date(),
      username: 'foo',
      email: null,
    });
    vi.mocked(prisma.teacherAssignment.findMany).mockResolvedValue([
      {
        id: 1,
        classId: 1,
        groupId: 1,
        createdAt: new Date(),
        updatedAt: new Date(),
        period: '1',
        teacherId: 1,
        subjectId: 1,
        learningContentId: 1,
        roomId: 1,
      },
    ]);
    vi.mocked(prisma.teacherRotation.findMany).mockResolvedValue([
      {
        id: 1,
        classId: 1,
        groupId: 1,
        createdAt: new Date(),
        updatedAt: new Date(),
        period: '1',
        teacherId: 1,
        turnId: 'turn1',
      },
    ]);
    vi.mocked(prisma.class.findUnique).mockResolvedValue({
      id: 1,
      name: '1A',
      createdAt: new Date(),
      updatedAt: new Date(),
      description: null,
    });
    vi.mocked(prisma.schedule.findFirst).mockResolvedValue({
      id: 1,
      name: 'Schedule',
      classId: 1,
      createdAt: new Date(),
      updatedAt: new Date(),
      description: null,
      startDate: new Date(),
      endDate: new Date(),
      selectedWeekday: 0,
      scheduleData: {},
      additionalInfo: null,
    });
    vi.mocked(prisma.student.findMany).mockResolvedValue([
      {
        id: 1,
        firstName: 'S',
        lastName: 'T',
        createdAt: new Date(),
        updatedAt: new Date(),
        username: 'student',
        classId: 1,
        groupId: 1,
      },
    ]);
    const req = new Request('http://localhost/api/schedules/data?teacher=foo');
    const res = await GET(req);
    const data = await res.json();
    expect(res.status).toBe(200);
    expect(data).toHaveProperty('schedules');
    expect(data).toHaveProperty('students');
    expect(data).toHaveProperty('teacherRotation');
    expect(data).toHaveProperty('assignments');
    expect(data).toHaveProperty('classdata');
  });

  test('should return 500 and call captureError on unexpected error', async () => {
    vi.mocked(prisma.teacher.findUnique).mockRejectedValue(new Error('DB error'));
    const req = new Request('http://localhost/api/schedules/data?teacher=foo');
    const res = await GET(req);
    const data = await res.json();
    expect(res.status).toBe(500);
    expect(data).toEqual({ error: 'Internal server error' });
    expect(captureError).toHaveBeenCalled();
  });
}); 