'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { Menu, LogIn, LogOut } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { useSession, signIn, signOut } from 'next-auth/react'
import { LanguageSwitcher } from '../language-switcher'
import { ThemeToggle } from '@/components/theme-toggle'
import { SchoolYearSelector } from '@/components/school-year-selector'
import { Button } from '@/components/ui/button'
import { Avatar, initialsFrom } from '@/components/ui/avatar'
import { SupportDialog } from '@/components/support-dialog'
import { NotificationBell } from '@/components/notification-bell'
import { ChangelogDialog } from '@/components/changelog-dialog'
import { useGitHubVersion } from '@/hooks/use-github-version'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'

/**
 * Slim application top bar. On small screens it exposes the navigation via a
 * hamburger that opens the mobile sidebar; on large screens the sidebar is
 * persistent and the bar carries only global controls and the user menu.
 */
export function Topbar({
  showMenu,
  onOpenMobileNav,
}: {
  showMenu: boolean
  onOpenMobileNav: () => void
}) {
  const { t } = useTranslation()
  const { data: session } = useSession()
  const [isChangelogOpen, setIsChangelogOpen] = useState(false)
  const { version, release, allReleases, loading } = useGitHubVersion()

  const displayName = useMemo(() => {
    const fullName = [session?.user?.firstName, session?.user?.lastName]
      .filter(Boolean)
      .join(' ')
      .trim()
    if (fullName) return fullName
    const name = session?.user?.name?.trim()
    if (name) return name
    return session?.user?.email?.trim() ?? ''
  }, [session?.user?.firstName, session?.user?.lastName, session?.user?.name, session?.user?.email])

  const profileInitials = useMemo(
    () =>
      initialsFrom(session?.user?.firstName, session?.user?.lastName, session?.user?.name ?? ''),
    [session?.user?.firstName, session?.user?.lastName, session?.user?.name],
  )

  return (
    <header className="bg-background/80 supports-[backdrop-filter]:bg-background/60 sticky top-0 z-30 flex h-16 items-center gap-2 border-b px-4 backdrop-blur sm:px-6">
      {showMenu && (
        <button
          type="button"
          onClick={onOpenMobileNav}
          className="hover:bg-accent hover:text-accent-foreground -ml-1 flex h-9 w-9 items-center justify-center rounded-md lg:hidden"
          aria-label={t('navigation.menu')}
        >
          <Menu className="h-5 w-5" />
        </button>
      )}

      {/* Brand: shown on mobile, or whenever there is no sidebar to carry it. */}
      <Link href="/" className={showMenu ? 'text-lg font-bold lg:hidden' : 'text-lg font-bold'}>
        {t('common.appName')}
      </Link>

      <div className="ml-auto flex items-center gap-1 sm:gap-2">
        <SchoolYearSelector />
        <SupportDialog />

        <button
          onClick={() => setIsChangelogOpen(true)}
          className="text-muted-foreground hover:text-foreground hidden cursor-pointer text-xs transition-colors sm:block"
          title={t('navigation.changelog')}
          disabled={loading || !release}
        >
          v{version.startsWith('v') ? version.slice(1) : version}
        </button>
        <ChangelogDialog
          release={release}
          allReleases={allReleases}
          open={isChangelogOpen}
          onOpenChange={setIsChangelogOpen}
        />

        <ThemeToggle />
        <LanguageSwitcher />
        {session && <NotificationBell />}

        {session ? (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="relative rounded-full">
                <Avatar src="/api/me/photo" fallback={profileInitials} size="sm" />
                <span className="sr-only">{t('profile.menu')}</span>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuLabel>
                <div className="flex flex-col space-y-1">
                  <p className="text-sm font-medium">{displayName}</p>
                  <p className="text-muted-foreground text-xs">
                    {t(`profile.role.${session.user?.role}`)}
                  </p>
                </div>
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => signOut()}>
                <LogOut className="mr-2 h-4 w-4" />
                <span>{t('profile.logout')}</span>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        ) : (
          <Button variant="ghost" size="icon" onClick={() => signIn()} title={t('auth.login')}>
            <LogIn className="h-5 w-5" />
          </Button>
        )}
      </div>
    </header>
  )
}
