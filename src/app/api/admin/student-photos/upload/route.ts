import { NextResponse } from 'next/server'
import path from 'path'
import fs from 'fs'
import { isFeatureEnabled } from '@/lib/entitlements'
import { prisma } from '@/lib/prisma'
import { captureError } from '@/lib/sentry'
import { requireAccess } from '@/lib/api-guard'

const PHOTO_DIR = path.join(process.cwd(), 'data', 'student-photos')
const ALLOWED_MIMES = ['image/jpeg', 'image/png', 'image/jpg'] as const
const EXT_BY_MIME: Record<string, string> = {
  'image/jpeg': '.jpg',
  'image/jpg': '.jpg',
  'image/png': '.png',
}

// Bounds so a single request cannot exhaust the process heap: request.formData()
// buffers every part in memory and each file is then read whole via arrayBuffer.
const MAX_FILE_BYTES = 8 * 1024 * 1024 // 8 MB per image
const MAX_TOTAL_BYTES = 60 * 1024 * 1024 // 60 MB per request (Content-Length gate)
const MAX_FILES = 200

/** True if the buffer begins with real JPEG or PNG magic bytes. */
function hasImageMagicBytes(buffer: Buffer): boolean {
  // JPEG: FF D8 FF · PNG: 89 50 4E 47 0D 0A 1A 0A
  if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return true
  }
  if (
    buffer.length >= 8 &&
    buffer[0] === 0x89 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x4e &&
    buffer[3] === 0x47
  ) {
    return true
  }
  return false
}

export type UploadResultItem = {
  filename: string
  success: boolean
  studentId?: number
  studentIds?: number[]
  error?: string
}

/**
 * POST /api/admin/student-photos/upload
 * Admin or teacher. Accepts FormData with classId and multiple files.
 * Filenames must be LastName_FirstName.ext. Matches to students in that class and saves as data/student-photos/<studentId>.<ext> (overwrite).
 */
export async function POST(request: Request) {
  const gate = await requireAccess('staff')
  if (!gate.ok) return gate.response

  try {
    const session = gate.session
    if (!session?.user?.name) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    if (!(await isFeatureEnabled('student_photos'))) {
      return NextResponse.json({ error: 'Feature not available' }, { status: 403 })
    }

    // Reject an oversized body before formData() buffers the whole thing.
    const contentLength = Number(request.headers.get('content-length') ?? '0')
    if (Number.isFinite(contentLength) && contentLength > MAX_TOTAL_BYTES) {
      return NextResponse.json({ error: 'Upload too large', results: [] }, { status: 413 })
    }

    const formData = await request.formData()
    const singleStudentIdRaw = formData.get('studentId')
    const singleStudentIdParam = typeof singleStudentIdRaw === 'string' ? singleStudentIdRaw : null
    const singleStudentId = singleStudentIdParam != null ? parseInt(singleStudentIdParam, 10) : NaN
    const isSingleStudentUpload = !Number.isNaN(singleStudentId) && singleStudentId >= 1

    if (isSingleStudentUpload) {
      const student = await prisma.student.findUnique({
        where: { id: singleStudentId },
        select: { id: true },
      })
      if (!student) {
        return NextResponse.json({ error: 'Student not found', results: [] }, { status: 404 })
      }
      const files: File[] = formData.getAll('files') as File[]
      const file =
        files[0] ??
        (() => {
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
        return NextResponse.json(
          {
            results: [
              { filename: file.name, success: false, error: 'Invalid file type (use JPEG or PNG)' },
            ],
          },
          { status: 400 },
        )
      }
      if (file.size > MAX_FILE_BYTES) {
        return NextResponse.json(
          {
            results: [{ filename: file.name, success: false, error: 'File too large' }],
          },
          { status: 413 },
        )
      }
      const outExt = EXT_BY_MIME[mime] ?? '.jpg'
      const outPath = path.join(PHOTO_DIR, `${student.id}${outExt}`)
      if (!path.resolve(outPath).startsWith(path.resolve(PHOTO_DIR))) {
        return NextResponse.json({ error: 'Invalid path', results: [] }, { status: 400 })
      }
      try {
        fs.mkdirSync(PHOTO_DIR, { recursive: true })
        const buffer = Buffer.from(await file.arrayBuffer())
        // MIME is client-controlled; verify the bytes really are an image.
        if (!hasImageMagicBytes(buffer)) {
          return NextResponse.json(
            {
              results: [{ filename: file.name, success: false, error: 'Not a valid image file' }],
            },
            { status: 400 },
          )
        }
        fs.writeFileSync(outPath, buffer)
        return NextResponse.json({
          results: [{ filename: file.name, success: true, studentId: student.id }],
        })
      } catch (err) {
        captureError(err, {
          location: 'api/admin/student-photos/upload',
          type: 'write-photo',
          extra: { studentId: student.id, filename: file.name },
        })
        return NextResponse.json(
          {
            results: [{ filename: file.name, success: false, error: 'Failed to save file' }],
          },
          { status: 500 },
        )
      }
    }

    const classIdRaw = formData.get('classId') ?? formData.get('className')
    const classIdParam = typeof classIdRaw === 'string' ? classIdRaw : null
    const allClasses =
      formData.get('mode') === 'all' || classIdParam == null || classIdParam.trim() === ''

    const normalize = (s: string) => s.trim().toLowerCase()
    type StudentMatch = { id: number; firstName: string; lastName: string }
    let students: StudentMatch[]
    let findStudents: (lastName: string, firstName: string) => StudentMatch[]

    if (allClasses) {
      students = await prisma.student.findMany({
        select: { id: true, firstName: true, lastName: true },
      })
      findStudents = (lastName: string, firstName: string) =>
        students.filter(
          s =>
            normalize(s.lastName) === normalize(lastName) &&
            normalize(s.firstName) === normalize(firstName),
        )
    } else {
      const classId = parseInt(classIdParam, 10)
      const isNumericClassId = !Number.isNaN(classId)
      students = isNumericClassId
        ? await prisma.student.findMany({
            where: { classId },
            select: { id: true, firstName: true, lastName: true },
          })
        : await prisma.class
            .findUnique({
              where: { name: classIdParam.trim() },
              select: { id: true },
            })
            .then(c =>
              c
                ? prisma.student.findMany({
                    where: { classId: c.id },
                    select: { id: true, firstName: true, lastName: true },
                  })
                : [],
            )
      if (students.length === 0) {
        return NextResponse.json(
          { error: 'No students found for this class', results: [] },
          { status: 400 },
        )
      }
      findStudents = (lastName: string, firstName: string) =>
        students.filter(
          s =>
            normalize(s.lastName) === normalize(lastName) &&
            normalize(s.firstName) === normalize(firstName),
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
    if (files.length > MAX_FILES) {
      return NextResponse.json(
        { error: `Too many files (max ${MAX_FILES})`, results: [] },
        { status: 413 },
      )
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
        results.push({
          filename: rawName,
          success: false,
          error: 'Filename must be LastName_FirstName',
        })
        return
      }
      const lastName = parts[0]!.trim()
      const firstName = parts.slice(1).join('_').trim()
      const matchedStudents = findStudents(lastName, firstName)
      if (matchedStudents.length === 0) {
        results.push({
          filename: rawName,
          success: false,
          error: allClasses
            ? `No student match for ${lastName}_${firstName}`
            : `No student match for ${lastName}_${firstName} in this class`,
        })
        return
      }
      const mime = file.type?.toLowerCase() || ''
      if (!ALLOWED_MIMES.includes(mime as (typeof ALLOWED_MIMES)[number])) {
        results.push({
          filename: rawName,
          success: false,
          error: 'Invalid file type (use JPEG or PNG)',
        })
        return
      }
      if (file.size > MAX_FILE_BYTES) {
        results.push({ filename: rawName, success: false, error: 'File too large' })
        return
      }
      const outExt = EXT_BY_MIME[mime] ?? '.jpg'
      const uniqueStudents = Array.from(new Map(matchedStudents.map(s => [s.id, s])).values())
      for (const s of uniqueStudents) {
        const outPath = path.join(PHOTO_DIR, `${s.id}${outExt}`)
        if (!path.resolve(outPath).startsWith(path.resolve(PHOTO_DIR))) {
          results.push({ filename: rawName, success: false, error: 'Invalid path' })
          return
        }
      }
      try {
        fs.mkdirSync(PHOTO_DIR, { recursive: true })
        const buffer = Buffer.from(await file.arrayBuffer())
        // MIME is client-controlled; verify the bytes really are an image.
        if (!hasImageMagicBytes(buffer)) {
          results.push({ filename: rawName, success: false, error: 'Not a valid image file' })
          return
        }
        for (const s of uniqueStudents) {
          const outPath = path.join(PHOTO_DIR, `${s.id}${outExt}`)
          fs.writeFileSync(outPath, buffer)
        }
        const studentIds = uniqueStudents.map(s => s.id)
        results.push({
          filename: rawName,
          success: true,
          studentId: studentIds[0],
          studentIds,
        })
      } catch (err) {
        captureError(err, {
          location: 'api/admin/student-photos/upload',
          type: 'write-photo',
          extra: { studentIds: uniqueStudents.map(s => s.id), filename: rawName },
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
      extra: {},
    })
    return NextResponse.json({ error: 'Failed to process upload', results: [] }, { status: 500 })
  }
}
