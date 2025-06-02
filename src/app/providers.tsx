'use client'

import { type ReactNode } from 'react'
import { Header } from '~/components/layout/header'
import { I18nProvider } from '~/components/providers/i18n-provider'
import { SchoolYearProvider } from '~/contexts/school-year-context'
import { SessionProvider } from 'next-auth/react'

export function Providers({ children }: { children: ReactNode }) {
  return (
    <SessionProvider>
      <I18nProvider>
        <SchoolYearProvider>
          <Header />
          <div className="pt-16">
            {children}
          </div>
        </SchoolYearProvider>
      </I18nProvider>
    </SessionProvider>
  )
} 