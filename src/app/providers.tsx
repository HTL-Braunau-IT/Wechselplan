'use client'

import { type ReactNode } from 'react'
import { Header } from '@/components/layout/header'
import { LicenseGate } from '@/components/license-gate'
import { I18nProvider } from '@/components/providers/i18n-provider'
import { SchoolYearProvider } from '@/contexts/school-year-context'
import { EntitlementsProvider } from '@/contexts/entitlements-context'
import { SessionProvider } from 'next-auth/react'

export function Providers({ children }: { children: ReactNode }) {
  return (
    <SessionProvider>
      <I18nProvider>
        <EntitlementsProvider>
          <LicenseGate>
            <SchoolYearProvider>
              <Header />
              <div className="pt-16">
                {children}
              </div>
            </SchoolYearProvider>
          </LicenseGate>
        </EntitlementsProvider>
      </I18nProvider>
    </SessionProvider>
  )
} 