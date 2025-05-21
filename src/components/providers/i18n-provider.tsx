'use client'

import type { PropsWithChildren } from 'react'
import { useEffect, useState } from 'react'
import { I18nextProvider } from 'react-i18next'
import { useParams } from 'next/navigation'
import i18n from '@/lib/i18n'

export function I18nProvider({ children }: PropsWithChildren) {
  const params = useParams()
  const lang = params.lang as string
  const [isReady, setIsReady] = useState(false)

  useEffect(() => {
    const initI18n = async () => {
      try {
        await i18n.changeLanguage(lang)
        setIsReady(true)
      } catch (error) {
        console.error('Failed to initialize i18n:', error)
        setIsReady(true) // Set ready even on error to not block rendering
      }
    }
    initI18n()
  }, [lang])

  if (!isReady) {
    return null
  }

  return <I18nextProvider i18n={i18n}>{children}</I18nextProvider>
} 