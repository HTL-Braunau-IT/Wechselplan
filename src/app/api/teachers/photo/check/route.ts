import { NextResponse } from 'next/server'
import path from 'path'
import fs from 'fs'
import { hasEffectiveTeacherPhoto } from '@/lib/teacher-photo-source'

const PHOTO_DIR = path.join(process.cwd(), 'data', 'teacher-photos')
const ALLOWED_EXTENSIONS = ['.jpg', '.jpeg', '.png'] as const

function hasPhotoForTeacher(teacherId: number): boolean {
  for (const ext of ALLOWED_EXTENSIONS) {
    const filePath = path.join(PHOTO_DIR, `${teacherId}${ext}`)
    if (!path.resolve(filePath).startsWith(path.resolve(PHOTO_DIR))) return false
    try {
      if (fs.existsSync(filePath)) return true
    } catch {
      // continue
    }
  }
  return false
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const idsParam = searchParams.get('ids')
  const useEffective = searchParams.get('effective') === 'true'
  if (!idsParam || idsParam.trim() === '') {
    return NextResponse.json({ error: 'ids query parameter required (e.g. ids=1,2,3)' }, { status: 400 })
  }
  const ids = idsParam
    .split(',')
    .map((s) => parseInt(s.trim(), 10))
    .filter((n) => !Number.isNaN(n) && n >= 1)

  const result: Record<string, boolean> = {}
  for (const id of ids) {
    result[String(id)] = useEffective ? await hasEffectiveTeacherPhoto(id) : hasPhotoForTeacher(id)
  }
  return NextResponse.json(result)
}
