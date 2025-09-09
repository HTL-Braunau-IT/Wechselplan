'use client'

import { useEffect, useState } from 'react'
import i18n from '@/lib/i18n'

export function I18nProvider({ children }: { children: React.ReactNode }) {
  const [isReady, setIsReady] = useState(false)

  useEffect(() => {
    const initI18n = async () => {
      try {
        // Initialize with the current language or default to 'de'
        const currentLang = localStorage.getItem('language') ?? 'de'
        await i18n.changeLanguage(currentLang)
        setIsReady(true)
      } catch (error) {
        console.error('Failed to initialize i18n:', error)
        setIsReady(true) // Still set ready to avoid blocking the app
      }
    }

    void initI18n()
  }, [])

  if (!isReady) {
    return null
  }

  return <>{children}</>
} 