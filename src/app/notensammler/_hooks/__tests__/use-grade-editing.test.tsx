// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { act, renderHook } from '@testing-library/react'
import { useGradeEditing } from '../use-grade-editing'
import type { ClassData } from '../../_lib/types'

vi.mock('@/lib/frontend-error', () => ({ captureFrontendError: vi.fn() }))

const classData: ClassData = {
  id: 1,
  name: '1AHELS',
  description: null,
  students: [],
  amTeachers: [{ id: 100, firstName: 'Eva', lastName: 'Huber' }],
  pmTeachers: [],
}

type Body = { grades?: unknown[]; finalGrades?: unknown[] }

const bodiesFor = (url: string) =>
  vi
    .mocked(fetch)
    .mock.calls.filter(call => String(call[0]) === url)
    .map(call => JSON.parse(String((call[1] as RequestInit).body)) as Body)

type Params = Parameters<typeof useGradeEditing>[0]

const setup = (overrides: Partial<Params>) =>
  renderHook(() =>
    useGradeEditing({
      classData,
      schoolYearId: 3,
      grades: {},
      setGrades: vi.fn(),
      finalGrades: {},
      setFinalGrades: vi.fn(),
      setError: vi.fn(),
      setNotice: vi.fn(),
      refreshTeacherClasses: vi.fn(async () => undefined),
      ...overrides,
    }),
  )

describe('useGradeEditing — saveAllGrades', () => {
  beforeEach(() => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(JSON.stringify({ success: true }), { status: 200 })),
    )
  })

  /**
   * The final-grade payload used to be built by walking `grades` only, so a
   * student who had a Betragensnote wish but no teacher mark yet was dropped
   * from "Alle speichern" entirely — their wish silently never reached the
   * server.
   */
  it('saves a student who has only a Betragensnote wish', async () => {
    const { result } = setup({
      grades: {},
      finalGrades: {
        42: {
          first: null,
          second: null,
          conductWishFirst: 'Sehr zufriedenstellend',
          conductWishSecond: null,
        },
      },
    })

    await act(async () => {
      await result.current.saveAllGrades()
    })

    const [body] = bodiesFor('/api/notensammler/final-grades/batch')
    expect(body?.finalGrades).toEqual([
      {
        studentId: 42,
        semester: 'first',
        grade: null,
        conductNoteWish: 'Sehr zufriedenstellend',
      },
    ])
  })

  /**
   * Both batch endpoints reject more than 400 rows. A class of five groups
   * with several teachers exceeds that, and the whole save failed with "Too
   * many grades" rather than persisting anything.
   */
  it('splits an oversized batch instead of failing it', async () => {
    // 250 students × 1 teacher × 2 semesters = 500 rows, past the 400 ceiling.
    const grades = Object.fromEntries(
      Array.from({ length: 250 }, (_, i) => [i + 1, { 100: { first: 2, second: 3 } }]),
    )

    const { result } = setup({ grades })

    await act(async () => {
      await result.current.saveAllGrades()
    })

    const bodies = bodiesFor('/api/notensammler/grades/batch')
    expect(bodies.length).toBeGreaterThan(1)
    expect(bodies.every(body => (body.grades ?? []).length <= 400)).toBe(true)
    expect(bodies.reduce((sum, body) => sum + (body.grades ?? []).length, 0)).toBe(500)
  })

  it('reports Sokrates-locked rows as a notice, not as an error', async () => {
    vi.mocked(fetch).mockResolvedValue(
      new Response(JSON.stringify({ success: true, skippedLocked: 4 }), { status: 200 }),
    )
    const setError = vi.fn()
    const setNotice = vi.fn()

    const { result } = setup({
      grades: { 1: { 100: { first: 2, second: null } } },
      setError,
      setNotice,
    })

    await act(async () => {
      await result.current.saveAllGrades()
    })

    expect(setNotice).toHaveBeenCalledWith(expect.stringContaining('4'))
    expect(setError).not.toHaveBeenCalledWith(expect.stringContaining('4'))
  })
})
