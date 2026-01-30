import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { getToken } from 'next-auth/jwt'

const locales = ['en', 'de']
const defaultLocale = 'de'

/**
 * Middleware for handling authentication and locale redirection for incoming requests.
 *
 * For requests to `/schedule`, `/admin`, `/schedueles`, `/students`, or `/notensammler`, only allows access to authenticated users with the `'teacher'` role; otherwise, redirects to the home page. Skips locale redirection for translation file requests. Redirects requests with a locale prefix in the path to the same path without the prefix, using the preferred language from the `language` cookie if available.
 *
 * @remark
 * Requests to `/schedueles` are also checked for authentication, though this may be a typo for `/schedules`.
 */
export async function middleware(request: NextRequest) {
  const pathname = request.nextUrl.pathname

  // Skip locale redirection for translation files
  if (pathname.startsWith('/locales/')) {
    return NextResponse.next()
  }

  // Check if the path is under /schedule
  if (pathname.startsWith('/schedule')) {
    const token = await getToken({ req: request })
    
    // If no token or not a teacher, redirect to home
    if (!token || token.role !== 'teacher') {
      return NextResponse.redirect(new URL('/', request.url))
    }
  }

  if (pathname.startsWith('/admin')) {
    const token = await getToken({ req: request })
    
    // If no token or not a teacher, redirect to home
    if (!token || token.role !== 'teacher') {
      return NextResponse.redirect(new URL('/', request.url))
    }
  }

  if (pathname.startsWith('/schedueles')) {
    const token = await getToken({ req: request })
    
    // If no token or not a teacher, redirect to home
    if (!token || token.role !== 'teacher') {
      return NextResponse.redirect(new URL('/', request.url))
    }
  }

  if (pathname.startsWith('/students')) {
    const token = await getToken({ req: request })
    
    // If no token or not a teacher, redirect to home
    if (!token || token.role !== 'teacher') {
      return NextResponse.redirect(new URL('/', request.url))
    }
  }

  if (pathname.startsWith('/notensammler')) {
    const token = await getToken({ req: request })
    
    // If no token or not a teacher, redirect to home
    if (!token || token.role !== 'teacher') {
      return NextResponse.redirect(new URL('/', request.url))
    }
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