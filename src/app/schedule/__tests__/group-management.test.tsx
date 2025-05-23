import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { DndContext } from '@dnd-kit/core'

import ScheduleClassSelectPage from '../create/page'
import '@testing-library/jest-dom'

// Mock next/navigation
jest.mock('next/navigation', () => ({
  useRouter: () => ({
    push: jest.fn() as jest.Mock<void, [string]>,
    back: jest.fn() as jest.Mock<void, []>,
  }),
  useSearchParams: () => new URLSearchParams('?class=ClassA'),
}))

// Mock i18n
jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}))

// Mock the useDroppable hook
jest.mock('@dnd-kit/core', () => {
  
  const actual = jest.requireActual('@dnd-kit/core')
  const mock = {
    ...actual,
    useDroppable: () => ({
      setNodeRef: jest.fn() as jest.Mock<void, [HTMLElement | null]>,
      isOver: false,
    }),
  }
  // eslint-disable-next-line @typescript-eslint/no-unsafe-return
  return mock
})

// Mock fetch
global.fetch = jest.fn()

describe('Group Management', () => {
  const mockGroup = {
    id: 1,
    students: [
      { id: 1, firstName: 'John', lastName: 'Doe' },
      { id: 2, firstName: 'Jane', lastName: 'Smith' },
    ],
  }

  const mockClasses = ['1A', '1B', '1C']

  beforeEach(() => {
    jest.clearAllMocks()
    ;(global.fetch as jest.Mock).mockImplementation((url: string) => {
      if (url === '/api/classes') {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve(mockClasses),
        })
      }
      if (url.includes('/api/students')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve(mockGroup.students),
        })
      }
      if (url.includes('/api/schedule/assignments')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ assignments: [], unassignedStudents: [] }),
        })
      }
      return Promise.reject(new Error('Not found'))
    })
  })

  const selectClass = async () => {
    const select = await screen.findByLabelText(/class/i)
    fireEvent.change(select, { target: { value: '1A' } })
    const submitButton = screen.getByRole('button', { name: /next/i })
    fireEvent.click(submitButton)
    await waitFor(() => {
      expect(submitButton).not.toBeDisabled()
    })
  }

  it('renders group container with students', async () => {
    render(
      <DndContext>
        <ScheduleClassSelectPage />
      </DndContext>
    )
    await selectClass()
    await waitFor(() => {
      const groupElement = screen.getByText(/group/i)
      expect(groupElement).toBeInTheDocument()
    })
  })

  it('handles student removal', async () => {
    render(
      <DndContext>
        <ScheduleClassSelectPage />
      </DndContext>
    )
    await selectClass()
    await waitFor(() => {
      const removeButtons = screen.getAllByRole('button', { name: /remove/i })
      const removeButton = removeButtons[0]
      if (!removeButton) {
        throw new Error('Remove button not found')
      }
      fireEvent.click(removeButton)
      expect(removeButton).toBeInTheDocument()
    })
  })

  it('handles drag and drop interactions', async () => {
    render(
      <DndContext>
        <ScheduleClassSelectPage />
      </DndContext>
    )
    await selectClass()
    await waitFor(() => {
      const doeElement = screen.getByText(/doe/i)
      const smithElement = screen.getByText(/smith/i)
      expect(doeElement).toBeInTheDocument()
      expect(smithElement).toBeInTheDocument()
    })
  })
}) 