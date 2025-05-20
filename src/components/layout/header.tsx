'use client'

import { useState } from 'react'
import Link from 'next/link'
import { Menu } from 'lucide-react'
import { SchoolYearSelector } from '../school-year-selector'

export function Header() {
  const [isMenuOpen, setIsMenuOpen] = useState(false)

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
            aria-label="Toggle menu"
          >
            <Menu className="h-6 w-6" />
          </button>
          
          {/* Logo */}
          <Link href="/" className="text-xl font-bold">
            Wechselplan
          </Link>

          {/* School Year Selector */}
          <div className="flex items-center">
            <SchoolYearSelector />
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
              aria-label="Close menu"
            >
              <Menu className="h-6 w-6" />
            </button>
          </div>
          <nav className="mt-8">
            <ul className="space-y-4">
              <li>
                <Link
                  href="/"
                  className="block py-2 hover:text-blue-600"
                  onClick={() => setIsMenuOpen(false)}
                >
                  Home
                </Link>
              </li>
              <li>
                <Link
                  href="/schedules"
                  className="block py-2 hover:text-blue-600"
                  onClick={() => setIsMenuOpen(false)}
                >
                  Schedules
                </Link>
              </li>
              <li>
                <Link
                  href="/students"
                  className="block py-2 hover:text-blue-600"
                  onClick={() => setIsMenuOpen(false)}
                >
                  Students
                </Link>
              </li>
            </ul>
          </nav>
        </div>
      </div>
    </header>
  )
} 