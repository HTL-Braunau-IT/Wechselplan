'use client'

import { useEffect, useLayoutEffect, useRef, useState, type RefObject } from 'react'

export type UseInViewOnceOptions = {
  root?: Element | null
  rootMargin?: string
  threshold?: number | number[]
}

/**
 * Observes an element and sets visibility to true the first time it intersects the viewport.
 * Respects prefers-reduced-motion (skips reveal animation by showing immediately).
 */
export function useInViewOnce<T extends HTMLElement = HTMLDivElement>(
  options?: UseInViewOnceOptions
): [RefObject<T | null>, boolean] {
  const ref = useRef<T | null>(null)
  const [isVisible, setIsVisible] = useState(false)
  const { root, rootMargin = '0px 0px -8% 0px', threshold = 0.1 } = options ?? {}

  useLayoutEffect(() => {
    if (typeof window === 'undefined') return
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      setIsVisible(true)
    }
  }, [])

  useEffect(() => {
    if (typeof window === 'undefined') return
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return

    const el = ref.current
    if (!el) return

    const io = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            setIsVisible(true)
            io.disconnect()
            return
          }
        }
      },
      { root: root ?? null, rootMargin, threshold }
    )

    io.observe(el)
    return () => io.disconnect()
  }, [root, rootMargin, threshold])

  return [ref, isVisible]
}
