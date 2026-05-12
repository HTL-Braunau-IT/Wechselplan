import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { getToken } from 'next-auth/jwt'

function isTeacherOrAdminRole(role: unknown): boolean {
  return role === 'teacher' || role === 'admin'
}

/**
 * Middleware for handling authentication on protected routes.
 *
 * For requests to `/schedule`, `/admin`, `/schedueles`, `/notensammler`, or `/noten`, only allows access to authenticated users with the `'teacher'` or `'admin'` role; otherwise, redirects to the home page.
 *
 * @remark
 * Requests to `/schedueles` are also checked for authentication, though this may be a typo for `/schedules`.
 */
export async function middleware(request: NextRequest) {
  const pathname = request.nextUrl.pathname

  // Check if the path is under /schedule
  if (pathname.startsWith('/schedule')) {
    const token = await getToken({ req: request })
    
    // If no token or no teacher/admin role, redirect to home
    if (!token || !isTeacherOrAdminRole(token.role)) {
      return NextResponse.redirect(new URL('/', request.url))
    }
  }

  if (pathname.startsWith('/admin')) {
    const token = await getToken({ req: request })
    
    // If no token or no teacher/admin role, redirect to home
    if (!token || !isTeacherOrAdminRole(token.role)) {
      return NextResponse.redirect(new URL('/', request.url))
    }
  }

  if (pathname.startsWith('/schedueles')) {
    const token = await getToken({ req: request })
    
    // If no token or no teacher/admin role, redirect to home
    if (!token || !isTeacherOrAdminRole(token.role)) {
      return NextResponse.redirect(new URL('/', request.url))
    }
  }

  // Entitlements for /notensammler and /noten are enforced in their layouts and API routes, not here (Edge runtime cannot call the license server).
  if (pathname.startsWith('/notensammler')) {
    const token = await getToken({ req: request })
    
    // If no token or no teacher/admin role, redirect to home
    if (!token || !isTeacherOrAdminRole(token.role)) {
      return NextResponse.redirect(new URL('/', request.url))
    }
  }

  if (pathname.startsWith('/noten')) {
    const token = await getToken({ req: request })
    
    if (!token || !isTeacherOrAdminRole(token.role)) {
      return NextResponse.redirect(new URL('/', request.url))
    }
  }

  return NextResponse.next()
}

export const config = {
  matcher: [
    // Skip all internal paths (_next)
    '/((?!_next|api|favicon.ico).*)',
  ],
} 