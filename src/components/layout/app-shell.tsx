'use client'

import { type ReactNode, useEffect, useRef, useState } from 'react'
import { usePathname } from 'next/navigation'
import { useSession } from 'next-auth/react'
import { TooltipProvider } from '@/components/ui/tooltip'
import { DesktopSidebar, MobileSidebar } from './app-sidebar'
import { Topbar } from './topbar'

const COLLAPSE_KEY = 'wp-sidebar-collapsed'

/**
 * Application chrome: a persistent, collapsible sidebar on large displays and a
 * slide-over sheet on small ones, with a sticky top bar for global controls.
 *
 * The sidebar only appears for authenticated non-student users (students have
 * no navigation targets); everyone else gets the full-width content area with a
 * minimal top bar.
 */
export function AppShell({ children }: { children: ReactNode }) {
  const { data: session } = useSession()
  const pathname = usePathname()
  const [mobileOpen, setMobileOpen] = useState(false)
  const [collapsed, setCollapsed] = useState(false)

  useEffect(() => {
    setCollapsed(localStorage.getItem(COLLAPSE_KEY) === '1')
  }, [])

  // Auto-collapse the sidebar for the schedule-creation wizard, which needs the
  // full width, then restore the user's saved preference when they leave it. We
  // only override on entry (not on every render) so a manual expand mid-wizard
  // is respected, and we never touch localStorage here so the saved preference
  // survives the temporary override.
  const wasInWizardRef = useRef(false)
  useEffect(() => {
    const inWizard = pathname?.startsWith('/schedule/create') ?? false
    if (inWizard && !wasInWizardRef.current) {
      setCollapsed(true)
    } else if (!inWizard && wasInWizardRef.current) {
      setCollapsed(localStorage.getItem(COLLAPSE_KEY) === '1')
    }
    wasInWizardRef.current = inWizard
  }, [pathname])

  const toggleCollapse = () => {
    setCollapsed(prev => {
      const next = !prev
      localStorage.setItem(COLLAPSE_KEY, next ? '1' : '0')
      return next
    })
  }

  const showMenu = Boolean(session && session.user?.role !== 'student')

  return (
    <TooltipProvider delayDuration={200}>
      <div className="bg-background flex min-h-screen">
        {showMenu && (
          <>
            <DesktopSidebar collapsed={collapsed} onToggleCollapse={toggleCollapse} />
            <MobileSidebar open={mobileOpen} onOpenChange={setMobileOpen} />
          </>
        )}
        <div className="flex min-w-0 flex-1 flex-col">
          <Topbar showMenu={showMenu} onOpenMobileNav={() => setMobileOpen(true)} />
          <main className="flex-1">{children}</main>
        </div>
      </div>
    </TooltipProvider>
  )
}
