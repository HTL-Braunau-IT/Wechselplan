'use client'

import type { ReactNode } from 'react'
import { useSession } from 'next-auth/react'
import { ShieldAlert } from 'lucide-react'
import { useEntitlements } from '@/contexts/entitlements-context'
import { Alert, AlertTitle, AlertDescription } from '@/components/ui/alert'

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
        <Alert variant="destructive" className="max-w-md">
          <ShieldAlert className="h-4 w-4" />
          <AlertTitle>Es ist keine gültige Lizenz vorhanden.</AlertTitle>
          <AlertDescription>Bitte wenden Sie sich an Ihren Administrator.</AlertDescription>
        </Alert>
      </div>
    )
  }

  return <>{children}</>
}
