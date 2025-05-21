import "~/styles/globals.css";

import type { Metadata } from 'next'
import { Inter } from 'next/font/google'
import { TRPCReactProvider } from '~/trpc/react'
import { SchoolYearProvider } from '~/contexts/school-year-context'

const inter = Inter({ subsets: ['latin'] })

export const metadata: Metadata = {
  title: 'Wechselplan',
  description: 'Wechselplan für die Schule',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html>
      <body className={inter.className}>
        <TRPCReactProvider>
          <SchoolYearProvider>
            {children}
          </SchoolYearProvider>
        </TRPCReactProvider>
      </body>
    </html>
  )
}
