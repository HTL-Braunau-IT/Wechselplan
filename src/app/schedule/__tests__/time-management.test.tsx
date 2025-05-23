import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { useRouter } from 'next/navigation'
import TimesPage from '../create/times/page'
import '@testing-library/jest-dom'

// Mock next/navigation
jest.mock('next/navigation', () => ({
  useRouter: jest.fn(),
  useSearchParams: jest.fn(() => new URLSearchParams('?class=ClassA')),
}))

// Mock i18n
jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}))

// Mock fetch
global.fetch = jest.fn()

describe('Time Management', () => {
  const mockRouter = {
    push: jest.fn(),
  }

  const mockScheduleTimes = [
    {
      id: '1',
      startTime: '08:00',
      endTime: '09:00',
      hours: 1,
      period: 'AM' as const,
    },
    {
      id: '2',
      startTime: '09:00',
      endTime: '10:00',
      hours: 1,
      period: 'AM' as const,
    },
  ]


  beforeEach(() => {
    jest.clearAllMocks()
    ;(useRouter as jest.Mock).mockReturnValue(mockRouter)
    ;(global.fetch as jest.Mock).mockImplementation(() =>
      Promise.resolve({
        ok: true,
        json: () => Promise.resolve(mockScheduleTimes),
      })
    )
  })

  it('renders time management page', async () => {
    render(<TimesPage />)
    await waitFor(() => {
      const matches = screen.getAllByText(/zeiten|times/i)
      expect(matches.length).toBeGreaterThan(0)
    })
  })

  it('loads and displays schedule times', async () => {
    ;(global.fetch as jest.Mock).mockImplementationOnce(() =>
      Promise.resolve({
        ok: true,
        json: () => Promise.resolve(mockScheduleTimes),
      })
    )
    render(<TimesPage />)
    await waitFor(() => {
      expect(screen.getAllByText(/08:00\s*-\s*09:00/)[0]).toBeInTheDocument()
    })
  })

  it('handles time selection', async () => {
    render(<TimesPage />)
    await waitFor(() => {
      // Find the checkbox by its label
      const label = screen.getAllByText(/08:00\s*-\s*09:00/)[0]
      if (!label) throw new Error('Label not found')
      // The checkbox is the previous sibling
      const checkbox = label.previousSibling as HTMLElement
      fireEvent.click(checkbox)
      expect(checkbox).toHaveAttribute('data-state', 'checked')
    })
  })

  it('saves selected times', async () => {
    ;(global.fetch as jest.Mock).mockImplementationOnce(() =>
      Promise.resolve({
        ok: true,
        json: () => Promise.resolve(mockScheduleTimes),
      })
    )
    render(<TimesPage />)
    await waitFor(() => {
      const label = screen.getAllByText(/08:00\s*-\s*09:00/)[0]
      if (!label) throw new Error('Label not found')
      const checkbox = label.previousSibling as HTMLElement
      fireEvent.click(checkbox)
    })
    // The button is labeled 'Next' in the UI
    const saveButton = screen.getByRole('button', { name: /next/i })
    fireEvent.click(saveButton)
    await waitFor(() => {
      expect(mockRouter.push).toHaveBeenCalledWith(
        expect.stringContaining('/schedule/create/overview?class=ClassA')
      )
    })
  })

  it('handles API errors gracefully', async () => {
    ;(global.fetch as jest.Mock).mockImplementationOnce(() =>
      Promise.reject(new Error('API Error'))
    )
    render(<TimesPage />)
    await waitFor(() => {
      expect(screen.getByText(/failed to load times/i)).toBeInTheDocument()
    })
  })
}) 