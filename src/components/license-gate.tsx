'use client'

import type { ReactNode } from 'react'
import { useSession } from 'next-auth/react'
import { useEntitlements } from '@/contexts/entitlements-context'

interface LicenseGateProps {
  children: ReactNode
}

/**
 * When authenticated and the license does not grant "base", blocks the app: only the "no valid license" message is shown.
 * No banner, no logout. Unauthenticated or still loading: show app. Has base: show app.
 */
export function LicenseGate({ children }: LicenseGateProps) {
  const { data: session, status } = useSession()
  const { isFeatureEnabled, isLoading } = useEntitlements()

  const isAuthenticated = status === 'authenticated' && session?.user
  const hasValidLicense = isFeatureEnabled('base')

  if (!isAuthenticated || isLoading) {
    return <>{children}</>
  }

  if (!hasValidLicense) {
    return (
      <div className="bg-background flex min-h-screen flex-col items-center justify-center px-4">
        <div
          role="alert"
          className="border-destructive/30 bg-destructive/10 max-w-md rounded-lg border p-8 text-center"
        >
          <h1 className="text-destructive text-xl font-semibold">
            Es ist keine gültige Lizenz vorhanden.
          </h1>
          <p className="text-muted-foreground mt-3">
            Bitte wenden Sie sich an Ihren Administrator.
          </p>
        </div>
      </div>
    )
  }

  return <>{children}</>
}
