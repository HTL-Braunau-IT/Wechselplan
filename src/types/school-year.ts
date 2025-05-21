export type SchoolYear = `${number}/${number}`

export interface SchoolYearOption {
  value: SchoolYear
  label: string
}

export const isValidSchoolYear = (year: string): year is SchoolYear => {
  const pattern = /^\d{4}\/\d{4}$/
  if (!pattern.test(year)) return false
  
  const parts = year.split('/')
  if (parts.length !== 2) return false
  
  const [start, end] = parts.map(Number) as [number, number]
  return end === start + 1
}

export const getCurrentSchoolYear = (): SchoolYear => {
  const now = new Date()
  const currentYear = now.getFullYear()
  const month = now.getMonth() // 0-11
  
  // If we're in the second half of the year (July onwards), use current year as start
  // Otherwise use previous year as start
  const startYear = month >= 6 ? currentYear : currentYear - 1
  return `${startYear}/${startYear + 1}`
}

export const generateSchoolYearOptions = (yearsBack = 2, yearsForward = 2): SchoolYearOption[] => {
  const currentYear = parseInt(getCurrentSchoolYear().split('/')[0]!)
  const options: SchoolYearOption[] = []
  
  for (let i = -yearsBack; i <= yearsForward; i++) {
    const startYear = currentYear + i
    const year: SchoolYear = `${startYear}/${startYear + 1}`
    options.push({
      value: year,
      label: year
    })
  }
  
  return options
} 