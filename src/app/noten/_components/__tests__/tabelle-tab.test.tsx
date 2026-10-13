// @vitest-environment jsdom
import { useState } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { TooltipProvider } from '@/components/ui/tooltip'
import { entryKey } from '@/lib/grades'
import { TabelleTab } from '../tabelle-tab'
import { emptyEntry, type NotenEntryRow, type Student, type TeachingDay } from '../../_lib/types'

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, opts?: string | { defaultValue?: string }) =>
      typeof opts === 'string' ? opts : (opts?.defaultValue ?? key),
  }),
}))

const students: Student[] = [
  { id: 1, firstName: 'Lukas', lastName: 'Aigner', groupId: 2 },
  { id: 2, firstName: 'Lena', lastName: 'Bauer', groupId: 2 },
]
const days: TeachingDay[] = [
  { date: '2026-09-15', period: 'AM', turn: 'TURNUS 1' },
  { date: '2026-09-15', period: 'PM', turn: 'TURNUS 1' },
  { date: '2026-11-17', period: 'AM', turn: 'TURNUS 3' },
]

/** Lena was sick on the morning of 15.09. */
const initialEntries: Record<string, NotenEntryRow> = {
  [entryKey(2, '2026-09-15', 'AM')]: {
    ...emptyEntry(2, '2026-09-15', 'AM'),
    attendance: 'Krank',
  },
}

type Mark = [number, string, string, string, number | null]

function Harness({
  onMark,
  showSecondMark = true,
}: {
  onMark: (...m: Mark) => void
  showSecondMark?: boolean
}) {
  const [entries, setEntries] = useState(initialEntries)
  return (
    <TooltipProvider>
      <TabelleTab
        teachingDays={days}
        students={students}
        entries={entries}
        hideGrades={false}
        todayYmd="2026-10-13"
        semesterChangeDate="2027-02-08"
        showSecondMark={showSecondMark}
        onShowSecondMarkChange={() => {}}
        onToggleHide={() => {}}
        onMark={(studentId, date, period, field, value) => {
          onMark(studentId, date, period, field, value)
          const key = entryKey(studentId, date, period)
          setEntries(prev => ({
            ...prev,
            [key]: { ...emptyEntry(studentId, date, period), ...prev[key], [field]: value },
          }))
        }}
      />
    </TooltipProvider>
  )
}

/** Category labels come through as their i18n keys under the mocked `t`. */
const cell = (name: string, day: string, slot: 1 | 2, category = 'noten.bericht') =>
  screen.getByRole('button', { name: `${name} · ${day} · ${category} ${slot}. Note` })

describe('TabelleTab', () => {
  it('types marks down the half-day, skipping absences, and halves with a comma', () => {
    const onMark = vi.fn()
    render(<Harness onMark={onMark} />)

    fireEvent.click(cell('Aigner, Lukas', '15.09. VM', 1))
    fireEvent.keyDown(window, { key: '2' })
    fireEvent.keyDown(window, { key: ',' })
    // Lena is away that morning, so the next mark lands on the afternoon.
    fireEvent.keyDown(window, { key: '3' })

    expect(onMark.mock.calls).toEqual([
      [1, '2026-09-15', 'AM', 'bericht1', 2],
      [1, '2026-09-15', 'AM', 'bericht1', 2.5],
      [1, '2026-09-15', 'PM', 'bericht1', 3],
    ])
    expect(cell('Aigner, Lukas', '15.09. VM', 1).textContent).toBe('2,5')
    expect(cell('Bauer, Lena', '15.09. NM', 1).getAttribute('aria-pressed')).toBe('true')
  })

  it('keeps a run of 2. Noten in the 2. Note column', () => {
    const onMark = vi.fn()
    render(<Harness onMark={onMark} />)

    fireEvent.click(cell('Aigner, Lukas', '15.09. NM', 2))
    fireEvent.keyDown(window, { key: '4' })
    fireEvent.keyDown(window, { key: '1' })

    expect(onMark.mock.calls).toEqual([
      [1, '2026-09-15', 'PM', 'bericht2', 4],
      [2, '2026-09-15', 'PM', 'bericht2', 1],
    ])
  })

  it('locks absences and half-days still ahead', () => {
    render(<Harness onMark={vi.fn()} />)
    expect(
      screen.getByRole('button', { name: /Bauer, Lena · 15\.09\. VM .* 1\. Note · Krank/ }),
    ).toBeDisabled()
    expect(cell('Aigner, Lukas', '17.11. VM', 1)).toBeDisabled()
  })

  it('writes the chosen category', () => {
    const onMark = vi.fn()
    render(<Harness onMark={onMark} showSecondMark={false} />)

    fireEvent.click(screen.getByRole('button', { name: 'noten.mitarbeitShort' }))
    fireEvent.click(cell('Aigner, Lukas', '15.09. VM', 1, 'noten.mitarbeit'))
    fireEvent.keyDown(window, { key: '1' })

    expect(onMark).toHaveBeenCalledWith(1, '2026-09-15', 'AM', 'mitarbeit1', 1)
  })
})
