import { NextResponse } from 'next/server'
import { parse } from 'node-html-parser'

export async function POST(request: Request) {
  try {
    const { url } = await request.json() as { url: string }

    if (!url) {
      return NextResponse.json({ error: 'URL is required' }, { status: 400 })
    }

    // Fetch the webpage content
    const response = await fetch(url)
    const html = await response.text()
    const root = parse(html)

    const holidays: Array<{
      name: string
      startDate: string
      endDate: string
      isValid: boolean
    }> = []

    // Get all text content and split by newlines
    const text = root.text
    const lines = text.split('\n').map(line => line.trim()).filter(line => line.length > 0)

    // Process lines in pairs (date and name)
    for (let i = 0; i < lines.length - 1; i += 2) {
      const dateLine = lines[i]
      const nameLine = lines[i + 1]

      // Skip if either line is empty
      if (!dateLine || !nameLine) continue

      // Parse the date line
      const dateMatch = dateLine.match(/(\d{1,2}\.\s+\w+\s+\d{4})(?:\s+bis\s+(\d{1,2}\.\s+\w+\s+\d{4}))?/)
      if (!dateMatch) continue

      const startDateStr = dateMatch[1]
      const endDateStr = dateMatch[2] || dateMatch[1] // If no end date, use start date

      // Convert German month names to numbers
      const monthMap: Record<string, string> = {
        'Jänner': '01',
        'Februar': '02',
        'März': '03',
        'April': '04',
        'Mai': '05',
        'Juni': '06',
        'Juli': '07',
        'August': '08',
        'September': '09',
        'Oktober': '10',
        'November': '11',
        'Dezember': '12'
      }

      // Parse dates
      const parseDate = (dateStr: string) => {
        const [day, month, year] = dateStr.split('.')
        const monthNum = monthMap[month.trim()]
        if (!monthNum) return null
        return new Date(`${year.trim()}-${monthNum}-${day.trim()}`)
      }

      const start = parseDate(startDateStr)
      const end = parseDate(endDateStr)

      if (start && end && !isNaN(start.getTime()) && !isNaN(end.getTime())) {
        holidays.push({
          name: nameLine,
          startDate: start.toISOString().split('T')[0],
          endDate: end.toISOString().split('T')[0],
          isValid: true
        })
      }
    }

    return NextResponse.json(holidays)
  } catch (error) {
    console.error('Error scraping holidays:', error)
    return NextResponse.json(
      { error: 'Failed to scrape holidays' },
      { status: 500 }
    )
  }
} 