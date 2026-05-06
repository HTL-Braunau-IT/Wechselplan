'use client'

import { useState } from 'react'
import { cn } from '@/lib/utils'

interface TeacherPhotoProps {
  teacherId: number
  firstName?: string
  lastName?: string
  size?: number
  className?: string
}

export function TeacherPhoto({
  teacherId,
  firstName = '',
  lastName = '',
  size = 32,
  className,
}: TeacherPhotoProps) {
  const [loaded, setLoaded] = useState(false)
  const [error, setError] = useState(false)
  const photoUrl = `/api/teachers/photo?teacherId=${teacherId}`
  const initials =
    [firstName, lastName]
      .filter(Boolean)
      .map((s) => s.charAt(0))
      .join('')
      .toUpperCase()
      .slice(0, 2) || '?'

  return (
    <span
      className={cn('inline-flex shrink-0 overflow-hidden rounded-full bg-muted align-middle', className)}
      style={{ width: size, height: size }}
    >
      <img
        src={photoUrl}
        alt=""
        width={size}
        height={size}
        className={cn('h-full w-full object-cover', (error || !loaded) && 'hidden')}
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
    </span>
  )
}
