'use client'

import { type ReactNode } from 'react'
import { Header } from '~/components/layout/header'
import { I18nProvider } from '~/components/providers/i18n-provider'
import { SchoolYearProvider } from '~/contexts/school-year-context'

export function Providers({ children }: { children: ReactNode }) {
  return (
    <I18nProvider>
      <SchoolYearProvider>
        <Header />
        <div className="pt-16">
          {children}
        </div>
      </SchoolYearProvider>
    </I18nProvider>
  )
} 