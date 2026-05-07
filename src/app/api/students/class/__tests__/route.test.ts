import { describe, test, expect, vi, beforeEach, afterAll } from 'vitest';
import { GET } from '../route';
import { prisma } from '@/lib/prisma';



vi.mock('@/lib/prisma', () => ({
  prisma: {
    student: {
      findUnique: vi.fn(),
    },
  },
}));

interface Student {
  id: number;
  firstName: string;
  lastName: string;
  username: string;
  classId: number | null;
  groupId: number | null;
  createdAt: Date;
  updatedAt: Date;
  class?: {
    id: number;
    name: string;
    createdAt: Date;
    updatedAt: Date;
  } | null;
}

describe('Students Class API', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });


  describe('GET', () => {
    const testCases = [
      {
        name: 'should return 400 if username parameter is missing',
        request: () => new Request('http://localhost/api/students/class'),
        expectedStatus: 400,
        expectedData: { error: { code: 'BAD_REQUEST', message: 'Username parameter is required' } },
      },
      {
        name: 'should return 404 if student not found',
        setup: () => {
          vi.mocked(prisma.student.findUnique).mockResolvedValue(null);
        },
        request: () => new Request('http://localhost/api/students/class?username=nonexistent'),
        expectedStatus: 404,
        expectedData: { error: { code: 'NOT_FOUND', message: 'Student not found' } },
      },
      {
        name: 'should return 404 if student has no class assigned',
        setup: () => {
          const mockStudent = {
            id: 1,
            firstName: 'John',
            lastName: 'Doe',
            username: 'john.doe',
            createdAt: new Date(),
            updatedAt: new Date(),
          } as unknown as Student;
          vi.mocked(prisma.student.findUnique).mockResolvedValue(mockStudent as never);
          vi.mocked(prisma.classMembership.findUnique).mockResolvedValue(null);
        },
        request: () => new Request('http://localhost/api/students/class?username=john.doe&schoolYearId=1'),
        expectedStatus: 404,
        expectedData: { error: { code: 'NOT_FOUND', message: 'Student has no class assigned' } },
      },
      {
        name: 'should return 200 with class name and groupId if found',
        setup: () => {
          const mockStudent = {
            id: 1,
            firstName: 'John',
            lastName: 'Doe',
            username: 'john.doe',
            createdAt: new Date(),
            updatedAt: new Date(),
          } as unknown as Student;
          vi.mocked(prisma.student.findUnique).mockResolvedValue(mockStudent as never);
          vi.mocked(prisma.classMembership.findUnique).mockResolvedValue({
            id: 1,
            studentId: 1,
            classId: 1,
            schoolYearId: 1,
            createdAt: new Date(),
            updatedAt: new Date(),
            class: { id: 1, name: '1A' }
          } as never);
          vi.mocked(prisma.studentWeekdayGroup.findUnique).mockResolvedValue({
            id: 1,
            studentId: 1,
            schoolYearId: 1,
            weekday: 1,
            groupId: 1,
            createdAt: new Date(),
            updatedAt: new Date(),
          } as never);
        },
        request: () => new Request('http://localhost/api/students/class?username=john.doe&schoolYearId=1'),
        expectedStatus: 200,
        expectedData: { data: { class: '1A', groupId: 1 } },
      },
      {
        name: 'should return 500 on error',
        setup: () => {
          vi.mocked(prisma.student.findUnique).mockRejectedValue(new Error('DB error'));
        },
        request: () => new Request('http://localhost/api/students/class?username=john.doe'),
        expectedStatus: 500,
        expectedData: { error: { code: 'INTERNAL_ERROR', message: 'Failed to fetch student class' } },
      },
    ];

    testCases.forEach(({ name, setup, request, expectedStatus, expectedData }) => {
      test(name, async () => {
        if (setup) setup();
        const res = await GET(request());
        const data = await res.json();
        expect(res.status).toBe(expectedStatus);
        expect(data).toEqual(expectedData);
      });
    });
  });
}); 