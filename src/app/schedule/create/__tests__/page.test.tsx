import { render, screen, waitFor } from 'test-utils'
import userEvent from '@testing-library/user-event'
import CreateSchedulePage from '../../page'
import { server, rest } from 'msw'
import mockRouter from 'next-router-mock'

jest.mock('next/navigation', () => require('next-router-mock'))

beforeAll(() => {
  server.listen()
})

afterEach(() => {
  server.resetHandlers()
  jest.clearAllMocks()
})

afterAll(() => {
  server.close()
})

describe('CreateSchedulePage', () => {
  describe('Happy Path', () => {
    test('submits valid schedule and redirects to the schedule list', async () => {
      // Arrange
      render(<CreateSchedulePage />)
      const titleInput = screen.getByLabelText(/title/i)
      const dateInput = screen.getByLabelText(/date/i)
      const startInput = screen.getByLabelText(/start time/i)
      const endInput = screen.getByLabelText(/end time/i)
      const participantsInput = screen.getByLabelText(/participants/i)
      const submitButton = screen.getByRole('button', { name: /create/i })

      const tomorrow = new Date()
      tomorrow.setDate(tomorrow.getDate() + 1)
      const dateStr = tomorrow.toISOString().split('T')[0]

      // Act
      await userEvent.type(titleInput, 'Team Sync')
      await userEvent.type(dateInput, dateStr)
      await userEvent.type(startInput, '10:00')
      await userEvent.type(endInput, '11:00')
      await userEvent.type(participantsInput, '5')
      await userEvent.click(submitButton)

      // Assert
      await waitFor(() => {
        expect(mockRouter.push).toHaveBeenCalledWith('/schedule')
      })
    })
  })

  describe('Validation Errors', () => {
    test('displays alerts when required fields are empty', async () => {
      // Arrange
      render(<CreateSchedulePage />)
      const submitButton = screen.getByRole('button', { name: /create/i })

      // Act
      await userEvent.click(submitButton)

      // Assert
      const alerts = await screen.findAllByRole('alert')
      expect(alerts).toHaveLength(5)
    })

    test('shows error for past date', async () => {
      // Arrange
      render(<CreateSchedulePage />)
      const dateInput = screen.getByLabelText(/date/i)
      const submitButton = screen.getByRole('button', { name: /create/i })

      // Act
      await userEvent.type(dateInput, '2000-01-01')
      await userEvent.click(submitButton)

      // Assert
      expect(await screen.findByRole('alert')).toHaveTextContent(/past/i)
    })

    test('shows error when end time is before start time', async () => {
      // Arrange
      render(<CreateSchedulePage />)
      const dateInput = screen.getByLabelText(/date/i)
      const startInput = screen.getByLabelText(/start time/i)
      const endInput = screen.getByLabelText(/end time/i)
      const submitButton = screen.getByRole('button', { name: /create/i })

      const tomorrow = new Date()
      tomorrow.setDate(tomorrow.getDate() + 1)
      const dateStr = tomorrow.toISOString().split('T')[0]

      // Act
      await userEvent.type(dateInput, dateStr)
      await userEvent.type(startInput, '12:00')
      await userEvent.type(endInput, '11:00')
      await userEvent.click(submitButton)

      // Assert
      expect(await screen.findByRole('alert')).toHaveTextContent(/after start time/i)
    })

    test('shows error for excessively long title', async () => {
      // Arrange
      render(<CreateSchedulePage />)
      const titleInput = screen.getByLabelText(/title/i)
      const submitButton = screen.getByRole('button', { name: /create/i })
      const longTitle = 'A'.repeat(256)

      // Act
      await userEvent.type(titleInput, longTitle)
      await userEvent.click(submitButton)

      // Assert
      expect(await screen.findByRole('alert')).toHaveTextContent(/at most.*255/i)
    })
  })

  describe('API Error Handling', () => {
    beforeEach(() => {
      server.use(
        rest.post('/api/schedules', (req, res, ctx) => {
          return res(ctx.status(500), ctx.json({ message: 'Server error' }))
        })
      )
    })

    test('displays error banner on API failure and re-enables submit button', async () => {
      // Arrange
      render(<CreateSchedulePage />)
      const titleInput = screen.getByLabelText(/title/i)
      const dateInput = screen.getByLabelText(/date/i)
      const startInput = screen.getByLabelText(/start time/i)
      const endInput = screen.getByLabelText(/end time/i)
      const participantsInput = screen.getByLabelText(/participants/i)
      const submitButton = screen.getByRole('button', { name: /create/i })

      const tomorrow = new Date()
      tomorrow.setDate(tomorrow.getDate() + 1)
      const dateStr = tomorrow.toISOString().split('T')[0]

      await userEvent.type(titleInput, 'Error Case')
      await userEvent.type(dateInput, dateStr)
      await userEvent.type(startInput, '09:00')
      await userEvent.type(endInput, '10:00')
      await userEvent.type(participantsInput, '3')

      // Act
      await userEvent.click(submitButton)

      // Assert
      expect(submitButton).toBeDisabled()
      expect(await screen.findByRole('alert')).toHaveTextContent(/unable to create schedule/i)
      expect(submitButton).toBeEnabled()
    })
  })

  describe('Accessibility', () => {
    test('all form controls have labels and are accessible', () => {
      // Arrange
      render(<CreateSchedulePage />)

      // Assert
      expect(screen.getByLabelText(/title/i)).toBeInTheDocument()
      expect(screen.getByLabelText(/date/i)).toBeInTheDocument()
      expect(screen.getByLabelText(/start time/i)).toBeInTheDocument()
      expect(screen.getByLabelText(/end time/i)).toBeInTheDocument()
      expect(screen.getByLabelText(/participants/i)).toBeInTheDocument()
      expect(screen.getByRole('button', { name: /create/i })).toBeEnabled()
    })
  })
})