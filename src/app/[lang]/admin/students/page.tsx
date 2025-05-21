'use client'

import { useTranslation } from 'react-i18next'

export default function StudentsPage() {
  const { t } = useTranslation()

  return (
    <div className="container mx-auto p-4">
      <h1 className="text-2xl font-bold mb-6">{t('admin.students.title')}</h1>
      <div className="bg-white rounded-lg shadow p-6">
        <p className="text-gray-600">
          {t('admin.students.description')}
        </p>
      </div>
    </div>
  )
} 