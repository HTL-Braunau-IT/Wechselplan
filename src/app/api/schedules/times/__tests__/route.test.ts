import { describe, test, expect, vi, beforeEach, afterAll } from 'vitest';
import { GET, POST } from '../route';
import { prisma } from '@/lib/prisma';



vi.mock('@/lib/prisma', () => ({
  prisma: {
    schedule: {
      findFirst: vi.fn(),
      update: vi.fn(),
    },
  },
}));

interface ScheduleTime {
  id: number;
  startTime: string;
  endTime: string;
  createdAt: Date;
  updatedAt: Date;
}

interface BreakTime {
  id: number;
  startTime: string;
  endTime: string;
  createdAt: Date;
  updatedAt: Date;
}

interface Schedule {
  id: number;
  classId: number;
  createdAt: Date;
  updatedAt: Date;
  scheduleTimes: ScheduleTime[];
  breakTimes: BreakTime[];
}

describe('Schedule Times API', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterAll(() => {

  });

  describe('GET', () => {
    const testCases = [
      {
        name: 'should return 400 if classId is missing',
        setup: () => {},
        request: () => new Request('http://localhost/api/schedules/times'),
        expectedStatus: 400,
        expectedData: { error: 'Class ID is required' },
      },
      {
        name: 'should return 200 with empty arrays if no schedule found',
        setup: () => {
          vi.mocked(prisma.schedule.findFirst).mockResolvedValue(null);
        },
        request: () => new Request('http://localhost/api/schedules/times?class=1'),
        expectedStatus: 200,
        expectedData: { scheduleTimes: [], breakTimes: [] },
      },
      {
        name: 'should return 200 with schedule and break times if found',
        setup: () => {
          const mockSchedule: Schedule = {
            id: 1,
            classId: 1,
            createdAt: new Date(),
            updatedAt: new Date(),
            scheduleTimes: [
              { id: 1, startTime: '08:00', endTime: '09:00', createdAt: new Date(), updatedAt: new Date() },
            ],
            breakTimes: [
              { id: 1, startTime: '09:00', endTime: '09:15', createdAt: new Date(), updatedAt: new Date() },
            ],
          };
          vi.mocked(prisma.schedule.findFirst).mockResolvedValue(mockSchedule);
        },
        request: () => new Request('http://localhost/api/schedules/times?class=1'),
        expectedStatus: 200,
        expectedData: (data: any) => {
          expect(data).toHaveProperty('scheduleTimes');
          expect(data).toHaveProperty('breakTimes');
          expect(Array.isArray(data.scheduleTimes)).toBe(true);
          expect(Array.isArray(data.breakTimes)).toBe(true);
          expect(data.scheduleTimes.length).toBe(1);
          expect(data.breakTimes.length).toBe(1);
        },
      },
      {
        name: 'should return 500 on error',
        setup: () => {
          vi.mocked(prisma.schedule.findFirst).mockRejectedValue(new Error('DB error'));
        },
        request: () => new Request('http://localhost/api/schedules/times?class=1'),
        expectedStatus: 500,
        expectedData: { error: 'Failed to fetch times' },
      },
    ];

    testCases.forEach(({ name, setup, request, expectedStatus, expectedData }) => {
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
      });
    });
  });

  describe('POST', () => {
    const testCases = [
      {
        name: 'should return 400 if classId is missing',
        setup: () => {},
        request: () => new Request('http://localhost/api/schedules/times', {
          method: 'POST',
          body: JSON.stringify({ scheduleTimes: [], breakTimes: [] }),
        }),
        expectedStatus: 400,
        expectedData: { error: 'Class ID is required' },
      },
      {
        name: 'should return 404 if no schedule found',
        setup: () => {
          vi.mocked(prisma.schedule.findFirst).mockResolvedValue(null);
        },
        request: () => new Request('http://localhost/api/schedules/times', {
          method: 'POST',
          body: JSON.stringify({
            classId: '1',
            scheduleTimes: ['1'],
            breakTimes: ['1'],
          }),
        }),
        expectedStatus: 404,
        expectedData: { error: 'No schedule found for this class' },
      },
      {
        name: 'should return 200 with updated schedule if successful',
        setup: () => {
          const mockSchedule: Schedule = {
            id: 1,
            classId: 1,
            createdAt: new Date(),
            updatedAt: new Date(),
            scheduleTimes: [
              { id: 1, startTime: '08:00', endTime: '09:00', createdAt: new Date(), updatedAt: new Date() },
            ],
            breakTimes: [
              { id: 1, startTime: '09:00', endTime: '09:15', createdAt: new Date(), updatedAt: new Date() },
            ],
          };
          vi.mocked(prisma.schedule.findFirst).mockResolvedValue(mockSchedule);
          vi.mocked(prisma.schedule.update).mockResolvedValue(mockSchedule);
        },
        request: () => new Request('http://localhost/api/schedules/times', {
          method: 'POST',
          body: JSON.stringify({
            classId: '1',
            scheduleTimes: ['1'],
            breakTimes: ['1'],
          }),
        }),
        expectedStatus: 200,
        expectedData: (data: any) => {
          expect(data).toHaveProperty('scheduleTimes');
          expect(data).toHaveProperty('breakTimes');
          expect(Array.isArray(data.scheduleTimes)).toBe(true);
          expect(Array.isArray(data.breakTimes)).toBe(true);
          expect(data.scheduleTimes.length).toBe(1);
          expect(data.breakTimes.length).toBe(1);
        },
      },
      {
        name: 'should return 500 on error',
        setup: () => {
          vi.mocked(prisma.schedule.findFirst).mockRejectedValue(new Error('DB error'));
        },
        request: () => new Request('http://localhost/api/schedules/times', {
          method: 'POST',
          body: JSON.stringify({
            classId: '1',
            scheduleTimes: ['1'],
            breakTimes: ['1'],
          }),
        }),
        expectedStatus: 500,
        expectedData: { error: 'Failed to save times' },
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