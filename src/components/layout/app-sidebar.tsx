'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { PanelLeftClose, PanelLeftOpen } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { cn } from '@/lib/utils'
import { Sheet, SheetContent, SheetTitle } from '@/components/ui/sheet'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { useNavItems, resolveActiveHref, type NavItem } from './nav-items'

function BrandMark({ collapsed }: { collapsed?: boolean }) {
  const { t } = useTranslation()
  return (
    <Link href="/" className="flex items-center gap-2.5 overflow-hidden" aria-label="Wechselplan">
      <svg
        viewBox="0 0 64 64"
        className="text-primary h-8 w-8 shrink-0"
        role="img"
        aria-hidden="true"
      >
        <rect width="64" height="64" rx="15" fill="currentColor" />
        <path
          d="M14 19 L23.5 46 L32 31 L40.5 46 L50 19"
          fill="none"
          stroke="#fff"
          strokeWidth="7"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <circle cx="50" cy="19" r="4" fill="#FBBF24" />
      </svg>
      {!collapsed && (
        <span className="truncate text-base font-semibold tracking-tight">
          {t('common.appName')}
        </span>
      )}
    </Link>
  )
}

function NavLink({
  item,
  active,
  collapsed,
  onNavigate,
}: {
  item: NavItem
  active: boolean
  collapsed?: boolean
  onNavigate?: () => void
}) {
  const Icon = item.icon
  const link = (
    <Link
      href={item.href}
      onClick={onNavigate}
      aria-current={active ? 'page' : undefined}
      className={cn(
        'group flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
        collapsed && 'justify-center px-0',
        active
          ? 'bg-sidebar-accent text-sidebar-accent-foreground'
          : 'text-muted-foreground hover:bg-sidebar-accent/60 hover:text-sidebar-accent-foreground',
      )}
    >
      <Icon className={cn('h-5 w-5 shrink-0', active && 'text-primary')} />
      {!collapsed && <span className="truncate">{item.label}</span>}
    </Link>
  )

  if (collapsed) {
    return (
      <Tooltip>
        <TooltipTrigger asChild>{link}</TooltipTrigger>
        <TooltipContent side="right">{item.label}</TooltipContent>
      </Tooltip>
    )
  }
  return link
}

function SidebarNav({ collapsed, onNavigate }: { collapsed?: boolean; onNavigate?: () => void }) {
  const items = useNavItems()
  const pathname = usePathname()
  const activeHref = resolveActiveHref(items, pathname)
  return (
    <nav className="flex flex-1 flex-col gap-1 overflow-y-auto p-3">
      {items.map(item => (
        <NavLink
          key={item.href}
          item={item}
          active={item.href === activeHref}
          collapsed={collapsed}
          onNavigate={onNavigate}
        />
      ))}
    </nav>
  )
}

/** Persistent desktop sidebar with an icon-rail collapse mode. */
export function DesktopSidebar({
  collapsed,
  onToggleCollapse,
}: {
  collapsed: boolean
  onToggleCollapse: () => void
}) {
  const { t } = useTranslation()
  return (
    <aside
      className={cn(
        'bg-sidebar text-sidebar-foreground sticky top-0 hidden h-screen shrink-0 flex-col border-r transition-[width] duration-200 lg:flex',
        collapsed ? 'w-[4.5rem]' : 'w-64',
      )}
    >
      <div
        className={cn(
          'flex h-16 items-center border-b px-4',
          collapsed ? 'justify-center' : 'justify-between',
        )}
      >
        {!collapsed && <BrandMark />}
        <button
          type="button"
          onClick={onToggleCollapse}
          aria-label={collapsed ? t('navigation.menu') : t('navigation.closeMenu')}
          className="text-muted-foreground hover:bg-accent hover:text-accent-foreground flex h-8 w-8 items-center justify-center rounded-md transition-colors"
        >
          {collapsed ? (
            <PanelLeftOpen className="h-5 w-5" />
          ) : (
            <PanelLeftClose className="h-5 w-5" />
          )}
        </button>
      </div>
      <SidebarNav collapsed={collapsed} />
    </aside>
  )
}

/** Mobile navigation as a slide-over sheet. */
export function MobileSidebar({
  open,
  onOpenChange,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="left" className="bg-sidebar text-sidebar-foreground w-72 p-0">
        <SheetTitle className="sr-only">Navigation</SheetTitle>
        <div className="flex h-16 items-center border-b px-4">
          <BrandMark />
        </div>
        <SidebarNav onNavigate={() => onOpenChange(false)} />
      </SheetContent>
    </Sheet>
  )
}
