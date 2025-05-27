import '@testing-library/jest-dom'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'

import ImportPage from '../page'
import { CSVImport } from '@/components/admin/csv-import'

// Mock the next/navigation
jest.mock('next/navigation', () => ({
  useRouter: () => ({
    push: jest.fn(),
    replace: jest.fn(),
    prefetch: jest.fn()
  })
}))

// Mock the fetch function
global.fetch = jest.fn()

// Mock the translation hook
jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
    i18n: {
      changeLanguage: () => new Promise<void>((resolve) => resolve())
    }
  })
}))

// Mock File API
interface MockFile extends File {
  content: string
}

class MockFileImpl extends File implements MockFile {
  content: string

  constructor(bits: BlobPart[], name: string, options?: FilePropertyBag) {
    super(bits, name, options)
    this.content = ''
  }

  text() {
    return Promise.resolve(this.content)
  }
}

describe('ImportPage', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('renders the import page with tabs', () => {
    render(<ImportPage />)
    
    expect(screen.getByText('admin.students.import.title')).toBeInTheDocument()

  })

  it('shows LDAP import tab by default', () => {
    render(<ImportPage />)
    
    expect(screen.getByText('admin.students.import.previewData')).toBeInTheDocument()
  })


  it('handles LDAP preview data successfully', async () => {
    const mockData = {
      classes: [
        {
          name: '1A',
          students: [
            { firstName: 'Max', lastName: 'Mustermann' },
            { firstName: 'Anna', lastName: 'Schmidt' }
          ]
        }
      ]
    }

    ;(global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(mockData)
    })

    render(<ImportPage />)
    
    const previewButton = screen.getByText('admin.students.import.previewData')
    fireEvent.click(previewButton)

    await waitFor(() => {
      expect(screen.getByText(/admin\.students\.import\.previewTitle/)).toBeInTheDocument()
      expect(screen.getByText(/Max/)).toBeInTheDocument()
      expect(screen.getByText(/Anna/)).toBeInTheDocument()
    })
  })

  it('handles LDAP preview error', async () => {
    ;(global.fetch as jest.Mock).mockRejectedValueOnce(new Error('Failed to fetch'))

    render(<ImportPage />)
    
    const previewButton = screen.getByText('admin.students.import.previewData')
    fireEvent.click(previewButton)

    await waitFor(() => {
      expect(screen.getByText(/admin\.students\.import\.errors\.fetchStudents/)).toBeInTheDocument()
    })
  })
})

describe('CSVImport', () => {
  const mockOnImport = jest.fn()

  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('renders CSV import component', () => {
    render(<CSVImport onImport={mockOnImport} />)
    
    expect(screen.getByText(/admin\.students\.import\.downloadSample/)).toBeInTheDocument()
    expect(screen.getByText(/admin\.students\.import\.uploadCSV/)).toBeInTheDocument()
  })

  it('handles CSV file upload successfully', async () => {
    const csvContent = 'class,firstName,lastName\n1A,Max,Mustermann\n1A,Anna,Schmidt'
    const file = new MockFileImpl([csvContent], 'students.csv', { type: 'text/csv' })
    file.content = csvContent

    render(<CSVImport onImport={mockOnImport} />)
    
    const fileInput = screen.getByLabelText(/admin\.students\.import\.uploadCSV/)
    fireEvent.change(fileInput, { target: { files: [file] } })

    await waitFor(() => {
      expect(screen.getByText(/admin\.students\.import\.previewTitle/)).toBeInTheDocument()
      expect(screen.getByText(/Max/)).toBeInTheDocument()
      expect(screen.getByText(/Anna/)).toBeInTheDocument()
    })
  })

  it('handles invalid CSV format', async () => {
    const invalidCsvContent = 'invalid,format\n1A,Max'
    const file = new MockFileImpl([invalidCsvContent], 'students.csv', { type: 'text/csv' })
    file.content = invalidCsvContent

    render(<CSVImport onImport={mockOnImport} />)
    
    const fileInput = screen.getByLabelText(/admin\.students\.import\.uploadCSV/)
    fireEvent.change(fileInput, { target: { files: [file] } })

    await waitFor(() => {
      expect(screen.getByText(/admin\.students\.import\.errors\.invalidCSV/)).toBeInTheDocument()
    })
  })

  it('handles sample CSV download', async () => {
    const mockBlob = new Blob(['sample csv content'], { type: 'text/csv' })
    ;(global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      blob: () => Promise.resolve(mockBlob)
    })

    render(<CSVImport onImport={mockOnImport} />)
    
    const downloadButton = screen.getByText(/admin\.students\.import\.downloadSample/)
    fireEvent.click(downloadButton)

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith('/api/students/import/sample')
    })
  })

  it('handles import with selected classes', async () => {
    const csvContent = 'class,firstName,lastName\n1A,Max,Mustermann\n1A,Anna,Schmidt'
    const file = new MockFileImpl([csvContent], 'students.csv', { type: 'text/csv' })
    file.content = csvContent

    render(<CSVImport onImport={mockOnImport} />)
    
    // Upload file
    const fileInput = screen.getByLabelText(/admin\.students\.import\.uploadCSV/)
    fireEvent.change(fileInput, { target: { files: [file] } })

    await waitFor(() => {
      expect(screen.getByText(/admin\.students\.import\.previewTitle/)).toBeInTheDocument()
    })

    // Click import button
    const importButton = screen.getByText(/admin\.students\.import\.importSelected/)
    fireEvent.click(importButton)

    await waitFor(() => {
      expect(mockOnImport).toHaveBeenCalledWith(['1A'])
    })
  })

  it('shows error when no classes are selected', async () => {
    const csvContent = 'class,firstName,lastName\n1A,Max,Mustermann\n1A,Anna,Schmidt'
    const file = new MockFileImpl([csvContent], 'students.csv', { type: 'text/csv' })
    file.content = csvContent

    render(<CSVImport onImport={mockOnImport} />)
    
    // Upload file
    const fileInput = screen.getByLabelText(/admin\.students\.import\.uploadCSV/)
    fireEvent.change(fileInput, { target: { files: [file] } })

    await waitFor(() => {
      expect(screen.getByText(/admin\.students\.import\.previewTitle/)).toBeInTheDocument()
    })

    // Uncheck the class
    const checkbox = screen.getByRole('checkbox')
    fireEvent.click(checkbox)

    // Click import button
    const importButton = screen.getByText(/admin\.students\.import\.importSelected/)
    fireEvent.click(importButton)

    await waitFor(() => {
      expect(screen.getByText(/admin\.students\.import\.errors\.noClassesSelected/)).toBeInTheDocument()
    })
  })
}) 