'use client'

import { useState } from 'react'
import Link from 'next/link'
import { Menu } from 'lucide-react'
import { SchoolYearSelector } from '../school-year-selector'
import { LanguageSwitcher } from '../language-switcher'
import { useParams } from 'next/navigation'

interface HeaderProps {
  dict: {
    common: {
      schoolYear: string
    }
    navigation: {
      home: string
      schedules: string
      students: string
      menu: string
      closeMenu: string
    }
  }
}

export function Header({ dict }: HeaderProps) {
  const [isMenuOpen, setIsMenuOpen] = useState(false)
  const params = useParams()
  const lang = params.lang as string

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
            aria-label={dict.navigation.menu}
          >
            <Menu className="h-6 w-6" />
          </button>
          
          {/* Logo */}
          <Link href={`/${lang}`} className="text-xl font-bold">
            Wechselplan
          </Link>

          <div className="flex items-center space-x-4">
            {/* Language Switcher */}
            <LanguageSwitcher />

            {/* School Year Selector */}
            <div className="flex items-center">
              <p className='mr-4'>{dict.common.schoolYear}:</p>
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
              aria-label={dict.navigation.closeMenu}
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
                  {dict.navigation.home}
                </Link>
              </li>
              <li>
                <Link
                  href={`/${lang}/schedules`}
                  className="block py-2 hover:text-blue-600"
                  onClick={() => setIsMenuOpen(false)}
                >
                  {dict.navigation.schedules}
                </Link>
              </li>
              <li>
                <Link
                  href={`/${lang}/students`}
                  className="block py-2 hover:text-blue-600"
                  onClick={() => setIsMenuOpen(false)}
                >
                  {dict.navigation.students}
                </Link>
              </li>
              <li>
                <Link
                  href={`/${lang}/schedule/create`}
                  className="block py-2 hover:text-blue-600"
                  onClick={() => setIsMenuOpen(false)}
                >
                  Plan erstellen
                </Link>
              </li>
            </ul>
          </nav>
        </div>
      </div>
    </header>
  )
} 