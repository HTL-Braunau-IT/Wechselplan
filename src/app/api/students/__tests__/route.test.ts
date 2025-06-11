import { describe, test, expect, vi, beforeEach, afterAll } from 'vitest';
import { GET, POST } from '../route';
import { prisma } from '@/lib/prisma';
import { captureError } from '@/lib/sentry';



vi.mock('@/lib/prisma', () => ({
  prisma: {
    student: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
      create: vi.fn(),
    },
    class: {
      findUnique: vi.fn(),
    },
  },
}));
vi.mock('@/lib/sentry', () => ({ captureError: vi.fn() }));

interface Student {
  id: number;
  firstName: string;
  lastName: string;
  username: string;
  classId: number;
  createdAt: Date;
  updatedAt: Date;
}

describe('Students API', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });



  describe('GET', () => {
    const testCases = [
      {
        name: 'should return 400 if class parameter is missing',
        request: () => new Request('http://localhost/api/students'),
        expectedStatus: 400,
        expectedData: { error: 'Class parameter is required' },
      },
      {
        name: 'should return 200 with students if found',
        setup: () => {
          const mockStudents: Student[] = [
            {
              id: 1,
              firstName: 'John',
              lastName: 'Doe',
              username: 'john.doe',
              classId: 1,
              createdAt: new Date(),
              updatedAt: new Date(),
            },
          ];
          vi.mocked(prisma.student.findMany).mockResolvedValue(mockStudents);
        },
        request: () => new Request('http://localhost/api/students?class=1A'),
        expectedStatus: 200,
        expectedData: (data: Student[]) => {
          expect(Array.isArray(data)).toBe(true);
          expect(data.length).toBe(1);
          expect(data[0]).toHaveProperty('firstName', 'John');
          expect(data[0]).toHaveProperty('lastName', 'Doe');
          expect(data[0]).toHaveProperty('username', 'john.doe');
        },
      },
      {
        name: 'should return 500 on error',
        setup: () => {
          vi.mocked(prisma.student.findMany).mockRejectedValue(new Error('DB error'));
        },
        request: () => new Request('http://localhost/api/students?class=1A'),
        expectedStatus: 500,
        expectedData: { error: 'Failed to fetch students' },
      },
    ];

    testCases.forEach(({ name, setup, request, expectedStatus, expectedData }) => {
      test(name, async () => {
        if (setup) setup();
        const res = await GET(request());
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

  describe('POST', () => {
    const testCases = [
      {
        name: 'should return 400 if required fields are missing',
        request: () => new Request('http://localhost/api/students', {
          method: 'POST',
          body: JSON.stringify({
            firstName: 'John',
            lastName: 'Doe',
            // username and className missing
          }),
        }),
        expectedStatus: 400,
        expectedData: { error: 'Missing required fields' },
      },
      {
        name: 'should return 400 if username already exists',
        setup: () => {
          vi.mocked(prisma.student.findUnique).mockResolvedValue({
            id: 1,
            firstName: 'Jane',
            lastName: 'Doe',
            username: 'john.doe',
            classId: 1,
            createdAt: new Date(),
            updatedAt: new Date(),
          });
        },
        request: () => new Request('http://localhost/api/students', {
          method: 'POST',
          body: JSON.stringify({
            firstName: 'John',
            lastName: 'Doe',
            username: 'john.doe',
            className: '1A',
          }),
        }),
        expectedStatus: 400,
        expectedData: { error: 'Username already exists' },
      },
      {
        name: 'should return 404 if class not found',
        setup: () => {
          vi.mocked(prisma.student.findUnique).mockResolvedValue(null);
          vi.mocked(prisma.class.findUnique).mockResolvedValue(null);
        },
        request: () => new Request('http://localhost/api/students', {
          method: 'POST',
          body: JSON.stringify({
            firstName: 'John',
            lastName: 'Doe',
            username: 'john.doe',
            className: 'NonExistentClass',
          }),
        }),
        expectedStatus: 404,
        expectedData: { error: 'Class not found' },
      },
      {
        name: 'should return 200 with created student if successful',
        setup: () => {
          vi.mocked(prisma.student.findUnique).mockResolvedValue(null);
          vi.mocked(prisma.class.findUnique).mockResolvedValue({
            id: 1,
            name: '1A',
            createdAt: new Date(),
            updatedAt: new Date(),
          });
          vi.mocked(prisma.student.create).mockResolvedValue({
            id: 1,
            firstName: 'John',
            lastName: 'Doe',
            username: 'john.doe',
            classId: 1,
            createdAt: new Date(),
            updatedAt: new Date(),
          });
        },
        request: () => new Request('http://localhost/api/students', {
          method: 'POST',
          body: JSON.stringify({
            firstName: 'John',
            lastName: 'Doe',
            username: 'john.doe',
            className: '1A',
          }),
        }),
        expectedStatus: 200,
        expectedData: (data: Student) => {
          expect(data).toHaveProperty('firstName', 'John');
          expect(data).toHaveProperty('lastName', 'Doe');
          expect(data).toHaveProperty('username', 'john.doe');
          expect(data).toHaveProperty('classId', 1);
        },
      },
      {
        name: 'should return 500 on error',
        setup: () => {
          vi.mocked(prisma.student.findUnique).mockRejectedValue(new Error('DB error'));
        },
        request: () => new Request('http://localhost/api/students', {
          method: 'POST',
          body: JSON.stringify({
            firstName: 'John',
            lastName: 'Doe',
            username: 'john.doe',
            className: '1A',
          }),
        }),
        expectedStatus: 500,
        expectedData: { error: 'Failed to create student' },
      },
    ];

    testCases.forEach(({ name, setup, request, expectedStatus, expectedData }) => {
      test(name, async () => {
        if (setup) setup();
        const res = await POST(request());
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