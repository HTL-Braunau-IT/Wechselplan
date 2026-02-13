/**
 * Feature keys for entitlements. Shared between server (entitlements.ts) and client (context, UI).
 * This file must not import server-only env or lib/entitlements.ts.
 */
export type FeatureKey = 'base' | 'notensammler' | 'student_photos' | 'noten' | 'notenmgmt_htl'

export const ALL_FEATURE_KEYS: readonly FeatureKey[] = ['base', 'notensammler', 'student_photos', 'noten', 'notenmgmt_htl'] as const

export function isKnownFeatureKey(key: string): key is FeatureKey {
  return (ALL_FEATURE_KEYS as readonly string[]).includes(key)
}
