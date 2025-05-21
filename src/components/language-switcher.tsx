'use client'

import { useRouter, usePathname } from 'next/navigation'
import { useTranslation } from 'react-i18next'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

export function LanguageSwitcher() {
  const router = useRouter()
  const pathname = usePathname()
  const { i18n } = useTranslation()

  const handleLanguageChange = async (value: string) => {
    const currentPath = pathname
    const segments = currentPath.split('/')
    segments[1] = value // Replace the language segment
    const newPath = segments.join('/')
    
    // Change the language in i18next
    await i18n.changeLanguage(value)
    
    // Navigate to the new path
    router.push(newPath)
  }

  // Get current language from pathname
  const currentLang = pathname.split('/')[1]

  return (
    <Select
      value={currentLang}
      onValueChange={handleLanguageChange}
    >
      <SelectTrigger className="w-[180px]">
        <SelectValue placeholder="Select language" />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="en">English</SelectItem>
        <SelectItem value="de">Deutsch</SelectItem>
      </SelectContent>
    </Select>
  )
} 