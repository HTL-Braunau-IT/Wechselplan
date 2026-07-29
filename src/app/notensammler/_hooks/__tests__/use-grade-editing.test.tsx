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
   * The batch endpoints reject an oversized request outright, and their limits
   * differ: MAX_GRADES_BATCH is 400, MAX_FINAL_GRADES_BATCH only 100. Sending
   * a whole class in one request failed the entire save with "Too many …"
   * rather than persisting anything, so both are chunked — and the final-grade
   * chunk has to respect the smaller ceiling.
   */
  it('chunks each batch under its own endpoint limit', async () => {
    // 250 students × 1 teacher × 2 semesters = 500 grade rows; the same
    // students each carry an Endnote per semester, so 500 final-grade rows.
    const grades = Object.fromEntries(
      Array.from({ length: 250 }, (_, i) => [i + 1, { 100: { first: 2, second: 3 } }]),
    )
    const finalGrades = Object.fromEntries(
      Array.from({ length: 250 }, (_, i) => [
        i + 1,
        { first: 2, second: 3, conductWishFirst: null, conductWishSecond: null },
      ]),
    )

    const { result } = setup({ grades, finalGrades })

    await act(async () => {
      await result.current.saveAllGrades()
    })

    const gradeBodies = bodiesFor('/api/notensammler/grades/batch')
    expect(gradeBodies.length).toBeGreaterThan(1)
    expect(gradeBodies.every(body => (body.grades ?? []).length <= 400)).toBe(true)
    expect(gradeBodies.reduce((sum, body) => sum + (body.grades ?? []).length, 0)).toBe(500)

    const finalBodies = bodiesFor('/api/notensammler/final-grades/batch')
    expect(finalBodies.length).toBeGreaterThan(1)
    expect(finalBodies.every(body => (body.finalGrades ?? []).length <= 100)).toBe(true)
    expect(finalBodies.reduce((sum, body) => sum + (body.finalGrades ?? []).length, 0)).toBe(500)
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
