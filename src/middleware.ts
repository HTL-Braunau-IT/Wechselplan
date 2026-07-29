import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { getToken } from 'next-auth/jwt'
import { isStaffRole, resolveAccessTier, satisfiesTier } from '@/lib/api-access'

const locales = ['en', 'de']
const defaultLocale = 'de'

/**
 * Page prefixes that require a signed-in teacher or admin.
 *
 * `/schedueles` is a historic typo that was linked to before the schedules
 * page was renamed; it stays in the list so old bookmarks keep redirecting
 * instead of falling through unauthenticated.
 */
const STAFF_PAGE_PREFIXES = [
  '/schedule',
  '/schedueles',
  '/admin',
  '/students',
  '/notensammler',
  '/noten',
]

/**
 * Middleware for authentication and locale redirection.
 *
 * Unlike the previous version, `/api` is covered here as well: every API
 * request is checked against the access policy in `lib/api-access`, so a route
 * handler that forgets its own guard is still not reachable anonymously.
 * Entitlement checks for `/notensammler` and `/noten` stay in their layouts and
 * API routes because the Edge runtime cannot call the license server.
 */
export async function middleware(request: NextRequest) {
  const pathname = request.nextUrl.pathname

  // Skip locale redirection for translation files
  if (pathname.startsWith('/locales/')) {
    return NextResponse.next()
  }

  if (pathname.startsWith('/api/')) {
    const tier = resolveAccessTier(pathname, request.method)
    if (tier === 'public') {
      return NextResponse.next()
    }

    const token = await getToken({ req: request })
    if (!satisfiesTier(tier, token?.role, Boolean(token))) {
      return NextResponse.json(
        { error: token ? `Forbidden: ${tier} access required` : 'Unauthorized' },
        { status: token ? 403 : 401 },
      )
    }

    return NextResponse.next()
  }

  if (STAFF_PAGE_PREFIXES.some(prefix => pathname.startsWith(prefix))) {
    const token = await getToken({ req: request })

    if (!token || !isStaffRole(token.role)) {
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
    // Skip Next internals and the favicon; /api is now handled above.
    '/((?!_next|favicon.ico).*)',
  ],
}
