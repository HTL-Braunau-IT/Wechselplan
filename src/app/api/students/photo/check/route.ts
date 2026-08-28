import { NextResponse } from 'next/server'
import path from 'path'
import { promises as fsp } from 'fs'
import { isFeatureEnabled } from '@/lib/entitlements'
import { hasEffectiveStudentPhoto } from '@/lib/student-photo-source'
import { denyUnlessAccess } from '@/lib/api-guard'

const PHOTO_DIR = path.join(process.cwd(), 'data', 'student-photos')
const ALLOWED_EXTENSIONS = ['.jpg', '.jpeg', '.png'] as const

// Cap the batch so a single request cannot fan out into an unbounded number of
// filesystem / DB lookups and block the event loop (a comma-separated `ids`
// param otherwise fits thousands of entries in one URL).
const MAX_IDS = 500

async function hasPhotoForStudent(studentId: number): Promise<boolean> {
  for (const ext of ALLOWED_EXTENSIONS) {
    const filePath = path.join(PHOTO_DIR, `${studentId}${ext}`)
    if (!path.resolve(filePath).startsWith(path.resolve(PHOTO_DIR))) continue
    try {
      await fsp.access(filePath)
      return true
    } catch {
      // file absent or unreadable — try next extension
    }
  }
  return false
}

/**
 * GET /api/students/photo/check?ids=1,2,3
 * Returns { "1": true, "2": false } for each student id (true if photo exists).
 */
export async function GET(request: Request) {
  const denied = await denyUnlessAccess('staff')
  if (denied) return denied

  if (!(await isFeatureEnabled('student_photos'))) {
    return NextResponse.json({ error: 'Feature not available' }, { status: 403 })
  }

  const { searchParams } = new URL(request.url)
  const idsParam = searchParams.get('ids')
  const useEffective = searchParams.get('effective') === 'true'
  if (!idsParam || idsParam.trim() === '') {
    return NextResponse.json(
      { error: 'ids query parameter required (e.g. ids=1,2,3)' },
      { status: 400 },
    )
  }
  const ids = [
    ...new Set(
      idsParam
        .split(',')
        .map(s => parseInt(s.trim(), 10))
        .filter(n => !Number.isNaN(n) && n >= 1),
    ),
  ]
  if (ids.length > MAX_IDS) {
    return NextResponse.json(
      { error: `Too many ids (max ${MAX_IDS})` },
      { status: 400 },
    )
  }
  const result: Record<string, boolean> = {}
  for (const id of ids) {
    result[String(id)] = useEffective
      ? await hasEffectiveStudentPhoto(id)
      : await hasPhotoForStudent(id)
  }
  return NextResponse.json(result)
}
