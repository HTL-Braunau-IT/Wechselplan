import type { Metadata } from 'next'
import { Inter } from 'next/font/google'
import './globals.css'
import { Providers } from './providers'
import QueryProvider from '@/providers/query-provider'
import { Toaster } from 'sonner'

const inter = Inter({ subsets: ['latin'] })

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
    <html lang="en">
      <body className={inter.className}>
        <QueryProvider>
          <Providers>
            {children}
            <Toaster />
          </Providers>
        </QueryProvider>
      </body>
    </html>
  )
}
