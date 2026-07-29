'use client'

import { type ReactNode } from 'react'
import { AppShell } from '@/components/layout/app-shell'
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
              <AppShell>{children}</AppShell>
            </SchoolYearProvider>
          </LicenseGate>
        </EntitlementsProvider>
      </I18nProvider>
    </SessionProvider>
  )
}
