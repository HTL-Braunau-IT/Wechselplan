'use client'

import { useSchoolYear } from '../contexts/school-year-context'
import type { SchoolYear } from '../types/school-year'
import { generateSchoolYearOptions } from '../types/school-year'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

export function SchoolYearSelector() {
  const { selectedYear, setSelectedYear } = useSchoolYear()
  const options = generateSchoolYearOptions()

  return (
    <Select
      value={selectedYear}
      onValueChange={(value: string) => setSelectedYear(value as SchoolYear)}
    >
      <SelectTrigger className="w-[180px]">
        <SelectValue placeholder="Select school year" />
      </SelectTrigger>
      <SelectContent>
        {options.map((option) => (
          <SelectItem key={option.value} value={option.value}>
            {option.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
} 