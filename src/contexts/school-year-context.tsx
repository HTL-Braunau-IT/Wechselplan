'use client'

import { createContext, useContext, useState } from 'react'
import type { ReactNode } from 'react'
import type { SchoolYear } from '../types/school-year'
import { getCurrentSchoolYear } from '../types/school-year'

interface SchoolYearContextType {
  selectedYear: SchoolYear
  setSelectedYear: (year: SchoolYear) => void
}

const SchoolYearContext = createContext<SchoolYearContextType | undefined>(undefined)

export function SchoolYearProvider({ children }: { children: ReactNode }) {
  const [selectedYear, setSelectedYear] = useState<SchoolYear>(getCurrentSchoolYear())

  return (
    <SchoolYearContext.Provider value={{ selectedYear, setSelectedYear }}>
      {children}
    </SchoolYearContext.Provider>
  )
}

export function useSchoolYear() {
  const context = useContext(SchoolYearContext)
  if (context === undefined) {
    throw new Error('useSchoolYear must be used within a SchoolYearProvider')
  }
  return context
} 