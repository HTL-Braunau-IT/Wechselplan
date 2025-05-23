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
    const mockClasses = ['Class A', 'Class B']
    ;(global.fetch as jest.Mock).mockImplementationOnce(() =>
      Promise.resolve({
        ok: true,
        json: () => Promise.resolve(mockClasses),
      })
    )
    render(<ScheduleClassSelectPage />)
    
    // Wait for classes to load and verify loading state
    await waitFor(() => {
      expect(screen.getByText('Class A')).toBeInTheDocument()
    })

    // Select a class (try label first, fallback to combobox)
    let classSelect: HTMLElement
    try {
      classSelect = screen.getByLabelText('Select Class')
    } catch {
      classSelect = screen.getByRole('combobox')
    }
    fireEvent.change(classSelect, {
      target: { value: 'Class A' },
    })

    // Submit form
    const nextButton = screen.getByRole('button', { name: 'Next' })
    fireEvent.click(nextButton)

    // Verify navigation with proper URL encoding
    await waitFor(() => {
      const calls = (mockRouter.push.mock.calls as unknown[][]).map(call => String(call[0]))
      expect(
        calls.some(url => 
          url.includes('/schedule/create/teachers') && 
          (url.includes('class=Class%20A') || url.includes('class=Class A'))
        )
      ).toBe(true)
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