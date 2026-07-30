import {
  Home,
  CalendarDays,
  CalendarPlus,
  Users,
  School,
  ClipboardList,
  ListChecks,
  ShieldCheck,
  GraduationCap,
  type LucideIcon,
} from 'lucide-react'
import { useSession } from 'next-auth/react'
import { useEntitlements } from '@/contexts/entitlements-context'
import { useTranslation } from 'react-i18next'

export interface NavItem {
  href: string
  label: string
  icon: LucideIcon
  /** Extra hrefs that should also mark this item active (section roots). */
  matchPrefixes?: string[]
}

/**
 * Single source of truth for primary navigation, gated by role and
 * entitlements. Consumed by both the desktop sidebar and the mobile sheet so
 * the two never drift apart.
 */
export function useNavItems(): NavItem[] {
  const { data: session } = useSession()
  const { isFeatureEnabled } = useEntitlements()
  const { t } = useTranslation()
  const role = session?.user?.role

  const items: NavItem[] = [
    { href: '/', label: t('navigation.home'), icon: Home },
    {
      href: '/schedules',
      label: t('navigation.schedules'),
      icon: CalendarDays,
      matchPrefixes: ['/schedule/'],
    },
    {
      href: '/schedule/create',
      label: t('navigation.createSchedule'),
      icon: CalendarPlus,
    },
    { href: '/students', label: t('navigation.students'), icon: Users },
  ]

  // Assigning a class's Klassenvorstand/Klassenleiter decides who may lock the
  // class's grades after the Sokrates transfer, so it is an admin task; the
  // matching API is admin-only too (see lib/api-access).
  if (role === 'admin') {
    items.push({
      href: '/class-settings',
      label: t('navigation.classSettings'),
      icon: School,
    })
    items.push({
      href: '/admin/notenmanagement',
      label: t('navigation.notenmanagement'),
      icon: GraduationCap,
    })
  }

  if (isFeatureEnabled('noten')) {
    items.push({ href: '/noten', label: t('navigation.notenliste'), icon: ListChecks })
  }
  if (isFeatureEnabled('notensammler')) {
    items.push({
      href: '/notensammler',
      label: t('navigation.notensammler'),
      icon: ClipboardList,
    })
  }
  if (role === 'teacher' || role === 'admin') {
    items.push({
      href: '/admin/data/students',
      label: t('navigation.admin'),
      icon: ShieldCheck,
      matchPrefixes: ['/admin'],
    })
  }

  return items
}

/**
 * Resolves the single active nav item for a pathname. The most specific
 * (longest) matching href/prefix wins, so e.g. `/schedule/create/rotation`
 * activates "Create Schedule" rather than also lighting up "Schedules".
 */
export function resolveActiveHref(items: NavItem[], pathname: string): string | null {
  let best: { href: string; len: number } | null = null
  for (const item of items) {
    if (item.href === '/') {
      if (pathname === '/') return '/'
      continue
    }
    const candidates = [item.href, ...(item.matchPrefixes ?? [])]
    for (const candidate of candidates) {
      const boundary = candidate.endsWith('/') ? candidate : candidate + '/'
      if (pathname === candidate || pathname.startsWith(boundary)) {
        if (!best || candidate.length > best.len) best = { href: item.href, len: candidate.length }
      }
    }
  }
  return best?.href ?? null
}
