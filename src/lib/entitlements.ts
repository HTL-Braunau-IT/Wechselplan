/**
 * Server-only entitlements client. Fetches enabled features from the license server and caches them.
 * Do not import this module from client components; use GET /api/entitlements and EntitlementsContext instead.
 */
import { env } from '@/env'
import type { FeatureKey } from '@/types/entitlements'
import { ALL_FEATURE_KEYS, isKnownFeatureKey } from '@/types/entitlements'

const CACHE_TTL_MS = 60 * 60 * 1000 // 1 hour
const STALE_WINDOW_MS = 24 * 60 * 60 * 1000 // 24 hours – use previous cache on fetch failure within this window

interface CacheEntry {
  features: FeatureKey[]
  fetchedAt: number
}

let cache: CacheEntry | null = null

function isDisableFlagSet(): boolean {
  const v = env.DISABLE_ENTITLEMENTS
  if (v === undefined || v === '') return false
  const lower = v.toLowerCase()
  return lower === 'false' || lower === '0' || lower === 'no'
}

function hasLicenseConfig(): boolean {
  return Boolean(env.LICENSE_SERVER_URL && env.LICENSE_KEY)
}

function isNotenmanagementEnabled(): boolean {
  return (env.NOTENMANAGEMENT ?? '').toLowerCase() === 'true'
}

/**
 * Strips deployment-disabled feature keys from a license-derived feature list.
 * Currently masks `notenmgmt_htl` unless the NOTENMANAGEMENT env flag is "true",
 * so the Notenmanagement transfer integration can be turned off per deployment
 * regardless of what the license server returns.
 */
function applyDeploymentMask(features: FeatureKey[]): FeatureKey[] {
  if (isNotenmanagementEnabled()) return features
  return features.filter((f) => f !== 'notenmgmt_htl')
}

async function fetchFromServer(): Promise<FeatureKey[]> {
  const baseUrl = env.LICENSE_SERVER_URL?.replace(/\/$/, '')
  const key = env.LICENSE_KEY
  if (!baseUrl || !key) return []

  const url = `${baseUrl}/api/entitlements`
  const res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${key}`,
    },
    next: { revalidate: 0 },
  })

  if (res.status === 401) return []
  if (!res.ok) throw new Error(`Entitlements server returned ${res.status}`)

  const data = (await res.json()) as { features?: unknown }
  const raw = Array.isArray(data?.features) ? data.features : []
  const features = raw.filter((k): k is FeatureKey => typeof k === 'string' && isKnownFeatureKey(k))
  return features
}

/**
 * Returns the list of enabled feature keys for this instance.
 * - If DISABLE_ENTITLEMENTS indicates "disabled" (false/0/no): returns all feature keys (no server call).
 * - If LICENSE_SERVER_URL and LICENSE_KEY are set: fetches from server (with cache); on failure uses stale cache up to 24h, then empty.
 * - Otherwise: returns empty list (no premium features).
 */
export async function getEnabledFeatures(): Promise<FeatureKey[]> {
  if (isDisableFlagSet()) {
    return applyDeploymentMask([...ALL_FEATURE_KEYS])
  }

  if (!hasLicenseConfig()) {
    return applyDeploymentMask([])
  }

  const now = Date.now()

  if (cache) {
    const age = now - cache.fetchedAt
    if (age < CACHE_TTL_MS) return applyDeploymentMask(cache.features)
  }

  try {
    const features = await fetchFromServer()
    cache = { features, fetchedAt: now }
    return applyDeploymentMask(features)
  } catch {
    if (cache && now - cache.fetchedAt < STALE_WINDOW_MS) {
      return applyDeploymentMask(cache.features)
    }
    return applyDeploymentMask([])
  }
}

/**
 * Returns whether the given feature is enabled for this instance.
 */
export async function isFeatureEnabled(feature: FeatureKey): Promise<boolean> {
  const enabled = await getEnabledFeatures()
  return enabled.includes(feature)
}
