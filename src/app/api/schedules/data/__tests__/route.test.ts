import { describe, test, expect, vi, beforeEach } from 'vitest';
import { GET } from '../route';
import { prisma } from '@/lib/prisma';
import { captureError } from '@/lib/sentry';
import { makeClass, makeSchedule, makeSchoolYear, makeStudent, makeTeacher, makeTeacherAssignment } from '@/test/fixtures';



vi.mock('@/lib/prisma', () => ({
  prisma: {
    teacher: { findUnique: vi.fn() },
    teacherAssignment: { findMany: vi.fn() },
    teacherRotation: { findMany: vi.fn() },
    class: { findUnique: vi.fn() },
    schedule: { findFirst: vi.fn() },
    schoolYear: { findFirst: vi.fn() },
    classMembership: { findMany: vi.fn() },
    student: { findMany: vi.fn() },
  },
}));
vi.mock('@/lib/sentry', () => ({ captureError: vi.fn() }));

describe('Schedule Data API', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(prisma.schoolYear.findFirst).mockResolvedValue(makeSchoolYear({ id: 1 }));
    vi.mocked(prisma.classMembership.findMany).mockResolvedValue([]);
  });

  test('should return 400 if teacher username is missing', async () => {
    const req = new Request('http://localhost/api/schedules/data');
    const res = await GET(req);
    const data = await res.json();
    expect(res.status).toBe(400);
    expect(data).toEqual({ error: 'Teacher username is required' });
  });

  test('should return 200 if teacher not found', async () => {
    vi.mocked(prisma.teacher.findUnique).mockResolvedValue(null);
    const req = new Request('http://localhost/api/schedules/data?teacher=foo');
    const res = await GET(req);
    const data = await res.json();
    expect(res.status).toBe(200);
    expect(data).toEqual({ error: 'Teacher not found' });
  });

  test('should return 200 if no assignments for teacher', async () => {
    vi.mocked(prisma.teacher.findUnique).mockResolvedValue(makeTeacher({ id: 1, firstName: 'T', lastName: 'E', username: 'foo' }));
    vi.mocked(prisma.teacherAssignment.findMany).mockResolvedValue([]);
    const req = new Request('http://localhost/api/schedules/data?teacher=foo');
    const res = await GET(req);
    const data = await res.json();
    expect(res.status).toBe(200);
    expect(data).toEqual({ error: 'No classes assigned to teacher' });
  });

  test('should return 200 if no teacher rotation found', async () => {
    vi.mocked(prisma.teacher.findUnique).mockResolvedValue(makeTeacher({ id: 1, firstName: 'T', lastName: 'E', username: 'foo' }));
    vi.mocked(prisma.teacherAssignment.findMany).mockResolvedValue([
      makeTeacherAssignment({ id: 1, classId: 1, groupId: 1, period: '1' }),
    ]);
    vi.mocked(prisma.teacherRotation.findMany).mockResolvedValue([]);
    const req = new Request('http://localhost/api/schedules/data?teacher=foo');
    const res = await GET(req);
    const data = await res.json();
    expect(res.status).toBe(200);
    expect(data).toEqual({ error: 'No teacher rotation found' });
  });

  test('should return 200 if no students found', async () => {
    vi.mocked(prisma.teacher.findUnique).mockResolvedValue(makeTeacher({ id: 1, firstName: 'T', lastName: 'E', username: 'foo' }));
    vi.mocked(prisma.teacherAssignment.findMany).mockResolvedValue([
      makeTeacherAssignment({ id: 1, classId: 1, groupId: 1, period: '1' }),
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
    vi.mocked(prisma.class.findUnique).mockResolvedValue(makeClass({ id: 1, name: '1A' }));
    vi.mocked(prisma.schedule.findFirst).mockResolvedValue({
      ...makeSchedule({ id: 1, name: 'Schedule', classId: 1, selectedWeekday: 0, scheduleData: {} }),
      breakTimes: [],
      scheduleTimes: [],
      turns: [],
    } as Awaited<ReturnType<typeof prisma.schedule.findFirst>>);
    vi.mocked(prisma.student.findMany).mockResolvedValue([]);
    const req = new Request('http://localhost/api/schedules/data?teacher=foo');
    const res = await GET(req);
    const data = await res.json();
    expect(res.status).toBe(200);
    expect(data).toEqual({ error: 'No students found' });
  });

  test('should return 200 and correct structure if all data is present', async () => {
    vi.mocked(prisma.teacher.findUnique).mockResolvedValue(makeTeacher({ id: 1, firstName: 'T', lastName: 'E', username: 'foo' }));
    vi.mocked(prisma.teacherAssignment.findMany).mockResolvedValue([
      makeTeacherAssignment({ id: 1, classId: 1, groupId: 1, period: '1' }),
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
    vi.mocked(prisma.class.findUnique).mockResolvedValue(makeClass({ id: 1, name: '1A' }));
    vi.mocked(prisma.schedule.findFirst).mockResolvedValue({
      ...makeSchedule({ id: 1, name: 'Schedule', classId: 1, selectedWeekday: 0, scheduleData: {} }),
      breakTimes: [],
      scheduleTimes: [],
      turns: [],
    } as Awaited<ReturnType<typeof prisma.schedule.findFirst>>);
    // The route only reads studentId off each membership row.
    vi.mocked(prisma.classMembership.findMany).mockResolvedValue([
      { studentId: 1 } as never,
    ]);
    vi.mocked(prisma.student.findMany).mockResolvedValue([
      makeStudent({ id: 1, firstName: 'S', lastName: 'T', username: 'student', classId: 1, groupId: 1 }),
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