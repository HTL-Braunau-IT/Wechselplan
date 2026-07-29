/**
 * Produces the signed-in browser state every spec starts from.
 *
 * Runs before the dev server is launched and needs no browser of its own: the
 * session is a cookie, so it can be written straight to disk as Playwright
 * `storageState`.
 */
import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { loadEnvFile } from './load-env'
import { buildStorageState, type SessionRole } from './session'

const ROLES: readonly SessionRole[] = ['admin', 'teacher', 'student', 'user']

const STORAGE_STATE_PATH = path.join(process.cwd(), 'e2e/.auth/storageState.json')

function parseRole(value: string | undefined): SessionRole {
  if (!value) return 'admin'
  const role = value.trim().toLowerCase()
  if (!ROLES.includes(role as SessionRole)) {
    throw new Error(`E2E_ROLE must be one of ${ROLES.join(', ')} (got "${value}")`)
  }
  return role as SessionRole
}

/**
 * Picks the teacher to impersonate.
 *
 * Defaulting to a real row rather than an invented name matters: the app finds
 * "me" by looking `session.user.name` up in `Teacher.username`, so a made-up
 * username signs in fine and then shows empty class lists, which reads as a
 * broken feature rather than a broken fixture. Set `E2E_USERNAME` to pin a
 * specific teacher.
 */
async function resolveUsername(): Promise<string> {
  const explicit = process.env.E2E_USERNAME?.trim()
  if (explicit) return explicit

  // Imported lazily so the env is loaded before Prisma reads DATABASE_URL.
  const { prisma } = await import('../src/lib/prisma')
  try {
    // The client extension already restricts this to active teachers.
    const teacher = await prisma.teacher.findFirst({ orderBy: { username: 'asc' } })
    if (teacher) return teacher.username

    // Deliberately not "run db:seed": that seeds reference data (rooms,
    // subjects, holidays) and no people at all. Teachers arrive via Entra sync
    // or by hand in the admin UI.
    console.warn(
      '[e2e] No active teacher in the database — falling back to "e2e.teacher".\n' +
        '      Signing in still works, but teacher-scoped pages (Schedules,\n' +
        '      Notensammler, Noten) will render empty. Add a teacher under\n' +
        '      /admin/data, or set E2E_USERNAME to one that exists.',
    )
  } catch (error) {
    console.warn(
      `[e2e] Could not read a teacher from the database (${String(error)}).\n` +
        '      Falling back to "e2e.teacher".',
    )
  } finally {
    await prisma.$disconnect()
  }

  return 'e2e.teacher'
}

export default async function globalSetup(): Promise<void> {
  loadEnvFile()

  const secret = process.env.NEXTAUTH_SECRET?.trim()
  if (!secret) {
    throw new Error(
      'NEXTAUTH_SECRET is not set. The e2e session is a NextAuth JWT encrypted with it, ' +
        'and the dev server must verify it with the same value — copy .env.example to .env first.',
    )
  }

  const baseUrl = process.env.E2E_BASE_URL?.trim() ?? 'http://localhost:3000'
  const role = parseRole(process.env.E2E_ROLE)
  const username = await resolveUsername()

  // With real Entra credentials in `.env`, setting E2E_OBJECT_ID to your own
  // Entra object id makes the 15-minute role refresh resolve genuinely against
  // Graph instead of merely failing safe. Left unset, the refresh 404s on an
  // unknown id, `graphFetch` throws, and the jwt callback's catch keeps the
  // minted role — which is fine, just less faithful to production.
  const objectId = process.env.E2E_OBJECT_ID?.trim()

  const state = await buildStorageState(
    { username, role, objectId },
    { baseUrl, secret, now: Date.now() },
  )

  await mkdir(path.dirname(STORAGE_STATE_PATH), { recursive: true })
  await writeFile(STORAGE_STATE_PATH, JSON.stringify(state, null, 2))

  console.log(`[e2e] Signed in as "${username}" (role: ${role}) against ${baseUrl}`)
}
