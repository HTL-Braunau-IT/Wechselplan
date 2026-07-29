/**
 * Prints a NextAuth session cookie for local use outside Playwright.
 *
 * Same mechanism the e2e harness uses (see `e2e/session.ts`); this is the hand
 * tool version, for poking the API with curl or for pasting a session into a
 * browser you are driving yourself.
 *
 * Run with:
 *   npx tsx scripts/mint-session.ts --username max.mustermann --role admin
 *   npx tsx scripts/mint-session.ts --curl        # ready-made header
 */
import { loadEnvFile } from '../e2e/load-env'
import { mintSessionToken, sessionCookieName, type SessionRole } from '../e2e/session'
import { normalizeUsername } from '../src/lib/username'

const ROLES: readonly SessionRole[] = ['admin', 'teacher', 'student', 'user']

function readFlag(name: string): string | undefined {
  const index = process.argv.indexOf(`--${name}`)
  if (index === -1) return undefined
  return process.argv[index + 1]
}

async function main() {
  loadEnvFile()

  const secret = process.env.NEXTAUTH_SECRET?.trim()
  if (!secret) {
    throw new Error('NEXTAUTH_SECRET is not set — copy .env.example to .env first.')
  }

  const baseUrl =
    readFlag('base-url') ?? process.env.NEXTAUTH_URL?.trim() ?? 'http://localhost:3000'
  const rawRole = readFlag('role') ?? 'admin'
  if (!ROLES.includes(rawRole as SessionRole)) {
    throw new Error(`--role must be one of ${ROLES.join(', ')} (got "${rawRole}")`)
  }

  // Normalized here as well as in the session callback, so what is printed is
  // exactly what `/api/teachers/by-username` will be queried with.
  const username = normalizeUsername(readFlag('username') ?? 'e2e.teacher')
  if (!username) {
    throw new Error('--username resolved to an empty string after normalization')
  }

  const token = await mintSessionToken(
    { username, role: rawRole as SessionRole },
    secret,
    Date.now(),
  )
  const cookie = `${sessionCookieName(baseUrl)}=${token}`

  if (process.argv.includes('--curl')) {
    console.log(`curl -H 'Cookie: ${cookie}' '${baseUrl}/api/auth/session'`)
    return
  }

  console.log(cookie)
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error)
  process.exit(1)
})
