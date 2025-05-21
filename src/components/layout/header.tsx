'use client'

import { useState } from 'react'
import Link from 'next/link'
import { Menu } from 'lucide-react'
import { SchoolYearSelector } from '../school-year-selector'
import { LanguageSwitcher } from '../language-switcher'
import { useParams } from 'next/navigation'
import { useTranslation } from 'react-i18next'

export function Header() {
  const [isMenuOpen, setIsMenuOpen] = useState(false)
  const params = useParams()
  const lang = params.lang as string
  const { t } = useTranslation()

  const toggleMenu = () => {
    setIsMenuOpen(!isMenuOpen)
  }

  return (
    <header className="fixed top-0 left-0 right-0 z-50 bg-white border-b border-gray-200">
      <div className="container mx-auto px-4">
        <div className="flex items-center justify-between h-16">
          <button
            onClick={toggleMenu}
            className="p-2 rounded-md hover:bg-gray-100 focus:outline-none"
            aria-label={t('navigation.menu')}
          >
            <Menu className="h-6 w-6" />
          </button>
          
          {/* Logo */}
          <Link href={`/${lang}`} className="text-xl font-bold">
            {t('common.appName')}
          </Link>

          <div className="flex items-center space-x-4">
            {/* Language Switcher */}
            <LanguageSwitcher />

            {/* School Year Selector */}
            <div className="flex items-center">
              <p className='mr-4'>{t('common.schoolYear')}:</p>
              <div className="flex items-center">
                <SchoolYearSelector />
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Navigation Menu - Slides in from left */}
      <div
        className={`fixed top-0 left-0 h-full w-64 bg-white shadow-lg transform transition-transform duration-300 ease-in-out ${
          isMenuOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <div className="p-4">
          <div className="flex justify-end">
            <button
              onClick={toggleMenu}
              className="p-2 rounded-md hover:bg-gray-100 focus:outline-none"
              aria-label={t('navigation.closeMenu')}
            >
              <Menu className="h-6 w-6" />
            </button>
          </div>
          <nav className="mt-8">
            <ul className="space-y-4">
              <li>
                <Link
                  href={`/${lang}`}
                  className="block py-2 hover:text-blue-600"
                  onClick={() => setIsMenuOpen(false)}
                >
                  {t('navigation.home')}
                </Link>
              </li>
              <li>
                <Link
                  href={`/${lang}/schedules`}
                  className="block py-2 hover:text-blue-600"
                  onClick={() => setIsMenuOpen(false)}
                >
                  {t('navigation.schedules')}
                </Link>
              </li>
              <li>
                <Link
                  href={`/${lang}/students`}
                  className="block py-2 hover:text-blue-600"
                  onClick={() => setIsMenuOpen(false)}
                >
                  {t('navigation.students')}
                </Link>
              </li>
              <li>
                <Link
                  href={`/${lang}/schedule/create`}
                  className="block py-2 hover:text-blue-600"
                  onClick={() => setIsMenuOpen(false)}
                >
                  {t('navigation.createSchedule')}
                </Link>
              </li>
              <li>
                <Link
                  href={`/${lang}/admin/students`}
                  className="block py-2 hover:text-blue-600"
                  onClick={() => setIsMenuOpen(false)}
                >
                  {t('navigation.admin')}
                </Link>
              </li>
            </ul>
          </nav>
        </div>
      </div>
    </header>
  )
} 