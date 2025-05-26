'use client'

import Link from 'next/link'
import { Settings, Users, Trash2, Download, GraduationCap, Calendar, Clock } from 'lucide-react'
import { useTranslation } from 'react-i18next'

export function AdminMenu() {
  const { t } = useTranslation(['admin', 'common'])

  return (
    <div className="w-64 bg-background border-r p-4 min-h-screen">
      <nav className="space-y-2">
        <Link
          href="/admin/students"
          className="flex items-center space-x-2 p-2 hover:bg-accent hover:text-accent-foreground rounded-lg"
          aria-label={t('studentAdministration')}
        >
          <Users className="h-5 w-5" />
          <span>{t('studentAdministration')}</span>
        </Link>
        <Link
          href="/admin/students/import"
          className="flex items-center space-x-2 p-2 hover:bg-accent hover:text-accent-foreground rounded-lg"
          aria-label={t('importStudents')}
        >
          <Download className="h-5 w-5" />
          <span>{t('importStudents')}</span>
        </Link>
        <Link
          href="/admin/teachers/import"
          className="flex items-center space-x-2 p-2 hover:bg-accent hover:text-accent-foreground rounded-lg"
          aria-label={t('importTeachers')}
        >
          <GraduationCap className="h-5 w-5" />
          <span>{t('importTeachers')}</span>
        </Link>
        <Link
          href="/admin/settings"
          className="flex items-center space-x-2 p-2 hover:bg-accent hover:text-accent-foreground rounded-lg"
          aria-label={t('settings.title')}
        >
          <Settings className="h-5 w-5" />
          <span>{t('settings.title')}</span>
        </Link>
        <Link
          href="/admin/settings/holidays"
          className="flex items-center space-x-2 p-2 hover:bg-accent hover:text-accent-foreground rounded-lg"
          aria-label={t('settings.holidays.title')}
        >
          <Calendar className="h-5 w-5" />
          <span>{t('settings.holidays.title')}</span>
        </Link>
        <Link
          href="/admin/settings/times"
          className="flex items-center space-x-2 p-2 hover:bg-accent hover:text-accent-foreground rounded-lg"
          aria-label={t('settings.times.title')}
        >
          <Clock className="h-5 w-5" />
          <span>{t('settings.times.title')}</span>
        </Link>
        <Link
          href="/admin/settings/import"
          className="flex items-center space-x-2 p-2 hover:bg-accent hover:text-accent-foreground rounded-lg"
          aria-label={t('importData')}
        >
          <Download className="h-5 w-5" />
          <span>{t('importData')}</span>
        </Link>
        <Link
          href="/admin/students/delete-all"
          className="flex items-center space-x-2 p-2 hover:bg-accent hover:text-accent-foreground rounded-lg w-full text-left text-destructive"
          aria-label={t('deleteAllData')}
        >
          <Trash2 className="h-5 w-5" />
          <span>{t('deleteAllData')}</span>
        </Link>
      </nav>
    </div>
  )
}
