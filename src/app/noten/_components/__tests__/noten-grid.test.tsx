// @vitest-environment jsdom
import { createRef } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { NotenGrid, type NotenGridProps } from '../noten-grid'
import type { Student, TeachingDay } from '../../_lib/types'

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, options?: { defaultValue?: string }) => options?.defaultValue ?? key,
  }),
}))

// The real one reaches for the entitlements context and an image endpoint.
vi.mock('@/components/student-photo', () => ({
  StudentPhoto: ({ lastName, firstName }: { lastName: string; firstName: string }) => (
    <span>{`${lastName}, ${firstName}`}</span>
  ),
}))

const STUDENTS: Student[] = [{ id: 10, firstName: 'Anna', lastName: 'Bauer', groupId: 1 }]

/**
 * Every open day renders nine Radix selects per student, so the fixture is kept
 * to one student and the budget raised — under a loaded suite the default 5s
 * is not enough to mount them.
 */
const RENDER_TIMEOUT_MS = 20_000

const DAYS: TeachingDay[] = [
  { date: '2025-09-15', period: 'AM' },
  { date: '2025-09-22', period: 'AM' },
]

const renderGrid = (overrides: Partial<NotenGridProps> = {}) =>
  render(
    <NotenGrid
      teachingDays={DAYS}
      students={STUDENTS}
      entries={{}}
      lehrstoffByDay={{}}
      finalGrades={{}}
      summary={{}}
      collapsedDays={new Set()}
      rowGradeVisibility={{}}
      highlightedStudentId={null}
      focusDateYmd={null}
      todayYmd="2025-09-15"
      semesterChangeDate="2026-02-15"
      saving={false}
      sitzplatzLeft="200px"
      nameColumnRef={createRef<HTMLTableCellElement>()}
      registerDayColumn={() => () => undefined}
      studentRowRefs={{ current: {} }}
      onToggleDay={vi.fn()}
      onToggleRowVisible={vi.fn()}
      onSetAllAnwesend={vi.fn()}
      onEntryChange={vi.fn()}
      onSitzplatzChange={vi.fn()}
      onFinalGradeChange={vi.fn()}
      onFinalGradeCommit={vi.fn()}
      onOpenNotizen={vi.fn()}
      onOpenLehrstoff={vi.fn()}
      {...overrides}
    />,
  )

describe('NotenGrid', () => {
  /**
   * The column headings were set in `writing-mode: vertical-rl`, costing 96px
   * of header height on every screen. They are abbreviations now, and the full
   * label has to survive somewhere the reader can still reach it.
   */
  it('labels day columns with an abbreviation that carries its full name', () => {
    renderGrid()

    const heads = screen.getAllByRole('columnheader', { name: 'Wdh.' })
    expect(heads).toHaveLength(DAYS.length)
    // The stub returns the key for entries that have no inline default, so the
    // assertion is on which label the title resolves from, not on its wording.
    expect(heads[0]?.getAttribute('title')?.toLowerCase()).toContain('wiederholung')
    for (const head of heads) {
      expect(head.className).not.toContain('writing-mode')
    }
  }, RENDER_TIMEOUT_MS)

  /** The semester marker is only drawn where the semester actually changes. */
  it('marks the semester once, not on every day column', () => {
    renderGrid()
    expect(screen.getAllByText('1. Sem.')).toHaveLength(1)
  }, RENDER_TIMEOUT_MS)

  it('collapses a day to a single column instead of its six', () => {
    const { container } = renderGrid({ collapsedDays: new Set(['2025-09-15-AM']) })

    const bodyRows = container.querySelectorAll('tbody tr')
    const firstStudentCells = bodyRows[0]?.querySelectorAll('td') ?? []
    // name + Sitzplatz + 1 collapsed day + 6 for the open day + 9 summary
    expect(firstStudentCells).toHaveLength(2 + 1 + 6 + 9)
    // The collapsed column stays clickable, or there is no way back.
    expect(screen.getAllByRole('button', { name: /Tag aufklappen/ })).toHaveLength(1)
  }, RENDER_TIMEOUT_MS)

  /**
   * Hiding a row's grades is a per-student toggle used in front of a class. It
   * used to need a frozen column of its own in front of the names.
   */
  it('offers the row visibility toggle inside the name cell', () => {
    const onToggleRowVisible = vi.fn()
    const { container } = renderGrid({ onToggleRowVisible })

    const nameCell = container.querySelector('tbody tr td')
    const toggle = screen.getByRole('button', {
      name: /Noten dieser Zeile ausblenden.*Bauer/,
    })
    expect(nameCell?.contains(toggle)).toBe(true)

    toggle.click()
    expect(onToggleRowVisible).toHaveBeenCalledWith(10, false)
  }, RENDER_TIMEOUT_MS)
})
