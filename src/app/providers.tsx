'use client'

import { type ReactNode } from 'react'
import { Header } from '~/components/layout/header'
import { LicenseGate } from '~/components/license-gate'
import { SchoolYearProvider } from '~/contexts/school-year-context'
import { EntitlementsProvider } from '~/contexts/entitlements-context'
import { SessionProvider } from 'next-auth/react'

export function Providers({ children }: { children: ReactNode }) {
  return (
    <SessionProvider>
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
    </SessionProvider>
  )
} 