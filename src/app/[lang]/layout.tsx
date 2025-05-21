import type { Metadata } from 'next'
import { Inter } from 'next/font/google'
import './globals.css'
import { Header } from '~/components/layout/header'
import { I18nProvider } from '~/components/providers/i18n-provider'

const inter = Inter({ subsets: ['latin'] })

export const metadata: Metadata = {
  title: 'Wechselplan',
  description: 'Wechselplan Application',
}

export default function LangLayout({
  children,
  params,
}: {
  children: React.ReactNode
  params: { lang: string }
}) {
  return (
    <I18nProvider>
      <Header />
      <div className="pt-16">
        {children}
      </div>
    </I18nProvider>
  )
} 