/**
 * Normalizes a username for consistent comparison and storage.
 * - Trims whitespace
 * - Lowercases
 * - Strips domain prefix (DOMAIN\user → user) and suffix (user@domain → user)
 */
export function normalizeUsername(value: string): string {
  if (typeof value !== 'string') return ''
  let s = value.trim().toLowerCase()
  if (!s) return ''
  // Strip domain prefix: take part after last backslash
  if (s.includes('\\')) {
    s = s.split('\\').pop() ?? s
  }
  // Strip domain suffix: take part before @
  if (s.includes('@')) {
    s = s.split('@')[0] ?? s
  }
  return s.trim() || ''
}
