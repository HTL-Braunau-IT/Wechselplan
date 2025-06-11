import { describe, test, expect, vi, beforeEach } from 'vitest';
import { POST } from '../route';
import { captureError } from '@/lib/sentry';
import { prisma } from '@/lib/prisma';
import type { Student, TeacherAssignment, Schedule } from '@prisma/client';

// Mock PDFLayout component
vi.mock('@/components/PDFLayout', () => ({
  default: vi.fn().mockReturnValue({ type: 'mock-pdf-layout' }),
}));

// Mock PrismaClient
vi.mock('@/lib/prisma', () => ({
  prisma: {
    class: {
      findUnique: vi.fn(),
    },
    student: {
      findMany: vi.fn(),
    },
    teacherAssignment: {
      findMany: vi.fn(),
    },
    schedule: {
      findFirst: vi.fn(),
    },
  },
}));

// Mock @react-pdf/renderer
vi.mock('@react-pdf/renderer', () => ({
  pdf: vi.fn().mockReturnValue({
    toBuffer: vi.fn().mockResolvedValue(Buffer.from('mock-pdf-content')),
  }),
}));

// Mock sentry
vi.mock('@/lib/sentry', () => ({
  captureError: vi.fn(),
}));

describe('Export API', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('POST /api/export', () => {
    test('should return 400 if className is not provided', async () => {
      const request = new Request('http://localhost/api/export');
      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data).toEqual({ error: 'Class Name is required' });
      expect(captureError).toHaveBeenCalledWith(
        expect.any(Error),
        {
          location: 'api/export',
          type: 'export-schedule',
        }
      );
    });

    test('should return 400 if class is not found', async () => {
      const findUniqueMock = vi.mocked(prisma.class.findUnique);
      findUniqueMock.mockResolvedValue(null);

      const request = new Request('http://localhost/api/export?className=1A');
      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data).toEqual({ error: 'Class not found' });
      expect(captureError).toHaveBeenCalledWith(
        expect.any(Error),
        {
          location: 'api/export',
          type: 'pdf-data-error',
        }
      );
    });

    test('should generate PDF successfully', async () => {
      // Mock class data
      const findUniqueMock = vi.mocked(prisma.class.findUnique);
      findUniqueMock.mockResolvedValue({
        id: 1,
        name: '1A',
        description: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      // Mock students data
      const findManyStudentsMock = vi.mocked(prisma.student.findMany);
      findManyStudentsMock.mockResolvedValue([
        {
          id: 1,
          firstName: 'John',
          lastName: 'Doe',
          classId: 1,
          groupId: 1,
          username: 'john.doe',
          createdAt: new Date(),
          updatedAt: new Date(),
        } as Student,
      ]);

      // Mock teacher assignments
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
        } as TeacherAssignment,
      ]);

      // Mock schedule data
      const findFirstScheduleMock = vi.mocked(prisma.schedule.findFirst);
      findFirstScheduleMock.mockResolvedValue({
        id: 1,
        name: 'Schedule 1',
        classId: 1,
        description: null,
        startDate: new Date('2024-01-01'),
        endDate: new Date('2024-01-31'),
        selectedWeekday: 1,
        scheduleData: {
          turn1: {
            weeks: [
              { date: '2024-01-01' },
              { date: '2024-01-08' },
            ],
          },
        },
        additionalInfo: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      } as Schedule);

      const request = new Request('http://localhost/api/export?className=1A');
      const response = await POST(request);

      expect(response.status).toBe(200);
      expect(response.headers.get('Content-Type')).toBe('application/pdf');
      expect(response.headers.get('Content-Disposition')).toBe('attachment; filename=schedule-1A.pdf');
      
      const buffer = await response.arrayBuffer();
      expect(buffer).toBeInstanceOf(ArrayBuffer);
      expect(buffer.byteLength).toBeGreaterThan(0);
    });

    test('should handle database errors', async () => {
      const findUniqueMock = vi.mocked(prisma.class.findUnique);
      findUniqueMock.mockRejectedValue(new Error('Database error'));

      const request = new Request('http://localhost/api/export?className=1A');
      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(500);
      expect(data).toEqual({ error: 'Failed to generate PDF' });
      expect(captureError).toHaveBeenCalledWith(
        expect.any(Error),
        {
          location: 'api/export',
          type: 'export-schedule',
        }
      );
    });
  });
}); 