'use client'

import { useTranslation } from 'react-i18next'


export default function StudentsPage() {
  const { t } = useTranslation()

  return (
    <div className="flex min-h-screen">

      <div className="flex-1 p-4">
        <h1 className="text-2xl font-bold mb-6">{t('admin.students.title')}</h1>
        <div className="bg-card rounded-lg shadow p-6">
          <p className="text-muted-foreground">
            {t('admin.students.description')}
          </p>
        </div>
      </div>
    </div>
  )
} 