'use client'

import { useState, useRef, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { cn } from '@/lib/utils'
import { useEntitlements } from '@/contexts/entitlements-context'

const PHOTO_SIZE_SMALL = 36
const PHOTO_SIZE_LARGE = 120
const POPOVER_OFFSET = 4

export interface StudentPhotoProps {
  studentId: number
  firstName?: string
  lastName?: string
  /** Display size in pixels for the small avatar. Default 36 */
  size?: number
  /** Optional class for the trigger wrapper (avatar + name) */
  className?: string
  /** If true, show only the avatar (no name text next to it). */
  avatarOnly?: boolean
  /** Name display: "lastName, firstName" when true, else "firstName lastName" or just initials. */
  nameFormat?: 'lastFirst' | 'firstLast'
  /** Content to show next to the avatar (e.g. name). If not provided, uses lastName, firstName. */
  children?: React.ReactNode
  /** If true, defers image loading until the avatar is in/near viewport. */
  lazy?: boolean
}

/**
 * Renders a small student photo (or initials fallback) and shows a larger photo + name in a hover popover.
 */
export function StudentPhoto({
  studentId,
  firstName = '',
  lastName = '',
  size = PHOTO_SIZE_SMALL,
  className,
  avatarOnly = false,
  nameFormat = 'lastFirst',
  children,
  lazy = false
}: StudentPhotoProps) {
  const [open, setOpen] = useState(false)
  const [position, setPosition] = useState({ top: 0, left: 0 })
  const [loaded, setLoaded] = useState(false)
  const [error, setError] = useState(false)
  const triggerRef = useRef<HTMLDivElement>(null)
  const leaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const { isFeatureEnabled } = useEntitlements()
  const photoEnabled = isFeatureEnabled('student_photos')
  const photoUrl = photoEnabled ? `/api/students/photo?studentId=${studentId}` : undefined

  useEffect(() => {
    setLoaded(false)
    setError(false)
  }, [studentId, photoEnabled])

  const displayName =
    lastName && firstName
      ? nameFormat === 'lastFirst'
        ? `${lastName}, ${firstName}`
        : `${firstName} ${lastName}`
      : ''
  const initials =
    [firstName, lastName]
      .filter(Boolean)
      .map((s) => s!.charAt(0))
      .join('')
      .toUpperCase()
      .slice(0, 2) || '?'

  const clearLeaveTimer = () => {
    if (leaveTimerRef.current) {
      clearTimeout(leaveTimerRef.current)
      leaveTimerRef.current = null
    }
  }

  const handleMouseEnter = () => {
    clearLeaveTimer()
    const rect = triggerRef.current?.getBoundingClientRect()
    if (rect) {
      setPosition({
        left: rect.left,
        top: rect.bottom + POPOVER_OFFSET
      })
    }
    setOpen(true)
  }

  const handleMouseLeave = () => {
    leaveTimerRef.current = setTimeout(() => setOpen(false), 150)
  }

  useEffect(() => {
    return () => clearLeaveTimer()
  }, [])

  const popoverContent = open && (
    <div
      className="fixed flex flex-col items-center rounded-lg border bg-background p-3 shadow-lg z-[9999]"
      style={{
        left: position.left,
        top: position.top,
        minWidth: PHOTO_SIZE_LARGE + 32
      }}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      <span
        className="inline-flex overflow-hidden rounded-full bg-muted"
        style={{ width: PHOTO_SIZE_LARGE, height: PHOTO_SIZE_LARGE }}
      >
        {photoUrl ? (
          <>
            <img
              src={photoUrl}
              alt=""
              width={PHOTO_SIZE_LARGE}
              height={PHOTO_SIZE_LARGE}
              className={cn('h-full w-full object-cover', error && 'hidden')}
              loading={lazy ? 'lazy' : 'eager'}
              decoding="async"
              onLoad={() => {
                setLoaded(true)
                setError(false)
              }}
              onError={() => setError(true)}
            />
            {error && (
              <span className="flex h-full w-full items-center justify-center text-2xl font-medium text-muted-foreground">
                {initials}
              </span>
            )}
          </>
        ) : (
          <span className="flex h-full w-full items-center justify-center text-2xl font-medium text-muted-foreground">
            {initials}
          </span>
        )}
      </span>
      {displayName && (
        <p className="mt-2 text-center text-sm font-medium text-foreground">{displayName}</p>
      )}
    </div>
  )

  return (
    <>
      <div
        ref={triggerRef}
        className={cn('relative inline-flex items-center gap-2', className)}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
      >
      <div className="flex items-center gap-2 shrink-0 cursor-default">
        <span
          className="inline-flex shrink-0 overflow-hidden rounded-full bg-muted align-middle"
          style={{ width: size, height: size }}
        >
          {photoUrl ? (
            <>
              <img
                src={photoUrl}
                alt=""
                width={size}
                height={size}
                className={cn('h-full w-full object-cover', (error || !loaded) && 'hidden')}
                loading={lazy ? 'lazy' : 'eager'}
                decoding="async"
                onLoad={() => {
                  setLoaded(true)
                  setError(false)
                }}
                onError={() => setError(true)}
              />
              {(!loaded || error) && (
                <span
                  className="inline-flex h-full w-full items-center justify-center text-xs font-medium text-muted-foreground"
                  style={{ fontSize: size * 0.4 }}
                >
                  {initials}
                </span>
              )}
            </>
          ) : (
            <span
              className="inline-flex h-full w-full items-center justify-center text-xs font-medium text-muted-foreground"
              style={{ fontSize: size * 0.4 }}
            >
              {initials}
            </span>
          )}
        </span>
        {!avatarOnly && (children ?? (displayName ? <span className="truncate">{displayName}</span> : null))}
      </div>
      </div>

      {typeof document !== 'undefined' && createPortal(popoverContent, document.body)}
    </>
  )
}
