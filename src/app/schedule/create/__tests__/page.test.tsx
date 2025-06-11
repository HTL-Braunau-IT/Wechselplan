import React from 'react'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import '@testing-library/jest-dom'
import ScheduleCreatePage from '../page'
import { createSchedule } from '@/lib/api'
import { useRouter } from 'next/navigation'
import dayjs from 'dayjs'

jest.mock('next/navigation', () => ({
  useRouter: jest.fn(),
}))
jest.mock('@/lib/api', () => ({
  createSchedule: jest.fn(),
}))

beforeAll(() => {
  jest.useFakeTimers()
  jest.setSystemTime(new Date('2025-01-01'))
})

afterAll(() => {
  jest.useRealTimers()
})

beforeEach(() => {
  jest.clearAllMocks()
})

/**
 * Fill out the schedule form and submit.
 */
const fillAndSubmitForm = async ({
  title = 'Team Sync',
  location = 'Zoom',
  date = new Date(Date.now() + 86400000),
  start = '10:00',
  end = '11:00',
} = {}) => {
  fireEvent.change(screen.getByLabelText(/title/i), {
    target: { value: title },
  })
  fireEvent.change(screen.getByLabelText(/location/i), {
    target: { value: location },
  })
  fireEvent.change(screen.getByLabelText(/date/i), {
    target: { value: dayjs(date).format('YYYY-MM-DD') },
  })
  // first time slot inputs
  fireEvent.change(screen.getAllByLabelText(/start time/i)[0], {
    target: { value: start },
  })
  fireEvent.change(screen.getAllByLabelText(/end time/i)[0], {
    target: { value: end },
  })
  fireEvent.click(screen.getByRole('button', { name: /submit/i }))
}

describe('ScheduleCreatePage – rendering and behaviour', () => {
  it('should render without crashing', () => {
    render(<ScheduleCreatePage />)
    expect(
      screen.getByRole('heading', { name: /create schedule/i })
    ).toBeInTheDocument()
  })

  it('should display initial input placeholders/labels', () => {
    render(<ScheduleCreatePage />)
    expect(screen.getByLabelText(/title/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/location/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/date/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/start time/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/end time/i)).toBeInTheDocument()
  })

  it('should set default form values if provided', () => {
    const defaults = {
      title: 'Daily Standup',
      location: 'Slack',
      date: new Date('2025-06-15'),
      start: '09:00',
      end: '09:30',
    }
    render(<ScheduleCreatePage initialValues={defaults} />)
    expect(screen.getByLabelText(/title/i)).toHaveValue(defaults.title)
    expect(screen.getByLabelText(/location/i)).toHaveValue(defaults.location)
    expect(screen.getByLabelText(/date/i)).toHaveValue(
      dayjs(defaults.date).format('YYYY-MM-DD')
    )
    expect(screen.getByLabelText(/start time/i)).toHaveValue(defaults.start)
    expect(screen.getByLabelText(/end time/i)).toHaveValue(defaults.end)
  })

  it('should validate required fields and show error messages on submit when fields empty', async () => {
    render(<ScheduleCreatePage />)
    fireEvent.click(screen.getByRole('button', { name: /submit/i }))
    await waitFor(() => {
      expect(screen.getByText(/title is required/i)).toBeInTheDocument()
      expect(screen.getByText(/location is required/i)).toBeInTheDocument()
      expect(screen.getByText(/date is required/i)).toBeInTheDocument()
    })
  })

  it('should call createSchedule with correct payload on successful form submission', async () => {
    const createMock = createSchedule as jest.Mock
    createMock.mockResolvedValue({ id: '123' })

    render(<ScheduleCreatePage />)
    await fillAndSubmitForm()

    await waitFor(() => {
      expect(createMock).toHaveBeenCalledWith({
        title: 'Team Sync',
        location: 'Zoom',
        date: dayjs(new Date(Date.now() + 86400000)).format('YYYY-MM-DD'),
        slots: [{ start: '10:00', end: '11:00' }],
      })
    })
  })

  it('should prevent submission when date in the past', async () => {
    render(<ScheduleCreatePage />)
    const pastDate = new Date(Date.now() - 86400000)
    await fillAndSubmitForm({ date: pastDate })

    await waitFor(() => {
      expect(screen.getByText(/date cannot be in the past/i)).toBeInTheDocument()
      expect(createSchedule).not.toHaveBeenCalled()
    })
  })

  it('should allow adding multiple time slots and reflect them in payload', async () => {
    const createMock = createSchedule as jest.Mock
    createMock.mockResolvedValue({ id: '456' })

    render(<ScheduleCreatePage />)
    fireEvent.click(screen.getByRole('button', { name: /add time slot/i }))

    const startInputs = screen.getAllByLabelText(/start time/i)
    const endInputs = screen.getAllByLabelText(/end time/i)
    fireEvent.change(startInputs[1], { target: { value: '12:00' } })
    fireEvent.change(endInputs[1], { target: { value: '13:00' } })

    await fillAndSubmitForm()
    await waitFor(() => {
      expect(createMock).toHaveBeenCalledWith({
        title: 'Team Sync',
        location: 'Zoom',
        date: dayjs(new Date(Date.now() + 86400000)).format('YYYY-MM-DD'),
        slots: [
          { start: '10:00', end: '11:00' },
          { start: '12:00', end: '13:00' },
        ],
      })
    })
  })

  it('should display error banner on API failure', async () => {
    const createMock = createSchedule as jest.Mock
    createMock.mockRejectedValue(new Error('API error'))

    render(<ScheduleCreatePage />)
    await fillAndSubmitForm()

    await waitFor(() => {
      expect(
        screen.getByText(/failed to create schedule/i)
      ).toBeInTheDocument()
    })
  })
})