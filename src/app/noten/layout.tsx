import { redirect } from 'next/navigation'
import { isFeatureEnabled } from '@/lib/entitlements'

/**
 * Server layout for /noten. Redirects to home when the noten feature is not enabled.
 */
export default async function NotenLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const enabled = await isFeatureEnabled('noten')
  if (!enabled) {
    redirect('/')
  }
  return <>{children}</>
}
