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
    classYearStaff: { findUnique: vi.fn() },
    schedule: { findFirst: vi.fn() },
    schoolYear: { findFirst: vi.fn() },
    classMembership: { findMany: vi.fn() },
    studentWeekdayGroup: { findMany: vi.fn() },
    student: { findMany: vi.fn() },
  },
}));
vi.mock('@/lib/sentry', () => ({ captureError: vi.fn() }));

describe('Schedule Data API', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(prisma.schoolYear.findFirst).mockResolvedValue({ id: 1 });
    vi.mocked(prisma.classMembership.findMany).mockResolvedValue([]);
    vi.mocked(prisma.studentWeekdayGroup.findMany).mockResolvedValue([]);
    vi.mocked(prisma.classYearStaff.findUnique).mockResolvedValue(null);
  });

  test('should return 400 if teacher username is missing', async () => {
    const req = new Request('http://localhost/api/schedules/data');
    const res = await GET(req);
    const data = await res.json();
    expect(res.status).toBe(400);
    expect(data).toEqual({ error: { code: 'BAD_REQUEST', message: 'Teacher username is required' } });
  });

  test('should return 404 if teacher not found', async () => {
    vi.mocked(prisma.teacher.findUnique).mockResolvedValue(null);
    const req = new Request('http://localhost/api/schedules/data?teacher=foo&weekday=1');
    const res = await GET(req);
    const data = await res.json();
    expect(res.status).toBe(404);
    expect(data).toEqual({ error: { code: 'NOT_FOUND', message: 'Teacher not found' } });
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
    const req = new Request('http://localhost/api/schedules/data?teacher=foo&weekday=1');
    const res = await GET(req);
    const data = await res.json();
    expect(res.status).toBe(404);
    expect(data).toEqual({ error: { code: 'NOT_FOUND', message: 'No classes assigned to teacher' } });
  });

  test('should return 200 with empty teacherRotation when none found', async () => {
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
        period: 'AM',
        teacherId: 1,
        subjectId: 1,
        learningContentId: 1,
        roomId: 1,
        selectedWeekday: 1,
        schoolYearId: 1,
        pmTrack: 'ALL',
      },
    ]);
    vi.mocked(prisma.teacherRotation.findMany).mockResolvedValue([]);
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
      schoolYearId: 1,
      createdAt: new Date(),
      updatedAt: new Date(),
      description: null,
      startDate: new Date(),
      endDate: new Date(),
      selectedWeekday: 1,
      additionalInfo: null,
      semesterPlanning: null,
      pmBiweeklyAnchor: null,
      breakTimes: [],
      scheduleTimes: [],
      turns: [
        {
          id: 10,
          name: 'TURNUS 1',
          order: 0,
          customLength: null,
          scheduleId: 1,
          createdAt: new Date(),
          updatedAt: new Date(),
          weeks: [
            {
              id: 100,
              turnId: 10,
              date: new Date('2024-09-02'),
              week: 36,
              isHoliday: false,
              includedInPlan: true,
              createdAt: new Date(),
              updatedAt: new Date(),
            },
          ],
          holidays: [],
        },
      ],
    } as Awaited<ReturnType<typeof prisma.schedule.findFirst>>);
    vi.mocked(prisma.student.findMany).mockResolvedValue([]);
    const req = new Request('http://localhost/api/schedules/data?teacher=foo&weekday=1');
    const res = await GET(req);
    const data = await res.json();
    expect(res.status).toBe(200);
    expect(data.data.teacherRotation).toEqual([]);
    expect(data.data.schedules.length).toBeGreaterThan(0);
  });

  test('should return 200 with empty students when none found', async () => {
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
        period: 'AM',
        teacherId: 1,
        subjectId: 1,
        learningContentId: 1,
        roomId: 1,
        selectedWeekday: 1,
      },
    ]);
    vi.mocked(prisma.teacherRotation.findMany).mockResolvedValue([
      {
        id: 1,
        classId: 1,
        groupId: 1,
        createdAt: new Date(),
        updatedAt: new Date(),
        period: 'AM',
        teacherId: 1,
        turnId: 1,
        turn: { name: 'TURNUS 1' },
      } as unknown as Awaited<ReturnType<typeof prisma.teacherRotation.findMany>>[number],
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
      additionalInfo: null,
      semesterPlanning: null,
      breakTimes: [],
      scheduleTimes: [],
      turns: [],
    } as Awaited<ReturnType<typeof prisma.schedule.findFirst>>);
    vi.mocked(prisma.student.findMany).mockResolvedValue([]);
    const req = new Request('http://localhost/api/schedules/data?teacher=foo&weekday=1');
    const res = await GET(req);
    const data = await res.json();
    expect(res.status).toBe(200);
    expect(data).toHaveProperty('data.students');
    expect(data.data.students).toEqual([[]]);
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
        period: 'AM',
        teacherId: 1,
        subjectId: 1,
        learningContentId: 1,
        roomId: 1,
        selectedWeekday: 1,
      },
    ]);
    vi.mocked(prisma.teacherRotation.findMany).mockResolvedValue([
      {
        id: 1,
        classId: 1,
        groupId: 1,
        createdAt: new Date(),
        updatedAt: new Date(),
        period: 'AM',
        teacherId: 1,
        turnId: 1,
        turn: { name: 'TURNUS 1' },
      } as unknown as Awaited<ReturnType<typeof prisma.teacherRotation.findMany>>[number],
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
      additionalInfo: null,
      semesterPlanning: null,
      breakTimes: [],
      scheduleTimes: [],
      turns: [],
    } as Awaited<ReturnType<typeof prisma.schedule.findFirst>>);
    vi.mocked(prisma.classMembership.findMany).mockResolvedValue([
      { studentId: 1 },
    ]);
    vi.mocked(prisma.studentWeekdayGroup.findMany).mockResolvedValue([
      { studentId: 1, groupId: 1 },
    ]);
    vi.mocked(prisma.student.findMany).mockResolvedValue([
      {
        id: 1,
        firstName: 'S',
        lastName: 'T',
      },
    ]);
    const req = new Request('http://localhost/api/schedules/data?teacher=foo&weekday=1');
    const res = await GET(req);
    const data = await res.json();
    expect(res.status).toBe(200);
    expect(data).toHaveProperty('data.schedules');
    expect(data).toHaveProperty('data.students');
    expect(data).toHaveProperty('data.teacherRotation');
    expect(data).toHaveProperty('data.assignments');
    expect(data).toHaveProperty('data.classdata');
    expect(data.data.students).toEqual([
      [
        {
          id: 1,
          firstName: 'S',
          lastName: 'T',
          classId: 1,
          groupId: 1,
        },
      ],
    ]);
  });

  test('should return 500 and call captureError on unexpected error', async () => {
    vi.mocked(prisma.teacher.findUnique).mockRejectedValue(new Error('DB error'));
    const req = new Request('http://localhost/api/schedules/data?teacher=foo&weekday=1');
    const res = await GET(req);
    const data = await res.json();
    expect(res.status).toBe(500);
    expect(data).toEqual({ error: { code: 'INTERNAL_ERROR', message: 'Internal server error' } });
    expect(captureError).toHaveBeenCalled();
  });
}); 
