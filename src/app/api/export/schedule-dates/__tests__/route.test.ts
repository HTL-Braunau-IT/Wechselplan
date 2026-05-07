import { describe, it, expect, vi, beforeEach } from 'vitest';
import { POST } from '../route';
import { captureError } from '@/lib/sentry';
import { pdf } from '@react-pdf/renderer';
import ScheduleTurnusPDF from '@/components/ScheduleTurnusPDF';

// Create hoisted mock functions
const mockFindUnique = vi.hoisted(() => vi.fn());
const mockFindFirst = vi.hoisted(() => vi.fn());
const mockFindSchoolYear = vi.hoisted(() => vi.fn());

// Mock dependencies
vi.mock('@/lib/sentry', () => ({
  captureError: vi.fn(),
}));

vi.mock('@react-pdf/renderer', () => ({
  pdf: vi.fn().mockReturnValue({
    toBuffer: vi.fn().mockResolvedValue(Buffer.from('mock-pdf-content')),
  }),
}));

vi.mock('@/components/ScheduleTurnusPDF', () => ({
  default: vi.fn().mockReturnValue({}),
}));

// Mock Prisma
vi.mock('@/lib/prisma', () => ({
  prisma: {
    class: {
      findUnique: mockFindUnique,
    },
    schoolYear: {
      findFirst: mockFindSchoolYear,
    },
    schedule: {
      findFirst: mockFindFirst,
    },
  },
}));

describe('Schedule Dates Export API', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('POST /api/export/schedule-dates', () => {
    const testCases = [
      {
        name: 'should return 400 if selectedWeekday is missing',
        request: () => new Request('http://localhost/api/export/schedule-dates?className=1A'),
        expectedStatus: 400,
        expectedData: { error: { code: 'BAD_REQUEST', message: 'Selected Weekday is required' } },
      },
      {
        name: 'should return 400 if selectedWeekday is invalid',
        request: () => new Request('http://localhost/api/export/schedule-dates?className=1A&selectedWeekday=6'),
        expectedStatus: 400,
        expectedData: { error: { code: 'BAD_REQUEST', message: 'Selected Weekday is invalid' } },
      },
      {
        name: 'should return 400 if className is missing',
        request: () => new Request('http://localhost/api/export/schedule-dates?selectedWeekday=1'),
        expectedStatus: 400,
        expectedData: { error: { code: 'BAD_REQUEST', message: 'Class Name is required' } },
      },
      {
        name: 'should return 404 if class not found',
        setup: () => {
          mockFindUnique.mockResolvedValue(null);
          mockFindSchoolYear.mockResolvedValue({ id: 1 });
        },
        request: () => new Request('http://localhost/api/export/schedule-dates?className=1A&selectedWeekday=1'),
        expectedStatus: 404,
        expectedData: { error: { code: 'NOT_FOUND', message: 'Class not found' } },
      },
      {
        name: 'should return 404 if schedule not found',
        setup: () => {
          mockFindUnique.mockResolvedValue({ id: 1, name: '1A' });
          mockFindSchoolYear.mockResolvedValue({ id: 1 });
          mockFindFirst.mockResolvedValue(null);
        },
        request: () => new Request('http://localhost/api/export/schedule-dates?className=1A&selectedWeekday=1'),
        expectedStatus: 404,
        expectedData: { error: { code: 'NOT_FOUND', message: 'Schedule not found' } },
      },
      {
        name: 'should return PDF file on success',
        setup: () => {
          mockFindUnique.mockResolvedValue({ id: 1, name: '1A' });
          mockFindSchoolYear.mockResolvedValue({ id: 1 });
          mockFindFirst.mockResolvedValue({
            turns: [
              {
                id: 1,
                name: 'TURNUS 1',
                customLength: null,
                order: 0,
                weeks: [{ date: '01.01.24', week: 'KW1', isHoliday: false }],
                holidays: [],
              },
            ],
            additionalInfo: 'Test info',
          });
        },
        request: () => new Request('http://localhost/api/export/schedule-dates?className=1A&selectedWeekday=1'),
        expectedStatus: 200,
        expectedHeaders: {
          'Content-Type': 'application/pdf',
          'Content-Disposition': 'attachment; filename=schedule-dates-1A.pdf',
        },
        expectedBody: Buffer.from('mock-pdf-content'),
      },
      {
        name: 'should handle database errors',
        setup: () => {
          mockFindUnique.mockRejectedValue(new Error('Database error'));
          mockFindSchoolYear.mockResolvedValue({ id: 1 });
        },
        request: () => new Request('http://localhost/api/export/schedule-dates?className=1A&selectedWeekday=1'),
        expectedStatus: 500,
        expectedData: { error: { code: 'INTERNAL_ERROR', message: 'Failed to generate pdf file' } },
      },
    ];

    testCases.forEach(({ name, setup, request, expectedStatus, expectedData, expectedHeaders, expectedBody }) => {
      it(name, async () => {
        if (setup) setup();
        const response = await POST(request());
        
        expect(response.status).toBe(expectedStatus);
        
        if (expectedHeaders) {
          Object.entries(expectedHeaders).forEach(([key, value]) => {
            expect(response.headers.get(key)).toBe(value);
          });
        }
        
        if (expectedBody) {
          const buffer = await response.arrayBuffer();
          expect(Buffer.from(buffer)).toEqual(expectedBody);
        } else {
          const data = await response.json();
          expect(data).toEqual(expectedData);
        }
      });
    });
  });
}); 