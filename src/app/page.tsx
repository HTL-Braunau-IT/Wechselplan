'use client'

import { useTranslation } from 'react-i18next'

export default function Home() {
  const { t } = useTranslation()
  
  return (
    <main className="flex min-h-screen flex-col items-center justify-between p-24">
      <div className="z-10 max-w-5xl w-full items-center justify-between font-mono text-sm">
        <h1 className="text-4xl font-bold mb-8">{t('common.welcome')}</h1>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="p-4 border rounded-lg">
            <h2 className="text-2xl font-semibold mb-4">{t('navigation.dashboard')}</h2>
            <p>{t('common.welcome')}</p>
          </div>
          <div className="p-4 border rounded-lg">
            <h2 className="text-2xl font-semibold mb-4">{t('navigation.profile')}</h2>
            <p>{t('common.welcome')}</p>
          </div>
        </div>
      </div>
    </main>
  )
}
