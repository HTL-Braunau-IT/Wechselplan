'use client'

import { useCallback, useEffect, useState } from 'react'
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
import { getGradeDisplayText } from '@/lib/grades'
import { cn } from '@/lib/utils'

interface SokratesNotification {
  id: number
  type: 'sokrates-change'
  classId: number
  className: string
  semester: string
  studentName: string
  subjectTeacherName: string
  oldGrade: number | null
  newGrade: number | null
  changedByName: string
  changedAt: string
  acknowledged: boolean
}

const POLL_MS = 60_000

const formatGrade = (grade: number | null): string =>
  grade === null ? '—' : getGradeDisplayText(grade)

/**
 * In-app notification bell. Currently surfaces Sokrates change notices for a
 * class lead: a subject teacher changed a grade after the class was marked as
 * entered into Sokrates, so it may need to be corrected there too.
 */
export function NotificationBell() {
  const { t } = useTranslation()
  const { data: session } = useSession()
  const role = session?.user?.role
  const enabled = role === 'teacher' || role === 'admin'

  const [items, setItems] = useState<SokratesNotification[]>([])
  const [unread, setUnread] = useState(0)

  const load = useCallback(async () => {
    if (!enabled) return
    try {
      const res = await fetch('/api/notifications', { cache: 'no-store' })
      if (!res.ok) return
      const data = (await res.json()) as {
        notifications: SokratesNotification[]
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

  if (!enabled) return null

  const semesterLabel = (semester: string) =>
    semester === 'first'
      ? t('notensammler.firstSemester', '1. Semester')
      : t('notensammler.secondSemester', '2. Semester')

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
          {items.length === 0 ? (
            <p className="text-muted-foreground px-3 py-6 text-center text-sm">
              {t('notifications.empty', 'Keine Benachrichtigungen')}
            </p>
          ) : (
            items.map(item => (
              <div
                key={item.id}
                className={cn(
                  'border-b px-3 py-2.5 last:border-b-0',
                  !item.acknowledged && 'bg-muted/40',
                )}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-sm font-medium">
                      {t('notifications.sokratesTitle', 'Notenänderung nach Sokrates-Übertragung')}
                    </p>
                    <p className="text-muted-foreground mt-0.5 text-xs">
                      <Link
                        href={`/notensammler?class=${encodeURIComponent(item.className)}`}
                        className="hover:text-foreground underline underline-offset-2"
                      >
                        {item.className}
                      </Link>{' '}
                      · {semesterLabel(item.semester)} · {item.studentName}
                    </p>
                    <p className="mt-1 text-xs">
                      {item.subjectTeacherName}:{' '}
                      <span className="font-medium">{formatGrade(item.oldGrade)}</span> →{' '}
                      <span className="font-medium">{formatGrade(item.newGrade)}</span>
                    </p>
                    <p className="text-muted-foreground mt-0.5 text-[11px]">
                      {t('notifications.changedBy', 'Geändert von')} {item.changedByName}
                    </p>
                  </div>
                  {!item.acknowledged && (
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
