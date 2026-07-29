import { redirect } from 'next/navigation'
import { isFeatureEnabled } from '@/lib/entitlements'

/**
 * Server layout for /notensammler. Redirects to home when the notensammler feature is not enabled.
 */
export default async function NotensammlerLayout({ children }: { children: React.ReactNode }) {
  const enabled = await isFeatureEnabled('notensammler')
  if (!enabled) {
    redirect('/')
  }
  return <>{children}</>
}
