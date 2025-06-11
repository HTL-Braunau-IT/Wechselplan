import { describe, test, expect, vi, beforeEach, afterAll } from 'vitest';
import { GET, POST } from '../route';
import { prisma } from '@/lib/prisma';
import { captureError } from '@/lib/sentry';



vi.mock('@/lib/prisma', () => ({
  prisma: {
    schoolHoliday: {
      findMany: vi.fn(),
      create: vi.fn(),
    },
  },
}));
vi.mock('@/lib/sentry', () => ({ captureError: vi.fn() }));

interface SchoolHoliday {
  id: number;
  name: string;
  startDate: Date;
  endDate: Date;
  createdAt: Date;
  updatedAt: Date;
}

describe('Holidays API', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });



  describe('GET', () => {
    const testCases = [
      {
        name: 'should return 200 with holidays if found',
        setup: () => {
          const mockHolidays: SchoolHoliday[] = [
            {
              id: 1,
              name: 'Summer Break',
              startDate: new Date('2024-07-01'),
              endDate: new Date('2024-09-01'),
              createdAt: new Date(),
              updatedAt: new Date(),
            },
          ];
          vi.mocked(prisma.schoolHoliday.findMany).mockResolvedValue(mockHolidays);
        },
        expectedStatus: 200,
        expectedData: (data: SchoolHoliday[]) => {
          expect(Array.isArray(data)).toBe(true);
          expect(data.length).toBe(1);
          expect(data[0]).toHaveProperty('name', 'Summer Break');
          expect(new Date(data[0].startDate)).toEqual(new Date('2024-07-01'));
          expect(new Date(data[0].endDate)).toEqual(new Date('2024-09-01'));
        },
      },
      {
        name: 'should return 500 on error',
        setup: () => {
          vi.mocked(prisma.schoolHoliday.findMany).mockRejectedValue(new Error('DB error'));
        },
        expectedStatus: 500,
        expectedData: { error: 'Failed to fetch holidays' },
      },
    ];

    testCases.forEach(({ name, setup, expectedStatus, expectedData }) => {
      test(name, async () => {
        setup();
        const res = await GET();
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
        setup: () => {},
        request: () => new Request('http://localhost/api/settings/holidays', {
          method: 'POST',
          body: JSON.stringify({
            name: 'Summer Break',
            startDate: '2024-07-01',
            // endDate missing
          }),
        }),
        expectedStatus: 400,
        expectedData: { error: 'Missing required fields' },
      },
      {
        name: 'should return 400 if date format is invalid',
        setup: () => {},
        request: () => new Request('http://localhost/api/settings/holidays', {
          method: 'POST',
          body: JSON.stringify({
            name: 'Summer Break',
            startDate: 'invalid-date',
            endDate: '2024-09-01',
          }),
        }),
        expectedStatus: 400,
        expectedData: { error: 'Invalid date format' },
      },
      {
        name: 'should return 400 if end date is before start date',
        setup: () => {},
        request: () => new Request('http://localhost/api/settings/holidays', {
          method: 'POST',
          body: JSON.stringify({
            name: 'Summer Break',
            startDate: '2024-09-01',
            endDate: '2024-07-01',
          }),
        }),
        expectedStatus: 400,
        expectedData: { error: 'End date must be after start date' },
      },
      {
        name: 'should return 200 with created holiday if successful',
        setup: () => {
          const mockHoliday: SchoolHoliday = {
            id: 1,
            name: 'Summer Break',
            startDate: new Date('2024-07-01'),
            endDate: new Date('2024-09-01'),
            createdAt: new Date(),
            updatedAt: new Date(),
          };
          vi.mocked(prisma.schoolHoliday.create).mockResolvedValue(mockHoliday);
        },
        request: () => new Request('http://localhost/api/settings/holidays', {
          method: 'POST',
          body: JSON.stringify({
            name: 'Summer Break',
            startDate: '2024-07-01',
            endDate: '2024-09-01',
          }),
        }),
        expectedStatus: 200,
        expectedData: (data: SchoolHoliday) => {
          expect(data).toHaveProperty('name', 'Summer Break');
          expect(new Date(data.startDate)).toEqual(new Date('2024-07-01'));
          expect(new Date(data.endDate)).toEqual(new Date('2024-09-01'));
        },
      },
      {
        name: 'should return 500 on error',
        setup: () => {
          vi.mocked(prisma.schoolHoliday.create).mockRejectedValue(new Error('DB error'));
        },
        request: () => new Request('http://localhost/api/settings/holidays', {
          method: 'POST',
          body: JSON.stringify({
            name: 'Summer Break',
            startDate: '2024-07-01',
            endDate: '2024-09-01',
          }),
        }),
        expectedStatus: 500,
        expectedData: { error: 'Failed to create holiday' },
      },
    ];

    testCases.forEach(({ name, setup, request, expectedStatus, expectedData }) => {
      test(name, async () => {
        setup();
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