'use client'

import { createContext, useContext, useState, useEffect, useRef } from 'react'
import type { ReactNode } from 'react'
import { useSession } from 'next-auth/react'
import type { FeatureKey } from '@/types/entitlements'
import { isKnownFeatureKey } from '@/types/entitlements'

interface EntitlementsContextType {
  /** List of enabled feature keys (empty until fetched or when unauthenticated) */
  enabledFeatures: FeatureKey[]
  /** Whether the entitlements list has been loaded (after auth) */
  isLoading: boolean
  /** Returns true if the given feature is in the enabled list */
  isFeatureEnabled: (feature: FeatureKey) => boolean
}

const EntitlementsContext = createContext<EntitlementsContextType | undefined>(undefined)

export function EntitlementsProvider({ children }: { children: ReactNode }) {
  const { data: session, status } = useSession()
  const [enabledFeatures, setEnabledFeatures] = useState<FeatureKey[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const fetchedRef = useRef(false)

  useEffect(() => {
    if (status !== 'authenticated' || !session?.user) {
      setEnabledFeatures([])
      setIsLoading(false)
      fetchedRef.current = false
      return
    }

    if (fetchedRef.current) return
    fetchedRef.current = true
    setIsLoading(true)

    fetch('/api/entitlements')
      .then((res) => (res.ok ? res.json() : { data: { features: [] } }))
      .then((payload: { data?: { features?: string[] }; features?: string[] }) => {
        const raw = Array.isArray(payload?.data?.features)
          ? payload.data.features
          : (Array.isArray(payload?.features) ? payload.features : [])
        const valid: FeatureKey[] = raw.filter(
          (k): k is FeatureKey => typeof k === 'string' && isKnownFeatureKey(k)
        )
        setEnabledFeatures(valid)
      })
      .catch(() => setEnabledFeatures([]))
      .finally(() => setIsLoading(false))
  }, [status, session?.user])

  const isFeatureEnabled = (feature: FeatureKey) => enabledFeatures.includes(feature)

  const value: EntitlementsContextType = {
    enabledFeatures,
    isLoading,
    isFeatureEnabled,
  }

  return (
    <EntitlementsContext.Provider value={value}>
      {children}
    </EntitlementsContext.Provider>
  )
}

export function useEntitlements(): EntitlementsContextType {
  const ctx = useContext(EntitlementsContext)
  if (ctx === undefined) {
    throw new Error('useEntitlements must be used within EntitlementsProvider')
  }
  return ctx
}
