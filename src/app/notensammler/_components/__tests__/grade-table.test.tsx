// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { GradeTable, type GradeTableProps } from '../grade-table'
import type { ClassData, SemesterView } from '../../_lib/types'

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
  name: '1AHELS',
  description: null,
  students: [
    { id: 10, firstName: 'Anna', lastName: 'Bauer', groupId: 1 },
    { id: 11, firstName: 'Ben', lastName: 'Cerny', groupId: 2 },
  ],
  amTeachers: [{ id: 100, firstName: 'Eva', lastName: 'Huber' }],
  pmTeachers: [],
}

const renderTable = (semesterView: SemesterView, overrides: Partial<GradeTableProps> = {}) =>
  render(
    <GradeTable
      classData={classData}
      students={classData.students}
      finalGrades={{}}
      currentTeacherId={100}
      currentTeacherTeachesClass
      currentSemester="first"
      semesterView={semesterView}
      tablePeriod={undefined}
      getGrade={() => null}
      getFinalGradeDisplay={() => null}
      calculateAverage={() => null}
      hasMissingInCurrentSemester={() => false}
      onGradeChange={vi.fn()}
      onFinalGradeChange={vi.fn()}
      onConductWishChange={vi.fn()}
      onDeleteTeacher={vi.fn()}
      {...overrides}
    />,
  )

describe('GradeTable', () => {
  /**
   * Hiding a semester used to hide only its teacher columns: its Durchschnitt,
   * Endnote and Betragensnote stayed on screen, so "1. Semester ausblenden"
   * left three of its columns behind.
   */
  it('hides a semester summary columns along with its teacher columns', () => {
    const { unmount } = renderTable('first')
    expect(screen.getAllByText('Endnote')).toHaveLength(1)
    expect(screen.getAllByText('Betragen')).toHaveLength(1)
    expect(screen.getAllByText('Ø')).toHaveLength(1)
    unmount()

    renderTable('both')
    expect(screen.getAllByText('Endnote')).toHaveLength(2)
    expect(screen.getAllByText('Betragen')).toHaveLength(2)
    expect(screen.getAllByText('Ø')).toHaveLength(2)
  })

  it('renders one teacher grade field per student per visible semester', () => {
    // aria-label is "<student> — <teacher lastname>", so this counts the
    // teacher columns without picking up the Endnote and Betragen controls.
    const teacherFields = () => screen.queryAllByRole('combobox', { name: /— Huber$/ }).length

    const { unmount } = renderTable('second')
    expect(teacherFields()).toBe(2)
    unmount()

    renderTable('both')
    expect(teacherFields()).toBe(4)
  })

  it('keeps the header and the identity columns pinned', () => {
    renderTable('first')

    const studentHeader = screen.getByText('Schüler').closest('th')
    expect(studentHeader).not.toBeNull()
    expect(studentHeader).toHaveClass('sticky')
    expect(studentHeader).toHaveStyle({ top: '0px', left: '80px' })
  })

  it('numbers the rows sequentially next to each student', () => {
    renderTable('first')

    const rows = screen.getAllByRole('row')
    // Two header rows, then one row per student.
    const bodyRows = rows.slice(2)
    expect(bodyRows).toHaveLength(2)
    expect(bodyRows[0]).toHaveTextContent('Bauer, Anna')
    expect(bodyRows[0]?.querySelector('td')).toHaveTextContent('1')
    expect(bodyRows[1]).toHaveTextContent('Cerny, Ben')
    expect(bodyRows[1]?.querySelector('td')).toHaveTextContent('2')
  })
})
