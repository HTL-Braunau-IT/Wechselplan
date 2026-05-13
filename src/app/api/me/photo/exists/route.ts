import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { ok, unauthorized } from '@/lib/api-response'
import { resolveMeProfilePhoto } from '@/lib/me-photo-resolve'

/**
 * Returns whether GET /api/me/photo would return image bytes (200).
 * Use this from the client to avoid requesting the image URL when there is no photo
 * (GET /api/me/photo otherwise responds with 404 JSON: NOT_FOUND / "Foto nicht gefunden").
 */
export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session?.user?.name || !session.user.role) {
    return unauthorized('Nicht angemeldet')
  }

  const photo = await resolveMeProfilePhoto({
    name: session.user.name,
    id: session.user.id,
    role: session.user.role,
  })

  return ok({ exists: photo !== null })
}
