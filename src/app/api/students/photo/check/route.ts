import { NextResponse } from 'next/server'
import path from 'path'
import fs from 'fs'
import { isFeatureEnabled } from '@/lib/entitlements'
import { hasEffectiveStudentPhoto } from '@/lib/student-photo-source'
import { denyUnlessAccess } from '@/lib/api-guard'

const PHOTO_DIR = path.join(process.cwd(), 'data', 'student-photos')
const ALLOWED_EXTENSIONS = ['.jpg', '.jpeg', '.png'] as const

function hasPhotoForStudent(studentId: number): boolean {
  for (const ext of ALLOWED_EXTENSIONS) {
    const filePath = path.join(PHOTO_DIR, `${studentId}${ext}`)
    if (!path.resolve(filePath).startsWith(path.resolve(PHOTO_DIR))) return false
    try {
      if (fs.existsSync(filePath)) return true
    } catch {
      // continue
    }
  }
  return false
}

/**
 * GET /api/students/photo/check?ids=1,2,3
 * Returns { "1": true, "2": false } for each student id (true if photo exists).
 */
export async function GET(request: Request) {
  const denied = await denyUnlessAccess('session')
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
  const ids = idsParam
    .split(',')
    .map(s => parseInt(s.trim(), 10))
    .filter(n => !Number.isNaN(n) && n >= 1)
  const result: Record<string, boolean> = {}
  for (const id of ids) {
    result[String(id)] = useEffective ? await hasEffectiveStudentPhoto(id) : hasPhotoForStudent(id)
  }
  return NextResponse.json(result)
}
