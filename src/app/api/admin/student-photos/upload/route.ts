import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import path from 'path'
import fs from 'fs'
import { authOptions, hasRole } from '@/lib/auth'
import { isFeatureEnabled } from '@/lib/entitlements'
import { prisma } from '@/lib/prisma'
import { captureError } from '@/lib/sentry'

const PHOTO_DIR = path.join(process.cwd(), 'data', 'student-photos')
const ALLOWED_MIMES = ['image/jpeg', 'image/png', 'image/jpg'] as const
const EXT_BY_MIME: Record<string, string> = {
  'image/jpeg': '.jpg',
  'image/jpg': '.jpg',
  'image/png': '.png'
}

export type UploadResultItem = { filename: string; success: boolean; studentId?: number; error?: string }

/**
 * POST /api/admin/student-photos/upload
 * Admin or teacher. Accepts FormData with classId and multiple files.
 * Filenames must be LastName_FirstName.ext. Matches to students in that class and saves as data/student-photos/<studentId>.<ext> (overwrite).
 */
export async function POST(request: Request) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.name) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    const isAdmin = session.user?.role === 'admin' || (await hasRole(session.user.name, 'admin'))
    const isTeacher = session.user?.role === 'teacher' || (await hasRole(session.user.name, 'teacher'))
    if (!isAdmin && !isTeacher) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }
    if (!(await isFeatureEnabled('student_photos'))) {
      return NextResponse.json({ error: 'Feature not available' }, { status: 403 })
    }

    const formData = await request.formData()
    const singleStudentIdRaw = formData.get('studentId')
    const singleStudentIdParam =
      typeof singleStudentIdRaw === 'string' ? singleStudentIdRaw : null
    const singleStudentId =
      singleStudentIdParam != null ? parseInt(singleStudentIdParam, 10) : NaN
    const isSingleStudentUpload =
      !Number.isNaN(singleStudentId) && singleStudentId >= 1

    if (isSingleStudentUpload) {
      const student = await prisma.student.findUnique({
        where: { id: singleStudentId },
        select: { id: true }
      })
      if (!student) {
        return NextResponse.json({ error: 'Student not found', results: [] }, { status: 404 })
      }
      const files: File[] = formData.getAll('files') as File[]
      const file = files[0] ?? (() => {
        for (const [, value] of formData.entries()) {
          if (value instanceof File) return value
        }
        return null
      })()
      if (!file) {
        return NextResponse.json({ error: 'No file provided', results: [] }, { status: 400 })
      }
      const mime = file.type?.toLowerCase() || ''
      if (!ALLOWED_MIMES.includes(mime as (typeof ALLOWED_MIMES)[number])) {
        return NextResponse.json({
          results: [{ filename: file.name, success: false, error: 'Invalid file type (use JPEG or PNG)' }]
        }, { status: 400 })
      }
      const outExt = EXT_BY_MIME[mime] ?? '.jpg'
      const outPath = path.join(PHOTO_DIR, `${student.id}${outExt}`)
      if (!path.resolve(outPath).startsWith(path.resolve(PHOTO_DIR))) {
        return NextResponse.json({ error: 'Invalid path', results: [] }, { status: 400 })
      }
      try {
        fs.mkdirSync(PHOTO_DIR, { recursive: true })
        const buffer = Buffer.from(await file.arrayBuffer())
        fs.writeFileSync(outPath, buffer)
        return NextResponse.json({
          results: [{ filename: file.name, success: true, studentId: student.id }]
        })
      } catch (err) {
        captureError(err, {
          location: 'api/admin/student-photos/upload',
          type: 'write-photo',
          extra: { studentId: student.id, filename: file.name }
        })
        return NextResponse.json({
          results: [{ filename: file.name, success: false, error: 'Failed to save file' }]
        }, { status: 500 })
      }
    }

    const classIdRaw = formData.get('classId') ?? formData.get('className')
    const classIdParam = typeof classIdRaw === 'string' ? classIdRaw : null
    const allClasses = formData.get('mode') === 'all' || classIdParam == null || classIdParam.trim() === ''

    const normalize = (s: string) => s.trim().toLowerCase()
    let students: { id: number; firstName: string; lastName: string }[]
    let findStudent: (lastName: string, firstName: string) => { id: number; firstName: string; lastName: string } | undefined

    if (allClasses) {
      students = await prisma.student.findMany({
        select: { id: true, firstName: true, lastName: true }
      })
      findStudent = (lastName: string, firstName: string) => {
        const matches = students.filter(
          (s) =>
            normalize(s.lastName) === normalize(lastName) && normalize(s.firstName) === normalize(firstName)
        )
        return matches.length === 1 ? matches[0]! : undefined
      }
    } else {
      const classId = parseInt(classIdParam, 10)
      const isNumericClassId = !Number.isNaN(classId)
      students = isNumericClassId
        ? await prisma.student.findMany({
            where: { classId },
            select: { id: true, firstName: true, lastName: true }
          })
        : await prisma.class
            .findUnique({
              where: { name: classIdParam.trim() },
              select: { id: true }
            })
            .then((c) =>
              c
                ? prisma.student.findMany({
                    where: { classId: c.id },
                    select: { id: true, firstName: true, lastName: true }
                  })
                : []
            )
      if (students.length === 0) {
        return NextResponse.json(
          { error: 'No students found for this class', results: [] },
          { status: 400 }
        )
      }
      findStudent = (lastName: string, firstName: string) =>
        students.find(
          (s) =>
            normalize(s.lastName) === normalize(lastName) && normalize(s.firstName) === normalize(firstName)
        )
    }

    const results: UploadResultItem[] = []
    let files: File[] = formData.getAll('files') as File[]
    if (files.length === 0) {
      files = []
      for (const [, value] of formData.entries()) {
        if (value instanceof File) files.push(value)
      }
    }
    if (files.length === 0) {
      return NextResponse.json({ error: 'No files provided', results: [] }, { status: 400 })
    }

    async function processFile(file: File) {
      const rawName = file.name || 'unknown'
      const basenameOnly = path.basename(rawName.replace(/\\/g, '/'))
      const ext = path.extname(basenameOnly).toLowerCase()
      if (!['.jpg', '.jpeg', '.png'].includes(ext)) {
        results.push({ filename: rawName, success: false, error: 'Skip (not an image)' })
        return
      }
      const base = basenameOnly.slice(0, -ext.length)
      const parts = base.split('_')
      if (parts.length < 2) {
        results.push({ filename: rawName, success: false, error: 'Filename must be LastName_FirstName' })
        return
      }
      const lastName = parts[0]!.trim()
      const firstName = parts.slice(1).join('_').trim()
      const student = findStudent(lastName, firstName)
      if (!student) {
        results.push({
          filename: rawName,
          success: false,
          error: allClasses
            ? `No unique student match for ${lastName}_${firstName} (none or multiple in DB)`
            : `No student match for ${lastName}_${firstName} in this class`
        })
        return
      }
      const mime = file.type?.toLowerCase() || ''
      if (!ALLOWED_MIMES.includes(mime as (typeof ALLOWED_MIMES)[number])) {
        results.push({
          filename: rawName,
          success: false,
          error: 'Invalid file type (use JPEG or PNG)'
        })
        return
      }
      const outExt = EXT_BY_MIME[mime] ?? '.jpg'
      const outPath = path.join(PHOTO_DIR, `${student.id}${outExt}`)
      if (!path.resolve(outPath).startsWith(path.resolve(PHOTO_DIR))) {
        results.push({ filename: rawName, success: false, error: 'Invalid path' })
        return
      }
      try {
        fs.mkdirSync(PHOTO_DIR, { recursive: true })
        const buffer = Buffer.from(await file.arrayBuffer())
        fs.writeFileSync(outPath, buffer)
        results.push({ filename: rawName, success: true, studentId: student.id })
      } catch (err) {
        captureError(err, {
          location: 'api/admin/student-photos/upload',
          type: 'write-photo',
          extra: { studentId: student.id, filename: rawName }
        })
        results.push({ filename: rawName, success: false, error: 'Failed to save file' })
      }
    }

    for (const file of files) {
      await processFile(file)
    }
    return NextResponse.json({ results })
  } catch (error) {
    captureError(error, {
      location: 'api/admin/student-photos/upload',
      type: 'upload-photos',
      extra: {}
    })
    return NextResponse.json(
      { error: 'Failed to process upload', results: [] },
      { status: 500 }
    )
  }
}
