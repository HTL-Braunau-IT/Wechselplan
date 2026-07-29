'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { Bell, CheckCheck } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { useSession } from 'next-auth/react'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { captureFrontendError } from '@/lib/frontend-error'
import { cn } from '@/lib/utils'
import {
  isKnownNotificationType,
  type NotificationDto,
  type NotificationMessageKey,
  type NotificationParams,
  type NotificationType,
} from '@/types/notifications'

const POLL_MS = 60_000

/**
 * How each notification type turns its stored params into an i18next lookup.
 *
 * Exhaustive over {@link NotificationType} by construction, and the key each
 * entry may return is pinned to `NOTIFICATION_MESSAGE_KEYS`. Adding a type
 * without teaching the bell to read it — or naming a key the catalogue has
 * never heard of — is a compile error, which is the point: the alternative
 * ships as a row that renders its own key.
 */
const MESSAGES: {
  [T in NotificationType]: (
    params: NotificationParams[T],
    semesterLabel: (semester: string) => string,
  ) => { key: NotificationMessageKey<T>; values: Record<string, string | number> }
} = {
  'schedule-created': p => ({ key: 'notifications.scheduleCreated', values: { ...p } }),
  'schedule-updated': p => ({ key: 'notifications.scheduleUpdated', values: { ...p } }),
  'schedule-assignments-changed': p => ({
    key: 'notifications.scheduleAssignmentsChanged',
    values: { ...p },
  }),
  'schedule-rotation-changed': p => ({
    key: 'notifications.scheduleRotationChanged',
    values: { ...p },
  }),
  'grades-entered': p => ({ key: 'notifications.gradesEntered', values: { ...p } }),
  'sokrates-marked': (p, semesterLabel) => ({
    key: 'notifications.sokratesMarked',
    values: { className: p.className, semester: semesterLabel(p.semester) },
  }),
  'sokrates-unmarked': (p, semesterLabel) => ({
    key: 'notifications.sokratesUnmarked',
    values: { className: p.className, semester: semesterLabel(p.semester) },
  }),
  'sokrates-locked': (p, semesterLabel) => ({
    key: p.scope === 'all' ? 'notifications.sokratesLockedAll' : 'notifications.sokratesLockedMine',
    values: { className: p.className, semester: semesterLabel(p.semester) },
  }),
  'sokrates-unlocked': (p, semesterLabel) => ({
    key:
      p.scope === 'all'
        ? 'notifications.sokratesUnlockedAll'
        : 'notifications.sokratesUnlockedMine',
    values: { className: p.className, semester: semesterLabel(p.semester) },
  }),
  'sokrates-change': (p, semesterLabel) => ({
    key: 'notifications.sokratesChange',
    values: { className: p.className, semester: semesterLabel(p.semester), count: p.count },
  }),
}

/**
 * In-app notification bell.
 *
 * Polls rather than streams: the school runs a handful of concurrent staff
 * sessions, and a minute of latency on "someone changed your rotation plan" is
 * not worth a socket.
 *
 * Message text comes from the catalogue only — there are deliberately no inline
 * German defaults for it, because sixteen strings duplicated here would drift
 * from `public/locales/*\/common.json` the first time anyone reworded one. The
 * list waits for the catalogue instead (`ready`), which is also why an untranslated
 * key can never flash into view.
 */
export function NotificationBell() {
  const { t, i18n, ready } = useTranslation()
  const { data: session } = useSession()
  const role = session?.user?.role
  const enabled = role === 'teacher' || role === 'admin'

  const [items, setItems] = useState<NotificationDto[]>([])
  const [unread, setUnread] = useState(0)

  const load = useCallback(async () => {
    if (!enabled) return
    try {
      const res = await fetch('/api/notifications', { cache: 'no-store' })
      if (!res.ok) return
      const data = (await res.json()) as {
        notifications: NotificationDto[]
        unreadCount: number
      }
      setItems(data.notifications ?? [])
      setUnread(data.unreadCount ?? 0)
    } catch (e) {
      captureFrontendError(e, { location: 'notification-bell', type: 'load' })
    }
  }, [enabled])

  useEffect(() => {
    if (!enabled) return
    void load()
    const timer = setInterval(() => void load(), POLL_MS)
    return () => clearInterval(timer)
  }, [enabled, load])

  const acknowledge = useCallback(
    async (body: { id?: number; all?: boolean }) => {
      try {
        const res = await fetch('/api/notifications/acknowledge', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        })
        if (!res.ok) return
        await load()
      } catch (e) {
        captureFrontendError(e, { location: 'notification-bell', type: 'acknowledge' })
      }
    },
    [load],
  )

  const formatTime = useMemo(() => {
    const formatter = new Intl.DateTimeFormat(i18n.language || 'de', {
      day: '2-digit',
      month: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    })
    return (iso: string) => formatter.format(new Date(iso))
  }, [i18n.language])

  const semesterLabel = useCallback(
    (semester: string) =>
      semester === 'first'
        ? t('notensammler.firstSemester', '1. Semester')
        : t('notensammler.secondSemester', '2. Semester'),
    [t],
  )

  /**
   * Renders one row's message, or null when the server sent a type this bundle
   * predates — a stale tab shows one fewer entry rather than a blank card.
   */
  const describe = useCallback(
    (item: NotificationDto): string | null => {
      if (!isKnownNotificationType(item.type)) return null
      // The params were validated by the writer, whose types are generated from
      // the same union; the JSON round trip is what loses that guarantee.
      const build = MESSAGES[item.type] as (
        params: unknown,
        label: (semester: string) => string,
      ) => { key: string; values: Record<string, string | number> }
      const { key, values } = build(item.params ?? {}, semesterLabel)
      return t(key, values)
    },
    [semesterLabel, t],
  )

  // Rows whose type this bundle understands. Anything else is dropped rather
  // than rendered as a blank card — see describe().
  const visible = useMemo(
    () =>
      items.map(item => ({ item, message: describe(item) })).filter(row => row.message !== null),
    [describe, items],
  )

  if (!enabled) return null

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="relative rounded-full"
          aria-label={t('notifications.title', 'Benachrichtigungen')}
        >
          <Bell className="h-5 w-5" />
          {unread > 0 && (
            <span className="bg-destructive text-destructive-foreground absolute -top-0.5 -right-0.5 flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-[10px] font-semibold">
              {unread > 9 ? '9+' : unread}
            </span>
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-[360px] p-0">
        <div className="flex items-center justify-between border-b px-3 py-2">
          <span className="text-sm font-semibold">
            {t('notifications.title', 'Benachrichtigungen')}
          </span>
          {unread > 0 && (
            <Button
              variant="ghost"
              size="sm"
              className="h-7 text-xs"
              onClick={() => void acknowledge({ all: true })}
            >
              <CheckCheck className="mr-1 h-3.5 w-3.5" />
              {t('notifications.markAllRead', 'Alle als erledigt')}
            </Button>
          )}
        </div>
        <div className="max-h-[360px] overflow-y-auto">
          {!ready || visible.length === 0 ? (
            <p className="text-muted-foreground px-3 py-6 text-center text-sm">
              {t('notifications.empty', 'Keine Benachrichtigungen')}
            </p>
          ) : (
            visible.map(({ item, message }) => (
              <div
                key={item.id}
                className={cn('border-b px-3 py-2.5 last:border-b-0', !item.read && 'bg-muted/40')}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    {item.link ? (
                      <Link
                        href={item.link}
                        className="hover:text-foreground text-sm font-medium underline-offset-2 hover:underline"
                      >
                        {message}
                      </Link>
                    ) : (
                      <p className="text-sm font-medium">{message}</p>
                    )}
                    <p className="text-muted-foreground mt-0.5 text-xs">
                      {item.actorName} · {formatTime(item.createdAt)}
                    </p>
                  </div>
                  {!item.read && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 shrink-0 text-xs"
                      onClick={() => void acknowledge({ id: item.id })}
                    >
                      {t('notifications.markRead', 'Erledigt')}
                    </Button>
                  )}
                </div>
              </div>
            ))
          )}
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
