// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { act, renderHook, waitFor } from '@testing-library/react'
import { useNotenData } from '../use-noten-data'
import { emptyEntry, type NotenEntryRow, type Student, type TeachingDay } from '../../_lib/types'

vi.mock('@/lib/frontend-error', () => ({ captureFrontendError: vi.fn() }))
vi.mock('@/contexts/entitlements-context', () => ({
  useEntitlements: () => ({ isFeatureEnabled: () => false }),
}))

const STUDENTS: Student[] = Array.from({ length: 12 }, (_, i) => ({
  id: i + 1,
  firstName: `S${i + 1}`,
  lastName: 'Test',
  groupId: 1,
}))

/** A term's worth of teaching days, all in the past. */
const TEACHING_DAYS: TeachingDay[] = Array.from({ length: 40 }, (_, i) => ({
  date: `2025-1${i % 2}-${String((i % 28) + 1).padStart(2, '0')}`,
  period: 'AM',
}))

type Body = { entries?: NotenEntryRow[] }

const entryBodies = () =>
  vi
    .mocked(fetch)
    .mock.calls.filter(call => String(call[0]) === '/api/noten/entries')
    .map(call => JSON.parse(String((call[1] as RequestInit).body)) as Body)

function mockLoad(ok = true) {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: RequestInfo | URL) => {
      const href = String(url)
      if (!ok) return new Response('{}', { status: 500 })
      if (href.startsWith('/api/noten/teaching-days')) {
        return new Response(JSON.stringify({ teachingDays: TEACHING_DAYS }), { status: 200 })
      }
      if (href.startsWith('/api/noten/students')) {
        return new Response(JSON.stringify({ students: STUDENTS }), { status: 200 })
      }
      if (href.startsWith('/api/noten/data')) {
        return new Response(
          JSON.stringify({ weightConfig: null, lehrstoffByDay: {}, entries: [] }),
          { status: 200 },
        )
      }
      return new Response(JSON.stringify({ success: true }), { status: 200 })
    }),
  )
}

const setup = () => renderHook(() => useNotenData({ classId: 1, groupId: 2, schoolYearId: 3 }))

describe('useNotenData', () => {
  beforeEach(() => {
    mockLoad()
  })

  /**
   * "Speichern" used to post one row per student *per teaching day* — the full
   * cartesian product, blank cells included — into a handler that upserts
   * sequentially. Twelve students across a term is 480 writes per click, almost
   * all of them creating empty rows.
   */
  it('sends only outstanding entries, not every student × day', async () => {
    const { result } = setup()
    await waitFor(() => expect(result.current.students).toHaveLength(12))

    const entry = emptyEntry(1, TEACHING_DAYS[0]!.date, 'AM')
    await act(async () => {
      result.current.updateEntry(1, entry.date, 'AM', { attendance: 'Anwesend' })
    })
    vi.mocked(fetch).mockClear()

    await act(async () => {
      await result.current.saveAll()
    })

    const bodies = entryBodies()
    const rows = bodies.flatMap(body => body.entries ?? [])
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({ studentId: 1, attendance: 'Anwesend' })
  })

  it('chunks a large save so one request cannot carry the whole term', async () => {
    const { result } = setup()
    await waitFor(() => expect(result.current.students).toHaveLength(12))

    await act(async () => {
      for (const student of STUDENTS) {
        for (const day of TEACHING_DAYS.slice(0, 20)) {
          result.current.updateEntry(student.id, day.date, day.period, { attendance: 'Anwesend' })
        }
      }
    })
    vi.mocked(fetch).mockClear()

    await act(async () => {
      await result.current.saveAll()
    })

    const bodies = entryBodies()
    expect(bodies.length).toBeGreaterThan(1)
    expect(bodies.every(body => (body.entries ?? []).length <= 100)).toBe(true)
  })

  /**
   * Grade saves were fired as bare `void` promises whose rejection nobody
   * handled, so a failed write left the mark on screen looking entered.
   */
  it('surfaces a failed entry save instead of dropping it silently', async () => {
    const { result } = setup()
    await waitFor(() => expect(result.current.students).toHaveLength(12))

    vi.mocked(fetch).mockResolvedValue(new Response('{}', { status: 500 }))
    const entry = emptyEntry(1, TEACHING_DAYS[0]!.date, 'AM')

    await act(async () => {
      await result.current.saveEntries([{ ...entry, attendance: 'Anwesend' }])
    })

    expect(result.current.saveState).toBe('error')
    expect(result.current.saveError).toBeTruthy()
  })

  /** A failed autosave has to stay retryable, which is what dirty tracking is for. */
  it('keeps a failed entry outstanding so the save button retries it', async () => {
    const { result } = setup()
    await waitFor(() => expect(result.current.students).toHaveLength(12))

    const entry = emptyEntry(7, TEACHING_DAYS[0]!.date, 'AM')
    vi.mocked(fetch).mockResolvedValue(new Response('{}', { status: 500 }))
    await act(async () => {
      result.current.updateEntry(7, entry.date, 'AM', { attendance: 'Krank' })
      await result.current.saveEntries([{ ...entry, attendance: 'Krank' }])
    })
    expect(result.current.hasUnsavedWork).toBe(true)

    mockLoad()
    vi.mocked(fetch).mockClear()
    await act(async () => {
      await result.current.saveAll()
    })

    const rows = entryBodies().flatMap(body => body.entries ?? [])
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({ studentId: 7, attendance: 'Krank' })
    expect(result.current.hasUnsavedWork).toBe(false)
  })

  /**
   * A failing response used to be parsed as data, so the grid rendered as a
   * group with no students rather than as an error.
   */
  it('reports a failed load rather than rendering an empty group', async () => {
    mockLoad(false)
    const { result } = setup()
    await waitFor(() => expect(result.current.loadError).toBeTruthy())
    expect(result.current.students).toHaveLength(0)
  })
})
