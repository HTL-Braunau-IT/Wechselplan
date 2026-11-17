'use client'

import { type ReactNode } from 'react'
import { AppShell } from '@/components/layout/app-shell'
import { I18nProvider } from '@/components/providers/i18n-provider'
import { SchoolYearProvider } from '@/contexts/school-year-context'
import { AppConfigProvider, type AppConfig } from '@/contexts/app-config-context'
import { SessionProvider } from 'next-auth/react'

export function Providers({ appConfig, children }: { appConfig: AppConfig; children: ReactNode }) {
  return (
    <SessionProvider>
      <I18nProvider>
        <AppConfigProvider value={appConfig}>
          <SchoolYearProvider>
            <AppShell>{children}</AppShell>
          </SchoolYearProvider>
        </AppConfigProvider>
      </I18nProvider>
    </SessionProvider>
  )
}
