import type { Metadata } from 'next'
import { Inter } from 'next/font/google'
import './globals.css'
import { Header } from '@/components/layout/header'
import { I18nProvider } from '@/components/providers/i18n-provider'

const inter = Inter({ subsets: ['latin'] })

export const metadata: Metadata = {
  title: 'Wechselplan',
  description: 'Wechselplan Application',
}

export default async function LangLayout({
  children,
  params,
}: {
  children: React.ReactNode
  params: { lang: string }
}) {
  const resolvedParams = await Promise.resolve(params)
  return (
    <html lang={resolvedParams.lang}>
      <body className={inter.className}>
        <I18nProvider>
          <Header />
          {children}
        </I18nProvider>
      </body>
    </html>
  )
} 