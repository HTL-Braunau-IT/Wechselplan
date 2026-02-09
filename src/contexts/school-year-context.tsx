'use client'

import { createContext, useContext, useState, useEffect, useCallback } from 'react'
import type { ReactNode } from 'react'
import type { SchoolYearFromApi } from '../types/school-year'
import {
  getCurrentSchoolYearFromList,
  getCurrentSemesterFromSchoolYear,
  getStoredSchoolYearId,
  setStoredSchoolYearId,
} from '../types/school-year'

interface SchoolYearContextType {
  /** Currently selected school year from DB (id, label, startDate, endDate, semesterChangeDate) */
  selectedYear: SchoolYearFromApi | null
  /** All school years from DB for dropdown */
  years: SchoolYearFromApi[]
  /** Current semester for selected year (from semesterChangeDate); null if no selected year or no date */
  currentSemester: 'first' | 'second' | null
  /** Set selected year by id; persists to localStorage */
  setSchoolYear: (year: SchoolYearFromApi | { id: number }) => void
  /** Refetch years list from API (e.g. after creating a new year); keeps current selection if still in list */
  refetchYears: () => Promise<void>
  isLoading: boolean
}

const SchoolYearContext = createContext<SchoolYearContextType | undefined>(undefined)

export function SchoolYearProvider({ children }: { children: ReactNode }) {
  const [years, setYears] = useState<SchoolYearFromApi[]>([])
  const [selectedYear, setSelectedYearState] = useState<SchoolYearFromApi | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  const fetchYears = useCallback(async (isInitialLoad = true) => {
    try {
      if (isInitialLoad) setIsLoading(true)
      const res = await fetch('/api/school-years')
      if (!res.ok) return
      const data = (await res.json()) as SchoolYearFromApi[]
      setYears(data)
      if (data.length === 0) {
        setSelectedYearState(null)
        return
      }
      if (isInitialLoad) {
        const currentFromDb = getCurrentSchoolYearFromList(data)
        const storedId = getStoredSchoolYearId()
        const byStored = storedId ? data.find((y) => y.id === storedId) : null
        const initial = byStored ?? currentFromDb ?? data[data.length - 1] ?? data[0]!
        setSelectedYearState(initial)
        if (!byStored && storedId === null) {
          setStoredSchoolYearId(initial.id)
        }
      } else {
        setSelectedYearState((prev) => {
          if (!prev) return data[data.length - 1] ?? data[0]!
          const stillInList = data.find((y) => y.id === prev.id)
          return stillInList ?? prev
        })
      }
    } catch (e) {
      console.error('Failed to fetch school years', e)
    } finally {
      if (isInitialLoad) setIsLoading(false)
    }
  }, [])

  const refetchYears = useCallback(async () => {
    await fetchYears(false)
  }, [fetchYears])

  useEffect(() => {
    void fetchYears(true)
  }, [fetchYears])

  const setSchoolYear = useCallback((year: SchoolYearFromApi | { id: number }) => {
    const id = year.id
    const found = years.find((y) => y.id === id)
    if (found) {
      setStoredSchoolYearId(found.id)
      setSelectedYearState(found)
    }
  }, [years])

  const currentSemester =
    selectedYear?.semesterChangeDate != null
      ? getCurrentSemesterFromSchoolYear(selectedYear.semesterChangeDate)
      : null

  return (
    <SchoolYearContext.Provider
      value={{
        selectedYear: selectedYear ?? null,
        years,
        currentSemester,
        setSchoolYear,
        refetchYears,
        isLoading,
      }}
    >
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
