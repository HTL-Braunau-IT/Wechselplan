import { describe, test, expect, vi, beforeEach, afterAll } from 'vitest';
import { GET } from '../route';
import { prisma } from '@/lib/prisma';
import { makeClass, makeStudent } from '@/test/fixtures';



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
        expectedData: { error: 'Username parameter is required' },
      },
      {
        name: 'should return 404 if student not found',
        setup: () => {
          vi.mocked(prisma.student.findUnique).mockResolvedValue(null);
        },
        request: () => new Request('http://localhost/api/students/class?username=nonexistent'),
        expectedStatus: 404,
        expectedData: { error: 'Student not found' },
      },
      {
        name: 'should return 404 if student has no class assigned',
        setup: () => {
          const mockStudent = {
            ...makeStudent({ id: 1, firstName: 'John', lastName: 'Doe', username: 'john.doe' }),
            class: null,
          };
          vi.mocked(prisma.student.findUnique).mockResolvedValue(
            mockStudent as unknown as Awaited<ReturnType<typeof prisma.student.findUnique>>
          );
        },
        request: () => new Request('http://localhost/api/students/class?username=john.doe'),
        expectedStatus: 404,
        expectedData: { error: 'Student has no class assigned' },
      },
      {
        name: 'should return 200 with class name and groupId if found',
        setup: () => {
          // The route includes the class relation, which the generated
          // findUnique type does not describe, hence the cast.
          const mockStudent = {
            ...makeStudent({
              id: 1,
              firstName: 'John',
              lastName: 'Doe',
              username: 'john.doe',
              classId: 1,
              groupId: 1,
            }),
            class: makeClass({ id: 1, name: '1A' }),
          };
          vi.mocked(prisma.student.findUnique).mockResolvedValue(
            mockStudent as unknown as Awaited<ReturnType<typeof prisma.student.findUnique>>
          );
        },
        request: () => new Request('http://localhost/api/students/class?username=john.doe'),
        expectedStatus: 200,
        expectedData: { class: '1A', groupId: 1 },
      },
      {
        name: 'should return 500 on error',
        setup: () => {
          vi.mocked(prisma.student.findUnique).mockRejectedValue(new Error('DB error'));
        },
        request: () => new Request('http://localhost/api/students/class?username=john.doe'),
        expectedStatus: 500,
        expectedData: { error: 'Failed to fetch student class' },
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