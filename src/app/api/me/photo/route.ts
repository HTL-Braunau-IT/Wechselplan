import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { resolveMeProfilePhoto } from '@/lib/me-photo-resolve'
import { notFound, unauthorized } from '@/lib/api-response'

export async function GET(request: Request) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.name || !session.user.role) {
    return unauthorized('Nicht angemeldet')
  }

  const photo = await resolveMeProfilePhoto({
    name: session.user.name,
    id: session.user.id,
    role: session.user.role,
  })

  if (!photo) {
    return notFound('Foto nicht gefunden')
  }

  const ifNoneMatch = request.headers.get('if-none-match')?.trim()
  if (ifNoneMatch === photo.etag || ifNoneMatch === `W/${photo.etag}`) {
    return new NextResponse(null, { status: 304, headers: { ETag: photo.etag } })
  }

  return new NextResponse(new Uint8Array(photo.bytes), {
    status: 200,
    headers: {
      'Content-Type': photo.contentType,
      'Cache-Control': 'private, max-age=604800, stale-while-revalidate=86400',
      ETag: photo.etag,
      'X-Photo-Source': photo.source,
    },
  })
}
