'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Database, Settings } from 'lucide-react'
import {
  adminDataSectionGroups,
  adminDataSections,
} from '@/app/admin/data/_components/data-sections'
import { useEntitlements } from '@/contexts/entitlements-context'
import { cn } from '@/lib/utils'

export function AdminMenu() {
  const pathname = usePathname()
  const { isFeatureEnabled } = useEntitlements()

  const groupedSections = Object.entries(adminDataSectionGroups).map(([id, label]) => ({
    label,
    items: adminDataSections.filter(
      (section) =>
        section.group === id &&
        (!section.requiresFeature || isFeatureEnabled(section.requiresFeature))
    ),
  }))

  return (
    <div className="w-72 bg-background border-r p-4 min-h-screen">
      <div className="mb-4 flex items-center gap-2 px-2">
        <Database className="h-5 w-5" />
        <p className="text-sm font-semibold">Admin</p>
      </div>

      <nav className="space-y-4">
        {groupedSections.map((group) => (
          <div key={group.label} className="space-y-1">
            <p className="px-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
              {group.label}
            </p>
            {group.items.map((item) => {
              const Icon = item.icon
              const href = `/admin/data/${item.slug}`
              const isActive = pathname === href

              return (
                <Link
                  key={item.slug}
                  href={href}
                  className={cn(
                    'flex items-center gap-2 rounded-lg px-2 py-1.5 text-sm hover:bg-accent hover:text-accent-foreground',
                    isActive && 'bg-accent text-accent-foreground'
                  )}
                >
                  <Icon className="h-4 w-4" />
                  <span>{item.label}</span>
                </Link>
              )
            })}
          </div>
        ))}

        <div className="space-y-1 pt-2">
          <p className="px-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Einstellungen
          </p>
          <Link
            href="/admin/settings/settings"
            className={cn(
              'flex items-center gap-2 rounded-lg px-2 py-1.5 text-sm hover:bg-accent hover:text-accent-foreground',
              pathname === '/admin/settings/settings' && 'bg-accent text-accent-foreground'
            )}
          >
            <Settings className="h-4 w-4" />
            <span>Generelle Einstellungen</span>
          </Link>
          <Link
            href="/admin/settings/entra-sync"
            className={cn(
              'flex items-center gap-2 rounded-lg px-2 py-1.5 text-sm hover:bg-accent hover:text-accent-foreground',
              pathname === '/admin/settings/entra-sync' && 'bg-accent text-accent-foreground'
            )}
          >
            <Settings className="h-4 w-4" />
            <span>Entra Sync</span>
          </Link>
        </div>
      </nav>
    </div>
  )
}
