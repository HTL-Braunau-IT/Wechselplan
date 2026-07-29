'use client'

import { useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Database, Menu, Settings } from 'lucide-react'
import {
  adminDataSectionGroups,
  adminDataSections,
} from '@/app/admin/data/_components/data-sections'
import { useEntitlements } from '@/contexts/entitlements-context'
import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet'
import { cn } from '@/lib/utils'

const SETTINGS_LINKS = [{ href: '/admin/settings/entra-sync', label: 'Entra Sync', icon: Settings }]

function AdminNav({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname()
  const { isFeatureEnabled } = useEntitlements()

  const groupedSections = Object.entries(adminDataSectionGroups).map(([id, label]) => ({
    label,
    items: adminDataSections.filter(
      section =>
        section.group === id &&
        (!section.requiresFeature || isFeatureEnabled(section.requiresFeature)),
    ),
  }))

  const linkClass = (active: boolean) =>
    cn(
      'flex items-center gap-2 rounded-lg px-2 py-1.5 text-sm transition-colors',
      'hover:bg-accent hover:text-accent-foreground',
      active && 'bg-accent text-accent-foreground font-medium',
    )

  return (
    <nav className="space-y-4">
      {groupedSections.map(group => (
        <div key={group.label} className="space-y-1">
          <p className="text-muted-foreground px-2 text-xs font-medium tracking-wide uppercase">
            {group.label}
          </p>
          {group.items.map(item => {
            const Icon = item.icon
            const href = `/admin/data/${item.slug}`
            return (
              <Link
                key={item.slug}
                href={href}
                onClick={onNavigate}
                className={linkClass(pathname === href)}
              >
                <Icon className="h-4 w-4 shrink-0" />
                <span className="truncate">{item.label}</span>
              </Link>
            )
          })}
        </div>
      ))}

      <Separator />

      <div className="space-y-1">
        <p className="text-muted-foreground px-2 text-xs font-medium tracking-wide uppercase">
          Einstellungen
        </p>
        {SETTINGS_LINKS.map(({ href, label, icon: Icon }) => (
          <Link
            key={href}
            href={href}
            onClick={onNavigate}
            className={linkClass(pathname === href)}
          >
            <Icon className="h-4 w-4 shrink-0" />
            <span className="truncate">{label}</span>
          </Link>
        ))}
      </div>
    </nav>
  )
}

/**
 * Admin navigation.
 *
 * Below `lg` this is a drawer rather than a permanently visible column: the
 * sidebar used to be a fixed `w-72 min-h-screen` with no breakpoint, which took
 * a third of a laptop viewport and pushed the data tables off-screen.
 */
export function AdminMenu() {
  // The drawer closes via each link's onNavigate; nothing else can navigate
  // from inside it.
  const [isOpen, setIsOpen] = useState(false)

  return (
    <>
      <Sheet open={isOpen} onOpenChange={setIsOpen}>
        <div className="bg-background sticky top-16 z-30 flex items-center gap-2 border-b px-4 py-2 lg:hidden">
          <SheetTrigger asChild>
            <Button variant="ghost" size="sm">
              <Menu className="mr-2 h-4 w-4" />
              Menü
            </Button>
          </SheetTrigger>
        </div>

        <SheetContent side="left" className="w-72 max-w-[85vw] overflow-y-auto p-4">
          <SheetHeader className="mb-4 px-2">
            <SheetTitle className="flex items-center gap-2 text-sm font-semibold">
              <Database className="h-5 w-5" />
              Admin
            </SheetTitle>
          </SheetHeader>
          <AdminNav onNavigate={() => setIsOpen(false)} />
        </SheetContent>
      </Sheet>

      <aside className="bg-background hidden w-64 shrink-0 border-r p-4 lg:block xl:w-72">
        <div className="sticky top-20">
          <div className="mb-4 flex items-center gap-2 px-2">
            <Database className="h-5 w-5" />
            <p className="text-sm font-semibold">Admin</p>
          </div>
          <AdminNav />
        </div>
      </aside>
    </>
  )
}
