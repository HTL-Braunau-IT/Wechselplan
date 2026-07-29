'use client'

import * as React from 'react'
import { cn } from '@/lib/utils'

const sizeMap = {
  sm: 'h-7 w-7 text-[0.65rem]',
  md: 'h-9 w-9 text-xs',
  lg: 'h-12 w-12 text-sm',
  xl: 'h-16 w-16 text-lg',
} as const

export interface AvatarProps extends React.HTMLAttributes<HTMLSpanElement> {
  /** Image source. When it fails to load or is omitted, the initials fallback is shown. */
  src?: string
  alt?: string
  /** Fallback initials (already computed by the caller). */
  fallback?: string
  size?: keyof typeof sizeMap
}

/**
 * Circular avatar with an image and a graceful initials fallback.
 *
 * Replaces the ad-hoc `<span class="rounded-full"><img/>…</span>` pattern that
 * was duplicated across the header, overviews and photo components.
 */
export function Avatar({
  src,
  alt = '',
  fallback = '?',
  size = 'md',
  className,
  ...props
}: AvatarProps) {
  const [loaded, setLoaded] = React.useState(false)
  const [error, setError] = React.useState(false)
  const showImage = Boolean(src) && !error

  return (
    <span
      className={cn(
        'bg-muted text-muted-foreground relative inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full font-medium select-none',
        sizeMap[size],
        className,
      )}
      {...props}
    >
      {showImage ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={src}
          alt={alt}
          className={cn('h-full w-full object-cover', !loaded && 'opacity-0')}
          onLoad={() => setLoaded(true)}
          onError={() => setError(true)}
        />
      ) : null}
      {(!showImage || !loaded) && (
        <span className="absolute inset-0 flex items-center justify-center">{fallback}</span>
      )}
    </span>
  )
}

/** Derives up-to-two uppercase initials from a name or first/last pair. */
export function initialsFrom(first?: string | null, last?: string | null, fallbackName?: string) {
  const fromParts = [first, last]
    .filter(Boolean)
    .map(s => s!.charAt(0))
    .join('')
    .toUpperCase()
  if (fromParts) return fromParts.slice(0, 2)
  const trimmed = fallbackName?.trim()
  if (trimmed) return trimmed.charAt(0).toUpperCase()
  return '?'
}
