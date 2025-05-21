'use client'

import Link from 'next/link'
import { Settings, Users, Trash2, Download } from 'lucide-react'
import { useTranslation } from 'react-i18next'

interface AdminMenuProps {
  lang: string
}

export function AdminMenu({ lang }: AdminMenuProps) {
  const { t } = useTranslation()

  return (
    <div className="w-64 bg-white border-r border-gray-200 p-4 min-h-screen">
      <div className="space-y-2">
        <Link
          href={`/${lang}/admin/students`}
          className="flex items-center space-x-2 p-2 hover:bg-gray-100 rounded-lg"
        >
          <Users className="h-5 w-5" />
          <span>{t('admin.studentAdministration')}</span>
        </Link>
        <Link
          href={`/${lang}/admin/students/import`}
          className="flex items-center space-x-2 p-2 hover:bg-gray-100 rounded-lg"
        >
          <Download className="h-5 w-5" />
          <span>{t('admin.importStudents')}</span>
        </Link>
        <Link
          href={`/${lang}/admin/settings`}
          className="flex items-center space-x-2 p-2 hover:bg-gray-100 rounded-lg"
        >
          <Settings className="h-5 w-5" />
          <span>{t('common.settings')}</span>
        </Link>
        <Link
          href={`/${lang}/admin/students/delete-all`}
          className="flex items-center space-x-2 p-2 hover:bg-gray-100 rounded-lg w-full text-left text-red-600"
        >
          <Trash2 className="h-5 w-5" />
          <span>{t('admin.deleteAllData')}</span>
        </Link>
      </div>
    </div>
  )
} 