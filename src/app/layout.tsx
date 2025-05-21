import "~/styles/globals.css";

import type { Metadata } from 'next'
import { Inter } from 'next/font/google'
import { TRPCReactProvider } from '~/trpc/react'
import { SchoolYearProvider } from '~/contexts/school-year-context'

const inter = Inter({ subsets: ['latin'] })

export const metadata: Metadata = {
  title: 'Wechselplan',
  description: 'Wechselplan Application',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <body className={inter.className}>
        <TRPCReactProvider>
          <SchoolYearProvider>
            <div className="pt-16">
              {children}
            </div>
          </SchoolYearProvider>
        </TRPCReactProvider>
      </body>
    </html>
  )
}
