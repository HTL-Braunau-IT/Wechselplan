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
      <div className="flex min-h-screen flex-col items-center justify-center bg-background px-4">
        <div
          role="alert"
          className="max-w-md rounded-lg border border-destructive/30 bg-destructive/10 p-8 text-center"
        >
          <h1 className="text-xl font-semibold text-destructive">
            Es ist keine gültige Lizenz vorhanden.
          </h1>
          <p className="mt-3 text-muted-foreground">
            Bitte wenden Sie sich an Ihren Administrator.
          </p>
        </div>
      </div>
    )
  }

  return <>{children}</>
}
