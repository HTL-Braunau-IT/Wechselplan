import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

const locales = ['en', 'de']
const defaultLocale = 'en'

export function middleware(request: NextRequest) {
  const pathname = request.nextUrl.pathname

  // Skip locale redirection for translation files
  if (pathname.startsWith('/locales/')) {
    return NextResponse.next()
  }

  // Get the stored language preference from the cookie
  const storedLanguage = request.cookies.get('language')?.value
  const locale = storedLanguage && locales.includes(storedLanguage) ? storedLanguage : defaultLocale

  // If the path starts with a locale, redirect to the same path without the locale
  const localePrefix = `/${locale}`
  if (pathname.startsWith(localePrefix)) {
    const newPathname = pathname.replace(localePrefix, '')
    return NextResponse.redirect(new URL(newPathname || '/', request.url))
  }

  return NextResponse.next()
}

export const config = {
  matcher: [
    // Skip all internal paths (_next)
    '/((?!_next|api|favicon.ico).*)',
  ],
} 