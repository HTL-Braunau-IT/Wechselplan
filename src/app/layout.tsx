import type { Metadata } from 'next'
import { connection } from 'next/server'
import './globals.css'
import { Providers } from './providers'
import QueryProvider from '@/providers/query-provider'
import { Toaster } from 'sonner'
import { ThemeProvider } from '@/components/providers/theme-provider'
import { isNotenmanagementConfigured } from '@/lib/notenmanagement/config'
import type { AppConfig } from '@/contexts/app-config-context'

export const metadata: Metadata = {
  title: 'Wechselplan',
  description: 'Wechselplan - School Schedule Management',
  metadataBase: new URL('http://localhost:3000'),
  alternates: {
    languages: {
      en: '/en',
      de: '/de',
    },
  },
}

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  // Opt out of build-time prerendering: the config below must come from the
  // running container's env, since one image is deployed to every school.
  await connection()
  const appConfig: AppConfig = { notenmanagementEnabled: isNotenmanagementConfigured() }

  return (
    <html lang="de" suppressHydrationWarning>
      <body>
        <ThemeProvider defaultTheme="system">
          <QueryProvider>
            <Providers appConfig={appConfig}>
              {children}
              <Toaster />
            </Providers>
          </QueryProvider>
        </ThemeProvider>
      </body>
    </html>
  )
}
