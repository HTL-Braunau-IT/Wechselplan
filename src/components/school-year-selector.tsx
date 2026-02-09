'use client'

import { useSchoolYear } from '../contexts/school-year-context'
import { useTranslation } from 'react-i18next'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

export function SchoolYearSelector() {
  const { selectedYear, years, setSchoolYear, refetchYears, isLoading } = useSchoolYear()
  const { t } = useTranslation()

  if (isLoading || years.length === 0) {
    return null
  }

  return (
    <Select
      key={selectedYear?.id ?? 'none'}
      value={selectedYear ? String(selectedYear.id) : undefined}
      onOpenChange={(open) => {
        if (open) void refetchYears()
      }}
      onValueChange={(value) => {
        const id = parseInt(value, 10)
        const year = years.find((y) => y.id === id)
        if (year) setSchoolYear(year)
      }}
    >
      <SelectTrigger className="w-[140px]">
        <SelectValue placeholder={t('common.selectSchoolYear')} />
      </SelectTrigger>
      <SelectContent>
        {years.map((year) => (
          <SelectItem key={year.id} value={String(year.id)}>
            {year.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}
