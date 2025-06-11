import React from 'react'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import '@testing-library/jest-dom'
import { axe, toHaveNoViolations } from 'jest-axe'
import RotationCreatePage from '../page'
import * as api from '@/lib/api/rotation'

expect.extend(toHaveNoViolations)
jest.mock('@/lib/api/rotation')

const mockGetDefaults = api.getRotationDefaults as jest.MockedFunction<typeof api.getRotationDefaults>
const mockCreateRotation = api.createRotation as jest.MockedFunction<typeof api.createRotation>

describe('RotationCreatePage', () => {
  beforeEach(() => {
    jest.useFakeTimers().setSystemTime(new Date('2025-01-01T00:00:00Z'))
    jest.clearAllMocks()
  })

  afterEach(() => {
    jest.useRealTimers()
  })

  it('renders form with default values (happy path)', async () => {
    mockGetDefaults.mockResolvedValue({ name: 'Default Rotation', timezone: 'UTC', participants: ['alice'] })

    render(<RotationCreatePage />)

    // shows loading spinner
    expect(screen.getByTestId('loading-spinner')).toBeInTheDocument()
    await waitFor(() => expect(screen.queryByTestId('loading-spinner')).not.toBeInTheDocument())

    // default values populated
    expect(screen.getByLabelText(/rotation name/i)).toHaveValue('Default Rotation')
    expect(screen.getByLabelText(/timezone/i)).toHaveValue('UTC')
    expect(screen.getByTestId('participants-select')).toHaveValue(['alice'])
  })

  it('submits successfully with valid data', async () => {
    mockGetDefaults.mockResolvedValue({ name: '', timezone: '', participants: [] })
    mockCreateRotation.mockResolvedValue({ id: 'rotation123' })

    render(<RotationCreatePage />)
    await waitFor(() => expect(screen.queryByTestId('loading-spinner')).not.toBeInTheDocument())

    userEvent.type(screen.getByLabelText(/rotation name/i), 'New Rotation')
    userEvent.selectOptions(screen.getByLabelText(/timezone/i), 'UTC')
    userEvent.selectOptions(screen.getByLabelText(/participants/i), ['alice', 'bob'])
    userEvent.click(screen.getByRole('button', { name: /submit/i }))

    await waitFor(() =>
      expect(mockCreateRotation).toHaveBeenCalledWith({
        name: 'New Rotation',
        timezone: 'UTC',
        participants: ['alice', 'bob'],
      })
    )
    expect(await screen.findByText(/rotation created successfully/i)).toBeInTheDocument()
  })

  it('shows required field errors on empty submit', async () => {
    mockGetDefaults.mockResolvedValue({ name: '', timezone: '', participants: [] })

    render(<RotationCreatePage />)
    await waitFor(() => expect(screen.queryByTestId('loading-spinner')).not.toBeInTheDocument())

    userEvent.click(screen.getByRole('button', { name: /submit/i }))

    expect(await screen.findByText(/rotation name is required/i)).toBeInTheDocument()
    expect(await screen.findByText(/timezone is required/i)).toBeInTheDocument()
  })

  it('handles API failure gracefully and shows error toast', async () => {
    mockGetDefaults.mockResolvedValue({ name: '', timezone: '', participants: [] })
    mockCreateRotation.mockRejectedValue(new Error('Network error'))

    render(<RotationCreatePage />)
    await waitFor(() => expect(screen.queryByTestId('loading-spinner')).not.toBeInTheDocument())

    userEvent.type(screen.getByLabelText(/rotation name/i), 'Fail Rotation')
    userEvent.selectOptions(screen.getByLabelText(/timezone/i), 'UTC')
    userEvent.click(screen.getByRole('button', { name: /submit/i }))

    expect(await screen.findByText(/failed to create rotation/i)).toBeInTheDocument()
  })

  it('validates time zone edge cases (DST boundaries)', async () => {
    // Simulate a DST boundary moment
    jest.setSystemTime(new Date('2025-03-09T02:30:00Z'))
    mockGetDefaults.mockResolvedValue({ name: '', timezone: 'America/New_York', participants: [] })

    render(<RotationCreatePage />)
    await waitFor(() => expect(screen.getByLabelText(/timezone/i)).toHaveValue('America/New_York'))
    expect(screen.queryByText(/invalid timezone/i)).not.toBeInTheDocument()
  })

  it('prevents duplicate user selection', async () => {
    mockGetDefaults.mockResolvedValue({ name: '', timezone: '', participants: [] })

    render(<RotationCreatePage />)
    await waitFor(() => expect(screen.queryByTestId('loading-spinner')).not.toBeInTheDocument())

    const participantsSelect = screen.getByLabelText(/participants/i)
    userEvent.selectOptions(participantsSelect, ['alice'])
    userEvent.selectOptions(participantsSelect, ['alice']) // attempt duplicate

    const selectedOptions = within(participantsSelect)
      .getAllByRole('option', { selected: true })
      .map((opt) => opt.getAttribute('value'))
    expect(selectedOptions.filter((v) => v === 'alice').length).toBe(1)
  })

  it('renders loading spinner while fetching defaults', () => {
    mockGetDefaults.mockReturnValue(new Promise(() => {}))
    render(<RotationCreatePage />)
    expect(screen.getByTestId('loading-spinner')).toBeInTheDocument()
  })

  it('supports keyboard navigation and has no basic a11y violations via axe', async () => {
    mockGetDefaults.mockResolvedValue({ name: '', timezone: '', participants: [] })
    const { container } = render(<RotationCreatePage />)
    await waitFor(() => expect(screen.queryByTestId('loading-spinner')).not.toBeInTheDocument())

    // Tab navigation
    userEvent.tab()
    expect(screen.getByLabelText(/rotation name/i)).toHaveFocus()
    userEvent.tab()
    expect(screen.getByLabelText(/timezone/i)).toHaveFocus()

    // Accessibility check
    const results = await axe(container)
    expect(results).toHaveNoViolations()
  })
})