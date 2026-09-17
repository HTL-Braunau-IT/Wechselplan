// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { EntryRoster, type EntryRosterProps } from '../entry-roster'
import type { ClassData } from '../../_lib/types'

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (_key: string, fallback?: string) => fallback ?? _key }),
}))

// The real one reaches for the entitlements context and an image endpoint.
vi.mock('@/components/student-photo', () => ({
  StudentPhoto: ({ lastName, firstName }: { lastName: string; firstName: string }) => (
    <span>{`${lastName}, ${firstName}`}</span>
  ),
}))

const classData: ClassData = {
  id: 1,
  name: '2AHELS',
  description: null,
  subjectName: 'PBE_4',
  students: [],
  amTeachers: [
    { id: 100, firstName: 'Eva', lastName: 'Huber' },
    { id: 101, firstName: 'Leo', lastName: 'Gruber' },
  ],
  pmTeachers: [],
}

const students = [
  { id: 10, firstName: 'Anna', lastName: 'Bauer', groupId: 1 },
  { id: 11, firstName: 'Ben', lastName: 'Cerny', groupId: 2 },
  { id: 12, firstName: 'Cara', lastName: 'Distel', groupId: 1 },
]

// My mark (teacher 100) present only for Cerny; colleague 101 has a mark for Bauer.
const myMarks: Record<number, number | null> = { 10: null, 11: 2, 12: null }
const colleagueMarks: Record<number, number | null> = { 10: 3, 11: 4, 12: null }

const renderRoster = (overrides: Partial<EntryRosterProps> = {}) =>
  render(
    <EntryRoster
      classData={classData}
      students={students}
      finalGrades={{}}
      suggestions={{ 10: { first: 2.5, second: null }, 12: { first: 3, second: null } }}
      myTeacherId={100}
      currentTeacherTeachesClass
      currentSemester="first"
      semesterView="first"
      tablePeriod={undefined}
      getGrade={(studentId, teacherId) =>
        teacherId === 100 ? myMarks[studentId] ?? null : colleagueMarks[studentId] ?? null
      }
      getFinalGradeDisplay={() => null}
      calculateAverage={() => 2}
      onGradeChange={vi.fn()}
      onFinalGradeChange={vi.fn()}
      onConductWishChange={vi.fn()}
      {...overrides}
    />,
  )

const focusedRow = () => screen.getByText('Bauer, Anna').closest<HTMLElement>('[tabindex]')!

describe('EntryRoster', () => {
  beforeEach(() => vi.clearAllMocks())

  it('splits students into Offen and Erledigt by the signed-in teacher’s mark', () => {
    renderRoster()
    // Bauer + Distel are still open, Cerny is done.
    expect(screen.getByText(/Offen · 2/)).toBeInTheDocument()
    expect(screen.getByText(/Erledigt · 1/)).toBeInTheDocument()
  })

  it('offers the Notenliste suggestion on an open row and applies it on click', () => {
    const onGradeChange = vi.fn()
    renderRoster({ onGradeChange })
    // The non-focused open row (Distel) shows the "übernehmen" affordance.
    const apply = screen.getByText('übernehmen')
    fireEvent.click(apply)
    // Distel's suggestion is 3.
    expect(onGradeChange).toHaveBeenCalledWith(12, 100, 'first', '3')
  })

  it('shows the grade palette and colleague marks on the focused row', () => {
    renderRoster()
    // The first open row is focused: its column labels and 1–5 buttons render.
    expect(screen.getByText('Kollegen')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '1', pressed: false })).toBeInTheDocument()
  })

  it('takes a 1–5 keystroke on the focused row as the mark', () => {
    const onGradeChange = vi.fn()
    renderRoster({ onGradeChange })
    fireEvent.keyDown(focusedRow(), { key: '2' })
    expect(onGradeChange).toHaveBeenCalledWith(10, 100, 'first', '2')
  })

  it('does not enter grades when the teacher does not teach the class', () => {
    renderRoster({ currentTeacherTeachesClass: false })
    // No open section, no keyboard entry — everyone reads as done/display.
    expect(screen.queryByText(/^Offen/)).not.toBeInTheDocument()
    expect(screen.getByText(/Erledigt · 3/)).toBeInTheDocument()
  })
})
