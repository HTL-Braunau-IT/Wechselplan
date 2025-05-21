'use client'

import { type ReactNode } from 'react'
import { Header } from '~/components/layout/header'
import { I18nProvider } from '~/components/providers/i18n-provider'

export function Providers({ children }: { children: ReactNode }) {
  return (
    <I18nProvider>
      <Header />
      <div className="pt-16">
        {children}
      </div>
    </I18nProvider>
  )
} 