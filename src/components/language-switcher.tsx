'use client'

import { useRouter, usePathname } from 'next/navigation'
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

  const handleLanguageChange = (value: string) => {
    const currentPath = pathname
    const segments = currentPath.split('/')
    segments[1] = value // Replace the language segment
    const newPath = segments.join('/')
    router.push(newPath)
  }

  // Get current language from pathname
  const currentLang = pathname.split('/')[1]

  return (
    <Select
      defaultValue={currentLang}
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