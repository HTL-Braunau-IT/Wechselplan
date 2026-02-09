import { NextResponse } from 'next/server'
import path from 'path'
import fs from 'fs'

const PHOTO_DIR = path.join(process.cwd(), 'data', 'student-photos')
const ALLOWED_EXTENSIONS = ['.jpg', '.jpeg', '.png'] as const
const MIME_TYPES: Record<string, string> = {
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png'
}

/**
 * GET /api/students/photo?studentId=123
 * Streams the student's photo file if it exists (data/student-photos/<studentId>.<ext>).
 * Tries .jpg, .jpeg, .png. Returns 404 when studentId is missing/invalid or no file found.
 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const studentIdParam = searchParams.get('studentId')
  const studentId = studentIdParam ? parseInt(studentIdParam, 10) : NaN

  if (Number.isNaN(studentId) || studentId < 1) {
    return NextResponse.json({ error: 'Valid studentId is required' }, { status: 400 })
  }

  for (const ext of ALLOWED_EXTENSIONS) {
    const filePath = path.join(PHOTO_DIR, `${studentId}${ext}`)
    if (!path.resolve(filePath).startsWith(path.resolve(PHOTO_DIR))) {
      continue // path traversal guard
    }
    try {
      if (fs.existsSync(filePath)) {
        const stat = fs.statSync(filePath)
        const etag = `"${stat.mtimeMs}-${stat.size}"`
        const ifNoneMatch = request.headers.get('if-none-match')?.trim()
        if (ifNoneMatch === etag || ifNoneMatch === `W/${etag}`) {
          return new NextResponse(null, { status: 304, headers: { ETag: etag } })
        }
        const buffer = fs.readFileSync(filePath)
        const mime = MIME_TYPES[ext] ?? 'application/octet-stream'
        return new NextResponse(buffer, {
          status: 200,
          headers: {
            'Content-Type': mime,
            'Cache-Control': 'private, max-age=604800, stale-while-revalidate=86400',
            ETag: etag
          }
        })
      }
    } catch {
      // continue to next extension
    }
  }

  return NextResponse.json({ error: 'Photo not found' }, { status: 404 })
}
