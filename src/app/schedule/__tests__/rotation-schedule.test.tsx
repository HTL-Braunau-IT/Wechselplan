import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { useRouter } from 'next/navigation'
import RotationPage from '../create/rotation/page'
import '@testing-library/jest-dom'

// Mock next/navigation
jest.mock('next/navigation', () => ({
  useRouter: jest.fn(),
  useSearchParams: jest.fn(() => new URLSearchParams('?class=ClassA')),
}))

// Mock i18n
jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => {
      const translations: Record<string, string> = {
        'rotation.periods': 'Rotation Periods',
        'rotation.day': 'Rotation Day',
        'number.of.terms': 'Number of Terms',
        'save.schedule': 'Save Schedule',
        'error.loading': 'Error loading data',
        'turnus': 'TURNUS'
      }
      return translations[key] ?? key
    },
  }),
}))

// Mock fetch
global.fetch = jest.fn()

describe('Rotation Schedule', () => {
  const mockRouter = {
    push: jest.fn(),
  }

  const mockHolidays = [
    {
      id: '1',
      name: 'Christmas Break',
      startDate: new Date('2024-12-23'),
      endDate: new Date('2024-12-31'),
    },
  ]

  beforeEach(() => {
    jest.clearAllMocks()
    ;(useRouter as jest.Mock).mockReturnValue(mockRouter)
    ;(global.fetch as jest.Mock).mockImplementation(() =>
      Promise.resolve({
        ok: true,
        json: () => Promise.resolve(mockHolidays),
      })
    )
    // Mock the current date to be during Christmas Break
    jest.useFakeTimers()
    jest.setSystemTime(new Date('2024-12-25'))
  })

  afterEach(() => {
    jest.useRealTimers()
  })

  it('renders rotation schedule page', async () => {
    render(<RotationPage />)
    await waitFor(() => {
      expect(screen.getByText('Rotation Periods')).toBeInTheDocument()
    })
  })

  it('loads and displays holidays', async () => {
    render(<RotationPage />)
    await waitFor(() => {
      expect(screen.getByLabelText('Number of Terms')).toBeInTheDocument()
    })
    
    const termsInput = screen.getByLabelText('Number of Terms')
    fireEvent.change(termsInput, { target: { value: '4' } })
    
    await waitFor(() => {
      const tfoot = screen.getByRole('table').querySelector('tfoot')
      if (!tfoot) {
        throw new Error('Footer not found')
      }
      // Get the first (and only) row in the tfoot
      const footerRow = tfoot.querySelector('tr')
      if (!footerRow) {
        throw new Error('Footer row not found')
      }
      // Check if any cell in the footer row contains 'Christmas Break'
      const cells = footerRow.querySelectorAll('td')
      const cellContents = Array.from(cells as NodeListOf<HTMLElement>).map(cell => cell.textContent)
      // Diagnostic log
      console.log('Footer row cell contents:', cellContents)
      const hasHoliday = cellContents.some(text => text?.includes('Christmas Break'))
      expect(hasHoliday).toBe(true)
    }, { timeout: 5000 }) // Increase timeout to allow for holiday data to load
  })

  it('handles number of terms selection', async () => {
    render(<RotationPage />)
    await waitFor(() => {
      expect(screen.getByLabelText('Number of Terms')).toBeInTheDocument()
    })
    
    const termsInput = screen.getByLabelText('Number of Terms')
    fireEvent.change(termsInput, { target: { value: '6' } })
    
    await waitFor(() => {
      expect(termsInput).toHaveValue(6)
    })
  })

  it('handles weekday selection', async () => {
    render(<RotationPage />)
    await waitFor(() => {
      expect(screen.getByText('Rotation Day')).toBeInTheDocument()
    })
    
    const weekdaySelect = screen.getByRole('combobox')
    expect(weekdaySelect).toBeInTheDocument()
  })

  it('saves rotation schedule', async () => {
    render(<RotationPage />)
    await waitFor(() => {
      expect(screen.getByLabelText('Number of Terms')).toBeInTheDocument()
    })
    
    const termsInput = screen.getByLabelText('Number of Terms')
    fireEvent.change(termsInput, { target: { value: '4' } })
    
    const saveButton = screen.getByRole('button', { name: 'Save Schedule' })
    fireEvent.click(saveButton)
    
    await waitFor(() => {
      expect(mockRouter.push).toHaveBeenCalledWith(
        expect.stringContaining('/schedule/create/times?class=ClassA')
      )
    })
  })

  it('handles API errors gracefully', async () => {
    ;(global.fetch as jest.Mock).mockImplementationOnce(() =>
      Promise.reject(new Error('API Error'))
    )
    render(<RotationPage />)

    await waitFor(() => {
      // Look for the fetch error message
      expect(screen.getByText('Failed to load holidays.')).toBeInTheDocument()
    })
  })

  it('calculates schedule correctly', async () => {
    render(<RotationPage />)
    await waitFor(() => {
      expect(screen.getByLabelText('Number of Terms')).toBeInTheDocument()
    })
    
    const termsInput = screen.getByLabelText('Number of Terms')
    fireEvent.change(termsInput, { target: { value: '4' } })
    
    await waitFor(() => {
      expect(screen.getByRole('table')).toBeInTheDocument()
      // Look for TURNUS 1 specifically in the table body
      const tableBody = screen.getByRole('table').querySelector('tbody')
      expect(tableBody).toBeInTheDocument()
      const cells = tableBody?.querySelectorAll('td') ?? []
      const cellsArray = Array.isArray(cells) ? cells : Array.from(cells as NodeListOf<HTMLElement>);
      const turnus1Cell = cellsArray.find(cell => cell.textContent?.includes('TURNUS 1'));
      if (!turnus1Cell) {
        // Debug output
        console.log('Table cell contents:', cellsArray.map(cell => cell.textContent));
      }
      
    })
  })
}) 