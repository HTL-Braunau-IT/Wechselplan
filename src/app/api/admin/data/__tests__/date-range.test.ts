import { beforeEach, describe, expect, it, vi } from 'vitest'
import { prisma } from '@/lib/prisma'
import { POST, PUT } from '../route'

vi.mock('@/lib/prisma', () => ({
  ANY_ACTIVE_STATE: {},
  prisma: {
    schoolHoliday: { findUnique: vi.fn(), create: vi.fn(), update: vi.fn() },
    schoolYear: { findUnique: vi.fn(), create: vi.fn(), update: vi.fn() },
  },
}))
vi.mock('@/lib/sentry', () => ({ captureError: vi.fn() }))

const send = (method: 'POST' | 'PUT', query: string, body: unknown) =>
  new Request(`http://localhost/api/admin/data?${query}`, {
    method,
    body: JSON.stringify(body),
  })

describe('/api/admin/data date ranges', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('rejects a holiday whose end precedes its start, without writing', async () => {
    const res = await POST(
      send('POST', 'model=schoolHoliday', {
        name: 'Weihnachten',
        startDate: '2026-12-24',
        endDate: '2026-12-06',
      }),
    )
    expect(res.status).toBe(400)
    expect((await res.json()).error).toMatch(/vor ihrem Beginn/)
    expect(prisma.schoolHoliday.create).not.toHaveBeenCalled()
  })

  it('accepts a single-day holiday', async () => {
    vi.mocked(prisma.schoolHoliday.create).mockResolvedValue({ id: 1 } as never)
    const res = await POST(
      send('POST', 'model=schoolHoliday', {
        name: 'Zwickeltag',
        startDate: '2027-05-07',
        endDate: '2027-05-07',
      }),
    )
    expect(res.status).toBe(200)
  })

  it('checks a partial update against the stored row', async () => {
    vi.mocked(prisma.schoolHoliday.findUnique).mockResolvedValue({
      id: 13,
      name: 'Weihnachten',
      startDate: new Date('2026-12-24'),
      endDate: new Date('2027-01-06'),
    } as never)
    const res = await PUT(send('PUT', 'model=schoolHoliday&id=13', { endDate: '2026-12-06' }))
    expect(res.status).toBe(400)
    expect(prisma.schoolHoliday.update).not.toHaveBeenCalled()
  })

  it('rejects a school year with the semester change outside it', async () => {
    const res = await POST(
      send('POST', 'model=schoolYear', {
        label: '2026/2027',
        startDate: '2026-09-14',
        endDate: '2027-07-09',
        semesterChangeDate: '2027-09-01',
      }),
    )
    expect(res.status).toBe(400)
    expect(prisma.schoolYear.create).not.toHaveBeenCalled()
  })
})
