import { describe, test, expect, vi, beforeEach, afterAll } from 'vitest';
import { GET } from '../route';
import { prisma } from '@/lib/prisma';
import { makeStudent } from '@/test/fixtures';

// Mock console.error to prevent error messages from appearing in test output
const originalConsoleError = console.error;
console.error = vi.fn(() => undefined);

vi.mock('@/lib/prisma', () => ({
  prisma: {
    student: {
      findMany: vi.fn(),
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
}

describe('Students All API', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterAll(() => {
    console.error = originalConsoleError;
  });

  describe('GET', () => {
    const testCases = [
      {
        name: 'should return 200 with all students if found',
        setup: () => {
          const mockStudents = [
            makeStudent({ id: 1, firstName: 'John', lastName: 'Doe', username: 'john.doe', classId: 1 }),
            makeStudent({ id: 2, firstName: 'Jane', lastName: 'Smith', username: 'jane.smith', classId: 1 }),
          ];
          vi.mocked(prisma.student.findMany).mockResolvedValue(mockStudents);
        },
        expectedStatus: 200,
        expectedData: (data: Student[]) => {
          expect(Array.isArray(data)).toBe(true);
          expect(data.length).toBe(2);
          const first = data[0]!;
          const second = data[1]!;
          expect(first).toHaveProperty('firstName', 'John');
          expect(first).toHaveProperty('lastName', 'Doe');
          expect(second).toHaveProperty('firstName', 'Jane');
          expect(second).toHaveProperty('lastName', 'Smith');
          expect(first.lastName.localeCompare(second.lastName)).toBeLessThan(0);
        },
      },
      {
        name: 'should return empty array if no students found',
        setup: () => {
          vi.mocked(prisma.student.findMany).mockResolvedValue([]);
        },
        expectedStatus: 200,
        expectedData: (data: Student[]) => {
          expect(Array.isArray(data)).toBe(true);
          expect(data.length).toBe(0);
        },
      },
      {
        name: 'should return 500 on error',
        setup: () => {
          vi.mocked(prisma.student.findMany).mockRejectedValue(new Error('DB error'));
        },
        expectedStatus: 500,
        expectedData: { error: 'Failed to fetch students' },
      },
    ];

    testCases.forEach(({ name, setup, expectedStatus, expectedData }) => {
      test(name, async () => {
        if (setup) setup();
        const res = await GET(new Request('http://localhost/api/students/all'));
        const data = await res.json();
        expect(res.status).toBe(expectedStatus);
        if (typeof expectedData === 'function') {
          expectedData(data);
        } else {
          expect(data).toEqual(expectedData);
        }
      });
    });
  });
}); 