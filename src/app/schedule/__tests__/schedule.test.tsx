import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { useRouter } from 'next/navigation'
import ScheduleClassSelectPage from '../create/page'
import '@testing-library/jest-dom'

// Mock next/navigation
jest.mock('next/navigation', () => ({
  useRouter: jest.fn(),
  useSearchParams: jest.fn(() => new URLSearchParams()),
}))

// Mock i18n
jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => {
      const translations: Record<string, string> = {
        'selectClass': 'Select Class',
        'next': 'Next',
        'error.loading.classes': 'Error loading classes'
      }
      return translations[key] ?? key
    },
  }),
}))

// Mock fetch
global.fetch = jest.fn()

describe('Schedule Creation Flow', () => {
  const mockRouter = {
    push: jest.fn(),
  }

  beforeEach(() => {
    jest.clearAllMocks()
    ;(useRouter as jest.Mock).mockReturnValue(mockRouter)
    ;(global.fetch as jest.Mock).mockImplementation(() =>
      Promise.resolve({
        ok: true,
        json: () => Promise.resolve([]),
      })
    )
  })

  it('renders class selection page', async () => {
    render(<ScheduleClassSelectPage />)
    await waitFor(() => {
      expect(screen.getByText('Select Class')).toBeInTheDocument()
    })
  })

  it('handles class selection and navigation', async () => {
    (global.fetch as jest.Mock).mockImplementation((url: string) => {
      if (url === '/api/classes') {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve(['Class A']),
        })
      }
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve([]),
      })
    })
    render(<ScheduleClassSelectPage />)
    // Find the select trigger button
    const selectTrigger = await screen.findByRole('combobox')
    fireEvent.click(selectTrigger)
    // Find and click the option for 'Class A'
    const option = await screen.findByRole('option', { name: 'Class A' })
    fireEvent.click(option)
    // Now check that the trigger shows 'Class A'
    await waitFor(() => {
      expect(selectTrigger).toHaveTextContent('Class A')
    })
    const nextButton = screen.getByRole('button', { name: /next/i })
    fireEvent.click(nextButton)
    await waitFor(() => {
      expect(mockRouter.push).toHaveBeenCalledWith(expect.stringContaining('/schedule/create/teachers?class=Class A'))
    })
  })

  it('handles API errors gracefully', async () => {
    ;(global.fetch as jest.Mock).mockImplementationOnce(() =>
      Promise.reject(new Error('API Error'))
    )
    render(<ScheduleClassSelectPage />)
    
    await waitFor(() => {
      expect(
        screen.getByText(
          (text) =>
            text === 'Error loading classes' ||
            text === 'Fehler beim Laden der Klassen.'
        )
      ).toBeInTheDocument()
    })
  })
}) 