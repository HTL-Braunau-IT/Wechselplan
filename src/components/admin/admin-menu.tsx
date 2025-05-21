'use client'

import Link from 'next/link'
import { Settings, Users, Trash2, Download } from 'lucide-react'
import { useTranslation } from 'react-i18next'

export function AdminMenu() {
  const { t } = useTranslation(['admin', 'common'])

  return (
    <div className="w-64 bg-white border-r border-gray-200 p-4 min-h-screen">
      <nav className="space-y-2">
        <Link
          href="/admin/students"
          className="flex items-center space-x-2 p-2 hover:bg-gray-100 rounded-lg"
          aria-label={t('studentAdministration')}
        >
          <Users className="h-5 w-5" />
          <span>{t('studentAdministration')}</span>
        </Link>
        <Link
          href="/admin/students/import"
          className="flex items-center space-x-2 p-2 hover:bg-gray-100 rounded-lg"
          aria-label={t('importStudents')}
        >
          <Download className="h-5 w-5" />
          <span>{t('importStudents')}</span>
        </Link>
        <Link
          href="/admin/settings"
          className="flex items-center space-x-2 p-2 hover:bg-gray-100 rounded-lg"
          aria-label={t('common.settings')}
        >
          <Settings className="h-5 w-5" />
          <span>{t('common.settings')}</span>
        </Link>
        <Link
          href="/admin/students/delete-all"
          className="flex items-center space-x-2 p-2 hover:bg-gray-100 rounded-lg w-full text-left text-red-600"
          aria-label={t('deleteAllData')}
        >
          <Trash2 className="h-5 w-5" />
          <span>{t('deleteAllData')}</span>
        </Link>
      </nav>
    </div>
  )
}
