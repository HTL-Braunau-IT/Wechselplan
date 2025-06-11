import { describe, test, expect, vi, beforeEach, afterAll } from 'vitest';
import { GET } from '../route';
import { prisma } from '@/lib/prisma';
import { captureError } from '@/lib/sentry';



vi.mock('@/lib/prisma', () => ({
  prisma: {
    class: { findUnique: vi.fn() },
    student: { findMany: vi.fn() },
  },
}));
vi.mock('@/lib/sentry', () => ({ captureError: vi.fn() }));

interface Student {
  id: number;
  firstName: string;
  lastName: string;
  createdAt: Date;
  updatedAt: Date;
  username: string;
  classId: number;
  groupId: number;
}

interface ApiResponse {
  students?: Student[];
  error?: string;
}

describe('PDF Data API', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });



  const testCases = [
    {
      name: 'should return 400 if className is missing',
      setup: () => {
        // No setup needed for this test case
      },
      request: () => new Request('http://localhost/api/schedules/pdf-data'),
      expectedStatus: 400,
      expectedData: { error: 'Class Name is required' },
      shouldCaptureError: true,
    },
    {
      name: 'should return 400 if class not found',
      setup: () => {
        const findUniqueMock = vi.fn().mockResolvedValue(null);
        vi.mocked(prisma.class.findUnique).mockImplementation(() => findUniqueMock());
      },
      request: () => new Request('http://localhost/api/schedules/pdf-data?className=1A'),
      expectedStatus: 400,
      expectedData: { error: 'Class not found' },
      shouldCaptureError: true,
    },
    {
      name: 'should return 404 if no students found',
      setup: () => {
        const findUniqueMock = vi.fn().mockResolvedValue({ 
          id: 1, 
          name: '1A', 
          createdAt: new Date(), 
          updatedAt: new Date(), 
          description: null 
        });
        const findManyMock = vi.fn().mockResolvedValue([]);
        vi.mocked(prisma.class.findUnique).mockImplementation(() => findUniqueMock());
        vi.mocked(prisma.student.findMany).mockImplementation(() => findManyMock());
      },
      request: () => new Request('http://localhost/api/schedules/pdf-data?className=1A'),
      expectedStatus: 404,
      expectedData: { error: 'No students found' },
      shouldCaptureError: true,
    },
    {
      name: 'should return 200 and students if found',
      setup: () => {
        const findUniqueMock = vi.fn().mockResolvedValue({ 
          id: 1, 
          name: '1A', 
          createdAt: new Date(), 
          updatedAt: new Date(), 
          description: null 
        });
        const findManyMock = vi.fn().mockResolvedValue([
          { 
            id: 1, 
            firstName: 'S', 
            lastName: 'T', 
            createdAt: new Date(), 
            updatedAt: new Date(), 
            username: 'student', 
            classId: 1, 
            groupId: 1 
          },
        ]);
        vi.mocked(prisma.class.findUnique).mockImplementation(() => findUniqueMock());
        vi.mocked(prisma.student.findMany).mockImplementation(() => findManyMock());
      },
      request: () => new Request('http://localhost/api/schedules/pdf-data?className=1A'),
      expectedStatus: 200,
      expectedData: (data: ApiResponse) => {
        expect(data).toHaveProperty('students');
        expect(Array.isArray(data.students)).toBe(true);
        expect(data.students?.length).toBe(1);
      },
      shouldCaptureError: false,
    },
    {
      name: 'should return 500 and call captureError on unexpected error',
      setup: () => {
        const findUniqueMock = vi.fn().mockRejectedValue(new Error('DB error'));
        vi.mocked(prisma.class.findUnique).mockImplementation(() => findUniqueMock());
      },
      request: () => new Request('http://localhost/api/schedules/pdf-data?className=1A'),
      expectedStatus: 500,
      expectedData: { error: 'Internal server error' },
      shouldCaptureError: true,
    },
  ];

  testCases.forEach(({ name, setup, request, expectedStatus, expectedData, shouldCaptureError }) => {
    test(name, async () => {
      setup();
      const res = await GET(request());
      const data = await res.json();
      expect(res.status).toBe(expectedStatus);
      if (typeof expectedData === 'function') {
        expectedData(data);
      } else {
        expect(data).toEqual(expectedData);
      }
      if (shouldCaptureError) {
        expect(captureError).toHaveBeenCalled();
      } else {
        expect(captureError).not.toHaveBeenCalled();
      }
    });
  });
}); 