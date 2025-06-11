import { describe, test, expect, vi, beforeEach, afterAll } from 'vitest';
import { GET, POST } from '../route';
import { prisma } from '@/lib/prisma';
import { captureError } from '@/lib/sentry';


vi.mock('@/lib/prisma', () => ({
  prisma: {
    scheduleTime: {
      findMany: vi.fn(),
      create: vi.fn(),
    },
  },
}));
vi.mock('@/lib/sentry', () => ({ captureError: vi.fn() }));

interface ScheduleTime {
  id: number;
  startTime: string;
  endTime: string;
  hours: number;
  period: 'AM' | 'PM';
  createdAt: Date;
  updatedAt: Date;
}

describe('Schedule Times API', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });


  describe('GET', () => {
    const testCases = [
      {
        name: 'should return 200 with schedule times if found',
        setup: () => {
          const mockScheduleTimes: ScheduleTime[] = [
            {
              id: 1,
              startTime: '08:00',
              endTime: '09:00',
              hours: 1,
              period: 'AM',
              createdAt: new Date(),
              updatedAt: new Date(),
            },
          ];
          vi.mocked(prisma.scheduleTime.findMany).mockResolvedValue(mockScheduleTimes);
        },
        expectedStatus: 200,
        expectedData: (data: ScheduleTime[]) => {
          expect(Array.isArray(data)).toBe(true);
          expect(data.length).toBe(1);
          expect(data[0]).toHaveProperty('startTime', '08:00');
          expect(data[0]).toHaveProperty('endTime', '09:00');
        },
      },
      {
        name: 'should return 500 on error',
        setup: () => {
          vi.mocked(prisma.scheduleTime.findMany).mockRejectedValue(new Error('DB error'));
        },
        expectedStatus: 500,
        expectedData: { error: 'Failed to fetch schedule times' },
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
        name: 'should return 400 if hours is not a positive number',
        setup: () => {},
        request: () => new Request('http://localhost/api/settings/schedule-times', {
          method: 'POST',
          body: JSON.stringify({
            startTime: '08:00',
            endTime: '09:00',
            period: 'AM',
            hours: -1,
          }),
        }),
        expectedStatus: 400,
        expectedData: { error: 'Hours must be a positive number' },
      },
      {
        name: 'should return 400 if period is invalid',
        setup: () => {},
        request: () => new Request('http://localhost/api/settings/schedule-times', {
          method: 'POST',
          body: JSON.stringify({
            startTime: '08:00',
            endTime: '09:00',
            period: 'INVALID',
            hours: 1,
          }),
        }),
        expectedStatus: 400,
        expectedData: { error: 'Invalid period. Must be AM or PM' },
      },
      {
        name: 'should return 400 if time format is invalid',
        setup: () => {},
        request: () => new Request('http://localhost/api/settings/schedule-times', {
          method: 'POST',
          body: JSON.stringify({
            startTime: '25:00',
            endTime: '09:00',
            period: 'AM',
            hours: 1,
          }),
        }),
        expectedStatus: 400,
        expectedData: { error: 'Invalid time format. Use HH:mm' },
      },
      {
        name: 'should return 200 with created schedule time if successful',
        setup: () => {
          const mockScheduleTime: ScheduleTime = {
            id: 1,
            startTime: '08:00',
            endTime: '09:00',
            hours: 1,
            period: 'AM',
            createdAt: new Date(),
            updatedAt: new Date(),
          };
          vi.mocked(prisma.scheduleTime.create).mockResolvedValue(mockScheduleTime);
        },
        request: () => new Request('http://localhost/api/settings/schedule-times', {
          method: 'POST',
          body: JSON.stringify({
            startTime: '08:00',
            endTime: '09:00',
            period: 'AM',
            hours: 1,
          }),
        }),
        expectedStatus: 200,
        expectedData: (data: ScheduleTime) => {
          expect(data).toHaveProperty('startTime', '08:00');
          expect(data).toHaveProperty('endTime', '09:00');
          expect(data).toHaveProperty('hours', 1);
          expect(data).toHaveProperty('period', 'AM');
        },
      },
      {
        name: 'should return 500 on error',
        setup: () => {
          vi.mocked(prisma.scheduleTime.create).mockRejectedValue(new Error('DB error'));
        },
        request: () => new Request('http://localhost/api/settings/schedule-times', {
          method: 'POST',
          body: JSON.stringify({
            startTime: '08:00',
            endTime: '09:00',
            period: 'AM',
            hours: 1,
          }),
        }),
        expectedStatus: 500,
        expectedData: { error: 'Failed to create schedule time' },
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