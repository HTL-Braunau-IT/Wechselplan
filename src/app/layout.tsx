import type { Metadata } from 'next'
import './globals.css'
import { Providers } from './providers'
import QueryProvider from '@/providers/query-provider'
import { Toaster } from 'sonner'
import { ThemeProvider } from "~/components/providers/theme-provider"

export const metadata: Metadata = {
  title: 'Wechselplan',
  description: 'Wechselplan - School Schedule Management',
  metadataBase: new URL('http://localhost:3000'),
  alternates: {
    languages: {
      'en': '/en',
      'de': '/de',
    },
  },
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="de" suppressHydrationWarning>
      <body>
        <ThemeProvider
          defaultTheme="system"
        >
          <QueryProvider>
            <Providers>
              {children}
              <Toaster />
            </Providers>
          </QueryProvider>
        </ThemeProvider>
      </body>
    </html>
  )
}
