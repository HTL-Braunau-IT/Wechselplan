import { describe, it, expect, vi, beforeEach } from 'vitest'
import { POST } from '../route'
import { captureError } from '@/lib/sentry'
import { pdf } from '@react-pdf/renderer'
import ScheduleTurnusPDF from '@/components/ScheduleTurnusPDF'

// Create hoisted mock functions
const mockFindUnique = vi.hoisted(() => vi.fn())
const mockFindFirst = vi.hoisted(() => vi.fn())
const mockSchoolYearFindFirst = vi.hoisted(() => vi.fn())

// Mock dependencies
vi.mock('@/lib/sentry', () => ({
  captureError: vi.fn(),
}))

// This suite mocks the document component too, so the renderer never runs for
// real. `Font` still has to exist: renderPdfToBuffer registers IBM Plex Sans
// before rendering, and a bare `{ pdf }` mock makes that throw.
vi.mock('@react-pdf/renderer', () => ({
  pdf: vi.fn().mockReturnValue({
    toBuffer: vi.fn().mockResolvedValue(Buffer.from('mock-pdf-content')),
  }),
  Font: { register: vi.fn() },
}))

vi.mock('@/components/ScheduleTurnusPDF', () => ({
  default: vi.fn().mockReturnValue({}),
}))

// Mock Prisma
vi.mock('@/lib/prisma', () => ({
  prisma: {
    class: {
      findUnique: mockFindUnique,
    },
    schedule: {
      findFirst: mockFindFirst,
    },
    // The route resolves the active school year before anything else.
    schoolYear: {
      findFirst: mockSchoolYearFindFirst,
    },
  },
}))

describe('Schedule Dates Export API', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockSchoolYearFindFirst.mockResolvedValue({ id: 1 })
  })

  describe('POST /api/export/schedule-dates', () => {
    const testCases = [
      {
        name: 'should return 400 if selectedWeekday is missing',
        request: () => new Request('http://localhost/api/export/schedule-dates?className=1A'),
        expectedStatus: 400,
        expectedData: { error: 'Selected Weekday is required' },
      },
      {
        name: 'should return 400 if selectedWeekday is invalid',
        request: () =>
          new Request('http://localhost/api/export/schedule-dates?className=1A&selectedWeekday=6'),
        expectedStatus: 400,
        expectedData: { error: 'Selected Weekday is invalid' },
      },
      {
        name: 'should return 400 if className is missing',
        request: () => new Request('http://localhost/api/export/schedule-dates?selectedWeekday=1'),
        expectedStatus: 400,
        expectedData: { error: 'Class Name is required' },
      },
      {
        name: 'should return 404 if class not found',
        setup: () => {
          mockFindUnique.mockResolvedValue(null)
        },
        request: () =>
          new Request('http://localhost/api/export/schedule-dates?className=1A&selectedWeekday=1'),
        expectedStatus: 404,
        expectedData: { error: 'Class not found' },
      },
      {
        name: 'should return 404 if schedule not found',
        setup: () => {
          mockFindUnique.mockResolvedValue({ id: 1, name: '1A' })
          mockFindFirst.mockResolvedValue(null)
        },
        request: () =>
          new Request('http://localhost/api/export/schedule-dates?className=1A&selectedWeekday=1'),
        expectedStatus: 404,
        expectedData: { error: 'Schedule not found' },
      },
      {
        name: 'should return PDF file on success',
        setup: () => {
          mockFindUnique.mockResolvedValue({ id: 1, name: '1A' })
          mockFindFirst.mockResolvedValue({
            scheduleData: { turnus1: { weeks: [] } },
            additionalInfo: 'Test info',
          })
        },
        request: () =>
          new Request('http://localhost/api/export/schedule-dates?className=1A&selectedWeekday=1'),
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
          mockFindUnique.mockRejectedValue(new Error('Database error'))
        },
        request: () =>
          new Request('http://localhost/api/export/schedule-dates?className=1A&selectedWeekday=1'),
        expectedStatus: 500,
        expectedData: { error: 'Failed to generate pdf file' },
      },
    ]

    testCases.forEach(
      ({ name, setup, request, expectedStatus, expectedData, expectedHeaders, expectedBody }) => {
        it(name, async () => {
          if (setup) setup()
          const response = await POST(request())

          expect(response.status).toBe(expectedStatus)

          if (expectedHeaders) {
            Object.entries(expectedHeaders).forEach(([key, value]) => {
              expect(response.headers.get(key)).toBe(value)
            })
          }

          if (expectedBody) {
            const buffer = await response.arrayBuffer()
            expect(Buffer.from(buffer)).toEqual(expectedBody)
          } else {
            const data = await response.json()
            expect(data).toEqual(expectedData)
          }
        })
      },
    )
  })
})
