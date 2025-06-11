import { describe, test, expect, vi, beforeEach, afterAll } from 'vitest';
import { GET, POST } from '../route';
import { prisma } from '@/lib/prisma';
import { captureError } from '@/lib/sentry';


vi.mock('@/lib/prisma', () => ({
  prisma: {
    breakTime: {
      findMany: vi.fn(),
      create: vi.fn(),
    },
  },
}));
vi.mock('@/lib/sentry', () => ({ captureError: vi.fn() }));

interface BreakTime {
  id: number;
  name: string;
  startTime: string;
  endTime: string;
  period: 'AM' | 'PM';
  createdAt: Date;
  updatedAt: Date;
}

describe('Break Times API', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });



  describe('GET', () => {
    const testCases = [
      {
        name: 'should return 200 with break times if found',
        setup: () => {
          const mockBreakTimes: BreakTime[] = [
            {
              id: 1,
              name: 'Morning Break',
              startTime: '09:00',
              endTime: '09:15',
              period: 'AM',
              createdAt: new Date(),
              updatedAt: new Date(),
            },
          ];
          vi.mocked(prisma.breakTime.findMany).mockResolvedValue(mockBreakTimes);
        },
        expectedStatus: 200,
        expectedData: (data: BreakTime[]) => {
          expect(Array.isArray(data)).toBe(true);
          expect(data.length).toBe(1);
          expect(data[0]).toHaveProperty('name', 'Morning Break');
          expect(data[0]).toHaveProperty('startTime', '09:00');
          expect(data[0]).toHaveProperty('endTime', '09:15');
        },
      },
      {
        name: 'should return 500 on error',
        setup: () => {
          vi.mocked(prisma.breakTime.findMany).mockRejectedValue(new Error('DB error'));
        },
        expectedStatus: 500,
        expectedData: { error: 'Failed to fetch break times' },
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
        request: () => new Request('http://localhost/api/settings/break-times', {
          method: 'POST',
          body: JSON.stringify({
            name: 'Morning Break',
            startTime: '09:00',
            // endTime missing
            period: 'AM',
          }),
        }),
        expectedStatus: 400,
        expectedData: { error: 'Missing required fields' },
      },
      {
        name: 'should return 400 if period is invalid',
        setup: () => {},
        request: () => new Request('http://localhost/api/settings/break-times', {
          method: 'POST',
          body: JSON.stringify({
            name: 'Morning Break',
            startTime: '09:00',
            endTime: '09:15',
            period: 'INVALID',
          }),
        }),
        expectedStatus: 400,
        expectedData: { error: 'Invalid period. Must be AM or PM' },
      },
      {
        name: 'should return 400 if time format is invalid',
        setup: () => {},
        request: () => new Request('http://localhost/api/settings/break-times', {
          method: 'POST',
          body: JSON.stringify({
            name: 'Morning Break',
            startTime: '25:00',
            endTime: '09:15',
            period: 'AM',
          }),
        }),
        expectedStatus: 400,
        expectedData: { error: 'Invalid time format. Use HH:mm' },
      },
      {
        name: 'should return 200 with created break time if successful',
        setup: () => {
          const mockBreakTime: BreakTime = {
            id: 1,
            name: 'Morning Break',
            startTime: '09:00',
            endTime: '09:15',
            period: 'AM',
            createdAt: new Date(),
            updatedAt: new Date(),
          };
          vi.mocked(prisma.breakTime.create).mockResolvedValue(mockBreakTime);
        },
        request: () => new Request('http://localhost/api/settings/break-times', {
          method: 'POST',
          body: JSON.stringify({
            name: 'Morning Break',
            startTime: '09:00',
            endTime: '09:15',
            period: 'AM',
          }),
        }),
        expectedStatus: 200,
        expectedData: (data: BreakTime) => {
          expect(data).toHaveProperty('name', 'Morning Break');
          expect(data).toHaveProperty('startTime', '09:00');
          expect(data).toHaveProperty('endTime', '09:15');
          expect(data).toHaveProperty('period', 'AM');
        },
      },
      {
        name: 'should return 500 on error',
        setup: () => {
          vi.mocked(prisma.breakTime.create).mockRejectedValue(new Error('DB error'));
        },
        request: () => new Request('http://localhost/api/settings/break-times', {
          method: 'POST',
          body: JSON.stringify({
            name: 'Morning Break',
            startTime: '09:00',
            endTime: '09:15',
            period: 'AM',
          }),
        }),
        expectedStatus: 500,
        expectedData: { error: 'Failed to create break time' },
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