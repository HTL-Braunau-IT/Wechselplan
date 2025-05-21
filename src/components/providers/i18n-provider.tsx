'use client'

import { useParams } from 'next/navigation'
import { useEffect, useState } from 'react'
import i18n from '@/lib/i18n'

export function I18nProvider({ children }: { children: React.ReactNode }) {
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
        setIsReady(true) // Still set ready to avoid blocking the app
      }
    }

    initI18n()
  }, [lang])

  if (!isReady) {
    return null
  }

  return <>{children}</>
} 