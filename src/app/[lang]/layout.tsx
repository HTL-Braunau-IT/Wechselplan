import type { Metadata } from 'next'
import { Inter } from 'next/font/google'
import './globals.css'
import { Header } from '@/components/layout/header'
import { getDictionary } from '@/lib/dictionary'

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
  const dict = await getDictionary(resolvedParams.lang)

  return (
    <>
      <Header dict={dict} />
      {children}
    </>
  )
} 